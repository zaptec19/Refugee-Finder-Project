// "Where this number comes from": the source trace for any number on the site, in a centred pop-out
// (a bottom sheet on phones) built on js/popout.js.
// Every value shown comes from the situation file or data/web/rows/ (the rows behind a labelled sum).
// Nothing here calculates a figure: shares, sums and differences were computed in the pipeline and are only
// explained here, with their inputs.
import { esc, fmt, numHTML, pctHTML, applyNumbers, mode, setMode } from "./format.js";
import { getJSON, getOptionalJSON, countries as loadCountries, sources as loadSources, glossary as loadGlossary, measures as loadMeasures } from "./data.js";
import { icon } from "./icons.js";
import { pin, has, syncPins } from "./collection.js";
import { cite, STYLES } from "./cite.js";
import { reviewNote, unverifiedTag } from "./review.js";
import { createPopout, phoneWidth } from "./popout.js";

export const LABEL = {
  refugees: "Refugees", asylum_seekers: "Asylum seekers", oip: "Other people in need of international protection",
  idps_unhcr: "IDPs (UNHCR)", idps_idmc_conflict: "IDPs, conflict (IDMC)", idps_idmc_disaster: "IDPs, disasters (IDMC)",
};
const INSIDE = ["idps_unhcr", "idps_idmc_conflict", "idps_idmc_disaster", "idmc_conflict_new", "idmc_disaster_new"];
const SUM_RE = /^Sum of (\d+) (host countries|rows|disaster events)/;
const ROWS_FILE = { returned_refugees: "returns" };
const same = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);

