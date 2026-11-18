// Dataset library: every dataset, what it covers, years, licence, release, and downloads.
import { initPage } from "./layout.js";
import { getJSON, measures as loadMeasures } from "./data.js";
import { esc, numHTML, applyNumbers } from "./format.js";
import { cite } from "./cite.js";
import { icon } from "./icons.js";
import { unverifiedTag } from "./review.js";

initPage({ page: "datasets" });
document.body.classList.add("page-datasets");
const [ds, measures] = await Promise.all([getJSON("data/web/datasets.json"), loadMeasures()]);
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
  }).join("")}</div>
  <p class="small muted" style="margin-top:24px">Original downloads are kept out of this site. EM-DAT disaster data is not included because its terms do not allow redistribution; disaster displacement comes from IDMC.</p>
</div>`;
applyNumbers(main);
for (const d of ds) {
  if (!d.csl) continue;
  cite(d.csl, "apa").then((c) => { const el = main.querySelector(`[data-cite-for="${d.id}"]`); if (el) el.innerHTML = c.html; });
}
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
