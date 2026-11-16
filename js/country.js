// Country view (opened from the globe): people hosted, people from here, IDPs, and its situations.
import { initPage } from "./layout.js";
import { getJSON } from "./data.js";
import { esc, numHTML, applyNumbers, fmt } from "./format.js";
import { chartBlock, Plot, base, C } from "./charts.js";
import { renderMiniGlobe } from "./minimap.js";

initPage({ page: "country" });
document.body.classList.add("page-country");
const iso = (new URLSearchParams(location.search).get("iso") || "IND").toUpperCase();
const main = document.getElementById("main");
const LABEL = { refugees: "Refugees", asylum_seekers: "Asylum seekers", oip: "Other people in need of international protection",
  stateless: "Stateless", others_of_concern: "Others of concern", idps_unhcr: "IDPs (UNHCR)", idps_idmc_conflict: "IDPs, conflict (IDMC)" };
const COLOR = { refugees: C.refugees, asylum_seekers: C.asylum, oip: C.oip, stateless: C.stateless, others_of_concern: C.context,
  idps_unhcr: C.idp, idps_idmc_conflict: C.idp };
const TYPE = { pair: "Situations", named: "Situations", origin: "Groups", idp: "Internal displacement" };

try {
  const c = await getJSON(`data/web/country/${encodeURIComponent(iso)}.json`);
  document.title = `${c.name} · Website v1`;
  const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);
  const card = (label, pair, sub) => (pair ? `<article class="card kn kn--small"><div class="kn__label">${esc(label)}, ${pair[0]}</div>
      <div class="kn__value" style="cursor:default">${numHTML(pair[1])}</div><div class="kn__sub">${esc(sub)}</div></article>` : "");
  const groups = {};
  for (const s of c.situations) (groups[TYPE[s.type]] ||= []).push(s);
  main.innerHTML = `<div class="page page--narrow">
    <div class="country-head"><div><p class="eyebrow">Country</p><h1>${esc(c.name)}: people hosted, people from here</h1>
      <p class="muted">${esc(c.region || "")}</p></div><figure class="mini-globe country-globe" id="cg" style="margin:0"></figure></div>
    <div class="card-grid">
      ${card("Refugees hosted", last(c.hosted.refugees), "year-end total, all origins (UNHCR)")}
      ${card(`Refugees from ${c.name}`, last(c.from.refugees), "year-end total, all host countries (UNHCR)")}
      ${card("IDPs inside, UNHCR", last(c.internal.idps_unhcr), "year-end total")}
      ${card("IDPs inside, IDMC (conflict)", last(c.internal.idps_idmc_conflict), "year-end total, shown beside UNHCR, never added")}
    </div>
    <section class="learn__section" id="hosted-chart"></section>
    <section class="learn__section" id="from-chart"></section>
    ${c.top_origins_latest.length ? `<section class="learn__section"><h2>Largest groups hosted (${last(c.hosted.refugees)?.[0] || ""})</h2>
      <ul class="plain-list">${c.top_origins_latest.map((o) => `<li><a href="situation.html?id=${o.origin_iso3.toLowerCase()}-${iso.toLowerCase()}">${esc(o.name)}</a> <span class="num muted">${numHTML(o.value)}</span></li>`).join("")}</ul></section>` : ""}
    <section class="learn__section"><h2>Situations involving ${esc(c.name)}</h2>
      ${Object.entries(groups).map(([g, list]) => `<h3 class="sub-h">${esc(g)} (${list.length})</h3><ul class="plain-list">${list.slice(0, 40).map((s) => `<li><a href="situation.html?id=${esc(s.id)}">${esc(s.title)}</a> <span class="small muted tabular">${s.years ? `${s.years[0]} to ${s.years[1]}` : ""}</span></li>`).join("")}</ul>`).join("") || '<p class="muted">No situations.</p>'}
    </section>
    <p class="small muted">${esc(c.notes.hosted)} ${esc(c.notes.from)} ${esc(c.notes.internal)}</p></div>`;
  applyNumbers(main);
  const lines = (obj) => Object.entries(obj).filter(([, v]) => v.length > 1).map(([k, v]) => ({ k, pts: v.map(([year, value]) => ({ year, value })) }));
  const block = (id, title, obj, src) => {
    const ls = lines(obj);
    if (!ls.length) return;
    const years = [...new Set(ls.flatMap((l) => l.pts.map((p) => p.year)))].sort((a, b) => a - b);
    chartBlock(document.getElementById(id), {
      id: `${iso}-${id}`, filename: `${iso}_${id}`, title, source: src,
      summary: `${title}. Lines for ${ls.map((l) => LABEL[l.k] || l.k).join(", ")}.`,
      note: "Each line is a separate year-end series; lines are never added together.",
      draw: (w) => Plot.plot({ ...base(w, 260), marginRight: w < 520 ? 70 : 170, marks: [Plot.ruleY([0], { stroke: "var(--line-strong)" }),
        ...ls.map((l) => Plot.lineY(l.pts, { x: "year", y: "value", stroke: COLOR[l.k] || C.context, strokeWidth: 2, strokeDasharray: l.k === "idps_unhcr" ? "4,3" : null })),
        ...ls.map((l) => Plot.text([l.pts[l.pts.length - 1]], { x: "year", y: "value", text: () => LABEL[l.k] || l.k, dx: 6, textAnchor: "start", fill: COLOR[l.k] || C.context, lineWidth: 14 })),
        Plot.tip(ls.flatMap((l) => l.pts.map((p) => ({ ...p, k: l.k }))), Plot.pointer({ x: "year", y: "value", title: (d) => `${LABEL[d.k]}, ${d.year}\n${fmt(d.value)}` }))] }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, ...ls.map((l) => ({ key: l.k, label: LABEL[l.k] || l.k, type: "num" }))],
        rows: years.map((y) => Object.fromEntries([["year", y], ...ls.map((l) => [l.k, l.pts.find((p) => p.year === y)?.value ?? null])])) },
    });
  };
  block("hosted-chart", `People hosted in ${esc(c.name)} over time`, c.hosted, "Source: UNHCR Refugee Data Finder (2026 release)");
  block("from-chart", `People from ${esc(c.name)}: abroad and displaced inside`, { ...c.from, ...Object.fromEntries(Object.entries(c.internal).filter(([k]) => k.startsWith("idps"))) },
    "Sources: UNHCR Refugee Data Finder (2026 release); IDMC GIDD (2026)");
  renderMiniGlobe(document.getElementById("cg"), { origin: iso, hosts: [], originName: c.name }).catch(() => {});
} catch (e) {
  console.error(e);
  main.innerHTML = `<div class="page page--narrow"><div class="empty-state"><h3>No data for this country</h3>
    <p class="muted">We have no displacement figures for ${esc(iso)}.</p><p><a href="index.html">Back to the globe</a> · <a href="request.html?q=${esc(iso)}">Request data</a></p></div></div>`;
}
