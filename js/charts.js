// Chart block used by every chart on the site:
//   one-sentence title · Chart / Data switch · Download PNG / CSV · pin · source line · screen-reader text.
// Charts redraw on resize, on the number-format switch and on theme change.
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm";
import { esc, fmt, fmtPct, fmtShort, numHTML, pctHTML, mode } from "./format.js";
import { icon } from "./icons.js";

export { Plot };

export const C = {
  refugees: "var(--c-refugees)", asylum: "var(--c-asylum)", idp: "var(--c-idp)", oip: "var(--c-oip)",
  stateless: "var(--c-stateless)", context: "var(--c-context)", refFill: "var(--c-refugees-fill)",
  idpFill: "var(--c-idp-fill)", band: "var(--c-context-band)", ink: "var(--ink)", muted: "var(--muted)", line: "var(--line)",
};
export const MEASURE_COLOR = {
  refugees: C.refugees, asylum_seekers: C.asylum, oip: C.oip, stateless: C.stateless, returns: C.refugees,
  idps_unhcr: C.idp, idps_idmc_conflict: C.idp, idps_idmc_disaster: C.idp, idmc_conflict_new: C.idp, idmc_disaster_new: C.idp,
};

export const MARGIN = { left: 60, right: 96, top: 18, bottom: 30 };

/** Plot options shared by all charts. */
export function base(width, height = 300, extra = {}) {
  return {
    width, height,
    marginLeft: MARGIN.left, marginRight: width < 520 ? 64 : MARGIN.right, marginTop: MARGIN.top, marginBottom: MARGIN.bottom,
    style: { background: "transparent", fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontSize: "12px", color: "var(--muted)", overflow: "visible" },
    x: { label: null, tickFormat: (d) => String(d), ticks: width < 520 ? 4 : 7 },
    y: { label: null, tickFormat: (d) => fmtShort(d), ticks: 4, grid: false },
    ...extra,
  };
}

let seq = 0;
const blocks = new Set();
let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  const redrawAll = () => blocks.forEach((b) => b.isConnected ? b._redraw?.() : blocks.delete(b));
  document.addEventListener("numfmt-change", redrawAll);
  document.addEventListener("theme-change", redrawAll);
}

/**
 * @param {HTMLElement} host
 * @param {object} spec
 *   id, title (html), summary (screen-reader text), source (html), note (html, optional)
 *   draw(width) -> Element                       the chart
 *   table: { columns: [{key, label, type: "year"|"num"|"pct"|"text"}], rows: [...] }
 *   csv: { filename, rows: [...objects], columns: [...] }   (defaults from table)
 *   onTrace(row) (optional): numbers in the Data view open the source trace
 *   pin: { key, item } (optional)
 */
export function chartBlock(host, spec) {
  watch();
  const id = spec.id || `chart-${++seq}`;
  host.innerHTML = `
    <figure class="chart" id="${id}">
      <figcaption class="chart__title">${spec.title}</figcaption>
      <div class="chart__tools">
        <div class="seg seg--text" role="group" aria-label="Show as">
          <button type="button" data-view="chart" aria-pressed="true">${icon("chart", { size: 14 })} Chart</button>
          <button type="button" data-view="data" aria-pressed="false">${icon("table", { size: 14 })} Data</button>
        </div>
        <div class="chart__dl" role="group" aria-label="Download">
          <span class="small muted">Download</span>
          <button type="button" class="btn btn--sm" data-dl="png">PNG</button>
          <button type="button" class="btn btn--sm" data-dl="csv">CSV</button>
        </div>
        ${spec.pin ? `<button class="pin-btn" type="button" data-pin-key="${esc(spec.pin.key)}" aria-pressed="false" aria-label="Add this chart to my collection">${icon("pin", { size: 16 })}</button>` : ""}
      </div>
      <div class="chart__body" role="img" aria-label="${esc(spec.summary || "")}"></div>
      <div class="chart__data" hidden></div>
      ${spec.note ? `<p class="chart__note">${spec.note}</p>` : ""}
      <p class="chart__src">${spec.source || ""}</p>
    </figure>`;
  const fig = host.querySelector("figure");
  const body = fig.querySelector(".chart__body");
  const dataEl = fig.querySelector(".chart__data");

  const redraw = () => {
    const w = Math.max(280, Math.floor(body.clientWidth || fig.clientWidth || 640));
    try {
      const el = spec.draw(w);
      body.replaceChildren(el);
      // hide Plot's drawing from screen readers (the figure has a text summary and a Data view);
      // interactive extras such as the events strip stay reachable
      [el, ...(el.querySelectorAll?.("svg") || [])].forEach((s) => {
        if (s.tagName?.toLowerCase() === "svg" && !s.closest(".events")) s.setAttribute("aria-hidden", "true");
      });
      // a chart with focusable parts (event markers) can't be one image: label the drawing itself instead
      if (body.querySelector("[tabindex], button, a")) {
        body.removeAttribute("role");
        body.removeAttribute("aria-label");
        const drawing = [el, ...el.querySelectorAll("svg")].find((x) => x.tagName?.toLowerCase() === "svg" && !x.closest(".events"));
        if (drawing) {
          drawing.removeAttribute("aria-hidden");
          drawing.setAttribute("role", "img");
          drawing.setAttribute("aria-label", spec.summary || "");
          // Plot labels its inner groups; inside an image those labels are not allowed and not needed
          drawing.querySelectorAll("[aria-label], [aria-description]").forEach((g) => { g.removeAttribute("aria-label"); g.removeAttribute("aria-description"); });
        }
      }
    } catch (e) {
      console.error(e);
      body.innerHTML = `<p class="muted small">This chart could not be drawn. The Data view still works.</p>`;
    }
    if (!dataEl.hidden) dataEl.innerHTML = tableHTML(spec.table, spec.onTrace);
  };
  fig._redraw = redraw;
  blocks.add(fig);
  new ResizeObserver(() => {
    const w = body.clientWidth;
    if (w && Math.abs(w - (fig._w || 0)) > 8) { fig._w = w; redraw(); }
  }).observe(body);
  redraw();

  fig.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    const data = b.dataset.view === "data";
    fig.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    body.hidden = data;
    dataEl.hidden = !data;
    if (data) dataEl.innerHTML = tableHTML(spec.table, spec.onTrace);
  }));
  dataEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-row]");
    if (t && spec.onTrace) spec.onTrace(spec.table.rows[+t.dataset.row], t);
  });
  fig.querySelector('[data-dl="csv"]').addEventListener("click", () => downloadCSV(spec));
  fig.querySelector('[data-dl="png"]').addEventListener("click", (e) => downloadPNG(fig, spec, e.currentTarget));
  return fig;
}

