// Brief citations: one numbering per situation page, built once from the ids the brief cites (each a specific
// dataset release, e.g. unhcr-pop-2026, or a reading; never an organisation), numbered in order of first
// appearance in the brief (What, Why, When, How), then any other id in the brief's source list. The same numbers
// are used by the [n] markers after brief sentences, the "Sources:" line and "Cited in the brief" in Sources & reading.
// Every marker is a link to its own numbered row in "Sources cited in the brief" ([1] -> #src-1): the row scrolls
// into view below the top bar and is highlighted for about 2 s. Hovering a marker shows the source name after
// 300 ms. Each row shows the number, the name and the full citation (APA), and "Cited in" links back to the brief.
import { esc } from "./format.js";
import { cite, loadCiteEngine } from "./cite.js";
import { reducedMotion } from "./motion.js";

const PART_NAME = { what: "What", why: "Why", when: "When", how: "How" };

/** A title short enough for the Sources line: without a trailing "(...)", cut at a word near 44 characters. */
function shortTitle(t) {
  const x = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (x.length <= 48) return x;
  const cut = x.slice(0, 44);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:–-]+$/, "")}…`;
}

/**
 * @param {object} o  { brief, S, SRC, REFS }
 * @returns the page's numbering: num(id), info(id), parts(id), order
 */
export function citeNumbering({ brief, S, SRC, REFS }) {
  const order = [];
  if (brief && brief.status !== "failed_check" && brief.status !== "needs_rewrite") {
    for (const p of ["what", "why", "when", "how"]) {
      for (const sen of Array.isArray(brief[p]) ? brief[p] : []) {
        for (const id of sen.source_ids || []) if (!order.includes(id)) order.push(id);
      }
    }
    for (const id of brief.sources || []) if (!order.includes(id)) order.push(id);
  }
  const num = (id) => order.indexOf(id) + 1;
  const info = (id) => {
    const src = SRC[id];
    const ref = REFS[id] || (S.reading || []).find((r) => r.id === id);
    if (src) {
      const release = src.release ? `${src.release.match(/^\d{4}$/) ? `${src.release} release` : src.release}` : "";
      const label = src.label || `${src.short}: ${src.dataset}`;
      return { id, found: true, kind: "dataset", name: label, short: label, dataset: src.dataset,
        aria: label, sub: `Dataset · ${src.organisation}${release ? ` · ${release}` : ""}`, csl: src.csl };
    }
    if (ref) {
      // a reading by one institution (UNHCR, a government) gets a short title, so "UNHCR 2026" can't be mistaken
      // for a whole organisation or for a UNHCR dataset
      const inst = !/&|,| and | et al/i.test(ref.authors || "");
      const short = inst && ref.title ? `${ref.authors} ${ref.year}: ${shortTitle(ref.title)}` : `${ref.authors} ${ref.year}`;
      return { id, found: true, kind: "reading", name: inst && ref.title ? short : `${ref.authors} (${ref.year})`, short,
        aria: short, sub: `Reading · ${ref.type || "source"}`, csl: ref.csl, title: ref.title };
    }
    return { id, found: false, kind: "missing", name: "Source not found", short: "Source not found", aria: "source not found", sub: "", csl: null };
  };
  // which brief parts (and their first sentence) cite each source
  const cited = new Map();
  for (const p of ["what", "why", "when", "how"]) {
    const v = brief?.[p];
    if (!Array.isArray(v)) continue;
    v.forEach((s, i) => (s.source_ids || []).forEach((id) => {
      const list = cited.get(id) || [];
      if (!list.some((x) => x.part === p)) list.push({ part: p, i });
      cited.set(id, list);
    }));
  }
  const parts = (id) => cited.get(id) || [];
  const warned = new Set();
  for (const id of order) {
    if (!info(id).found && !warned.has(id)) {
      warned.add(id);
      console.warn(`Brief cites "${id}" as [${num(id)}], but no dataset or reading with that id is on this page.`);
    }
  }
  return { order, num, info, parts, S };
}

/** A marker for one source (in a brief sentence or the Sources line): a link to its numbered row. */
export function markerHTML(N, id, { withName = false } = {}) {
  const n = N.num(id);
  if (!n) return "";
  const it = N.info(id);
  return `<a class="cite${withName ? " cite--named" : ""}${it.found ? "" : " cite--missing"}" href="#src-${n}" data-cite="${n}"
    aria-label="Source ${n}: ${esc(it.aria)}">[${n}]${withName ? ` <span class="cite__name">${esc(it.found ? it.short : "Source not found")}</span>` : ""}</a>`;
}

/** "Cited in: What, When" under a numbered row: links back to the first sentence in each part that cites it. */
export function citedInHTML(N, id) {
  const ps = N.parts(id);
  if (!ps.length) return "";
  return `<div class="cited-in small muted">Cited in: ${ps.map(({ part, i }) =>
    `<button type="button" class="linklike" data-cited-in="${part}-${i}">${PART_NAME[part]}</button>`).join(", ")}</div>`;
}

/** The numbered list "Sources cited in the brief": one row per number, id="src-n", with the full citation. */
export function citedListHTML(N) {
  if (!N.order.length) return "";
  return `<h3 class="sub-h" style="margin-top:0" id="sources-cited">Sources cited in the brief</h3>
    <ol class="cited">${N.order.map((id, k) => {
      const it = N.info(id);
      return `<li class="cited__item" id="src-${k + 1}" tabindex="-1" data-src-id="${esc(id)}">
        <span class="cite-num">[${k + 1}]</span>
        <div class="cited__body"><div class="cited__name">${esc(it.found ? it.name : "Source not found")}</div>
          <div class="cited__ref">${it.found ? `<span class="muted">${esc(it.sub)}</span>` : `<span class="muted">The brief cites "${esc(id)}", which this page doesn't list.</span>`}</div>
          ${citedInHTML(N, id)}</div></li>`;
    }).join("")}</ol>`;
}

/** Fill each numbered row with its full APA citation (citation-js; the built-in formatter if the CDN fails). */
export async function fillCitations(root, N) {
  const rows = [...root.querySelectorAll(".cited__item[data-src-id]")];
  if (!rows.length) return;
  try { await loadCiteEngine(); } catch { /* cite() falls back to the built-in formatter */ }
  for (const row of rows) {
    const it = N.info(row.dataset.srcId);
    if (!it.found || !it.csl) continue;
    try {
      const c = await cite(it.csl, "apa");
      if (c.html || c.text) row.querySelector(".cited__ref").innerHTML = c.html || esc(c.text);
    } catch { /* keep the short description */ }
  }
}

/** Wire markers (jump to the numbered row), the hover preview and "Cited in" under root. */
export function wireCitations(root, N) {
  let tip = null;
  let tipTimer = 0;
  const hideTip = () => { clearTimeout(tipTimer); if (tip) tip.hidden = true; };
  const showTip = (b) => {
    const id = N.order[Number(b.dataset.cite) - 1];
    if (!id) return;
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "cite-tip";
      tip.setAttribute("role", "tooltip");
      tip.id = "cite-tip";
      document.body.append(tip);
    }
    tip.textContent = `[${b.dataset.cite}] ${N.info(id).name}`;
    tip.hidden = false;
    const r = b.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8) + scrollX}px`;
    tip.style.top = `${(r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8) + scrollY}px`;
  };

  root.querySelectorAll("a.cite[data-cite]").forEach((b) => {
    b.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(b), 300);
    });
    b.addEventListener("pointerleave", hideTip);
    b.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      const row = document.getElementById(`src-${b.dataset.cite}`);
      if (!row) return;
      e.preventDefault();
      hideTip();
      history.replaceState(null, "", `#src-${b.dataset.cite}`);
      jumpTo(row, { block: "start" });
    });
  });
  addEventListener("scroll", hideTip, { passive: true });

  root.querySelectorAll("[data-cited-in]").forEach((b) => b.addEventListener("click", () => {
    const [part, i] = b.dataset.citedIn.split("-");
    const s = document.getElementById(`brief-${part}-${i}`);
    if (!s) return;
    // sentences after the first in each part sit behind "Read more": open it first
    if (s.closest(".brief__rest[hidden]")) document.querySelector(".brief__toggle[aria-expanded='false']")?.click();
    jumpTo(s);
  }));

  // arriving with #src-n in the address (a shared link, or back after a jump)
  const m = /^#src-(\d+)$/.exec(location.hash);
  if (m && document.getElementById(`src-${m[1]}`)) requestAnimationFrame(() => jumpTo(document.getElementById(`src-${m[1]}`), { block: "start" }));
}

/** Scroll an element into view (showing its step at once if it is still waiting to fade in) and highlight it
 *  for about 2 s. Numbered rows land at the top, with a gap under the top bar (their scroll-margin-top). */
export function jumpTo(el, { block = "center" } = {}) {
  const step = el.closest(".step");
  if (step?.classList.contains("is-hidden")) {
    step.style.transition = "none";
    step.classList.remove("is-hidden");
    void step.offsetHeight;
    step.style.transition = "";
  }
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block });
  // content above can still grow while the page scrolls (charts drawing in, citations filling in): once the scroll
  // ends, put the item back where it should land if it has drifted
  if (block === "start") {
    const want = () => parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      removeEventListener("scrollend", settle);
      if (Math.abs(el.getBoundingClientRect().top - want()) > 4) el.scrollIntoView({ behavior: "auto", block });
    };
    addEventListener("scrollend", settle, { once: true });
    setTimeout(settle, 1200);
  }
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  // restart the highlight (a second jump to the same item must not be cut short by the first one's timer)
  clearTimeout(el._citeFlash);
  el.classList.remove("cite-flash");
  void el.offsetWidth;
  el.classList.add("cite-flash");
  el._citeFlash = setTimeout(() => el.classList.remove("cite-flash"), 2000);
}
