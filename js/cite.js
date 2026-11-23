// Citations from CSL-JSON in APA (7th), Chicago (author-date) and Harvard (Cite Them Right).
// Uses citation-js with the official CSL style files (pinned); falls back to the small formatter below
// when the CDN can't be reached. Returns { text, html } so a reference can be copied or shown with italics.
import { esc } from "./format.js";

const yearOf = (it) => it.issued?.["date-parts"]?.[0]?.[0] ?? "n.d.";
const initials = (given = "") => given.split(/[\s.]+/).filter(Boolean).map((g) => `${g[0]}.`).join(" ");

function namesAPA(list = []) {
  const ns = list.map((a) => (a.literal ? a.literal : a.given ? `${a.family}, ${initials(a.given)}` : a.family));
  if (ns.length <= 1) return ns[0] || "";
  if (ns.length === 2) return `${ns[0]}, & ${ns[1]}`;
  return `${ns.slice(0, -1).join(", ")}, & ${ns[ns.length - 1]}`;
}
function namesChicago(list = []) {
  const ns = list.map((a, i) => (a.literal ? a.literal : i === 0 ? `${a.family}${a.given ? `, ${a.given}` : ""}` : `${a.given ? `${a.given} ` : ""}${a.family}`));
  if (ns.length <= 1) return ns[0] || "";
  return `${ns.slice(0, -1).join(", ")}, and ${ns[ns.length - 1]}`;
}
function namesHarvard(list = []) {
  const ns = list.map((a) => (a.literal ? a.literal : `${a.family}${a.given ? `, ${initials(a.given)}` : ""}`));
  if (ns.length <= 1) return ns[0] || "";
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}
function editorsAPA(list = []) {
  const ns = list.map((a) => (a.literal ? a.literal : `${initials(a.given || "")} ${a.family}`.trim()));
  return ns.length > 1 ? `${ns.slice(0, -1).join(", ")} & ${ns[ns.length - 1]}` : ns[0] || "";
}
const end = (s) => (s && !/[.?!]$/.test(s) ? `${s}.` : s || "");

/** parts: array of [text, italic?]; joins into {text, html}. */
function build(parts) {
  const text = parts.map(([t]) => t).join("");
  const html = parts.map(([t, i]) => (i ? `<i>${esc(t)}</i>` : esc(t))).join("");
  return { text: text.replace(/\s+/g, " ").trim(), html: html.replace(/\s+/g, " ").trim() };
}

function fallbackCite(it, style = "apa", detail = "") {
  if (!it) return { text: "", html: "" };
  const y = yearOf(it);
  const t = it.title || "";
  const url = it.DOI ? `https://doi.org/${it.DOI}` : it.URL || "";
  const extra = detail ? ` ${end(detail)}` : "";
  const authorIsPublisher = it.author?.length === 1 && it.author[0].literal && it.publisher &&
    it.publisher.toLowerCase().includes(it.author[0].literal.toLowerCase().slice(0, 5));
  if (style === "chicago") {
    const a = namesChicago(it.author);
    switch (it.type) {
      case "article-journal":
        return build([[`${end(a)} ${y}. "${end(t)}" `], [it["container-title"] || "", true],
          [`${it.volume ? ` ${it.volume}` : ""}${it.issue ? ` (${it.issue})` : ""}${it.page ? `: ${it.page}` : ""}. ${url}`]]);
      case "chapter":
        return build([[`${end(a)} ${y}. "${end(t)}" In `], [it["container-title"] || "", true],
          [`, edited by ${editorsAPA(it.editor)}. ${end(it.publisher)} ${url}`]]);
      case "book":
      case "report":
      case "document":
      case "legislation":
        return build([[`${end(a)} ${y}. `], [end(t), true], [`${it.number ? ` ${end(it.number)}` : ""} ${it.publisher && it.publisher !== a ? end(it.publisher) : ""} ${url}`]]);
      default:
        return build([[`${end(a)} ${y}. `], [end(t), true], [`${it.version ? ` Version ${it.version}.` : ""}${extra} ${authorIsPublisher || it.author?.[0]?.literal === "UNHCR" ? "" : end(it.publisher)} ${url}`]]);
    }
  }
  if (style === "harvard") {
    const a = namesHarvard(it.author);
    switch (it.type) {
      case "article-journal":
        return build([[`${a} (${y}) '${t}', `], [it["container-title"] || "", true],
          [`${it.volume ? `, ${it.volume}` : ""}${it.issue ? `(${it.issue})` : ""}${it.page ? `, pp. ${it.page}` : ""}. ${url}`]]);
      case "chapter":
        return build([[`${a} (${y}) '${t}', in ${editorsAPA(it.editor)} (ed.) `], [it["container-title"] || "", true], [`. ${end(it.publisher)}`]]);
      case "book":
      case "report":
      case "document":
      case "legislation":
        return build([[`${a} (${y}) `], [t, true], [`${it.number ? `, ${it.number}` : ""}.${it.publisher && it.publisher !== a ? ` ${end(it.publisher)}` : ""} ${url}`]]);
      default:
        return build([[`${a} (${y}) `], [t, true], [`${it.version ? ` (version ${it.version})` : ""} [Data set].${extra} ${authorIsPublisher || it.author?.[0]?.literal === "UNHCR" ? "" : end(it.publisher)} ${url ? `Available at: ${url}` : ""}`]]);
    }
  }
  // APA 7
  const a = namesAPA(it.author);
  switch (it.type) {
    case "article-journal":
      return build([[`${end(a)} (${y}). ${end(t)} `], [it["container-title"] || "", true],
        [`${it.volume ? `, ` : ""}`], [it.volume || "", true], [`${it.issue ? `(${it.issue})` : ""}${it.page ? `, ${it.page}` : ""}${it["container-title"] ? "." : ""} ${url}`]]);
    case "chapter":
      return build([[`${end(a)} (${y}). ${end(t)} In ${editorsAPA(it.editor)} (Ed${(it.editor || []).length > 1 ? "s" : ""}.), `],
        [it["container-title"] || "", true], [`${it.page ? ` (pp. ${it.page})` : ""}. ${end(it.publisher)}`]]);
    case "book":
      return build([[`${end(a)} (${y}). `], [end(t), true], [` ${end(it.publisher)}`]]);
    case "legislation":
    case "report":
    case "document":
      return build([[`${a ? `${end(a)} ` : ""}(${y}). `], [t, true], [`${it.number ? ` (${it.number})` : ""}.${it["container-title"] ? ` ${end(it["container-title"])}` : ""}${it.publisher && !authorIsPublisher && it.publisher !== a ? ` ${end(it.publisher)}` : ""} ${url}`]]);
    default:
      return build([[`${end(a)} (${y}). `], [t, true], [`${it.version ? ` (Version ${it.version})` : ""} [Data set].${extra} ${authorIsPublisher || it.author?.[0]?.literal === "UNHCR" ? "" : end(it.publisher)} ${url}`]]);
  }
}

