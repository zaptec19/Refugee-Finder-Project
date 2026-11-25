// Side details: one split panel for the whole site. The source trace, the "?" explainer, the big map, glossary
// terms and reference lists open beside the page, not over it: the top bar stays full width, the page shrinks to
// the left (still fully usable) and the panel docks on the right, full height under the top bar, scrolling on its
// own. Under 860 px there is no room for two columns, so the same panel is a bottom sheet (swipe down to close).
//
//   openSide({ kind, title, announce, key, origin: { el, flyFrom, focusEl, hl }, render(body) -> { flyTo }, onClose })
//   pushSide(entry)     the panel's own links (an input of a share, ...): new content, same highlight
//   closeSide()         X, Esc, or a second click on the highlighted element
//
// Open: the panel slides in (280 ms) while the page narrows in step, and the clicked number flies into the panel.
// The reader's place is kept: the clicked element (or what was at the top of the screen) stays at the same height
// while the page re-flows. The clicked element keeps an accent outline while its panel is open. Clicking another
// number while the panel is open swaps the content (a quick cross-fade); a back arrow returns to the previous item
// (up to 10). The divider between page and panel can be dragged (or moved with ←/→ when focused); the width is
// kept in localStorage (wv1:split-w); a double-click resets it. Reduced motion: no slide, no fly, instant widths.
// The panel is a non-modal <aside role="complementary">: no backdrop, no focus trap; F6 moves between page and panel.
import { reducedMotion } from "./motion.js";
import { store } from "./store.js";
import { icon } from "./icons.js";

export { reducedMotion };
export const phoneWidth = () => document.documentElement.clientWidth < 600;
export const SPLIT_MIN = 860;
export const sheetMode = () => document.documentElement.clientWidth < SPLIT_MIN;

const OPEN_MS = 280;
const CLOSE_MS = 240;
const SWAP_OUT_MS = 90;
const SWAP_IN_MS = 160;
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 0.8, 0.4)";
const MAX_HISTORY = 10;
const html = document.documentElement;

let el = null;
let titleEl;
let backBtn;
let bodyEl;
let divider;
let scrim;
let live;
let hist = [];
let isOpen = false;
let mode = null;                    // "split" | "sheet"
let queue = Promise.resolve();
let lastPageFocus = null;
let unmark = null;

const top = () => hist[hist.length - 1];
const vw = () => html.clientWidth;

// ------------------------------------------------------------------ widths
/** The panel's width limits at this window width (the page keeps at least 640 px from 1280 px up, else 440 + gutters). */
export function limits() {
  const w = vw();
  if (w >= 1280) {
    const max = Math.min(640, w - 640);
    return { min: Math.min(420, max), max, def: Math.max(Math.min(420, max), Math.min(Math.round(w * 0.4), max)) };
  }
  const max = Math.max(300, Math.min(560, w - 488));
  const min = Math.min(340, max);
  return { min, max, def: Math.max(min, Math.min(420, max)) };
}
const clampW = (w) => { const L = limits(); return Math.round(Math.max(L.min, Math.min(L.max, w))); };
const wanted = () => clampW(Number(store.get("split-w", 0)) || limits().def);

function setWidth(w) {
  const L = limits();
  html.style.setProperty("--sp-w", `${w}px`);
  divider?.setAttribute("aria-valuenow", String(w));
  divider?.setAttribute("aria-valuemin", String(L.min));
  divider?.setAttribute("aria-valuemax", String(L.max));
  divider?.setAttribute("aria-valuetext", `${w} pixels wide`);
  // the situation layout follows the page column's width, not the window's
  const page = vw() - w;
  html.classList.toggle("sp-narrow", vw() < 1280 || page < 760);
  html.classList.toggle("sp-mid", !(vw() < 1280 || page < 760) && page < 1120);
}
function clearLayout() {
  html.classList.remove("sp-on", "sp-sheet", "sp-narrow", "sp-mid");
  html.style.removeProperty("--sp-w");
}

