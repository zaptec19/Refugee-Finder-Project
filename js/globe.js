// The quiet home globe: countries shaded by people displaced from them (UNHCR) in one year.
// Drag to rotate; click a country to open it. No data is shown as plain land, never as the lightest shade.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import { worldFeatures } from "./geo.js";

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
  svg.innerHTML = `
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="var(--g-ocean)"/>
    <path class="gl-grat" fill="none" stroke="var(--g-graticule)"/>
    <g class="gl-countries">${features.map((f, i) => `<path class="gl-c" data-i="${i}" data-iso="${f.properties.iso3 || ""}"></path>`).join("")}</g>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="none" stroke="var(--line-strong)"/>`;
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
      els[i].setAttribute("fill", c >= 0 ? RAMP[c] : "var(--g-land)");
    });
  }
  draw();
  colour(values);

  // drag to rotate (pointer events: mouse, touch, pen)
  let start = null;
  let moved = false;
  svg.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, r: proj.rotate() };
    moved = false;
    try { svg.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
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
    if (iso && current[iso] !== undefined && onPick) onPick(iso);
  });
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
  return { setValues: colour, redraw: draw };
}
