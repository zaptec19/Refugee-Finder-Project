// Search behind every search box: understands meaning, not just exact words.
//  - Semantic: the question is embedded in the browser (Transformers.js, all-MiniLM-L6-v2, in a worker)
//    and compared with pre-made situation vectors (data/web/search-vectors.bin, int8).
//  - Keyword: MiniSearch over titles, aliases and place names, with prefix and typo tolerance.
//  - Years in the question ("since 2015", "after 2021", "1990s", "2023") become filters.
// Keyword results show at once; blended results replace them when the model is ready.
// Nothing is hard-coded: no keyword or synonym lists. Every word comes from the data.
import MiniSearch from "https://cdn.jsdelivr.net/npm/minisearch@7.1.0/+esm";
import { getJSON } from "./data.js";
import { SEARCH_DEMONYMS } from "./config.js";

let state = "idle";             // idle (model not asked for yet) -> loading -> ready | keyword (model failed: keyword only)
const listeners = new Set();
export const engineState = () => state;
export const onEngineChange = (cb) => listeners.add(cb);
function setState(s) {
  state = s;
  listeners.forEach((cb) => cb(s));
}

// ------------------------------------------------------------------ data
let ready;
function load() {
  if (ready) return ready;
  ready = (async () => {
    const [sits, countries, meta, buf] = await Promise.all([
      getJSON("data/web/situations.json"), getJSON("data/web/countries.json"), getJSON("data/web/search-index.json"),
      fetch("data/web/search-vectors.bin").then((r) => r.arrayBuffer()),
    ]);
    const vectors = new Int8Array(buf);
    const byId = new Map(sits.map((s) => [s.id, s]));
    const names = (iso) => {
      const c = countries[iso];
      return c ? [c.name, c.demonym, ...(c.other_names || [])].filter(Boolean).join(" ") : "";
    };
    const ms = new MiniSearch({
      fields: ["title", "aliases", "origin", "host", "region"],
      storeFields: ["id"],
      processTerm: (t) => norm(t),
      searchOptions: { boost: { title: 3, aliases: 3, origin: 2, host: 2 }, prefix: (t) => t.length >= 4, fuzzy: (t) => (t.length >= 5 ? 0.2 : 0) },
    });
    ms.addAll(sits.map((s) => ({
      id: s.id, title: s.title, aliases: (s.aliases || []).join(" "), origin: names(s.origin_iso3),
      host: [s.host_iso3, ...(s.hosts || [])].filter(Boolean).map(names).join(" "), region: s.region || "",
    })));
    // countries that appear in at least one situation, with the years they cover
    const span = new Map();
    for (const s of sits) {
      for (const iso of [s.origin_iso3, s.host_iso3, ...(s.hosts || [])].filter(Boolean)) {
        const r = span.get(iso) || [9999, 0];
        if (s.years) span.set(iso, [Math.min(r[0], s.years[0]), Math.max(r[1], s.years[1])]);
      }
    }
    const cs = new MiniSearch({ fields: ["names"], storeFields: ["iso", "name"], processTerm: (t) => norm(t),
      searchOptions: { prefix: (t) => t.length >= 4, fuzzy: (t) => (t.length >= 5 ? 0.2 : 0) } });
    cs.addAll([...span.keys()].filter((iso) => countries[iso]).map((iso) => ({ id: iso, iso, name: countries[iso].name, names: names(iso) })));
    const rowIndex = new Map(meta.ids.map((id, i) => [id, i]));
    // country names and demonyms (from countries.json), to notice which places a question names
    const placeNames = [];
    for (const iso of span.keys()) {
      const c = countries[iso];
      if (!c) continue;
      for (const n of new Set([c.name, c.demonym, ...(c.other_names || []), ...(SEARCH_DEMONYMS[iso] || [])].filter(Boolean))) {
        const t = norm(n).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        if (t.length >= 4) placeNames.push([iso, ` ${t} `]);
      }
    }
    placeNames.sort((a, b) => b[1].length - a[1].length);
    return { sits, byId, ms, cs, span, vectors, meta, rowIndex, placeNames };
  })();
  ready.catch((e) => { console.error(e); setState("keyword"); });
  return ready;
}