// ------------------------------------------------------------------ keeping the reader's place
/** What to hold still while the page re-flows: the clicked element, or whatever is at the top of the screen. */
function anchorFor(origin) {
  const topbar = parseFloat(getComputedStyle(html).getPropertyValue("--topbar-h")) || 64;
  const inView = (r) => r && r.bottom > 0 && r.top < innerHeight && (r.width || r.height);
  const cand = origin?.el?.isConnected ? origin.el : origin?.hl?.host?.isConnected ? origin.hl.host : null;
  if (cand && inView(cand.getBoundingClientRect())) return { el: cand, top: cand.getBoundingClientRect().top };
  const main = document.getElementById("main");
  if (!main) return null;
  const x = Math.min(240, (main.getBoundingClientRect().right || vw()) / 3);
  let at = document.elementFromPoint(x, topbar + 24);
  while (at && at !== main && at.getBoundingClientRect().height > innerHeight) at = null;
  if (!at || !main.contains(at)) at = [...main.querySelectorAll("h1, h2, h3, p, figure, section, article")].find((n) => n.getBoundingClientRect().bottom > topbar);
  void inView;
  return at ? { el: at, top: at.getBoundingClientRect().top } : null;
}
function holdPlace(anchor) {
  if (!anchor?.el?.isConnected) return;
  const d = anchor.el.getBoundingClientRect().top - anchor.top;
  if (Math.abs(d) > 0.5) window.scrollBy({ top: d, behavior: "instant" });        // the page scrolls smoothly otherwise
}
function holdDuring(anchor, ms) {
  if (!anchor) return Promise.resolve();
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = () => {
      holdPlace(anchor);
      if (performance.now() - t0 < ms) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}
const settled = () => document.dispatchEvent(new CustomEvent("sp-settled"));

// ------------------------------------------------------------------ the highlight on the page
function mark(origin) {
  unmark?.();
  unmark = null;
  const h = origin?.hl || origin?.el;
  if (h instanceof Element) {
    h.classList.add("sp-hl");
    unmark = () => h.classList.remove("sp-hl");
    return;
  }
  if (h?.host instanceof Element && typeof h.at === "function") {
    // a point inside a chart: a ring placed from the chart's own scales, kept in place when the chart redraws
    const ring = document.createElement("span");
    ring.className = "sp-hl-ring";
    ring.setAttribute("aria-hidden", "true");
    const place = () => {
      const p = h.at();
      if (!p) { ring.hidden = true; return; }
      if (!ring.isConnected) h.host.append(ring);
      ring.hidden = false;
      ring.style.left = `${p.x}px`;
      ring.style.top = `${p.y}px`;
    };
    if (getComputedStyle(h.host).position === "static") h.host.style.position = "relative";
    h.host.append(ring);
    place();
    const mo = new MutationObserver(() => requestAnimationFrame(place));
    mo.observe(h.host, { childList: true });
    document.addEventListener("sp-settled", place);
    unmark = () => { mo.disconnect(); document.removeEventListener("sp-settled", place); ring.remove(); };
  }
}

// ------------------------------------------------------------------ the number that flies
function flyNumber(from, to) {
  const src = from?.nodeType ? { rect: from.getBoundingClientRect(), style: getComputedStyle(from) } : from;
  if (!src?.rect || !to) return null;
  const r = src.rect;
  if (!(r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < vw() && (r.width || r.height))) return null;
  const b = to.getBoundingClientRect();
  const ds = getComputedStyle(to);
  const c = document.createElement("span");
  c.className = "pop-fly";
  c.setAttribute("aria-hidden", "true");
  c.textContent = to.textContent.trim() || src.text || "";
  Object.assign(c.style, {
    left: `${b.left}px`, top: `${b.top}px`, fontFamily: ds.fontFamily, fontSize: ds.fontSize, fontWeight: ds.fontWeight,
    letterSpacing: ds.letterSpacing, fontVariantNumeric: ds.fontVariantNumeric, color: ds.color, lineHeight: ds.lineHeight,
  });
  document.body.append(c);
  const k = Math.max(0.1, parseFloat(src.style?.fontSize || src.fontSize || 14) / parseFloat(ds.fontSize || 34));
  const dy = r.top + r.height / 2 - (b.top + (b.height * k) / 2);
  to.style.opacity = "0";
  const a = c.animate([
    { transform: `translate(${r.left - b.left}px, ${dy}px) scale(${k})`, color: src.style?.color || ds.color, opacity: from?.nodeType ? 1 : 0 },
    { opacity: 1, offset: 0.25 },
    { transform: "none", color: ds.color, opacity: 1 },
  ], { duration: OPEN_MS + 80, easing: EASE_OUT, fill: "backwards" });
  c.style.transformOrigin = "0 0";
  const done = () => { to.style.opacity = ""; c.remove(); };
  a.finished.then(done, done);
  return a;
}

/** A soft highlight that tells the eye where it was. */
export function pulse(origin) {
  const e = origin?.el;
  if (!e?.isConnected) return;
  e.classList.remove("pop-pulse");
  void e.offsetWidth;
  e.classList.add("pop-pulse");
  setTimeout(() => e.classList.remove("pop-pulse"), 700);
}

// ------------------------------------------------------------------ building the panel
function build() {
  if (el) return;
  el = document.createElement("aside");
  el.className = "sp";
  el.id = "side-panel";
  el.setAttribute("role", "complementary");
  el.hidden = true;
  el.innerHTML = `
    <div class="sp__divider" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="side-panel"
      aria-label="Resize the side panel (left and right arrow keys; double-click to reset)"><span class="sp__grip" aria-hidden="true"></span></div>
    <div class="sp__handle" data-drag aria-hidden="true"></div>
    <header class="sp__head" data-drag>
      <button class="icon-btn sp__back" type="button" data-sp-back aria-label="Back to the previous item" hidden>${icon("back", { size: 18 })}</button>
      <h2 class="sp__title" id="sp-title" tabindex="-1"></h2>
      <button class="icon-btn sp__close" type="button" data-sp-close aria-label="Close the side panel">${icon("close", { size: 18 })}</button>
    </header>
    <div class="sp__body"></div>`;
  titleEl = el.querySelector(".sp__title");
  backBtn = el.querySelector("[data-sp-back]");
  bodyEl = el.querySelector(".sp__body");
  divider = el.querySelector(".sp__divider");
  scrim = document.createElement("div");
  scrim.className = "sp-scrim";
  scrim.hidden = true;
  live = document.createElement("div");
  live.className = "sr-only sp-live";
  live.setAttribute("aria-live", "polite");
  document.body.append(el, scrim, live);

  el.querySelector("[data-sp-close]").addEventListener("click", () => closeSide());
  backBtn.addEventListener("click", () => sideBack());
  scrim.addEventListener("click", () => closeSide());
  document.addEventListener("focusin", (e) => { if (!el.contains(e.target)) lastPageFocus = e.target; });
  document.addEventListener("keydown", onKey);
  wireDivider();
  wireSwipe();
  let raf = 0;
  addEventListener("resize", () => {
    if (!isOpen) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const m = sheetMode() ? "sheet" : "split";
      if (m !== mode) applyMode(m);
      else if (m === "split") setWidth(wanted());
      settled();
    });
  });
}

