// What a search question names, so Enter goes there (never somewhere else):
//   origin + host            -> that pair's page (built, or built in the browser), at the people type asked about;
//   one country + "inside" / "internally displaced" / "IDPs" (or a disaster) -> <country>-idp;
//   one country only         -> its country page (or, with a people type and "from", the origin's page);
//   a situation title or alias, word for word -> that situation.
// Countries are found with the place-name matching search.js uses (longest first; names, demonyms, other names,
// names in brackets), after fixing spelling by edit distance against those names, the people-type words and the
// situations' aliases. Everything the question was changed by (a spelling fix, another name for a country, a year,
// a dropped word, a match by meaning) is listed in `changes`, for the notice on the page the reader lands on.
import { getJSON } from "./data.js";
import { SEARCH_DEMONYMS } from "./config.js";
import { loadNames, groupTitle, CROSS } from "./auto-situation.js";

const STOP = new Set(("in into to from of the a an and or who which that are is were was be been living live lived lives " +
  "fled flee fleeing went go going gone moved move moving now currently still there here at on for with by as " +
  "how many much what where when why number numbers figure figures data total all people persons person " +
  "country countries since after before during year years").split(" "));
const CUES = {
  refugees: /\brefugees?\b/,
  asylum_seekers: /\basylum\b|\basylum[- ]?seekers?\b|\bseekers?\b/,
  oip: /\boip\b|\binternational protection\b/,
};
const IDP_CUE = /\bidps?\b|\binternally\b|\binternal displacement\b|\binside\b|\bwithin\b|\bdisplaced\b|\bdisplacement\b|\bhomes?\b|\bpushed out\b/;
const DISASTER = /\b(floods?|flooding|cyclones?|typhoons?|hurricanes?|storms?|earthquakes?|quakes?|droughts?|landslides?|tsunamis?|wildfires?|disasters?|monsoons?)\b/;
const PEOPLE_WORDS = ["refugee", "refugees", "asylum", "seeker", "seekers", "displaced", "internally", "internal", "displacement",
  "idp", "idps", "protection", "international", "inside", "stateless", "returnees", "returns", "migrants"];
// SEARCH_DEMONYMS (config.js): adjectives for countries whose UNHCR nationality field has none (search words only)
const YEARS = /\b(?:since|after|from|before|in)?\s*(?:19|20)\d{2}s?\b(\s*(?:-|to|–)\s*(?:19|20)\d{2})?/gi;

export const norm = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]s\b/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Damerau-Levenshtein distance (adjacent swaps count as one), stopping early past `max`. */
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
/** How far a word may be from a known word to be corrected: none under 5 letters (too many near misses). */
const allowed = (len) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

let readyP = null;
function load() {
  return (readyP ||= (async () => {
    const [countries, sits, N] = await Promise.all([getJSON("data/web/countries.json"), getJSON("data/web/situations.json"), loadNames()]);
    const places = [];                       // [iso3, " normalised name ", kind: name | demonym, canonical?]
    const add = (iso, n, kind, canonical) => {
      const t = norm(n);
      if (t.length >= 3) places.push([iso, ` ${t} `, kind, canonical]);
    };
    for (const [iso, c] of Object.entries(countries)) {
      if (!N[iso] && !c.name) continue;
      const names = [c.name, N[iso]?.n, ...(c.other_names || [])].filter(Boolean);
      names.forEach((n, i) => {
        add(iso, n, "name", i < 2);
        const inBrackets = /\(([^)]+)\)/.exec(n);              // "Myanmar (Burma)" -> "Burma" too
        // "Holy See (the)": not "the"
        if (inBrackets && norm(inBrackets[1]).length >= 4 && !STOP.has(norm(inBrackets[1]))) add(iso, inBrackets[1], "name", false);
        if (inBrackets) add(iso, n.replace(/\s*\([^)]*\)/, ""), "name", i < 2);
      });
      for (const d of [c.demonym, N[iso]?.d].filter(Boolean)) { add(iso, d, "demonym", true); add(iso, `${d}s`, "demonym", true); }
      for (const d of SEARCH_DEMONYMS[iso] || []) { add(iso, d, "demonym", false); add(iso, `${d}s`, "demonym", false); }
    }
    places.sort((a, b) => b[1].length - a[1].length);
    // the words spelling can be corrected to
    const vocab = new Set([...PEOPLE_WORDS, ...STOP]);
    for (const [, n] of places) n.trim().split(" ").forEach((w) => w.length >= 3 && vocab.add(w));
    const exact = new Map();                 // word set of a title or alias -> situation
    const key = (t) => norm(t).split(" ").filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).sort().join(" ");
    for (const s of sits) {
      for (const t of [s.title, ...(s.aliases || [])]) {
        if (!t) continue;
        norm(t).split(" ").forEach((w) => w.length >= 3 && !/^\d+$/.test(w) && vocab.add(w));
        const k = key(t);
        if (k && !exact.has(k)) exact.set(k, s);
      }
    }
    return { countries, sits, N, places, vocab: [...vocab], vocabSet: vocab, exact, key, byId: new Map(sits.map((s) => [s.id, s])) };
  })());
}
export const warmIntent = () => load();

