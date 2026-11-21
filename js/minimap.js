// The situation map: origin (sand) and host countries (slate) highlighted, an arrow from the origin to
// each host, zoomed so all of them fit inside the circle with padding. One function draws both sizes:
//   size "small": the mini globe on the situation page (240 px)
//   size "large": the pop-out map (640 px), with labels, a figure on each arrow, tooltips, the origin's
//                 other top hosts as an optional layer, zoom and drag-to-rotate.
// The arrows, colours and zoom are the same code at both sizes; the large map only adds layers.
//  - Every arrow runs from a point clearly inside the origin to a point clearly inside the host
//    ("inside point": the pole of inaccessibility of the country's largest polygon on screen, from polylabel).
//  - Neighbours (up to 2,500 km): one gentle quadratic curve. Far pairs: the great-circle arc.
//  - Several hosts: the arrows start a few pixels apart and bend away from each other.
//  - Hosts are kept visibly separate: a light line on the borders they share, a label where it fits,
//    and one legend entry per host.
// An arrow means "people from here are counted there", not the route anyone travelled.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import polylabel from "https://cdn.jsdelivr.net/npm/polylabel@2.0.1/+esm";
import { worldFeatures } from "./geo.js";
import { esc, fmt } from "./format.js";

const SMALL = 240;
const LARGE = 640;
const FAR_KM = 2500;
let seq = 0;

/** Pixel constants for one map size. Shapes scale with the map (k); strokes and the arrowhead grow more gently. */
function dims(size) {
  const S = size === "large" ? LARGE : SMALL;
  const k = S / SMALL;
  return {
    S, k,
    PAD: 26 * k,
    TINY: 12 * k,                 // a host narrower than this (px) gets a ring and the arrow stops short
    HEAD: 8 * Math.sqrt(k),       // arrowhead size; 8 px on the mini globe
    FAN: [5, 4, 6].map((v) => v * k),   // how far apart the starts of several arrows are
    BEND: [8 * k, 30 * k],        // curve bend limits
  };
}

/**
 * @param {HTMLElement} el
 * @param {object} o
 * @param {"small"|"large"} [o.size]
 * @param {(btn: HTMLElement) => void} [o.onExpand]   small map only: wrap it in a button that opens the large map
 * @param {object} [o.figures]  large map only: { measureWord, origin: {value, year, source, text}, hosts: {ISO: {value, year, source}},
 *                              extra: [{iso, name, value, year, source, href}] }
 * @returns {Promise<object|undefined>} what was drawn (proj, origin, hosts, arrows), so tests can check the end points;
 *          the large map also returns controls: { zoom(f), reset(), setExtra(on), redraw() }
 */
export async function renderMiniGlobe(el, opts) {
  const size = opts.size === "large" ? "large" : "small";
  const geo = await worldFeatures(50);
  const D = dims(size);
  const base = setup(geo, opts);
  if (!base.focus.length) {
    el.innerHTML = `<p class="small muted">No map shape for this place.</p>`;
    return undefined;
  }
  if (size === "large") return largeMap(el, geo, D, base, opts);

  const proj = fitProjection(base.focus, D);
  const sc = scene(geo, D, proj, base.fo, opts.origin, base.hostPairs);
  const { originName, hostNames = [], hosts = [] } = opts;
  const caption = hosts.length
    ? `from ${esc(originName)} <span aria-hidden="true">&rsaquo;</span> to ${hostNames.map(esc).join(" and ")}`
    : `${esc(originName)}`;
  const label = hosts.length ? `Map: ${originName} highlighted in sand, ${hostNames.join(" and ")} in dark slate, with an arrow from ${originName} to ${hostNames.join(" and ")}.`
    : `Map: ${originName} highlighted.`;
  const svg = svgMarkup(D, sc, { label });
  const open = opts.onExpand
    ? `<button class="mini-globe__btn" type="button" aria-label="${esc(`Open larger map of ${originName}${hostNames.length ? ` to ${hostNames.join(" and ")}` : ""}`)}">${svg}
        <span class="mini-globe__expand" aria-hidden="true"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>`
    : svg;
  el.innerHTML = `
    ${open}
    <div class="mini-globe__cap">${caption}</div>
    <div class="mini-globe__legend small muted${base.hostPairs.length > 1 ? " mini-globe__legend--stack" : ""}" aria-hidden="true">
      <span><i class="sw sw-o"></i>${esc(originName)}</span>${base.hostPairs.map((h) => `<span><i class="sw sw-h"></i>${esc(h.name)}</span>`).join("")}
    </div>`;
  if (opts.onExpand) {
    const btn = el.querySelector(".mini-globe__btn");
    btn.addEventListener("click", () => opts.onExpand(btn));
  }
  trimArrows(el, D);
  return { proj, origin: base.fo || null, hosts: base.hostPairs, arrows: sc.arrows };
}

