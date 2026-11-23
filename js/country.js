// Country view (opened from the globe): people hosted, people from here, IDPs, and its situations.
// Each measure is its own card and its own line: refugees and other people in need of international protection
// (OIP) are never added, UNHCR and IDMC IDP figures are never added, and IDMC's yearly new displacements (a count of
// movements) get their own bar charts instead of sharing an axis with the year-end totals.
import { initPage } from "./layout.js";
import { getJSON, glossary as loadGlossary } from "./data.js";
import { esc, numHTML, applyNumbers, fmt } from "./format.js";
import { chartBlock, Plot, base, C, inkOf, isolatedMarks } from "./charts.js";
import { renderMiniGlobe } from "./minimap.js";
import { openPopover } from "./popouts.js";

initPage({ page: "country" });
document.body.classList.add("page-country");
const iso = (new URLSearchParams(location.search).get("iso") || "IND").toUpperCase();
const main = document.getElementById("main");
const LABEL = { refugees: "Refugees", asylum_seekers: "Asylum seekers", oip: "Other people in need of international protection",
  stateless: "Stateless", others_of_concern: "Others of concern", idps_unhcr: "IDPs (UNHCR)", idps_idmc_conflict: "IDPs, conflict (IDMC)",
  others_inside: "Others of concern inside the country (UNHCR)" };
const SHORT = { oip: "OIP" };
const COLOR = { refugees: C.refugees, asylum_seekers: C.asylum, oip: C.oip, stateless: C.stateless, others_of_concern: C.context,
  idps_unhcr: C.idp, idps_idmc_conflict: C.idp, others_inside: C.context };
const UNHCR_KEYS = new Set(["refugees", "asylum_seekers", "oip", "stateless", "others_of_concern", "idps_unhcr", "others_inside"]);
const TYPE = { pair: "Situations", named: "Situations", origin: "Groups", idp: "Internal displacement" };

