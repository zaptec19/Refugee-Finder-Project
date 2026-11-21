// Situation page: header, step rail, mini globe and the ten steps (walkthrough screens 3 to 12).
import { initPage, guideTip } from "./layout.js";
import { getJSON, getOptionalJSON, sources as loadSources, tips as loadTips, glossary as loadGlossary, measures as loadMeasures } from "./data.js";
import { esc, fmt, fmtPct, numHTML, pctHTML, fillTemplate, applyNumbers } from "./format.js";
import { reducedMotion } from "./motion.js";
import { arriveMorph } from "./morph.js";
import { icon, pinButton } from "./icons.js";
import { renderMiniGlobe } from "./minimap.js";
import { chartBlock, Plot, base, C, MEASURE_COLOR, yearAt, MARGIN, inkOf } from "./charts.js";
import { openPopover, openPanel, bindGlossary } from "./popouts.js";
import { traceContext, openTrace as openTraceIn, linkNumbers, LABEL } from "./trace.js";
import { pin, syncPins } from "./collection.js";
import { cite, referenceList, loadCiteEngine } from "./cite.js";
import { REVIEW, reviewNote, unverifiedTag } from "./review.js";

export const STEPS = [
  ["brief", "Brief"], ["key_numbers", "Key numbers"], ["over_time", "Over time"],
  ["where_people_are", "Where people are"], ["inside_outside", "Inside vs outside"],
  ["compare", "Compare sources"], ["context", "Context"], ["other_angles", "Other angles"],
  ["limitations", "Limitations"], ["sources", "Sources & reading"],
];
const anchor = (k) => k.replace(/_/g, "-");
const TYPE_LABEL = { pair: "Situation", named: "Situation", origin: "Group", idp: "Internal displacement" };
const CORRELATION = "Shows timing and patterns, not proven causes.";

let S;            // situation
let SRC = {};     // sources by id
let MEAS = {};    // measures by id
let GLOSS = [];
let REFS = {};    // readings by id
let CTX;          // trace helpers for this situation (js/trace.js)

initPage({ page: "situation" });
document.body.classList.add("page-situation");
// Coming from the home page, stand-ins of the clicked title and the globe morph into the real ones (js/morph.js).
const morph = arriveMorph();
const ready = main().catch((e) => {
  console.error(e);
  document.getElementById("main").innerHTML = `<div class="page"><div class="empty-state" style="margin-top:48px">
    <h3>We couldn't open this situation</h3><p class="muted">${esc(e.status === 404 ? "There is no situation with this id." : e.message)}</p>
    <p><a href="index.html">Back to search</a> · <a href="request.html">Request data</a></p></div></div>`;
});
ready.then(() => morph.land());

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
  CTX = traceContext(S, SRC, MEAS, GLOSS);
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
              <div class="step__head"><h2 class="step__title" id="h-${k}" tabindex="-1">${l}</h2></div>
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
  // numbers in the brief, chart titles and summaries open their source trace too
  mainEl.querySelectorAll("#brief-body, .chart__title, .step__lede, .split, .cbar__parts, .lim__detail")
    .forEach((el) => linkNumbers(el, CTX, openTrace));
  bindGlossary(mainEl, GLOSS);
  wirePins(mainEl);
  syncPins(mainEl);
  setupRail();

  const hosts = s.type === "named" ? s.hosts : s.host_iso3 ? [s.host_iso3] : [];
  const mini = renderMiniGlobe(document.getElementById("mini-globe"), {
    origin: s.origin_iso3, hosts, originName: s.origin_name,
    // click (or Enter/Space) opens the larger map in a pop-out; the module loads only when asked for
    onExpand: (btn) => import("./map-dialog.js").then((m) => m.openMapDialog({ S: s, MEAS, SRC, trigger: btn })),
    hostNames: s.type === "named" ? hosts.map((h) => s.hosts_latest.find((x) => x.host_iso3 === h)?.name || h) : [s.host_name].filter(Boolean),
  }).then(() => document.getElementById("mini-globe").removeAttribute("aria-busy"))
    .catch((e) => { console.error(e); document.getElementById("mini-globe").innerHTML = '<p class="small muted">Map could not load.</p>'; });
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  requestAnimationFrame(() => { revealSteps(); countUp(mainEl.querySelector('[data-body="key_numbers"]')); });
  // get citations ready in the background: load citation-js, then build the APA engine once while the page is idle
  // (the first citation in a style is several hundred ms of blocking work; after that it is instant)
  setTimeout(() => {
    const warm = () => cite(SRC["unhcr-pop-2026"]?.csl, "apa").catch(() => {});
    loadCiteEngine().then(() => (window.requestIdleCallback ? requestIdleCallback(warm, { timeout: 5000 }) : setTimeout(warm, 500)));
  }, 2000);
  await Promise.race([mini, new Promise((r) => setTimeout(r, 1200))]);   // the morph lands on the drawn mini globe
}