// ------------------------------------------------------------------ model (worker)
let worker = null;
let seq = 0;
const pending = new Map();
function startModel({ meta }) {
  if (worker) return;
  setState("loading");
  try {
    worker = new Worker(new URL("./search-worker.js", import.meta.url), { type: "module" });
  } catch (e) {
    console.warn("Smart search unavailable in this browser:", e);
    setState("keyword");
    return;
  }
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data);
  };
  worker.onerror = (e) => { console.warn("Smart search failed to load:", e.message); setState("keyword"); };
  call({ type: "warm", model: meta.model }).then(() => setState("ready")).catch((e) => { console.warn(e); setState("keyword"); });
}
function call(msg) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}
const cache = new Map();
async function embed(text, model) {
  if (cache.has(text)) return cache.get(text);
  const { vec } = await call({ type: "embed", text, model });
  cache.set(text, vec);
  return vec;
}

/** Load the search data in the background (call early, e.g. on page load). Keyword search works from this alone;
 *  the model (a download from Hugging Face) waits for startSmart(). */
export function warmUp() {
  load();
}

/** The reader has started to search (first click into a search box, or first keystroke): download the model now.
 *  Keyword results show in the meantime, and blended ones replace them when it is ready. */
let smartAsked = false;
export function startSmart() {
  if (smartAsked) return;
  smartAsked = true;
  load().then(startModel).catch(() => {});
}

// ------------------------------------------------------------------ query parsing
const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/'s$/, "");

