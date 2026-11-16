// Pop-outs: one popover (Popover API, "auto" so only one is open) and one side panel (<dialog>).
// Esc closes both natively. Opening the panel closes any popover.
import { esc } from "./format.js";
import { icon } from "./icons.js";

let pop;
let panel;

function ensure() {
  if (pop) return;
  pop = document.createElement("div");
  pop.id = "pop";
  pop.setAttribute("popover", "auto");
  pop.className = "pop";
  document.body.append(pop);
  panel = document.createElement("dialog");
  panel.className = "panel-right";
  panel.id = "panel";
  document.body.append(panel);
  panel.addEventListener("click", (e) => { if (e.target === panel) panel.close(); });   // click on backdrop
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

/** Show a popover next to `anchor`. Returns the popover element. */
export function openPopover(html, anchor, { label = "", wide = false } = {}) {
  ensure();
  if (pop.matches(":popover-open")) pop.hidePopover();
  pop.innerHTML = `<button class="icon-btn pop__close" type="button" aria-label="Close">${icon("close", { size: 16 })}</button>${html}`;
  pop.classList.toggle("pop--wide", wide);
  if (label) pop.setAttribute("aria-label", label);
  pop.setAttribute("role", "dialog");
  pop._anchor = anchor;
  pop.showPopover();
  place(pop, anchor);
  pop.querySelector(".pop__close").addEventListener("click", () => pop.hidePopover());
  const back = () => { anchor?.focus?.({ preventScroll: true }); pop.removeEventListener("toggle", onToggle); };
  const onToggle = (e) => { if (e.newState === "closed") back(); };
  pop.addEventListener("toggle", onToggle);
  return pop;
}

export function closePopover() {
  if (pop?.matches(":popover-open")) pop.hidePopover();
}

/** Open the right-side panel (dims the page). */
export function openPanel(title, bodyHTML, { onOpen } = {}) {
  ensure();
  closePopover();
  const opener = document.activeElement;
  panel.innerHTML = `<div class="panel__head"><h2 class="panel__title" id="panel-title">${esc(title)}</h2>
      <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button></div>
    <div class="panel__body">${bodyHTML}</div>`;
  panel.setAttribute("aria-labelledby", "panel-title");
  panel.querySelector("[data-close]").addEventListener("click", () => panel.close());
  panel.addEventListener("close", () => opener?.focus?.({ preventScroll: true }), { once: true });
  panel.showModal();
  onOpen?.(panel);
  return panel;
}

export function closePanel() {
  if (panel?.open) panel.close();
}

/** Glossary hover cards for every .term[data-term] under root (hover, focus or click). */
export function bindGlossary(root, glossary) {
  const byId = Object.fromEntries(glossary.map((g) => [g.id, g]));
  let timer;
  const show = (el) => {
    const g = byId[el.dataset.term];
    if (!g) return;
    clearTimeout(timer);
    const p = openPopover(`<div class="gl"><h3 class="gl__term">${esc(g.term)}</h3><p>${esc(g.plain)}</p>
      ${g.how_sources_differ ? `<p class="eyebrow" style="margin-top:12px">How sources differ</p><p class="small">${esc(g.how_sources_differ)}</p>` : ""}
      <a class="small" href="learn.html#g-${g.id}">More in Learn &rsaquo;</a></div>`, el, { label: g.term });
    p.onmouseenter = () => clearTimeout(timer);
    p.onmouseleave = () => { timer = setTimeout(() => p.hidePopover(), 250); };
  };
  root.querySelectorAll(".term[data-term]").forEach((el) => {
    el.setAttribute("role", "button");
    el.setAttribute("aria-haspopup", "dialog");
    el.addEventListener("mouseenter", () => { timer = setTimeout(() => show(el), 180); });
    el.addEventListener("mouseleave", () => { clearTimeout(timer); timer = setTimeout(() => closePopover(), 300); });
    el.addEventListener("click", () => show(el));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(el); } });
  });
}
