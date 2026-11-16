// My collection (walkthrough screens 13 and 14): the key-numbers table, references and export.
import { initPage, guideTip } from "./layout.js";
import { tips as loadTips } from "./data.js";
import { esc, numHTML, pctHTML, applyNumbers, fmt, fmtPct, mode } from "./format.js";
import { icon } from "./icons.js";
import { items, remove, update, add, move } from "./collection.js";
import { cite, referenceList, STYLES } from "./cite.js";
import { store } from "./store.js";
import { save } from "./charts.js";

initPage({ page: "collection" });
document.body.classList.add("page-collection");
const main = document.getElementById("main");
const tips = await loadTips();
let style = store.get("cite-style", "apa");

function render() {
  const list = items();
  const sits = [...new Set(list.map((i) => i.situation_title).filter(Boolean))];
  const sub = `${sits.length === 1 ? `${esc(sits[0])} · ` : sits.length > 1 ? `${sits.length} situations · ` : ""}${list.length} item${list.length === 1 ? "" : "s"} · saved in this browser`;
  main.innerHTML = `<div class="page page--narrow">
    <div class="coll-head">
      <div><h1>My collection</h1><p class="muted">${sub}</p></div>
      <div class="coll-actions">
        <button class="btn" type="button" id="add-note">+ Add a note</button>
        <button class="btn btn--primary" type="button" id="export" ${list.length ? "" : "disabled"}>Export ${icon("download", { size: 16 })}</button>
      </div>
    </div>
    ${guideTip(tips.collection)}
    ${list.length ? tableHTML(list) : emptyHTML()}
    ${list.length ? refsHTML(list) : ""}
    <p class="small muted" style="margin-top:32px">Your collection is stored only in this browser (not on any server). Clearing site data removes it; export to keep a copy.</p>
  </div>`;
  applyNumbers(main);
  wire();
  if (list.length) {
    referenceList(cslsOf(list), style).then((refs) => {
      const ol = main.querySelector("#refs");
      if (!ol) return;
      ol.innerHTML = refs.map((r) => `<li>${r.html}</li>`).join("");
      ol.removeAttribute("aria-busy");
    });
  }
}

function emptyHTML() {
  return `<div class="empty-state" style="margin-top:24px"><h3>Nothing pinned yet</h3>
    <p class="muted">Use the ${icon("pin", { size: 14 })} button next to any number, chart or reading to collect it here with its source and citation.</p>
    <p><a href="situation.html?id=lka-ind">Open an example: Sri Lankan refugees in India &rsaquo;</a></p></div>`;
}

function valueCell(i) {
  if (i.kind === "number") return i.unit === "percent" ? pctHTML(i.value) : numHTML(i.value);
  if (i.kind === "chart") return `<span class="muted">${icon("chart", { size: 14 })} chart</span>`;
  if (i.kind === "reading") return `<span class="muted">reading</span>`;
  return `<span class="muted">note</span>`;
}

function tableHTML(list) {
  return `<div class="table-wrap coll-wrap"><table class="table coll">
    <thead><tr><th scope="col" class="num">Number</th><th scope="col">What it measures</th><th scope="col">Place</th>
      <th scope="col">Year</th><th scope="col">Source</th><th scope="col">My note</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${list.map((i, n) => `<tr data-key="${esc(i.key)}">
      <td class="num coll__num" data-label="Number">${valueCell(i)}</td>
      <td data-label="What it measures">${i.kind === "chart" && i.url ? `<a href="${esc(i.url)}">${esc(i.label)}</a>` : i.kind === "note" ? "" : esc(i.what || i.label)}</td>
      <td data-label="Place">${esc(i.place || "")}</td>
      <td class="tabular" data-label="Year">${esc(i.year ?? "")}</td>
      <td data-label="Source">${esc(i.source_label || i.source_short || "")}</td>
      <td data-label="My note"><label class="sr-only" for="note-${n}">Note for ${esc(i.label || "this item")}</label>
        <textarea id="note-${n}" class="coll__note" rows="1" data-note="${esc(i.key)}" placeholder="Add a note">${esc(i.note || "")}</textarea></td>
      <td class="coll__row-actions">
        <button class="icon-btn" type="button" data-up="${esc(i.key)}" aria-label="Move up" ${n ? "" : "disabled"}>↑</button>
        <button class="icon-btn" type="button" data-remove="${esc(i.key)}" aria-label="Remove from collection">${icon("close", { size: 16 })}</button>
      </td></tr>`).join("")}</tbody></table></div>`;
}

function cslsOf(list) {
  const out = [];
  for (const i of list) {
    if (i.csl) out.push(i.csl);
    for (const c of i.csls || []) out.push(c);
  }
  return out;
}

