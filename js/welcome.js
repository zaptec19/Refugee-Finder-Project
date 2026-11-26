// First visit to the home page: once the load animation has finished, the top bar's Tour button (the menu button on
// phones) lifts off and grows into a welcome card in the middle of the screen (a bottom sheet on phones), with the page dimmed behind
// it. "Take the tour" starts the tour; "Maybe later" (or X, Esc, the backdrop) flies the card back into the pill,
// which then pulses and says "The tour lives here." so the reader sees where it went.
// Shown once: "wv1:tour-offered" is set the moment it appears. ?welcome=1 shows it again (testing, demos).
// With reduced motion nothing flies: the card fades in and out and the pill gets a plain highlight.
import { store } from "./store.js";
import { reducedMotion } from "./motion.js";
import { icon } from "./icons.js";

const OPEN_MS = 450;
const BACK_MS = 400;
const EASE_OPEN = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const EASE_BACK = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Whether to offer the tour on this load of the home page. */
export function shouldOffer() {
  const q = new URLSearchParams(location.search);
  if (q.get("welcome") === "1") return true;
  if (q.get("tour") === "1") return false;
  if (store.get("tour", null)) return false;            // a tour is already in progress
  return !store.get("tour-offered", false);
}

const phone = () => document.documentElement.clientWidth < 600;
const inView = (r) => r && r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < document.documentElement.clientWidth;