// ------------------------------------------------------------------ shared building blocks
function setup({ byIso }, { origin, hosts = [], hostNames = [] }) {
  const fo = byIso.get(origin);
  const hostPairs = hosts.map((h, i) => ({ iso: h, f: byIso.get(h), name: hostNames[i] || h })).filter((h) => h.f);
  return { fo, hostPairs, focus: [fo, ...hostPairs.map((h) => h.f)].filter(Boolean) };
}

/** The parts of a country the zoom fits: tiny far-off islands (under 1% of the main part's area and over
 *  2,500 km from it, e.g. the Caribbean Netherlands) are drawn but don't pull the view away. */
const partsCache = new WeakMap();
function mainParts(f) {
  if (f.geometry.type !== "MultiPolygon") return f;
  if (partsCache.has(f)) return partsCache.get(f);
  const parts = f.geometry.coordinates.map((c) => ({ c, a: d3.geoArea({ type: "Polygon", coordinates: c }), m: d3.geoCentroid({ type: "Polygon", coordinates: c }) }));
  const big = parts.reduce((x, y) => (y.a > x.a ? y : x));
  const keep = parts.filter((p) => p === big || p.a >= big.a * 0.01 || d3.geoDistance(p.m, big.m) * 6371 <= FAR_KM);
  const out = keep.length === parts.length ? f : { ...f, geometry: { type: "MultiPolygon", coordinates: keep.map((p) => p.c) } };
  partsCache.set(f, out);
  return out;
}

/** Rotate to the middle of the countries as drawn and fit them with padding; never zoom out past the whole
 *  globe or in past a small country. The map is a circle, so the fit is to the circle, not the square around
 *  it: a country in a corner of the square would be cut off by the rim.
 *  `around` (default: focus) are the countries kept in the middle; `focus` are the ones that must fit. */
function fitProjection(focusAll, D, aroundAll = focusAll) {
  const { S, PAD } = D;
  const focus = focusAll.map(mainParts);
  const around = aroundAll.map(mainParts);
  const whole = S / 2 - 4;
  const C = [S / 2, S / 2];
  const fcAround = { type: "FeatureCollection", features: around };
  const proj = d3.geoOrthographic().clipAngle(90).precision(0.3).translate(C).scale(whole);
  // start halfway between the countries (an area centroid would lean toward the larger one), then move to the
  // middle of the shapes as drawn, as long as every country stays on the side of the globe facing us
  const mids = around.map((f) => d3.geoCentroid(f));
  const facing = (c) => mids.every((m) => d3.geoDistance(m, c) < (80 * Math.PI) / 180);
  let centre = d3.geoCentroid({ type: "MultiPoint", coordinates: mids });
  if (!Number.isFinite(centre[0]) || !Number.isFinite(centre[1])) centre = d3.geoCentroid(fcAround);
  for (let i = 0; i < 3; i++) {
    proj.rotate([-centre[0], -centre[1]]);
    const b = d3.geoPath(proj).bounds(fcAround);
    const mid = proj.invert([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]);
    if (!mid || !Number.isFinite(mid[0]) || !Number.isFinite(mid[1]) || (!facing(mid) && facing(centre))) break;
    centre = mid;
  }
  proj.rotate([-centre[0], -centre[1]]);
  proj.fitExtent([[PAD, PAD], [S - PAD, S - PAD]], { type: "FeatureCollection", features: focus });
  let scale = proj.scale();
  proj.translate(C);
  // every visible outline point inside the circle, a third of the padding from the rim
  // (an orthographic map grows evenly with its scale, so one measurement gives the scale that fits)
  let far = 0;
  for (const f of focus) {
    for (const poly of polygonsOf(f)) {
      for (const pt of poly[0]) {
        if (d3.geoDistance(pt, centre) > Math.PI / 2) continue;
        const q = proj(pt);
        if (q) far = Math.max(far, Math.hypot(q[0] - C[0], q[1] - C[1]));
      }
    }
  }
  if (far > 0) scale = Math.min(scale, (scale * (S / 2 - PAD / 3)) / far);
  proj.scale(Math.max(Math.min(scale, whole * 6), whole));
  return proj;
}

