// "Who is in this group: age and sex": UNHCR's demographic data for a page, explained.
// Every number and share comes from the pipeline (build_web.py demo_doc); sentences are templates filled with fmt(),
// so the number format switch reaches them. Numbers open the source trace (original row, or the rows behind a sum)
// where the page allows it (onTrace); the country page shows them as plain numbers.
//
//   ageSexBlock(host, D, { id, group, missing, requestHref, onTrace(point, origin) })
//   D: the page's "demographics" object (null: UNHCR has no age or sex figures for this group)
import { esc, fmt, fmtPct, numHTML, pctHTML, fillTemplate, applyNumbers } from "./format.js";
import { chartBlock, Plot, base } from "./charts.js";

const AGES = [["demo_age_0_4", "0–4"], ["demo_age_5_11", "5–11"], ["demo_age_12_17", "12–17"], ["demo_age_18_59", "18–59"], ["demo_age_60", "60 and over"]];
const SOURCE = "Source: UNHCR Refugee Data Finder, demographics (2026 release). Year-end figures.";
const term = (id, word) => `<span class="term" tabindex="0" data-term="${id}">${word}</span>`;

/** The block's figures by measure id: values and shares exactly as the pipeline gives them. */
function figures(D) {
  const s = D.sex;
  const a = D.age;
  const out = {
    demo_total: { label: "All refugees", value: D.total, pct: null },
    demo_women: { label: "Women", value: s.women, pct: s.pct.women },
    demo_men: { label: "Men", value: s.men, pct: s.pct.men },
    demo_sex_unknown: { label: "Sex not recorded", value: s.sex_unknown, pct: s.pct.sex_unknown },
    demo_age_unknown: { label: "Age unknown", value: a.age_unknown, pct: a.pct.age_unknown },
  };
  AGES.forEach(([m, lab], i) => { out[m] = { label: `Aged ${lab}`, short: lab, value: a.groups.values[i], pct: a.groups.pcts[i] }; });
  return out;
}

/** A stacked bar with a legend row under it (labels never sit on small segments). */
function bar(kind, segs, total, words) {
  const shown = segs.filter((x) => x.value > 0);
  const said = shown.map((x) => `${x.label} ${fmt(x.value)} (${fmtPct(x.pct)})`).join(", ");
  return `<div class="asx-bar asx-bar--${kind}" role="img" aria-label="${esc(`${words} of ${fmt(total)} refugees: ${said}.`)}">
      ${shown.map((x) => `<span class="asx-seg asx-seg--${x.cls}" style="flex-grow:${x.value}" data-v="${x.value}"></span>`).join("")}</div>
    <ul class="asx-legend">${shown.map((x) => `<li><i class="asx-sw asx-seg--${x.cls}" aria-hidden="true"></i><span class="asx-legend__what">${x.labelHTML || esc(x.label)}</span>
      <span class="asx-legend__n">${x.trace ? `<span class="num-link" role="button" tabindex="0" data-m="${x.m}">${numHTML(x.value)}</span>` : numHTML(x.value)}</span>
      <span class="asx-legend__p">${pctHTML(x.pct)}</span></li>`).join("")}</ul>`;
}