// =================================================================== context: one situation's figures
/** Helpers for one situation: labels, collection items and finding the figure behind a displayed number. */
export function traceContext(S, SRC, MEAS, GLOSS) {
  const hostName = (iso) => S.hosts_latest?.find((x) => x.host_iso3 === iso)?.name || (iso === S.host_iso3 ? S.host_name : iso);
  const place = () => (S.type === "pair" ? S.host_name : S.type === "named" ? S.hosts.map(hostName).join(" and ") : S.origin_name);
  const group = () => S.title.replace(/ in .*$/, "").replace(/, all host countries$/, "");

  function pointLabel(measure, year, hostIso = null) {
    if (hostIso) return `${S.title.split(" in ")[0]} in ${hostName(hostIso)}, ${year}`;
    if (S.type === "pair" && measure === S.main_measure) return `${S.title}, ${year}`;
    if (S.type === "origin" && measure === S.main_measure) return `${S.title}, ${year}`;
    const what = LABEL[measure] || MEAS[measure]?.label || measure;
    if (INSIDE.includes(measure)) return `${what} in ${S.origin_name}, ${year}`;
    if (S.type === "pair") return `${what} from ${S.origin_name} in ${S.host_name}, ${year}`;
    return `${what} from ${S.origin_name}, ${year}`;
  }

  function citeDetail(pt) {
    if (pt.hostIso && S.type !== "pair") return `${S.origin_name} to ${hostName(pt.hostIso)}, ${pt.year}`;
    if (S.type === "pair") return `${S.origin_name} to ${S.host_name}, ${pt.year}`;
    if (S.type === "named") return `${S.origin_name} to ${S.hosts.map(hostName).join(" and ")}, ${pt.year}`;
    return `${S.origin_name}, ${pt.year}`;
  }

  function itemFromPoint(pt) {
    const src = SRC[pt.source_id] || {};
    const where = pt.place || place();
    return {
      kind: "number", key: `num:${S.id}:${pt.measure_id}:${pt.year}:${pt.source_id}:${pt.unit}`,
      value: pt.value, unit: pt.unit, label: pt.label, place: where, year: pt.year, measure_id: pt.measure_id,
      definition: MEAS[pt.measure_id]?.plain || "", source_id: pt.source_id, source_short: src.short,
      source_label: `${src.short || ""} ${src.release?.match(/\d{4}/)?.[0] || ""}`.trim(), release: src.release, raw_ref: pt.raw_ref,
      note: "", situation_id: S.id, situation_title: S.title, csl: src.csl,
      cite_detail: citeDetail(pt), limitations: S.limitations.map((l) => l.text),
    };
  }

  /** A traceable figure from a series point. */
  const point = (p, measure, label, extra = {}) => ({ value: p.value, unit: "people", year: p.year, measure_id: measure, source_id: p.source_id,
    footnote: p.footnote, raw_ref: p.raw_ref, note: p.note, label, ...extra });

  const withYear = (label, year) => `${label}${String(label).includes(String(year)) ? "" : ` (${year})`}`;

  function keyNumberPoint(kn) {
    const pt = { ...kn, label: withYear(kn.label, kn.year) };
    if (!kn.raw_ref && kn.unit !== "percent" && !kn.note) {       // a total: take the series point's note ("Sum of ...")
      const p = (S.series?.[kn.measure_id] || []).find((q) => q.year === kn.year && same(q.value, kn.value));
      if (p?.note) pt.note = p.note;
    }
    if (kn.unit === "percent" && S.type === "origin") {
      const h = (S.hosts_latest || []).find((x) => x.host_iso3 && x.year === kn.year && same(x.value, kn.numerator));
      if (h) pt.numHost = h.host_iso3;
    }
    return pt;
  }

  const totalPoint = (ot) => point(ot, S.main_measure, `${LABEL[S.main_measure] || MEAS[S.main_measure]?.label} from ${S.origin_name}, all host countries, ${ot.year}`,
    { allHosts: true, place: "all host countries" });

  const hostRowPoint = (iso, year, value) => ({ value, unit: "people", year, measure_id: S.main_measure, source_id: "unhcr-pop-2026",
    raw_ref: null, hostIso: iso, label: `${LABEL[S.main_measure] || ""} from ${S.origin_name} in ${hostName(iso)}, ${year}`, place: hostName(iso) });

  const sharePoint = (sh) => ({ value: sh.pct, unit: "percent", year: sh.year, measure_id: S.main_measure, source_id: "unhcr-pop-2026",
    raw_ref: null, numerator: sh.value, denominator: sh.total, label: `Share of all ${group()} living in ${place()}, ${sh.year}` });

  function comparePoint(c) {
    return { value: c.value, unit: "people", year: c.year, measure_id: c.measure_id, source_id: c.source_id, raw_ref: c.raw_ref,
      footnote: null, status: c.status, as_of_date: c.as_of_date, parts: c.parts?.length ? c.parts : null,
      note: c.parts?.length ? "Sum of the parts given in the same answer" : null,
      label: c.source_id.startsWith("unhcr") || c.source_id.startsWith("idmc") ? pointLabel(c.measure_id, c.year)
        : `${MEAS[c.measure_id]?.label || c.measure_id}, ${c.as_of_date ? `as on ${c.as_of_date}` : c.year}` };
  }
  const partPoint = (pp, c) => ({ value: pp.value, unit: "people", year: c.year, measure_id: pp.measure_id, source_id: c.source_id,
    raw_ref: pp.raw_ref, status: c.status, as_of_date: c.as_of_date,
    label: `${pp.label.replace(/ \(Govt\. of India\)/, "")}, ${c.as_of_date ? `as on ${c.as_of_date}` : c.year}` });
  const srcShort = (id) => SRC[id]?.short || id;
  const diffPoint = (a, b) => ({ kind: "diff", value: a.value - b.value, unit: "people", year: a.year, source_id: a.source_id,
    a: comparePoint(a), b: comparePoint(b), label: `Gap between ${srcShort(a.source_id)} and ${srcShort(b.source_id)}, ${a.year}` });

  /** The figure behind a number shown on the page: by value (and year, and measure when known). Null if it isn't one. */
  function resolve(value, { year = null, pct = false, measure = null } = {}) {
    const v = Number(value);
    if (!Number.isFinite(v) || (!v && year === null)) return null;
    const yOk = (y) => year === null || year === undefined || Number(y) === Number(year);
    const mOk = (m) => !measure || m === measure || (measure === "returned_refugees" && m === "returns");
    for (const kn of S.key_numbers || []) {
      if ((kn.unit === "percent") === pct && same(kn.value, v) && yOk(kn.year) && mOk(kn.measure_id)) return keyNumberPoint(kn);
    }
    if (pct) {
      const sh = (S.share || []).find((p) => same(p.pct, v) && yOk(p.year));
      return sh ? sharePoint(sh) : null;
    }
    const keys = Object.keys(S.series || {}).filter((k) => Array.isArray(S.series[k]) && mOk(k));
    keys.sort((a, b) => (b === S.main_measure) - (a === S.main_measure));
    for (const k of keys) {
      const p = S.series[k].find((q) => same(q.value, v) && yOk(q.year));
      if (p) return k === "returns" ? point(p, "returned_refugees", `Returned refugees, ${p.year}`) : point(p, k, pointLabel(k, p.year));
    }
    if (mOk(S.main_measure)) {
      for (const [iso, ser] of Object.entries(S.series?.by_host || {})) {
        const p = (ser || []).find((q) => same(q.value, v) && yOk(q.year));
        if (p) return point(p, S.main_measure, pointLabel(S.main_measure, p.year, iso), { place: hostName(iso), hostIso: iso });
      }
      const ot = (S.origin_total || []).find((p) => same(p.value, v) && yOk(p.year));
      if (ot) return totalPoint(ot);
      const h = (S.hosts_latest || []).find((x) => x.host_iso3 && same(x.value, v) && yOk(x.year));
      if (h) return hostRowPoint(h.host_iso3, h.year, h.value);
    }
    for (const c of S.compare || []) {
      if (same(c.value, v) && yOk(c.year) && mOk(c.measure_id)) return comparePoint(c);
      for (const pp of c.parts || []) if (same(pp.value, v) && yOk(c.year)) return partPoint(pp, c);
    }
    if (!measure || measure === "ucdp_deaths_total") {
      const d = (S.violence_deaths || []).find((p) => same(p.value, v) && yOk(p.year));
      if (d) return point(d, "ucdp_deaths_total", `Deaths in organized violence in ${S.origin_name}, ${d.year}`);
    }
    const cmp = S.compare || [];
    for (const a of cmp) for (const b of cmp) {
      if (a !== b && yOk(a.year) && a.year === b.year && same(a.value - b.value, v)) return diffPoint(a, b);
    }
    return null;
  }

  return { S, SRC, MEAS, GLOSS, hostName, place, pointLabel, citeDetail, itemFromPoint, point, keyNumberPoint, comparePoint, resolve };
}

