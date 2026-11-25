// Small floating cards (Popover API, "auto" so only one is open): glossary hover cards and event notes.
// Everything that is read at length (glossary terms when clicked, reference lists, the explainer, the source trace,
// the big map) opens in the split side panel instead (js/popout.js).
import { esc } from "./format.js";
import { icon } from "./icons.js";
import { openSide } from "./popout.js";

let pop;

function ensure() {
  if (pop) return;
  pop = document.createElement("div");
  pop.id = "pop";
  pop.setAttribute("popover", "auto");
  pop.className = "pop";
  document.body.append(pop);
  window.addEventListener("resize", () => { if (pop.matches(":popover-open") && pop._anchor) place(pop, pop._anchor); });
}

function place(el, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8);
  let top = r.bottom + 8;
  if (top + h > vh - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(Math.max(8, top))}px`;
}

/** Show a small card next to `anchor`. Returns the popover element. */
export function openPopover(html, anchor, { label = "", wide = false, cls = "" } = {}) {
  ensure();
  if (pop.matches(":popover-open")) pop.hidePopover();
  pop.innerHTML = `<button class="icon-btn pop__close" type="button" aria-label="Close">${icon("close", { size: 16 })}</button>${html}`;
  pop.className = `pop${wide ? " pop--wide" : ""}${cls ? ` ${cls}` : ""}`;
  pop._noRestore = false;
  if (label) pop.setAttribute("aria-label", label);
  pop.setAttribute("role", "dialog");
  pop._anchor = anchor;
  pop.showPopover();
  place(pop, anchor);
  pop.querySelector(".pop__close").addEventListener("click", () => pop.hidePopover());
  const back = () => { if (!pop._noRestore) anchor?.focus?.({ preventScroll: true }); pop.removeEventListener("toggle", onToggle); };
  const onToggle = (e) => { if (e.newState === "closed") back(); };
  pop.addEventListener("toggle", onToggle);
  return pop;
}

/** Close the card. `restoreFocus: false` when the caller moves focus somewhere else itself. */
export function closePopover({ restoreFocus = true } = {}) {
  if (!pop?.matches(":popover-open")) return;
  pop._noRestore = !restoreFocus;
  pop.hidePopover();
}

/** A titled block of HTML in the side panel (e.g. "References (APA)"). */
export function openPanel(title, bodyHTML, { onOpen, origin } = {}) {
  const opener = origin || { el: document.activeElement };
  return openSide({
    kind: "panel", title, origin: opener, key: `panel:${title}`,
    render: (body) => {
      body.innerHTML = `<div class="sp-block">${bodyHTML}</div>`;
      onOpen?.(body);
    },
  });
}
export const closePanel = () => {};

const termHTML = (g) => `<div class="gl gl--side"><h3 class="gl__term">${esc(g.term)}</h3><p>${esc(g.plain)}</p>
  ${g.how_sources_differ ? `<p class="eyebrow" style="margin-top:12px">How sources differ</p><p>${esc(g.how_sources_differ)}</p>` : ""}
  <p><a class="small" href="learn.html#g-${esc(g.id)}">More in Learn &rsaquo;</a></p></div>`;

/** A glossary term in the side panel. */
export function openTerm(g, el) {
  closePopover({ restoreFocus: false });
  return openSide({
    kind: "term", title: "Glossary", announce: `Glossary: ${g.term}, opened beside the page`, key: `term:${g.id}`,
    origin: { el }, render: (body) => { body.innerHTML = termHTML(g); },
  });
}

/** Glossary terms under root: a small card on hover; a click (or Enter / Space) opens the term in the side panel. */
export function bindGlossary(root, glossary) {
  const byId = Object.fromEntries(glossary.map((g) => [g.id, g]));
  let timer;
  const peek = (el) => {
    const g = byId[el.dataset.term];
    if (!g) return;
    clearTimeout(timer);
    const p = openPopover(`<div class="gl"><h3 class="gl__term">${esc(g.term)}</h3><p>${esc(g.plain)}</p>
      <p class="small muted">Click for the full entry beside the page.</p></div>`, el, { label: g.term });
    p.onmouseenter = () => clearTimeout(timer);
    p.onmouseleave = () => { timer = setTimeout(() => p.hidePopover(), 250); };
  };
  const open = (el) => { clearTimeout(timer); const g = byId[el.dataset.term]; if (g) openTerm(g, el); };
  root.querySelectorAll(".term[data-term]").forEach((el) => {
    el.setAttribute("role", "button");
    el.setAttribute("aria-haspopup", "true");
    el.addEventListener("mouseenter", () => { timer = setTimeout(() => peek(el), 180); });
    el.addEventListener("mouseleave", () => { clearTimeout(timer); timer = setTimeout(() => closePopover({ restoreFocus: false }), 300); });
    el.addEventListener("click", () => open(el));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el); } });
  });
}