export const STYLES = { apa: "APA", chicago: "Chicago", harvard: "Harvard" };

// ------------------------------------------------------------------ citation-js (official CSL styles)
const CORE = "https://cdn.jsdelivr.net/npm/@citation-js/core@0.9.0/+esm";
const PLUGIN = "https://cdn.jsdelivr.net/npm/@citation-js/plugin-csl@0.9.0/+esm";
const STYLE_BASE = "https://cdn.jsdelivr.net/gh/citation-style-language/styles@019a13a6b77c3d038733418845c8f614b7a37012/";
const TEMPLATE = { apa: ["wv1-apa", "apa.csl"], chicago: ["wv1-chicago", "chicago-author-date.csl"], harvard: ["wv1-harvard", "harvard-cite-them-right.csl"] };
let engine = null;

/** Load citation-js and the three styles (once). Resolves to Cite, or null if the CDN can't be reached. */
export function loadCiteEngine() {
  if (!engine) {
    engine = (async () => {
      const core = await import(CORE);
      await import(PLUGIN);
      const cfg = core.plugins.config.get("@csl");
      await Promise.all(Object.values(TEMPLATE).map(async ([name, file]) => {
        const xml = await (await fetch(STYLE_BASE + file)).text();
        cfg.styles.add(name, xml);
      }));
      return core.Cite;
    })().catch((e) => {
      console.warn("citation-js unavailable, using the built-in formatter:", e);
      return null;
    });
  }
  return engine;
}

const stripEntry = (html) => html.replace(/<div class="csl-bib-body">|<\/div>\s*$/g, "").replace(/<div class="csl-entry">/g, "").trim();

/** Make the URLs and DOIs (https://doi.org/...) in a formatted citation clickable. The link text is exactly the
 *  URL as printed, so a citation selected and copied by hand reads the same; a full stop, comma or unmatched
 *  bracket that ends the sentence stays outside the link. (js/links.js opens them in a new tab.) */
export function linkify(html) {
  let inLink = false;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith("<")) {
      if (/^<a[\s>]/i.test(part)) inLink = true;
      else if (/^<\/a>/i.test(part)) inLink = false;
      return part;
    }
    if (inLink) return part;
    return part.replace(/https?:\/\/[^\s<]+/g, (m) => {
      let url = m;
      let tail = "";
      for (;;) {
        const last = url.slice(-1);
        if (/[.,;:]/.test(last)) { tail = last + tail; url = url.slice(0, -1); continue; }
        if (last === ")" && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) { tail = last + tail; url = url.slice(0, -1); continue; }
        break;
      }
      const href = url.replace(/&amp;/g, "&").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return `<a href="${href}">${url}</a>${tail}`;
    });
  }).join("");
}
const withLinks = (c) => ({ ...c, html: linkify(c.html || "") });

/** One reference: { text, html }. `detail` (e.g. "Sri Lanka to India, 2016") is added after it. The html has its
 *  URLs and DOIs as links; the text is plain. */
export async function cite(it, style = "apa", detail = "") {
  if (!it) return { text: "", html: "" };
  const Cite = await loadCiteEngine();
  if (!Cite) return withLinks(fallbackCite(it, style, detail));
  try {
    const c = new Cite({ ...it, id: it.id || "x" });
    const opt = { template: TEMPLATE[style]?.[0] || TEMPLATE.apa[0], lang: "en-US" };
    const text = c.format("bibliography", { ...opt, format: "text" }).trim();
    const html = stripEntry(c.format("bibliography", { ...opt, format: "html" }).trim());
    const extra = detail ? ` Data: ${detail}.` : "";
    return withLinks({ text: text + extra, html: html + esc(extra) });
  } catch (e) {
    console.warn(e);
    return withLinks(fallbackCite(it, style, detail));
  }
}

/** A sorted, de-duplicated reference list: [{ text, html }]. */
export async function referenceList(items, style = "apa") {
  const seen = new Map();
  for (const it of items) {
    if (!it) continue;
    const key = it.id || JSON.stringify(it);
    if (!seen.has(key)) seen.set(key, it);
  }
  const out = await Promise.all([...seen.values()].map((it) => cite(it, style)));
  const uniq = new Map(out.filter((c) => c.text).map((c) => [c.text, c]));
  return [...uniq.values()].sort((a, b) => a.text.localeCompare(b.text));
}