function applyMode(m) {
  mode = m;
  el.classList.toggle("sp--sheet", m === "sheet");
  clearLayout();
  if (m === "split") {
    html.classList.add("sp-on");
    setWidth(wanted());
    scrim.hidden = true;
    html.classList.remove("pop-locked");
  } else {
    html.classList.add("sp-sheet", "pop-locked");
    scrim.hidden = false;
  }
}

function onKey(e) {
  if (!isOpen) return;
  if (e.key === "F6") {
    e.preventDefault();
    if (el.contains(document.activeElement)) {
      const back = (lastPageFocus?.isConnected && lastPageFocus) || top()?.origin?.focusEl || top()?.origin?.el || document.getElementById("main");
      back?.focus?.({ preventScroll: false });
    } else {
      titleEl.focus({ preventScroll: true });
    }
    return;
  }
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (document.querySelector("dialog[open]") || document.querySelector(":popover-open:not(.toast-region)") || document.querySelector(".tour-card")) return;
  const a = document.activeElement;
  if (a && !el.contains(a) && a.closest?.(".ask, .results")) return;          // the search box closes its own results
  e.preventDefault();
  closeSide();
}

function fill(entry) {
  titleEl.textContent = entry.title;
  el.setAttribute("aria-label", entry.title);
  backBtn.hidden = hist.length < 2;
  bodyEl.scrollTop = 0;
  bodyEl.replaceChildren();
  bodyEl.dataset.kind = entry.kind || "";
  return entry.render(bodyEl, entry) || {};
}

