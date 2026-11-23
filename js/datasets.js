// Dataset library: every dataset, what it covers, years, licence, release, and downloads.
import { initPage } from "./layout.js";
import { getJSON, measures as loadMeasures } from "./data.js";
import { esc, numHTML, applyNumbers } from "./format.js";
import { cite } from "./cite.js";
import { icon } from "./icons.js";
import { unverifiedTag } from "./review.js";
import { MAP_SOURCE } from "./config.js";

initPage({ page: "datasets" });
document.body.classList.add("page-datasets");
const [ds, measures, sources] = await Promise.all([getJSON("data/web/datasets.json"), loadMeasures(), getJSON("data/web/sources.json")]);
const NE = sources.find((s) => s.id === "natural-earth");
const M = Object.fromEntries(measures.map((m) => [m.id, m]));
const size = (b) => (b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

const main = document.getElementById("main");
main.innerHTML = `<div class="page page--narrow">
  <h1>Datasets</h1>
  <p class="muted" style="max-width:68ch">Every dataset used on this site. Download the cleaned file (one long format: source, measure, origin, host, year, value, footnote and a pointer to the original row) or go to the original source. Big files are gzipped (.csv.gz).</p>
  <div class="dsets">${ds.map((d) => {
    const c = d.csl ? { html: '<span class="muted">Preparing the citation…</span>' } : null;
    const ms = (d.measures || []).map((m) => M[m]?.label).filter(Boolean);
    return `<article class="card dset" id="${esc(d.id)}">
      <div class="dset__head"><div><p class="eyebrow">${esc(d.short || "")}</p><h2>${esc(d.dataset)}</h2><p class="muted small">${esc(d.organisation || "")}</p></div>
        ${d.status === "to_confirm" ? unverifiedTag(d.to_check) : ""}</div>
      <dl class="dset__dl">
        ${ms.length ? `<dt>Covers</dt><dd>${ms.map(esc).join(" · ")}</dd>` : ""}
        ${d.years ? `<dt>Years</dt><dd class="tabular">${d.years[0]} to ${d.years[1]}</dd>` : ""}
        ${d.rows ? `<dt>Rows</dt><dd>${numHTML(d.rows)}</dd>` : ""}
        ${d.release ? `<dt>Release</dt><dd>${esc(d.release)}</dd>` : ""}
        ${d.accessed ? `<dt>Accessed</dt><dd>${esc(d.accessed)}</dd>` : ""}
        <dt>Licence</dt><dd>${d.licence_url ? `<a href="${esc(d.licence_url)}" rel="noopener">${esc(d.licence)}</a>` : esc(d.licence || "")}</dd>
      </dl>
      ${c ? `<p class="small dset__cite" data-cite-for="${esc(d.id)}">${c.html}</p>` : ""}
      <div class="dset__actions">
        ${d.clean_file ? `<a class="btn btn--sm" href="${esc(d.clean_file)}" download>${icon("download", { size: 14 })} Clean file ${size(d.clean_file_bytes)}</a>` : ""}
        ${d.url ? `<a class="btn btn--sm btn--ghost" href="${esc(d.url)}" rel="noopener">${icon("external", { size: 14 })} Original source</a>` : ""}
      </div></article>`;
  }).join("")}
  <article class="card dset" id="maps">
    <div class="dset__head"><div><p class="eyebrow">Natural Earth</p><h2>Country borders for the maps</h2><p class="muted small">Natural Earth, India point of view</p></div></div>
    <dl class="dset__dl">
      <dt>Covers</dt><dd>Admin 0 countries, India point of view (<code>ne_10m_admin_0_countries_ind</code>): borders as on India's official maps</dd>
      <dt>Release</dt><dd>Natural Earth ${esc(MAP_SOURCE.release)} (<a href="https://github.com/nvkelso/natural-earth-vector/tree/${esc(MAP_SOURCE.release)}">natural-earth-vector</a>), 1:10m</dd>
      <dt>Format</dt><dd>TopoJSON made by this site's pipeline: simplified on the shared borders (neighbours keep one common line), to about the detail of a 1:110m map for the home globe and a 1:50m map for the smaller maps and the big map. <a href="${esc(MAP_SOURCE.files[50])}" download>50m file</a> · <a href="${esc(MAP_SOURCE.files[110])}" download>110m file</a></dd>
      <dt>Licence</dt><dd><a href="https://www.naturalearthdata.com/about/terms-of-use/">Public domain</a></dd>
      <dt>Borders</dt><dd>${esc(MAP_SOURCE.bordersNote)}</dd>
    </dl>
    ${NE?.csl ? `<p class="small dset__cite" data-cite-for="natural-earth"><span class="muted">Preparing the citation…</span></p>` : ""}
    <div class="dset__actions"><a class="btn btn--sm btn--ghost" href="https://www.naturalearthdata.com/">${icon("external", { size: 14 })} Original source</a></div>
  </article></div>
  <p class="small muted" style="margin-top:24px">Original downloads are kept out of this site. EM-DAT disaster data is not included because its terms do not allow redistribution; disaster displacement comes from IDMC.</p>
</div>`;
applyNumbers(main);
for (const d of ds) {
  if (!d.csl) continue;
  cite(d.csl, "apa").then((c) => { const el = main.querySelector(`[data-cite-for="${d.id}"]`); if (el) el.innerHTML = c.html; });
}
if (NE?.csl) cite(NE.csl, "apa").then((c) => { const el = main.querySelector('[data-cite-for="natural-earth"]'); if (el) el.innerHTML = c.html; });
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
