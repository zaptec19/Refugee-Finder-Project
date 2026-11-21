// The quiet home globe: countries shaded by people displaced from them (UNHCR) in one year.
// Drag to rotate; click a country to open it. No data is shown as plain land, never as the lightest shade.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import { worldFeatures } from "./geo.js";
import { reducedMotion } from "./motion.js";

// Quiet on purpose: fixed thresholds, so only large displacement stands out.
// colours come from the theme tokens (--g-ramp-0 .. --g-ramp-4), so the globe follows light and dark mode
export const RAMP = [0, 1, 2, 3, 4].map((i) => `var(--g-ramp-${i})`);
export const THRESHOLDS = [10_000, 100_000, 1_000_000, 5_000_000];
const cls = (v) => (v > 0 ? THRESHOLDS.filter((b) => v >= b).length : -1);

/**
 * @param {object} o
 * @param {(iso: string) => void} [o.onPick]   click (mouse, pen) on a country with data
 * @param {(f: {iso: string, name: string, value: number|undefined, x: number, y: number, touch: boolean}) => void} [o.onHover]
 *        pointer over a country (or a tap on a touch screen, which shows the card instead of opening the page)
 * @param {() => void} [o.onHoverEnd]
 */
export async function createGlobe(svg, { values, rotate = [-55, -12], onPick, onHover, onHoverEnd } = {}) {
  const { features } = await worldFeatures(110);
  const size = 560;
  const proj = d3.geoOrthographic().scale(size / 2 - 6).translate([size / 2, size / 2]).rotate(rotate).clipAngle(90);
  const path = d3.geoPath(proj);
  const grat = d3.geoGraticule10();
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  const R = size / 2 - 6;
  svg.innerHTML = `
    <defs>
      <radialGradient id="gl-rim" cx="50%" cy="50%" r="50%">
        <stop offset="0.72" style="stop-color: var(--g-atmo); stop-opacity: 0"/>
        <stop offset="0.93" style="stop-color: var(--g-atmo); stop-opacity: 0.18"/>
        <stop offset="1" style="stop-color: var(--g-atmo); stop-opacity: 0.55"/>
      </radialGradient>
      <pattern id="gl-nodata" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill="var(--g-land)"/><circle cx="2.5" cy="2.5" r="0.8" fill="var(--g-dots)"/>
      </pattern>
    </defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${R}" fill="var(--g-ocean)"/>
    <path class="gl-grat" fill="none" stroke="var(--g-graticule)"/>
    <g class="gl-countries">${features.map((f, i) => `<path class="gl-c" data-i="${i}" data-iso="${f.properties.iso3 || ""}"></path>`).join("")}</g>
    <circle class="gl-rim" cx="${size / 2}" cy="${size / 2}" r="${R}" fill="url(#gl-rim)" pointer-events="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${R}" fill="none" stroke="var(--line-strong)" pointer-events="none"/>`;
  const els = [...svg.querySelectorAll(".gl-c")];
  const gratEl = svg.querySelector(".gl-grat");
  let current = values;

  function draw() {
    gratEl.setAttribute("d", path(grat) || "");
    for (let i = 0; i < features.length; i++) els[i].setAttribute("d", path(features[i]) || "");
  }
  function colour(vals) {
    current = vals;
    features.forEach((f, i) => {
      const iso = f.properties.iso3;
      const v = iso ? vals[iso] : undefined;
      const c = cls(v);
      els[i].setAttribute("fill", c >= 0 ? RAMP[c] : "url(#gl-nodata)");     // no data: dotted land, never a shade
    });
  }
  draw();
  colour(values);

  // slow idle rotation: stops on any interaction, resumes 20 s after the last one (never with reduced motion)
  let idleAt = performance.now();
  let flying = false;
  let last = 0;
  const touch = () => { idleAt = performance.now(); };
  const spin = (t) => {
    requestAnimationFrame(spin);
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    if (flying || reducedMotion() || document.hidden || start || t - idleAt < 20000 && idleAt !== 0) return;
    const r = proj.rotate();
    proj.rotate([r[0] + dt * 0.004, r[1], 0]);        // about 4 degrees a second
    draw();
  };
  idleAt = 0;                                          // spin from the start
  requestAnimationFrame(spin);
  ["pointerdown", "pointerenter", "keydown", "wheel", "focus"].forEach((ev) => svg.addEventListener(ev, touch, { passive: true }));
  svg.addEventListener("pointermove", touch, { passive: true });

  // drag to rotate (pointer events: mouse, touch, pen)
  let start = null;
  let moved = false;
  svg.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, r: proj.rotate(), id: e.pointerId };
    moved = false;
  });
  svg.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
      moved = true;
      // capture only once it is a drag: capturing on press made every click land on the <svg>, not the country
      try { svg.setPointerCapture(start.id); } catch { /* pointer already gone */ }
    }
    const k = 0.35 * (560 / svg.getBoundingClientRect().width);
    proj.rotate([start.r[0] + dx * k, Math.max(-70, Math.min(70, start.r[1] - dy * k)), 0]);
    requestAnimationFrame(draw);
  });
  const end = () => { start = null; };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  // hover: one card for the country under the pointer (mouse and pen); a tap shows it on touch screens
  const info = (el, e) => {
    const i = +el.dataset.i;
    const iso = el.dataset.iso;
    return { iso, name: features[i].properties.name || iso, value: current[iso], x: e.clientX, y: e.clientY, touch: e.pointerType === "touch" };
  };
  let hovered = null;
  svg.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || start && moved) return;
    const el = e.target.closest?.(".gl-c");
    if (!el || !el.dataset.iso) {
      if (hovered) { hovered = null; onHoverEnd?.(); svg.querySelector(".gl-c.is-hover")?.classList.remove("is-hover"); }
      return;
    }
    if (hovered !== el) {
      svg.querySelector(".gl-c.is-hover")?.classList.remove("is-hover");
      el.classList.add("is-hover");
      el.parentNode.append(el);          // draw its outline on top of its neighbours
      hovered = el;
    }
    onHover?.(info(el, e));
  });
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    hovered = null;
    svg.querySelector(".gl-c.is-hover")?.classList.remove("is-hover");
    onHoverEnd?.();
  });
  let lastPointer = "mouse";
  svg.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType; }, { capture: true });
  svg.addEventListener("click", (e) => {
    if (moved) return;
    const el = e.target.closest?.(".gl-c");
    const iso = el?.dataset.iso;
    if (lastPointer === "touch" && onHover) {        // touch: first show the card; the card has the link
      if (iso) onHover({ ...info(el, e), touch: true });
      else onHoverEnd?.();
      return;
    }
    if (iso && current[iso] !== undefined && onPick) flyTo(el, () => onPick(iso));
  });

  /** The camera flies to the country (about 900 ms, ease-in-out); it gets a glowing outline, the rest dims. */
  function flyTo(el, then) {
    touch();
    const f = features[+el.dataset.i];
    const [lon, lat] = d3.geoCentroid(f);
    if (reducedMotion() || !Number.isFinite(lon)) { then(); return; }
    svg.classList.add("gl-picking");
    el.classList.add("is-picked");
    el.parentNode.append(el);
    const [l0, p0] = proj.rotate();
    let l1 = -lon;
    while (l1 - l0 > 180) l1 -= 360;
    while (l1 - l0 < -180) l1 += 360;
    const p1 = Math.max(-70, Math.min(70, -lat));
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    flying = true;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 900);
      const e = ease(t);
      proj.rotate([l0 + (l1 - l0) * e, p0 + (p1 - p0) * e, 0]);
      draw();
      if (t < 1) requestAnimationFrame(step);
      else { flying = false; setTimeout(then, 120); }
    };
    requestAnimationFrame(step);
  }
  // keyboard: arrow keys rotate
  svg.setAttribute("tabindex", "0");
  svg.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
    if (!step) return;
    e.preventDefault();
    const r = proj.rotate();
    proj.rotate([r[0] + step[0], Math.max(-70, Math.min(70, r[1] + step[1])), 0]);
    draw();
  });
  // coming back to the page (back button): undo the picked state
  window.addEventListener("pageshow", () => { svg.classList.remove("gl-picking"); svg.querySelector(".is-picked")?.classList.remove("is-picked"); });
  return { setValues: colour, redraw: draw };
}
