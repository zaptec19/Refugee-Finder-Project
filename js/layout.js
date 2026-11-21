// Shared page frame: top bar (on every page), theme, guide mode, collection badge, toasts.
import { store, collectionItems } from "./store.js";
import { mode, setMode, applyNumbers, esc } from "./format.js";
import { icon } from "./icons.js";
import { applyFx, setEffects, effectsChosenOff, reducedMotion, fxOff } from "./fx.js";

// cross-document view transitions (css: @view-transition): skipped with Reduce effects
window.addEventListener("pageswap", (e) => { if (fxOff()) e.viewTransition?.skipTransition(); });
window.addEventListener("pagereveal", (e) => { if (fxOff()) e.viewTransition?.skipTransition(); });

/**
 * @param {object} o
 * @param {"home"|"situation"|"collection"|"learn"|"datasets"|"request"|"country"} o.page
 * @param {boolean} [o.dark] force the dark surface (home page)
 */
export function initPage({ page, dark = false } = {}) {
  const root = document.documentElement;
  const forced = new URLSearchParams(location.search).get("theme");       // ?theme=light (used for chart exports)
  // the home page starts dark; once someone picks a theme it is used on every page
  const theme = forced === "light" || forced === "dark" ? forced : store.get("theme", dark ? "dark" : "light");
  root.dataset.theme = theme;
  applyFx();
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

  // display menu (every page): dark theme and Reduce effects
  const themeBtn = header.querySelector("#theme-toggle");
  const menu = header.querySelector("#disp-menu");
  const darkItem = menu.querySelector("[data-disp=dark]");
  const fxItem = menu.querySelector("[data-disp=fx]");
  const sync = () => {
    darkItem.setAttribute("aria-checked", String(root.dataset.theme === "dark"));
    fxItem.setAttribute("aria-checked", String(effectsChosenOff() || reducedMotion()));
    fxItem.querySelector(".disp-menu__hint").textContent = reducedMotion()
      ? "On because your system asks for reduced motion" : "No blur, glow or movement";
    const want = root.dataset.theme === "dark" ? "sun" : "moon";
    if (themeBtn.dataset.icon !== want) { themeBtn.dataset.icon = want; themeBtn.innerHTML = icon(want); }
  };
  const open = (on) => {
    menu.hidden = !on;
    themeBtn.setAttribute("aria-expanded", String(on));
    if (on) { sync(); darkItem.focus(); }
  };
  themeBtn.addEventListener("click", () => open(menu.hidden));
  darkItem.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    store.set("theme", next);
    sync();
    document.dispatchEvent(new CustomEvent("theme-change", { detail: next }));
  });
  fxItem.addEventListener("click", () => {
    if (reducedMotion()) return;               // the system setting wins
    setEffects(effectsChosenOff());
    sync();
  });
  // (composedPath: the clicked icon may have been re-rendered and detached by the time this runs)
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.composedPath().some((n) => n.classList?.contains("disp"))) open(false); });
  menu.addEventListener("keydown", (e) => {
    const items = [darkItem, fxItem];
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.stopPropagation(); open(false); themeBtn.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + 2) % 2].focus(); }
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
    <form class="ask topbar__ask" role="search" action="index.html" method="get" onsubmit="return false">
      ${icon("search")}
      <label class="sr-only" for="ask-top">Ask: a country, a group or a question</label>
      <input id="ask-top" name="q" type="search" placeholder="Ask: a country, a group or a question" autocomplete="off">
    </form>`}
    <nav class="topbar__right" aria-label="Site">
      <a class="topbar__link topbar__learn" href="learn.html"${cur("learn")}>Learn</a>
      <div class="disp topbar__theme">
        <button class="icon-btn" id="theme-toggle" type="button" aria-label="Display: theme and effects" aria-haspopup="menu" aria-expanded="false"
          aria-controls="disp-menu">${icon(theme === "dark" ? "sun" : "moon")}</button>
        <div class="disp-menu" id="disp-menu" role="menu" aria-label="Display" hidden>
          <button class="disp-menu__item" type="button" role="menuitemcheckbox" data-disp="dark" aria-checked="${theme === "dark"}">
            <span>Dark theme</span><span class="switch" aria-hidden="true"></span></button>
          <button class="disp-menu__item" type="button" role="menuitemcheckbox" data-disp="fx" aria-checked="false">
            <span>Reduce effects<span class="disp-menu__hint">No blur, glow or movement</span></span><span class="switch" aria-hidden="true"></span></button>
        </div>
      </div>
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
  setTimeout(() => { t.remove(); if (!region.children.length && region.matches?.(":popover-open")) region.hidePopover(); }, timeout);
}

export function guideTip(tip, nextHref, nextLabel) {
  if (!tip) return "";
  return `<aside class="tip" aria-label="Guide tip"><span class="tip__n" aria-hidden="true">${tip.n}</span>
    <div>${esc(tip.text)}${nextHref ? ` <br><a href="${nextHref}">Next: ${esc(nextLabel)} &rsaquo;</a>` : ""}</div></aside>`;
}
