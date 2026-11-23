// The small card that follows the pointer over the home globe: the most important figures for one
// country, for the year the globe shows. Numbers come straight from data/web/country/<ISO>.json
// (UNHCR and IDMC series as published). UNHCR and IDMC figures for people displaced inside the country
// are separate rows and are never added. A missing value says "no data", never 0.
import { getJSON } from "./data.js";
import { esc, numHTML, applyNumbers } from "./format.js";

const cache = new Map();
let card = null;
let showing = null;   // iso currently shown
let pinned = false;   // opened by a tap: stays until the next tap elsewhere

export function loadCountry(iso) {
  if (!cache.has(iso)) cache.set(iso, getJSON(`data/web/country/${iso}.json`).catch(() => null));
  return cache.get(iso);
}

const at = (series, year) => {
  if (!Array.isArray(series)) return undefined;
  const p = series.find((x) => x[0] === year);
  return p ? p[1] : undefined;
};
const val = (v) => (v === undefined || v === null ? '<span class="no-data">no data</span>' : numHTML(v));

function ensure() {
  if (card) return card;
  card = document.createElement("div");
  card.className = "globe-card";
  card.setAttribute("role", "status");          // read out politely when it changes
  card.setAttribute("aria-live", "polite");
  card.hidden = true;
  document.body.append(card);
  document.addEventListener("pointerdown", (e) => {
    if (pinned && !card.contains(e.target) && !e.target.closest?.(".gl-c")) hide();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if (!pinned) hide(); }, { passive: true });
  return card;
}

function rows(c, year) {
  const from = c?.from || {};
  const hosted = c?.hosted || {};
  const internal = c?.internal || {};
  const out = [
    ["Refugees from here", at(from.refugees, year), "UNHCR"],
    ["Refugees hosted here", at(hosted.refugees, year), "UNHCR"],
    ["Displaced inside", at(internal.idps_idmc_conflict, year), "IDMC · conflict"],
    ["Displaced inside", at(internal.idps_unhcr, year), "UNHCR · IDPs it assists"],
  ];
  const dis = at(internal.idmc_disaster_new, year);
  if (dis) out.push([`Disaster displacements in ${year}`, dis, "IDMC · moves in the year, not people"]);
  return out;
}

function html(f, year, c) {
  const head = `<div class="globe-card__head"><strong>${esc(f.name)}</strong><span class="muted tabular">${year}</span></div>
    <div class="globe-card__main"><span class="globe-card__big">${val(f.value)}</span>
      <span class="globe-card__src">displaced in total: people who left plus people displaced inside (UNHCR)</span></div>`;
  if (c === undefined) return `${head}<p class="small muted globe-card__loading">Loading…</p>`;
  if (c === null) return `${head}<p class="small muted">No more figures for this country.</p>`;
  const r = rows(c, year);
  const idmc = r[2][1] !== undefined;
  const unhcr = r[3][1] !== undefined;
  return `${head}
    <dl class="globe-card__rows">${r.map(([k, v, src]) => `<div><dt>${esc(k)}<span class="globe-card__src">${esc(src)}</span></dt><dd>${val(v)}</dd></div>`).join("")}</dl>
    <p class="globe-card__foot">${idmc && unhcr ? "IDMC and UNHCR are never added. " : ""}Year-end figures. ${f.touch ? `<a href="country.html?iso=${esc(f.iso)}">Open ${esc(f.name)} &rsaquo;</a>` : "Click for a preview."}</p>`;
}

function place(x, y) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  if (vw < 600) {               // phones: a sheet at the bottom of the screen
    card.classList.add("globe-card--docked");
    card.style.left = card.style.top = "";
    return;
  }
  card.classList.remove("globe-card--docked");
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  let left = x + 16;
  let top = y + 16;
  if (left + w > vw - 16) left = x - w - 16;
  if (top + h > vh - 16) top = y - h - 16;
  card.style.left = `${Math.round(Math.max(16, left))}px`;
  card.style.top = `${Math.round(Math.max(16, top))}px`;
}

/** Show (or move) the card for a country. `year` is the year the globe currently shows. */
export async function showCountryCard(f, year) {
  ensure();
  pinned = f.touch;
  if (showing !== `${f.iso}:${year}:${f.touch}`) {
    showing = `${f.iso}:${year}:${f.touch}`;
    card.innerHTML = html(f, year, undefined);
    card.hidden = false;
    applyNumbers(card);
    const c = await loadCountry(f.iso);
    if (showing !== `${f.iso}:${year}:${f.touch}`) return;     // the pointer moved on
    card.innerHTML = html(f, year, c);
    applyNumbers(card);
  }
  card.hidden = false;
  place(f.x, f.y);
}

export function hideCountryCard(force = false) {
  if (force || !pinned) hide();
}

function hide() {
  if (!card) return;
  card.hidden = true;
  showing = null;
  pinned = false;
}