try {
  const [c, gloss] = await Promise.all([getJSON(`data/web/country/${encodeURIComponent(iso)}.json`), loadGlossary().catch(() => [])]);
  document.title = `${c.name} · Refugee Finder`;
  const G = Object.fromEntries(gloss.map((g) => [g.id, g]));
  const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);
  const card = (label, pair, sub, term) => (pair ? `<article class="card kn kn--small"><div class="kn__head"><div class="kn__label">${esc(label)}, ${pair[0]}</div>
      ${term && G[term] ? `<span class="kn__help"><button class="help-btn" type="button" data-term-help="${term}" aria-label="What does this mean: ${esc(G[term].term)}?" aria-haspopup="dialog">?</button></span>` : ""}</div>
      <div class="kn__value" style="cursor:default">${numHTML(pair[1])}</div><div class="kn__sub">${esc(sub)}</div></article>` : "");
  const groups = {};
  for (const s of c.situations) (groups[TYPE[s.type]] ||= []).push(s);

  // largest groups hosted: refugees and OIP by origin, in separate columns (never added)
  const top = c.top_origins_latest || [];
  const hostsOip = !!last(c.hosted.oip);
  const oipByOrigin = top.some((o) => o.oip != null);
  const topYear = top[0]?.year || last(c.hosted.refugees)?.[0] || "";
  const cell = (v) => (v == null ? '<span class="muted">no data</span>' : numHTML(v));
  const topHTML = top.length ? `<section class="learn__section"><h2>Largest groups hosted (${topYear})</h2>
      <div class="table-wrap table-wrap--plain"><table class="table top-groups"><thead><tr><th scope="col">From</th><th scope="col" class="num">Refugees</th>
        ${hostsOip ? `<th scope="col" class="num">Other people in need of international protection</th>` : ""}</tr></thead>
      <tbody>${top.map((o) => `<tr><td><a href="situation.html?id=${o.origin_iso3.toLowerCase()}-${iso.toLowerCase()}">${esc(o.name)}</a></td>
        <td class="num">${cell(o.refugees ?? o.value)}</td>${hostsOip ? `<td class="num">${oipByOrigin ? cell(o.oip) : ""}</td>` : ""}</tr>`).join("")}</tbody></table></div>
      ${hostsOip && !oipByOrigin ? `<p class="small muted">OIP not split by origin in this data.</p>` : ""}
      <p class="small muted">Refugees and other people in need of international protection are separate UNHCR groups; the columns are never added. UNHCR, year-end ${topYear}.</p></section>` : "";

  const idmcFlows = ["idmc_conflict_new", "idmc_disaster_new"].filter((k) => (c.internal[k] || []).some(([, v]) => v != null));
  main.innerHTML = `<div class="page page--narrow">
    <div class="country-head"><div><p class="eyebrow">Country</p><h1>${esc(c.name)}: people hosted, people from here</h1>
      <p class="muted">${esc(c.region || "")}</p></div><figure class="mini-globe country-globe" id="cg" style="margin:0"></figure></div>
    <div class="card-grid">
      ${card("Refugees hosted", last(c.hosted.refugees), "year-end total, all origins (UNHCR)", "refugee")}
      ${card("Other people in need of international protection hosted", last(c.hosted.oip), "year-end total, all origins (UNHCR); a separate group, not added to refugees", "oip")}
      ${card(`Refugees from ${c.name}`, last(c.from.refugees), "year-end total, all host countries (UNHCR)", "refugee")}
      ${card(`Other people in need of international protection from ${c.name}`, last(c.from.oip), "year-end total, all host countries (UNHCR); a separate group", "oip")}
      ${card("IDPs inside, UNHCR", last(c.internal.idps_unhcr), "year-end total")}
      ${card("IDPs inside, IDMC (conflict)", last(c.internal.idps_idmc_conflict), "year-end total, shown beside UNHCR, never added")}
    </div>
    <section class="learn__section" id="hosted-chart"></section>
    <section class="learn__section" id="from-chart"></section>
    ${idmcFlows.length ? `<section class="learn__section" id="flows"><h2>New displacements each year (IDMC)</h2>
      <p class="muted">A yearly count of movements, not people living displaced: one person forced to move twice is counted twice.
      These are not added to the totals above and are not drawn on the same axis.</p>
      ${idmcFlows.map((k) => `<div id="flow-${k}"></div>`).join("")}</section>` : ""}
    ${topHTML}
    <section class="learn__section"><h2>Situations involving ${esc(c.name)}</h2>
      ${Object.entries(groups).map(([g, list]) => `<h3 class="sub-h">${esc(g)} (${list.length})</h3><ul class="plain-list">${list.slice(0, 40).map((s) => `<li><a href="situation.html?id=${esc(s.id)}">${esc(s.title)}</a> <span class="small muted tabular">${s.years ? `${s.years[0]} to ${s.years[1]}` : ""}</span></li>`).join("")}</ul>`).join("") || '<p class="muted">No situations.</p>'}
    </section>
    <p class="small muted">${esc(c.notes.hosted)} ${esc(c.notes.from)} ${esc(c.notes.internal)}</p></div>`;
  applyNumbers(main);
  main.querySelectorAll("[data-term-help]").forEach((b) => b.addEventListener("click", () => {
    const g = G[b.dataset.termHelp];
    openPopover(`<div class="gl"><h3 class="gl__term">${esc(g.term)}</h3><p>${esc(g.plain)}</p>
      ${g.how_sources_differ ? `<p class="eyebrow" style="margin-top:12px">How sources differ</p><p class="small">${esc(g.how_sources_differ)}</p>` : ""}
      <a class="small" href="learn.html#g-${esc(g.id)}">More in Learn &rsaquo;</a></div>`, b, { label: g.term });
  }));

  // year-end totals: every series with data is drawn; a one-year series (or a lone year) as a labelled dot
  const lines = (obj) => Object.entries(obj).filter(([, v]) => v.some(([, x]) => x != null))
    .map(([k, v]) => ({ k, key: k, color: COLOR[k] || C.context, pts: v.filter(([, x]) => x != null).map(([year, value]) => ({ year, value })) }));
  const block = (id, title, obj) => {
    const ls = lines(obj);
    if (!ls.length) return;
    const years = [...new Set(ls.flatMap((l) => l.pts.map((p) => p.year)))].sort((a, b) => a - b);
    // list a source only if this chart draws its data
    const srcs = [ls.some((l) => UNHCR_KEYS.has(l.k)) && "UNHCR Refugee Data Finder (2026 release)", ls.some((l) => l.k === "idps_idmc_conflict") && "IDMC GIDD (2026)"].filter(Boolean);
    chartBlock(document.getElementById(id), {
      id: `${iso}-${id}`, filename: `${iso}_${id}`, title, source: `${srcs.length > 1 ? "Sources" : "Source"}: ${srcs.join("; ")}`,
      summary: `${title}. Lines for ${ls.map((l) => LABEL[l.k] || l.k).join(", ")}.`,
      note: "Each line is a separate year-end series; lines are never added together. A series with a single year shows as a dot.",
      draw: (w) => Plot.plot({ ...base(w, 260), marginRight: w < 520 ? 70 : 170, marks: [Plot.ruleY([0], { stroke: "var(--line-strong)" }),
        ...ls.map((l) => Plot.lineY(l.pts, { x: "year", y: "value", stroke: l.color, strokeWidth: 2, strokeDasharray: l.k === "idps_unhcr" ? "4,3" : null })),
        ...isolatedMarks(ls),
        ...ls.map((l) => Plot.text([l.pts[l.pts.length - 1]], { x: "year", y: "value", text: () => (w < 520 && SHORT[l.k]) || LABEL[l.k] || l.k, dx: 8, textAnchor: "start", fill: inkOf(l.color), fontWeight: 500, lineWidth: w < 520 ? 6 : 14, className: "end-label" })),
        Plot.tip(ls.flatMap((l) => l.pts.map((p) => ({ ...p, k: l.k }))), Plot.pointer({ x: "year", y: "value", title: (d) => `${LABEL[d.k]}, ${d.year}\n${fmt(d.value)}` }))] }),
      table: { columns: [{ key: "year", label: "Year", type: "year" }, ...ls.map((l) => ({ key: l.k, label: LABEL[l.k] || l.k, type: "num" }))],
        rows: years.map((y) => Object.fromEntries([["year", y], ...ls.map((l) => [l.k, l.pts.find((p) => p.year === y)?.value ?? null])])) },
    });
  };
  block("hosted-chart", `People hosted in ${esc(c.name)} over time`, c.hosted);
  const inside = { idps_unhcr: c.internal.idps_unhcr, idps_idmc_conflict: c.internal.idps_idmc_conflict, others_inside: c.internal.others_of_concern };
  block("from-chart", `People from ${esc(c.name)}: abroad and displaced inside`,
    { ...c.from, ...Object.fromEntries(Object.entries(inside).filter(([, v]) => v && v.length)) });

  // IDMC's yearly new displacements: a bar per year, never on the year-end axis
  const FLOW = { idmc_conflict_new: ["New displacements from conflict and violence (IDMC)", C.idp, "conflict"],
    idmc_disaster_new: ["New displacements from disasters (IDMC)", C.context, "disaster"] };
  for (const k of idmcFlows) {
    const pts = c.internal[k].filter(([, v]) => v != null).map(([year, value]) => ({ year, value }));
    const [title, color, word] = FLOW[k];
    const y0 = pts[0].year, y1 = pts[pts.length - 1].year;
    const domain = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
    chartBlock(document.getElementById(`flow-${k}`), {
      id: `${iso}-${k}`, filename: `${iso}_${k}`, title: `${title}, ${y0 === y1 ? y0 : `${y0} to ${y1}`}`,
      source: `Source: IDMC GIDD (2026), new displacements (${word})`,
      summary: `Bar chart of IDMC new displacements from ${word} in ${c.name}, a yearly count of movements.`,
      note: "A yearly count of movements, not people. Years without a bar have no figure in IDMC's data.",
      draw: (w) => {
        const b = base(w, 200);
        const mr = w < 520 ? 20 : 40;
        // bars stay at most 48 px wide, so one or two years don't fill the whole chart
        const step = (w - (b.marginLeft ?? 40) - mr) / domain.length;
        const padding = Math.min(0.9, Math.max(0.1, 1 - 48 / step));
        return Plot.plot({ ...b, marginRight: mr,
        x: { ...base(w).x, type: "band", domain, padding, tickFormat: (d) => (domain.length <= 8 || d % 5 === 0 ? String(d) : "") },
        marks: [Plot.barY(pts, { x: "year", y: "value", fill: color, fillOpacity: 0.85, insetLeft: 1, insetRight: 1 }),
          ...(pts.length <= 3 ? [Plot.text(pts, { x: "year", y: "value", text: (d) => fmt(d.value), dy: -8, fill: inkOf(color), fontWeight: 500 })] : []),
          Plot.ruleY([0], { stroke: "var(--line-strong)" }),
          Plot.tip(pts, Plot.pointerX({ x: "year", y: "value", title: (d) => `${d.year}: ${fmt(d.value)} new displacements (${word})` }))] });
      },
      table: { columns: [{ key: "year", label: "Year", type: "year" }, { key: "value", label: `New displacements (${word})`, type: "num" }], rows: pts },
    });
  }
  renderMiniGlobe(document.getElementById("cg"), { origin: iso, hosts: [], originName: c.name }).catch(() => {});
} catch (e) {
  console.error(e);
  main.innerHTML = `<div class="page page--narrow"><div class="empty-state"><h3>No data for this country</h3>
    <p class="muted">We have no displacement figures for ${esc(iso)}.</p><p><a href="index.html">Back to the globe</a> · <a href="request.html?q=${esc(iso)}">Request data</a></p></div></div>`;
}
