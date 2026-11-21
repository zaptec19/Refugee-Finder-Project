// The larger situation map in a pop-out (native <dialog>). It grows out of the mini globe (FLIP) and shrinks
// back into it on close; with reduced motion it only fades; on phones it is a full-screen sheet.
// Every figure comes from the situation JSON (series, by_host, hosts_latest, origin_total). The map never
// calculates a number; a missing value says "no data".
import { renderMiniGlobe } from "./minimap.js";
import { getJSON } from "./data.js";
import { esc, fmt, mode, setMode } from "./format.js";
import { closePopover, closePanel } from "./popouts.js";

let dlg = null;
let busy = false;
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const phone = () => document.documentElement.clientWidth < 600;
const last = (s) => (Array.isArray(s) && s.length ? s[s.length - 1] : null);

/** Figures for the map, straight from the situation file. */
function figuresFor(S, MEAS, SRC) {
  const measureWord = (MEAS[S.main_measure]?.label || "people").toLowerCase();
  const srcName = (id) => SRC[id]?.short || id || "";
  const hosts = {};
  const hostIsos = S.type === "named" ? S.hosts || [] : S.host_iso3 ? [S.host_iso3] : [];
  for (const iso of hostIsos) {
    let p = null;
    if (S.type === "named") p = S.series?.by_host?.[iso] && !Array.isArray(S.series.by_host[iso]) ? S.series.by_host[iso] : last(S.series?.by_host?.[iso]);
    else p = last(S.series?.[S.main_measure]);
    if (!p) {
      const h = (S.hosts_latest || []).find((x) => x.host_iso3 === iso);
      if (h) p = { value: h.value, year: h.year, source_id: "unhcr-pop-2026" };
    }
    hosts[iso] = p ? { value: p.value, year: p.year, source: srcName(p.source_id) } : null;
  }
  const ot = last(S.origin_total);
  const main = last(S.series?.[S.main_measure]);
  const originText = () => {
    if (ot && Number.isFinite(ot.value)) return `${fmt(ot.value)} ${measureWord} from ${S.origin_name} in all host countries, ${ot.year} · ${srcName(ot.source_id)}`;
    if (S.type === "idp" && main && Number.isFinite(main.value)) return `${fmt(main.value)}: ${MEAS[S.main_measure]?.label || ""}, ${main.year} · ${srcName(main.source_id)}`;
    return "no data";
  };
  const extra = (S.hosts_latest || [])
    .filter((h) => h.host_iso3 && h.host_iso3 !== S.origin_iso3 && !hostIsos.includes(h.host_iso3))
    .slice(0, 5)
    .map((h) => ({ iso: h.host_iso3, name: h.name, value: h.value, year: h.year, source: "UNHCR",
      id: `${S.origin_iso3}-${h.host_iso3}`.toLowerCase() }));
  return { measureWord, hosts, originText, origin: ot || main, extra, hostIsos };
}

function hostNamesFor(S, hostIsos) {
  return S.type === "named" ? hostIsos.map((h) => (S.hosts_latest || []).find((x) => x.host_iso3 === h)?.name || h) : [S.host_name].filter(Boolean);
}

function sourceLine(S, SRC) {
  const id = S.type === "idp" ? S.series?.[S.main_measure]?.[0]?.source_id : "unhcr-pop-2026";
  const fig = id === "unhcr-pop-2026" ? "UNHCR, Refugee Data Finder (2026 release)" : `${SRC[id]?.short || ""}, ${SRC[id]?.dataset || ""} (${(SRC[id]?.release || "").replace(/ \(.*$/, "")})`;
  return `Figures: ${fig}. Borders: Natural Earth via world-atlas. Borders shown are not an endorsement.`;
}

function build() {
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.className = "map-dialog";
  dlg.setAttribute("aria-labelledby", "map-dialog-title");
  dlg.innerHTML = `
    <div class="map-dialog__box">
      <header class="map-dialog__head">
        <h2 id="map-dialog-title" class="map-dialog__title"></h2>
        <button class="icon-btn map-dialog__close" type="button" aria-label="Close map" data-close>
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </header>
      <div class="map-dialog__body">
        <div class="map-dialog__map"></div>
        <div class="map-dialog__table" hidden></div>
      </div>
      <div class="map-dialog__bar">
        <div class="map-dialog__zoom" role="group" aria-label="Zoom">
          <button class="btn btn--sm" type="button" data-zoom="in" aria-label="Zoom in">+</button>
          <button class="btn btn--sm" type="button" data-zoom="out" aria-label="Zoom out">&minus;</button>
          <button class="btn btn--sm" type="button" data-zoom="reset">Reset</button>
        </div>
        <div class="seg map-dialog__fmt" role="group" aria-label="Number format">
          <button type="button" data-mfmt="ind" title="Indian format: lakh and crore">1,00,000</button>
          <button type="button" data-mfmt="intl" title="International format">100,000</button>
        </div>
        <label class="map-dialog__toggle" hidden><input type="checkbox" data-extra> Show other host countries</label>
        <button class="linklike map-dialog__view" type="button" data-mapview aria-pressed="false">Table view</button>
      </div>
      <p class="map-dialog__note small muted">Arrows link origin and host countries; they don't show the route people travelled.</p>
      <p class="map-dialog__extra small muted" hidden></p>
      <footer class="map-dialog__foot small muted">
        <p class="map-dialog__cap"></p>
        <p class="map-dialog__src"></p>
      </footer>
    </div>`;
  document.body.append(dlg);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });       // Esc
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) close();         // the dimmed background, or X
  });
  return dlg;
}

