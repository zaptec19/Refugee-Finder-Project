// Home: one question, one search box, a few try-chips and a quiet globe. Nothing else.
import { initPage } from "./layout.js";
import { getJSON } from "./data.js";
import { createGlobe, THRESHOLDS } from "./globe.js";
import { fmt } from "./format.js";
import { icon } from "./icons.js";
import { attachSearch } from "./search-ui.js";
import { warmUp } from "./search.js";
import { showCountryCard, hideCountryCard } from "./globe-card.js";
import { reducedMotion } from "./motion.js";

initPage({ page: "home", dark: true });
document.body.classList.add("page-home");

const TRY = [
  ["Rohingya in Bangladesh", "Rohingya in Bangladesh"],
  ["Sudan war, 2023", "Sudan war 2023"],
  ["Sri Lankans in India", "Sri Lankans in India"],
];

const main = document.getElementById("main");
main.innerHTML = `
  <div class="home">
    <h1 class="home__q" id="q-label">What are you researching?</h1>
    <form class="home__search" role="search" action="index.html" method="get" onsubmit="return false">
      <div class="ask">${icon("search")}
        <input id="q" name="q" type="search" placeholder="Search a country, a group, or ask a question" autocomplete="off" aria-labelledby="q-label">
      </div>
    </form>
    <div class="home__try"><span class="muted small">Try:</span>
      ${TRY.map(([t, q]) => `<button class="chip" type="button" data-q="${q}">${t}</button>`).join("")}
    </div>
    <figure class="home__globe" style="margin-bottom:0">
      <svg id="globe" role="img" aria-label="Globe: countries shaded by the number of people displaced from them. Drag or use the arrow keys to turn it; point at a country to see its main figures, click it to open it."></svg>
    </figure>
    <div class="home__foot">
      <span><button class="linklike" type="button" data-start-tour>New here? Take the 2-minute tour &rsaquo;</button> <span class="muted" aria-hidden="true">·</span> <a href="learn.html">Learn</a></span>
      <span class="home__caption" id="globe-cap">People displaced, by country</span>
      <div class="range">
        <button type="button" class="btn btn--sm tabular" id="range-btn" aria-expanded="false" aria-controls="range-pop">1951 – 2025</button>
        <div class="range__pop card" id="range-pop" hidden>
          <label for="year" class="small">Year shown on the globe: <strong id="year-out" class="tabular"></strong></label>
          <input type="range" id="year" step="1">
          <p class="small muted" style="margin:6px 0 0">Darker = fewer. Shades start at <span id="thr"></span> people.</p>
        </div>
      </div>
    </div>
  </div>`;

intro();
warmUp();                       // load the search data and model in the background
const input = document.getElementById("q");
const searchUI = await attachSearch(input);
document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
  input.value = b.dataset.q;
  input.focus();
  searchUI.run();
}));
const preset = new URLSearchParams(location.search).get("q");
if (preset) { input.value = preset; searchUI.run(); }

(async () => {
  const globe = await getJSON("data/web/globe.json");
  const years = Object.keys(globe).filter((k) => /^\d{4}$/.test(k)).map(Number).sort((a, b) => a - b);
  const last = years[years.length - 1];
  const btn = document.getElementById("range-btn");
  const pop = document.getElementById("range-pop");
  const slider = document.getElementById("year");
  const out = document.getElementById("year-out");
  btn.textContent = `${years[0]} – ${last}`;
  slider.min = years[0];
  slider.max = last;
  slider.value = last;
  out.textContent = last;
  const thr = () => { document.getElementById("thr").textContent = THRESHOLDS.map((t) => fmt(t)).join(", "); };
  thr();
  document.addEventListener("numfmt-change", thr);
  const cap = document.getElementById("globe-cap");
  const setCap = (y) => { cap.textContent = `People displaced, by country, ${y} · click a country to open it`; };
  setCap(last);
  let year = last;
  const g = await createGlobe(document.getElementById("globe"), {
    values: globe[String(last)],
    onPick: (iso) => { location.href = `country.html?iso=${iso}`; },
    onHover: (f) => showCountryCard(f, year),
    onHoverEnd: hideCountryCard,
  });
  btn.addEventListener("click", () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute("aria-expanded", String(!pop.hidden));
    if (!pop.hidden) slider.focus();
  });
  slider.addEventListener("input", () => {
    const y = slider.value;
    year = +y;
    out.textContent = y;
    g.setValues(globe[y] || {});
    setCap(y);
    btn.textContent = `${y} · ${years[0]} – ${last}`;
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
})().catch((e) => {
  console.error(e);
  document.getElementById("globe-cap").textContent = "The globe could not load. Search still works.";
});

/** The first visit in a session: the page fades up from black, the globe blooms in (its glow with it), then the
 *  question, the search box and the try-chips rise in, 60 ms apart. About 1.2 s; skipped on repeat visits in
 *  the same session, with reduced motion, and when coming back with the back button. */
function intro() {
  let seen = true;
  try { seen = !!sessionStorage.getItem("wv1:intro-seen"); sessionStorage.setItem("wv1:intro-seen", "1"); } catch { /* storage blocked */ }
  const back = performance.getEntriesByType?.("navigation")?.[0]?.type === "back_forward";
  if (seen || back || reducedMotion()) return;
  const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const veil = document.createElement("div");
  veil.className = "intro-veil";
  veil.setAttribute("aria-hidden", "true");
  document.body.append(veil);
  veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: "ease-out", fill: "forwards" }).finished.then(() => veil.remove(), () => veil.remove());
  document.querySelector(".home__globe")?.animate(
    [{ opacity: 0, transform: "scale(0.96)", filter: "brightness(0.6)" }, { opacity: 1, transform: "none", filter: "none" }],
    { duration: 950, delay: 150, easing: ease, fill: "backwards" });
  [".home__q", ".home__search", ".home__try", ".home__foot"].forEach((sel, i) => {
    document.querySelector(sel)?.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 520, delay: 420 + i * 60, easing: ease, fill: "backwards" });
  });
}
