// The results panel under a search box (walkthrough screen 2):
// a quick answer straight from the data, then results grouped as Situation, Country and Group.
// The ranking engine lives in search.js; this file only draws and handles the keyboard.
import { getJSON } from "./data.js";
import { esc, numHTML, fmt } from "./format.js";
import { icon } from "./icons.js";
import { search, engineState, onEngineChange } from "./search.js";

const GROUP_LABEL = { situation: "Situation", country: "Country", group: "Group" };

export async function attachSearch(input, { panelParent = input.closest("form") || input.parentElement } = {}) {
  const panel = document.createElement("div");
  panel.className = "results";
  panel.id = `${input.id}-results`;
  panel.hidden = true;
  panel.setAttribute("role", "listbox");
  panel.setAttribute("aria-label", "Search results");
  panelParent.append(panel);
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");
  const measures = Object.fromEntries((await getJSON("data/web/measures.json")).map((m) => [m.id, m]));
  let active = -1;
  let last = "";

  async function run() {
    const q = input.value.trim();
    last = q;
    if (!q) { close(); return; }
    const res = await search(q);
    if (input.value.trim() !== q) return;          // a newer query is on its way
    render(q, res);
  }
  function render(q, res) {
    const groups = { situation: [], country: [], group: [] };
    for (const r of res.items) groups[r.group]?.push(r);
    const top = res.quick;
    const m = top && measures[top.latest?.measure_id];
    const quick = top && top.latest ? `
      <a class="results__quick" href="situation.html?id=${esc(top.id)}" role="option" data-opt>
        <span class="eyebrow">Quick answer</span>
        <span class="results__qa"><span>${esc(top.title)}, ${top.latest.year}:</span> <strong class="num">${numHTML(top.latest.value)}</strong></span>
        <span class="small muted">${esc(m?.label || "")}${m?.kind === "stock" ? " at year end" : m?.kind === "flow" ? " during the year" : ""} · Source: ${esc(sourceShort(top.latest.measure_id))}</span>
      </a>` : "";
    const groupHTML = ["situation", "country", "group"].filter((g) => groups[g].length).map((g) => `
      <div class="results__group"><p class="eyebrow">${GROUP_LABEL[g]}</p>
        ${groups[g].slice(0, g === "situation" ? 5 : 3).map((r) => `<a class="results__item" role="option" data-opt href="${esc(r.href)}">
          <span>${esc(r.title)}</span><span class="small muted tabular">${r.years ? `${r.years[0]} to ${r.years[1]}` : ""}</span></a>`).join("")}
      </div>`).join("");
    const note = engineState() === "loading" ? `<p class="results__note small muted">${icon("info", { size: 14 })} Smart search loading; showing name matches for now.</p>` : "";
    const filt = res.years ? `<p class="results__note small muted">Years in your question: ${res.years[0]} to ${res.years[1]}</p>` : "";
    panel.innerHTML = (quick || groupHTML)
      ? `${quick}${groupHTML}${filt}${note}<a class="results__req" href="request.html?q=${encodeURIComponent(q)}">Can't find it? Request data &rsaquo;</a>`
      : `<div class="results__empty"><p><strong>No results for "${esc(q)}"</strong></p><p class="small muted">Try a country, a group of people or a year.</p>
         <a href="request.html?q=${encodeURIComponent(q)}">Request data &rsaquo;</a></div>${note}`;
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
  }
  function close() {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }
  function opts() { return [...panel.querySelectorAll("[data-opt]")]; }
  function setActive(i) {
    const o = opts();
    if (!o.length) return;
    active = (i + o.length) % o.length;
    o.forEach((x, j) => x.classList.toggle("is-active", j === active));
    o[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", "");
  }
  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 120); });
  input.addEventListener("focus", () => { if (input.value.trim()) run(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
    else if (e.key === "Escape") { close(); }
    else if (e.key === "Enter") {
      const o = opts();
      const target = o[active >= 0 ? active : 0];
      if (target) { e.preventDefault(); location.href = target.getAttribute("href"); }
    }
  });
  document.addEventListener("click", (e) => { if (!panelParent.contains(e.target)) close(); });
  onEngineChange(() => { if (last && !panel.hidden) run(); });
  return { run };
}

function sourceShort(measureId) {
  if (measureId?.startsWith("idmc") || measureId?.includes("idmc")) return "IDMC";
  return "UNHCR";
}