function announce(text) {
  if (!text) return;
  live.textContent = "";
  setTimeout(() => { live.textContent = text; }, 60);
}

// ------------------------------------------------------------------ open, swap, back, close
function sameOrigin(a, b) {
  const x = a?.origin || {};
  const y = b?.origin || {};
  if (y.el && x.el) return y.el === x.el;
  if (!y.el && y.hl?.host && y.hl.host === x.hl?.host) return !!b.key && b.key === a.key;
  return false;
}

const serial = (fn) => { queue = queue.then(fn, fn); return queue; };

/** Open a side detail. If the panel is open, its content is replaced (or, for the highlighted element, it closes). */
export function openSide(entry) {
  build();
  return serial(async () => {
    if (isOpen) {
      if (sameOrigin(top(), entry)) return doClose();
      hist.push(entry);
      if (hist.length > MAX_HISTORY) hist.shift();
      return swap(entry, { fly: true });
    }
    hist = [entry];
    return doOpen(entry);
  });
}

/** New content from inside the panel (keeps the highlight on the element that opened the panel). */
export function pushSide(entry) {
  build();
  return serial(async () => {
    if (!isOpen) { hist = [entry]; return doOpen(entry); }
    const cur = top();
    hist.push({ ...entry, origin: entry.origin || cur.origin });
    if (hist.length > MAX_HISTORY) hist.shift();
    return swap(top(), { fly: false });
  });
}

export function sideBack() {
  return serial(async () => {
    if (!isOpen || hist.length < 2) return;
    hist.pop();
    return swap(top(), { fly: false });
  });
}

export function closeSide({ instant = false } = {}) {
  if (!el) return Promise.resolve();
  return serial(() => doClose({ instant }));
}
export const closeCurrentPopout = closeSide;
export const sideOpen = () => isOpen;
export const sideBody = () => bodyEl;
export const sideKind = () => (isOpen ? top()?.kind : null);

async function doOpen(entry) {
  document.querySelectorAll(":popover-open:not(.toast-region)").forEach((p) => { try { p.hidePopover(); } catch { /* ignore */ } });
  const reduced = reducedMotion();
  const anchor = anchorFor(entry.origin);
  if (anchor) anchor.top = anchor.el.getBoundingClientRect().top;
  el.hidden = false;
  isOpen = true;
  if (!reduced) html.classList.add("sp-moving", "sp-anim");
  applyMode(sheetMode() ? "sheet" : "split");
  el.setAttribute("data-open", "");
  const res = fill(entry);
  mark(entry.origin);
  titleEl.focus({ preventScroll: true });
  announce(entry.announce || `${entry.title} opened beside the page`);
  if (reduced) {
    holdPlace(anchor);
    settled();
    res.landed?.();
    return;
  }
  const anims = [el.animate([{ transform: mode === "sheet" ? "translateY(100%)" : "translateX(100%)" }, { transform: "none" }],
    { duration: mode === "sheet" ? OPEN_MS + 40 : OPEN_MS, easing: EASE_OUT })];
  const flyer = entry.origin?.flyFrom || entry.origin?.el;
  if (res.flyTo && flyer) {
    const a = flyNumber(flyer, res.flyTo);
    if (a) anims.push(a);
  }
  if (mode === "split") anims.push({ finished: holdDuring(anchor, OPEN_MS + 40) });
  await Promise.allSettled(anims.map((a) => a.finished));
  html.classList.remove("sp-moving", "sp-anim");
  holdPlace(anchor);
  settled();
  res.landed?.();
}

async function swap(entry, { fly }) {
  const reduced = reducedMotion();
  if (!reduced) {
    await Promise.allSettled([bodyEl, titleEl].map((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SWAP_OUT_MS, easing: "ease-in", fill: "forwards" }).finished));
  }
  const res = fill(entry);
  mark(entry.origin);
  titleEl.focus({ preventScroll: true });
  if (!reduced) {
    [bodyEl, titleEl].forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SWAP_IN_MS, easing: "ease-out" }); });
    const flyer = entry.origin?.flyFrom || entry.origin?.el;
    if (fly && res.flyTo && flyer) {
      const a = flyNumber(flyer, res.flyTo);
      if (a) await a.finished.catch(() => {});
    }
  }
  res.landed?.();
}

