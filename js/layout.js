// Shared page frame: top bar (on every page), theme, guide mode, collection badge, toasts.
import { store, collectionItems } from "./store.js";
import { mode, setMode, applyNumbers, esc } from "./format.js";
import { icon } from "./icons.js";
import { reducedMotion } from "./motion.js";
import { externalLinksNewTab } from "./links.js";

// cross-document view transitions (css: @view-transition): skipped with the system's reduced motion
window.addEventListener("pageswap", (e) => { if (reducedMotion()) e.viewTransition?.skipTransition(); });
window.addEventListener("pagereveal", (e) => { if (reducedMotion()) e.viewTransition?.skipTransition(); });

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
  document.body.classList.toggle("guide-on", store.get("guide", false) === true);

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

  // the interactive tour: loaded only when one is running (or asked for with ?tour=1)
  let touring = new URLSearchParams(location.search).get("tour") === "1";
  try { touring = touring || !!localStorage.getItem("wv1:tour"); } catch { /* ignore */ }
  if (touring) import("./tour.js").then((m) => m.resumeTour());
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-start-tour]");
    if (!b) return;
    e.preventDefault();
    import("./tour.js").then((m) => m.startTour());
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

  // guide on/off
  const guide = header.querySelector("#guide-toggle");
  guide.addEventListener("click", () => {
    const on = !document.body.classList.contains("guide-on");
    document.body.classList.toggle("guide-on", on);
    store.set("guide", on);
    guide.setAttribute("aria-pressed", String(on));
    guide.querySelector(".pill__state").textContent = on ? " on" : " off";
    document.dispatchEvent(new CustomEvent("guide-change", { detail: on }));
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
    const vt = document.startViewTransition(apply);
    vt.finished.finally(() => root.classList.remove("theme-swap"));
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
      if (ask.value.trim()) ui.run();
    };
    ask.addEventListener("focus", go);
  }

  // phones under 600 px: Learn, Guide, theme and My collection live in a menu; search opens full width
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
      if (open) { setMenu(false, { focus: false }); header.querySelector("#ask-top").focus(); } else searchBtn.focus();
    };
    searchBtn.addEventListener("click", () => setSearch(true));
    header.querySelector(".topbar__search-close").addEventListener("click", () => setSearch(false));
    header.querySelector("#ask-top-form").addEventListener("keydown", (e) => {
      // Esc first closes the results (search-ui), then the full-width search
      // (capture phase: read the results' state before search-ui's own Esc handler hides them)
      if (e.key === "Escape" && header.classList.contains("is-searching") && !header.querySelector(".results:not([hidden])")) setSearch(false);
    }, true);
  }
  const wide = window.matchMedia("(min-width: 600px)");
  wide.addEventListener?.("change", () => { setMenu(false, { focus: false }); header.classList.remove("is-searching"); });

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
  const guideOn = store.get("guide", false) === true;
  const cur = (p) => (p === page ? ' aria-current="page"' : "");
  return `
  <div class="topbar__inner">
    <a class="brand" href="index.html"${cur("home")}>Refugee Finder</a>
    <div class="seg topbar__fmt" role="group" aria-label="Number format">
      <button type="button" data-fmt="ind" aria-pressed="${m === "ind"}" title="Indian format: lakh and crore">1,00,000</button>
      <button type="button" data-fmt="intl" aria-pressed="${m === "intl"}" title="International format">100,000</button>
    </div>
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
      <a class="topbar__link topbar__learn" href="learn.html"${cur("learn")}>Learn</a>
      <button class="icon-btn topbar__theme" id="theme-toggle" type="button" aria-pressed="${theme === "dark"}"
        aria-label="${theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}"><span class="topbar__theme-icon">${icon(theme === "dark" ? "sun" : "moon")}</span><span class="menu-only topbar__theme-text">${theme === "dark" ? "Light mode" : "Dark mode"}</span></button>
      <button class="pill topbar__guide" id="guide-toggle" type="button" aria-pressed="${guideOn}"
        title="Guide mode shows short tips step by step"><span class="dot" aria-hidden="true"></span><span class="pill__text">Guide<span class="pill__state">${guideOn ? " on" : " off"}</span></span></button>
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

export function guideTip(tip, nextHref, nextLabel) {
  if (!tip) return "";
  return `<aside class="tip" aria-label="Guide tip"><span class="tip__n" aria-hidden="true">${tip.n}</span>
    <div>${esc(tip.text)}${nextHref ? ` <br><a href="${nextHref}">Next: ${esc(nextLabel)} &rsaquo;</a>` : ""}</div></aside>`;
}
