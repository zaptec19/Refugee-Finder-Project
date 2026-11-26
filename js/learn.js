// Learn (walkthrough screen 15): glossary, how sources define things, reading the numbers,
// the organisations behind the data, and a short tour.
import { initPage } from "./layout.js";
import { openTerm } from "./popouts.js";
import { glossary as loadGlossary, getJSON } from "./data.js";
import { esc } from "./format.js";
import { icon } from "./icons.js";
import { MAP_SOURCE } from "./config.js";

initPage({ page: "learn" });
document.body.classList.add("page-learn");
const [glossary, crosswalk] = await Promise.all([loadGlossary(), getJSON("data/web/crosswalk.json")]);

const READING = [
  { id: "stocks-flows", title: "Stocks vs flows", diagram: true, body: [
    "A stock is how many people are displaced on one date, usually 31 December. A flow is how many people moved, or how many moves happened, during the year.",
    "UNHCR mostly publishes stocks. IDMC publishes both: people living in displacement at year end (stock) and new displacements during the year (flow).",
    "A stock can stay level while many people arrive and many leave: the flows in and out cancel out. Never put a stock and a flow on one axis without saying so.",
  ] },
  { id: "year-end", title: "Year-end totals", body: [
    "Most UNHCR figures are counts at 31 December. People who fled and returned within the same year may never appear in a year-end figure.",
    "To see movement during a year, look at flows: returns, new asylum applications, or IDMC's new displacements.",
  ] },
  { id: "estimates", title: "Estimates and repeats", body: [
    "Many figures are estimates, not head counts. IDMC says most of its figures are estimates.",
    "When a country does not report a new figure, the previous one can be carried forward. Identical or very round figures several years in a row are a sign of this. The Limitations step flags long steady runs and sudden jumps.",
  ] },
  { id: "series-breaks", title: "Series breaks", body: [
    "Sources change what they count. UNHCR added 'other people in need of international protection' in 2018; some of these people were counted in other groups before. A jump at a break can be a change in counting, not a change in people.",
    "Check footnotes in the source trace of any number: they often explain a break.",
  ] },
  { id: "correlation", title: "Correlation is not cause", body: [
    "Charts on this site put conflict years and events next to displacement so you can see timing. They show timing and patterns, not proven causes.",
    "Displacement figures can move for many reasons at once: violence, policy, access for counters, changes in counting. The sources for displacement and for conflict are separate datasets.",
  ] },
];

const ORGS = [
  { id: "unhcr", name: "UNHCR (the UN Refugee Agency)", text: "Mandated to protect refugees, and it also works with asylum seekers, stateless people, returnees and some internally displaced people. Its statistics mostly come from host governments and from UNHCR's own registration, counted at year end.", limits: "Counts depend on registration and on what governments report. Where a country has not signed the 1951 Refugee Convention, UNHCR's role and its figures can depend heavily on government data. Its IDP figures cover only conflict IDPs it protects or assists." },
  { id: "idmc", name: "IDMC (Internal Displacement Monitoring Centre)", text: "Part of the Norwegian Refugee Council. Monitors internal displacement from conflict, violence and disasters, and publishes the Global Internal Displacement Database.", limits: "Most figures are estimates compiled from governments, UN agencies and media, and they are revised. 'New displacements' count movements, not people." },
  { id: "ucdp", name: "UCDP (Uppsala Conflict Data Program)", text: "Records armed conflicts and deaths in organized violence. An armed conflict enters the UCDP/PRIO dataset in a year with at least 25 battle-related deaths.", limits: "It does not count displacement. Death figures are estimates with low, best and high values." },
  { id: "worldbank", name: "World Bank", text: "Publishes national population estimates, used here only for figures per 1,000 people.", limits: "Mid-year estimates; small territories can be missing." },
  { id: "governments", name: "Governments", text: "Keep their own records, for example camp registers. These can be the most direct count for one group.", limits: "Definitions and dates differ from country to country. India has no national refugee law, so its figures follow administrative categories." },
];