export function parseYears(q) {
  let m;
  const now = 2025;
  if ((m = q.match(/\b(?:since|after|from)\s+((?:19|20)\d{2})\b/i))) return [+m[1] + (/after/i.test(m[0]) ? 1 : 0), now];
  if ((m = q.match(/\bbefore\s+((?:19|20)\d{2})\b/i))) return [1951, +m[1] - 1];
  if ((m = q.match(/\b((?:19|20)\d)0s\b/i))) return [+`${m[1]}0`, +`${m[1]}9`];
  if ((m = q.match(/\b((?:19|20)\d{2})\s*(?:-|to|–)\s*((?:19|20)\d{2})\b/i))) return [+m[1], +m[2]];
  if ((m = q.match(/\b((?:19|20)\d{2})\b/))) return [+m[1], +m[1]];
  return null;
}
const stripYears = (q) => q.replace(/\b(?:since|after|from|before|in)?\s*(?:19|20)\d{2}s?\b(\s*(?:-|to|–)\s*(?:19|20)\d{2})?/gi, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ search
const TYPE_WEIGHT = { named: 1.04, pair: 1, idp: 1, origin: 0.98 };
let KW_WEIGHT = 0.7;             // how much exact-name matches add to the semantic score
// Quick answer only when the top match clearly wins: a minimum score and a lead over the next match
// (tuned on tests/search_queries.json; see tests/search_eval.py).
let QA_MIN = 0.6;
let QA_GAP = 0.05;
// questions about disasters (not conflict) lean towards internal displacement with IDMC disaster data
const DISASTER_RE = /\b(floods?|flooding|flooded|cyclones?|typhoons?|hurricanes?|storms?|earthquakes?|quakes?|droughts?|landslides?|tsunamis?|wildfires?|disasters?|monsoons?)\b/i;
const DISASTER_BOOST = 1.15;
const PLACE_BONUS = 0.2;          // added when the situation's origin or host is a country the question names
const PLACE_DAMP = 0.85;          // applied to situations in none of the countries the question names
const PLACE_BOTH = 0.1;           // added again for each further named country the situation involves (origin and host)
const DISASTER_DAMP = 0.9;
// Weak matches are hidden (B4, tuned on tests/search_queries.json with tests/search_fp.py): a situation needs at
// least MIN_SCORE and REL_FLOOR of the top score (the weakest right answer in the tests scores 1.075; unrelated
// matches start around 0.83). When the question names a country, only situations involving it are listed.
// A country is listed only if the question names it or it is part of the top situation result.
let MIN_SCORE = 0.95;
let REL_FLOOR = 0.7;
let STRICT = true;                // false: the rules before B4 (for before/after measurement only)
const isosOf = (s) => [s.origin_iso3, s.host_iso3, ...(s.hosts || [])].filter(Boolean);

/** @returns {Promise<{items: object[], quick: object|null, years: number[]|null, mode: string}>} */
export async function search(q) {
  startSmart();
  const idx = await load();
  const years = parseYears(q);
  const text = stripYears(q) || q;
  const disaster = DISASTER_RE.test(q);
  const qn = ` ${norm(text).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
  // countries the question names: longest names first, each match taken out of the question, so "South Sudanese"
  // names South Sudan only (not Sudan as well)
  const named = new Set();
  let rest = qn;
  for (const [iso, n] of idx.placeNames) {
    if (!rest.includes(n)) continue;
    named.add(iso);
    rest = rest.split(n).join(" ");
  }
  // keyword scores, normalised to 0..1
  const kwRes = idx.ms.search(text, { combineWith: "OR" });
  const kwMax = kwRes[0]?.score || 1;
  const kw = new Map(kwRes.map((r) => [r.id, r.score / kwMax]));
  // semantic scores (cosine), when the model is ready
  let sem = null;
  let mode = "keyword";
  if (state === "ready") {
    try {
      const v = await embed(text, idx.meta.model);
      const { vectors, meta } = idx;
      const dim = meta.dim;
      sem = new Float32Array(meta.ids.length);
      for (let i = 0; i < meta.ids.length; i++) {
        let s = 0;
        const off = i * dim;
        for (let j = 0; j < dim; j++) s += vectors[off + j] * v[j];
        sem[i] = s * meta.scale;
      }
      mode = "semantic";
    } catch (e) {
      console.warn(e);
    }
  }
  const scored = [];
  for (const s of idx.sits) {
    if (years && s.years && (s.years[1] < years[0] || s.years[0] > years[1])) continue;
    const k = kw.get(s.id) || 0;
    let score;
    if (sem) {
      const c = sem[idx.rowIndex.get(s.id)] ?? 0;
      score = c + KW_WEIGHT * k;
    } else {
      if (!k) continue;
      score = k;
    }
    score *= TYPE_WEIGHT[s.type] || 1;
    if (disaster) score *= s.type === "idp" && s.disaster_latest ? DISASTER_BOOST : s.type === "idp" ? 1 : DISASTER_DAMP;
    if (named.size) {
      // the question names a country: situations about it move up, situations elsewhere move down
      const hits = new Set([s.origin_iso3, s.host_iso3, ...(s.hosts || [])].filter((iso) => named.has(iso))).size;
      if (hits) score += PLACE_BONUS + PLACE_BOTH * (hits - 1);
      else score *= PLACE_DAMP;
    }
    score += Math.log10(((s.latest && s.latest.value) || 0) + 10) * 0.004;     // tiny tie-break toward larger situations
    scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const floor = !STRICT ? (sem ? Math.max(0.25, (scored[0]?.score || 0) * 0.6) : 0)
    : sem ? Math.max(MIN_SCORE, (scored[0]?.score || 0) * REL_FLOOR) : 0;
  let kept = scored.filter((x) => x.score >= floor);
  if (STRICT && named.size) kept = kept.filter(({ s }) => isosOf(s).some((iso) => named.has(iso)));
  const top = kept.slice(0, 10);
  const items = top.map(({ s, score }) => ({
    group: s.type === "origin" ? "group" : "situation", title: s.title, href: `situation.html?id=${s.id}`, years: s.years, score, s,
  }));
  const related = new Set(top.slice(0, 1).flatMap(({ s }) => isosOf(s)));
  const cRes = idx.cs.search(text, { combineWith: "OR" })
    .filter((c) => !STRICT || named.has(c.iso) || related.has(c.iso)).slice(0, 3);
  for (const c of cRes) {
    items.push({ group: "country", title: `${c.name}: people hosted, people from here`, href: `country.html?iso=${c.iso}`, years: idx.span.get(c.iso) });
  }
  // Quick answer: only when the top match clearly beats the next one. With keyword matching only (model still
  // loading) the scores are not comparable, so it waits for the model.
  const [a, b] = STRICT ? kept : scored;
  const clear = sem && a && a.score >= QA_MIN && (!b || a.score - b.score >= QA_GAP);
  let quick = clear ? a.s : null;
  if (quick && disaster && quick.type === "idp" && quick.disaster_latest) quick = { ...quick, latest: quick.disaster_latest };
  return { items, quick, years, mode, disaster, gap: a && b ? a.score - b.score : null, topScore: a?.score ?? null };
}

/** Ranked situation ids only. */
export async function rank(q, k = 3) {
  const r = await search(q);
  return { mode: r.mode, ids: r.items.filter((i) => i.s).slice(0, k).map((i) => i.s.id), quick: r.quick?.id ?? null,
           quickMeasure: r.quick?.latest?.measure_id ?? null, gap: r.gap, top: r.topScore };
}
globalThis.wv1Search = { rank, search, engineState, warmUp, startSmart, setKwWeight: (w) => { KW_WEIGHT = w; },
                         setQuick: (min, gap) => { QA_MIN = min; QA_GAP = gap; },
                         setStrict: (on, min = MIN_SCORE, rel = REL_FLOOR) => { STRICT = !!on; MIN_SCORE = min; REL_FLOOR = rel; } };