export function tableHTML(table, onTrace) {
  if (!table) return "";
  const cell = (c, r, i) => {
    const v = r[c.key];
    if (c.type === "num") {
      const inner = numHTML(v);
      return onTrace && r.raw_ref !== undefined && v !== null && v !== undefined
        ? `<td class="num"><button class="linklike" type="button" data-row="${i}" aria-label="Where ${esc(fmt(v))} comes from">${inner}</button></td>`
        : `<td class="num">${inner}</td>`;
    }
    if (c.type === "pct") return `<td class="num">${pctHTML(v)}</td>`;
    if (c.type === "year") return `<td class="tabular">${esc(v)}</td>`;
    return `<td>${esc(v ?? "")}</td>`;
  };
  return `<div class="table-wrap"><table class="table">
    <thead><tr>${table.columns.map((c) => `<th scope="col" class="${c.type === "num" || c.type === "pct" ? "num" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${table.rows.map((r, i) => `<tr>${table.columns.map((c) => cell(c, r, i)).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV keeps exact numbers in machine-readable form, plus a column in the reader's chosen format. */
export function downloadCSV(spec) {
  const t = spec.table;
  const cols = [];
  for (const c of t.columns) {
    cols.push({ head: c.label, get: (r) => r[c.key] ?? "" });
    if (c.type === "num") cols.push({ head: `${c.label} (${mode() === "ind" ? "Indian" : "international"} format)`, get: (r) => (r[c.key] == null ? "no data" : fmt(r[c.key])) });
    if (c.type === "pct") cols.push({ head: `${c.label} (formatted)`, get: (r) => (r[c.key] == null ? "no data" : fmtPct(r[c.key])) });
  }
  const extra = spec.csvExtra || [];
  const head = [...cols.map((c) => c.head), ...extra.map((e) => e.head)];
  const lines = [head.map(csvEscape).join(",")];
  for (const r of t.rows) lines.push([...cols.map((c) => c.get(r)), ...extra.map((e) => e.get(r))].map(csvEscape).join(","));
  save(new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }), `${spec.filename || spec.id || "chart"}.csv`);
}

async function downloadPNG(fig, spec, btn) {
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const { toPng } = await import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm");
    const bg = getComputedStyle(document.body).backgroundColor;
    const url = await toPng(fig, {
      backgroundColor: bg, pixelRatio: 2,
      filter: (n) => !(n.classList && (n.classList.contains("chart__tools") || n.classList.contains("chart__data"))),
    });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spec.filename || spec.id || "chart"}.png`;
    a.click();
  } catch (e) {
    console.error(e);
    alert("The PNG could not be made in this browser. The CSV download still works.");
  } finally {
    btn.disabled = false;
    btn.textContent = "PNG";
  }
}

export function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Make a PNG data URL of a chart figure (used by exports). */
export async function figurePNG(fig) {
  const { toPng } = await import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm");
  return toPng(fig, { backgroundColor: "#ffffff", pixelRatio: 2,
    filter: (n) => !(n.classList && (n.classList.contains("chart__tools") || n.classList.contains("chart__data"))) });
}

// lets the collection page capture a chart on this page as PNG (used by exports, same origin only)
globalThis.wv1ChartPNG = (id) => figurePNG(document.getElementById(id));

/** Find the series point nearest a click on a Plot chart (returns the year). */
export function yearAt(plotEl, evt) {
  const x = plotEl.scale?.("x");
  if (!x?.invert) return null;
  const svg = plotEl.tagName === "svg" ? plotEl : plotEl.querySelector("svg");
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  const sx = vb && vb.width ? vb.width / r.width : 1;
  return Math.round(x.invert((evt.clientX - r.left) * sx));
}
