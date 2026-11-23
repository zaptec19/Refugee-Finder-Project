// The interactive tour: one small card at a time, pointing at the part of the screen it describes.
// Next / Back / Skip, or the arrow keys and Esc. Eight cards, one area of the screen each. It starts on the home page and carries on in a real
// example (Sri Lankan refugees in India). Progress lives in localStorage ("wv1:tour") so a reload or the
// jump to the example page picks up where it left off; it is cleared when the tour ends.
import { store } from "./store.js";
import { esc } from "./format.js";
import { icon } from "./icons.js";

const EXAMPLE = "situation.html?id=lka-ind";

/** Each step: the page it runs on, what to point at (a CSS selector, or a list tried in order; none for a centred
 *  card), and at most two short sentences. Every card covers one area of the screen. */
export const STEPS = [
  { page: "home", target: "#q", title: "Ask anything",
    text: "Type a country, a group of people or a question, like “Tamils who fled to India”. Not sure where to start? Try one of the examples below the search bar." },
  { page: "home", target: "#globe", title: "The globe",
    text: "Countries are shaded by how many people were displaced from them. Drag to turn it, and click a country to preview it; click again to open it." },
  { page: "*", target: ".topbar__fmt", title: "Make it yours",
    text: "Switch between Indian (1,00,000) and international (100,000) numbers; everything follows it, even exports. Guide mode, next to it, gives a short tip on each part of a page.",
    go: EXAMPLE, note: "Next: a real example" },
  { page: "situation", target: "#brief", title: "Start with the brief",
    text: "What happened, why people moved, when and how, in plain words. The label under it says who wrote it and whether the team has checked it." },
  { page: "situation", target: "#key-numbers .kn", title: "Key numbers",
    text: "Press ? to see what a number counts and how reliable it is. Click the number itself to trace it back to the original dataset row." },
  { page: "situation", target: "#over-time", title: "Over time",
    text: "How the figure changed, with conflict years and key events underneath. They show timing, not proof of cause." },
  { page: "situation", target: ["#compare", "#limitations"], title: "Before you quote a number",
    text: "Compare sources shows where datasets disagree and why. Limitations, further down, lists what the data can't tell you." },
  { page: "situation", target: "#key-numbers .pin-btn", title: "Pin and export", last: true,
    text: "Pin numbers, charts and readings; their citations come with them. Open My collection (top right) to export a Word table, Excel or CSV with references." },
];
// saved progress from an older tour (17 steps) is not resumed: it starts again at step 1
const TOUR_VERSION = 2;

let ui = null;          // { ring, card, live }
let index = -1;
let current = null;     // target element
let raf = 0;

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pageOf = () => document.body.dataset.page || "";

/** Start the tour from the first step (on the home page; from anywhere else it opens the home page first). */
export function startTour() {
  store.set("tour", { i: 0, v: TOUR_VERSION });
  if (pageOf() !== "home") { location.href = "index.html"; return; }
  show(0);
}

/** Called on every page load: carry on if a tour is in progress, or start one with ?tour=1. */
export function resumeTour() {
  const params = new URLSearchParams(location.search);
  if (params.get("tour") === "1" && pageOf() === "home") { startTour(); return; }
  const st = store.get("tour", null);
  if (!st || typeof st.i !== "number") return;
  if (st.v !== TOUR_VERSION || st.i > STEPS.length - 1) {          // progress from the old 17-step tour
    store.set("tour", { i: 0, v: TOUR_VERSION });
    if (pageOf() === "home") show(0);
    return;
  }
  const i = firstStepFor(st.i);
  if (i < 0) { end(); return; }
  show(i);
}

// the saved step must belong to this page; otherwise the reader has wandered off and the tour stops
const firstStepFor = (i) => (STEPS[i] && onThisPage(STEPS[i]) ? i : -1);

function build() {
  if (ui) return;
  const ring = document.createElement("div");
  ring.className = "tour-ring";
  ring.setAttribute("aria-hidden", "true");
  const card = document.createElement("div");
  card.className = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  card.setAttribute("aria-labelledby", "tour-title");
  card.setAttribute("aria-describedby", "tour-text");
  document.body.append(ring, card);
  card.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour]");
    if (!b) return;
    if (b.dataset.tour === "next") next();
    else if (b.dataset.tour === "back") back();
    else end();
  });
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", queue);
  window.addEventListener("scroll", queue, { passive: true });
  // follow layout changes that happen without scrolling (charts drawing, sections opening)
  const ro = new ResizeObserver(queue);
  ro.observe(document.body);
  ui = { ring, card, ro };
}

function onKey(e) {
  if (index < 0) return;
  if (e.key === "Escape") { e.preventDefault(); end(); }
  else if (e.key === "ArrowRight" && !isTyping(e)) { e.preventDefault(); next(); }
  else if (e.key === "ArrowLeft" && !isTyping(e)) { e.preventDefault(); back(); }
}
const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "");