/** Everything both sizes draw: land, host borders, inside points, arrows and host labels. */
function scene({ features, sharedBorders }, D, proj, fo, origin, hostPairs, { extraPairs = [], fast = false } = {}) {
  const { S } = D;
  const path = d3.geoPath(proj);
  const r = proj.scale();
  const clipR = Math.min(r, S / 2 - 1);
  const hostIsos = new Set(hostPairs.map((h) => h.iso));
  const extraIsos = new Set(extraPairs.map((h) => h.iso));
  const landPaths = [];
  for (const f of features) {
    const iso = f.properties.iso3;
    const cls = iso === origin ? "o" : hostIsos.has(iso) ? "h" : extraIsos.has(iso) ? "hx" : "l";
    const d = path(f);
    if (d) landPaths.push({ cls, iso, d });
  }
  // draw highlighted countries last so their outlines sit on top
  const order = { o: 3, h: 2, hx: 1, l: 0 };
  landPaths.sort((a, b) => order[a.cls] - order[b.cls]);
  // borders between two host countries: a clear light line, so neighbouring hosts read as separate countries
  const borderSet = new Set([...hostIsos, ...extraIsos]);
  const hostBorders = borderSet.size > 1 ? path(sharedBorders(borderSet)) : "";
  const anchorO = fo ? insidePoint(proj, path, fo, D) : null;
  const all = [...hostPairs, ...extraPairs];
  const anchors = new Map(all.map((h) => [h.iso, insidePoint(proj, path, h.f, D)]));
  // no arrow when the origin is on the far side of the globe (e.g. Afghanistan and the USA can't both face us)
  const arrows = anchorO?.pt && anchorO.ok ? planArrows(proj, fo, anchorO, all, anchors, features, clipR, D) : [];
  for (const a of arrows) a.extra = extraIsos.has(a.iso);
  const arrowPts = arrows.flatMap((a) => a.pts);
  const labels = fast ? [] : hostPairs.map((h) => hostLabel(proj, h, anchors.get(h.iso), clipR, arrowPts, D)).filter(Boolean);
  return { proj, path, r, clipR, landPaths, hostBorders, anchorO, anchors, arrows, labels, sphere: path({ type: "Sphere" }), grat: path(d3.geoGraticule10()) };
}

function svgMarkup(D, sc, { label, extraLayers = "", landAttrs = () => "" }) {
  const { S, HEAD } = D;
  const uid = `mg${++seq}`;
  const f1 = (n) => n.toFixed(1);
  return `<svg viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(label)}">
      <defs>
        <radialGradient id="${uid}-rim" cx="50%" cy="50%" r="50%">
          <stop offset="0.74" style="stop-color: var(--g-atmo); stop-opacity: 0"/>
          <stop offset="0.94" style="stop-color: var(--g-atmo); stop-opacity: 0.16"/>
          <stop offset="1" style="stop-color: var(--g-atmo); stop-opacity: 0.5"/>
        </radialGradient>
        <clipPath id="${uid}-clip"><circle cx="${S / 2}" cy="${S / 2}" r="${sc.clipR}"/></clipPath>
        <marker id="${uid}-head" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse"
          markerWidth="${HEAD}" markerHeight="${HEAD}" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--g-arrow)" stroke="var(--g-ocean)" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke"/>
        </marker>
        <marker id="${uid}-headx" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse"
          markerWidth="${HEAD * 0.8}" markerHeight="${HEAD * 0.8}" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" fill="var(--muted)"/>
        </marker>
      </defs>
      <circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 1}" fill="var(--g-ocean)" stroke="var(--line-strong)"/>
      <g clip-path="url(#${uid}-clip)">
        <path d="${sc.grat}" fill="none" stroke="var(--g-graticule)"/>
        ${sc.landPaths.map((p) => `<path class="mg-${p.cls}" d="${p.d}"${landAttrs(p)}/>`).join("")}
        ${sc.hostBorders ? `<path class="mg-hb" d="${sc.hostBorders}"/>` : ""}
        ${S > 300 ? `<circle class="mg-rim" cx="${S / 2}" cy="${S / 2}" r="${sc.clipR}" fill="url(#${uid}-rim)" pointer-events="none"/>` : ""}
        ${sc.arrows.filter((a) => a.ring && !a.extra).map((a) => `<circle class="mg-ring" cx="${f1(a.ring.cx)}" cy="${f1(a.ring.cy)}" r="${f1(a.ring.r)}"/>`).join("")}
        ${sc.labels.map((l) => `<text class="mg-label" x="${f1(l.x)}" y="${f1(l.y)}" text-anchor="middle">${esc(l.text)}</text>`).join("")}
        ${sc.arrows.map((a) => a.extra
          ? `<path class="mg-arrow mg-arrow--x" d="${a.d}" marker-end="url(#${uid}-headx)"/>`
          : `<path class="mg-arrow-halo" d="${a.d}"/><path class="mg-arrow" d="${a.d}" marker-end="url(#${uid}-head)"/><path class="mg-flow" d="${a.d}" aria-hidden="true"/>`).join("")}
        ${extraLayers}
      </g>
      ${sc.r < S / 2 ? `<path d="${sc.sphere}" fill="none" stroke="var(--line-strong)"/>` : ""}
    </svg>`;
}

