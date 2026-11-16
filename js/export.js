// Export the collection as a Word table + references (docx), Excel (ExcelJS) or CSV (PapaParse).
// Everything is built in the browser. Numbers follow the reader's format (Indian or international);
// Excel keeps them as real numbers with a matching display format.
import { fmt, fmtPct, mode } from "./format.js";
import { cite, referenceList, STYLES } from "./cite.js";
import { save } from "./charts.js";

const DOCX = "https://cdn.jsdelivr.net/npm/docx@9.0.2/+esm";
const PAPA = "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";
const EXCELJS = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";   // UMD build: sets window.ExcelJS

const stamp = () => new Date().toISOString().slice(0, 10);
const shown = (i) => (i.kind !== "number" ? "" : i.unit === "percent" ? fmtPct(i.value) : fmt(i.value));
const what = (i) => (i.kind === "note" ? "Note" : i.what || i.label || "");

function sourceOf(i) {
  return i.source_label || i.source_short || (i.kind === "reading" ? "Reading" : "");
}

/** Rows shared by all three formats. */
export async function rowsFor(list, opts) {
  return Promise.all(list.map(async (i) => ({
    kind: i.kind,
    number: i.kind === "number" ? i.value : null,
    number_shown: shown(i),
    unit: i.unit || "",
    what_it_measures: what(i),
    place: i.place || "",
    year: i.year ?? "",
    source: sourceOf(i),
    dataset_release: i.release || "",
    my_note: i.note || "",
    citation: i.csl ? (await cite(i.csl, opts.style, i.cite_detail || "")).text : "",
    definition: i.definition || "",
    original_row: i.raw_ref || "",
    situation: i.situation_title || "",
  })));
}

function definitions(list) {
  const seen = new Map();
  for (const i of list) if (i.kind === "number" && i.definition && i.measure_id) seen.set(i.measure_id, { term: (i.label || "").replace(/,? ?\(?\d{4}\)?$/, ""), text: i.definition });
  return [...seen.values()];
}

function limitations(list) {
  const by = new Map();
  for (const i of list) {
    if (!i.limitations?.length) continue;
    const key = i.situation_title || "Other";
    const set = by.get(key) || new Set();
    i.limitations.forEach((l) => set.add(l));
    by.set(key, set);
  }
  return [...by.entries()].map(([s, set]) => ({ situation: s, notes: [...set] }));
}

const allCsl = (list) => list.flatMap((i) => [i.csl, ...(i.csls || [])]).filter(Boolean);

// ------------------------------------------------------------------ chart images
/** Render each pinned chart on its own page in a hidden frame and capture it as PNG. */
async function chartImages(list, onStatus) {
  const charts = list.filter((i) => i.kind === "chart" && i.url && i.chart_id);
  const out = [];
  for (const [n, c] of charts.entries()) {
    onStatus?.(`Drawing chart ${n + 1} of ${charts.length}…`);
    try {
      out.push({ item: c, ...(await captureChart(c)) });
    } catch (e) {
      console.warn("chart capture failed", c.chart_id, e);
      out.push({ item: c, error: e.message });
    }
  }
  return out;
}

function captureChart(c) {
  return new Promise((resolve, reject) => {
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;";
    const url = new URL(c.url, location.href);
    url.searchParams.set("theme", "light");
    url.hash = "";
    f.src = url.href;
    const done = (fn, v) => { clearInterval(t); clearTimeout(to); f.remove(); fn(v); };
    let t;
    const to = setTimeout(() => done(reject, new Error("timed out")), 30000);
    f.addEventListener("load", () => {
      t = setInterval(async () => {
        const w = f.contentWindow;
        const fig = w?.document.getElementById(c.chart_id);
        if (!fig || !fig.querySelector(".chart__body svg") || !w.wv1ChartPNG) return;
        clearInterval(t);
        try {
          await new Promise((r) => setTimeout(r, 400));
          const dataUrl = await w.wv1ChartPNG(c.chart_id);
          const img = await new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = dataUrl; });
          done(resolve, { dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        } catch (e) {
          done(reject, e);
        }
      }, 250);
    });
    document.body.append(f);
  });
}

const b64ToBytes = (dataUrl) => Uint8Array.from(atob(dataUrl.split(",")[1]), (ch) => ch.charCodeAt(0));

// ------------------------------------------------------------------ CSV
async function toCSV(list, opts) {
  const Papa = (await import(PAPA)).default;
  const rows = await rowsFor(list, opts);
  const cols = ["kind", "number", "number_shown", "unit", "what_it_measures", "place", "year", "source", "dataset_release",
    "my_note", "citation", ...(opts.defs ? ["definition"] : []), "original_row", "situation"];
  const csv = Papa.unparse(rows.map((r) => ({ ...r, number: r.number ?? "" })), { columns: cols });
  const name = `my-collection-${stamp()}.csv`;
  save(new Blob([`﻿${csv}\n`], { type: "text/csv;charset=utf-8" }), name);
  return name;
}

