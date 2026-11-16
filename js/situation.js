// Situation page: header, step rail, mini globe and the ten steps (walkthrough screens 3 to 12).
import { initPage, guideTip } from "./layout.js";
import { getJSON, getOptionalJSON, sources as loadSources, tips as loadTips, glossary as loadGlossary, measures as loadMeasures } from "./data.js";
import { esc, fmt, numHTML, pctHTML, fillTemplate, applyNumbers } from "./format.js";
import { icon } from "./icons.js";
import { renderMiniGlobe } from "./minimap.js";
import { chartBlock, Plot, base, C, MEASURE_COLOR, yearAt, MARGIN } from "./charts.js";
import { openPopover, openPanel, closePanel, bindGlossary } from "./popouts.js";
import { pin, syncPins } from "./collection.js";
import { cite, referenceList, loadCiteEngine } from "./cite.js";

export const STEPS = [
  ["brief", "Brief"], ["key_numbers", "Key numbers"], ["over_time", "Over time"],
  ["where_people_are", "Where people are"], ["inside_outside", "Inside vs outside"],
  ["compare", "Compare sources"], ["context", "Context"], ["other_angles", "Other angles"],
  ["limitations", "Limitations"], ["sources", "Sources & reading"],
];
const anchor = (k) => k.replace(/_/g, "-");
const TYPE_LABEL = { pair: "Situation", named: "Situation", origin: "Group", idp: "Internal displacement" };
const CORRELATION = "Shows timing and patterns, not proven causes.";
const LABEL = {
  refugees: "Refugees", asylum_seekers: "Asylum seekers", oip: "Other people in need of international protection",
  idps_unhcr: "IDPs (UNHCR)", idps_idmc_conflict: "IDPs, conflict (IDMC)", idps_idmc_disaster: "IDPs, disasters (IDMC)",
};

let S;            // situation
let SRC = {};     // sources by id
let MEAS = {};    // measures by id
let GLOSS = [];
let REFS = {};    // readings by id

initPage({ page: "situation" });
document.body.classList.add("page-situation");
main().catch((e) => {
  console.error(e);
  document.getElementById("main").innerHTML = `<div class="page"><div class="empty-state" style="margin-top:48px">
    <h3>We couldn't open this situation</h3><p class="muted">${esc(e.status === 404 ? "There is no situation with this id." : e.message)}</p>
    <p><a href="index.html">Back to search</a> · <a href="request.html">Request data</a></p></div></div>`;
});

async function main() {
  const id = new URLSearchParams(location.search).get("id") || "lka-ind";
  const briefIds = (await getOptionalJSON("data/briefs/index.json")) || [];
  const [s, srcList, tips, glossary, measures, refs, brief] = await Promise.all([
    getJSON(`data/web/situation/${encodeURIComponent(id)}.json`), loadSources(), loadTips(), loadGlossary(), loadMeasures(),
    getJSON("data/web/references.json"),
    briefIds.includes(id) ? getOptionalJSON(`data/briefs/${encodeURIComponent(id)}.json`) : null,
  ]);
  S = s;
  SRC = Object.fromEntries(srcList.map((x) => [x.id, x]));
  MEAS = Object.fromEntries(measures.map((x) => [x.id, x]));
  REFS = Object.fromEntries(refs.map((x) => [x.id, x]));
  GLOSS = glossary;
  document.title = `${s.title} · Refugee Finder`;
  const steps = STEPS.filter(([k]) => s.steps?.[k] !== false);

  const mainEl = document.getElementById("main");
  mainEl.innerHTML = `
    <div class="page">
      <div class="sit">
        <nav class="sit__rail rail" aria-label="Steps on this page">
          <p class="rail__title">On this page</p>
          <ol>${steps.map(([k, l]) => `<li><a href="#${anchor(k)}" data-step="${k}">${l}</a></li>`).join("")}</ol>
        </nav>
        <header class="sit__head">${headHTML()}</header>
        <aside class="sit__side">
          <figure class="mini-globe" id="mini-globe" aria-busy="true" style="margin:0"><div style="aspect-ratio:1"></div></figure>
          ${guideTip(tips.brief, "#key-numbers", "Key numbers")}
        </aside>
        <div class="sit__main">
          ${steps.map(([k, l], i) => `<section class="step" id="${anchor(k)}" aria-labelledby="h-${k}">
              <div class="step__head"><h2 class="step__title" id="h-${k}">${l}</h2></div>
              ${k !== "brief" && tips[k] ? guideTip(tips[k], steps[i + 1] ? `#${anchor(steps[i + 1][0])}` : null, steps[i + 1]?.[1]) : ""}
              <div class="step__body" data-body="${k}"></div></section>`).join("")}
        </div>
      </div>
    </div>`;

  const render = {
    brief: () => briefHTML(brief), key_numbers: keyNumbers, over_time: overTime, where_people_are: wherePeople,
    inside_outside: insideOutside, compare: compareSources, context, other_angles: otherAngles,
    limitations: limitationsHTML, sources: sourcesHTML,
  };
  for (const [k] of steps) {
    const body = mainEl.querySelector(`[data-body="${k}"]`);
    try {
      const out = render[k](body);
      if (typeof out === "string") body.innerHTML = out;
    } catch (e) {
      console.error(k, e);
      body.innerHTML = `<p class="muted">This step could not be shown.</p>`;
    }
  }
  applyNumbers(mainEl);
  bindGlossary(mainEl, GLOSS);
  wirePins(mainEl);
  syncPins(mainEl);
  setupRail();

  const hosts = s.type === "named" ? s.hosts : s.host_iso3 ? [s.host_iso3] : [];
  renderMiniGlobe(document.getElementById("mini-globe"), {
    origin: s.origin_iso3, hosts, originName: s.origin_name,
    hostNames: s.type === "named" ? hosts.map((h) => s.hosts_latest.find((x) => x.host_iso3 === h)?.name || h) : [s.host_name].filter(Boolean),
  }).then(() => document.getElementById("mini-globe").removeAttribute("aria-busy"))
    .catch((e) => { console.error(e); document.getElementById("mini-globe").innerHTML = '<p class="small muted">Map could not load.</p>'; });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  setTimeout(() => loadCiteEngine(), 2000);          // get citations ready in the background
}

// =================================================================== helpers
const place = () => (S.type === "pair" ? S.host_name : S.type === "named" ? S.hosts.map((h) => hostName(h)).join(" and ") : S.origin_name);
const hostName = (iso) => S.hosts_latest.find((x) => x.host_iso3 === iso)?.name || (iso === S.host_iso3 ? S.host_name : iso);
const srcShort = (id) => SRC[id]?.short || id;
const series = (k) => S.series?.[k] || [];
const yearsRange = (pts) => (pts.length ? [pts[0].year, pts[pts.length - 1].year] : null);
const plainTitle = (t) => fillTemplate(t, { plain: true });

function sourceLine(ids, extra = "") {
  const uniq = [...new Set(ids)].filter(Boolean);
  return `Source: ${uniq.map((id) => `${esc(SRC[id]?.organisation?.split(" (")[0] || id)}, ${esc(SRC[id]?.dataset?.split(":")[0] || "")} (${esc(SRC[id]?.release?.split(" (")[0] || "")})`).join("; ")}${extra ? `. ${extra}` : ""}`;
}

/** A traceable figure: everything the source-trace panel and the collection need. */
function point(p, measure, label, extra = {}) {
  return { value: p.value, unit: "people", year: p.year, measure_id: measure, source_id: p.source_id, footnote: p.footnote,
    raw_ref: p.raw_ref, note: p.note, label, ...extra };
}

