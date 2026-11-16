// Every number on the site goes through this module, so the Indian / international switch
// reaches cards, tables, chart axes, titles and exports alike.
//   fmt(200000)       -> "2,00,000" (Indian) or "200,000" (international)
//   fmtShort(200000)  -> "2 lakh" or "200k"  (chart axes only)
// Missing values are never shown as 0: fmt(null) -> "no data".
import { store } from "./store.js";

const KEY = "numfmt";
export const NO_DATA = "no data";

export function mode() {
  const m = store.get(KEY, "intl");
  return m === "ind" ? "ind" : "intl";
}

export function setMode(m) {
  store.set(KEY, m === "ind" ? "ind" : "intl");
  applyNumbers(document);
  document.dispatchEvent(new CustomEvent("numfmt-change", { detail: mode() }));
}

const cache = new Map();
function nf(decimals) {
  const key = `${mode()}|${decimals}`;
  if (!cache.has(key)) {
    cache.set(key, new Intl.NumberFormat(mode() === "ind" ? "en-IN" : "en-US", {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }));
  }
  return cache.get(key);
}

export const isMissing = (n) => n === null || n === undefined || n === "" || Number.isNaN(Number(n));

export function fmt(n, { decimals = 0 } = {}) {
  if (isMissing(n)) return NO_DATA;
  return nf(decimals).format(Number(n));
}

export function fmtPct(p, decimals = 1) {
  if (isMissing(p)) return NO_DATA;
  return `${fmt(p, { decimals })}%`;
}

function trim(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, "");
}

/** Short forms, for chart axes only. */
export function fmtShort(n) {
  if (isMissing(n)) return "";
  const v = Number(n);
  const a = Math.abs(v);
  if (mode() === "ind") {
    if (a >= 1e7) return `${trim(v / 1e7)} crore`;
    if (a >= 1e5) return `${trim(v / 1e5)} lakh`;
    return fmt(v);
  }
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}k`;
  return fmt(v);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** A number that re-formats itself when the switch changes. */
export function numHTML(n, { decimals = 0, cls = "num" } = {}) {
  if (isMissing(n)) return `<span class="no-data">${NO_DATA}</span>`;
  return `<span class="${cls}" data-num="${Number(n)}" data-dec="${decimals}">${esc(fmt(n, { decimals }))}</span>`;
}

export function pctHTML(p, decimals = 1, cls = "num") {
  if (isMissing(p)) return `<span class="no-data">${NO_DATA}</span>`;
  return `<span class="${cls}" data-pct="${Number(p)}" data-dec="${decimals}">${esc(fmtPct(p, decimals))}</span>`;
}

/** Fill a template from the pipeline: {"text": "... {n0} ... {p0}", "nums": [...], "pcts": [...]}. */
export function fillTemplate(t, { plain = false } = {}) {
  if (!t) return "";
  const text = typeof t === "string" ? t : t.text;
  const nums = t.nums || [];
  const pcts = t.pcts || [];
  if (plain) {
    return text.replace(/\{n(\d+)\}/g, (_, i) => fmt(nums[+i])).replace(/\{p(\d+)\}/g, (_, i) => fmtPct(pcts[+i]));
  }
  return esc(text).replace(/\{n(\d+)\}/g, (_, i) => numHTML(nums[+i])).replace(/\{p(\d+)\}/g, (_, i) => pctHTML(pcts[+i]));
}

/** Re-format every live number under root (called when the switch changes). */
export function applyNumbers(root = document) {
  root.querySelectorAll("[data-num]").forEach((el) => {
    el.textContent = fmt(el.dataset.num, { decimals: Number(el.dataset.dec || 0) });
  });
  root.querySelectorAll("[data-pct]").forEach((el) => {
    el.textContent = fmtPct(el.dataset.pct, Number(el.dataset.dec || 1));
  });
  root.querySelectorAll("[data-short]").forEach((el) => {
    el.textContent = fmtShort(el.dataset.short);
  });
}