// ------------------------------------------------------------------ Word
/** citation-js HTML -> docx TextRuns, keeping italics. */
function runsFromHTML(d, html, size = 22) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const runs = [];
  const walk = (node, italic) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        if (n.textContent) runs.push(new d.TextRun({ text: n.textContent, italics: italic, size }));
      } else if (n.nodeType === 1) {
        const it = italic || n.tagName === "I" || n.tagName === "EM" || /italic/.test(n.getAttribute("style") || "");
        walk(n, it);
      }
    }
  };
  walk(doc.body.firstChild, false);
  return runs;
}

async function toDocx(list, opts, onStatus) {
  const d = await import(DOCX);
  const rows = await rowsFor(list, opts);
  const border = { style: d.BorderStyle.SINGLE, size: 4, color: "CFCAC0" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const cell = (text, { bold = false, right = false, width } = {}) => new d.TableCell({
    width: width ? { size: width, type: d.WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new d.Paragraph({ alignment: right ? d.AlignmentType.RIGHT : d.AlignmentType.LEFT,
      children: [new d.TextRun({ text: String(text ?? ""), bold, size: 20 })] })],
  });
  const head = ["Number", "What it measures", "Place", "Year", "Source", "My note"];
  const widths = [13, 33, 12, 8, 14, 20];
  const table = new d.Table({
    width: { size: 100, type: d.WidthType.PERCENTAGE }, borders,
    rows: [
      new d.TableRow({ tableHeader: true, children: head.map((h, k) => cell(h, { bold: true, right: k === 0, width: widths[k] })) }),
      ...rows.map((r) => new d.TableRow({ children: [
        cell(r.number_shown || (r.kind === "chart" ? "chart" : r.kind === "reading" ? "reading" : ""), { right: true }),
        cell(r.what_it_measures), cell(r.place), cell(r.year), cell(r.source), cell(r.my_note),
      ] })),
    ],
  });
  const H = (text, level = d.HeadingLevel.HEADING_2) => new d.Paragraph({ heading: level, spacing: { before: 320, after: 120 }, children: [new d.TextRun({ text })] });
  const P = (text, o = {}) => new d.Paragraph({ spacing: { after: 100 }, children: [new d.TextRun({ text, size: 22, ...o })] });
  const children = [
    new d.Paragraph({ heading: d.HeadingLevel.HEADING_1, children: [new d.TextRun({ text: "My collection" })] }),
    P(`Exported from Website v1 on ${stamp()}. Numbers are in ${mode() === "ind" ? "Indian (1,00,000)" : "international (100,000)"} format. Every figure comes from the dataset named in the Source column; full references follow.`, { color: "625E56" }),
    table,
  ];
  if (opts.refs) {
    const refs = await referenceList(allCsl(list), opts.style);
    children.push(H(`References (${STYLES[opts.style]})`));
    for (const r of refs) children.push(new d.Paragraph({ spacing: { after: 120 }, indent: { left: 720, hanging: 720 }, children: runsFromHTML(d, r.html) }));
  }
  if (opts.defs) {
    const defs = definitions(list);
    if (defs.length) {
      children.push(H("Definitions used"));
      for (const x of defs) children.push(new d.Paragraph({ spacing: { after: 100 }, children: [new d.TextRun({ text: `${x.term}: `, bold: true, size: 22 }), new d.TextRun({ text: x.text, size: 22 })] }));
    }
  }
  if (opts.lims) {
    const lims = limitations(list);
    if (lims.length) {
      children.push(H("Data limitation notes"));
      for (const g of lims) {
        children.push(P(g.situation, { bold: true }));
        for (const n of g.notes) children.push(new d.Paragraph({ bullet: { level: 0 }, children: [new d.TextRun({ text: n, size: 22 })] }));
      }
    }
  }
  if (opts.charts) {
    const imgs = await chartImages(list, onStatus);
    if (imgs.length) {
      children.push(H("Charts"));
      for (const im of imgs) {
        children.push(P(im.item.label, { bold: true }));
        if (im.error) { children.push(P(`(This chart could not be drawn: ${im.error})`, { italics: true })); continue; }
        const w = 600;
        children.push(new d.Paragraph({ children: [new d.ImageRun({ type: "png", data: b64ToBytes(im.dataUrl),
          transformation: { width: w, height: Math.round((w * im.height) / im.width) } })] }));
        if (im.item.source_short) children.push(P(`Source: ${im.item.source_short}. ${im.item.situation_title || ""}`, { color: "625E56", size: 18 }));
      }
    }
  }
  onStatus?.("Writing the Word file…");
  const doc = new d.Document({ creator: "Website v1", title: "My collection", styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } }, children }] });
  const blob = await d.Packer.toBlob(doc);
  const name = `my-collection-${stamp()}.docx`;
  save(blob, name);
  return name;
}

