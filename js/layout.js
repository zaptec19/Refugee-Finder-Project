// Shared page frame: top bar (on every page), theme, How to use (the tours), collection badge, toasts.
import { store, collectionItems } from "./store.js";
import { mode, setMode, applyNumbers, esc } from "./format.js";
import { icon } from "./icons.js";
import { reducedMotion } from "./motion.js";
import { externalLinksNewTab } from "./links.js";
import { hasNotice, showNotice } from "./search-notice.js";
import { initTrail, setTrailTitle, backTarget, goBack } from "./trail.js";
import { sideOpen, closeSide } from "./popout.js";

// cross-document view transitions (css: @view-transition): skipped with the system's reduced motion.
// A transition the browser aborts ("Page already revealed") rejects its promises; quiet() handles them so nothing
// ever throws, and skipTransition() on a transition that is already over is guarded too.
export function quietTransition(vt) {
  if (!vt) return vt;
  for (const k of ["ready", "finished", "updateCallbackDone"]) {
    try { vt[k]?.catch?.(() => {}); } catch { /* not a promise in this browser */ }
  }
  return vt;
}
export function skipTransition(vt) {
  if (!quietTransition(vt)) return;
  try { vt.skipTransition(); } catch { /* already finished or aborted */ }
}
window.addEventListener("pageswap", (e) => { quietTransition(e.viewTransition); if (reducedMotion()) skipTransition(e.viewTransition); });
window.addEventListener("pagereveal", (e) => { quietTransition(e.viewTransition); if (reducedMotion()) skipTransition(e.viewTransition); });

/** The theme for this page: ?theme= (chart exports) > the reader's saved choice > the home page's dark >
 *  the system setting. The inline script in each page's <head> applies the same rule before first paint. */
