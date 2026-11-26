// The tours: one small card at a time, pointing at the part of the screen it describes. Next / Back / Skip, or the
// arrow keys and Esc; progress dots; the card never covers its target. One "How to use" button in the top bar starts
// the tour for the page you are on:
//   - home: the home tour (also what the first-visit welcome card starts). It carries on in a real example (Sri Lankan
//     refugees in India) and ends back home;
//   - a situation page (any kind, built or built in the browser): the page tour, this page only, top to bottom;
//   - a country page and My collection: a short page tour.
// A page tour never leaves the page: it starts at the top, and on Done, Skip or Esc the reader is put back where they
// were. Cards for parts the page doesn't have are skipped. Progress lives in localStorage ("wv1:tour").
import { store } from "./store.js";
import { esc } from "./format.js";
import { icon } from "./icons.js";

const EXAMPLE = "situation.html?id=lka-ind";

/** Each step: the page it runs on (home tour), what to point at (a CSS selector, or a list tried in order; none
 *  for a centred card), and at most two short sentences. */
export const TOURS = {
  home: [
    { page: "home", target: "#q", avoid: [".home__search", ".home__try"], side: true, title: "Ask anything",
      text: "Ask about a country, a group, or two countries, like “Tamils who fled to India”. Not sure where to start? Try one of the examples under the search bar." },
    { page: "home", target: [".home__foot", "#globe"], title: "The globe and its colours",
      text: "Countries are shaded by how many people were displaced from them; the key under the globe and the year button explain the colours. Click a country to preview it, and click again to open it." },
    { page: "home", target: ".topbar__inner", title: "The top bar",
      text: "Switch between Indian (1,00,000) and international (100,000) numbers; everything follows it, even exports. My collection keeps what you pin, and Back takes you one step back." },
    { page: "home", title: "A real example",
      text: "Next, the tour opens Sri Lankan refugees in India to show how a situation page works. You can come back home at any time.",
      go: EXAMPLE, note: "Next: a real example" },
    { page: "situation", target: "#brief", title: "The brief",
      text: "What happened, why people moved, when and how, in plain words. Each [1] jumps to its source in the numbered list at the bottom." },
    { page: "situation", target: "#key-numbers .kn", title: "Key numbers",
      text: "Press ? to see what a number counts and how reliable it is. Click the number to see where it comes from, in a panel beside the page." },
    { page: "situation", target: "#over-time", title: "Charts",
      text: "Events and conflict years sit on the line's own years: they show timing, not proof of cause. Data shows the figures as a table, and PNG or CSV downloads them." },
    { page: "situation", target: ["#compare", "#limitations"], title: "Before you quote",
      text: "Compare sources shows where datasets disagree and why. Limitations, with its symbol key, lists what the data can't tell you." },
    { page: "situation", target: ".topbar__coll", title: "Pin and export", last: true,
      text: "Pin numbers, charts and readings; their citations come with them. Open My collection to export a Word table, Excel or CSV with references." },
  ],
  situation: [
    { target: "#sit-title", title: "This page",
      text: "The title says what this page is about, and the search box at the top keeps it in view. Type there to search something else." },
    { target: ".sit__rail", title: "The steps",
      text: "Jump to any part of the page from this list, or just scroll. The part you are reading is marked as you go." },
    { target: "#brief", title: "The brief",
      text: "What, why, when and how, with numbered sources: [1] jumps to the list at the bottom. The label under it says it was written with AI and lists its sources." },
    { target: "#key-numbers .kn", title: "Key numbers",
      text: "Press ? to see what a number counts and how reliable it is. Click the number to see where it comes from, in a panel beside the page." },
    { target: ["#over-time", "#where-people-are"], title: "Over time and where people are",
      text: "Events and conflict bands sit on the line's own years: they show timing, not proof of cause. Data turns a chart into a table, and PNG or CSV downloads it." },
    { target: ["#inside-outside", "#compare"], title: "Inside vs outside, compare sources",
      text: "When two sources count the same people, they are shown side by side, never added together. “Why they differ” explains the gaps." },
    { target: ["#context", "#other-angles"], title: "Context and other angles",
      text: "Conflict deaths and events give timing, not causes. Other angles adds returns, asylum claims and the age and sex breakdown, where the data has them." },
    { target: ["#limitations", "#sources"], title: "Limitations and sources",
      text: "Read the limitations before you quote a number; the symbol key explains each kind. The numbered source list matches the [1] markers in the brief." },
    { target: ".topbar__coll", title: "Pin, collect, go back", last: true,
      text: "Pin numbers, charts and readings to My collection, ready to export with their citations. Back in the top bar takes you one step back." },
  ],
  country: [
    { target: "main h1", title: "This country",
      text: "People who fled from here and people hosted here, on one page. The search box at the top keeps the country's name in view." },
    { target: "main .card-grid", title: "Key figures",
      text: "The latest year-end totals. UNHCR's and IDMC's figures for people displaced inside the country are shown side by side, never added." },
    { target: ["#hosted-chart", "#from-chart"], title: "Over time",
      text: "Each chart shows a group year by year. Data turns it into a table, and PNG or CSV downloads it." },
    { target: ["main .top-groups", "#age-sex-wrap"], title: "Who lives here",
      text: "The largest groups hosted, by country of origin, for the latest year. Refugees and other people in need of protection have separate columns." },
    { target: "#country-sits h2", title: "Situations", last: true,
      text: "Every situation involving this country, each with its own page. Open one to see its brief, charts and sources." },
  ],
  collection: [
    { target: ["main table.coll", "main .empty-state", "main h1"], title: "Your collection",
      text: "Everything you pinned, with its source and year. Add a note to any row; it goes into the export." },
    { target: "#export", title: "Export", last: true,
      text: "Download a Word table, Excel or CSV, with a citation for every row and the definitions used." },
  ],
};
// saved progress from an older tour is not resumed: it starts again at step 1
const TOUR_VERSION = 3;
const pageKind = () => document.body.dataset.page || "";
/** The tour the Tour button starts on this page (null: no tour here). */
export const tourFor = (page = pageKind()) => (page === "home" ? "home" : TOURS[page] ? page : null);
let TOUR = "home";
let STEPS = TOURS.home;
let startY = 0;                    // a page tour puts the reader back here
const useTour = (t) => { TOUR = t; STEPS = TOURS[t] || TOURS.home; };