// =================================================================== helpers
const place = () => CTX.place();
const hostName = (iso) => CTX.hostName(iso);
const srcShort = (id) => SRC[id]?.short || id;
const series = (k) => S.series?.[k] || [];
const yearsRange = (pts) => (pts.length ? [pts[0].year, pts[pts.length - 1].year] : null);
const plainTitle = (t) => fillTemplate(t, { plain: true });

function sourceLine(ids, extra = "") {
  const uniq = [...new Set(ids)].filter(Boolean);
  return `Source: ${uniq.map((id) => `${esc(SRC[id]?.organisation?.split(" (")[0] || id)}, ${esc(SRC[id]?.dataset?.split(":")[0] || "")} (${esc(SRC[id]?.release?.split(" (")[0] || "")})`).join("; ")}${extra ? `. ${extra}` : ""}`;
}

// Labels, collection items and the source trace live in js/trace.js (the collection page uses them too).
const point = (...a) => CTX.point(...a);
const pointLabel = (...a) => CTX.pointLabel(...a);
const itemFromPoint = (pt) => CTX.itemFromPoint(pt);
/** Open "Where this number comes from". `origin` is where it opens from: { el, flyFrom, focusEl, rect }. */
function openTrace(pt, origin = {}) {
  return openTraceIn(pt, origin, CTX);
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
    const one = (x) => `${liveNumbers(x.text, brief.numbers)}${marker(x.source_ids)}`;
    const rest = sentences.slice(1);
    return `<div class="brief__k">${p.toUpperCase()}</div><div class="brief__v">${one(sentences[0])}${rest.length
      ? ` <span class="brief__rest" hidden>${rest.map(one).join(" ")}</span>` : ""}</div>`;
  };
  const srcNames = [...new Set(srcs.map((id) => (SRC[id]?.short || REFS[id]?.authors || id).replace(/^Government of /, "Govt. of ")))];
  const label = brief.status === "checked"
    ? `Checked by ${esc(brief.checked_by || "the team")}${brief.checked_on ? `, ${esc(formatDate(brief.checked_on))}` : ""}`
    : `Written by ${esc(brief.writer || "Gemini")} from ${esc(srcNames.join(", ") || "the data")}, not yet checked by the team`;
  const more = brief.more ? `<details class="brief__more"><summary>Read more</summary><div class="brief__v">${esc(brief.more)}</div></details>` : "";
  const anyRest = ["what", "why", "when", "how"].some((p) => Array.isArray(brief[p]) && brief[p].length > 1);
  return `<div class="brief" id="brief-body">${["what", "why", "when", "how"].map(part).join("")}</div>${more}
    ${anyRest ? `<button class="linklike brief__toggle" type="button" aria-expanded="false" aria-controls="brief-body"
      onclick="const open=this.getAttribute('aria-expanded')!=='true';this.setAttribute('aria-expanded',open);this.textContent=open?'Show less ⌃':'Read more ⌄';document.querySelectorAll('#brief-body .brief__rest').forEach(e=>e.hidden=!open)">Read more ⌄</button>` : ""}
    <p style="margin-top:16px"><span class="brief-label${brief.status === "checked" ? " brief-label--checked" : ""}" data-brief-label>${icon("info", { size: 14 })}${label}</span></p>
    <p class="small muted">Sources: ${srcs.map((id, i) => `[${i + 1}] ${esc(SRC[id]?.short || REFS[id]?.authors + " " + (REFS[id]?.year || "") || id)}`).join(" · ")}</p>`;
}

/** Brief text with its counts turned into live numbers (so the Indian / international switch reaches them).
 *  Years (1900-2099 without separators) and decimals are left as written. */
