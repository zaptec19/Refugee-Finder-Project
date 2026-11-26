// Pages for every origin-host pair and every <country>-idp, built in the browser when build_web.py didn't write one
// (it writes pages only for the larger situations). Same shape as data/web/situation/<id>.json, made with the same
// rules as pipeline/build_web.py build_situation(), from:
//   data/web/rows/<o>-<measure>.json   UNHCR rows by origin (host, value, line in the original file);
//   data/web/rows-index.json           which measures each origin has rows for;
//   data/web/names.json                short names, names in a sentence, demonyms, regions (the titles' rules).
// Numbers come only from those rows. Zeros:
//   - a 0 in UNHCR's file is shown as 0 with "0 or not reported (UNHCR doesn't distinguish)";
//   - a pair with no row at all is shown as 0 for the origin's years, marked not_recorded, with the note
//     "UNHCR's data has no record of people from <origin> in <host> for <years>. Shown as 0.";
//   - a missing year inside a series that has data stays missing ("no data"), as everywhere else.
// retarget(S, measure) points a built pair page at another people type (asylum seekers, OIP) the same way.
import { getJSON, getOptionalJSON } from "./data.js";

export const CROSS = ["refugees", "asylum_seekers", "oip"];
export const WORD = { refugees: "refugees", asylum_seekers: "asylum seekers", oip: "people in need of international protection" };
export const ZERO_NOTE = "0 or not reported (UNHCR doesn't distinguish)";
const JUMP = 0.5;
const STEADY_RUN = 8;
const STEADY_MAX = 0.03;
const UNHCR = "unhcr-pop-2026";

let namesP = null;
let indexP = null;
export const loadNames = () => (namesP ||= getJSON("data/web/names.json"));
const loadIndex = () => (indexP ||= getJSON("data/web/rows-index.json"));

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);

/** "Russian refugees in India", "Refugees from the Niger in Chad": build_web.py group_title(). */
/** "Afghan refugees", "refugees from Myanmar"; stateless people and an unknown origin are not a country. */
export function people(N, o, word, start = false) {
  const w = start ? cap(word) : word;
  if (o === "XXA") return `${start ? "Stateless" : "stateless"} ${word}`;
  if (o === "UNK") return `${w} of unknown origin`;
  const dem = N[o]?.d;
  return dem ? `${dem} ${word}` : `${w} from ${N[o]?.p || o}`;
}

export function groupTitle(N, o, measure, h) {
  const head = people(N, o, WORD[measure] || "people", true);
  return h ? `${head} in ${N[h]?.p || h}` : head;
}

function yearsLabel(ys) {
  if (ys.length === 1) return String(ys[0]);
  if (ys.length === 2) return `${ys[0]} and ${ys[1]}`;
  if (ys.every((y, i) => !i || y === ys[i - 1] + 1)) return `${ys[0]} to ${ys[ys.length - 1]}`;
  return `${ys.slice(0, -1).join(", ")} and ${ys[ys.length - 1]}`;
}

function peak(s) {
  if (!s.length) return [null, []];
  const mx = Math.max(...s.map((p) => p.value));
  return [mx, s.filter((p) => p.value === mx).map((p) => p.year)];
}

function overTimeHeadline(subject, s) {
  if (s.length < 2) return null;
  const [pk, pky] = peak(s);
  const first = s[0];
  const last = s[s.length - 1];
  const after = pky.length ? s.filter((p) => p.year > pky[pky.length - 1]) : [];
  if (after.length) {
    const low = after.reduce((a, b) => (b.value < a.value || (b.value === a.value && b.year > a.year) ? b : a));
    if (pk && low.value <= 0.7 * pk) return { text: `${subject} fell from {n0} (${pky[0]}) to {n1} (${low.year})`, nums: [pk, low.value], years: [pky[0], low.year] };
    if (pk >= 1.3 * Math.max(first.value, 1)) return { text: `${subject} rose from {n0} (${first.year}) to a peak of {n1} (${pky[0]})`, nums: [first.value, pk], years: [first.year, pky[0]] };
  }
  if (last.value >= 1.3 * Math.max(first.value, 1)) return { text: `${subject} rose from {n0} (${first.year}) to {n1} (${last.year})`, nums: [first.value, last.value], years: [first.year, last.year] };
  const lo = Math.min(...s.map((p) => p.value));
  return { text: `${subject} stayed between {n0} and {n1} from ${first.year} to ${last.year}`, nums: [lo, pk], years: [first.year, last.year] };
}