/** Spelling fixes: each unknown word of 5+ letters becomes the closest known word, if close enough. */
function correct(words, idx) {
  const out = [];
  const fixes = [];
  for (const w of words) {
    if (idx.vocabSet.has(w) || /^\d+$/.test(w) || allowed(w.length) === 0) { out.push(w); continue; }
    let best = null;
    let bd = 99;
    for (const v of idx.vocab) {
      if (Math.abs(v.length - w.length) > 2) continue;
      const d = editDistance(w, v, 2);
      if (d < bd || (d === bd && best && v.length > best.length)) { bd = d; best = v; }
    }
    if (best && bd <= allowed(w.length)) { out.push(best); fixes.push([w, best]); }
    else out.push(w);
  }
  return { words: out, fixes };
}

/**
 * @param {string} q        the question as typed
 * @param {object} [o]      { exact: true } -> no spelling fixes ("Search instead for ..."); top: the top ranked situation
 * @returns {Promise<{ q, corrected, changes: string[], target: {href, title, id?}|null, countries: string[], measure, idp, didYouMean }>}
 */
export async function intent(q, { exact = false, top = null } = {}) {
  const idx = await load();
  const changes = [];
  const typed = q.trim();
  const years = typed.match(YEARS);
  if (years) changes.push("year");
  let text = norm(typed.replace(YEARS, " "));
  let words = text.split(" ").filter(Boolean);
  let fixes = [];
  if (!exact) ({ words, fixes } = correct(words, idx));
  if (fixes.length) changes.push("spelling");
  text = words.join(" ");
  const corrected = fixes.length ? fixes.reduce((t, [a, b]) => t.replace(new RegExp(`\\b${a}\\b`, "i"), b), typed) : typed;
  const result = { q: typed, corrected, changes, target: null, countries: [], measure: null, idp: false, didYouMean: null };

  // a situation title or alias, word for word
  const k = idx.key(text);
  const exactSit = k && idx.exact.get(k);
  if (exactSit) {
    // a situation's own title or one of its aliases (team-written names for it): not a change to the search
    result.target = { href: `situation.html?id=${exactSit.id}`, title: exactSit.title, id: exactSit.id };
    return finish(result, idx);
  }

  // countries and their roles
  let rest = ` ${text} `;
  const found = [];
  for (const [iso, n, kind, canonical] of idx.places) {
    const at = rest.indexOf(n);
    if (at < 0) continue;
    const before = rest.slice(0, at).trim().split(" ").slice(-2).join(" ");
    let role = kind === "demonym" ? "origin" : /\b(in|into|to|hosted by|living in)$/.test(before) ? "host" : /\b(from|out of|of)$/.test(before) ? "origin" : null;
    // the same words for more than one country ("Congolese"): the others are kept as alternatives
    const alts = idx.places.filter((x) => x[1] === n && x[0] !== iso).map((x) => x[0]);
    found.push({ iso, at, role, alias: !canonical, alts });
    rest = `${rest.slice(0, at)} ${" ".repeat(n.length - 2)} ${rest.slice(at + n.length)}`;
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set();
  const named = found.filter((f) => !seen.has(f.iso) && seen.add(f.iso));
  if (named.some((f) => f.alias)) changes.push("alias");
  result.countries = named.map((f) => f.iso);

  // the people type
  const measure = Object.entries(CUES).find(([, re]) => re.test(text))?.[0] || null;
  const crossBorder = !!measure || /\bfled\b|\bflee/.test(norm(typed));
  const idp = !crossBorder && (IDP_CUE.test(text) || DISASTER.test(text)) || /\bidps?\b|\binternally\b|\binternal displacement\b/.test(text);
  result.measure = measure;
  result.idp = idp;

  // words that were not used for anything: the question was read without them
  const leftover = rest.trim().split(/\s+/).filter((w) => w && !STOP.has(w) && !PEOPLE_WORDS.includes(w) && !/^\d+$/.test(w)
    && !Object.values(CUES).some((re) => re.test(w)) && !IDP_CUE.test(w) && !DISASTER.test(w));

  if (named.length >= 2) {
    let origin = named.find((f) => f.role === "origin") || named.find((f) => f.role !== "host");
    let host = named.find((f) => f !== origin && f.role === "host") || named.find((f) => f !== origin);
    if (origin && host && origin.iso !== host.iso) {
      origin = { ...origin, iso: [origin.iso, ...origin.alts].find((i) => idx.byId.has(`${i}-${host.iso}`.toLowerCase())) || origin.iso };
      const id = `${origin.iso}-${host.iso}`.toLowerCase();
      const built = idx.byId.get(id);
      const m = measure && CROSS.includes(measure) ? measure : null;
      const title = built && (!m || built.latest?.measure_id === m) ? built.title : groupTitle(idx.N, origin.iso, m || "refugees", host.iso);
      result.target = { href: `situation.html?id=${id}${m ? `&m=${m}` : ""}`, title, id };
      if (leftover.length) changes.push("dropped");
      return finish(result, idx);
    }
  }
  if (named.length === 1) {
    const c = named[0].iso;
    if (idp) {
      const id = `${c.toLowerCase()}-idp`;
      result.target = { href: `situation.html?id=${id}`, title: idx.byId.get(id)?.title || `Internal displacement in ${idx.N[c]?.p || c}`, id };
    } else if (measure && named[0].role !== "host" && idx.byId.has(`${c.toLowerCase()}-all`) && idx.byId.get(`${c.toLowerCase()}-all`).latest?.measure_id === measure) {
      const s = idx.byId.get(`${c.toLowerCase()}-all`);
      result.target = { href: `situation.html?id=${s.id}`, title: s.title, id: s.id };
    } else if (top && (crossBorder || (named[0].role === "origin" && leftover.length && top.origin_iso3 === c && top.host_iso3))
        && involvesAll(top, [c]) && (!measure || top.latest?.measure_id === measure)) {
      // "Tamils who fled to India": one country and a people type, the rest only the top match by meaning can place
      result.target = { href: `situation.html?id=${top.id}`, title: top.title, id: top.id };
      changes.push("meaning");
    } else {
      result.target = { href: `country.html?iso=${c}`, title: `${idx.countries[c]?.name || idx.N[c]?.n || c}: people hosted, people from here` };
    }
    if (leftover.length) changes.push("dropped");
    return finish(result, idx);
  }
  // no country named, or only roles we can't place: the top match by meaning, if it keeps what was asked
  if (top && involvesAll(top, result.countries) && (!measure || top.latest?.measure_id === measure) && (named.length || measure || idp || leftover.length <= 6)) {
    result.target = { href: `situation.html?id=${top.id}`, title: top.title, id: top.id };
    changes.push("meaning");
  }
  return finish(result, idx);
}

function involvesAll(s, isos) {
  const has = new Set([s.origin_iso3, s.host_iso3, ...(s.hosts || [])]);
  return isos.every((i) => has.has(i));
}

function finish(result, idx) {
  result.changes = [...new Set(result.changes)];
  if (result.corrected !== result.q && !result.target) result.didYouMean = result.corrected;
  else if (result.corrected !== result.q) result.didYouMean = result.corrected;
  // the notice is not needed when the page's title is what was typed
  result.changed = result.changes.length > 0 && !(result.target && norm(result.target.title) === norm(result.q));
  return result;
}