export function ageSexBlock(host, D, { id = "age-sex", group = "this group", missing = [], requestHref = "request.html", onTrace = null, idBase = "page" } = {}) {
  const wrap = document.createElement("section");
  wrap.className = "asx";
  wrap.id = id;
  wrap.setAttribute("aria-labelledby", `${id}-h`);
  host.append(wrap);
  const missingHTML = missing.length ? `<h4 class="asx__h4">What's missing</h4>
      <ul class="asx-missing">${missing.map((x) => `<li><strong>${esc(x.item)}:</strong> ${esc(x.why)}</li>`).join("")}</ul>
      <p class="small"><a href="${esc(requestHref)}">Know a source? Request data &rsaquo;</a></p>` : "";
  if (!D) {
    wrap.innerHTML = `<h3 class="sub-h" id="${id}-h">Who is in this group: age and sex</h3>
      <p>UNHCR has no age or sex figures for this group.</p>
      <p class="small muted">So this data can't tell you how many are women, men or children. ${SOURCE.replace("Source: ", "Checked: ")}</p>${missingHTML}`;
    return wrap;
  }
  const F = figures(D);
  const trace = !!onTrace && D.traceable !== false;
  const seg = (m, cls, extra = {}) => ({ m, cls, label: F[m].label, value: F[m].value, pct: F[m].pct, trace, ...extra });
  const sexSegs = [seg("demo_women", "women"), seg("demo_men", "men"), seg("demo_sex_unknown", "unknown")];
  const ageSegs = [...AGES.map(([m], i) => seg(m, `age${i + 1}`, { label: F[m].short })),
    seg("demo_age_unknown", "unknown", { labelHTML: term("age_unknown", "Age unknown") })];
  const ageKnown = D.age.age_known > 0;

  wrap.innerHTML = `<h3 class="sub-h" id="${id}-h">Who is in this group: age and sex</h3>
    <p class="asx__intro">UNHCR reports refugees by sex and age group when the host country gives it that information (its ${term("demographics", "demographics")}). Here's how much of that is known for ${esc(group)} in ${D.year}.</p>
    <div class="asx__bars"></div>
    <div class="asx__time"></div>
    <h4 class="asx__h4">What this means for your research</h4>
    <ul class="asx-notes">${D.notes.map((n) => `<li>${fillTemplate(n)}</li>`).join("")}</ul>
    ${missingHTML}`;

  // the two bars, as one chart block (Data view, PNG and CSV like any chart)
  const rows = [...sexSegs.map((x) => ({ group: x.label, part: "Sex", m: x.m, value: x.value, share: x.pct })),
    ...ageSegs.map((x) => ({ group: x.m === "demo_age_unknown" ? "Age unknown" : `Aged ${x.label}`, part: "Age", m: x.m, value: x.value, share: x.pct }))]
    .map((r) => ({ ...r, raw_ref: trace ? (D.raw_ref ?? null) : undefined }));
  chartBlock(wrap.querySelector(".asx__bars"), {
    id: `${idBase}-age-sex`, filename: `${idBase}_age_sex_${D.year}`,
    title: `Sex and age of ${esc(group)}, ${D.year} (${numHTML(D.total)} refugees)`,
    summary: `Two stacked bars: sex (women, men, not recorded) and age group (0–4 to 60 and over, age unknown) of ${group} in ${D.year}.`,
    source: `${SOURCE}${D.note ? ` ${esc(D.note)}.` : ""}`,
    draw: () => {
      const d = document.createElement("div");
      d.className = "asx-chart";
      d.innerHTML = `<h4 class="asx__h4">Sex</h4>${bar("sex", sexSegs, D.total, "Sex")}
        <p class="asx__sentence">${fillTemplate(D.sentences.sex)}</p>
        <h4 class="asx__h4">Age</h4>
        ${ageKnown ? bar("age", ageSegs, D.total, "Age group") : ""}
        <p class="asx__sentence">${fillTemplate(D.sentences.age)}</p>`;
      return d;
    },
    table: { columns: [{ key: "part", label: "", type: "text" }, { key: "group", label: "Group", type: "text" },
      { key: "value", label: "Refugees", type: "num" }, { key: "share", label: "Share of the group", type: "pct" }], rows },
    onTrace: trace ? (row, t) => onTrace(point(D, row.m, F, group), { el: t, flyFrom: t.querySelector("[data-num]") }) : undefined,
  });

  // over time: is reporting getting better or worse (three years or more)
  const ser = D.series || [];
  if (ser.length >= 3) {
    const withAge = ser.some((r) => r[3] > 0);
    const pts = ser.flatMap((r) => [{ year: r[0], k: "Sex recorded", v: r[4] }, ...(withAge ? [{ year: r[0], k: "Age recorded", v: r[5] }] : [])]);
    chartBlock(wrap.querySelector(".asx__time"), {
      id: `${idBase}-age-sex-time`, filename: `${idBase}_age_sex_coverage`,
      title: `Share with sex recorded${withAge ? " and with age recorded" : ""}, ${ser[0][0]}–${ser[ser.length - 1][0]}`,
      summary: `Line chart of the share of ${group} with sex${withAge ? " and age" : ""} recorded each year.`,
      source: SOURCE,
      draw: (w) => Plot.plot({ ...base(w, 200), y: { label: null, domain: [0, 100], ticks: [0, 50, 100], tickFormat: (d) => `${d}%`, grid: true },
        color: { domain: ["Sex recorded", "Age recorded"], range: ["var(--c-refugees)", "var(--as-3)"] },
        marks: [Plot.ruleY([0], { stroke: "var(--line-strong)" }),
          Plot.lineY(pts, { x: "year", y: "v", stroke: "k", strokeWidth: 2 }),
          Plot.text(pts.filter((p) => p.year === ser[ser.length - 1][0]), { x: "year", y: "v", text: "k", dx: 8, textAnchor: "start", fill: "k", lineWidth: w < 520 ? 5 : 16, className: "end-label" }),
          Plot.tip(pts, Plot.pointerX({ x: "year", y: "v", title: (p) => `${p.k}, ${p.year}: ${fmtPct(p.v)}` }))] }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "total", label: "Refugees", type: "num" },
        { key: "sk", label: "Sex recorded", type: "num" }, { key: "sp", label: "Share", type: "pct" },
        { key: "ak", label: "Age recorded", type: "num" }, { key: "ap", label: "Share", type: "pct" }],
        rows: ser.map((r) => ({ year: r[0], total: r[1], sk: r[2], ak: r[3], sp: r[4], ap: r[5] })) },
    });
  }

  // numbers in the legend and the sentences open the source trace
  if (trace) {
    const byValue = new Map();
    for (const [m, f] of Object.entries(F)) if (!byValue.has(f.value)) byValue.set(f.value, m);
    const link = (root) => root.querySelectorAll(".asx__sentence [data-num]").forEach((s) => {
      if (s.closest(".num-link")) return;
      const m = byValue.get(Number(s.dataset.num));
      if (!m) return;
      const b = document.createElement("span");
      b.className = "num-link";
      b.setAttribute("role", "button");
      b.tabIndex = 0;
      b.dataset.m = m;
      s.replaceWith(b);
      b.append(s);
    });
    link(wrap);
    new MutationObserver(() => link(wrap)).observe(wrap, { childList: true, subtree: true });
    const open = (e) => {
      const b = e.target.closest?.("[data-m]");
      if (!b || !wrap.contains(b)) return;
      if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      onTrace(point(D, b.dataset.m, F, group), { el: b, flyFrom: b.querySelector("[data-num]") });
    };
    wrap.addEventListener("click", open);
    wrap.addEventListener("keydown", open);
  }
  applyNumbers(wrap);
  return wrap;
}

/** A figure of the block as the source trace takes it. */
function point(D, m, F, group) {
  const f = F[m];
  return { value: f.value, unit: "people", year: D.year, measure_id: m, source_id: D.source_id || "unhcr-demographics-2026",
    raw_ref: D.raw_ref || null, note: D.note || null, label: `${f.label === "All refugees" ? "Refugees" : f.label}, ${group}, ${D.year}` };
}