/** Stop each line just short of its tip, so the head's point is the only thing at the end point. */
function trimArrows(root, D) {
  root.querySelectorAll(".mg-arrow, .mg-arrow-halo").forEach((p) => {
    const len = p.getTotalLength?.() || 0;
    if (len > D.HEAD) p.setAttribute("stroke-dasharray", `${(len - D.HEAD * 0.6).toFixed(1)} ${len.toFixed(1)}`);
  });
}

// ------------------------------------------------------------------ inside points
const polygonsOf = (f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);
const inside = (proj, f, pt) => {
  if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return false;
  const ll = proj.invert(pt);
  return !!ll && d3.geoContains(f, ll);
};

/** A point clearly inside the country on screen: polylabel on its largest projected polygon,
 *  checked with d3.geoContains; falls back to the centroid only when that passes the same check. */
export function insidePoint(proj, path, f, D = dims("small")) {
  let best = null;
  let bestArea = -1;
  for (const poly of polygonsOf(f)) {
    const a = path.area({ type: "Polygon", coordinates: poly });
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  const b = path.bounds(f);
  const size = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]);
  const narrow = Math.min(b[1][0] - b[0][0], b[1][1] - b[0][1]);
  let pt = null;
  let depth = 0;
  if (best && bestArea > 0) {
    const rings = best.map((ring) => ring.map((c) => proj(c)).filter(Boolean));
    const p = polylabel(rings, 0.25 * D.k);
    if (Number.isFinite(p[0])) { pt = [p[0], p[1]]; depth = p.distance || 0; }
  }
  if (!inside(proj, f, pt)) {
    const c = proj(d3.geoCentroid(f));
    if (inside(proj, f, c)) { pt = c; depth = 0; }
  }
  // tiny: too narrow on screen (or too shallow inside) for the arrowhead to sit clearly within it
  return { pt, depth, size, tiny: narrow < D.TINY || (depth > 0 && depth < 3 * D.k), ok: inside(proj, f, pt) };
}

// ------------------------------------------------------------------ arrows
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const qpt = (a, c, b, t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];

