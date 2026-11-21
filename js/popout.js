// One pop-out system for the site: a native <dialog> opened with showModal() and animated with the
// Web Animations API. Used by the larger map and the source trace (later the explainer and export dialog).
//
//   const p = createPopout(dlg, { box: ".x__box", sheetClass: "x--sheet" });
//   await p.open({ el, rect, focusEl, flyFrom }, { flyTo, stagger: [...], focus });
//   p.close();
//
// Open (320 ms): the box grows out of the element that was clicked (FLIP) while the backdrop fades in;
// the clicked number can fly into the pop-out's big number; the content fades up in a quick stagger.
// Close (220 ms): the reverse, back into the same element, or a small fade in place if it is out of view;
// then focus returns to it and it gets a soft highlight pulse. Phones (under 600 px): a bottom sheet that
// slides up and closes on a swipe down. Reduced motion: a quick fade only.
// Only one pop-out is open at a time: opening one closes any other pop-out, popover or side panel.
import { closePopover, closePanel } from "./popouts.js";
import { fxOff } from "./fx.js";

// reduced motion and the "Reduce effects" option both mean: no movement, just quick fades
export const reducedMotion = () => fxOff();
export const phoneWidth = () => document.documentElement.clientWidth < 600;

const OPEN_MS = 320;
const CLOSE_MS = 220;
const EASE_OPEN = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const EASE_CLOSE = "cubic-bezier(0.4, 0, 0.8, 0.4)";
const START_RADIUS = 6;
const END_RADIUS = 12;

let current = null;

/** Close whichever pop-out is open (instantly when asked). */
export function closeCurrentPopout({ instant = false } = {}) {
  return current ? current.close({ instant }) : Promise.resolve();
}

// ------------------------------------------------------------------ page scroll lock
let locks = 0;
function lockScroll() {
  if (locks++) return;
  const html = document.documentElement;
  html.classList.add("pop-locked");
}
function unlockScroll() {
  if (!locks) return;
  if (--locks) return;
  document.documentElement.classList.remove("pop-locked");
}