// ------------------------------------------------------------------ Excel
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = EXCELJS;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => reject(new Error("Excel library could not load"));
    document.head.append(s);
  });
}

// Excel display formats so cells stay real numbers but read like the site
const NUMFMT = { ind: '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0', intl: "#,##0" };

async function toXlsx(list, opts, onStatus) {
  const ExcelJS = await loadExcelJS();
  const rows = await rowsFor(list, opts);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Website v1";
  wb.created = new Date();
  const ws = wb.addWorksheet("Collection", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = [
    { header: "Number", key: "number", width: 14 }, { header: "What it measures", key: "what_it_measures", width: 44 },
    { header: "Place", key: "place", width: 16 }, { header: "Year", key: "year", width: 8 }, { header: "Source", key: "source", width: 18 },
    { header: "My note", key: "my_note", width: 30 }, { header: "Dataset release", key: "dataset_release", width: 30 },
    { header: `Citation (${STYLES[opts.style]})`, key: "citation", width: 70 },
    ...(opts.defs ? [{ header: "Definition", key: "definition", width: 60 }] : []),
    { header: "Original row", key: "original_row", width: 32 }, { header: "Situation", key: "situation", width: 32 },
  ];
  ws.columns = cols;
  ws.getRow(1).font = { bold: true };
  for (const [k, r] of rows.entries()) {
    const row = ws.addRow({ ...r, number: r.number ?? (r.kind === "chart" ? "chart" : r.kind === "reading" ? "reading" : null) });
    const c = row.getCell("number");
    if (list[k].kind === "number") {
      if (list[k].unit === "percent") { c.value = r.number / 100; c.numFmt = "0.0%"; } else { c.numFmt = NUMFMT[mode()]; }
      c.alignment = { horizontal: "right" };
    }
    row.alignment = { vertical: "top", wrapText: true };
  }
  if (opts.refs) {
    const s = wb.addWorksheet("References");
    s.columns = [{ header: `References (${STYLES[opts.style]})`, key: "r", width: 120 }];
    s.getRow(1).font = { bold: true };
    for (const r of await referenceList(allCsl(list), opts.style)) s.addRow({ r: r.text }).alignment = { wrapText: true };
  }
  if (opts.defs) {
    const s = wb.addWorksheet("Definitions");
    s.columns = [{ header: "Term", key: "term", width: 40 }, { header: "Definition", key: "text", width: 100 }];
    s.getRow(1).font = { bold: true };
    definitions(list).forEach((x) => { s.addRow(x).alignment = { wrapText: true, vertical: "top" }; });
  }
  if (opts.lims) {
    const s = wb.addWorksheet("Limitations");
    s.columns = [{ header: "Situation", key: "situation", width: 36 }, { header: "Limitation", key: "note", width: 90 }];
    s.getRow(1).font = { bold: true };
    limitations(list).forEach((g) => g.notes.forEach((n) => { s.addRow({ situation: g.situation, note: n }).alignment = { wrapText: true, vertical: "top" }; }));
  }
  if (opts.charts) {
    const imgs = (await chartImages(list, onStatus)).filter((i) => !i.error);
    if (imgs.length) {
      const s = wb.addWorksheet("Charts");
      let rowAt = 0;
      for (const im of imgs) {
        s.getCell(rowAt + 1, 1).value = im.item.label;
        s.getCell(rowAt + 1, 1).font = { bold: true };
        const id = wb.addImage({ base64: im.dataUrl, extension: "png" });
        const w = 640;
        const h = Math.round((w * im.height) / im.width);
        s.addImage(id, { tl: { col: 0, row: rowAt + 1 }, ext: { width: w, height: h } });
        rowAt += Math.ceil(h / 20) + 3;
      }
    }
  }
  const note = wb.addWorksheet("About");
  note.addRow([`Exported from Website v1 on ${stamp()}.`]);
  note.addRow([`Numbers are real numbers shown in ${mode() === "ind" ? "Indian" : "international"} format. Every figure comes from the dataset in its Source column.`]);
  note.getColumn(1).width = 110;
  onStatus?.("Writing the Excel file…");
  const buf = await wb.xlsx.writeBuffer();
  const name = `my-collection-${stamp()}.xlsx`;
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
  return name;
}

export async function exportCollection(list, opts, onStatus) {
  if (!list.length) throw new Error("Your collection is empty.");
  if (opts.format === "csv") return toCSV(list, opts);
  if (opts.format === "xlsx") return toXlsx(list, opts, onStatus);
  return toDocx(list, opts, onStatus);
}