async function doClose({ instant = false } = {}) {
  if (!isOpen) return;
  const cur = top();
  const reduced = instant || reducedMotion();
  const anchor = anchorFor(cur?.origin);
  if (anchor) anchor.top = anchor.el.getBoundingClientRect().top;
  const focusTo = cur?.origin?.focusEl || cur?.origin?.el;
  unmark?.();
  unmark = null;
  if (!reduced) {
    html.classList.add("sp-moving", "sp-anim");
    const out = el.animate([{ transform: el.style.transform || "none" }, { transform: mode === "sheet" ? "translateY(100%)" : "translateX(100%)" }],
      { duration: CLOSE_MS, easing: EASE_IN, fill: "forwards" });
    clearLayout();
    html.classList.remove("pop-locked");
    scrim.hidden = true;
    await Promise.allSettled([out.finished, mode === "split" ? holdDuring(anchor, CLOSE_MS + 40) : null]);
    out.cancel();
    html.classList.remove("sp-moving", "sp-anim");
  } else {
    clearLayout();
    html.classList.remove("pop-locked");
    scrim.hidden = true;
  }
  el.hidden = true;
  el.removeAttribute("data-open");
  el.style.transform = "";
  isOpen = false;
  holdPlace(anchor);
  const closed = hist;
  hist = [];
  bodyEl.replaceChildren();
  settled();
  new Set(closed.map((e) => e.onClose).filter(Boolean)).forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  if (focusTo?.isConnected) focusTo.focus({ preventScroll: true });
  pulse(cur?.origin);
}

// ------------------------------------------------------------------ the divider
function wireDivider() {
  let x0 = null;
  let anchor = null;
  const save = (w) => store.set("split-w", w);
  divider.addEventListener("pointerdown", (e) => {
    if (mode !== "split") return;
    e.preventDefault();
    x0 = e.clientX;
    anchor = anchorFor(null);
    divider.setPointerCapture(e.pointerId);
    html.classList.add("sp-dragging", "sp-moving");
  });
  divider.addEventListener("pointermove", (e) => {
    if (x0 === null) return;
    setWidth(clampW(vw() - e.clientX));
    holdPlace(anchor);
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    html.classList.remove("sp-dragging", "sp-moving");
    save(parseInt(html.style.getPropertyValue("--sp-w"), 10));
    holdPlace(anchor);
    settled();
  };
  divider.addEventListener("pointerup", end);
  divider.addEventListener("pointercancel", end);
  divider.addEventListener("dblclick", () => {
    store.remove("split-w");
    const a = anchorFor(null);
    setWidth(wanted());
    holdPlace(a);
    settled();
  });
  let t = 0;
  divider.addEventListener("keydown", (e) => {
    if (mode !== "split") return;
    const step = e.shiftKey ? 72 : 24;
    const w = parseInt(html.style.getPropertyValue("--sp-w"), 10) || wanted();
    const L = limits();
    const next = e.key === "ArrowLeft" ? w + step : e.key === "ArrowRight" ? w - step : e.key === "Home" ? L.max : e.key === "End" ? L.min : null;
    if (next === null) return;
    e.preventDefault();
    const a = anchorFor(null);
    html.classList.add("sp-moving");
    setWidth(clampW(next));
    holdPlace(a);
    save(clampW(next));
    clearTimeout(t);
    t = setTimeout(() => { html.classList.remove("sp-moving"); settled(); }, 200);
  });
}

// ------------------------------------------------------------------ phones: swipe the sheet down to close it
function wireSwipe() {
  let y0 = null;
  let t0 = 0;
  let dy = 0;
  el.addEventListener("pointerdown", (e) => {
    if (mode !== "sheet" || !e.target.closest?.("[data-drag]") || e.target.closest("button, a, input, select")) return;
    y0 = e.clientY;
    t0 = performance.now();
    dy = 0;
    e.target.closest("[data-drag]").setPointerCapture?.(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    el.style.transform = dy ? `translateY(${dy}px)` : "";
  });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    if (dy > 90 || (dy > 30 && v > 0.5)) { closeSide(); return; }      // slides out from where the finger left it
    const start = el.style.transform;
    el.style.transform = "";
    if (start && !reducedMotion()) el.animate([{ transform: start }, { transform: "none" }], { duration: 180, easing: EASE_OUT });
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