const main = document.getElementById("main");
main.innerHTML = `<div class="page page--narrow learn">
  <div class="learn__head"><div><h1>Learn</h1><p class="muted">How to read displacement data, without assuming you already know.</p></div>
    </div>
  <div class="learn__grid">
    <section class="card learn__panel" aria-labelledby="h-gl"><h2 id="h-gl">Glossary</h2>
      <ul class="learn__list">${glossary.filter((g) => !["stock", "flow", "estimate", "series_break"].includes(g.id)).slice(0, 9).map((g) => `<li><button type="button" data-show="g-${g.id}">${esc(g.term)}<span aria-hidden="true">›</span></button></li>`).join("")}</ul>
      <a class="small" href="#glossary">Full glossary &rsaquo;</a></section>
    <section class="card learn__panel" aria-labelledby="h-cw"><h2 id="h-cw">How sources define it</h2>
      <table class="table table--compact"><thead><tr><th scope="col"></th><th scope="col">UNHCR</th><th scope="col">IDMC</th></tr></thead>
        <tbody><tr><th scope="row">IDP</th><td>of concern</td><td>all</td></tr>
          <tr><th scope="row">Causes</th><td>conflict</td><td>+ disasters</td></tr>
          <tr><th scope="row">From</th><td class="tabular">1993</td><td class="tabular">2008</td></tr></tbody></table>
      <a class="small" href="#crosswalk">Full crosswalk &rsaquo;</a></section>
    <section class="card learn__panel" aria-labelledby="h-rn"><h2 id="h-rn">Reading the numbers</h2>
      <ul class="learn__list">${READING.map((r) => `<li><button type="button" data-show="${r.id}">${esc(r.title)}<span aria-hidden="true">›</span></button></li>`).join("")}</ul></section>
  </div>
  <section class="card learn__detail" id="detail" aria-live="polite"></section>

  <section id="crosswalk" class="learn__section"><h2>How sources define it: the full crosswalk</h2>
    <div class="table-wrap"><table class="table"><thead><tr><th scope="col">Term</th>${crosswalk.columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${crosswalk.rows.map((r) => `<tr><th scope="row">${r.glossary_id ? `<a href="#g-${r.glossary_id}" data-show="g-${r.glossary_id}">${esc(r.term)}</a>` : esc(r.term)}</th>${crosswalk.columns.map((c) => `<td>${esc(r[c.id])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <ul class="small muted">${crosswalk.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>

  <section id="glossary" class="learn__section"><h2>Glossary</h2>
    <dl class="gloss">${glossary.map((g) => `<div id="g-${g.id}" class="gloss__item"><dt>${esc(g.term)}</dt><dd><p>${esc(g.plain)}</p>${g.how_sources_differ ? `<p class="small muted"><strong>How sources differ:</strong> ${esc(g.how_sources_differ)}</p>` : ""}</dd></div>`).join("")}</dl></section>

  <section id="organisations" class="learn__section"><h2>About the organisations: mandates and limits</h2>
    <div class="orgs">${ORGS.map((o) => `<article class="card org" id="org-${o.id}"><h3>${esc(o.name)}</h3><p>${esc(o.text)}</p><p class="small"><strong>Limits:</strong> ${esc(o.limits)}</p></article>`).join("")}</div>
    <p class="small" id="maps-data" style="margin-top:16px;max-width:72ch"><strong>Maps.</strong> Country borders come from Natural Earth's India point of view (${esc(MAP_SOURCE.release)}, public domain), simplified for the home globe and the smaller maps. ${esc(MAP_SOURCE.bordersNote)} <a href="datasets.html#maps">Map data &rsaquo;</a></p></section>

  <section id="tour" class="learn__section"><h2>The 1-minute tour</h2>
    <p><button class="btn btn--primary" type="button" data-start-tour>Start the interactive tour</button>
      <span class="small muted">A card at a time, pointing at each part of the site. Or read the steps below. On a situation or country page, Tour in the top bar walks through just that page.</span></p>
    <ol class="tour">
      <li><strong>Ask.</strong> Type a place, a group or a question on the home page. A quick answer comes straight from the data.</li>
      <li><strong>Read the brief.</strong> What happened, why people moved, when and how, before any numbers. <a href="situation.html?id=lka-ind#brief">See an example</a></li>
      <li><strong>Key numbers.</strong> At most three. Press <span class="help-btn" aria-hidden="true" style="display:inline-grid;width:20px;height:20px;font-size:11px">?</span> for what a number means; click the number for where it comes from. <a href="situation.html?id=lka-ind#key-numbers">Try it</a></li>
      <li><strong>Compare sources.</strong> When sources disagree, see why. <a href="situation.html?id=lka-ind#compare">Example</a></li>
      <li><strong>Limitations.</strong> What the data can't tell you, next to the numbers. <a href="situation.html?id=lka-ind#limitations">Example</a></li>
      <li><strong>Collect and export.</strong> Pin numbers, charts and readings, then export a Word table, Excel or CSV with references. <a href="collection.html">My collection</a></li>
    </ol>
    <p class="small muted">Press <strong>Tour</strong> in the top bar any time: on the home page it shows the whole site; on a situation or country page it walks through that page.</p></section>
</div>`;

const detail = document.getElementById("detail");
function show(id) {
  const r = READING.find((x) => x.id === id);
  if (r) {
    detail.innerHTML = `<div class="learn__detail-grid"><div><h2>${esc(r.title)}</h2>${r.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>${r.diagram ? stocksFlows() : ""}</div>`;
  } else if (id.startsWith("g-")) {
    const g = glossary.find((x) => `g-${x.id}` === id);
    if (!g) return;
    detail.innerHTML = `<h2>${esc(g.term)}</h2><p>${esc(g.plain)}</p>${g.how_sources_differ ? `<p class="eyebrow" style="margin-top:12px">How sources differ</p><p>${esc(g.how_sources_differ)}</p>` : ""}`;
  }
  main.querySelectorAll("[data-show]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.show === id)));
}
function stocksFlows() {
  // illustration, not data: four year-end stocks and the change between them
  const v = [3, 5, 4, 6];
  const bars = v.map((h, i) => `<g transform="translate(${30 + i * 70},0)"><rect y="${150 - h * 20}" width="44" height="${h * 20}" rx="3" fill="var(--c-refugees-fill)" stroke="var(--c-refugees)"/>
      <text x="22" y="170" text-anchor="middle" class="sf-t">yr ${i + 1}</text></g>`).join("");
  const deltas = [2, -1, 2].map((d, i) => `<text x="${30 + (i + 1) * 70 + 22}" y="${150 - v[i + 1] * 20 - 8}" text-anchor="middle" class="sf-d">${d > 0 ? "+" : "−"}${Math.abs(d)}</text>`).join("");
  return `<figure class="sf" aria-label="Illustration: four year-end stocks as bars; the changes between them (+2, −1, +2) are flows."><svg viewBox="0 0 330 202" width="100%">
      <text x="30" y="14" class="sf-l">stock at year end</text><text x="318" y="14" text-anchor="end" class="sf-f">flow = change in and out</text>
      <g transform="translate(0,22)">${bars}${deltas}</g></svg>
      <figcaption class="small muted">Illustration, not data.</figcaption></figure>`;
}
main.addEventListener("click", (e) => {
  const b = e.target.closest("[data-show]");
  if (!b) return;
  e.preventDefault();
  // a glossary term opens beside the page; the reading notes stay in the card below
  const g = b.dataset.show.startsWith("g-") && glossary.find((x) => `g-${x.id}` === b.dataset.show);
  if (g) { openTerm(g, b); return; }
  show(b.dataset.show);
  if (b.tagName === "A") detail.scrollIntoView({ block: "nearest" });
});
const h = location.hash.slice(1);
show(READING.some((r) => r.id === h) || h.startsWith("g-") ? h : "stocks-flows");
if (h) document.getElementById(h)?.scrollIntoView();
if (READING.some((r) => r.id === h)) detail.scrollIntoView();