// =================================================================== the pop-out
let dlg = null;
let pop = null;
let state = null;     // { ctx, stack: [pt], style }

function build() {
  if (dlg) return;
  dlg = document.createElement("dialog");
  dlg.className = "tp";
  dlg.setAttribute("aria-labelledby", "tp-h");
  dlg.innerHTML = `<div class="tp__box"></div>`;
  document.body.append(dlg);
  pop = createPopout(dlg, { box: ".tp__box", sheetClass: "tp--sheet", onClosed: () => { state?.onClosed?.(); state = null; } });
  document.addEventListener("numfmt-change", () => {
    if (!dlg.open) return;
    applyNumbers(dlg);
    syncFmt();
  });
}
const syncFmt = () => dlg?.querySelectorAll("[data-tfmt]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tfmt === mode())));

/**
 * Open the trace for a figure.
 * @param pt      a figure (from ctx.resolve, ctx.point, a key number ...)
 * @param origin  { el, flyFrom, focusEl, rect }: where it opens from and where focus returns
 * @param ctx     traceContext(...)
 */
export async function openTrace(pt, origin, ctx, { onClosed } = {}) {
  build();
  if (dlg.open) return;
  state = { ctx, stack: [pt], style: "apa", onClosed };
  render();
  const box = dlg.querySelector(".tp__box");
  await pop.open(origin, { flyTo: box.querySelector(".tp__num"), stagger: staggerEls(), focus: dlg.querySelector("#tp-h") });
}

/** The collection page: open the trace for a saved item (its situation file is loaded first). */
export async function openTraceForItem(item, origin, opts) {
  const [S, srcList, glossary, measures] = await Promise.all([
    getJSON(`data/web/situation/${encodeURIComponent(item.situation_id)}.json`), loadSources(), loadGlossary(), loadMeasures()]);
  const ctx = traceContext(S, Object.fromEntries(srcList.map((x) => [x.id, x])), Object.fromEntries(measures.map((x) => [x.id, x])), glossary);
  const pct = item.unit === "percent";
  const pt = ctx.resolve(item.value, { year: item.year, pct, measure: item.measure_id })
    || ctx.resolve(item.value, { year: item.year, pct })
    || { value: item.value, unit: item.unit, year: item.year, measure_id: item.measure_id, source_id: item.source_id,
      raw_ref: item.raw_ref, label: item.label, place: item.place };
  return openTrace(pt, origin, ctx, opts);
}

const staggerEls = () => [...dlg.querySelectorAll(".tp__eyebrow, .tp__label, .tp__tools, [data-st]")];

function go(pt) {
  state.stack.push(pt);
  pop.swap(render, { stagger: staggerEls, focus: () => dlg.querySelector("#tp-h") });
}
function back() {
  if (state.stack.length < 2) return;
  state.stack.pop();
  pop.swap(render, { stagger: staggerEls, focus: () => dlg.querySelector("#tp-h") });
}

// ------------------------------------------------------------------ content
function render() {
  const { ctx, stack } = state;
  const pt = stack[stack.length - 1];
  const { S, SRC, MEAS, GLOSS } = ctx;
  const src = SRC[pt.source_id] || {};
  const m = MEAS[pt.measure_id] || {};
  const diff = pt.kind === "diff";
  const sum = !diff && SUM_RE.exec(pt.note || "");
  const value = pt.unit === "percent" ? pctHTML(pt.value) : numHTML(pt.value);
  const kind = pt.unit === "percent" ? "a share of two year-end figures" : m.kind === "flow" ? "a yearly count (flow)" : m.kind === "stock" ? "a year-end total (stock)" : "";
  const fns = (pt.footnote || "").split(";").filter(Boolean).map((f) => S.footnotes?.[f]).filter(Boolean);
  const glossaryId = GLOSS.find((g) => (g.measure_ids || []).includes(pt.measure_id))?.id;
  const item = diff ? null : { ...ctx.itemFromPoint(pt), what: pt.label.replace(/, (?:as on )?[\d-]{4,10}$/, "") };
  state.item = item;
  const srcs = diff ? [SRC[pt.a.source_id], SRC[pt.b.source_id]].filter(Boolean) : [src];
  const hasCompare = S.steps?.compare && document.getElementById("compare");

  const facts = diff ? `
      ${[pt.a, pt.b].some((x) => x.status === "to_confirm") ? `<p>${unverifiedTag()} <span class="small muted">One of the two figures is still to be confirmed against the original document.</span></p>` : ""}
      <dl class="tp__dl">
        <dt>Made from</dt><dd>${srcs.map((s) => `${esc(s.dataset)} <span class="muted">(${esc(s.organisation || "")}, ${esc(s.release || "")})</span>`).join("<br>")}</dd>
        <dt>What it is</dt><dd>The difference between two sources' figures for ${esc(pt.year)}. The sources count in different ways, so read it with “Why they differ” under Compare sources.</dd>
      </dl>` : `
      ${pt.status === "to_confirm" ? `<p>${unverifiedTag()}</p>${reviewNote("This figure is still to be confirmed against the original document.")}` : ""}
      <dl class="tp__dl">
        <dt>Dataset</dt><dd>${esc(src.dataset || pt.source_id)} <span class="muted">(${esc(src.release || "")})</span></dd>
        <dt>Published by</dt><dd>${esc(src.organisation || "")}</dd>
        <dt>Definition</dt><dd>${esc(m.label || "")}${kind ? `, ${kind}` : ""}. ${esc(m.plain || "")}
          ${glossaryId ? `<a href="learn.html#g-${glossaryId}">See glossary</a>` : ""}</dd>
        ${m.zero_note && pt.value === 0 ? `<dt>Note</dt><dd>${esc(m.zero_note)}</dd>` : ""}
        <dt>Footnote</dt><dd>${fns.length ? fns.map((f) => `<p class="small verbatim">${esc(f)}</p>`).join("") + '<p class="small muted">Quoted exactly as UNHCR wrote it.</p>'
          : sum ? "Footnotes, where the source gives them, belong to the individual rows." : "None for this row"}
          ${!fns.length && src.caveat ? `<p class="small">Dataset note (${esc(src.caveat_source || src.short || "")}): <span class="verbatim">“${esc(src.caveat)}”</span></p>` : ""}</dd>
        ${pt.as_of_date ? `<dt>Date</dt><dd>As on ${esc(pt.as_of_date)}</dd>` : ""}
      </dl>`;

  const box = dlg.querySelector(".tp__box");
  box.innerHTML = `
    <div class="tp__handle" data-drag aria-hidden="true"></div>
    <header class="tp__head" data-drag>
      <div class="tp__head-main">
        <p class="tp__eyebrow">${stack.length > 1 ? `<button class="linklike tp__back" type="button" data-back>&lsaquo; Back</button> · ` : ""}Where this number comes from</p>
        <h2 class="tp__h" id="tp-h" tabindex="-1"><span class="tp__num">${value}</span><span class="tp__label">${esc(pt.label)}</span></h2>
      </div>
      <div class="tp__tools">
        <div class="seg tp__fmt" role="group" aria-label="Number format">
          <button type="button" data-tfmt="ind" title="Indian format: lakh and crore">1,00,000</button>
          <button type="button" data-tfmt="intl" title="International format">100,000</button>
        </div>
        <button class="icon-btn tp__close" type="button" data-close aria-label="Close">${icon("close")}</button>
      </div>
    </header>
    <div class="tp__body">
      <div class="tp__cols">
        <div class="tp__col" data-st>
          ${facts}
          ${hasCompare ? `<p class="small tp__more"><a href="#compare" data-goto-compare>Compare with other sources &rsaquo;</a></p>` : ""}
        </div>
        <div class="tp__col">
          <section class="tp__sec" data-st data-made>${madeHTML(pt, ctx, sum)}</section>
          <section class="tp__sec" data-st>
            <div class="tp__sec-head"><h3 class="tp__sec-h">Cite</h3>
              <div class="seg seg--text tp__style" role="group" aria-label="Citation style">${Object.entries(STYLES).map(([k, l]) =>
                `<button type="button" data-style="${k}" aria-pressed="${k === state.style}">${l}</button>`).join("")}</div></div>
            <div class="tp__cite" id="tp-cite" aria-live="polite" aria-busy="true"><span class="muted">Preparing the citation…</span></div>
          </section>
        </div>
      </div>
    </div>
    <footer class="tp__bar" data-st>
      <div class="tp__actions">
        <button class="btn" type="button" data-copy>Copy citation</button>
        ${item ? `<button class="btn btn--primary" type="button" data-add data-pin-key="${esc(item.key)}">+ Add to collection</button>` : ""}
      </div>
      <div class="tp__links small">
        ${srcs.map((s) => (s.clean_file ? `<a href="${esc(s.clean_file)}" download>Download the clean data file (CSV)${srcs.length > 1 ? ` · ${esc(s.short)}` : ""}</a>` : "")).join("")}
        ${srcs.map((s) => `<a href="datasets.html#${esc(s.id)}">About this dataset${srcs.length > 1 ? ` · ${esc(s.short)}` : ""}</a>`).join("")}
      </div>
    </footer>`;
  applyNumbers(box);
  syncFmt();
  wire(box, pt);
  fillCite(pt);
  fillMade(pt, ctx, sum);
}

/** "Original row" for one row, or "How this number was made" for sums, shares and differences. */
function madeHTML(pt, ctx, sum) {
  const { S } = ctx;
  if (pt.kind === "diff") {
    return `<h3 class="tp__sec-h">How this number was made</h3>
      <p class="tp__formula">${input(pt.a, ctx.SRC[pt.a.source_id]?.short)} <span aria-label="minus">−</span> ${input(pt.b, ctx.SRC[pt.b.source_id]?.short)} = ${numHTML(pt.value)}</p>
      <p class="small muted">Both figures are for ${esc(pt.year)}. Select either one to see its own source.</p>`;
  }
  if (pt.unit === "percent" && pt.numerator !== undefined && pt.denominator !== undefined) {
    const parts = shareInputs(pt, ctx);
    return `<h3 class="tp__sec-h">How this number was made</h3>
      <p class="tp__formula">${parts.num ? input(parts.num, parts.numName) : `${esc(parts.numName)} ${numHTML(pt.numerator)}`}
        <span aria-label="divided by">÷</span> ${parts.den ? input(parts.den, "all host countries") : `all host countries ${numHTML(pt.denominator)}`}
        = ${pctHTML(pt.value)}</p>
      <p class="small muted">Both are UNHCR year-end figures for ${esc(pt.year)}, from the same release. Select either one to see its own source.</p>`;
  }
  if (pt.parts?.length) {
    return `<h3 class="tp__sec-h">How this number was made</h3>
      <p class="small">Sum of the ${pt.parts.length} parts given in the same answer:</p>
      <p class="tp__formula">${pt.parts.map((pp) => {
        const name = pp.label.replace(/ \(Govt\. of India\)/, "").toLowerCase();
        const p = ctx.resolve(pp.value, { year: pt.year, measure: pp.measure_id });
        return p ? input(p, name) : `${esc(name)} ${numHTML(pp.value)}`;
      }).join(' <span aria-label="plus">+</span> ')} = ${numHTML(pt.value)}</p>`;
  }
  if (sum) return `<h3 class="tp__sec-h">How this number was made</h3><div class="tp__rows" aria-busy="true"><p class="small muted">Loading the rows…</p></div>`;
  if (pt.raw_ref || pt.hostIso) return `<h3 class="tp__sec-h">Original row</h3><div class="tp__raw" aria-busy="true"><p class="small muted">Loading the original row…</p></div>`;
  if (pt.note) return `<h3 class="tp__sec-h">How this number was made</h3><p class="small">${esc(pt.note)}.</p>`;
  return `<h3 class="tp__sec-h">Original row</h3><p class="small muted">No row reference for this figure.</p>`;
}

function shareInputs(pt, ctx) {
  const { S } = ctx;
  let num = null;
  let numName = ctx.place();
  if (pt.numHost) {
    num = { value: pt.numerator, unit: "people", year: pt.year, measure_id: S.main_measure, source_id: "unhcr-pop-2026", raw_ref: null,
      hostIso: pt.numHost, place: ctx.hostName(pt.numHost), label: `${LABEL[S.main_measure] || ""} from ${S.origin_name} in ${ctx.hostName(pt.numHost)}, ${pt.year}` };
    numName = ctx.hostName(pt.numHost);
  } else {
    num = ctx.resolve(pt.numerator, { year: pt.year, measure: S.main_measure });
  }
  const den = ctx.resolve(pt.denominator, { year: pt.year, measure: S.main_measure });
  return { num, numName, den };
}

let inputs = [];
function input(p, name) {
  if (!p) return "";
  inputs.push(p);
  return `<button class="num-link tp__input" type="button" data-input="${inputs.length - 1}"><span class="tp__input-name">${esc(name || "")}</span> ${numHTML(p.value)}<span class="sr-only">: see where this number comes from</span></button>`;
}

async function fillMade(pt, ctx, sum) {
  const sec = dlg.querySelector("[data-made]");
  const token = state;
  if (sum) {
    const el = sec.querySelector(".tp__rows");
    const html = await rowsHTML(pt, ctx, sum).catch((e) => { console.warn(e); return `<p class="small">${esc(pt.note)}.</p>`; });
    if (state !== token || !el.isConnected) return;
    el.innerHTML = html;
    el.removeAttribute("aria-busy");
    applyNumbers(el);
    el.querySelector("[data-show-all]")?.addEventListener("click", (e) => {
      el.querySelectorAll("tr[hidden]").forEach((r) => { r.hidden = false; });
      e.currentTarget.remove();
    });
    return;
  }
  const el = sec.querySelector(".tp__raw");
  if (!el) return;
  const html = await rawHTML(pt, ctx).catch((e) => { console.warn(e); return `<p class="small muted">The original row could not be loaded.</p>`; });
  if (state !== token || !el.isConnected) return;
  el.innerHTML = html;
  el.removeAttribute("aria-busy");
}

/** The rows a labelled sum was made from (data/web/rows/<origin>-<measure>.json). */
async function rowsHTML(pt, ctx, sum) {
  const { S, SRC, MEAS } = ctx;
  const n = +sum[1];
  const fileMeasure = ROWS_FILE[pt.measure_id] || pt.measure_id;
  const [doc, names] = await Promise.all([getJSON(`data/web/rows/${S.origin_iso3.toLowerCase()}-${fileMeasure}.json`), loadCountries()]);
  let rows = doc.years[String(pt.year)] || [];
  const codes = /\(([A-Z]{3}(?:, [A-Z]{3})*)\)/.exec(pt.note || "")?.[1]?.split(", ");
  if (codes) rows = rows.filter((r) => codes.includes(r[0]));
  else if (S.type === "named" && fileMeasure === "returns" && !pt.allHosts) rows = rows.filter((r) => S.hosts.includes(r[0]));
  const total = rows.reduce((a, r) => a + r[1], 0);
  if (rows.length !== n || total !== pt.value) {          // never show a list that doesn't add up to the figure
    console.warn("rows do not match", pt, rows.length, total);
    return `<p class="small">${esc(pt.note)}.</p>`;
  }
  const word = (LABEL[pt.measure_id] || MEAS[pt.measure_id]?.label || "").toLowerCase();
  const isEvent = sum[2] === "disaster events";
  const nm = (iso) => names[iso]?.name || iso;
  const where = codes ? codes.map(nm).join(" and ") : null;
  const what = isEvent ? `${MEAS[pt.measure_id]?.label || "disaster displacement"} in ${S.origin_name}, one row per disaster event`
    : fileMeasure === "returns" ? `refugees who returned to ${S.origin_name}, one row per country they returned from`
      : `${word} from ${S.origin_name} in ${where || "each host country"}`;
  const file = doc.file.replace("{year}", pt.year);
  const zeros = rows.some((r) => r[1] === 0) && MEAS[pt.measure_id]?.zero_note;
  const src = SRC[doc.source_id] || {};
  return `<p class="small"><strong>Sum of ${numHTML(n)} rows:</strong> ${esc(what)}, ${esc(pt.year)}. Lines are in <span class="tp__ref">${esc(file)}</span>.</p>
    <div class="table-wrap tp__rows-wrap"><table class="table tp__rows-table">
      <thead><tr><th scope="col">${isEvent ? "Hazard" : "Host country"}</th><th scope="col" class="num">${isEvent ? "Value" : esc(LABEL[pt.measure_id] || "Value")}</th><th scope="col">Line</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr${i >= 10 ? " hidden" : ""}><th scope="row">${esc(isEvent ? r[0] : nm(r[0]))}</th><td class="num">${numHTML(r[1])}</td><td class="tp__ref" title="${esc(file)}#L${r[2]}">L${r[2]}</td></tr>`).join("")}</tbody>
      <tfoot><tr><th scope="row">Total</th><td class="num">${numHTML(total)}</td><td></td></tr></tfoot>
    </table></div>
    ${rows.length > 10 ? `<button class="linklike small" type="button" data-show-all>Show all ${numHTML(rows.length)} rows</button>` : ""}
    ${zeros ? `<p class="small muted">${esc(zeros)}</p>` : ""}
    ${src.clean_file ? `<p class="small"><a href="${esc(src.clean_file)}" download>The rows are in the clean data file (CSV)</a></p>` : ""}`;
}

/** One original row, from this situation's file or (for a host's own figure) the pair situation's file. */
async function rawHTML(pt, ctx) {
  const { S } = ctx;
  let ref = pt.raw_ref;
  let rawRows = S.raw_rows || {};
  let rawFiles = S.raw_files || {};
  if (!ref && pt.hostIso) {
    const doc = await getJSON(`data/web/rows/${S.origin_iso3.toLowerCase()}-${pt.measure_id}.json`);
    const r = (doc.years[String(pt.year)] || []).find((x) => x[0] === pt.hostIso && same(x[1], pt.value));
    if (r) ref = `${doc.file.replace("{year}", pt.year)}#L${r[2]}`;
  }
  if (!ref) return `<p class="small muted">No row reference for this figure.</p>`;
  if (!rawRows[ref] && pt.hostIso) {
    const pair = await getOptionalJSON(`data/web/situation/${S.origin_iso3.toLowerCase()}-${pt.hostIso.toLowerCase()}.json`);
    if (pair?.raw_rows?.[ref]) { rawRows = pair.raw_rows; rawFiles = pair.raw_files; }
  }
  const raw = rawRows[ref];
  const rawFile = raw && rawFiles[raw.file_key];
  if (!raw || !rawFile) {
    const [f, line] = ref.split("#L");
    return `<p class="small">${esc(f)}, line ${esc(line)}.</p><p class="small muted">The row is in the clean data file, with this reference in its raw_ref column.</p>`;
  }
  const hi = rawFile.header.map((h, i) => String(raw.row[i]).replace(/,/g, "") === String(pt.value));
  return `<div class="raw"><table class="table raw__table"><thead><tr><th scope="col">Column</th><th scope="col">Value in the source file</th></tr></thead>
      <tbody>${rawFile.header.map((h, i) => `<tr class="${hi[i] ? "hi" : ""}"><th scope="row">${esc(h)}</th><td>${esc(raw.row[i] ?? "")}</td></tr>`).join("")}</tbody></table></div>
    <p class="small muted">${esc(rawFile.label)}, line ${raw.line}. Shown exactly as in the file.</p>`;
}

