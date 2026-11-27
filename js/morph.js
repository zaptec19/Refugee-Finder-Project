// Home page -> situation page: the chosen result morphs into the page title and the globe shrinks into the
// mini globe. The situation page is drawn by script after its data loads, so a plain cross-document view
// transition has nothing to land on. Instead the home page leaves the title and the globe (position, text, the
// globe's drawing) in sessionStorage; the next page shows them as stand-ins in exactly the same place, and once
// the real page is drawn a same-document view transition morphs the stand-ins into the real title and mini globe.
// Without View Transitions, or with reduced motion, nothing of this runs and pages simply load.
import { reducedMotion } from "./motion.js";

const KEY = "wv1:morph";
const can = () => typeof document !== "undefined" && !!document.startViewTransition && !reducedMotion();

/** Home page, just before leaving for a situation: remember the clicked title and the globe. */
export function leaveMorph(titleEl) {
  if (!can()) return;
  try {
    const data = { t: Date.now() };
    const vis = (r) => r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    if (titleEl) {
      const r = titleEl.getBoundingClientRect();
      const cs = getComputedStyle(titleEl);
      if (vis(r)) data.title = { text: titleEl.textContent.trim().replace(/[,:]\s*\d{4}:?$/, ""), rect: [r.left, r.top, r.width, r.height], size: cs.fontSize, weight: cs.fontWeight };
    }
    const fig = document.querySelector(".home__globe");
    const svg = document.getElementById("globe");
    if (fig && svg) {
      const r = svg.getBoundingClientRect();
      if (vis(r)) data.globe = { rect: [r.left, r.top, r.width, r.height], svg: svg.outerHTML.replace(/\sid="globe"/, ' class="vt-globe-svg"') };
    }
    if (data.title || data.globe) sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* storage full or blocked: no morph */ }
}

/** Situation page, as early as possible: put the stand-ins up. Call land() once the real page is drawn. */
export function arriveMorph() {
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  const none = { land: async () => {} };
  if (!data || Date.now() - data.t > 6000 || !can()) return none;
  // the stand-ins carry the motion, so the cross-document fade is skipped; the morph may only start after the
  // page is revealed (revealing it starts the incoming transition, which would cancel one already running)
  // (situation.html notes the reveal in an inline script, which runs before this module)
  let revealed;
  const onReveal = window.wv1Revealed ? Promise.resolve() : new Promise((r) => { revealed = r; });
  if (revealed) {
    addEventListener("pagereveal", (e) => {
      const vt = e.viewTransition;
      if (vt) { for (const k of ["ready", "finished", "updateCallbackDone"]) vt[k]?.catch?.(() => {}); try { vt.skipTransition(); } catch { /* already over */ } }
      revealed();
    }, { once: true });
    setTimeout(revealed, 800);
  }
  const root = document.documentElement;
  root.classList.add("vt-ghosting");
  const box = document.createElement("div");
  box.className = "vt-ghosts";
  box.setAttribute("aria-hidden", "true");
  const place = (el, [x, y, w, h]) => Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  if (data.globe) {
    const g = document.createElement("div");
    g.className = "vt-ghost vt-ghost--globe";
    place(g, data.globe.rect);
    g.innerHTML = data.globe.svg;
    g.style.viewTransitionName = "globe";
    box.append(g);
  }
  if (data.title) {
    const t = document.createElement("div");
    t.className = "vt-ghost vt-ghost--title";
    place(t, data.title.rect);
    t.style.height = "auto";
    t.style.fontSize = data.title.size;
    t.style.fontWeight = data.title.weight;
    t.textContent = data.title.text;
    t.style.viewTransitionName = "sit-title";
    box.append(t);
  }
  document.body.append(box);
  let landed = false;
  const clear = () => { box.remove(); root.classList.remove("vt-ghosting"); };
  const timer = setTimeout(() => { if (!landed) { landed = true; clear(); } }, 3000);       // never leave them up
  return {
    async land() {
      if (landed) return;
      landed = true;
      clearTimeout(timer);
      await onReveal;
      await new Promise((r) => requestAnimationFrame(r));
      // only while the page is visible and no other transition is starting; any failure just clears the stand-ins
      if (document.visibilityState !== "visible") { clear(); return; }
      try {
        const vt = document.startViewTransition(clear);
        vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
        await vt.finished;
      } catch { clear(); }
    },
  };
}