// ------------------------------------------------------------------ geometry
function rectOf(origin) {
  if (origin?.el?.isConnected) {
    const r = origin.el.getBoundingClientRect();
    if (r.width || r.height) return r;
  }
  return origin?.rect || null;
}
function inView(r) {
  if (!r) return false;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw && r.width > 0 && r.height > 0;
}
/** transform that puts a box laid out at `to` over the rectangle `from` (transform-origin 0 0) */
function flip(from, to) {
  const sx = Math.max(0.02, from.width / to.width);
  const sy = Math.max(0.02, from.height / to.height);
  return {
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`,
    borderRadius: `${(START_RADIUS / sx).toFixed(1)}px / ${(START_RADIUS / sy).toFixed(1)}px`,
  };
}

/** A soft highlight that tells the eye where it was: on the element itself, or a ring at a point. */
export function pulse(origin) {
  if (origin?.el?.isConnected && inView(origin.el.getBoundingClientRect())) {
    origin.el.classList.remove("pop-pulse");
    void origin.el.offsetWidth;                 // restart the animation
    origin.el.classList.add("pop-pulse");
    setTimeout(() => origin.el.classList.remove("pop-pulse"), 700);
    return;
  }
  const r = origin?.rect;
  if (!r || !inView(r)) return;
  const ring = document.createElement("span");
  ring.className = "pop-pulse-ring";
  const size = Math.max(16, Math.min(40, Math.max(r.width, r.height) + 12));
  Object.assign(ring.style, { left: `${r.left + r.width / 2 - size / 2}px`, top: `${r.top + r.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px` });
  document.body.append(ring);
  setTimeout(() => ring.remove(), 700);
}

// ------------------------------------------------------------------ the number that flies
/** Animate a copy of the clicked number from where it sits into the pop-out's big number, then show the real one.
 *  `from` is an element (its text and rectangle are used) or { rect, fontSize, text }. */
function flyNumber(dlg, from, to, b, delay = 0) {
  const src = from?.nodeType ? { rect: from.getBoundingClientRect(), style: getComputedStyle(from), text: from.textContent.trim() } : from;
  if (!src?.rect || !to || !inView(src.rect)) return null;
  const ds = getComputedStyle(to);
  const c = document.createElement("span");
  c.className = "pop-fly";
  c.setAttribute("aria-hidden", "true");
  c.textContent = to.textContent.trim() || src.text;
  Object.assign(c.style, {
    left: `${b.left}px`, top: `${b.top}px`, fontFamily: ds.fontFamily, fontSize: ds.fontSize, fontWeight: ds.fontWeight,
    letterSpacing: ds.letterSpacing, fontVariantNumeric: ds.fontVariantNumeric, color: ds.color, lineHeight: ds.lineHeight,
  });
  dlg.append(c);
  const srcSize = parseFloat(src.style?.fontSize || src.fontSize || 14);
  const k = Math.max(0.1, srcSize / parseFloat(ds.fontSize || 34));
  // line up the text's vertical centres (the copy is laid out with the destination's line height)
  const dy = src.rect.top + src.rect.height / 2 - (b.top + (b.height * k) / 2);
  const startColor = src.style?.color || ds.color;
  to.style.opacity = "0";
  const a = c.animate([
    { transform: `translate(${src.rect.left - b.left}px, ${dy}px) scale(${k})`, color: startColor, opacity: from?.nodeType ? 1 : 0 },
    { opacity: 1, offset: 0.25 },
    { transform: "none", color: ds.color, opacity: 1 },
  ], { duration: OPEN_MS + 60, delay, easing: EASE_OPEN, fill: "backwards" });
  const done = () => { to.style.opacity = ""; c.remove(); };
  a.finished.then(done, done);
  return a;
}

// ------------------------------------------------------------------ the pop-out
export function createPopout(dlg, { box = ".pop__box", sheetClass = "pop--sheet", handle = "[data-drag]", onClosed } = {}) {
  const boxEl = () => (typeof box === "string" ? dlg.querySelector(box) : box);
  let origin = null;
  let running = [];
  let closing = null;
  let pressedOnBackdrop = false;

  const cleanup = () => {
    running.forEach((a) => a.cancel());
    running = [];
    dlg.querySelectorAll(".pop-fly").forEach((c) => c.remove());
    dlg.querySelectorAll("[style*='opacity: 0']").forEach((el) => { el.style.opacity = ""; });
    boxEl().style.transform = "";
    unlockScroll();
    if (current === api) current = null;
    const o = origin;
    origin = null;
    closing = null;
    const f = o?.focusEl || o?.el;
    if (f?.isConnected) f.focus({ preventScroll: true });
    pulse(o);
    onClosed?.();
  };

  dlg.addEventListener("cancel", (e) => { e.preventDefault(); api.close(); });                 // Esc
  dlg.addEventListener("close", () => { if (origin) cleanup(); });                               // closed some other way
  dlg.addEventListener("pointerdown", (e) => { pressedOnBackdrop = e.target === dlg; });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg && pressedOnBackdrop) api.close();                                     // the dimmed background
    pressedOnBackdrop = false;
  });
  wireSwipe();

  const api = {
    get isOpen() { return dlg.open; },
    get origin() { return origin; },

    async open(from, { flyTo = null, flyFrom = undefined, stagger = [], focus = null } = {}) {
      if (dlg.open) return;
      closePopover();
      closePanel();
      if (current && current !== api) await current.close({ instant: true });
      current = api;
      origin = from || {};
      const sheet = phoneWidth();
      dlg.classList.toggle(sheetClass, sheet);
      lockScroll();
      dlg.showModal();
      // keyboard users can act at once: focus moves before any animation runs
      (focus || dlg).focus({ preventScroll: true });
      const b = boxEl();
      const reduced = reducedMotion();
      const anims = [dlg.animate([{ opacity: 0 }, { opacity: 1 }],
        { duration: reduced ? 140 : OPEN_MS, easing: "ease-out", pseudoElement: "::backdrop" })];
      if (reduced) {
        anims.push(b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "linear" }));
      } else {
        // measure the final layout before anything moves
        const to = b.getBoundingClientRect();
        const flyRect = flyTo?.getBoundingClientRect();
        const fromRect = rectOf(origin);
        if (sheet) {
          anims.push(b.animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: OPEN_MS + 40, easing: EASE_OPEN }));
        } else if (inView(fromRect)) {
          anims.push(b.animate([{ ...flip(fromRect, to), transformOrigin: "0 0" }, { transform: "none", borderRadius: `${END_RADIUS}px`, transformOrigin: "0 0" }],
            { duration: OPEN_MS, easing: EASE_OPEN }));
        } else {
          anims.push(b.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: OPEN_MS, easing: EASE_OPEN }));
        }
        const flyer = flyFrom === undefined ? origin.flyFrom || origin.el : flyFrom;
        if (flyTo && flyer) {
          const a = flyNumber(dlg, flyer, flyTo, flyRect, sheet ? 60 : 0);
          if (a) anims.push(a);
        }
        anims.push(...staggerIn(stagger, sheet ? 160 : 170));
      }
      running = anims;
      // a quick glow-border flash the moment the box lands (the content may still be fading in)
      if (!reduced) {
        anims[1]?.finished.then(() => {
          if (!dlg.open) return;
          b.classList.remove("pop-landed");
          void b.offsetWidth;
          b.classList.add("pop-landed");
          setTimeout(() => b.classList.remove("pop-landed"), 600);
        }, () => {});
      }
      await Promise.allSettled(anims.map((a) => a.finished));
      if (running === anims) running = [];
    },

    /** Replace the content in place (e.g. following an input of a share to its own source). */
    async swap(render, { stagger = () => [], focus = null } = {}) {
      if (!dlg.open) return;
      const b = boxEl();
      const body = [...b.children];
      if (!reducedMotion()) {
        await Promise.allSettled(body.map((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: "forwards" }).finished));
      }
      render();
      b.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      (focus?.() || dlg).focus({ preventScroll: true });
      if (!reducedMotion()) staggerIn(stagger(), 0);
    },

    async close({ instant = false } = {}) {
      if (!dlg.open) return;
      if (closing) return closing;
      running.forEach((a) => a.finish());
      running = [];
      const b = boxEl();
      if (instant) {
        dlg.close();
        if (origin) cleanup();
        return;
      }
      closing = (async () => {
        const reduced = reducedMotion();
        const sheet = dlg.classList.contains(sheetClass);
        const anims = [dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 120 : CLOSE_MS, easing: "ease-in", pseudoElement: "::backdrop", fill: "forwards" })];
        if (reduced) {
          anims.push(b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }));
        } else {
          [...b.children].forEach((el) => anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: "ease-in", fill: "forwards" })));
          const fromRect = rectOf(origin);
          const now = b.getBoundingClientRect();
          const start = b.style.transform || "none";
          b.style.transform = "";
          const to = b.getBoundingClientRect();
          if (sheet) {
            anims.push(b.animate([{ transform: start }, { transform: "translateY(100%)" }], { duration: CLOSE_MS, easing: EASE_CLOSE, fill: "forwards" }));
          } else if (inView(fromRect) && now.width) {
            anims.push(b.animate([{ transform: "none", borderRadius: `${END_RADIUS}px`, transformOrigin: "0 0", opacity: 1 },
              { opacity: 1, offset: 0.7 },
              { ...flip(fromRect, to), transformOrigin: "0 0", opacity: 0 }], { duration: CLOSE_MS, easing: EASE_CLOSE, fill: "forwards" }));
          } else {
            anims.push(b.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.96)" }], { duration: CLOSE_MS, easing: EASE_CLOSE, fill: "forwards" }));
          }
        }
        await Promise.allSettled(anims.map((a) => a.finished));
        dlg.close();
        anims.forEach((a) => a.cancel());
        [...b.children].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
        if (origin) cleanup();
      })();
      return closing;
    },
  };

  function staggerIn(els, delay) {
    return [...els].filter(Boolean).map((el, i) => el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 200, delay: delay + i * 30, easing: "ease-out", fill: "backwards" }));
  }

  // phones: drag the sheet down by its handle or header to close it
  function wireSwipe() {
    let y0 = null;
    let t0 = 0;
    let dy = 0;
    dlg.addEventListener("pointerdown", (e) => {
      if (!dlg.classList.contains(sheetClass) || !e.target.closest?.(handle) || e.target.closest("button, a, input, select")) return;
      y0 = e.clientY;
      t0 = performance.now();
      dy = 0;
      e.target.closest(handle).setPointerCapture?.(e.pointerId);
    });
    dlg.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      boxEl().style.transform = dy ? `translateY(${dy}px)` : "";
    });
    const end = () => {
      if (y0 === null) return;
      const v = dy / Math.max(1, performance.now() - t0);
      y0 = null;
      if (dy > 90 || (dy > 30 && v > 0.5)) { api.close(); return; }
      const b = boxEl();
      const start = b.style.transform;
      b.style.transform = "";
      if (start && !reducedMotion()) b.animate([{ transform: start }, { transform: "none" }], { duration: 180, easing: EASE_OPEN });
    };
    dlg.addEventListener("pointerup", end);
    dlg.addEventListener("pointercancel", end);
  }

  return api;
}