let ctx = null;   // { trigger, map, S, MEAS, SRC, fig, table }

/** Open the larger map for a situation. `trigger` is the mini globe button (focus goes back to it on close). */
export async function openMapDialog({ S, MEAS, SRC, trigger }) {
  if (busy || dlg?.open) return;
  busy = true;
  closePopover();
  closePanel();
  build();
  const fig = figuresFor(S, MEAS, SRC);
  const hostNames = hostNamesFor(S, fig.hostIsos);
  dlg.querySelector(".map-dialog__title").textContent = `${S.origin_name}${hostNames.length ? ` to ${hostNames.join(" and ")}` : ""}`;
  dlg.querySelector(".map-dialog__cap").innerHTML = hostNames.length
    ? `from ${esc(S.origin_name)} <span aria-hidden="true">&rsaquo;</span> to ${hostNames.map(esc).join(" and ")}` : esc(S.origin_name);
  dlg.querySelector(".map-dialog__src").textContent = sourceLine(S, SRC);
  const mapEl = dlg.querySelector(".map-dialog__map");
  const tableEl = dlg.querySelector(".map-dialog__table");
  mapEl.hidden = false;
  tableEl.hidden = true;
  const viewBtn = dlg.querySelector("[data-mapview]");
  viewBtn.textContent = "Table view";
  viewBtn.setAttribute("aria-pressed", "false");
  const toggle = dlg.querySelector(".map-dialog__toggle");
  const box = toggle.querySelector("input");
  box.checked = false;
  toggle.hidden = !fig.extra.length;
  dlg.querySelector(".map-dialog__extra").hidden = true;
  dlg.querySelectorAll("[data-zoom]").forEach((b) => { b.disabled = false; });
  mapEl.innerHTML = '<p class="small muted map-dialog__loading">Loading the map…</p>';

  syncFmt();
  dlg.classList.toggle("map-dialog--sheet", phone());
  dlg.showModal();
  ctx = { trigger, S, MEAS, SRC, fig, hostNames };
  await animateOpen(trigger);
  const out = await renderMiniGlobe(mapEl, {
    size: "large", origin: S.origin_iso3, hosts: fig.hostIsos, originName: S.origin_name, hostNames,
    figures: { measureWord: fig.measureWord, hosts: fig.hosts, originText: fig.originText, extra: fig.extra },
  });
  ctx.map = out?.controls || null;
  wire();
  busy = false;
  globalThis.wv1MapDialog = { controls: ctx.map, drawn: () => ctx.map?.drawn };
  dlg.querySelector(".map-dialog__close").focus({ preventScroll: true });
}