function citations(pt) {
  const { ctx, style } = state;
  if (pt.kind === "diff") {
    return Promise.all([pt.a, pt.b].map((p) => cite(ctx.SRC[p.source_id]?.csl, style, ctx.citeDetail(p))))
      .then((cs) => ({ text: cs.map((c) => c.text).join("\n"), html: cs.map((c) => `<p>${c.html}</p>`).join("") }));
  }
  return cite(ctx.SRC[pt.source_id]?.csl, style, ctx.citeDetail(pt));
}

function fillCite(pt) {
  const token = state;
  const style = state.style;
  state.cite = citations(pt);
  state.cite.then((c) => {
    const el = dlg.querySelector("#tp-cite");
    if (state !== token || state.style !== style || !el) return;
    el.innerHTML = c.html || '<span class="muted">No citation for this source.</span>';
    el.removeAttribute("aria-busy");
  });
}

function wire(box, pt) {
  box.querySelector("[data-close]").addEventListener("click", () => pop.close());
  box.querySelector("[data-back]")?.addEventListener("click", back);
  box.querySelectorAll("[data-tfmt]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.tfmt)));
  box.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => {
    state.style = b.dataset.style;
    box.querySelectorAll("[data-style]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const el = box.querySelector("#tp-cite");
    el.setAttribute("aria-busy", "true");
    fillCite(pt);
  }));
  const myInputs = inputs;
  inputs = [];
  box.querySelector(".tp__body").addEventListener("click", (e) => {        // (the body is new on every render)
    const i = e.target.closest("[data-input]");
    if (i) go(myInputs[+i.dataset.input]);
  });
  const copy = box.querySelector("[data-copy]");
  let timer;
  copy.addEventListener("click", async () => {
    const c = await state.cite;
    clearTimeout(timer);
    try { await navigator.clipboard.writeText(c.text); copy.textContent = "Copied ✓"; } catch { copy.textContent = "Select and copy the text above"; }
    timer = setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy citation"; }, 2000);
  });
  const add = box.querySelector("[data-add]");
  if (add) {
    const label = () => { add.textContent = has(state.item.key) ? "Pinned ✓" : "+ Add to collection"; };
    add.addEventListener("click", () => {
      pin(state.item, add);
      label();
      syncPins(document);
    });
    syncPins(box);
    label();
  }
  box.querySelector("[data-goto-compare]")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await pop.close();
    document.getElementById("compare")?.scrollIntoView({ behavior: "smooth" });
  });
  if (phoneWidth()) box.querySelector(".tp__fmt")?.classList.add("seg--compact");
}

// =================================================================== numbers in text
/**
 * Turn the live numbers under `root` that are dataset figures into buttons that open their trace.
 * A number that is not a dataset figure (e.g. a count worked out on the page) stays plain text.
 */
export function linkNumbers(root, ctx, open) {
  root.querySelectorAll("[data-num], [data-pct]").forEach((span) => {
    if (span.closest("button, a, .tp, [data-no-trace]")) return;
    const pct = span.hasAttribute("data-pct");
    const value = Number(pct ? span.dataset.pct : span.dataset.num);
    const year = span.dataset.year ? Number(span.dataset.year) : null;
    const pt = ctx.resolve(value, { year, pct });
    if (!pt) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "num-link";
    span.replaceWith(b);
    b.append(span);
    b.insertAdjacentHTML("beforeend", '<span class="sr-only">: see where this number comes from</span>');
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      open(pt, { el: b, flyFrom: span });
    });
  });
}
