// The quiet home globe: countries shaded by people displaced from them (UNHCR) in one year.
// Drag to rotate; click a country to open it. No data is shown as plain land, never as the lightest shade.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import { worldFeatures } from "./geo.js";
import { fmt } from "./format.js";

// Quiet on purpose: fixed thresholds, so only large displacement stands out.
export const RAMP = ["#283341", "#2B3E55", "#30506F", "#3D6A93", "#6B98CC"];
export const THRESHOLDS = [10_000, 100_000, 1_000_000, 5_000_000];
const cls = (v) => (v > 0 ? THRESHOLDS.filter((b) => v >= b).length : -1);

export async function createGlobe(svg, { values, rotate = [-55, -12], onPick } = {}) {
  const { features } = await worldFeatures(110);
  const size = 560;
  const proj = d3.geoOrthographic().scale(size / 2 - 6).translate([size / 2, size / 2]).rotate(rotate).clipAngle(90);
  const path = d3.geoPath(proj);
  const grat = d3.geoGraticule10();
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.innerHTML = `
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="var(--g-ocean)"/>
    <path class="gl-grat" fill="none" stroke="var(--g-graticule)"/>
    <g class="gl-countries">${features.map((f, i) => `<path class="gl-c" data-i="${i}" data-iso="${f.properties.iso3 || ""}"><title></title></path>`).join("")}</g>
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
      els[i].querySelector("title").textContent = `${f.properties.name || iso}: ${v > 0 ? `${fmt(v)} people displaced` : "no data"}`;
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
    svg.setPointerCapture(e.pointerId);
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
  svg.addEventListener("click", (e) => {
    if (moved) return;
    const iso = e.target.closest?.(".gl-c")?.dataset.iso;
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