export function themeFor(home) {
  const forced = new URLSearchParams(location.search).get("theme");
  if (forced === "light" || forced === "dark") return forced;
  const saved = store.get("theme", null);
  if (saved === "light" || saved === "dark") return saved;
  if (home) return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * @param {object} o
 * @param {"home"|"situation"|"collection"|"learn"|"datasets"|"request"|"country"} o.page
 * @param {boolean} [o.dark] force the dark surface (home page)
 */
export function initPage({ page, dark = false } = {}) {
  const root = document.documentElement;
  const theme = themeFor(dark);
  root.dataset.theme = theme;
  try { localStorage.removeItem("wv1:fx"); } catch { /* an old setting that no longer exists */ }
  document.body.dataset.page = page;
  try { localStorage.removeItem("wv1:guide"); } catch { /* the old Guide mode setting */ }

  const header = document.createElement("header");
  header.className = "topbar";
  header.innerHTML = topbarHTML(page, dark, theme);
  document.body.prepend(header);
  const skip = document.createElement("a");
  skip.className = "skip-link";
  skip.href = "#main";
  skip.textContent = "Skip to content";
  document.body.prepend(skip);
  externalLinksNewTab();
  wireBack(page);
  // a search that was changed on the way here says so ("Showing: ... · You searched: ...")
  if (hasNotice()) showNotice();

  // the interactive tour: loaded only when one is running (or asked for with ?tour=1)
  let touring = new URLSearchParams(location.search).get("tour") === "1";
  try { touring = touring || !!localStorage.getItem("wv1:tour"); } catch { /* ignore */ }
  if (touring) import("./tour.js").then((m) => m.resumeTour());
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-start-tour]");
    if (!b) return;
    e.preventDefault();
    import("./tour.js").then((m) => m.startTour(b.dataset.startTour || "home"));       // Learn: the home tour
  });

  // number format switch
  header.querySelectorAll("[data-fmt]").forEach((b) => {
    b.addEventListener("click", () => {
      setMode(b.dataset.fmt);
      syncFormatButtons();
    });
  });
  syncFormatButtons();
  document.addEventListener("numfmt-change", syncFormatButtons);   // also when it changes elsewhere (the map pop-out)

  // How to use: the tour for this page (js/tour.js); on phones it sits in the menu
  header.querySelector("#tour-btn")?.addEventListener("click", () => {
    header.classList.remove("is-menu-open");
    header.querySelector(".topbar__menu-btn")?.setAttribute("aria-expanded", "false");
    import("./tour.js").then((m) => m.startTour());
  });

  // theme toggle (every page): one click switches light and dark; the colours cross-fade (View Transitions)
  const themeBtn = header.querySelector("#theme-toggle");
  const syncTheme = (spin) => {
    const dark = root.dataset.theme === "dark";
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    const txt = themeBtn.querySelector(".topbar__theme-text");
    if (txt) txt.textContent = dark ? "Light mode" : "Dark mode";
    const want = dark ? "sun" : "moon";
    if (themeBtn.dataset.icon === want) return;
    themeBtn.dataset.icon = want;
    themeBtn.querySelector(".topbar__theme-icon").innerHTML = icon(want);
    if (spin && !reducedMotion()) {
      themeBtn.querySelector("svg")?.animate([{ transform: "rotate(-90deg) scale(0.6)", opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
  };
  const setTheme = (next, { save = true } = {}) => {
    const apply = () => {
      root.dataset.theme = next;
      if (save) store.set("theme", next);
      syncTheme(true);
      document.dispatchEvent(new CustomEvent("theme-change", { detail: next }));
    };
    if (!document.startViewTransition || reducedMotion()) { apply(); return; }
    root.classList.add("theme-swap");                  // a plain 250 ms cross-fade of the whole page
    let vt;
    try { vt = quietTransition(document.startViewTransition(apply)); } catch { root.classList.remove("theme-swap"); apply(); return; }
    vt.finished.catch(() => {}).finally(() => root.classList.remove("theme-swap"));
  };
  themeBtn.dataset.icon = theme === "dark" ? "sun" : "moon";
  syncTheme(false);
  themeBtn.addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
  // no saved choice yet: follow the system setting live (the home page stays dark)
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", (e) => {
    if (dark || store.get("theme", null) || new URLSearchParams(location.search).get("theme")) return;
    setTheme(e.matches ? "dark" : "light", { save: false });
  });

  // top-bar search: load the search panel on first focus only
  const ask = header.querySelector("#ask-top");
  if (ask) {
    const go = async () => {
      ask.removeEventListener("focus", go);
      const { attachSearch } = await import("./search-ui.js");
      const ui = await attachSearch(ask);
      if (ask.value.trim() && ask.value !== ask.dataset.topic) ui.run();      // the page's own title: no results yet
    };
    ask.addEventListener("focus", go);
  }

  // phones under 600 px: Learn, How to use, theme and My collection live in a menu; search opens full width
  const menuBtn = header.querySelector(".topbar__menu-btn");
  const menu = header.querySelector("#topbar-menu");
  const setMenu = (open, { focus = true } = {}) => {
    header.classList.toggle("is-menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open && focus) menu.querySelector("a, button")?.focus();
    if (!open && focus) menuBtn.focus();
  };
  menuBtn.addEventListener("click", () => setMenu(!header.classList.contains("is-menu-open")));
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape" && header.classList.contains("is-menu-open")) { e.stopPropagation(); setMenu(false); } });
  menu.addEventListener("focusout", (e) => {
    if (header.classList.contains("is-menu-open") && e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== menuBtn) setMenu(false, { focus: false });
  });
  document.addEventListener("pointerdown", (e) => {
    if (header.classList.contains("is-menu-open") && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false, { focus: false });
  });
  const searchBtn = header.querySelector(".topbar__search-btn");
  if (searchBtn) {
    const setSearch = (open) => {
      header.classList.toggle("is-searching", open);
      searchBtn.setAttribute("aria-expanded", String(open));
      if (open) { setMenu(false, { focus: false }); const a = header.querySelector("#ask-top"); a.focus(); if (a.value === a.dataset.topic) a.select(); }
      else { header.querySelector("#ask-top").dispatchEvent(new Event("search-close")); searchBtn.focus(); }
    };
    searchBtn.addEventListener("click", () => setSearch(true));
    header.querySelector(".topbar__search-close").addEventListener("click", () => setSearch(false));
    header.querySelector("#ask-top-form").addEventListener("keydown", (e) => {
      // Esc first closes the results (search-ui), then the full-width search
      // (capture phase: read the results' state before search-ui's own Esc handler hides them)
      if (e.key === "Escape" && header.classList.contains("is-searching") && !document.querySelector("#ask-top-results:not([hidden])")) setSearch(false);
    }, true);
  }
  const wide = window.matchMedia("(min-width: 600px)");
  wide.addEventListener?.("change", () => {
    setMenu(false, { focus: false });
    if (header.classList.contains("is-searching")) header.querySelector("#ask-top")?.dispatchEvent(new Event("search-close"));
    header.classList.remove("is-searching");
  });

  updateCollectionBadge();
  window.addEventListener("storage", updateCollectionBadge);
  document.addEventListener("collection-change", updateCollectionBadge);

  const region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
  applyNumbers(document);
  return header;
}

function topbarHTML(page, dark, theme) {
  const m = mode();
  const hasTour = ["home", "situation", "country", "collection"].includes(page);
  const cur = (p) => (p === page ? ' aria-current="page"' : "");
  return `
  <div class="topbar__inner">
    <div class="topbar__lead">
      <button class="topbar__back" type="button" hidden>${icon("back", { size: 18 })}<span class="topbar__back-label"></span><span class="topbar__back-short" aria-hidden="true">Back</span></button>
      <a class="brand" href="index.html"${cur("home")}>Refugee Finder</a>
    </div>
${page === "home" ? "" : `    <div class="seg topbar__fmt" role="group" aria-label="Number format">
      <button type="button" data-fmt="ind" aria-pressed="${m === "ind"}" title="Indian format: lakh and crore">1,00,000</button>
      <button type="button" data-fmt="intl" aria-pressed="${m === "intl"}" title="International format">100,000</button>
    </div>`}
    ${page === "home" ? '<span class="topbar__ask-slot" aria-hidden="true"></span>' : `
    <form class="ask topbar__ask" id="ask-top-form" role="search" action="index.html" method="get" onsubmit="return false">
      ${icon("search")}
      <label class="sr-only" for="ask-top">Ask: a country, a group or a question</label>
      <input id="ask-top" name="q" type="search" placeholder="Ask: a country, a group or a question" autocomplete="off">
      <button class="icon-btn topbar__search-close" type="button" aria-label="Close search">${icon("close")}</button>
    </form>
    <button class="icon-btn topbar__search-btn" type="button" aria-label="Search" aria-expanded="false" aria-controls="ask-top-form">${icon("search")}</button>`}
    <button class="icon-btn topbar__menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="topbar-menu">${icon("menu")}<span class="count-dot" aria-hidden="true" hidden></span></button>
    <nav class="topbar__right" id="topbar-menu" aria-label="Site">
      ${page === "home" ? "" : `<a class="topbar__link topbar__learn" href="learn.html"${cur("learn")}>Learn</a>`}
      <button class="icon-btn topbar__theme" id="theme-toggle" type="button" aria-pressed="${theme === "dark"}"
        aria-label="${theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}"><span class="topbar__theme-icon">${icon(theme === "dark" ? "sun" : "moon")}</span><span class="menu-only topbar__theme-text">${theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
${hasTour ? `<button class="pill topbar__tour" id="tour-btn" type="button" aria-label="How to use this page" title="A short tour of this page">${icon("question", { size: 16 })}<span class="pill__text">How to use</span></button>` : ""}
      <a class="collection-btn topbar__coll" href="collection.html"${cur("collection")}>
        <span class="collection-btn__icon">${icon("collection", { size: 20 })}<span class="count-badge" id="coll-count" hidden>0</span></span>
        <span class="label-wide">My collection</span>
      </a>
    </nav>
  </div>`;
}

function syncFormatButtons() {
  const m = mode();
  document.querySelectorAll("[data-fmt]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.fmt === m)));
}

export function updateCollectionBadge() {
  const n = collectionItems().length;
  const b = document.getElementById("coll-count");
  if (!b) return;
  const before = Number(b.textContent) || 0;
  b.textContent = String(n);
  b.hidden = n === 0;
  if (n > before) {                                      // a small bump when something is pinned
    b.classList.remove("count-badge--bump");
    void b.offsetWidth;
    b.classList.add("count-badge--bump");
  }
  b.closest("a")?.setAttribute("aria-label", `My collection, ${n} item${n === 1 ? "" : "s"}`);
  const mb = document.querySelector(".topbar__menu-btn");
  if (mb) {
    mb.querySelector(".count-dot").hidden = n === 0;
    mb.setAttribute("aria-label", n ? `Menu, ${n} item${n === 1 ? "" : "s"} in My collection` : "Menu");
  }
}

/** Toast with an optional action (e.g. Undo). */
export function toast(html, { action, onAction, timeout = 6000 } = {}) {
  const region = document.querySelector(".toast-region");
  if (!region) return;
  region.querySelectorAll(".toast").forEach((old) => old.remove());     // one toast at a time
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<span class="toast__icon" style="color:var(--accent)">${icon("check")}</span><div class="toast__body">${html}</div>`;
  if (action) {
    const b = document.createElement("button");
    b.className = "btn btn--ghost btn--sm";
    b.type = "button";
    b.textContent = action;
    b.addEventListener("click", () => { onAction?.(); t.remove(); if (!region.children.length && region.matches?.(":popover-open")) region.hidePopover(); });
    t.append(b);
  }
  region.append(t);
  // in the top layer, so a toast (and its Undo) shows above an open pop-out too
  if (typeof region.showPopover === "function") {
    if (!region.hasAttribute("popover")) region.setAttribute("popover", "manual");
    try { if (region.matches(":popover-open")) region.hidePopover(); region.showPopover(); } catch { /* not supported */ }
  }
  // the timer pauses while the pointer is on the toast or its Undo has focus, so there is time to use it
  const close = () => { t.remove(); if (!region.children.length && region.matches?.(":popover-open")) region.hidePopover(); };
  let timer = setTimeout(close, timeout);
  const hold = () => clearTimeout(timer);
  const resume = () => { clearTimeout(timer); timer = setTimeout(close, 1500); };
  t.addEventListener("pointerenter", hold);
  t.addEventListener("pointerleave", resume);
  t.addEventListener("focusin", hold);
  t.addEventListener("focusout", (e) => { if (!t.contains(e.relatedTarget)) resume(); });
}


// ------------------------------------------------------------------ the current topic in the top bar
/** Situation, pair and country pages: the top bar's search box shows the page's title (Google-style), so the
 *  reader always knows what they are looking at. Focus or a click selects it all (typing replaces it); clearing
 *  it and leaving puts it back; Enter on the unchanged title does nothing. A small type tag sits before it.
 *  Phones: the title shows as one line under the bar once the page heading has scrolled away; tapping it opens
 *  the search with the title selected. On wide screens the box flashes once when the heading leaves the screen. */
export function setTopic({ title, type = "Situation", heading = null } = {}) {
  const input = document.getElementById("ask-top");
  const form = document.getElementById("ask-top-form");
  const header = document.querySelector(".topbar");
  if (!input || !form || !title) return;
  const first = !input.dataset.topic;
  input.dataset.topic = title;
  if (first || input.value === "" || input.value === input.dataset.prevTopic) input.value = title;
  input.dataset.prevTopic = title;
  input.setAttribute("aria-description", `Current page (${type.toLowerCase()}): ${title}. Type to search something else.`);
  form.classList.add("has-topic");
  let tag = form.querySelector(".ask__tag");
  if (!tag) {
    tag = document.createElement("span");
    tag.className = "ask__tag";
    tag.setAttribute("aria-hidden", "true");
    input.before(tag);
  }
  tag.textContent = type;
  // phones: the one-line title under the bar
  let row = header.querySelector(".topbar__topic");
  if (!row) {
    row = document.createElement("button");
    row.type = "button";
    row.className = "topbar__topic";
    header.append(row);
    row.addEventListener("click", () => header.querySelector(".topbar__search-btn")?.click());
  }
  row.innerHTML = `<span class="topbar__topic-tag" aria-hidden="true">${esc(type)}</span><span class="topbar__topic-text">${esc(title)}</span>`;
  row.setAttribute("aria-label", `Current page: ${title}. Search something else`);
  if (!first) return;

  let justFocused = false;
  input.addEventListener("focus", () => {
    if (input.value !== input.dataset.topic) return;
    justFocused = true;
    input.select();
    // only while it still has focus: select() takes focus in Chrome, which would pull a quick Tab back here
    requestAnimationFrame(() => { if (document.activeElement === input && input.value === input.dataset.topic) input.select(); });
  });
  input.addEventListener("mouseup", (e) => { if (justFocused) { e.preventDefault(); justFocused = false; } });
  input.addEventListener("keydown", () => { justFocused = false; });
  input.addEventListener("blur", () => {
    justFocused = false;
    setTimeout(() => { if (!input.value.trim() && document.activeElement !== input) input.value = input.dataset.topic; }, 150);
  });
  input.addEventListener("search-close", () => { if (!input.value.trim()) input.value = input.dataset.topic; });

  // the page heading: out of view -> the phone row shows; on wide screens the box flashes once
  const h = heading || document.querySelector("main h1");
  if (!h || !("IntersectionObserver" in window)) return;
  let flashed = false;
  const io = new IntersectionObserver(([e]) => {
    const out = !e.isIntersecting && e.boundingClientRect.top < 0;
    document.documentElement.classList.toggle("topic-out", out);
    if (out && !flashed && !reducedMotion() && document.documentElement.clientWidth >= 600) {
      flashed = true;
      form.classList.remove("ask--flash");
      void form.offsetWidth;
      form.classList.add("ask--flash");
      setTimeout(() => form.classList.remove("ask--flash"), 300);
    }
  }, { rootMargin: `-${parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 64}px 0px 0px 0px` });
  io.observe(h);
}

// ------------------------------------------------------------------ Back (js/trail.js)
/** The top bar's Back (js/trail.js): the previous brief, or Home; never on the home page. While the side panel is open
 *  it reads "Close details" and closes it; a running tour ends as Skip does. */
function wireBack(page) {
  initTrail(page);
  const btn = document.querySelector(".topbar__back");
  if (!btn) return;
  const label = btn.querySelector(".topbar__back-label");
  let target = null;
  const show = (text, full) => {
    label.textContent = text;
    btn.title = full;
    btn.setAttribute("aria-label", full);
    btn.hidden = false;
  };
  const refresh = () => {
    if (page === "home") { btn.hidden = true; return; }
    if (sideOpen()) { show("Close details", "Close details"); return; }
    target = backTarget(page);
    if (!target) { btn.hidden = true; return; }
    show(target.label, target.title);
  };
  btn.addEventListener("click", () => {
    if (sideOpen()) { closeSide(); return; }
    const skip = document.querySelector(".tour-card [data-tour='skip']");
    if (skip) { skip.click(); return; }                 // a running tour ends as Skip does
    if (target) goBack(target);
  });
  document.addEventListener("sp-settled", refresh);
  document.addEventListener("trail-change", refresh);
  // the page's own title, once it is drawn (most pages draw their h1 by script)
  const h1 = () => document.querySelector("main h1")?.textContent.trim();
  if (h1()) setTrailTitle(h1());
  else {
    const mo = new MutationObserver(() => { if (h1()) { setTrailTitle(h1()); mo.disconnect(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 10000);
  }
  refresh();
}

/** Where help lives: the top bar's How to use button, or the menu button on phones (the button is inside the menu). */
export function tourAnchor() {
  const b = document.getElementById("tour-btn");
  if (b && b.getBoundingClientRect().width > 0) return b;
  return document.querySelector(".topbar__menu-btn") || b;
}
