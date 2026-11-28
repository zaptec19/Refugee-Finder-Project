// The results panel under a search box (walkthrough screen 2):
// a quick answer straight from the data, then results grouped as Situation, Country and Group.
// The ranking engine lives in search.js; what the question names (and so where Enter goes) is search-intent.js.
// Enter goes to what the question names, never somewhere else: the first option is that place. A question that
// can't be matched keeps the panel open with "No data for ...". A changed search says so ("Showing results for").
import { getJSON } from "./data.js";
import { intent, warmIntent } from "./search-intent.js";
import { rememberNotice } from "./search-notice.js";
import { esc, numHTML, fmt } from "./format.js";
import { icon } from "./icons.js";
import { search, engineState, onEngineChange, startSmart, warmUp } from "./search.js";
import { leaveMorph } from "./morph.js";
import { pairLatest, loadNames } from "./auto-situation.js";

const GROUP_LABEL = { situation: "Situation", country: "Country", group: "Group" };

export async function attachSearch(input, { panelParent = input.closest("form") || input.parentElement } = {}) {
  const panel = document.createElement("div");
  panel.className = "results";
  panel.id = `${input.id}-results`;
  panel.hidden = true;
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Search results");
  // the search model downloads only once the reader starts to search: the first click into the box or keystroke.
  // The search data (keyword results) loads straight away.
  const askSmart = () => startSmart();
  input.addEventListener("focus", askSmart, { once: true });
  input.addEventListener("pointerdown", askSmart, { once: true });
  input.addEventListener("keydown", askSmart, { once: true });
  if (document.activeElement === input) askSmart();      // the top bar attaches this on the box's first focus
  warmUp();
  // The top bar has its own backdrop-filter, and a child's backdrop-filter can then only blur the top bar, not the page:
  // the panel was see-through over the page. So the top bar's panel lives in <body> (fixed, placed under the bar).
  const bar = input.closest(".ask") || panelParent;
  const portal = !!input.closest(".topbar");
  let scrim = null;
  if (portal) {
    panel.classList.add("results--portal");
    document.body.append(panel);
    scrim = document.createElement("div");
    scrim.className = "results-scrim";
    scrim.hidden = true;
    scrim.setAttribute("aria-hidden", "true");
    document.body.append(scrim);
  } else panelParent.append(panel);
  const place = () => {
    if (!portal || panel.hidden) return;
    const r = bar.getBoundingClientRect();
    if (!r.width) { close(); return; }                       // the bar was hidden (the phone search closed)
    const gutter = 16;
    const width = Math.min(Math.max(r.width, Math.min(560, innerWidth - 2 * gutter)), innerWidth - 2 * gutter);
    const left = Math.max(gutter, Math.min(r.left, innerWidth - gutter - width));
    const top = r.bottom + 8;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(160, Math.min(560, innerHeight * 0.7, innerHeight - top - gutter))}px`;
  };
  if (portal) {
    addEventListener("resize", place, { passive: true });
    addEventListener("scroll", place, { passive: true, capture: true });
    input.addEventListener("search-close", () => close());   // layout.js: the phone's full-width search closed
  }
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");
  const measures = Object.fromEntries((await getJSON("data/web/measures.json")).map((m) => [m.id, m]));
  let active = -1;
  let last = "";

  let exactFor = null;            // "Search instead for ...": this question as typed, no spelling fixes
  let current = null;             // { q, it, res } for the question on screen
  warmIntent();

  async function compute(q) {
    const exact = exactFor === q;
    const pre = await intent(q, { exact });
    const res = await search(pre.corrected);               // a spelling fix: list results for the fixed question
    const top = res.quick || res.items.find((i) => i.s)?.s || null;
    const it = top ? await intent(q, { exact, top }) : pre;
    // a question naming two countries goes to their pair page: its figure, straight from UNHCR's rows, is the quick answer
    const pm = /^situation\.html\?id=([a-z]{3})-([a-z]{3})(?:&m=(\w+))?$/.exec(it?.target?.href || "");
    let pair = null;
    if (pm && pm[2] !== "idp" && pm[2] !== "all") {
      const [fig, N] = await Promise.all([pairLatest(pm[1], pm[2], pm[3] || null).catch(() => null), loadNames()]);
      pair = { o: pm[1].toUpperCase(), h: pm[2].toUpperCase(), fig, originName: N[pm[1].toUpperCase()]?.n || pm[1].toUpperCase() };
    }
    return { q, it, res, pair };
  }
  async function run({ exact = false } = {}) {
    const q = input.value.trim();
    last = q;
    if (exact) exactFor = q;
    if (!q) { close(); return; }
    const c = await compute(q);
    if (input.value.trim() !== q) return;          // a newer query is on its way
    current = c;
    render(q, c.res, c.it, c.pair);
  }
  function render(q, res, it, pair = null) {
    const groups = { situation: [], country: [], group: [] };
    const goal = it?.target;
    const goalHref = goal?.href;
    for (const r of res.items) if (!goalHref || r.href !== goalHref) groups[r.group]?.push(r);
    // a quick answer that leaves out a country the question names is not an answer to it
    const top = res.quick && (!it?.countries?.length || it.countries.every((c) => [res.quick.origin_iso3, res.quick.host_iso3, ...(res.quick.hosts || [])].includes(c)))
      ? res.quick : null;
    const m = top && measures[top.latest?.measure_id];
    const quickHref = top ? `situation.html?id=${top.id}` : "";
    const quickIsGoal = !!top && quickHref === goalHref;
    // the place the question names comes first, so Enter and the first option are the same
    const goalHTML = goal && !quickIsGoal && !pair?.fig ? `
      <a class="results__item results__intent" role="option" data-opt data-intent href="${esc(goalHref)}">
        <span>${esc(goal.title)}</span><span class="small muted">${/country\.html/.test(goalHref) ? "Country" : "Situation"}</span></a>` : "";
    const changed = it?.changed && (goal || it.corrected !== it.q) ? `
      <p class="results__changed small" data-changed>Showing results for <strong>${esc(goal ? goal.title : it.corrected)}</strong>
        <span aria-hidden="true">·</span> <a href="#" data-exact>Search instead for <q>${esc(q)}</q></a></p>` : "";
    const pairQuick = pair?.fig && goal && !quickIsGoal ? (() => {
      const pm = measures[pair.fig.measure_id];
      return `
      <a class="results__quick" href="${esc(goalHref)}" role="option" data-opt data-intent>
        <span class="eyebrow">Quick answer</span>
        <span class="results__qa"><span>${esc(pair.fig.title)}, ${pair.fig.year}:</span> <strong class="num">${numHTML(pair.fig.value)}</strong></span>
        <span class="small muted">${esc(pm?.label || "")}${pm?.kind === "stock" ? " at year end" : ""}${pair.fig.value === 0 ? ` · ${esc(pair.fig.note || "0 or not reported (UNHCR doesn't distinguish)")}` : ""} · Source: UNHCR</span>
      </a>`; })() : "";
    const quick = pairQuick || (top && top.latest ? `
      <a class="results__quick" href="${esc(quickHref)}" role="option" data-opt${quickIsGoal ? " data-intent" : ""}>
        <span class="eyebrow">Quick answer</span>
        <span class="results__qa"><span>${esc(top.title)}, ${top.latest.year}:</span> <strong class="num">${numHTML(top.latest.value)}</strong></span>
        <span class="small muted">${m?.kind === "flow"
          ? `New displacements${/disaster/.test(top.latest.measure_id) ? " from disasters" : /conflict/.test(top.latest.measure_id) ? " from conflict" : ""} in ${top.latest.year}, a yearly count (movements, not people)`
          : `${esc(m?.label || "")}${m?.kind === "stock" ? " at year end" : ""}`} · Source: ${esc(sourceShort(top.latest.measure_id))}</span>
      </a>` : "");
    // a pair question: the other situations for the origin country it names, under their own heading
    const otherFor = pair ? (r) => {
      const ids = String(r.s?.id || /id=([a-z0-9-]+)/.exec(r.href || "")?.[1] || "").toUpperCase().split("-");
      return r.s?.origin_iso3 === pair.o || ids.includes(pair.o);
    } : null;
    if (otherFor) {
      groups.other = groups.situation.filter(otherFor);
      groups.situation = groups.situation.filter((r) => !otherFor(r));
    }
    const label = (g) => (g === "other" ? `Other situations for ${pair.originName}` : GROUP_LABEL[g]);
    const groupHTML = ["other", "situation", "country", "group"].filter((g) => groups[g]?.length).map((g) => `
      <div class="results__group"><p class="eyebrow">${esc(label(g))}</p>
        ${groups[g].slice(0, g === "situation" || g === "other" ? 5 : 3).map((r) => `<a class="results__item" role="option" data-opt href="${esc(r.href)}">
          <span>${esc(r.title)}</span><span class="small muted tabular">${r.years ? `${r.years[0]} to ${r.years[1]}` : ""}</span></a>`).join("")}
      </div>`).join("");
    const note = engineState() === "loading" ? `<p class="results__note small muted">${icon("info", { size: 14 })} Smart search loading; showing name matches for now.</p>` : "";
    const filt = res.years ? `<p class="results__note small muted">Years in your question: ${res.years[0]} to ${res.years[1]}</p>` : "";
    const dym = !goal && it?.didYouMean ? `<p class="results__dym">Did you mean <a href="#" data-dym="${esc(it.didYouMean)}">${esc(it.didYouMean)}</a>?</p>` : "";
    panel.innerHTML = (goalHTML || quick || groupHTML)
      ? `${changed}${goalHTML}${quick}${groupHTML}${filt}${note}<a class="results__req" href="request.html?q=${encodeURIComponent(q)}">Can't find it? Request data &rsaquo;</a>`
      : `<div class="results__empty" data-empty><p><strong>No data for "${esc(q)}"</strong></p>${dym}
         <p class="small muted">Search a country, a group of people, or two countries, e.g. 'Afghan refugees in India'</p>
         <a href="request.html?q=${encodeURIComponent(q)}">Request data &rsaquo;</a></div>${note}`;
    const opening = panel.hidden;
    panel.hidden = false;
    if (scrim) scrim.hidden = false;
    place();
    input.setAttribute("aria-expanded", "true");
    active = -1;
    // opening: the panel scales and fades in, the results follow in a short stagger (not on every keystroke)
    if (opening) {
      opts().forEach((o, i) => o.style.setProperty("--i", String(Math.min(i, 10))));
      panel.classList.remove("is-opening");
      void panel.offsetWidth;
      panel.classList.add("is-opening");
      clearTimeout(panel._t);
      panel._t = setTimeout(() => panel.classList.remove("is-opening"), 600);
    }
  }
  function close() {
    panel.hidden = true;
    if (scrim) scrim.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }
  function opts() { return [...panel.querySelectorAll("[data-opt]")]; }
  function setActive(i) {
    const o = opts();
    if (!o.length) return;
    active = (i + o.length) % o.length;
    o.forEach((x, j) => x.classList.toggle("is-active", j === active));
    o[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", "");
  }
  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 120); });
  const isTopic = () => !!input.dataset.topic && input.value.trim() === input.dataset.topic;      // the page's own title (layout.js setTopic)
  input.addEventListener("focus", () => { if (input.value.trim() && !isTopic()) run(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Escape") { close(); }
    else if (e.key === "Enter") { e.preventDefault(); enter(); }
  });
  async function enter() {
    const q = input.value.trim();
    if (!q) return;
    if (isTopic() && (active < 0 || panel.hidden)) { close(); return; }        // Enter on the unchanged title: nothing to do
    // a result picked with the arrow keys: like a click (no notice)
    const o = opts();
    if (active >= 0 && o[active] && !panel.hidden) { morphName(o[active]); location.href = o[active].getAttribute("href"); return; }
    const c = current?.q === q ? current : await compute(q);
    if (input.value.trim() !== q) return;
    current = c;
    const goal = c.it.target;
    if (!goal) { render(q, c.res, c.it, c.pair); return; }           // nothing it names: stay, with the panel open
    if (c.it.changed) rememberNotice({ typed: q, shown: goal.title, href: goal.href });
    const a = panel.querySelector("[data-intent]");
    if (a && !panel.hidden) morphName(a);
    location.href = goal.href;
  }
  panel.addEventListener("click", (e) => {
    const x = e.target.closest("[data-exact]");
    const d = e.target.closest("[data-dym]");
    if (x) { e.preventDefault(); run({ exact: true }); input.focus(); }
    else if (d) { e.preventDefault(); input.value = d.dataset.dym; run(); input.focus(); }
  });
  document.addEventListener("click", (e) => { if (!panelParent.contains(e.target) && !panel.contains(e.target)) close(); });
  if (portal) {
    // the panel is no longer next to the input in the DOM: keep Tab moving between them as before
    input.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey && !panel.hidden) {
        const first = panel.querySelector("a[href]");
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
    panel.addEventListener("keydown", (e) => {
      const links = [...panel.querySelectorAll("a[href]")];
      if (e.key === "Escape") { e.preventDefault(); close(); input.focus(); }
      else if (e.key === "Tab" && e.shiftKey && document.activeElement === links[0]) { e.preventDefault(); input.focus(); }
      else if (e.key === "Tab" && !e.shiftKey && document.activeElement === links[links.length - 1]) {
        // off the end of the results: on to whatever followed the search box
        const all = [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])")]
          .filter((x) => !panel.contains(x) && x.getClientRects().length);
        const next = all[all.indexOf(input) + 1];
        if (next) { e.preventDefault(); close(); next.focus(); }
      }
    });
    panel.addEventListener("focusout", (e) => {
      if (e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== input) close();
    });
  }
  panel.addEventListener("click", (e) => { const a = e.target.closest("a[data-opt]"); if (a) morphName(a); });
  onEngineChange(() => { if (last && !panel.hidden) run(); });
  return { run, runExact: () => run({ exact: true }) };
}

function sourceShort(measureId) {
  if (measureId?.startsWith("idmc") || measureId?.includes("idmc")) return "IDMC";
  return "UNHCR";
}

/** The chosen result's title becomes the next page's title in a cross-document view transition. */
function morphName(a) {
  document.querySelectorAll("[style*=view-transition-name]").forEach((x) => { x.style.viewTransitionName = ""; });
  const here = document.querySelector(".sit-title, .country-head h1");     // only one element may carry the name
  if (here) here.style.viewTransitionName = "none";
  const t = a.querySelector(".results__qa > span") || a.querySelector("span");
  if (t) t.style.viewTransitionName = "sit-title";
  if (/situation\.html/.test(a.getAttribute("href") || "") && document.body.dataset.page === "home") leaveMorph(t);
}