function planArrows(proj, fo, ao, hostPairs, anchors, features, clipR, D) {
  const C = [D.S / 2, D.S / 2];
  // only hosts with a confirmed inside point on the visible side of the globe get an arrow
  const usable = hostPairs.filter((h) => anchors.get(h.iso)?.pt && anchors.get(h.iso).ok);
  const dirs = new Map(usable.map((h) => [h.iso, norm(sub(anchors.get(h.iso).pt, ao.pt))]));
  const many = usable.length > 1;
  const inClip = (p) => Math.hypot(p[0] - C[0], p[1] - C[1]) <= clipR - 2;
  const land = (pt) => {
    const ll = proj.invert(pt);
    return !!ll && features.some((f) => d3.geoContains(f, ll));
  };

  return usable.map((h) => {
    const ah = anchors.get(h.iso);
    if (!ao.pt) return null;
    const dir = dirs.get(h.iso);
    // start: inside the origin, nudged a few px toward this host when there are several (they fan out)
    let start = ao.pt;
    if (many) {
      for (const k of D.FAN) {
        const s = add(ao.pt, mul(dir, k));
        if (inside(proj, fo, s)) { start = s; break; }
      }
    }
    // end: the host's inside point (2 px short for tiny hosts, which get a ring instead)
    let end = ah.pt;
    // (never further than the inside point is deep, so the tip stays inside the country)
    if (ah.tiny) end = sub(ah.pt, mul(norm(sub(ah.pt, start)), Math.min(2 * D.k, ah.depth * 0.6)));
    const ring = ah.tiny ? { cx: ah.pt[0], cy: ah.pt[1], r: Math.max(6 * D.k, ah.size / 2 + 4 * D.k) } : null;
    const km = d3.geoDistance(proj.invert(start), proj.invert(end)) * 6371;

    let d;
    let pts = [];
    let side = 1;
    let ctrl = null;
    if (km > FAR_KM) {
      ({ d, pts } = greatCircle(proj, start, end, D));
    } else {
      const v = sub(end, start);
      const len = Math.hypot(v[0], v[1]) || 1;
      const nrm = [-v[1] / len, v[0] / len];
      const mid = mul(add(start, end), 0.5);
      let bend = Math.min(D.BEND[1], Math.max(D.BEND[0], len * 0.22));
      // side: away from the nearest other arrow; with one host, away from land so the curve stays visible
      if (many) {
        const others = usable.filter((x) => x.iso !== h.iso).map((x) => dirs.get(x.iso));
        const near = others.reduce((b, x) => (dot(x, dir) > dot(b, dir) ? x : b));
        side = dot(nrm, near) > 0 ? -1 : 1;
      } else if (land(add(mid, mul(nrm, bend))) && !land(add(mid, mul(nrm, -bend)))) {
        side = -1;
      }
      const fits = (s, b) => {
        const c = add(mid, mul(nrm, s * b));
        for (let t = 0; t <= 1.0001; t += 0.05) if (!inClip(qpt(start, c, end, t))) return false;
        return true;
      };
      if (!fits(side, bend)) {
        if (fits(-side, bend)) side = -side;
        else bend = fits(side, D.BEND[0]) ? D.BEND[0] : 0;
      }
      ctrl = add(mid, mul(nrm, side * bend));
      d = `M${start[0].toFixed(1)},${start[1].toFixed(1)} Q${ctrl[0].toFixed(1)},${ctrl[1].toFixed(1)} ${end[0].toFixed(1)},${end[1].toFixed(1)}`;
      pts = Array.from({ length: 31 }, (_, k) => qpt(start, ctrl, end, k / 30));
    }
    return { iso: h.iso, start, end, ring, d, pts, ctrl, km: Math.round(km) };
  }).filter(Boolean);
}

/** Great-circle arc between two screen points, keeping only the part on the visible side of the globe;
 *  it always finishes at `end`, so the head sits on the host. */
function greatCircle(proj, start, end, D) {
  const a = proj.invert(start);
  const b = proj.invert(end);
  const centre = proj.invert([D.S / 2, D.S / 2]);
  const interp = d3.geoInterpolate(a, b);
  const pts = [];
  for (let i = 1; i < 48; i++) {
    const ll = interp(i / 48);
    pts.push(d3.geoDistance(ll, centre) < Math.PI / 2 - 1e-3 ? proj(ll) : null);
  }
  let d = `M${start[0].toFixed(1)},${start[1].toFixed(1)}`;
  let pen = true;
  for (const p of pts) {
    if (!p) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  }
  return { d: `${d}L${end[0].toFixed(1)},${end[1].toFixed(1)}`, pts: [start, ...pts.filter(Boolean), end] };
}

// ------------------------------------------------------------------ labels
const labelBox = (x, y, w, h) => [x - w / 2, y - h * 0.8, x + w / 2, y + h * 0.25];
const overlaps = (a, b, m = 2) => !(a[2] + m < b[0] || b[2] + m < a[0] || a[3] + m < b[1] || b[3] + m < a[1]);
const clearOf = (box, pts, m) => pts.every(([px, py]) => px < box[0] - m || px > box[2] + m || py < box[1] - m || py > box[3] + m);

/** A small name label near the host's inside point (not over the arrowhead), only if it fits inside the country. */
function hostLabel(proj, h, a, clipR, arrowPts, D, { fontPx = 9, taken = [], allowOutside = false } = {}) {
  if (!a?.pt || (a.tiny && !allowOutside)) return null;
  const w = h.name.length * fontPx * 0.57 + 4;
  const hh = fontPx * 1.1;
  const C = [D.S / 2, D.S / 2];
  // below, above, right of, left of the arrowhead (text baseline y)
  const g = fontPx * 1.55;
  const spots = [[0, g], [0, -g * 0.65], [w / 2 + g * 0.65, fontPx * 0.35], [-(w / 2 + g * 0.65), fontPx * 0.35], [0, g * 1.75], [0, -g * 1.4]];
  for (const [dx, dy] of spots) {
    const x = a.pt[0] + dx;
    const y = a.pt[1] + dy;
    const box = labelBox(x, y, w, hh);
    const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]], [x, y - hh * 0.3]];
    const fits = corners.every((p) => (allowOutside || inside(proj, h.f, p)) && Math.hypot(p[0] - C[0], p[1] - C[1]) < clipR - 2);
    if (fits && clearOf(box, arrowPts, 3) && !taken.some((t) => overlaps(t, box))) return { x, y, text: h.name, box };
  }
  return null;
}

