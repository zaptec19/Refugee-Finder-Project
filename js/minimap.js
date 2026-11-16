// Mini globe for a situation: origin (sand) and host (slate) highlighted, a curved arrow
// from origin to host, zoomed with fitExtent so both countries fit with padding.
//  - far pairs: great-circle path
//  - neighbours: a curve bent outward, to the side that is not over land, so it stays visible
import * as d3 from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import { worldFeatures } from "./geo.js";
import { esc } from "./format.js";

const SIZE = 240;
const PAD = 26;

export async function renderMiniGlobe(el, { origin, hosts = [], originName, hostNames = [] }) {
  const { features, byIso } = await worldFeatures(50);
  const fo = byIso.get(origin);
  const fh = hosts.map((h) => byIso.get(h)).filter(Boolean);
  const focus = [fo, ...fh].filter(Boolean);
  if (!focus.length) {
    el.innerHTML = `<p class="small muted">No map shape for this place.</p>`;
    return;
  }
  const centre = d3.geoCentroid({ type: "FeatureCollection", features: focus });
  const proj = d3.geoOrthographic().rotate([-centre[0], -centre[1]]).clipAngle(90).precision(0.3);
  proj.fitExtent([[PAD, PAD], [SIZE - PAD, SIZE - PAD]], { type: "FeatureCollection", features: focus });
  // never zoom out past the whole globe, never zoom in past a small country
  const whole = SIZE / 2 - 4;
  proj.scale(Math.max(Math.min(proj.scale(), whole * 6), whole));
  proj.translate([SIZE / 2, SIZE / 2]);
  const path = d3.geoPath(proj);
  const r = proj.scale();
  const sphere = path({ type: "Sphere" });
  const grat = path(d3.geoGraticule10());

  const landPaths = features.map((f) => {
    const iso = f.properties.iso3;
    const cls = iso === origin ? "o" : hosts.includes(iso) ? "h" : "l";
    const d = path(f);
    return d ? `<path class="mg-${cls}" d="${d}"/>` : "";
  });
  // draw highlighted countries last so their outlines sit on top
  const order = (s) => (s.includes("mg-o") ? 2 : s.includes("mg-h") ? 1 : 0);
  landPaths.sort((a, b) => order(a) - order(b));

  const arrows = fo ? fh.map((f) => arrowPath(proj, path, fo, f, features)).filter(Boolean) : [];
  const caption = hosts.length
    ? `from ${esc(originName)} <span aria-hidden="true">&rsaquo;</span> to ${hostNames.map(esc).join(" and ")}`
    : `${esc(originName)}`;
  const label = hosts.length ? `Map: ${originName} highlighted in sand, ${hostNames.join(" and ")} in dark slate, with an arrow from ${originName} to ${hostNames.join(" and ")}.`
    : `Map: ${originName} highlighted.`;

  el.innerHTML = `
    <svg viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${esc(label)}">
      <defs>
        <clipPath id="mg-clip"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${Math.min(r, SIZE / 2 - 1)}"/></clipPath>
        <marker id="mg-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--ink)"/>
        </marker>
      </defs>
      <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 1}" fill="var(--g-ocean)" stroke="var(--line-strong)"/>
      <g clip-path="url(#mg-clip)">
        <path d="${grat}" fill="none" stroke="var(--g-graticule)"/>
        ${landPaths.join("")}
        ${arrows.map((d) => `<path d="${d}" fill="none" stroke="var(--surface)" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
          <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round" marker-end="url(#mg-head)"/>`).join("")}
      </g>
      ${r < SIZE / 2 ? `<path d="${sphere}" fill="none" stroke="var(--line-strong)"/>` : ""}
    </svg>
    <div class="mini-globe__cap">${caption}</div>
    <div class="mini-globe__legend small muted" aria-hidden="true">
      <span><i class="sw sw-o"></i>${esc(originName)}</span>${hosts.length ? `<span><i class="sw sw-h"></i>${hostNames.map(esc).join(", ")}</span>` : ""}
    </div>`;
}

/** Point inside f nearest to point p (screen space), sampled from its rings. */
function nearestOnFeature(proj, f, p) {
  let best = null;
  let bd = Infinity;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    for (const [lon, lat] of poly[0]) {
      const q = proj([lon, lat]);
      if (!q) continue;
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (d < bd) { bd = d; best = q; }
    }
  }
  return best;
}

function arrowPath(proj, path, fo, fh, features) {
  const co = d3.geoCentroid(fo);
  const ch = d3.geoCentroid(fh);
  const km = d3.geoDistance(co, ch) * 6371;
  if (km > 2500) {
    // far apart: great-circle arc between centroids
    const interp = d3.geoInterpolate(co, ch);
    const pts = Array.from({ length: 33 }, (_, i) => interp(i / 32));
    return path({ type: "LineString", coordinates: pts });
  }
  // neighbours: start at the origin's centre, end just inside the host's nearest edge, bend outward
  const a = proj(co);
  const edge = nearestOnFeature(proj, fh, a) || proj(ch);
  const hc = proj(ch);
  if (!a || !edge || !hc) return null;
  const b = [edge[0] + (hc[0] - edge[0]) * 0.18, edge[1] + (hc[1] - edge[1]) * 0.18];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.max(34, len * 0.6);
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const land = (pt) => {
    const ll = proj.invert(pt);
    return ll && features.some((f) => d3.geoContains(f, ll));
  };
  const c1 = [mid[0] + nx * bend, mid[1] + ny * bend];
  const c2 = [mid[0] - nx * bend, mid[1] - ny * bend];
  const c = land(c1) && !land(c2) ? c2 : c1;
  return `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
}