async function show(i) {
  build();
  index = i;
  store.set("tour", { i, v: TOUR_VERSION });
  const s = STEPS[i];
  current = s.target ? await waitFor(s.target) : null;
  if (index !== i) return;                       // the reader moved on while we waited
  if (s.target && !current) { advance(i, +1); return; }   // this page doesn't have it: skip the step
  if (current) settle(current, i);
  const n = STEPS.length;
  ui.card.innerHTML = `
    <div class="tour-card__top">
      <span class="tour-card__count">${i + 1} of ${n}</span>
      <button class="tour-card__close" type="button" data-tour="skip" aria-label="Skip the tour">${icon("close", { size: 16 })}</button>
    </div>
    <h2 class="tour-card__title" id="tour-title">${esc(s.title)}</h2>
    <p class="tour-card__text" id="tour-text">${esc(s.text)}</p>
    ${s.note && s.go && pageOf() !== "situation" ? `<p class="tour-card__note">${esc(s.note)}</p>` : ""}
    <div class="tour-card__progress" aria-hidden="true">${STEPS.map((_, k) => `<span class="${k === i ? "on" : k < i ? "done" : ""}"></span>`).join("")}</div>
    <div class="tour-card__actions">
      <button class="linklike tour-card__skip" type="button" data-tour="skip">Skip tour</button>
      <span class="tour-card__nav">${i > 0 ? '<button class="btn btn--ghost" type="button" data-tour="back">Back</button>' : ""}
      <button class="btn btn--primary" type="button" data-tour="next">${s.last ? "Done" : "Next"}</button></span>
    </div>`;
  ui.card.classList.toggle("tour-card--center", !current);
  ui.ring.classList.toggle("tour-ring--full", !current);
  if (!current) ui.ring.style.left = ui.ring.style.top = ui.ring.style.width = ui.ring.style.height = "";
  document.body.classList.add("touring");
  place();
  // follow the target while it scrolls into view
  if (current && !reduced()) setTimeout(place, 350);
  ui.card.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

/** Bring the target into view: centred when it fits, otherwise just below the sticky top bar.
 *  On phones it always goes near the top, because the card is docked at the bottom of the screen. */
function scrollToTarget(el, instant = false) {
  const r = el.getBoundingClientRect();
  const bar = document.querySelector(".topbar")?.offsetHeight || 0;
  const vh = window.innerHeight;
  const phone = document.documentElement.clientWidth < 600;
  const top = phone || r.height > (vh - bar) * 0.6
    ? r.top + window.scrollY - bar - 16
    : r.top + window.scrollY - (vh - r.height) / 2;
  window.scrollTo({ top: Math.max(0, top), behavior: instant || reduced() ? "instant" : "smooth" });
}

/** Scroll to the target, then check again as charts above it finish drawing (they can push it down). */
function settle(el, i) {
  scrollToTarget(el);
  [450, 1000, 1700, 2600].forEach((ms) => setTimeout(() => {
    if (index !== i || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    const bar = document.querySelector(".topbar")?.offsetHeight || 0;
    const vh = window.innerHeight;
    const visible = r.top >= bar - 4 && r.top < vh - 80;
    if (!visible) scrollToTarget(el, true);
    place();
  }, ms));
}

function waitFor(sel, ms = 8000) {
  const t0 = performance.now();
  const sels = Array.isArray(sel) ? sel : [sel];
  return new Promise((resolve) => {
    (function poll() {
      // a list of targets: the first one this page has (e.g. Compare sources, else Limitations)
      const el = sels.map((x) => document.querySelector(x)).find((x) => x && x.getBoundingClientRect().width > 0) || document.querySelector(sels[0]);
      if (el && el.getBoundingClientRect().width > 0) return resolve(el);
      // phones: Guide and My collection are inside the top-bar menu, so point at the menu button
      const menuBtn = el?.closest("#topbar-menu") && document.querySelector(".topbar__menu-btn");
      if (menuBtn && menuBtn.getBoundingClientRect().width > 0) return resolve(menuBtn);
      if (performance.now() - t0 > ms) return resolve(null);
      setTimeout(poll, 120);
    })();
  });
}

function queue() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(place);
}

function place() {
  if (!ui || index < 0) return;
  const card = ui.card;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const phone = vw < 600;
  card.classList.toggle("tour-card--docked", phone && !!current);
  if (!current) {
    card.style.left = card.style.top = "";
    return;
  }
  const r = current.getBoundingClientRect();
  const pad = 6;
  Object.assign(ui.ring.style, {
    left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
  });
  if (phone) { card.style.left = card.style.top = ""; return; }   // docked at the bottom of the screen
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const gap = 14;
  let top = r.bottom + gap;
  if (top + h > vh - 16) top = r.top - h - gap;                     // no room below: go above
  if (top < 16) top = Math.min(vh - h - 16, Math.max(16, r.top + 16)); // tall target: overlap its top edge
  const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), vw - w - 16);
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}

const onThisPage = (st) => st.page === "*" || st.page === pageOf();
const urlFor = (st) => (st.page === "situation" ? EXAMPLE : "index.html");

/** Go one step forward or back; a step on another page opens that page and the tour resumes there. */
function advance(from, dir) {
  const i = from + dir;
  if (i < 0) return;
  if (i >= STEPS.length) { end(); return; }
  if (onThisPage(STEPS[i])) { show(i); return; }
  store.set("tour", { i, v: TOUR_VERSION });
  location.href = STEPS[from].go && dir > 0 ? STEPS[from].go : urlFor(STEPS[i]);
}

function next() {
  if (STEPS[index].last) { end(); return; }
  advance(index, +1);
}

function back() {
  if (index > 0) advance(index, -1);
}

function end() {
  store.remove("tour");
  index = -1;
  current = null;
  document.body.classList.remove("touring");
  if (ui) {
    ui.ring.remove();
    ui.card.remove();
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", queue);
    window.removeEventListener("scroll", queue);
    ui.ro.disconnect();
    ui = null;
  }
}