let ui = null;          // { ring, card, live }
let index = -1;
let current = null;     // target element
let raf = 0;

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const pageOf = () => document.body.dataset.page || "";

/** How to use (and the welcome card): the tour for this page. */
export function startTour(kind = tourFor()) {
  if (!kind) return;
  useTour(kind);
  store.set("tour-offered", true);        // someone who has taken a tour doesn't need the welcome card
  if (kind === "home") {
    store.set("tour", { t: "home", i: 0, v: TOUR_VERSION });
    if (pageOf() !== "home") { location.href = "index.html"; return; }
    show(0);
    return;
  }
  // a page tour: from the top of this page; the reader is put back where they were when it ends
  startY = Math.round(scrollY);
  store.set("tour", { t: kind, i: 0, v: TOUR_VERSION, url: location.pathname + location.search, y: startY });
  window.scrollTo({ top: 0, behavior: "instant" });
  show(0);
}

/** Called on every page load: carry on if a tour is in progress, or start the home tour with ?tour=1. */
export function resumeTour() {
  const params = new URLSearchParams(location.search);
  if (params.get("tour") === "1" && pageOf() === "home") { startTour("home"); return; }
  const st = store.get("tour", null);
  if (!st || typeof st.i !== "number") return;
  if (st.v !== TOUR_VERSION || !TOURS[st.t] || st.i > TOURS[st.t].length - 1) {     // progress from an older tour
    store.remove("tour");
    return;
  }
  useTour(st.t);
  if (st.t !== "home") {               // a page tour belongs to its page; elsewhere it is over
    if (st.url !== location.pathname + location.search) { store.remove("tour"); return; }
    startY = st.y || 0;
    show(st.i);
    return;
  }
  const i = firstStepFor(st.i);
  if (i < 0) { end(); return; }
  show(i);
}

// the saved step must belong to this page; otherwise the reader has wandered off and the tour stops
const firstStepFor = (i) => (STEPS[i] && onThisPage(STEPS[i]) ? i : -1);
const isPageTour = () => TOUR !== "home";

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
    else quit();
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
  if (index < 0) { if (index === -2 && e.key === "Escape") e.preventDefault(); return; }
  if (e.key === "Escape") { e.preventDefault(); quit(); }
  else if (e.key === "ArrowRight" && !isTyping(e)) { e.preventDefault(); next(); }
  else if (e.key === "ArrowLeft" && !isTyping(e)) { e.preventDefault(); back(); }
}
const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "");

