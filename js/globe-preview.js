// The preview card on the home globe: after a click the globe flies to the country and this card appears beside
// it with the country's name, its two latest UNHCR figures (refugees from here, refugees hosted here), its top
// situation and "Open country ›". A second click on the same country, or the button, opens the country page
// (with the cross-document view transition). Esc or a click elsewhere closes it.
// Every figure comes straight from data/web/country/<ISO>.json; a missing value says "no data", never 0.
import { esc, numHTML, applyNumbers } from "./format.js";
import { loadCountry } from "./globe-card.js";

let card = null;
let current = null;          // iso shown
let onClose = null;

const lastOf = (series) => {
  if (!Array.isArray(series)) return null;
  for (let i = series.length - 1; i >= 0; i--) if (series[i][1] !== null && series[i][1] !== undefined) return { year: series[i][0], value: series[i][1] };
  return null;
};
const fig = (p) => (p ? `${numHTML(p.value)} <span class="muted tabular">(${p.year})</span>` : '<span class="no-data">no data</span>');

function ensure() {
  if (card) return card;
  card = document.createElement("section");
  card.className = "globe-preview";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-labelledby", "gp-name");
  card.hidden = true;
  document.body.append(card);
  // a click anywhere else (not on the globe, which handles its own clicks) closes the card
  document.addEventListener("pointerdown", (e) => {
    if (card.hidden || card.contains(e.target) || e.target.closest?.("#globe")) return;
    closePreview();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !card.hidden) { e.stopPropagation(); closePreview(); document.getElementById("globe")?.focus({ preventScroll: true }); }
  });
  window.addEventListener("resize", () => { if (!card.hidden) closePreview(); });
  return card;
}

// one name for the country throughout the card: the globe's display name (the header), e.g. "Tanzania"
function html(iso, name, c) {
  const head = `<header class="globe-preview__head"><h2 id="gp-name" class="globe-preview__name">${esc(name)}</h2>
    <button class="icon-btn globe-preview__close" type="button" aria-label="Close preview" data-gp-close>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></header>`;
  if (c === undefined) return `${head}<p class="small muted">Loading…</p>`;
  const open = `<a class="btn btn--sm btn--primary globe-preview__open" href="country.html?iso=${esc(iso)}" data-gp-open>Open country &rsaquo;</a>`;
  if (c === null) return `${head}<p class="small muted">No more figures for this country.</p>${open}`;
  const from = lastOf(c.from?.refugees);
  const hosted = lastOf(c.hosted?.refugees);
  const top = [...(c.situations || [])].filter((s) => s.latest && Number.isFinite(s.latest.value))
    .sort((a, b) => b.latest.value - a.latest.value)[0];
  return `${head}
    <dl class="globe-preview__rows">
      <div><dt>Refugees from ${esc(name)}</dt><dd>${fig(from)}</dd></div>
      <div><dt>Refugees hosted in ${esc(name)}</dt><dd>${fig(hosted)}</dd></div>
    </dl>
    <p class="globe-preview__src small muted">UNHCR, year-end; latest year with a figure.</p>
    ${top ? `<p class="globe-preview__top small"><span class="muted">Top situation:</span> <a href="situation.html?id=${esc(top.id)}">${esc(top.title)}</a></p>` : ""}
    ${open}`;
}

function place(pt) {
  const vw = document.documentElement.clientWidth;
  if (vw < 600) {                 // phones: a sheet at the bottom of the screen
    card.classList.add("globe-preview--docked");
    card.style.left = card.style.top = "";
    return;
  }
  card.classList.remove("globe-preview--docked");
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  let left = (pt.right ?? pt.x) + 20;
  if (left + w > vw - 16) left = (pt.left ?? pt.x) - w - 20;
  if (left < 16) left = pt.x + 28 + w > vw - 16 ? 16 : pt.x + 28;     // a very wide country: beside its centre
  const top = Math.min(Math.max(16 + scrollY, pt.y + scrollY - h / 2), scrollY + innerHeight - h - 16);
  card.style.left = `${Math.round(Math.max(16, left))}px`;
  card.style.top = `${Math.round(top)}px`;
}

/** Open the page for `iso`, letting the card's name morph into the country page heading. */
export function openCountry(iso) {
  const name = card?.querySelector(".globe-preview__name");
  if (name) name.style.viewTransitionName = "country-name";
  location.href = `country.html?iso=${encodeURIComponent(iso)}`;
}

/**
 * Show the card for a country. `pt` is the country's centre on screen (client px, after the fly-to).
 * `close` is called when the card closes (the globe un-dims).
 */
export async function showPreview({ iso, name, pt }, close) {
  ensure();
  onClose = close;
  current = iso;
  card.innerHTML = html(iso, name, undefined);
  card.hidden = false;
  card.classList.remove("is-in");
  place(pt);
  void card.offsetWidth;
  card.classList.add("is-in");
  const c = await loadCountry(iso);
  if (current !== iso || card.hidden) return;
  card.innerHTML = html(iso, name, c);
  applyNumbers(card);
  place(pt);
  card.querySelector("[data-gp-close]").addEventListener("click", () => { closePreview(); document.getElementById("globe")?.focus({ preventScroll: true }); });
  card.querySelector("[data-gp-open]").addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;   // new tab: let the link work
    e.preventDefault();
    openCountry(iso);
  });
  card.querySelector("[data-gp-open]").focus({ preventScroll: true });
}

export function previewOpen() { return !!card && !card.hidden ? current : null; }

export function closePreview() {
  if (!card || card.hidden) return;
  card.hidden = true;
  current = null;
  const f = onClose;
  onClose = null;
  f?.();
}