function liveNumbers(text, counts = []) {
  const known = new Set(counts);
  return String(text).split(/(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    if (part.includes(".")) return esc(part);
    const n = Number(part.replace(/,/g, ""));
    if (known.has(n)) return numHTML(n);
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
        ${pinButton({ key: item.key, label: `${kn.label}${kn.label.includes(String(kn.year)) ? "" : ` (${kn.year})`}`, attrs: `data-pin-idx="${i}"` })}
      </div>
    </article>`;
  }).join("")}</div>`;
  el._items = pts.map((kn) => ({ ...itemFromPoint({ ...kn, label: `${kn.label}${kn.label.includes(String(kn.year)) ? "" : ` (${kn.year})`}` }), what: whatOf(kn) }));
  el.querySelectorAll("[data-trace]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const kn = pts[+b.dataset.trace];
    const card = b.closest(".kn").querySelector(".kn__value");
    openTrace(CTX.keyNumberPoint(kn), { el: card, flyFrom: card.querySelector("[data-num], [data-pct]"), focusEl: b });
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
      ${e.reliability_sources?.length ? `<p class="small muted">Source: ${esc(e.reliability_sources.map(srcLabel).join("; "))}</p>` : ""}
      ${reviewNote(e.to_check)}
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
        ...lines.map((l) => Plot.text([l.pts[l.pts.length - 1]], { x: "year", y: "value", text: () => l.label, dx: 8, textAnchor: "start", fill: inkOf(l.color), fontWeight: 500, lineWidth: w < 520 ? 6 : 16, className: "end-label" })),
        Plot.ruleX(all, Plot.pointerX({ x: "year", className: "crosshair" })),
        Plot.dot(all, Plot.pointerX({ x: "year", y: "value", r: 5, fill: (d) => lines.find((l) => l.key === d.key).color, className: "pt-hover" })),
        Plot.tip(all, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.line}, ${d.year}\n${fmt(d.value)}${d.note ? `\n${d.note}` : ""}\nClick for the source` })),
      ];
      const p = Plot.plot({ ...base(w, 300), x: { ...base(w).x, domain }, y: { ...base(w).y, domain: [0, Math.max(...all.map((d) => d.value)) * 1.08] }, marks });
      p.style.cursor = "pointer";
      p.addEventListener("click", (e) => {
        const y = yearAt(p, e);
        // the highlighted dot under the pointer (Plot draws it for the hovered year)
        const dot = [...p.querySelectorAll("circle")].map((c) => c.getBoundingClientRect())
          .sort((r1, r2) => Math.hypot(r1.x - e.clientX, r1.y - e.clientY) - Math.hypot(r2.x - e.clientX, r2.y - e.clientY))[0];
        const at = dot?.width ? dot : { left: e.clientX - 5, top: e.clientY - 5, width: 10, height: 10, right: e.clientX + 5, bottom: e.clientY + 5 };
        const fig = p.closest(".chart");
        fig?.setAttribute("tabindex", "-1");
        const line = lines.length === 1 ? lines[0] : null;
        const target = (line ? [line] : lines).map((l) => l.pts.find((q) => q.year === y)).find(Boolean);
        if (target) {
          const l = lines.find((x) => x.pts.includes(target));
          const hostIso = l.key.startsWith("host:") ? l.key.slice(5) : null;
          openTrace(point(target, l.measure || l.key, pointLabel(l.measure || l.key, y, hostIso), { place: hostIso ? l.label : undefined, hostIso: hostIso || undefined }),
            { rect: at, focusEl: fig, flyFrom: { rect: at, fontSize: 12, text: fmt(target.value) } });
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
    onTrace: (row, t) => {
      const l = lines[0];
      const p = l.pts.find((q) => q.year === row.year);
      if (p) openTrace(point(p, l.measure || l.key, pointLabel(l.measure || l.key, row.year)), { el: t, flyFrom: t.querySelector("[data-num]") });
    },
  });
  el.insertAdjacentHTML("beforeend", `<p class="note">${icon("info", { size: 16 })}<span>${CORRELATION} Displacement (${esc(srcShort(lines[0].pts[0].source_id))}) and events come from separate sources. <a href="learn.html#correlation">Why?</a></span></p>`);
  el.addEventListener("click", (e) => { if (e.target.closest?.(".ev")) onEventClick(e); });
  el.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.closest?.(".ev")) { e.preventDefault(); onEventClick(e); } });
  el.addEventListener("pointerover", (e) => { const g = e.target.closest?.(".ev"); if (g && e.pointerType !== "touch") showEventTip(g); });
  el.addEventListener("pointerout", (e) => { const g = e.target.closest?.(".ev"); if (g && !g.contains(e.relatedTarget)) hideEventTip(); });
  el.addEventListener("focusin", (e) => { const g = e.target.closest?.(".ev"); if (g) showEventTip(g); });
  el.addEventListener("focusout", (e) => { if (e.target.closest?.(".ev")) hideEventTip(); });
  addEventListener("scroll", hideEventTip, { passive: true });
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
  const evY = 22;
  const narrow = w < 520;                                       // phones: markers only (the list is under Context)
  const placed = narrow ? evs.map((e) => ({ e, row: 0 })) : placeEventLabels(evs, x, MARGIN.left, w);
  const nRows = Math.max(3, ...placed.map((p) => p.row + 1));
  const evH = 84 + (nRows - 3) * 16;
  const h = (evs.length ? evH : 0) + (runs.length ? 44 : 0);
  if (!h) return document.createElement("div");
  const div = document.createElement("div");
  div.className = "events";
  const bandY = evs.length ? evH : 6;
  div.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="group" aria-label="Events and conflict years">
    <defs><pattern id="conf-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="var(--c-context-band)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--c-context)" stroke-width="2.4"/></pattern></defs>
    ${evs.length ? `<text x="0" y="${evY + 4}" class="ev-axis">Events</text>
      ${w < 520 ? `<text x="${MARGIN.left}" y="${evY + 26}" class="ev-axis">Tap a marker to read about the event</text>` : ""}
      <line x1="${MARGIN.left}" x2="${w - right}" y1="${evY}" y2="${evY}" stroke="var(--line-strong)"/>
      <g class="ev-leads" aria-hidden="true">${narrow ? "" : placed.filter((q) => q.row).map(({ e, row }) =>
        `<line x1="${x(e.y).toFixed(1)}" x2="${x(e.y).toFixed(1)}" y1="${evY + 8}" y2="${evY + 24 + row * 16 - 11}" stroke="var(--line-strong)"/>`).join("")}</g>
      ${placed.map(({ e, row, label, anchorX, wLabel }) => {
          const ty = 24 + row * 16;
          const bx = anchorX === "start" ? -3 : anchorX === "end" ? -wLabel - 3 : -wLabel / 2 - 3;
          return `<g class="ev" tabindex="0" role="button" data-ev="${e.i}" aria-label="${esc(formatDate(e.date))}: ${esc(e.title)}" transform="translate(${x(e.y).toFixed(1)},${evY})">
            <rect x="-6" y="-6" width="12" height="12" transform="rotate(45)" fill="var(--ink)"/>
            ${narrow ? "" : `<rect class="ev-label-bg" x="${bx.toFixed(1)}" y="${ty - 11}" width="${(wLabel + 6).toFixed(1)}" height="15" rx="2"/><text y="${ty}" text-anchor="${anchorX}" class="ev-label">${esc(label)}</text>`}</g>`;
        }).join("")}
` : ""}
    ${runs.map(([a, b]) => `<rect x="${x(a - 0.5).toFixed(1)}" y="${bandY}" width="${Math.max(3, x(b + 0.5) - x(a - 0.5)).toFixed(1)}" height="12" rx="2" class="conf-band" fill="url(#conf-hatch)" stroke="var(--c-context)" stroke-opacity="0.5" opacity="${[...wars].some((y) => y >= a && y <= b) ? 1 : 0.7}"><title>${a === b ? a : `${a} to ${b}`}: armed conflict (UCDP)</title></rect>`).join("")}
    ${runs.length ? `<text x="${x(runs[0][0] - 0.5)}" y="${bandY + 30}" class="ev-axis">Armed conflict in ${esc(S.origin_name)} (UCDP)${lastConflict && lastConflict < domain[1] ? `, to ${lastConflict}` : ""}</text>` : ""}
  </svg>`;
  return div;
}
/** B3: event labels as long as they fit. Each label tries its full first clause, then shorter word cuts with "…",
 *  in the first row where it doesn't touch its neighbours (real text widths). Three rows, up to five where
 *  events crowd together; only if even that fails does the shortest form share the emptiest row. */
function placeEventLabels(evs, x, lo, hi) {
  const MAX_ROWS = 5;
  const rowsEnd = [];
  const geom = (label, cx) => {
    const wLabel = textWidth(label);
    const anchorX = cx - wLabel / 2 < lo ? "start" : cx + wLabel / 2 > hi ? "end" : "middle";
    return { wLabel, anchorX, left: anchorX === "start" ? cx : anchorX === "end" ? cx - wLabel : cx - wLabel / 2 };
  };
  return [...evs].sort((a, b) => a.y - b.y).map((e) => {
    const cx = x(e.y);
    const forms = labelForms(e.title);
    let pick = null;
    // the full title in a fourth or fifth row beats a cut one in the first three
    for (const label of forms) {
      const g = geom(label, cx);
      while (rowsEnd.length < MAX_ROWS) rowsEnd.push(-Infinity);
      const row = rowsEnd.findIndex((r) => g.left > r + 10);
      if (row >= 0) { pick = { label, row, ...g }; break; }
    }
    if (!pick) {
      const label = forms[forms.length - 1];
      const row = rowsEnd.indexOf(Math.min(...rowsEnd));
      pick = { label, row, ...geom(label, cx) };
    }
    rowsEnd[pick.row] = pick.left + pick.wLabel;
    return { e, ...pick };
  });
}
/** Label forms for an event, longest first: the title up to its first ":" or "," (skipping a date-only lead-in),
 *  then cut at words with "…". */
const DATE_ONLY = /^(\d{1,2}\s)?([A-Z][a-z]+\s)?\d{4}(\s(to|–)\s\d{4})?$/;
function labelForms(t) {
  // "1978: first large exodus" -> "First large exodus" (the marker and the tooltip already give the date)
  const [pre, ...rest] = t.split(":");
  const body = rest.length && DATE_ONLY.test(pre.trim()) ? rest.join(":").trim() : t;
  let h = body.split(/[:,]/)[0].trim();
  h = h.charAt(0).toUpperCase() + h.slice(1);
  const words = h.split(/\s+/);
  const out = [h];
  for (let n = words.length - 1; n >= 1; n--) out.push(`${words.slice(0, n).join(" ").replace(/[\s'’–-]+$/, "")}…`);
  return out;
}
let measureCtx = null;
/** Width of an event label in px (12 px, the page's sans font). */
function textWidth(t) {
  try {
    measureCtx ||= document.createElement("canvas").getContext("2d");
    const fam = getComputedStyle(document.body).getPropertyValue("--font-sans") || getComputedStyle(document.body).fontFamily;
    measureCtx.font = `12px ${fam}`;
    return Math.ceil(measureCtx.measureText(t).width);
  } catch { return t.length * 6.6; }
}

/** B3: the full title (and date) in a small tooltip while an event marker is hovered or focused. */
let evTip = null;
function showEventTip(g) {
  const ev = S.events[+g.dataset.ev];
  if (!ev) return;
  if (!evTip) {
    evTip = document.createElement("div");
    evTip.className = "ev-tip";
    evTip.setAttribute("role", "tooltip");
    evTip.id = "ev-tip";
    document.body.append(evTip);
  }
  evTip.innerHTML = `<span class="ev-tip__date">${esc(formatDate(ev.date))}</span><span class="ev-tip__title">${esc(ev.title)}</span><span class="ev-tip__hint">Click for the full note</span>`;
  evTip.hidden = false;
  g.setAttribute("aria-describedby", "ev-tip");
  const r = g.querySelector("rect").getBoundingClientRect();
  const t = evTip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
  const top = r.top - t.height - 10 < 8 ? r.bottom + 10 : r.top - t.height - 10;
  evTip.style.left = `${left + scrollX}px`;
  evTip.style.top = `${top + scrollY}px`;
}
function hideEventTip() { if (evTip) evTip.hidden = true; }

function onEventClick(e) {
  const g = e.target.closest?.(".ev");
  if (!g) return;
  hideEventTip();
  const ev = S.events[+g.dataset.ev];
  const srcIds = ev.source_ids || [ev.source_id];
  const srcTxt = srcIds.map((id) => (SRC[id] ? `${SRC[id].short}: ${SRC[id].dataset.split(":")[0]}` : REFS[id] ? `${REFS[id].authors} (${REFS[id].year})` : id)).join("; ");
  openPopover(`<div class="evpop"><p class="eyebrow">${esc(formatDate(ev.date))}${ev.date_end ? ` to ${esc(ev.date_end)}` : ""}</p>
    <h3>${esc(ev.title)}</h3><p>${esc(ev.note || "")}</p><p class="small muted">Source: ${esc(srcTxt)}</p>
    ${reviewNote(ev.to_check)}</div>`, g, { label: ev.title });
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
        Plot.ruleX(sh, Plot.pointerX({ x: "year", className: "crosshair" })),
        Plot.dot(sh, Plot.pointerX({ x: "year", y: "pct", r: 5, fill: C.refugees, className: "pt-hover" })),
        Plot.tip(sh, Plot.pointerX({ x: "year", y: "pct", title: (d) => `${d.year}: ${fmt(d.pct, { decimals: 1 })}%\n${fmt(d.value)} of ${fmt(d.total)}` })),
      ] }),
    table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: `In ${where}`, type: "num" },
      { key: "total", label: "All host countries", type: "num" }, { key: "pct", label: "Share", type: "pct" }], rows: sh },
  });
  el.insertAdjacentHTML("beforeend", `<p class="tabular split"><strong>${last.year}:</strong> ${esc(where)} ${numHTML(last.value, { year: last.year })}
      <span class="muted" aria-hidden="true">·</span> everywhere else ${numHTML(last.total - last.value)}
      <span class="muted" aria-hidden="true">·</span> total ${numHTML(last.total, { year: last.year })}</p>
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
  const parts = lines.filter(at).map((l) => `${numHTML(at(l).value, { year: ly })} ${l.key === "abroad" ? `refugees from ${esc(S.origin_name)} lived abroad` : `IDPs inside the country (${l.key === "idps_unhcr" ? "UNHCR" : "IDMC"})`}`);
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
          ...lines.map((l) => Plot.text([l.pts[l.pts.length - 1]], { x: "year", y: "value", text: () => l.label, dx: 8, textAnchor: "start", fill: inkOf(l.color), fontWeight: 500, lineWidth: w < 520 ? 6 : 12, className: "end-label" })),
          Plot.ruleX(all, Plot.pointerX({ x: "year", className: "crosshair" })),
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
        ${c.status === "to_confirm" ? unverifiedTag() : ""}</div>
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
    openTrace(CTX.comparePoint(cmp[+b.dataset.cmp]), { el: b, flyFrom: b.querySelector("[data-num]") });
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
  const deaths = (S.violence_deaths || []).filter((d) => d.year >= (S.years?.[0] || 1989) - 5);
  if (deaths.length) {
    const peak = deaths.reduce((a, b) => (b.value > a.value ? b : a));
    chartBlock(host, {
      id: `${S.id}-violence`, filename: `${S.id}_deaths_organized_violence`,
      title: `Deaths in organized violence in ${esc(S.origin_name)} peaked at ${numHTML(peak.value, { year: peak.year })} in ${peak.year}`,
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
  // B2: the 2-3 most relevant conflicts (active in the main displacement years, then intensity; ranked in the
  // pipeline), the rest behind "Show all conflicts (n)". Each period lists the opposing groups as separate tags.
  const cs = S.conflicts || [];
  const TOP = 3;
  const item = (c) => {
    const yrs = runsLabel(c.active_years.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)));
    const war = c.war_years?.length ? `<br>War (1,000+ deaths a year) in ${runsLabel(c.war_years)}` : "";
    const st = [...(c.stretches || [])].reverse();
    const shown = st.slice(0, 2);
    const earlier = st.slice(2);
    const period = (x) => `<li class="conf-st"><span class="conf-st__yrs tabular">${x.years[0] === x.years[1] ? x.years[0] : `${x.years[0]}–${x.years[1]}`}</span>
        <span class="conf-st__sides"><span class="small muted">${esc(c.government_side || "")} against</span>
        <span class="conf-st__groups">${x.groups.map((g) => `<span class="conf-tag">${esc(g)}</span>`).join("")}</span></span></li>`;
    return `<li><span class="conf-list__name">${esc(c.name)}</span><p class="small muted tabular conf-list__yrs">Active in ${yrs}${war}</p>
      ${shown.length ? `<ul class="conf-st-list">${shown.map(period).join("")}</ul>` : ""}
      ${earlier.length ? `<p class="small muted conf-st__earlier">Earlier periods: ${earlier.map((x) => (x.years[0] === x.years[1] ? x.years[0] : `${x.years[0]}–${x.years[1]}`)).join(", ")}</p>` : ""}</li>`;
  };
  const list = cs.length ? `<h3 class="sub-h">Armed conflicts in ${esc(S.origin_name)} (UCDP/PRIO)</h3>
    ${cs.length > TOP ? `<p class="small muted">The ${TOP} most relevant here: active in the main displacement years, then by intensity.</p>` : ""}
    <ul class="conf-list">${cs.slice(0, TOP).map(item).join("")}</ul>
    ${cs.length > TOP ? `<details class="conf-more"><summary><span class="conf-more__open">Show all conflicts (${cs.length})</span><span class="conf-more__close">Show fewer</span></summary>
      <ul class="conf-list">${cs.slice(TOP).map(item).join("")}</ul></details>` : ""}` : "";
  const evs = S.events.length ? `<h3 class="sub-h">Events</h3><ol class="ev-list">${S.events.map((e) => {
    const srcIds = e.source_ids || [e.source_id];
    return `<li><span class="ev-list__date tabular">${esc(formatDate(e.date))}</span><div><strong>${esc(e.title)}</strong><p>${esc(e.note || "")}</p>
      <p class="small muted">Source: ${esc(srcIds.map((id) => (SRC[id] ? SRC[id].short : REFS[id] ? `${REFS[id].authors} (${REFS[id].year})` : id)).join("; "))}</p>${reviewNote(e.to_check)}</div></li>`;
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
      title: `Returns to ${esc(S.origin_name)}${S.type === "pair" ? ` from ${esc(S.host_name)}` : ""}: most in ${pk.year} (${numHTML(pk.value, { year: pk.year })})`,
      summary: `Bar chart of returned refugees per year.`,
      source: sourceLine(["unhcr-solutions-2026"], "Returned refugees counted during each year"),
      note: `${icon("info", { size: 14 })} A yearly count (flow), not a year-end total. Years with no row are shown as gaps, not zeros. ${numHTML(total)} returns over these years in all.`,
      pin: { key: `chart:${S.id}:returns` },
      draw: (w) => Plot.plot({ ...base(w, 200), x: { ...base(w).x, type: "band", tickFormat: (d) => (d % 5 === 0 ? String(d) : "") },
        marks: [Plot.barY(ret, { x: "year", y: "value", fill: C.refugees, fillOpacity: 0.75 }), Plot.ruleY([0], { stroke: "var(--line-strong)" }),
          Plot.tip(ret, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)} returned` }))] }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: "Returned refugees", type: "num" }], rows: ret.map((r) => ({ ...r })) },
      onTrace: (row, t) => openTrace(point(row, "returned_refugees", `Returned refugees, ${row.year}`), { el: t, flyFrom: t.querySelector("[data-num]") }),
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
const srcLabel = (id) => (SRC[id] ? SRC[id].short : REFS[id] ? `${REFS[id].authors} (${REFS[id].year})` : id);
const limSources = (l) => {
  const ids = l.source_ids || (l.source_id ? [l.source_id] : []);
  return ids.length ? `<div class="small muted">Source: ${esc(ids.map(srcLabel).join("; "))}</div>` : "";
};
const KIND_ICON = { politics: "alert", method: "alert", missing: "question", coverage: "question" };
function limitationsHTML() {
  const items = S.limitations.map((l) => {
    const ic = l.text.startsWith("Very slow") ? "steady" : KIND_ICON[l.kind] || "info";
    return `<li class="lim"><span class="lim__icon lim__icon--${esc(l.kind)}">${icon(ic, { size: 20 })}</span>
      <div><div class="lim__text">${esc(l.text)}</div><div class="lim__detail muted">${fillTemplate({ text: l.detail || "", nums: l.nums, pcts: l.pcts })}</div>
      ${limSources(l)}${reviewNote(l.to_check)}</div></li>`;
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
      <td class="tabular">${d.years ? `${d.years[0]} to ${d.years[1]}` : ""}</td><td>${esc(d.release)}${d.status === "to_confirm" ? ` ${unverifiedTag(d.to_check)}` : ""}</td></tr>`).join("");
  const reading = (S.reading || []).map((r) => `<article class="card reading">
      <div><div class="reading__by">${esc(r.authors)} (${r.year})</div><div class="reading__title">${esc(r.title)}</div>
        ${reviewNote(r.to_check)}</div>
      <div class="reading__meta"><span class="small muted">${esc(r.type)}</span>
        ${pinButton({ key: `read:${r.id}`, label: `${r.authors} (${r.year})`, attrs: `data-read="${esc(r.id)}"` })}</div>
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
      // the thin cyan line on the rail slides to the active step
      const ol = a.closest("ol");
      ol?.style.setProperty("--rail-y", `${a.parentElement.offsetTop + 6}px`);
      ol?.style.setProperty("--rail-h", `${Math.max(8, a.parentElement.offsetHeight - 12)}px`);
      if (window.matchMedia("(max-width: 860px)").matches) a.scrollIntoView({ block: "nearest", inline: "center" });
    }
  };
  setCurrent(links[0]?.getAttribute("href").slice(1));
  // while a rail click is scrolling, the clicked step stays current (the observer would light up the steps passed on the way)
  let lockUntil = 0;
  const steps = [...document.querySelectorAll(".step")];
  const pickFromScroll = () => {
    if (Date.now() < lockUntil) return;
    // the last step whose top has passed a line a little below the top bar (and the rail strip on phones)
    const line = (parseFloat(getComputedStyle(steps[0] || document.body).scrollMarginTop) || 72) + 24;
    let cur = steps[0];
    for (const st of steps) if (st.getBoundingClientRect().top <= line) cur = st;
    // at the very bottom the last step counts, even when it is too short to reach the line
    if (Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2) cur = steps[steps.length - 1];
    if (cur) setCurrent(cur.id);
  };
  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; pickFromScroll(); });
  }, { passive: true });
  const unlock = () => { lockUntil = 0; pickFromScroll(); };
  addEventListener("scrollend", () => { if (lockUntil) unlock(); });
  links.forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href").slice(1);
    const target = document.getElementById(id);
    if (!target || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    // a step still waiting to fade in sits 14 px lower: show it at once so the scroll lands in the right place
    if (target.classList.contains("is-hidden")) {
      target.style.transition = "none";
      target.classList.remove("is-hidden");
      void target.offsetHeight;
      target.style.transition = "";
    }
    setCurrent(id);
    lockUntil = Date.now() + 1500;
    history.pushState(null, "", `#${id}`);
    target.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    target.querySelector("h2")?.focus({ preventScroll: true });
    setTimeout(() => { if (lockUntil) unlock(); }, 1500);
  }));
  pickFromScroll();
}

// =================================================================== motion: reveal steps, count up the key numbers
/** Steps below the fold fade and rise in the first time they scroll into view (once each). */
function revealSteps() {
  if (reducedMotion() || !("IntersectionObserver" in window)) return;
  const vh = window.innerHeight;
  const later = [...document.querySelectorAll(".step")].filter((st) => st.getBoundingClientRect().top > vh * 0.92);
  if (!later.length) return;
  document.documentElement.classList.add("reveal-on");
  later.forEach((st) => st.classList.add("is-hidden"));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.remove("is-hidden");
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" });
  later.forEach((st) => io.observe(st));
}

/** The key figures count up to their exact value the first time they are seen (about 600 ms), ending on the exact
 *  number in the chosen format. Once per situation per session; never with reduced motion. */
function countUp(root) {
  if (!root || reducedMotion() || !("IntersectionObserver" in window)) return;
  const key = `wv1:counted:${S.id}`;
  try { if (sessionStorage.getItem(key)) return; } catch { return; }
  const spans = [...root.querySelectorAll(".kn__value [data-num], .kn__value [data-pct]")];
  if (!spans.length) return;
  const show = (el, k) => {
    const pct = el.hasAttribute("data-pct");
    const v = Number(pct ? el.dataset.pct : el.dataset.num);
    el.textContent = pct ? fmtPct(Math.round(v * k * 10) / 10) : fmt(Math.round(v * k));
  };
  spans.forEach((el) => show(el, 0));
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 600);
      const k = 1 - Math.pow(1 - t, 3);
      if (t < 1) { spans.forEach((el) => show(el, k)); requestAnimationFrame(step); }
      else applyNumbers(root);                 // the exact value, in the format chosen now
    };
    requestAnimationFrame(step);
  }, { threshold: 0.4 });
  io.observe(root);
  document.addEventListener("numfmt-change", () => applyNumbers(root), { once: true });
}