function autoLimitations(s) {
  const out = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    if (b.year !== a.year + 1 || !a.value) continue;
    const ch = (b.value - a.value) / a.value;
    if (Math.abs(ch) > JUMP && Math.max(a.value, b.value) >= 1000) {
      out.push({ kind: "pattern", auto: true, text: `Big change between ${a.year} and ${b.year}`,
        detail: "The figure went from {n0} to {n1} in one year. The source data doesn't say why; a change in counting can look like real movement.",
        nums: [a.value, b.value] });
    }
  }
  let run = s.length ? [s[0]] : [];
  let best = [];
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    if (b.year === a.year + 1 && a.value && Math.abs(b.value - a.value) / a.value < STEADY_MAX) run.push(b);
    else { if (run.length > best.length) best = run; run = [b]; }
  }
  if (run.length > best.length) best = run;
  if (best.length >= STEADY_RUN) {
    out.push({ kind: "pattern", auto: true, text: `Very slow, steady change ${best[0].year} to ${best[best.length - 1].year}`,
      detail: `Each year the figure moves by less than ${Math.round(STEADY_MAX * 100)}%. Steady figures can come from registers that are updated rather than recounted; the sources don't say which.` });
  }
  return out;
}

function explainer(MEAS, measure, { what, kindOverride = null, extraNot = null }) {
  const kind = kindOverride || MEAS[measure]?.kind;
  const type = { stock: "A stock: people present at the end of the year, not the number who arrived that year.",
    flow: "A flow: counted during the year, not a year-end total.",
    share: "A share: one year-end stock divided by another, both from the same source." }[kind] || "";
  const notInc = extraNot || {
    refugees: "Asylum seekers, people never registered, and people counted under other groups.",
    asylum_seekers: "People already recognised as refugees, and people who never applied.",
    oip: "Refugees and asylum seekers (counted separately).",
    idps_unhcr: "IDPs displaced by disasters, and IDPs UNHCR does not protect or assist.",
    idps_idmc_conflict: "People displaced by disasters (counted separately) and people who crossed a border.",
  }[measure] || "";
  const src = (MEAS[measure]?.source_ids || [""])[0];
  const reliability = src.startsWith("idmc")
    ? "Most IDMC figures are estimates built from several sources (governments, UN agencies, media)."
    : "Reported to UNHCR, often by the host government. The data does not say, row by row, whether a figure is a government count, a registration count or an estimate.";
  return { counted: what, type, not_included: notInc, reliability, learn: "stocks-vs-flows" };
}

async function rowsDoc(o, measure) {
  const idx = await loadIndex();
  if (!(idx[o] || []).includes(measure)) return null;
  return getOptionalJSON(`data/web/rows/${o.toLowerCase()}-${measure}.json`);
}

/** The pair's own series from an origin's rows file (with the original row of each figure). */
function pairSeries(doc, h) {
  if (!doc) return [];
  const out = [];
  for (const [y, rows] of Object.entries(doc.years)) {
    const r = rows.find((x) => x[0] === h);
    if (!r) continue;
    const p = { year: +y, value: r[1], source_id: doc.source_id, footnote: null, raw_ref: `${doc.file.replace("{year}", y)}#L${r[2]}` };
    if (r[1] === 0) p.note = ZERO_NOTE;
    out.push(p);
  }
  return out.sort((a, b) => a.year - b.year);
}

/** All hosts together, per year (what build_web.py's sum_by_origin gives). */
function totals(doc) {
  const t = new Map();
  if (!doc) return t;
  for (const [y, rows] of Object.entries(doc.years)) t.set(+y, [rows.reduce((s, r) => s + r[1], 0), rows.length]);
  return t;
}

const yearsOf = (doc) => (doc ? Object.keys(doc.years).map(Number).sort((a, b) => a - b) : []);