function refsHTML(list) {
  return `<section class="coll-refs"><div class="coll-refs__head"><h2>References (${STYLES[style]})</h2>
      <div class="seg seg--text" role="group" aria-label="Citation style">${Object.entries(STYLES).map(([k, v]) => `<button type="button" data-style="${k}" aria-pressed="${k === style}">${v}</button>`).join("")}</div></div>
    <ol class="refs" id="refs" aria-busy="true"><li class="muted">Preparing references…</li></ol>
    <button class="btn btn--sm" type="button" id="copy-refs">Copy references</button></section>`;
}

function wire() {
  main.querySelector("#add-note").addEventListener("click", () => {
    add({ kind: "note", key: `note:${Date.now()}`, label: "", note: "" });
    render();
    main.querySelector("tbody tr:last-child textarea")?.focus();
  });
  main.querySelector("#export")?.addEventListener("click", openExport);
  main.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => { remove(b.dataset.remove); render(); }));
  main.querySelectorAll("[data-up]").forEach((b) => b.addEventListener("click", () => { move(b.dataset.up, -1); render(); }));
  main.querySelectorAll("[data-note]").forEach((t) => {
    const grow = () => { t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; };
    grow();
    t.addEventListener("input", grow);
    t.addEventListener("change", () => update(t.dataset.note, { note: t.value }));
    t.addEventListener("blur", () => update(t.dataset.note, { note: t.value }));
  });
  main.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => { style = b.dataset.style; store.set("cite-style", style); render(); }));
  main.querySelector("#copy-refs")?.addEventListener("click", async (e) => {
    const txt = (await referenceList(cslsOf(items()), style)).map((r) => r.text).join("\n");
    try { await navigator.clipboard.writeText(txt); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy the list above"; }
  });
}

// ------------------------------------------------------------------ export dialog (screen 14)
function openExport() {
  let dlg = document.getElementById("export-dlg");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "export-dlg";
    dlg.className = "export";
    document.body.append(dlg);
  }
  dlg.innerHTML = `<form method="dialog" class="export__form">
    <div class="panel__head"><h2 class="panel__title" id="export-title">Export collection</h2>
      <button class="icon-btn" value="cancel" aria-label="Close">${icon("close")}</button></div>
    <div class="panel__body">
      <fieldset><legend class="eyebrow">Format</legend>
        <label class="radio"><input type="radio" name="fmt" value="docx" checked> Word table + references</label>
        <label class="radio"><input type="radio" name="fmt" value="xlsx"> Excel</label>
        <label class="radio"><input type="radio" name="fmt" value="csv"> CSV <span class="small muted">(one table; each row carries its full citation)</span></label>
      </fieldset>
      <fieldset><legend class="eyebrow">Citation style</legend>
        <div class="seg seg--text" role="group">${Object.entries(STYLES).map(([k, v]) => `<button type="button" data-xstyle="${k}" aria-pressed="${k === style}">${v}</button>`).join("")}</div>
      </fieldset>
      <fieldset><legend class="eyebrow">Include</legend>
        <label class="check"><input type="checkbox" name="refs" checked> Full references list</label>
        <label class="check"><input type="checkbox" name="defs" checked> Definitions used</label>
        <label class="check"><input type="checkbox" name="lims" checked> Data limitation notes</label>
        <label class="check"><input type="checkbox" name="charts"> Charts (PNG)</label>
      </fieldset>
      <p class="small muted">Numbers use your current format (${mode() === "ind" ? "Indian: 1,00,000" : "international: 100,000"}).</p>
      <p class="export__status small" role="status" aria-live="polite"></p>
      <div class="export__actions"><button class="btn btn--primary" type="button" id="do-export">${icon("download", { size: 16 })} Download</button></div>
    </div></form>`;
  dlg.setAttribute("aria-labelledby", "export-title");
  let xstyle = style;
  dlg.querySelectorAll("[data-xstyle]").forEach((b) => b.addEventListener("click", () => {
    xstyle = b.dataset.xstyle;
    dlg.querySelectorAll("[data-xstyle]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  dlg.querySelector("#do-export").addEventListener("click", async () => {
    const f = new FormData(dlg.querySelector("form"));
    const opts = { format: f.get("fmt"), style: xstyle, refs: !!f.get("refs"), defs: !!f.get("defs"), lims: !!f.get("lims"), charts: !!f.get("charts") };
    const status = dlg.querySelector(".export__status");
    const btn = dlg.querySelector("#do-export");
    btn.disabled = true;
    status.textContent = "Preparing your file…";
    try {
      const { exportCollection } = await import("./export.js");
      const name = await exportCollection(items(), opts, (m) => { status.textContent = m; });
      status.textContent = `Downloaded ${name}.`;
    } catch (e) {
      console.error(e);
      status.textContent = `Export failed: ${e.message}`;
    } finally {
      btn.disabled = false;
    }
  });
  dlg.showModal();
}

render();
document.addEventListener("numfmt-change", () => applyNumbers(main));