const INSIDE = ["idps_unhcr", "idps_idmc_conflict", "idps_idmc_disaster", "idmc_conflict_new", "idmc_disaster_new"];
function pointLabel(measure, year, hostIso = null) {
  if (hostIso) return `${S.title.split(" in ")[0]} in ${hostName(hostIso)}, ${year}`;
  if (S.type === "pair" && measure === S.main_measure) return `${S.title}, ${year}`;
  if (S.type === "origin" && measure === S.main_measure) return `${S.title}, ${year}`;
  const what = LABEL[measure] || MEAS[measure]?.label || measure;
  if (INSIDE.includes(measure)) return `${what} in ${S.origin_name}, ${year}`;
  if (S.type === "pair") return `${what} from ${S.origin_name} in ${S.host_name}, ${year}`;
  return `${what} from ${S.origin_name}, ${year}`;
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

function citeDetail(pt) {
  if (S.type === "pair") return `${S.origin_name} to ${S.host_name}, ${pt.year}`;
  if (S.type === "named") return `${S.origin_name} to ${S.hosts.map(hostName).join(" and ")}, ${pt.year}`;
  return `${S.origin_name}, ${pt.year}`;
}

// =================================================================== source trace (screen 7)
function openTrace(pt) {
  const src = SRC[pt.source_id] || {};
  const m = MEAS[pt.measure_id] || {};
  const kind = pt.unit === "percent" ? "a share of two year-end figures" : m.kind === "flow" ? "a yearly count (flow)" : m.kind === "stock" ? "a year-end total (stock)" : "";
  const fns = (pt.footnote || "").split(";").filter(Boolean).map((f) => S.footnotes?.[f]).filter(Boolean);
  const raw = pt.raw_ref && S.raw_rows?.[pt.raw_ref];
  const rawFile = raw && S.raw_files?.[raw.file_key];
  let rowHTML = "";
  if (raw && rawFile) {
    const hi = rawFile.header.map((h, i) => String(raw.row[i]).replace(/,/g, "") === String(pt.value));
    rowHTML = `<p class="eyebrow">Original row</p>
      <div class="raw"><table class="table raw__table"><thead><tr><th scope="col">Column</th><th scope="col">Value in the source file</th></tr></thead>
      <tbody>${rawFile.header.map((h, i) => `<tr class="${hi[i] ? "hi" : ""}"><th scope="row">${esc(h)}</th><td>${esc(raw.row[i] ?? "")}</td></tr>`).join("")}</tbody></table></div>
      <p class="small muted">${esc(rawFile.label)}, line ${raw.line}. Shown exactly as in the file.</p>`;
  } else if (pt.note || pt.unit === "percent") {
    rowHTML = `<p class="eyebrow">How this figure was worked out</p><p class="small">${pt.unit === "percent"
      ? `${numHTML(pt.numerator)} divided by ${numHTML(pt.denominator)}, both UNHCR year-end figures for ${pt.year}.`
      : `${esc(pt.note)} (${esc(src.dataset || "")}). The rows are in the clean data file below.`}</p>`;
  }
  const citeP = cite(src.csl, "apa", citeDetail(pt));
  const value = pt.unit === "percent" ? pctHTML(pt.value) : numHTML(pt.value);
  const glossaryId = GLOSS.find((g) => (g.measure_ids || []).includes(pt.measure_id))?.id;
  const hasCompare = S.steps?.compare;
  const item = { ...itemFromPoint(pt), what: pt.label.replace(/, (?:as on )?[\d-]{4,10}$/, "") };
  const body = `
    <p class="trace__value">${value}</p>
    <p class="trace__label">${esc(pt.label)}</p>
    ${pt.status === "to_confirm" ? `<p class="note">${icon("alert", { size: 16 })}<span>This figure is still to be confirmed against the original document.</span></p>` : ""}
    <dl class="trace__dl">
      <dt>Dataset</dt><dd>${esc(src.dataset || pt.source_id)} <span class="muted">(${esc(src.release || "")})</span></dd>
      <dt>Published by</dt><dd>${esc(src.organisation || "")}</dd>
      <dt>Definition</dt><dd>${esc(MEAS[pt.measure_id]?.label || "")}${kind ? `, ${kind}` : ""}. ${esc(m.plain || "")}
        ${glossaryId ? `<a href="learn.html#g-${glossaryId}">See glossary</a>` : ""}</dd>
      ${m.zero_note && pt.value === 0 ? `<dt>Note</dt><dd>${esc(m.zero_note)}</dd>` : ""}
      <dt>Footnote</dt><dd>${fns.length ? fns.map((f) => `<p class="small verbatim">${esc(f)}</p>`).join("") + '<p class="small muted">Quoted exactly as UNHCR wrote it.</p>' : "None for this row"}</dd>
      ${pt.as_of_date ? `<dt>Date</dt><dd>As on ${esc(pt.as_of_date)}</dd>` : ""}
    </dl>
    ${rowHTML}
    <p class="eyebrow" style="margin-top:20px">Cite (APA)</p>
    <p class="trace__cite" id="trace-cite" aria-busy="true"><span class="muted">Preparing the citation…</span></p>
    <div class="trace__actions">
      <button class="btn" type="button" data-copy>Copy citation</button>
      <button class="btn btn--primary" type="button" data-pin-key="${esc(item.key)}" data-add>+ Add to collection</button>
    </div>
    <p style="margin-top:16px" class="small">
      ${hasCompare ? `<a href="#compare" data-goto-compare>Compare with other sources &rsaquo;</a><br>` : ""}
      ${src.clean_file ? `<a href="${esc(src.clean_file)}" download>Download the clean data file (CSV)</a> · ` : ""}<a href="datasets.html#${esc(pt.source_id)}">About this dataset</a>
    </p>`;
  openPanel("Where this number comes from", body, {
    onOpen: (panel) => {
      applyNumbers(panel);
      syncPins(panel);
      citeP.then((c) => {
        const el = panel.querySelector("#trace-cite");
        if (el) { el.innerHTML = c.html; el.removeAttribute("aria-busy"); }
      });
      panel.querySelector("[data-copy]").addEventListener("click", async (e) => {
        const c = await citeP;
        try { await navigator.clipboard.writeText(c.text); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy the text above"; }
      });
      panel.querySelector("[data-add]").addEventListener("click", (e) => {
        pin(item, e.currentTarget);
        e.currentTarget.textContent = e.currentTarget.getAttribute("aria-pressed") === "true" ? "✓ In your collection" : "+ Add to collection";
        syncPins(document);
      });
      if (panel.querySelector("[data-add]").getAttribute("aria-pressed") === "true") panel.querySelector("[data-add]").textContent = "✓ In your collection";
      panel.querySelector("[data-goto-compare]")?.addEventListener("click", (e) => { e.preventDefault(); closePanel(); document.getElementById("compare").scrollIntoView(); });
    },
  });
}

// =================================================================== header
function headHTML() {
  const shorts = [];
  for (const d of S.datasets) {
    const sh = SRC[d]?.short;
    if (sh && !shorts.includes(sh) && sh !== "UN M49") shorts.push(sh);
  }
  const nRead = S.reading?.length || 0;
  const years = S.years ? `${S.years[0]} to ${S.years[1]}` : "years not known";
  return `
    <h1 class="sit-title" id="sit-title">${esc(S.title)}</h1>
    <p class="sit-meta"><span>${TYPE_LABEL[S.type] || "Situation"}</span><span class="sep" aria-hidden="true">·</span>
      <span class="tabular">${years}</span><span class="sep" aria-hidden="true">·</span><span>${esc(S.region || "")}</span>
      ${S.status === "verified" ? `<span class="status status--verified" title="${esc(S.status_note || "")}">Numbers checked</span>` : ""}
    </p>
    <div class="sit-badges" aria-label="Sources used">
      ${shorts.map((sh) => `<a class="badge" href="#sources">${esc(sh)}</a>`).join("")}
      ${nRead ? `<a class="badge" href="#sources">+ readings (${nRead})</a>` : ""}
    </div>
    ${S.note ? `<p class="sit-note small muted">${esc(S.note)}</p>` : ""}`;
}

// =================================================================== 3 brief
function briefHTML(brief) {
  if (!brief || brief.status === "failed_check") {
    return `<div class="empty-state">
      <h3>Brief coming soon</h3>
      <p class="muted" style="margin:0">A plain-language summary (what happened, why people moved, when and how) has not been written for this situation yet.
      The numbers below still work, and every one of them links to its source.</p></div>`;
  }
  const srcs = brief.sources || [];
  const marker = (ids) => (ids || []).map((id) => {
    const n = srcs.indexOf(id) + 1;
    return n ? `<a class="cite" href="#sources" title="${esc(SRC[id]?.short || REFS[id]?.authors || id)}">[${n}]</a>` : "";
  }).join("");
  const part = (p) => {
    const v = brief[p];
    if (!v) return "";
    const sentences = Array.isArray(v) ? v : [{ text: v, source_ids: brief.part_sources?.[p] || srcs.slice(0, 1) }];
    const one = (x) => `${liveNumbers(x.text)}${marker(x.source_ids)}`;
    const rest = sentences.slice(1);
    return `<div class="brief__k">${p.toUpperCase()}</div><div class="brief__v">${one(sentences[0])}${rest.length
      ? ` <span class="brief__rest" hidden>${rest.map(one).join(" ")}</span>` : ""}</div>`;
  };
  const label = brief.status === "checked" ? `Checked by ${esc(brief.checked_by || "the team")}` : "";
  const more = brief.more ? `<details class="brief__more"><summary>Read more</summary><div class="brief__v">${esc(brief.more)}</div></details>` : "";
  const anyRest = ["what", "why", "when", "how"].some((p) => Array.isArray(brief[p]) && brief[p].length > 1);
  return `<div class="brief" id="brief-body">${["what", "why", "when", "how"].map(part).join("")}</div>${more}
    ${anyRest ? `<button class="linklike brief__toggle" type="button" aria-expanded="false" aria-controls="brief-body"
      onclick="const open=this.getAttribute('aria-expanded')!=='true';this.setAttribute('aria-expanded',open);this.textContent=open?'Show less ⌃':'Read more ⌄';document.querySelectorAll('#brief-body .brief__rest').forEach(e=>e.hidden=!open)">Read more ⌄</button>` : ""}
    ${label ? `<p style="margin-top:16px"><span class="brief-label">${icon("info", { size: 14 })}${label}</span></p>` : ""}
    <p class="small muted" style="margin-top:16px">Sources: ${srcs.map((id, i) => `[${i + 1}] ${esc(SRC[id]?.short || REFS[id]?.authors + " " + (REFS[id]?.year || "") || id)}`).join(" · ")}</p>`;
}

/** Brief text with its counts turned into live numbers (so the Indian / international switch reaches them).
 *  Years (1900-2099 without separators) and decimals are left as written. */
function liveNumbers(text) {
  return String(text).split(/(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    if (part.includes(".")) return esc(part);
    const n = Number(part.replace(/,/g, ""));
    const isYear = !part.includes(",") && /^(19|20)\d{2}$/.test(part);
    return isYear || n < 1000 ? esc(part) : numHTML(n);
  }).join("");
}

// =================================================================== 4-5 key numbers + explainer
function termFor(label) {
  for (const g of GLOSS) {
    const w = g.term.split(" (")[0];
    for (const cand of [w + "s", w]) {
      const re = new RegExp(`\\b${cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(label)) return esc(label).replace(re, (x) => `<span class="term" tabindex="0" data-term="${g.id}">${x}</span>`);
    }
  }
  return esc(label);
}

function keyNumbers(el) {
  if (!S.key_numbers.length) return `<p class="muted">No key numbers for this situation.</p>`;
  const pts = S.key_numbers.map((kn) => ({ ...kn, label: kn.label, unit: kn.unit, value: kn.value }));
  el.innerHTML = `<div class="card-grid">${pts.map((kn, i) => {
    const value = kn.unit === "percent" ? pctHTML(kn.value) : numHTML(kn.value);
    const item = itemFromPoint({ ...kn, label: `${kn.label}${kn.label.includes(String(kn.year)) ? "" : ` (${kn.year})`}` });
    return `<article class="card kn" aria-labelledby="kn-${i}">
      <div class="kn__label" id="kn-${i}">${termFor(kn.label)}</div>
      <span class="kn__help"><button class="help-btn" type="button" data-explain="${i}" aria-label="What does this number mean?" aria-haspopup="dialog">?</button></span>
      <button class="kn__value" type="button" data-trace="${i}" aria-label="${esc(kn.label)}: where this number comes from">${value}</button>
      <div class="kn__sub">${esc(kn.sub)}${kn.unit === "movements" ? " · counts movements, not people" : ""}</div>
      <div class="kn__foot">
        <a class="kn__src" href="#" data-trace="${i}">Source: ${esc(srcShort(kn.source_id))}</a>
        <button class="pin-btn" type="button" data-pin-key="${esc(item.key)}" data-pin-idx="${i}" aria-pressed="false" aria-label="Add ${esc(kn.label)} to my collection">${icon("pin", { size: 16 })}</button>
      </div>
    </article>`;
  }).join("")}</div>`;
  el._items = pts.map((kn) => ({ ...itemFromPoint({ ...kn, label: `${kn.label}${kn.label.includes(String(kn.year)) ? "" : ` (${kn.year})`}` }), what: whatOf(kn) }));
  el.querySelectorAll("[data-trace]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const kn = pts[+b.dataset.trace];
    openTrace({ ...kn, label: `${kn.label}${kn.label.includes(String(kn.year)) ? "" : ` (${kn.year})`}` });
  }));
  el.querySelectorAll("[data-explain]").forEach((b) => b.addEventListener("click", () => openExplainer(pts[+b.dataset.explain], b)));
  el.querySelectorAll("[data-pin-idx]").forEach((b) => b.addEventListener("click", () => pin(el._items[+b.dataset.pinIdx], b)));
}

/** "What it measures" for the collection table (the year has its own column). */
function whatOf(kn) {
  const subject = S.type === "pair" || S.type === "origin" ? S.title : S.type === "named" ? S.title : `IDPs in ${S.origin_name}`;
  if (kn.unit === "percent") return kn.label.startsWith("Share of all") ? `${kn.label} living in ${place()}` : `${kn.label}: share of ${S.title.split(",")[0]}`;
  if (kn.label.startsWith("Peak")) return `Peak, ${subject}`;
  if (kn.label.startsWith("In ")) return `${subject}, first year in the data`;
  if (S.type === "named") return `${S.title.split(" in ")[0]} in ${kn.label.match(/in ([^,]+),/)?.[1] || place()}`;
  if (S.type === "idp") return kn.label.replace(/, \d{4}$/, "") + ` in ${S.origin_name}`;
  return subject;
}

function openExplainer(kn, anchorEl) {
  const e = kn.explainer || {};
  const fillN = (t) => fillTemplate({ text: t || "", nums: kn.nums || [] });
  openPopover(`<div class="explain">
      <h3 class="explain__h">What this number means</h3>
      <h4>What is counted</h4><p>${fillN(e.counted)}</p>
      <h4>Type of figure</h4><p>${esc(e.type)}</p>
      <h4>Not included</h4><p>${esc(e.not_included || "Not stated.")}</p>
      <h4>How reliable</h4><p>${esc(e.reliability || "Not stated.")}</p>
      ${e.to_check ? `<p class="small muted">Team note: ${esc(e.to_check)}</p>` : ""}
      <a href="learn.html#stocks-flows">Learn: stocks vs flows &rsaquo;</a></div>`, anchorEl, { label: "What this number means", wide: true });
  applyNumbers(document.getElementById("pop"));
}

// =================================================================== 6 over time
function mainLines() {
  if (S.type === "idp") {
    return [["idps_idmc_conflict", "IDMC (conflict)"], ["idps_unhcr", "UNHCR"]]
      .filter(([k]) => series(k).length).map(([k, lab]) => ({ key: k, label: lab, color: C.idp, dash: k === "idps_unhcr" ? "4,3" : null, pts: series(k) }));
  }
  if (S.type === "named") {
    return Object.entries(S.series.by_host || {}).map(([h, pts], i) => ({ key: `host:${h}`, measure: S.main_measure, label: hostName(h), color: i ? C.oip : C.refugees, pts }));
  }
  return [{ key: S.main_measure, measure: S.main_measure, label: LABEL[S.main_measure], color: MEASURE_COLOR[S.main_measure] || C.refugees, pts: series(S.main_measure) }];
}

function overTime(el) {
  const lines = mainLines().filter((l) => l.pts.length);
  if (!lines.length) return `<p class="muted">No yearly figures for this situation.</p>`;
  const all = lines.flatMap((l) => l.pts.map((p) => ({ ...p, line: l.label, key: l.key })));
  const yrs = all.map((p) => p.year);
  const domain = [Math.min(...yrs, ...eventYears()), Math.max(...yrs)];
  const conflictYears = [...new Set(S.conflict.map((c) => c.year))].filter((y) => y >= domain[0] - 0 && y <= domain[1]);
  const single = lines.length === 1;
  const title = S.headlines?.over_time ? fillTemplate(S.headlines.over_time) : esc(S.title);
  const host = document.createElement("div");
  el.append(host);
  chartBlock(host, {
    id: `${S.id}-over-time`, filename: `${S.id}_over_time`, title,
    summary: `${plainTitle(S.headlines?.over_time || S.title)}. Line chart of ${lines.map((l) => l.label).join(" and ")}, ${domain[0]} to ${domain[1]}.`,
    source: sourceLine(lines.flatMap((l) => l.pts.map((p) => p.source_id)), conflictYears.length ? "Conflict years: UCDP/PRIO Armed Conflict Dataset v26.1" : ""),
    pin: { key: `chart:${S.id}:over_time` },
    draw: (w) => {
      const wrap = document.createElement("div");
      const marks = [
        Plot.ruleY([0], { stroke: "var(--line-strong)" }),
        ...(single ? [Plot.areaY(all, { x: "year", y: "value", fill: lines[0].color, fillOpacity: 0.14, curve: "linear" })] : []),
        ...lines.map((l) => Plot.lineY(l.pts, { x: "year", y: "value", stroke: l.color, strokeWidth: 2, strokeDasharray: l.dash || null })),
        ...lines.map((l) => Plot.text([l.pts[l.pts.length - 1]], { x: "year", y: "value", text: () => l.label, dx: 6, textAnchor: "start", fill: l.color, fontWeight: 500 })),
        Plot.dot(all, Plot.pointerX({ x: "year", y: "value", r: 4, fill: (d) => lines.find((l) => l.key === d.key).color })),
        Plot.tip(all, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.line}, ${d.year}\n${fmt(d.value)}${d.note ? `\n${d.note}` : ""}\nClick for the source` })),
      ];
      const p = Plot.plot({ ...base(w, 300), x: { ...base(w).x, domain }, y: { ...base(w).y, domain: [0, Math.max(...all.map((d) => d.value)) * 1.08] }, marks });
      p.style.cursor = "pointer";
      p.addEventListener("click", (e) => {
        const y = yearAt(p, e);
        const line = lines.length === 1 ? lines[0] : null;
        const target = (line ? [line] : lines).map((l) => l.pts.find((q) => q.year === y)).find(Boolean);
        if (target) {
          const l = lines.find((x) => x.pts.includes(target));
          const hostIso = l.key.startsWith("host:") ? l.key.slice(5) : null;
          openTrace(point(target, l.measure || l.key, pointLabel(l.measure || l.key, y, hostIso), { place: hostIso ? l.label : undefined }));
        }
      });
      wrap.append(p, eventsStrip(w, domain, conflictYears));
      return wrap;
    },
    table: {
      columns: [{ key: "year", label: "Year", type: "year" }, ...lines.map((l) => ({ key: l.key, label: l.label, type: "num" })),
        { key: "source", label: "Source", type: "text" }],
      rows: [...new Set(yrs)].sort((a, b) => a - b).map((y) => {
        const r = { year: y, source: srcShort(lines[0].pts[0].source_id) };
        for (const l of lines) r[l.key] = l.pts.find((q) => q.year === y)?.value ?? null;
        r.raw_ref = lines[0].pts.find((q) => q.year === y)?.raw_ref ?? null;
        return r;
      }),
    },
    onTrace: (row) => {
      const l = lines[0];
      const p = l.pts.find((q) => q.year === row.year);
      if (p) openTrace(point(p, l.measure || l.key, pointLabel(l.measure || l.key, row.year)));
    },
  });
  el.insertAdjacentHTML("beforeend", `<p class="note">${icon("info", { size: 16 })}<span>${CORRELATION} Displacement (${esc(srcShort(lines[0].pts[0].source_id))}) and events come from separate sources. <a href="learn.html#correlation">Why?</a></span></p>`);
  el.addEventListener("click", (e) => { if (e.target.closest?.(".ev")) onEventClick(e); });
  el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest?.(".ev")) { e.preventDefault(); onEventClick(e); } });
}

