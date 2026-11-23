// Chart block used by every chart on the site:
//   one-sentence title · Chart / Data switch · Download PNG / CSV · pin · source line · screen-reader text.
// Charts redraw on resize, on the number-format switch and on theme change.
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.16/+esm";
import { esc, fmt, fmtPct, fmtShort, numHTML, pctHTML, mode } from "./format.js";
import { icon, pinButton } from "./icons.js";
import { reducedMotion } from "./motion.js";

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

/** The text-safe variant of a people-type colour (for small labels drawn in that colour). */
export const inkOf = (c) => String(c).replace(/^var\(--c-([a-z]+)\)$/, "var(--c-$1-ink)");

export const MARGIN = { left: 60, right: 96, top: 18, bottom: 30 };

/** Plot options shared by all charts. */
export function base(width, height = 300, extra = {}) {
  return {
    width, height,
    marginLeft: MARGIN.left, marginRight: width < 520 ? 64 : MARGIN.right, marginTop: MARGIN.top, marginBottom: MARGIN.bottom,
    style: { background: "transparent", fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontSize: "12px", color: "var(--muted)", overflow: "visible" },
    x: { label: null, tickFormat: (d) => String(d), ticks: width < 520 ? 4 : 7 },
    y: { label: null, tickFormat: (d) => fmtShort(d), ticks: 4, grid: true },     // faint horizontal gridlines only
    ...extra,
  };
}

/** Points a line can't show: a series with one point, or a point with no neighbouring year in its series. They get
 *  a dot and a "value (year)" label, so a one-year series never disappears from a chart.
 *  lines: [{ key, color, pts: [{ year, value }] }] */
export function isolatedMarks(lines) {
  const iso = [];
  for (const l of lines) {
    const ys = new Set(l.pts.filter((p) => p.value != null).map((p) => p.year));
    for (const p of l.pts) {
      if (p.value != null && !ys.has(p.year - 1) && !ys.has(p.year + 1)) iso.push({ ...p, key: l.key, color: l.color });
    }
  }
  if (!iso.length) return [];
  return [
    Plot.dot(iso, { x: "year", y: "value", r: 4.5, fill: (d) => d.color, stroke: "var(--bg)", strokeWidth: 1.5, className: "pt-isolated" }),
    Plot.text(iso, { x: "year", y: "value", text: (d) => `${fmt(d.value)} (${d.year})`, dy: -12, fill: (d) => inkOf(d.color), fontWeight: 500, className: "pt-isolated-label" }),
  ];
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
        ${spec.pin ? pinButton({ key: spec.pin.key, label: `the chart "${String(spec.title || "").replace(/<[^>]+>/g, "").trim()}"` }) : ""}
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
      polish(el, fig.id);
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
  drawInWhenSeen(fig);
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
    const url = await figurePNG(fig);          // always the clean light theme, for papers
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
  // the light token set on this figure only, no glow or pulse, nothing mid-animation
  fig.classList.add("surface-light", "capturing");
  fig.getAnimations({ subtree: true }).forEach((a) => a.finish?.());
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await toPng(fig, { backgroundColor: "#ffffff", pixelRatio: 2,
      filter: (n) => !(n.classList && (n.classList.contains("chart__tools") || n.classList.contains("chart__data"))) });
  } finally {
    fig.classList.remove("surface-light", "capturing");
  }
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

// ------------------------------------------------------------------ look: gradients, solid bars, the last point
let gid = 0;
const COLOR_OF_FILL = (f) => {
  const m = /var\(--c-([a-z]+)(?:-fill)?\)/.exec(f || "");
  return m ? `var(--c-${m[1]})` : null;
};
/** Make a Plot drawing crisp: area fills become a vertical gradient (--area-top, 45% dark / 35% light, to 0% of the type colour), bars are solid
 *  with a slightly brighter top edge, and each line's last point gets a small dot (glowing and slowly pulsing in
 *  the dark theme). Purely visual: nothing about the data or scales changes. */
function polish(root, id) {
  const svgs = root.tagName?.toLowerCase() === "svg" ? [root] : [...root.querySelectorAll("svg")].filter((x) => !x.closest(".events"));
  for (const svg of svgs) {
    const NS = "http://www.w3.org/2000/svg";
    let defs = svg.querySelector("defs.polish");
    if (!defs) { defs = document.createElementNS(NS, "defs"); defs.setAttribute("class", "polish"); svg.prepend(defs); }
    // areas
    svg.querySelectorAll('g[aria-label="area"]').forEach((g) => {
      const c = COLOR_OF_FILL(g.getAttribute("fill"));
      if (!c) return;
      const gradId = `${id || "c"}-g${++gid}`;
      const lg = document.createElementNS(NS, "linearGradient");
      lg.setAttribute("id", gradId);
      lg.setAttribute("x1", "0"); lg.setAttribute("y1", "0"); lg.setAttribute("x2", "0"); lg.setAttribute("y2", "1");
      lg.innerHTML = `<stop offset="0" style="stop-color:${c};stop-opacity:var(--area-top, 0.45)"/><stop offset="1" style="stop-color:${c};stop-opacity:0"/>`;
      defs.append(lg);
      g.setAttribute("fill", `url(#${gradId})`);
      g.setAttribute("fill-opacity", "1");
      g.classList.add("is-area");
    });
    // bars: solid, with a brighter top edge (vertical bars only)
    svg.querySelectorAll('g[aria-label="bar"]').forEach((g) => {
      g.setAttribute("fill-opacity", "1");
      g.classList.add("is-bar");
      const rects = [...g.querySelectorAll("rect")];
      const bottoms = new Set(rects.map((r) => Math.round(+r.getAttribute("y") + +r.getAttribute("height"))));
      if (rects.length < 2 || bottoms.size > 2) return;
      const top = document.createElementNS(NS, "g");
      top.setAttribute("class", "bar-top");
      top.setAttribute("stroke", g.getAttribute("fill") || "currentColor");
      top.innerHTML = rects.filter((r) => +r.getAttribute("height") > 2).map((r) => {
        const x = +r.getAttribute("x"); const y = +r.getAttribute("y"); const w = +r.getAttribute("width");
        return `<line x1="${x}" x2="${x + w}" y1="${y + 1}" y2="${y + 1}"/>`;
      }).join("");
      g.after(top);
    });
    spreadEndLabels(svg);
    // lines: a dot on the last point
    svg.querySelectorAll('g[aria-label="text"]').forEach((g) => g.classList.add("is-text"));
    svg.querySelectorAll('g[aria-label="line"]').forEach((g) => {
      g.classList.add("is-line");
      const stroke = g.getAttribute("stroke") || g.querySelector("path")?.getAttribute("stroke");
      g.querySelectorAll("path").forEach((p) => {
        const len = p.getTotalLength?.();
        if (!len) return;
        const pt = p.getPointAtLength(len);
        const dot = document.createElementNS(NS, "g");
        dot.setAttribute("class", "pt-last");
        dot.setAttribute("style", `color:${stroke}`);
        dot.innerHTML = `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3.5" fill="${stroke}"/>`;
        g.after(dot);
      });
    });
  }
}