async function show(i) {
  build();
  index = i;
  const saved = store.get("tour", {}) || {};
  store.set("tour", { ...saved, t: TOUR, i, v: TOUR_VERSION });
  const s = STEPS[i];
  current = s.target ? await waitFor(s.target) : null;
  if (index !== i) return;                       // the reader moved on while we waited
  if (s.target && !current) { advance(i, +1); return; }   // this page doesn't have it: skip the step
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
  if (current) settle(current, i);
  place();
  // follow the target while it scrolls into view
  if (current && !reduced()) setTimeout(place, 350);
  ui.card.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

// ------------------------------------------------------------------ where the target and the card go
// The card never covers its target (nor anything a step asks to keep clear): it goes below, above or beside
// the target, flipping sides when there is no room. A target taller than the free screen is highlighted only
// in its top part, scrolled just under the top bar, with the card under that part.
const GAP = 14;
const inTopbar = (el) => !!el.closest(".topbar");
/** The top of the free area: below the sticky top bar and, on phones, the sticky step strip of a situation page. */
function areaTop() {
  let top = 0;
  document.querySelectorAll(".topbar, .sit__rail").forEach((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    // where the bar sits once it sticks (before the page scrolls, the step strip is still lower down)
    const stick = parseFloat(cs.top);
    if ((cs.position === "sticky" || cs.position === "fixed") && Number.isFinite(stick) && stick < 160 && r.height < 160 && r.height > 0) {
      top = Math.max(top, stick + r.height);
    }
  });
  return top;
}
const phoneCard = () => document.documentElement.clientWidth < 600;
/** The space the target may use: on phones the card is docked at the bottom of the screen. */
function areaBottom() {
  if (phoneCard() && ui?.card) return window.innerHeight - 16 - ui.card.offsetHeight - GAP;
  return window.innerHeight - 16;
}
const cardH = () => ui?.card?.offsetHeight || 220;

/** Bring the target into view so that it and the card both fit: the pair centred when they fit, otherwise the
 *  target's top just below the top bar. Targets in the top bar never scroll the page. */
function scrollToTarget(el, instant = false) {
  if (inTopbar(el)) return;
  const r = el.getBoundingClientRect();
  const top0 = areaTop() + 12;
  const bottom = areaBottom();
  const need = phoneCard() ? r.height : r.height + GAP + cardH();
  const room = bottom - top0;
  const want = need <= room && !phoneCard() ? top0 + (room - need) / 2 : top0;
  const y = window.scrollY + r.top - want;
  window.scrollTo({ top: Math.max(0, y), behavior: instant || reduced() ? "instant" : "smooth" });
}

/** Scroll to the target, then check again as charts above it finish drawing (they can push it down). */
function settle(el, i) {
  scrollToTarget(el);
  [450, 1000, 1700, 2600].forEach((ms) => setTimeout(() => {
    if (index !== i || !el.isConnected) return;
    if (!inTopbar(el)) {
      const r = el.getBoundingClientRect();
      const visible = r.top >= areaTop() - 4 && r.top < areaBottom() - 60;
      if (!visible) scrollToTarget(el, true);
    }
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
      // phones: How to use and My collection are inside the top-bar menu, so point at the menu button
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

const box = (l, t, w, h) => ({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
const hit = (a, b, m = 4) => a.left < b.right + m && b.left < a.right + m && a.top < b.bottom + m && b.top < a.bottom + m;
const union = (rs) => box(Math.min(...rs.map((r) => r.left)), Math.min(...rs.map((r) => r.top)),
  Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left)), Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top)));

/** The part of the target to highlight: all of it, or its top part when it is taller than the free screen. */
function highlight(el) {
  const r = el.getBoundingClientRect();
  if (inTopbar(el)) return box(r.left, r.top, r.width, r.height);
  if (phoneCard()) {
    // phones: the part of the target that is on screen above the docked card (a target near the end of a short
    // page can't scroll any higher, so the card would otherwise sit on it)
    const t = Math.max(r.top, areaTop());
    const bottom = Math.min(r.bottom, areaBottom());
    return bottom - t >= 40 ? box(r.left, t, r.width, bottom - t) : box(r.left, r.top, r.width, r.height);
  }
  const free = areaBottom() - (areaTop() + 12) - GAP - cardH();
  const h = r.height > free ? Math.max(120, free) : r.height;
  return box(r.left, r.top, r.width, h);
}

function place() {
  if (!ui || index < 0) return;
  const card = ui.card;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const phone = phoneCard();
  card.classList.toggle("tour-card--docked", phone && !!current);
  if (!current) {
    card.style.left = card.style.top = card.style.width = "";
    return;
  }
  const H = highlight(current);
  const pad = 6;
  Object.assign(ui.ring.style, {
    left: `${H.left - pad}px`, top: `${H.top - pad}px`, width: `${H.width + pad * 2}px`, height: `${H.height + pad * 2}px`,
  });
  if (phone) { card.style.left = card.style.top = card.style.width = ""; return; }   // docked at the bottom of the screen
  // what the card must keep clear: the highlighted part and anything the step names
  const s = STEPS[index];
  const keep = [box(H.left - pad, H.top - pad, H.width + pad * 2, H.height + pad * 2),
    ...(s.avoid || []).map((sel) => document.querySelector(sel)).filter(Boolean).map((e) => e.getBoundingClientRect())];
  const U = union(keep);
  const top0 = areaTop() + 8;
  card.style.width = "";
  const w0 = card.offsetWidth;
  const fits = (b) => b.left >= 16 && b.right <= vw - 16 && b.top >= top0 && b.bottom <= vh - 16 && !keep.some((k) => hit(b, k));
  const clampX = (x, w) => Math.min(Math.max(16, x), vw - w - 16);
  const clampY = (y, h) => Math.min(Math.max(top0, y), vh - h - 16);
  const tryAt = (where) => {
    let w = w0;
    if (where === "right" || where === "left") {
      const space = where === "right" ? vw - 16 - (U.right + GAP) : U.left - GAP - 16;
      if (space < 280) return null;
      w = Math.min(w0, space);
    }
    card.style.width = `${w}px`;
    const h = card.offsetHeight;
    const cx = U.left + U.width / 2 - w / 2;
    const b = where === "below" ? box(clampX(cx, w), U.bottom + GAP, w, h)
      : where === "above" ? box(clampX(cx, w), U.top - GAP - h, w, h)
      : where === "right" ? box(U.right + GAP, clampY(U.top, h), w, h)
      : box(U.left - GAP - w, clampY(U.top, h), w, h);
    return fits(b) ? b : null;
  };
  const order = s.side ? ["right", "left", "below", "above"] : ["below", "above", "right", "left"];
  let at = null;
  for (const where of order) { at = tryAt(where); if (at) break; }
  if (!at) {               // nowhere fits (a very small window): below the highlight, as far down as the screen allows
    card.style.width = "";
    const h = card.offsetHeight;
    at = box(clampX(H.left + H.width / 2 - w0 / 2, w0), clampY(U.bottom + GAP, h), w0, h);
  }
  card.style.left = `${Math.round(at.left)}px`;
  card.style.top = `${Math.round(at.top)}px`;
}

const onThisPage = (st) => !st.page || st.page === "*" || st.page === pageOf();
const urlFor = (st) => (st.page === "situation" ? EXAMPLE : "index.html");

/** Go one step forward or back; a step on another page opens that page and the tour resumes there. */
function advance(from, dir) {
  const i = from + dir;
  if (i < 0) return;
  if (i >= STEPS.length) { if (isPageTour()) endHere(); else end(); return; }
  if (onThisPage(STEPS[i])) { show(i); return; }
  store.set("tour", { t: TOUR, i, v: TOUR_VERSION });
  location.href = STEPS[from].go && dir > 0 ? STEPS[from].go : urlFor(STEPS[i]);
}

function next() {
  if (STEPS[index].last) { if (isPageTour()) { endHere(); return; } finish(); return; }
  advance(index, +1);
}

/** A page tour ends where it started: on this page, at the reader's own scroll position. */
function endHere() {
  const y = startY;
  end();
  window.scrollTo({ top: y, behavior: "instant" });
  document.getElementById("tour-btn")?.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ the ending
// The tour brought the reader to the example page, so it takes them back home: after a short closing card when
// they finish, straight away when they skip. On arrival the top bar's How to use button pulses (see home.js).
// Saved progress is cleared first, so the tour never resumes on its own.
export const RETURN_KEY = "wv1:tour-return";
function goHome(kind) {
  try { sessionStorage.setItem(RETURN_KEY, kind); } catch { /* storage blocked: no pulse, still home */ }
  location.href = "index.html";            // the cross-document view transition (skipped with reduced motion)
}

/** Done on the last card: "You're all set" for about 1.5 s, then home. */
function finish() {
  store.remove("tour");
  const away = pageOf() !== "home";
  index = -2;                              // keys and buttons do nothing while the closing card shows
  current = null;
  ui.card.innerHTML = `<div class="tour-card__done" role="status">${icon("check", { size: 28 })}
      <p class="tour-card__title" id="tour-title">You're all set. Pick any situation to start.</p></div>`;
  ui.card.classList.add("tour-card--center", "tour-card--done");
  ui.card.classList.remove("tour-card--docked");
  ui.card.style.left = ui.card.style.top = ui.card.style.width = "";
  ui.ring.classList.add("tour-ring--full");
  ui.ring.style.left = ui.ring.style.top = ui.ring.style.width = ui.ring.style.height = "";
  setTimeout(() => {
    if (away) { goHome("done"); return; }
    end();
  }, 1500);
}

/** Skip tour, X or Esc: on the example page, back home (no closing card); on the home page, just close. */
function quit() {
  store.remove("tour");
  if (isPageTour()) { endHere(); return; }
  if (pageOf() !== "home") { goHome("skip"); return; }
  end();
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