function syncFmt() {
  dlg?.querySelectorAll("[data-mfmt]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mfmt === mode())));
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  dlg.querySelector(".map-dialog__bar").addEventListener("click", (e) => {
    const z = e.target.closest("[data-zoom]")?.dataset.zoom;
    if (z && ctx?.map) {
      if (z === "in") ctx.map.zoom(1.4);
      else if (z === "out") ctx.map.zoom(1 / 1.4);
      else ctx.map.reset();
      return;
    }
    if (e.target.closest("[data-mapview]")) toggleTable();
    const f = e.target.closest("[data-mfmt]")?.dataset.mfmt;
    if (f) setMode(f);       // the page's own switch is behind the dialog; this is the same setting
  });
  dlg.querySelector("[data-extra]").addEventListener("change", (e) => {
    ctx?.map?.setExtra(e.target.checked);
    showExtraNote(e.target.checked);
    if (!dlg.querySelector(".map-dialog__table").hidden) renderTable();
  });
  // the number format switch: arrow figures, tooltips and the table follow it
  document.addEventListener("numfmt-change", () => {
    syncFmt();
    if (!dlg?.open || !ctx) return;
    ctx.map?.redraw();
    if (!dlg.querySelector(".map-dialog__table").hidden) renderTable();
  });
}

async function showExtraNote(on) {
  const el = dlg.querySelector(".map-dialog__extra");
  if (!on || !ctx) { el.hidden = true; return; }
  let ids = new Set();
  try { ids = new Set((await getJSON("data/web/situations.json")).map((s) => s.id)); } catch { /* links are optional */ }
  const hidden = new Set(ctx.map?.hiddenExtra || []);
  const far = ctx.fig.extra.filter((x) => hidden.has(x.iso)).map((x) => x.name);
  el.innerHTML = `The other host countries are separate situations: ${ctx.fig.extra.map((x) => (ids.has(x.id)
    ? `<a href="situation.html?id=${esc(x.id)}">${esc(x.name)}</a>` : esc(x.name))).join(", ")}.${far.length
    ? ` Not drawn because ${far.length > 1 ? "they are" : "it is"} on the far side of the globe from this situation: ${far.map(esc).join(", ")} (see the table view).` : ""}`;
  el.hidden = false;
}

function toggleTable() {
  const mapEl = dlg.querySelector(".map-dialog__map");
  const tableEl = dlg.querySelector(".map-dialog__table");
  const btn = dlg.querySelector("[data-mapview]");
  const toTable = tableEl.hidden;
  if (toTable) renderTable();
  tableEl.hidden = !toTable;
  mapEl.hidden = toTable;
  dlg.querySelectorAll("[data-zoom]").forEach((b) => { b.disabled = toTable; });
  btn.textContent = toTable ? "Map view" : "Table view";
  btn.setAttribute("aria-pressed", String(toTable));
}

function renderTable() {
  const { S, fig, hostNames } = ctx;
  const showExtra = dlg.querySelector("[data-extra]").checked;
  const num = (v) => (v && Number.isFinite(v.value) ? fmt(v.value) : '<span class="no-data">no data</span>');
  const o = fig.origin;
  const rows = [
    [S.origin_name, "Origin", o && Number.isFinite(o.value) ? `${fmt(o.value)} ${S.type === "idp" ? "" : `(${fig.measureWord}, all host countries)`}` : '<span class="no-data">no data</span>', o?.year ?? "", o ? (ctx.SRC[o.source_id]?.short || "") : ""],
    ...fig.hostIsos.map((iso, i) => [hostNames[i] || iso, "Host", num(fig.hosts[iso]), fig.hosts[iso]?.year ?? "", fig.hosts[iso]?.source || ""]),
    ...(showExtra ? fig.extra.map((x) => [x.name, "Other host (another situation)", num(x), x.year ?? "", x.source]) : []),
  ];
  dlg.querySelector(".map-dialog__table").innerHTML = `<table class="table">
      <caption class="sr-only">Countries on this map and their latest figures</caption>
      <thead><tr><th scope="col">Country</th><th scope="col">Role</th><th scope="col">Figure (${esc(fig.measureWord)})</th><th scope="col">Year</th><th scope="col">Source</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td class="tabular">${r[2]}</td><td class="tabular">${esc(String(r[3]))}</td><td>${esc(r[4])}</td></tr>`).join("")}</tbody>
    </table>`;
}

// ------------------------------------------------------------------ animation
const box = () => dlg.querySelector(".map-dialog__box");

function flipFrom(trigger) {
  const from = trigger.getBoundingClientRect();
  const to = box().getBoundingClientRect();
  const s = Math.max(0.05, from.width / to.width);
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${s})`;
}

async function animateOpen(trigger) {
  const back = dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out", pseudoElement: "::backdrop" });
  let a;
  if (reduced()) a = box().animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" });
  else if (dlg.classList.contains("map-dialog--sheet")) a = box().animate([{ transform: "translateY(100%)" }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  else a = box().animate([{ transform: flipFrom(trigger), opacity: 0.6 }, { transform: "none", opacity: 1 }], { duration: 300, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
  await Promise.allSettled([a.finished, back.finished]);
}

async function close() {
  if (!dlg?.open || busy) return;
  busy = true;
  const trigger = ctx?.trigger;
  const back = dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "ease-in", pseudoElement: "::backdrop", fill: "forwards" });
  let a;
  if (reduced() || !trigger?.isConnected) a = box().animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
  else if (dlg.classList.contains("map-dialog--sheet")) a = box().animate([{ transform: "none" }, { transform: "translateY(100%)" }], { duration: 260, easing: "ease-in", fill: "forwards" });
  else a = box().animate([{ transform: "none", opacity: 1 }, { transform: flipFrom(trigger), opacity: 0.6 }], { duration: 260, easing: "cubic-bezier(0.4, 0, 0.6, 1)", fill: "forwards" });
  await Promise.allSettled([a.finished, back.finished]);
  dlg.close();
  a.cancel();
  back.cancel();
  busy = false;
  trigger?.focus({ preventScroll: true });
}