function eventYears() {
  return S.events.map((e) => parseInt(e.date, 10)).filter(Boolean);
}

function eventsStrip(w, domain, conflictYears) {
  const right = w < 520 ? 64 : MARGIN.right;
  const x = (y) => MARGIN.left + ((y - domain[0]) / Math.max(1, domain[1] - domain[0])) * (w - MARGIN.left - right);
  const evs = S.events.map((e, i) => ({ ...e, i, y: parseInt(e.date, 10) })).filter((e) => e.y);
  const wars = new Set(S.conflict.filter((c) => c.intensity === 2).map((c) => c.year));
  const runs = [];
  for (const y of conflictYears.sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && y === last[1] + 1) last[1] = y; else runs.push([y, y]);
  }
  const lastConflict = conflictYears.length ? Math.max(...conflictYears) : null;
  const h = (evs.length ? 84 : 0) + (runs.length ? 44 : 0);
  if (!h) return document.createElement("div");
  const div = document.createElement("div");
  div.className = "events";
  const evY = 22;
  const bandY = evs.length ? 84 : 6;
  div.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="group" aria-label="Events and conflict years">
    ${evs.length ? `<text x="0" y="${evY + 4}" class="ev-axis">Events</text>
      ${w < 520 ? `<text x="${MARGIN.left}" y="${evY + 26}" class="ev-axis">Tap a marker to read about the event</text>` : ""}
      <line x1="${MARGIN.left}" x2="${w - right}" y1="${evY}" y2="${evY}" stroke="var(--line-strong)"/>
      ${(() => {
        const rowsEnd = [-Infinity, -Infinity, -Infinity];        // right edge of the last label in each row
        const narrow = w < 520;                                   // phones: markers only (the list is under Context)
        return evs.map((e) => {
          const label = shortTitle(e.title);
          const wLabel = label.length * 6.6;
          const cx = x(e.y);
          const anchorX = cx < MARGIN.left + wLabel / 2 ? "start" : cx > w - right - wLabel / 2 ? "end" : "middle";
          const left = anchorX === "start" ? cx : anchorX === "end" ? cx - wLabel : cx - wLabel / 2;
          let row = rowsEnd.findIndex((r) => left > r + 8);
          if (row < 0) row = rowsEnd.indexOf(Math.min(...rowsEnd));
          rowsEnd[row] = left + wLabel;
          const ty = 24 + row * 16;
          return `<g class="ev" tabindex="0" role="button" data-ev="${e.i}" aria-label="${esc(formatDate(e.date))}: ${esc(e.title)}" transform="translate(${cx.toFixed(1)},${evY})">
            <rect x="-6" y="-6" width="12" height="12" transform="rotate(45)" fill="var(--ink)"/>
            ${row && !narrow ? `<line y1="8" y2="${ty - 11}" stroke="var(--line-strong)"/>` : ""}
            ${narrow ? "" : `<text y="${ty}" text-anchor="${anchorX}" class="ev-label">${esc(label)}</text>`}</g>`;
        }).join("");
      })()}` : ""}
    ${runs.map(([a, b]) => `<rect x="${x(a - 0.5).toFixed(1)}" y="${bandY}" width="${Math.max(3, x(b + 0.5) - x(a - 0.5)).toFixed(1)}" height="12" rx="2" fill="var(--c-context)" opacity="${[...wars].some((y) => y >= a && y <= b) ? 0.55 : 0.35}"><title>${a === b ? a : `${a} to ${b}`}: armed conflict (UCDP)</title></rect>`).join("")}
    ${runs.length ? `<text x="${x(runs[0][0] - 0.5)}" y="${bandY + 30}" class="ev-axis">Armed conflict in ${esc(S.origin_name)} (UCDP)${lastConflict && lastConflict < domain[1] ? `, to ${lastConflict}` : ""}</text>` : ""}
  </svg>`;
  return div;
}
const shortTitle = (t) => { const h = t.split(/[:,]/)[0]; return h.length > 24 ? `${h.slice(0, 23)}…` : h; };

function onEventClick(e) {
  const g = e.target.closest?.(".ev");
  if (!g) return;
  const ev = S.events[+g.dataset.ev];
  const srcIds = ev.source_ids || [ev.source_id];
  const srcTxt = srcIds.map((id) => (SRC[id] ? `${SRC[id].short}: ${SRC[id].dataset.split(":")[0]}` : REFS[id] ? `${REFS[id].authors} (${REFS[id].year})` : id)).join("; ");
  openPopover(`<div class="evpop"><p class="eyebrow">${esc(formatDate(ev.date))}${ev.date_end ? ` to ${esc(ev.date_end)}` : ""}</p>
    <h3>${esc(ev.title)}</h3><p>${esc(ev.note || "")}</p><p class="small muted">Source: ${esc(srcTxt)}</p>
    ${ev.to_check ? `<p class="small muted">To check: ${esc(ev.to_check)}</p>` : ""}</div>`, g, { label: ev.title });
}
function formatDate(d) {
  const [y, m, day] = d.split("-");
  const mon = m ? new Date(2000, +m - 1, 1).toLocaleString("en-GB", { month: "long" }) : "";
  return [day ? +day : "", mon, y].filter(Boolean).join(" ");
}

// =================================================================== 9 where people are
function wherePeople(el) {
  const host = document.createElement("div");
  el.append(host);
  if (S.type === "origin") {
    const rows = S.hosts_latest;
    const y = rows[0]?.year;
    chartBlock(host, {
      id: `${S.id}-hosts`, filename: `${S.id}_hosts_${y}`,
      title: `Where ${esc(S.title.split(",")[0])} lived in ${y}: the ${Math.min(10, rows.length)} largest host countries`,
      summary: `Bar chart of host countries in ${y}.`, source: sourceLine(["unhcr-pop-2026"]), pin: { key: `chart:${S.id}:hosts` },
      draw: (w) => Plot.plot({ ...base(w, 34 * rows.length + 40), marginLeft: Math.min(180, w * 0.35), marginRight: 80,
        x: { label: null, tickFormat: (d) => fmt(d), ticks: 3, axis: null }, y: { label: null, domain: rows.map((r) => r.name) },
        marks: [Plot.barX(rows, { y: "name", x: "value", fill: C.refugees, fillOpacity: 0.85 }),
          Plot.text(rows, { y: "name", x: "value", text: (d) => fmt(d.value), dx: 6, textAnchor: "start", fill: "var(--ink)" })] }),
      table: { columns: [{ key: "name", label: "Host country", type: "text" }, { key: "value", label: `People, ${y}`, type: "num" }], rows },
    });
    return;
  }
  const sh = S.share || [];
  if (!sh.length) return `<p class="muted">No data.</p>`;
  const last = sh[sh.length - 1];
  const big = Math.max(...sh.map((p) => p.value));
  const first = sh.find((p) => p.value >= 0.01 * big) || sh[0];
  const minP = sh.filter((p) => p.year >= first.year).reduce((a, b) => (b.pct < a.pct ? b : a));
  const labelled = [first, minP, last].filter((p, i, arr) => arr.findIndex((q) => q.year === p.year) === i);
  const where = S.type === "named" ? S.hosts.map(hostName).join(" and ") : S.host_name;
  const group = S.title.replace(/ in .*$/, "");
  chartBlock(host, {
    id: `${S.id}-share`, filename: `${S.id}_share`,
    title: S.headlines?.where_people_are ? fillTemplate(S.headlines.where_people_are) : esc(S.title),
    summary: `${plainTitle(S.headlines?.where_people_are || "")}. Area chart of the share in ${where}, ${sh[0].year} to ${last.year}, with a 50% line.`,
    source: sourceLine(["unhcr-pop-2026"], "Share = people in this host ÷ all people from the same origin in every host country, both year-end"),
    pin: { key: `chart:${S.id}:share` },
    draw: (w) => Plot.plot({ ...base(w, 280), y: { label: null, domain: [0, 100], ticks: [0, 50, 100], tickFormat: (d) => `${d}%` },
      x: { ...base(w).x, domain: [sh[0].year, last.year] },
      marks: [
        Plot.areaY(sh, { x: "year", y1: "pct", y2: 100, fill: "var(--surface-2)" }),
        Plot.areaY(sh, { x: "year", y: "pct", fill: C.refFill }),
        Plot.lineY(sh, { x: "year", y: "pct", stroke: C.refugees, strokeWidth: 2 }),
        Plot.ruleY([50], { stroke: "var(--muted)", strokeDasharray: "5,4", strokeOpacity: 0.7 }),
        Plot.dot(labelled, { x: "year", y: "pct", r: 4, fill: C.refugees }),
        ...labelled.map((d) => Plot.text([d], { x: "year", y: "pct", text: (q) => `${fmt(q.pct, { decimals: 1 })}%`, dy: -12,
          dx: d.year === sh[0].year ? 16 : d.year === last.year ? -12 : 0, fill: "var(--ink)", fontWeight: 500 })),
        Plot.text([sh[Math.floor(sh.length / 6)]], { x: "year", y: 8, text: () => `in ${where}`, fill: C.refugees, textAnchor: "start", fontWeight: 500 }),
        Plot.text([sh[Math.floor(sh.length / 2)]], { x: "year", y: 94, text: () => "everywhere else", fill: "var(--muted)" }),
        Plot.tip(sh, Plot.pointerX({ x: "year", y: "pct", title: (d) => `${d.year}: ${fmt(d.pct, { decimals: 1 })}%\n${fmt(d.value)} of ${fmt(d.total)}` })),
      ] }),
    table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: `In ${where}`, type: "num" },
      { key: "total", label: "All host countries", type: "num" }, { key: "pct", label: "Share", type: "pct" }], rows: sh },
  });
  el.insertAdjacentHTML("beforeend", `<p class="tabular split"><strong>${last.year}:</strong> ${esc(where)} ${numHTML(last.value)}
      <span class="muted" aria-hidden="true">·</span> everywhere else ${numHTML(last.total - last.value)}
      <span class="muted" aria-hidden="true">·</span> total ${numHTML(last.total)}</p>
    <p><a href="situation.html?id=${esc(S.origin_iso3.toLowerCase())}-all">Follow ${esc(group)} across all countries over time (onward movement) &rsaquo;</a></p>`);
}

// =================================================================== inside vs outside
function insideOutside(el) {
  const out = S.type === "idp" ? series("refugees") : S.origin_total;
  const lines = [
    { key: "abroad", label: `Refugees from ${S.origin_name}, all countries`, color: C.refugees, pts: out, measure: "refugees" },
    { key: "idps_idmc_conflict", label: "IDPs inside, IDMC", color: C.idp, pts: series("idps_idmc_conflict"), measure: "idps_idmc_conflict" },
    { key: "idps_unhcr", label: "IDPs inside, UNHCR", color: C.idp, dash: "4,3", pts: series("idps_unhcr"), measure: "idps_unhcr" },
  ].filter((l) => l.pts.length && l.pts.some((p) => p.value));
  const ly = Math.max(...lines.map((l) => l.pts[l.pts.length - 1].year));
  const at = (l) => l.pts.find((p) => p.year === ly);
  const parts = lines.filter(at).map((l) => `${numHTML(at(l).value)} ${l.key === "abroad" ? `refugees from ${esc(S.origin_name)} lived abroad` : `IDPs inside the country (${l.key === "idps_unhcr" ? "UNHCR" : "IDMC"})`}`);
  const host = document.createElement("div");
  el.append(host);
  chartBlock(host, {
    id: `${S.id}-inside-outside`, filename: `${S.id}_inside_outside`,
    title: `In ${ly}: ${parts.join("; ")}`,
    summary: `Line chart: people who left ${S.origin_name} and people displaced inside it. UNHCR and IDMC IDP figures are separate lines and are never added.`,
    source: sourceLine(lines.flatMap((l) => l.pts.map((p) => p.source_id))),
    note: `${icon("info", { size: 14 })} UNHCR and IDMC IDP figures overlap, so they are two separate lines and are never added. All three are year-end totals.`,
    pin: { key: `chart:${S.id}:inside_outside` },
    draw: (w) => {
      const all = lines.flatMap((l) => l.pts.map((p) => ({ ...p, line: l.label, key: l.key })));
      return Plot.plot({ ...base(w, 280), marginRight: w < 520 ? 70 : 150,
        marks: [Plot.ruleY([0], { stroke: "var(--line-strong)" }),
          ...lines.map((l) => Plot.lineY(l.pts, { x: "year", y: "value", stroke: l.color, strokeWidth: 2, strokeDasharray: l.dash || null })),
          ...lines.map((l, i) => Plot.text([l.pts[l.pts.length - 1]], { x: "year", y: "value", text: () => l.label, dx: 6, dy: i === 2 ? 10 : i === 1 ? -6 : 0, textAnchor: "start", fill: l.color, fontWeight: 500, lineWidth: 12 })),
          Plot.tip(all, Plot.pointer({ x: "year", y: "value", title: (d) => `${d.line}, ${d.year}\n${fmt(d.value)}` }))] });
    },
    table: {
      columns: [{ key: "year", label: "Year", type: "year" }, ...lines.map((l) => ({ key: l.key, label: l.label, type: "num" }))],
      rows: [...new Set(lines.flatMap((l) => l.pts.map((p) => p.year)))].sort((a, b) => a - b).map((y) => {
        const r = { year: y };
        for (const l of lines) r[l.key] = l.pts.find((p) => p.year === y)?.value ?? null;
        return r;
      }),
    },
  });
}

// =================================================================== 8 compare sources
function compareSources(el) {
  const cmp = S.compare;
  const max = Math.max(...cmp.map((c) => c.value));
  const bars = cmp.map((c, i) => {
    const src = SRC[c.source_id] || {};
    const isUnhcr = c.source_id.startsWith("unhcr");
    const color = isUnhcr ? C.refugees : c.source_id.startsWith("idmc") ? C.idp : "var(--c-context)";
    const segs = c.parts?.length
      ? c.parts.map((p, j) => `<span class="cbar__seg" style="width:${(100 * p.value / max).toFixed(2)}%;background:${color};opacity:${j ? 0.55 : 0.85}" title="${esc(p.label)}"></span>`).join("")
      : `<span class="cbar__seg" style="width:${(100 * c.value / max).toFixed(2)}%;background:${color};opacity:0.85"></span>`;
    return `<div class="cbar">
      <div class="cbar__label">${esc(src.short === "Govt. of India" ? "Govt. of India (MEA)" : src.short || c.source_id)}
        ${c.status === "to_confirm" ? '<span class="status status--to_confirm">to confirm</span>' : ""}</div>
      <div class="cbar__track">${segs}<button class="cbar__val" type="button" data-cmp="${i}" aria-label="${esc(src.short)}: where this number comes from">${numHTML(c.value)}</button></div>
      ${c.parts?.length ? `<div class="cbar__parts small muted">${c.parts.map((p) => `${numHTML(p.value)} ${esc(p.label.replace(/ \(Govt\. of India\)/, "").toLowerCase())}`).join(" + ")}</div>` : ""}
    </div>`;
  }).join("");
  const why = S.compare_why || defaultWhy();
  const whyHTML = why ? `<h3 class="sub-h">Why they differ</h3>
    <div class="table-wrap"><table class="table why"><thead><tr><th scope="col"></th>${why.columns.map((c) => `<th scope="col">${esc(SRC[c]?.short === "Govt. of India" ? "Government of India" : SRC[c]?.short || c)}</th>`).join("")}</tr></thead>
    <tbody>${why.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th>${why.columns.map((c) => `<td>${esc(r[c] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  const term = S.type === "idp" ? "IDP" : "refugee";
  el.innerHTML = `${S.headlines?.compare ? `<p class="step__lede">${fillTemplate(S.headlines.compare)}</p>` : ""}
    <div class="cbars" role="group" aria-label="One bar per source; bars are never added together">${bars}</div>
    <p class="small muted">Each source is labelled and shown on its own. The bars are never added together.</p>
    ${whyHTML}
    <p style="margin-top:16px"><a href="learn.html#crosswalk">See how every source defines "${term}" &rsaquo;</a></p>`;
  el.querySelectorAll("[data-cmp]").forEach((b) => b.addEventListener("click", () => {
    const c = cmp[+b.dataset.cmp];
    openTrace({ value: c.value, unit: "people", year: c.year, measure_id: c.measure_id, source_id: c.source_id, raw_ref: c.raw_ref,
      footnote: null, status: c.status, as_of_date: c.as_of_date, note: c.parts?.length ? "Sum of the parts given in the same answer" : null,
      label: c.source_id.startsWith("unhcr") || c.source_id.startsWith("idmc") ? pointLabel(c.measure_id, c.year)
        : `${MEAS[c.measure_id]?.label || c.measure_id}, ${c.as_of_date ? `as on ${c.as_of_date}` : c.year}` });
  }));
}

function defaultWhy() {
  if (S.type !== "idp") return null;
  return { columns: ["unhcr-pop-2026", "idmc-conflict-2026"], rows: [
    { label: "Who is counted", "unhcr-pop-2026": "Conflict IDPs UNHCR protects or assists", "idmc-conflict-2026": "Everyone displaced inside the country by conflict and violence" },
    { label: "Method", "unhcr-pop-2026": "Reported to UNHCR, often by the government", "idmc-conflict-2026": "Estimates built from several sources" },
    { label: "Coverage", "unhcr-pop-2026": "Year-end total, from 1993", "idmc-conflict-2026": "Year-end total, from 2009" },
    { label: "Causes", "unhcr-pop-2026": "Conflict only", "idmc-conflict-2026": "Conflict and violence (disasters are a separate series)" },
  ] };
}

// =================================================================== context
function context(el) {
  const host = document.createElement("div");
  el.append(host);
  const conf = S.conflict;
  const names = [...new Map(conf.map((c) => [c.conflict_id, c.conflict_name])).entries()];
  const deaths = (S.violence_deaths || []).filter((d) => d.year >= (S.years?.[0] || 1989) - 5);
  if (deaths.length) {
    const peak = deaths.reduce((a, b) => (b.value > a.value ? b : a));
    chartBlock(host, {
      id: `${S.id}-violence`, filename: `${S.id}_deaths_organized_violence`,
      title: `Deaths in organized violence in ${esc(S.origin_name)} peaked at ${numHTML(peak.value)} in ${peak.year}`,
      summary: `Bar chart of deaths in organized violence per year in ${S.origin_name}, UCDP best estimate.`,
      source: sourceLine(["ucdp-ov-26.1"], "Best estimate of deaths in state-based, non-state and one-sided violence"),
      note: `${icon("info", { size: 14 })} ${CORRELATION} Deaths are a yearly count; displacement figures are year-end totals.`,
      pin: { key: `chart:${S.id}:violence` },
      draw: (w) => Plot.plot({ ...base(w, 200), marks: [Plot.barY(deaths, { x: "year", y: "value", fill: C.context, fillOpacity: 0.8, insetLeft: 0.5, insetRight: 0.5 }),
        Plot.ruleY([0], { stroke: "var(--line-strong)" }), Plot.tip(deaths, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)} deaths${d.note ? `\n${d.note}` : ""}` }))],
        x: { ...base(w).x, type: "band", tickFormat: (d) => (d % 5 === 0 ? String(d) : "") } }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: "Deaths (best estimate)", type: "num" }], rows: deaths },
    });
  }
  const list = names.length ? `<h3 class="sub-h">Armed conflicts in ${esc(S.origin_name)} (UCDP/PRIO)</h3><ul class="conf-list">${names.map(([id, n]) => {
    const ys = conf.filter((c) => c.conflict_id === id);
    const yrs = ys.map((c) => c.year);
    const war = ys.filter((c) => c.intensity === 2).map((c) => c.year);
    return `<li><span class="conf-list__name">${esc(n)}</span> <span class="muted tabular">${runsLabel(yrs)}</span>${war.length ? ` <span class="small muted">· war (1,000+ deaths) in ${runsLabel(war)}</span>` : ""}</li>`;
  }).join("")}</ul>` : "";
  const evs = S.events.length ? `<h3 class="sub-h">Events</h3><ol class="ev-list">${S.events.map((e) => {
    const srcIds = e.source_ids || [e.source_id];
    return `<li><span class="ev-list__date tabular">${esc(formatDate(e.date))}</span><div><strong>${esc(e.title)}</strong><p>${esc(e.note || "")}</p>
      <p class="small muted">Source: ${esc(srcIds.map((id) => (SRC[id] ? SRC[id].short : REFS[id] ? `${REFS[id].authors} (${REFS[id].year})` : id)).join("; "))}${e.to_check ? ` · to check: ${esc(e.to_check)}` : ""}</p></div></li>`;
  }).join("")}</ol>` : "";
  el.insertAdjacentHTML("beforeend", list + evs + `<p class="note" style="margin-top:16px">${icon("info", { size: 16 })}<span>${CORRELATION}</span></p>`);
}
function runsLabel(yrs) {
  const ys = [...new Set(yrs)].sort((a, b) => a - b);
  const runs = [];
  for (const y of ys) {
    const l = runs[runs.length - 1];
    if (l && y === l[1] + 1) l[1] = y; else runs.push([y, y]);
  }
  return runs.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(", ");
}