// ------------------------------------------------------------------ large map
const ZOOM_STEP = 1.4;

function largeMap(el, geo, D, base, opts) {
  const { features, byIso } = geo;
  const { origin, originName, figures = {} } = opts;
  const extraAll = (figures.extra || []).map((x) => ({ ...x, f: byIso.get(x.iso) })).filter((x) => x.f);
  const state = { showExtra: false, rot: null, scale: null, fitScale: null, dragging: false };
  const uid = `mgl${++seq}`;
  el.innerHTML = `<div class="mgl" id="${uid}">
      <div class="mgl__svg" tabindex="0" aria-describedby="${uid}-help"></div>
      <div class="mgl__tip" role="tooltip" hidden></div>
      <p class="sr-only" id="${uid}-help">Drag or use the arrow keys to turn the globe; plus and minus keys zoom.</p>
    </div>`;
  const svgBox = el.querySelector(".mgl__svg");
  const tip = el.querySelector(".mgl__tip");

  // extra hosts on the far side of the globe from the situation are not drawn (they are listed instead)
  const pairs = () => (state.showExtra ? extraAll.filter((x) => !state.hidden.includes(x)) : []);
  state.hidden = [];
  /** The situation stays in the middle. With the other hosts on, zoom out only as far as the extra hosts on
   *  this side of the globe; any on the far side are listed (see controls.hiddenExtra), not forced into view. */
  function refit() {
    if (!state.showExtra) {
      const p = fitProjection(base.focus, D);
      state.rot = p.rotate();
      state.scale = state.fitScale = p.scale();
      state.hidden = [];
      return;
    }
    const centre = d3.geoCentroid({ type: "FeatureCollection", features: base.focus });
    const near = extraAll.filter((x) => d3.geoDistance(d3.geoCentroid(x.f), centre) < (80 * Math.PI) / 180);
    state.hidden = extraAll.filter((x) => !near.includes(x));
    const p = fitProjection([...base.focus, ...near.map((x) => x.f)], D, base.focus);
    state.rot = p.rotate();
    state.scale = state.fitScale = p.scale();
  }
  const whole = D.S / 2 - 4;
  const clampScale = (s) => Math.max(whole, Math.min(s, Math.max(state.fitScale * 4, whole * 2)));

  const measureWord = figures.measureWord || "people";
  const fig = (x) => (x && Number.isFinite(x.value) ? `${fmt(x.value)} ${measureWord} (${x.year})` : "no data");

  let last = null;
  function draw({ fast = false } = {}) {
    // text scale: on a narrow screen the 640-unit map is drawn small, so labels grow to stay readable
    const shown = svgBox.getBoundingClientRect().width || D.S;
    const ts = Math.max(1, Math.min(1.7, (D.S / shown) * 0.8));
    svgBox.style.setProperty("--mgl-ts", ts.toFixed(3));
    const proj = d3.geoOrthographic().rotate(state.rot).scale(state.scale).translate([D.S / 2, D.S / 2]).clipAngle(90).precision(0.3);
    const sc = scene(geo, D, proj, base.fo, origin, base.hostPairs, { extraPairs: pairs(), fast: true });
    const taken = [];
    const texts = [];
    const arrowPts = sc.arrows.flatMap((a) => a.pts);
    // 1. figure on each arrow, near its midpoint, on the outside of the bend
    for (const a of sc.arrows) {
      const figObj = a.extra ? extraAll.find((x) => x.iso === a.iso) : figures.hosts?.[a.iso];
      // other hosts carry their name, so stacked figures can be told apart
      const text = a.extra ? `${figObj?.name || a.iso}: ${fig(figObj)}` : fig(figObj);
      const fpx = (a.extra ? 11 : 12.5) * ts;
      const w = text.length * fpx * 0.55 + 8;
      const mid = a.pts[Math.floor(a.pts.length / 2)];
      const tan = norm(sub(a.pts[Math.min(a.pts.length - 1, Math.floor(a.pts.length / 2) + 1)], a.pts[Math.max(0, Math.floor(a.pts.length / 2) - 1)]));
      let nrm = [-tan[1], tan[0]];
      if (a.ctrl && dot(nrm, sub(a.ctrl, mid)) < 0) nrm = mul(nrm, -1);
      const along = (t) => a.pts[Math.max(0, Math.min(a.pts.length - 1, Math.round(t * (a.pts.length - 1))))];
      const spots = [];
      for (const t of [0.5, 0.38, 0.62]) for (const off of [14, 26, -14, -26, 40, -40, 54, -54]) spots.push(add(along(t), mul(nrm, off)));
      const inGlobe = (box) => [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]]
        .every((q) => Math.hypot(q[0] - D.S / 2, q[1] - D.S / 2) < sc.clipR - 4);
      let place = null;
      for (const p of spots) {
        const box = labelBox(p[0], p[1] + fpx * 0.35, w, fpx * 1.2);
        if (inGlobe(box) && !taken.some((t) => overlaps(t, box))) { place = { p, box }; break; }
      }
      // a host's own figure is always shown: if nothing is free, use the first spot that stays on the globe
      if (!place && !a.extra) {
        const p = spots.find((q) => inGlobe(labelBox(q[0], q[1] + fpx * 0.35, w, fpx * 1.2))) || mid;
        place = { p, box: labelBox(p[0], p[1] + fpx * 0.35, w, fpx * 1.2) };
      }
      if (place) {
        taken.push(place.box);
        texts.push(`<text class="mgl-fig${a.extra ? " mgl-fig--x" : ""}" x="${place.p[0].toFixed(1)}" y="${(place.p[1] + fpx * 0.35).toFixed(1)}" text-anchor="middle">${esc(text)}</text>`);
      }
    }
    // 2. names: origin and each host at (near) its inside point
    const named = [{ iso: origin, f: base.fo, name: originName, a: sc.anchorO, cls: "mgl-name mgl-name--o" },
      ...base.hostPairs.map((h) => ({ ...h, a: sc.anchors.get(h.iso), cls: "mgl-name mgl-name--h" })),
      ...pairs().map((h) => ({ ...h, a: sc.anchors.get(h.iso), cls: "mgl-name mgl-name--hx" }))];
    for (const n of named) {
      if (!n.f || !n.a) continue;
      const l = hostLabel(sc.proj, n, n.a, sc.clipR, arrowPts, D, { fontPx: 13 * ts, taken })
        || hostLabel(sc.proj, n, n.a, sc.clipR, arrowPts, D, { fontPx: 13 * ts, taken, allowOutside: true });
      if (l) { taken.push(l.box); texts.push(`<text class="${n.cls}" x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" text-anchor="middle">${esc(l.text)}</text>`); }
    }
    // 3. neighbours: small muted labels where they fit without touching anything else
    if (!fast) {
      const skip = new Set([origin, ...base.hostPairs.map((h) => h.iso), ...pairs().map((h) => h.iso)]);
      const cands = [];
      for (const f of features) {
        const iso = f.properties.iso3;
        if (!f.properties.name || skip.has(iso)) continue;
        const area = sc.path.area(f);
        if (area > 900) cands.push({ f, area });
      }
      cands.sort((a, b) => b.area - a.area);
      for (const { f } of cands.slice(0, 40)) {
        const a = insidePoint(sc.proj, sc.path, f, D);
        if (!a.ok) continue;
        const name = f.properties.name;
        const w = name.length * 10.5 * ts * 0.55 + 4;
        const box = labelBox(a.pt[0], a.pt[1] + 3.5 * ts, w, 12 * ts);
        const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]];
        if (!corners.every((p) => inside(sc.proj, f, p) && Math.hypot(p[0] - D.S / 2, p[1] - D.S / 2) < sc.clipR - 4)) continue;
        if (taken.some((t) => overlaps(t, box, 4)) || !clearOf(box, arrowPts, 4)) continue;
        taken.push(box);
        texts.push(`<text class="mgl-nb" x="${a.pt[0].toFixed(1)}" y="${(a.pt[1] + 3.5 * ts).toFixed(1)}" text-anchor="middle">${esc(name)}</text>`);
      }
    }
    const roles = new Map([[origin, "o"], ...base.hostPairs.map((h) => [h.iso, "h"]), ...pairs().map((h) => [h.iso, "hx"])]);
    svgBox.innerHTML = svgMarkup(D, { ...sc, labels: [] }, {
      label: `Larger map: ${originName}${base.hostPairs.length ? ` to ${base.hostPairs.map((h) => h.name).join(" and ")}` : ""}.`,
      extraLayers: `<g class="mgl-texts">${texts.join("")}</g>`,
      landAttrs: (p) => (roles.has(p.iso) ? ` data-iso="${esc(p.iso)}"` : ""),
    });
    trimArrows(svgBox, D);
    last = { proj: sc.proj, origin: base.fo, hosts: [...base.hostPairs, ...pairs()], arrows: sc.arrows };
    return last;
  }

  // ---- tooltips on the highlighted countries (hover; tap on touch screens)
  const tipText = (iso) => {
    if (iso === origin) return { name: originName, role: "Origin", text: typeof figures.originText === "function" ? figures.originText() : "no data" };
    const h = base.hostPairs.find((x) => x.iso === iso);
    if (h) {
      const v = figures.hosts?.[iso];
      return { name: h.name, role: "Host", text: v && Number.isFinite(v.value) ? `Hosts ${fmt(v.value)} ${measureWord} from ${originName}, ${v.year} · ${v.source}` : "no data" };
    }
    const x = extraAll.find((e) => e.iso === iso);
    if (x) return { name: x.name, role: "Other host (another situation)", text: Number.isFinite(x.value) ? `Hosts ${fmt(x.value)} ${measureWord} from ${originName}, ${x.year} · ${x.source}` : "no data" };
    return null;
  };
  let tipIso = null;
  function showTip(iso, cx, cy) {
    const t = tipText(iso);
    if (!t) { hideTip(); return; }
    tipIso = iso;
    tip.innerHTML = `<strong>${esc(t.name)}</strong><span class="mgl__role">${esc(t.role)}</span><span>${esc(t.text)}</span>`;
    tip.hidden = false;
    const box = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = cx - box.left + 14;
    let y = cy - box.top + 14;
    if (x + w > box.width - 4) x = cx - box.left - w - 14;
    if (y + h > box.height - 4) y = cy - box.top - h - 14;
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${Math.max(4, y)}px`;
  }
  function hideTip() { tip.hidden = true; tipIso = null; }
  svgBox.addEventListener("pointermove", (e) => {
    if (state.dragging) return;
    const iso = e.target.closest?.("[data-iso]")?.dataset.iso;
    if (iso && e.pointerType !== "touch") showTip(iso, e.clientX, e.clientY);
    else if (e.pointerType !== "touch") hideTip();
  });
  svgBox.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hideTip(); });
  // a tap anywhere outside the map closes a tooltip opened by a tap
  document.addEventListener("pointerdown", (e) => { if (tipIso && !svgBox.contains(e.target)) hideTip(); });

  // ---- drag to rotate (mouse, pen, touch); a tap without movement shows the tooltip on touch screens
  let drag = null;
  let raf = 0;
  const redrawFast = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw({ fast: true })); };
  svgBox.addEventListener("pointerdown", (e) => {
    // remember the country under the finger now: after pointer capture, later events target the map itself
    drag = { x: e.clientX, y: e.clientY, rot: state.rot.slice(), moved: false, iso: e.target.closest?.("[data-iso]")?.dataset.iso };
    try { svgBox.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  svgBox.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    drag.moved = true;
    state.dragging = true;
    hideTip();
    const k = (75 / state.scale) * (D.S / svgBox.getBoundingClientRect().width);
    state.rot = [drag.rot[0] + dx * k, Math.max(-80, Math.min(80, drag.rot[1] - dy * k)), drag.rot[2] || 0];
    redrawFast();
  });
  const endDrag = (e) => {
    if (!drag) return;
    const was = drag;
    drag = null;
    state.dragging = false;
    if (was.moved) { draw(); return; }
    if (e.pointerType === "touch") {
      if (was.iso && was.iso !== tipIso) showTip(was.iso, e.clientX, e.clientY); else hideTip();
    }
  };
  svgBox.addEventListener("pointerup", endDrag);
  svgBox.addEventListener("pointercancel", endDrag);
  svgBox.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
    if (step) {
      e.preventDefault();
      state.rot = [state.rot[0] + step[0], Math.max(-80, Math.min(80, state.rot[1] + step[1])), state.rot[2] || 0];
      draw();
    } else if (e.key === "+" || e.key === "=") { e.preventDefault(); controls.zoom(ZOOM_STEP); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); controls.zoom(1 / ZOOM_STEP); }
  });

  const controls = {
    zoom(f) { state.scale = clampScale(state.scale * f); draw(); return state.scale; },
    reset() { refit(); draw(); },
    setExtra(on) { state.showExtra = !!on && extraAll.length > 0; refit(); draw(); },
    redraw() { draw(); if (tipIso) hideTip(); },
    get limits() { return { scale: state.scale, min: whole, max: clampScale(Infinity), fit: state.fitScale }; },
    get drawn() { return last; },
    hasExtra: extraAll.length > 0,
    get hiddenExtra() { return state.showExtra ? state.hidden.map((x) => x.iso) : []; },
  };
  refit();
  draw();
  return { ...last, controls };
}