// ------------------------------------------------------------------ draw-in, once per chart, the first time it is seen
const exporting = (() => { try { return new URLSearchParams(location.search).has("theme"); } catch { return false; } })();
function drawInWhenSeen(fig) {
  if (reducedMotion() || exporting || !("IntersectionObserver" in window)) return;
  const body = fig.querySelector(".chart__body");
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    drawIn(body);
  }, { threshold: 0.25 });
  io.observe(fig);
}
function drawIn(body) {
  const svg = [...body.querySelectorAll("svg")].find((x) => !x.closest(".events"));
  if (!svg || reducedMotion()) return;
  const ease = "cubic-bezier(0.3, 0.7, 0.2, 1)";
  svg.querySelectorAll("g.is-line path").forEach((p) => {
    if (p.getAttribute("stroke-dasharray") || p.closest("[stroke-dasharray]")) {
      p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out", fill: "backwards" });
      return;
    }
    const len = p.getTotalLength?.() || 0;
    if (!len) return;
    p.animate([{ strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 }],
      { duration: 700, easing: ease });
  });
  svg.querySelectorAll("g.is-area").forEach((g) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 150, easing: "ease-out", fill: "backwards" }));
  svg.querySelectorAll("g.is-bar rect").forEach((r, i, all) => {
    r.style.transformBox = "fill-box";
    r.style.transformOrigin = "center bottom";
    r.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
      { duration: 600, delay: Math.min(250, (i / Math.max(1, all.length)) * 250), easing: ease, fill: "backwards" });
  });
  svg.querySelectorAll(".bar-top, .pt-last, g.is-text").forEach((g) => g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 560, fill: "backwards" }));
}

// ------------------------------------------------------------------ labels at the end of lines never overlap
/** Text marks drawn with className "end-label" (one label at the end of each line): when two lines end close
 *  together their labels are pushed apart vertically, kept inside the plot area, and a short leader line joins a
 *  moved label to the end of its line. Positions only; the text and the data are unchanged. */
function spreadEndLabels(svg) {
  const NS = "http://www.w3.org/2000/svg";
  const items = [];
  svg.querySelectorAll("g.end-label text").forEach((t) => {
    const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(t.getAttribute("transform") || "");
    if (!m) return;
    const b = t.getBBox();
    if (!b.height) return;
    items.push({ t, x: +m[1], y: +m[2], top: +m[2] + b.y, h: b.height, left: +m[1] + b.x });
  });
  if (items.length < 2) return;
  const vb = svg.viewBox?.baseVal;
  const H = vb?.height || +svg.getAttribute("height") || 0;
  const minY = MARGIN.top - 6;
  const maxY = H - MARGIN.bottom + 4;
  const GAP = 3;
  items.sort((a, b) => a.top - b.top);
  const pos = items.map((it) => it.top);
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + items[i - 1].h + GAP);     // push down
  const over = pos[pos.length - 1] + items[items.length - 1].h - maxY;
  if (over > 0) pos[pos.length - 1] -= over;
  for (let i = pos.length - 2; i >= 0; i--) pos[i] = Math.min(pos[i], pos[i + 1] - items[i].h - GAP);    // then up if needed
  if (pos[0] < minY) {
    const d = minY - pos[0];
    for (let i = 0; i < pos.length; i++) pos[i] += d;
  }
  items.forEach((it, i) => {
    const shift = pos[i] - it.top;
    if (Math.abs(shift) < 0.5) return;
    it.t.setAttribute("transform", `translate(${it.x},${(it.y + shift).toFixed(1)})`);
    if (Math.abs(shift) < 4) return;
    const lead = document.createElementNS(NS, "line");
    lead.setAttribute("class", "end-label__lead");
    lead.setAttribute("x1", String(it.x - 6));          // the end of the line (labels sit 8 px to its right)
    lead.setAttribute("x2", String(it.left - 1));
    lead.setAttribute("y1", (it.y).toFixed(1));
    lead.setAttribute("y2", (pos[i] + it.h / 2).toFixed(1));
    it.t.closest("g").append(lead);
  });
}