// =================================================================== other angles
function otherAngles(el) {
  const o = S.other_angles || {};
  const blocks = [];
  const add = () => { const d = document.createElement("div"); d.className = "angle"; el.append(d); return d; };
  const ret = series("returns");
  if (ret.length) {
    const total = ret.reduce((a, b) => a + b.value, 0);
    const pk = ret.reduce((a, b) => (b.value > a.value ? b : a));
    blocks.push(chartBlock(add(), {
      id: `${S.id}-returns`, filename: `${S.id}_returns`,
      title: `Returns to ${esc(S.origin_name)}${S.type === "pair" ? ` from ${esc(S.host_name)}` : ""}: most in ${pk.year} (${numHTML(pk.value)})`,
      summary: `Bar chart of returned refugees per year.`,
      source: sourceLine(["unhcr-solutions-2026"], "Returned refugees counted during each year"),
      note: `${icon("info", { size: 14 })} A yearly count (flow), not a year-end total. Years with no row are shown as gaps, not zeros. ${numHTML(total)} returns over these years in all.`,
      pin: { key: `chart:${S.id}:returns` },
      draw: (w) => Plot.plot({ ...base(w, 200), x: { ...base(w).x, type: "band", tickFormat: (d) => (d % 5 === 0 ? String(d) : "") },
        marks: [Plot.barY(ret, { x: "year", y: "value", fill: C.refugees, fillOpacity: 0.75 }), Plot.ruleY([0], { stroke: "var(--line-strong)" }),
          Plot.tip(ret, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)} returned` }))] }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: "Returned refugees", type: "num" }], rows: ret.map((r) => ({ ...r })) },
      onTrace: (row) => openTrace(point(row, "returned_refugees", `Returned refugees, ${row.year}`)),
    }));
  }
  if (o.asylum_applications) {
    const a = o.asylum_applications.series;
    blocks.push(chartBlock(add(), {
      id: `${S.id}-asylum`, filename: `${S.id}_asylum_applications`,
      title: `New asylum applications by people from ${esc(S.origin_name)} in ${esc(place())}`,
      summary: "Bar chart of new first-instance asylum applications per year.",
      source: sourceLine([o.asylum_applications.source_id], o.asylum_applications.note),
      note: `${icon("info", { size: 14 })} A yearly count of new claims, not people waiting at year end.`,
      pin: { key: `chart:${S.id}:asylum` },
      draw: (w) => Plot.plot({ ...base(w, 180), x: { ...base(w).x, type: "band", tickFormat: (d) => (d % 5 === 0 ? String(d) : "") },
        marks: [Plot.barY(a, { x: "year", y: "value", fill: C.asylum, fillOpacity: 0.8 }), Plot.ruleY([0], { stroke: "var(--line-strong)" }),
          Plot.tip(a, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)}` }))] }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: "New applications", type: "num" }], rows: a },
    }));
  }
  const cards = [];
  if (o.per_1000) {
    cards.push(`<article class="card kn kn--small"><div class="kn__label">${esc(o.per_1000.note)}</div>
      <div class="kn__value" style="cursor:default">${numHTML(o.per_1000.value, { decimals: 2 })}</div>
      <div class="kn__sub">${numHTML(o.per_1000.numerator)} ÷ ${numHTML(o.per_1000.denominator)} × 1,000 · ${o.per_1000.year}</div>
      <div class="kn__src small muted">Sources: UNHCR; World Bank (population)</div></article>`);
  }
  if (o.demographics) {
    const d = o.demographics.split;
    const f = d.f_total || 0;
    const m = d.m_total || 0;
    cards.push(`<article class="card kn kn--small"><div class="kn__label">Women and men among refugees, ${o.demographics.year}</div>
      <div class="sexbar" role="img" aria-label="Women ${fmt(f)}, men ${fmt(m)}"><span style="flex:${f};background:var(--c-stateless)"></span><span style="flex:${m};background:var(--c-oip)"></span></div>
      <div class="kn__sub">Women ${numHTML(f)} · men ${numHTML(m)} · not split ${numHTML((d.total || 0) - f - m)}</div>
      <div class="kn__src small muted">Source: UNHCR demographics</div></article>`);
  }
  if (cards.length) el.insertAdjacentHTML("beforeend", `<div class="card-grid" style="margin-top:16px">${cards.join("")}</div>`);
  if (!blocks.length && !cards.length) return `<p class="muted">No other angles in the data for this situation.</p>`;
}

