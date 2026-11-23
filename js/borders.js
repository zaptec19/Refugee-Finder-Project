// "About borders": the one borders note, shown in a small popover next to the link (a native [popover] placed
// beside the link, inside the same container, so it also works inside the big map's modal dialog).
// Esc and a click outside close it. Mini globes link to datasets.html#maps instead, to save space.
import { MAP_SOURCE } from "./config.js";
import { esc } from "./format.js";

let seq = 0;

/** The "About borders" link and its popover. */
export function bordersNoteHTML() {
  const id = `borders-note-${++seq}`;
  return `<button type="button" class="linklike map-src__about" popovertarget="${id}">About borders</button><div id="${id}" popover class="borders-pop" role="note">
      <p class="borders-pop__h">About borders</p><p>${esc(MAP_SOURCE.bordersNote)}</p><p><a href="datasets.html#maps">Map data on the Datasets page &rsaquo;</a></p></div>`;
}

/** Put each borders popover under root next to its link when it opens (above it if there is no room below). */
export function wireBordersNotes(root = document) {
  root.querySelectorAll(".borders-pop:not([data-wired])").forEach((pop) => {
    pop.dataset.wired = "1";
    pop.addEventListener("toggle", (e) => {
      if (e.newState !== "open") return;
      const btn = root.querySelector(`[popovertarget="${pop.id}"]`) || document.querySelector(`[popovertarget="${pop.id}"]`);
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const w = pop.offsetWidth;
      const h = pop.offsetHeight;
      const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), vw - w - 12);
      const top = r.bottom + 8 + h <= window.innerHeight - 12 ? r.bottom + 8 : Math.max(12, r.top - 8 - h);
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
    });
  });
}
