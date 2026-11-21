// The researcher's collection: numbers, charts, readings and notes, each with its source.
// Saved in this browser only (localStorage). Every item carries what an export needs.
import { store, collectionItems } from "./store.js";
import { toast } from "./layout.js";
import { esc, fmt, fmtPct } from "./format.js";

const KEY = "collection";

export const items = () => collectionItems();
const save = (list) => {
  store.set(KEY, list);
  document.dispatchEvent(new CustomEvent("collection-change", { detail: list.length }));
};

export const has = (key) => items().some((i) => i.key === key);

export function add(item) {
  const list = items();
  if (list.some((i) => i.key === item.key)) return false;
  list.push({ ...item, added: new Date().toISOString(), note: item.note || "" });
  save(list);
  return true;
}

export function remove(key) {
  save(items().filter((i) => i.key !== key));
}

export function update(key, patch) {
  save(items().map((i) => (i.key === key ? { ...i, ...patch } : i)));
}

export function move(key, dir) {
  const list = items();
  const i = list.findIndex((x) => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save(list);
}

export function valueText(item) {
  if (item.kind !== "number") return "";
  return item.unit === "percent" ? fmtPct(item.value) : fmt(item.value);
}

/** Pin (or unpin, if already pinned) with a toast and Undo. Every pin button for the same item updates. */
export function pin(item, btn) {
  if (has(item.key)) {
    remove(item.key);
    syncPins(document);
    toast("<strong>Removed from your collection</strong>", {
      action: "Undo", timeout: 4000,
      onAction: () => { add(item); syncPins(document); },
    });
    return;
  }
  add(item);
  syncPins(document);
  const n = items().length;
  const what = item.kind === "number" ? `${valueText(item)} · ${esc(item.label)}` : esc(item.label);
  toast(`<strong>Added to your collection (${n})</strong><div class="small muted">${what}${item.source_short ? ` · ${esc(item.source_short)}` : ""} · citation saved</div>`, {
    action: "Undo", timeout: 4000,
    onAction: () => { remove(item.key); syncPins(document); },
  });
}

/** Mark pin buttons already in the collection. */
export function syncPins(root = document) {
  const keys = new Set(items().map((i) => i.key));
  root.querySelectorAll("[data-pin-key]").forEach((b) => b.setAttribute("aria-pressed", String(keys.has(b.dataset.pinKey))));
}