/** The transform that puts the box (laid out at `to`) over the rectangle `from`; transform-origin is 0 0. */
function flip(from, to) {
  const sx = Math.max(0.02, from.width / to.width);
  const sy = Math.max(0.02, from.height / to.height);
  const r = from.height / 2;                                  // the pill's round ends
  return {
    transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`,
    borderRadius: `${(r / sx).toFixed(1)}px / ${(r / sy).toFixed(1)}px`,
  };
}

let dlg = null;
let busy = false;

function build() {
  dlg = document.createElement("dialog");
  dlg.className = "welcome";
  dlg.setAttribute("aria-labelledby", "welcome-title");
  dlg.setAttribute("aria-describedby", "welcome-text");
  dlg.innerHTML = `<div class="welcome__box">
      <button class="icon-btn welcome__close" type="button" data-w="later" aria-label="Close: maybe later">${icon("close", { size: 18 })}</button>
      <div class="welcome__body">
        <h2 class="welcome__title" id="welcome-title">New here?</h2>
        <p class="welcome__text" id="welcome-text">Take a 1-minute tour of how to find a situation, check where a number comes from, and take your data with you.</p>
        <div class="welcome__actions">
          <button class="btn btn--primary" type="button" data-w="go">Take the tour</button>
          <button class="btn" type="button" data-w="later">Maybe later</button>
        </div>
        <p class="welcome__note small muted">You can start it any time from Tour in the ${phone() ? "top bar menu" : "top bar"}.</p>
      </div>
    </div>`;
  document.body.append(dlg);
  return dlg;
}

/** Offer the tour: the pill (the bottom-left link) grows into the welcome card. */
export async function offerTour(pill) {
  if (!pill || busy || dlg?.open) return;
  busy = true;
  store.set("tour-offered", true);                    // never again, whatever they choose
  build();
  const box = dlg.querySelector(".welcome__box");
  const body = dlg.querySelector(".welcome__body");
  const sheet = phone();
  dlg.classList.toggle("welcome--sheet", sheet);
  const later = () => back(pill);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); later(); });            // Esc
  let downOnBackdrop = false;
  dlg.addEventListener("pointerdown", (e) => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-w]");
    if (b?.dataset.w === "go") go(pill);
    else if (b?.dataset.w === "later") later();
    else if (e.target === dlg && downOnBackdrop) later();                             // the dimmed backdrop
    downOnBackdrop = false;
  });

  const from = pill.getBoundingClientRect();
  dlg.showModal();
  dlg.querySelector('[data-w="go"]').focus({ preventScroll: true });
  const anims = [dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 160 : OPEN_MS, easing: "ease-out", pseudoElement: "::backdrop" })];
  if (reducedMotion() || !inView(from)) {
    anims.push(box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 160 : 260, easing: "ease-out" }));
  } else {
    pill.classList.add("is-away");                    // the pill itself lifts off
    const to = box.getBoundingClientRect();
    anims.push(box.animate([{ ...flip(from, to), transformOrigin: "0 0" }, { transform: "none", borderRadius: getComputedStyle(box).borderRadius, transformOrigin: "0 0" }],
      { duration: OPEN_MS, easing: EASE_OPEN }));
    // the words fade in once the card has mostly grown (so they never appear squashed)
    anims.push(body.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
      { duration: 220, delay: OPEN_MS - 180, easing: "ease-out", fill: "backwards" }));
    anims.push(dlg.querySelector(".welcome__close").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: OPEN_MS - 120, fill: "backwards" }));
  }
  await Promise.allSettled(anims.map((a) => a.finished));
  busy = false;
}

/** "Take the tour": the card fades out and the tour starts at step 1. */
async function go(pill) {
  if (busy) return;
  busy = true;
  const box = dlg.querySelector(".welcome__box");
  const ms = reducedMotion() ? 120 : 200;
  await Promise.allSettled([
    box.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.98)" }], { duration: ms, easing: "ease-in", fill: "forwards" }).finished,
    dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, pseudoElement: "::backdrop", fill: "forwards" }).finished,
  ]);
  finish(pill);
  const m = await import("./tour.js");
  m.startTour();
}

/** "Maybe later" (X, Esc, backdrop): the card shrinks and flies back into the pill, which then says where it is. */
async function back(pill) {
  if (busy) return;
  busy = true;
  const box = dlg.querySelector(".welcome__box");
  const body = dlg.querySelector(".welcome__body");
  const anims = [dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 140 : BACK_MS, easing: "ease-in", pseudoElement: "::backdrop", fill: "forwards" })];
  if (reducedMotion()) {
    anims.push(box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" }));
  } else {
    // the pill must be on screen to fly into it (it can sit just below the fold on small phones)
    let to = pill.getBoundingClientRect();
    if (!inView(to) || to.bottom > innerHeight - 8) {
      pill.scrollIntoView({ block: "nearest", behavior: "instant" });
      to = pill.getBoundingClientRect();
    }
    const now = box.getBoundingClientRect();
    anims.push(body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease-in", fill: "forwards" }));
    anims.push(dlg.querySelector(".welcome__close").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" }));
    anims.push(box.animate([{ transform: "none", borderRadius: getComputedStyle(box).borderRadius, transformOrigin: "0 0" },
      { ...flip(to, now), transformOrigin: "0 0" }], { duration: BACK_MS, easing: EASE_BACK, fill: "forwards" }));
  }
  await Promise.allSettled(anims.map((a) => a.finished));
  finish(pill);
  pill.focus({ preventScroll: true });
  pillHere(pill, "The tour lives here.");
}

function finish(pill) {
  if (dlg?.open) dlg.close();
  dlg?.remove();
  dlg = null;
  pill.classList.remove("is-away");
  busy = false;
}

/** The pill says where the tour is: a cyan ring that expands and fades twice (about 1.2 s) and a 3 s tooltip
 *  (`text`). With reduced motion, a plain highlight instead of the ring. Also used on arrival after a tour. */
export function pillHere(pill, text) {
  if (!pill) return;
  const cls = reducedMotion() ? "tour-pill--lit" : "tour-pill--here";
  pill.classList.remove("tour-pill--here", "tour-pill--lit");
  void pill.offsetWidth;
  pill.classList.add(cls);
  setTimeout(() => pill.classList.remove(cls), reducedMotion() ? 2000 : 1300);
  document.querySelector(".tour-pill-tip")?.remove();
  const tip = document.createElement("div");
  tip.className = "tour-pill-tip";
  tip.setAttribute("role", "status");
  tip.textContent = text;
  document.body.append(tip);
  const r = pill.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), document.documentElement.clientWidth - t.width - 8);
  const below = r.top - t.height - 10 < 8;                 // the top bar: no room above, so under the button
  tip.classList.toggle("tour-pill-tip--below", below);
  tip.style.left = `${left + scrollX}px`;
  tip.style.top = `${below ? r.bottom + scrollY + 10 : r.top + scrollY - t.height - 10}px`;
  tip.style.setProperty("--tip-x", `${r.left + r.width / 2 - left}px`);
  setTimeout(() => {
    if (reducedMotion()) { tip.remove(); return; }
    tip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }).finished.then(() => tip.remove(), () => tip.remove());
  }, 3000);
}