/** Everything on a pair page that depends on which people type leads (build_web.py, the same rules). */
async function fillMain(S, measure, N, MEAS) {
  const o = S.origin_iso3;
  const h = S.host_iso3;
  const doc = await rowsDoc(o, measure);
  const word = WORD[measure];
  let s = S.series[measure] || pairSeries(doc, h);
  let notRecorded = false;
  if (!s.length) {
    // never recorded: 0 for the years the origin has any figure for this group (or the measure's span), clearly marked
    const ys = yearsOf(doc);
    const span = ys.length ? ys : [2025];
    const years = span.length > 1 ? `${span[0]} to ${span[span.length - 1]}` : String(span[0]);
    const note = `UNHCR's data has no record of ${people(N, o, word)} in ${N[h].p} for ${years}. Shown as 0.`;
    const from = span[0];
    const to = span[span.length - 1];
    s = [];
    for (let y = from; y <= to; y++) s.push({ year: y, value: 0, source_id: UNHCR, footnote: null, raw_ref: null, not_recorded: true, note });
    notRecorded = note;
  }
  S.series[measure] = s;
  S.main_measure = measure;
  S.title = S.titleFixed || groupTitle(N, o, measure, h);
  const subject = S.title;
  // origin total and this host's share
  const tot = totals(doc);
  S.origin_total = [...tot.entries()].sort((a, b) => a[0] - b[0]).map(([y, [v, n]]) => ({ year: y, value: v, source_id: UNHCR, note: `Sum of ${n} host countries` }));
  S.share = notRecorded ? [] : s.filter((p) => tot.get(p.year)?.[0]).map((p) => ({ year: p.year, value: p.value, total: tot.get(p.year)[0], pct: pct(p.value, tot.get(p.year)[0]) }));
  S.hosts_latest = [];
  if (S.origin_total.length && doc) {
    const ly = S.origin_total[S.origin_total.length - 1].year;
    const per = (doc.years[String(ly)] || []).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
    S.hosts_latest = per.slice(0, 10).map((r) => ({ host_iso3: r[0], name: N[r[0]]?.n || r[0], value: r[1], year: ly }));
    if (per.length > 10) S.hosts_latest.push({ host_iso3: null, name: `${per.length - 10} other countries`, value: per.slice(10).reduce((a, r) => a + r[1], 0), year: ly, note: "Sum of the remaining host countries" });
  }
  // key numbers
  const kn = [];
  const lp = s[s.length - 1];
  const [pk, pky] = peak(s);
  const zeroSub = lp.not_recorded ? "no record in UNHCR's data, shown as 0" : lp.value === 0 ? `year-end total · ${ZERO_NOTE}` : "year-end total";
  kn.push({ label: `${cap(word)} in ${N[h].n}, ${lp.year}`, value: lp.value, year: lp.year, measure_id: measure, source_id: UNHCR, sub: zeroSub, unit: "people",
    raw_ref: lp.raw_ref, footnote: null, not_recorded: !!lp.not_recorded, note: lp.not_recorded ? lp.note : lp.note || null,
    explainer: explainer(MEAS, measure, { what: `${groupTitle(N, o, measure, h)} on 31 December ${lp.year}, as reported to UNHCR.` }) });
  if (!notRecorded && pk !== null && !(pky.length === 1 && pky[0] === lp.year)) {
    const pp = s.find((p) => p.year === pky[0]);
    kn.push({ label: `Peak (${yearsLabel(pky)})`, value: pk, year: pky[0], measure_id: measure, source_id: UNHCR, sub: "highest on record", unit: "people",
      raw_ref: pp.raw_ref, footnote: null, years: pky,
      explainer: explainer(MEAS, measure, { what: `The highest year-end figure in UNHCR's series for this group (${s[0].year} to ${s[s.length - 1].year}).` }) });
  } else if (!notRecorded && s.length > 1) {
    const fp = s[0];
    kn.push({ label: `In ${fp.year}`, value: fp.value, year: fp.year, measure_id: measure, source_id: UNHCR, sub: "first year in UNHCR's data", unit: "people",
      raw_ref: fp.raw_ref, footnote: null,
      explainer: explainer(MEAS, measure, { what: `The first year-end figure in UNHCR's series for this group (${fp.year}). The latest figure (${lp.year}) is also the highest on record.` }) });
  }
  if (S.share.length) {
    const ls = S.share[S.share.length - 1];
    const who = people(N, o, word);
    kn.push({ label: `Share of all ${who}`, value: ls.pct, year: ls.year, measure_id: measure, source_id: UNHCR, sub: `${word} worldwide, ${ls.year}`, unit: "percent",
      numerator: ls.value, denominator: ls.total, nums: [ls.value, ls.total],
      explainer: explainer(MEAS, measure, { kindOverride: "share", what: `${groupTitle(N, o, measure, h)} as a share of all ${who} in every host country on 31 December ${ls.year} ({n0} of {n1}).`,
        extraNot: "People displaced inside the country of origin, and people counted under other groups." }) });
  }
  S.key_numbers = kn.slice(0, 3);
  // headlines
  S.headlines = { ...(S.headlines || {}), over_time: notRecorded ? { text: `${subject}: no record in UNHCR's data, shown as 0`, nums: [], years: [] } : overTimeHeadline(subject, s) };
  delete S.headlines.where_people_are;
  if (S.share.length) {
    const big = Math.max(...S.share.map((p) => p.value));
    const s0 = S.share.find((p) => p.value >= 0.01 * big);
    const s1 = S.share[S.share.length - 1];
    const who = people(N, o, word);
    const where = N[h].p;
    S.headlines.where_people_are = { text: `${cap(where)} hosts {p0} of all ${who} (${s1.year}), ${s1.pct < s0.pct ? "down" : "up"} from {p1} in ${s0.year}`,
      pcts: [s1.pct, s0.pct], years: [s1.year, s0.year] };
  }
  // limitations: the page's own (team-written) ones stay; the automatic ones follow this group
  const own = (S.limitations || []).filter((l) => !l.auto);
  const lims = [...own, ...autoLimitations(s)];
  if (notRecorded) lims.unshift({ kind: "missing", auto: true, text: "No record in UNHCR's data", detail: notRecorded });
  else if (s.some((p) => p.value === 0)) lims.push({ kind: "missing", auto: true, text: "Some years show 0", detail: `In UNHCR's data a 0 can mean 0 or not reported; it doesn't distinguish. ${s.filter((p) => p.value === 0).length} of ${s.length} years show 0.` });
  S.limitations = lims;
  S.years = [s[0].year, s[s.length - 1].year];
  S.steps = { ...(S.steps || {}), key_numbers: true, over_time: s.length >= 2 || notRecorded, where_people_are: S.share.length > 0, limitations: true, sources: true };
  S.not_recorded = !!notRecorded;
  return S;
}