// =================================================================== 10 limitations
const KIND_ICON = { politics: "alert", method: "alert", missing: "question", coverage: "question" };
function limitationsHTML() {
  const items = S.limitations.map((l) => {
    const ic = l.text.startsWith("Very slow") ? "steady" : KIND_ICON[l.kind] || "info";
    return `<li class="lim"><span class="lim__icon lim__icon--${esc(l.kind)}">${icon(ic, { size: 20 })}</span>
      <div><div class="lim__text">${esc(l.text)}</div><div class="lim__detail muted">${fillTemplate({ text: l.detail || "", nums: l.nums, pcts: l.pcts })}</div>
      ${l.to_check ? `<div class="small muted">To check: ${esc(l.to_check)}</div>` : ""}</div></li>`;
  }).join("");
  const pct = Math.round((S.demographics_coverage || 0) * 1000) / 10;
  const sexPct = Math.round((S.sex_coverage || 0) * 1000) / 10;
  const demo = S.type === "pair" ? `
    <h3 class="sub-h">Demographics coverage${S.demographics_year ? ` (${S.demographics_year})` : ""}</h3>
    <div class="cov">
      <div class="cov__row"><span class="cov__label">Age and sex known</span><div class="cov__bar" role="img" aria-label="${pct}% known"><span style="width:${pct}%"></span></div><span class="cov__pct">${pctHTML(pct)} known</span></div>
      <div class="cov__row"><span class="cov__label">Sex known</span><div class="cov__bar" role="img" aria-label="${sexPct}% known"><span style="width:${sexPct}%"></span></div><span class="cov__pct">${pctHTML(sexPct)} known</span></div>
    </div>` : "";
  const missing = S.missing.length ? `<div class="missing"><span>What's missing:</span>${S.missing.map((m) => `<span class="chip chip--static">${esc(m)}</span>`).join("")}</div>` : "";
  return `<ul class="lims">${items}</ul>${demo}${missing}
    <p style="margin-top:20px"><a href="learn.html#organisations">About the organisations: UNHCR, IDMC and UCDP, their mandates and limits &rsaquo;</a></p>`;
}