/** Point a built pair page at another people type (?m=asylum_seekers): key numbers, charts and headlines follow it. */
export async function retarget(S, measure, MEAS) {
  if (S.type !== "pair" || !CROSS.includes(measure) || measure === S.main_measure) return S;
  const N = await loadNames();
  return fillMain(S, measure, N, MEAS);
}

/** Parse "<o>-<h>" / "<c>-idp" into ISO3 codes, or null. */
export function parseId(id) {
  const m = /^([a-z]{3})-([a-z]{3})$/i.exec(id || "");
  if (!m) return null;
  return { o: m[1].toUpperCase(), h: m[2].toUpperCase() };
}

/** A page built in the browser for any pair or any <c>-idp. Throws (status 404) for codes we don't know. */
export async function buildAuto(id, { MEAS, measure = null } = {}) {
  const p = parseId(id);
  const N = await loadNames();
  const notFound = () => Object.assign(new Error("There is no situation with this id."), { status: 404 });
  if (!p || !N[p.o]) throw notFound();
  if (p.h === "IDP") return buildIdp(p.o, N, MEAS);
  if (!N[p.h] || p.o === p.h) throw notFound();
  const { o, h } = p;
  const docs = Object.fromEntries(await Promise.all([...CROSS, "returns"].map(async (m) => [m, await rowsDoc(o, m)])));
  const series = {};
  for (const m of CROSS) {
    const s = pairSeries(docs[m], h);
    if (s.length) series[m] = s;
  }
  const ret = pairSeries(docs.returns, h);
  if (ret.length) series.returns = ret;
  // lead with the group asked for, else the one with the largest latest value (build_web.py main_measure_for)
  let main = CROSS.includes(measure) ? measure : null;
  if (!main) {
    let key = null;
    for (const m of CROSS) {
      const s = series[m];
      if (!s?.length) continue;
      const k = [s[s.length - 1].value, Math.max(...s.map((x) => x.value))];
      if (!key || k[0] > key[0] || (k[0] === key[0] && k[1] > key[1])) { key = k; main = m; }
    }
    main ||= "refugees";
  }
  const S = {
    id: id.toLowerCase(), title: "", type: "pair", origin_iso3: o, host_iso3: h, origin_name: o === "XXA" ? "no country (stateless)" : N[o].n, host_name: N[h].n,
    years: null, region: N[o].r, aliases: [], status: "auto", status_note: null, note: null, auto: true,
    main_measure: main, series, share: [], origin_total: [], hosts_latest: [], key_numbers: [], compare: [], compare_why: null,
    conflict: [], conflicts: [], main_years: [], violence_deaths: [], events: [], limitations: [],
    demographics_coverage: 0, sex_coverage: 0, demographics_year: null, missing: [], reading: [],
    datasets: [UNHCR, ...(ret.length ? ["unhcr-solutions-2026"] : [])], other_angles: {}, headlines: {},
    steps: { brief: false, inside_outside: false, compare: false, context: false, other_angles: false },
    brief_sources: [], footnotes: {}, raw_files: {}, raw_rows: {},
  };
  await fillMain(S, main, N, MEAS);
  // who is in this group: age and sex (data/web/demo/<o>.json, made by build_web.py for pairs without a page file)
  const idx = await getOptionalJSON("data/web/demo-index.json");
  const demo = idx?.includes(o) ? (await getOptionalJSON(`data/web/demo/${o.toLowerCase()}.json`))?.[h] || null : null;
  S.demo_group = `${N[o].d ? `${N[o].d} refugees` : `Refugees from ${N[o].p}`} in ${N[h].p}`;
  S.demographics = demo ? { ...demo, group: S.demo_group, source_id: UNHCR.replace("pop", "demographics"), n_parts: 1, note: null, traceable: true } : null;
  S.missing_items = demo ? [...(demo.sex.women + demo.sex.men === 0 ? [{ item: "Sex", why: "women and men are not reported for this group." }] : []),
    ...(demo.age.age_known === 0 ? [{ item: "Age", why: "no age groups are reported for this group." }] : [])] : [];
  S.steps.other_angles = true;
  if (demo) S.datasets.push(S.demographics.source_id);
  return S;
}

/** <c>-idp for a country without a built page: IDMC and UNHCR have no internal displacement figures for it. */
function buildIdp(c, N, MEAS) {
  const note = `IDMC and UNHCR have no internal displacement figures for ${N[c].p}.`;
  const s = [];
  for (let y = 1993; y <= 2025; y++) s.push({ year: y, value: 0, source_id: UNHCR, footnote: null, raw_ref: null, not_recorded: true, note });
  return {
    id: `${c.toLowerCase()}-idp`, title: `Internal displacement in ${N[c].p}`, type: "idp", origin_iso3: c, host_iso3: null,
    origin_name: N[c].n, host_name: null, years: [1993, 2025], region: N[c].r, aliases: [], status: "auto", auto: true,
    main_measure: "idps_unhcr", series: { idps_unhcr: s }, share: [], origin_total: [], hosts_latest: [],
    key_numbers: [{ label: `IDPs of concern to UNHCR, 2025`, value: 0, year: 2025, measure_id: "idps_unhcr", source_id: UNHCR,
      sub: "no figures recorded, shown as 0", unit: "people", raw_ref: null, not_recorded: true, note,
      explainer: explainer(MEAS, "idps_unhcr", { what: `People displaced inside ${N[c].p} by conflict or violence on 31 December 2025, as reported to UNHCR. ${note}` }) }],
    compare: [], compare_why: null, conflict: [], conflicts: [], main_years: [], violence_deaths: [], events: [],
    limitations: [{ kind: "missing", auto: true, text: "No internal displacement figures", detail: `${note} Shown as 0.` }],
    demographics_coverage: 0, sex_coverage: 0, demographics_year: null, missing: [], reading: [], datasets: [UNHCR, "idmc-conflict-2026"],
    other_angles: {}, headlines: { over_time: { text: `Internal displacement in ${N[c].p}: no figures, shown as 0`, nums: [], years: [] } },
    steps: { brief: false, key_numbers: true, over_time: true, where_people_are: false, inside_outside: false, compare: false, context: false, other_angles: false, limitations: true, sources: true },
    brief_sources: [], footnotes: {}, raw_files: {}, raw_rows: {}, not_recorded: true,
  };
}