// =================================================================== 12 sources and reading
function sourcesHTML(el) {
  const ds = S.datasets.map((d) => SRC[d]).filter(Boolean);
  const rows = ds.map((d) => `<tr><td><a href="datasets.html#${esc(d.id)}">${esc(d.dataset)}</a><div class="small muted">${esc(d.organisation)}</div></td>
      <td class="tabular">${d.years ? `${d.years[0]} to ${d.years[1]}` : ""}</td><td>${esc(d.release)}${d.status === "to_confirm" ? ' <span class="status status--to_confirm">to confirm</span>' : ""}</td></tr>`).join("");
  const reading = (S.reading || []).map((r) => `<article class="card reading">
      <div><div class="reading__by">${esc(r.authors)} (${r.year})</div><div class="reading__title">${esc(r.title)}</div>
        ${r.to_check ? `<div class="small muted">To check: ${esc(r.to_check)}</div>` : ""}</div>
      <div class="reading__meta"><span class="small muted">${esc(r.type)}</span>
        <button class="pin-btn" type="button" data-pin-key="read:${esc(r.id)}" data-read="${esc(r.id)}" aria-pressed="false" aria-label="Add ${esc(r.authors)} (${r.year}) to my collection">${icon("pin", { size: 16 })}</button></div>
    </article>`).join("");
  el.innerHTML = `<h3 class="sub-h" style="margin-top:0">Datasets used</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th scope="col">Dataset</th><th scope="col">Years</th><th scope="col">Release</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${reading ? `<h3 class="sub-h">Reading list</h3><div class="readings">${reading}</div>` : `<p class="muted" style="margin-top:16px">No readings added for this situation yet.</p>`}
    <div class="sources-actions"><button class="btn" type="button" data-cite-all>Cite all (APA)</button>
      <a href="request.html?about=${encodeURIComponent(S.title)}">Missing something? Request data or a source &rsaquo;</a></div>`;
  el.querySelector("[data-cite-all]").addEventListener("click", async (e) => {
    const all = [...ds.map((d) => d.csl), ...ds.flatMap((d) => d.cite_also || []), ...(S.reading || []).map((r) => r.csl)];
    e.currentTarget.disabled = true;
    const refs = await referenceList(all, "apa");
    e.currentTarget.disabled = false;
    openPanel("References (APA)", `<ol class="refs">${refs.map((r) => `<li>${r.html}</li>`).join("")}</ol>
      <button class="btn" type="button" data-copy-all>Copy all</button>`, {
      onOpen: (p) => p.querySelector("[data-copy-all]").addEventListener("click", async (ev) => {
        try { await navigator.clipboard.writeText(refs.map((r) => r.text).join("\n")); ev.target.textContent = "Copied"; } catch { ev.target.textContent = "Select and copy the list above"; }
      }),
    });
  });
}

// =================================================================== pins for charts and readings
function wirePins(root) {
  root.querySelectorAll("[data-read]").forEach((b) => b.addEventListener("click", () => {
    const r = S.reading.find((x) => x.id === b.dataset.read);
    pin({ kind: "reading", key: `read:${r.id}`, label: `${r.authors} (${r.year}). ${r.title}`, place: "", year: r.year, source_short: r.type,
      csl: r.csl, situation_id: S.id, situation_title: S.title }, b);
  }));
  root.querySelectorAll('.chart [data-pin-key^="chart:"]').forEach((b) => b.addEventListener("click", () => {
    const fig = b.closest("figure");
    const title = fig.querySelector(".chart__title").textContent.trim();
    const ids = S.datasets.filter((d) => fig.querySelector(".chart__src").textContent.includes(SRC[d]?.organisation?.split(" (")[0] || "~"));
    pin({ kind: "chart", key: b.dataset.pinKey, label: title, chart_id: fig.id, place: place(), year: S.years?.[1],
      source_short: [...new Set(ids.map((d) => SRC[d].short))].join(", "), csl: SRC[ids[0]]?.csl, csls: ids.map((d) => SRC[d].csl),
      situation_id: S.id, situation_title: S.title, url: `situation.html?id=${S.id}#${fig.closest(".step").id}` }, b);
  }));
}

// =================================================================== rail
function setupRail() {
  const links = [...document.querySelectorAll(".rail a")];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const setCurrent = (id) => {
    links.forEach((a) => a.removeAttribute("aria-current"));
    const a = byId.get(id);
    if (a) {
      a.setAttribute("aria-current", "step");
      if (window.matchMedia("(max-width: 860px)").matches) a.scrollIntoView({ block: "nearest", inline: "center" });
    }
  };
  setCurrent(links[0]?.getAttribute("href").slice(1));
  const obs = new IntersectionObserver((entries) => {
    const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (vis[0]) setCurrent(vis[0].target.id);
  }, { rootMargin: "-20% 0px -65% 0px" });
  document.querySelectorAll(".step").forEach((sec) => obs.observe(sec));
}
