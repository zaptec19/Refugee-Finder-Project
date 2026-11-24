// The situation map: origin (sand) and host countries (slate) highlighted, an arrow from the origin to
// each host, zoomed so all of them fit inside the circle with padding. One function draws both sizes:
//   size "small": the mini globe on the situation page (240 px)
//   size "large": the pop-out map (640 px), with a figure on each arrow, the origin's other top hosts as an
//                 optional layer, zoom and drag-to-rotate.
// The arrows, colours and zoom are the same code at both sizes; the large map only adds layers.
//  - Every arrow runs from a point clearly inside the origin to a point clearly inside the host
//    ("inside point": the pole of inaccessibility of the country's largest polygon on screen, from polylabel).
//  - Every arrow, near or far, is one arc bulging up the screen, like a flight taking off and landing (upArc).
//  - Several hosts: the arrows start a few pixels apart and their arcs rise to different heights.
//  - No country names are drawn on the map: hovering any country (focus, or a tap, in the large map) shows its
//    name in a tooltip, with the role and figure for the origin and hosts. Hosts are kept visibly separate by a
//    light line on the borders they share, and the legend names each one.
// An arrow means "people from here are counted there", not the route anyone travelled.
import * as d3 from "https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm";
import polylabel from "https://cdn.jsdelivr.net/npm/polylabel@2.0.1/+esm";
import { worldFeatures } from "./geo.js";
import { esc, fmt } from "./format.js";
import { MAP_SOURCE } from "./config.js";

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
    ARC: [8 * k, 34 * k],         // how high an arrow's arc rises above its straight line (min, max)
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
  // an origin India's official map doesn't show as a separate area (opts.missingNote says so, under the map)
  const note = !base.fo && opts.missingNote ? `<p class="map-missing small">${esc(opts.missingNote)}</p>` : "";
  if (!base.focus.length) {
    // nothing to highlight (no host either): the note takes the map's place
    el.innerHTML = note || `<p class="small muted">No map shape for this place.</p>`;
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
      ${base.fo ? `<span><i class="sw sw-o"></i>${esc(originName)}</span>` : ""}${base.hostPairs.map((h) => `<span><i class="sw sw-h"></i>${esc(h.name)}</span>`).join("")}
    </div>${note}
    <div class="mini-globe__src map-src"><span title="${esc(MAP_SOURCE.miniTitle)}">${esc(MAP_SOURCE.mini)}</span> · <a href="datasets.html#maps">About borders</a></div>`;
  if (opts.onExpand) {
    const btn = el.querySelector(".mini-globe__btn");
    btn.addEventListener("click", () => opts.onExpand(btn));
  }
  const tip = document.createElement("div");
  tip.className = "mgl__tip mg-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  el.append(tip);
  const F = opts.figures || {};
  const mw = F.measureWord || "people";
  const line = (name, role = "", v = undefined, after = "", always = false) => {
    const figure = v && Number.isFinite(v.value) ? `${fmt(v.value)} ${mw}${after} (${v.year})` : always ? "no data" : "";
    return `<strong>${esc(name)}</strong>${role ? ` · ${esc(role)}` : ""}${figure ? ` · ${esc(figure)}` : ""}`;
  };
  attachTip(el.querySelector("svg"), tip, (iso, name) => {
    if (iso === opts.origin) return line(originName, F.originRole ?? (hosts.length ? "origin" : ""), F.origin, F.originAll ? " in all host countries" : "");
    const i = hosts.indexOf(iso);
    if (i >= 0) return line(hostNames[i] || name || iso, "host", F.hosts?.[iso], "", !!opts.figures);
    return line(name || iso);
  });
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

/** Everything both sizes draw: land, host borders, inside points and arrows. */
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
    if (d) landPaths.push({ cls, iso, d, name: f.properties.name || "" });
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
  return { proj, path, r, clipR, landPaths, hostBorders, anchorO, anchors, arrows, sphere: path({ type: "Sphere" }), grat: path(d3.geoGraticule10()) };
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
        ${sc.landPaths.map((p) => `<path class="mg-${p.cls}" d="${p.d}"${p.iso ? ` data-iso="${esc(p.iso)}"` : ""}${p.name ? ` data-name="${esc(p.name)}"` : ""}${landAttrs(p)}/>`).join("")}
        ${sc.hostBorders ? `<path class="mg-hb" d="${sc.hostBorders}"/>` : ""}
        ${S > 300 ? `<circle class="mg-rim" cx="${S / 2}" cy="${S / 2}" r="${sc.clipR}" fill="url(#${uid}-rim)" pointer-events="none"/>` : ""}
        ${sc.arrows.filter((a) => a.ring && !a.extra).map((a) => `<circle class="mg-ring" cx="${f1(a.ring.cx)}" cy="${f1(a.ring.cy)}" r="${f1(a.ring.r)}"/>`).join("")}
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
    // several hosts: the arcs fan out by height (never flipped downwards)
    const lift = many ? [1, 1.35, 0.7, 1.6, 0.55][usable.indexOf(h) % 5] : 1;
    const arc = upArc(start, end, D, inClip, lift);
    return { iso: h.iso, start, end, ring, ...arc, km: Math.round(km) };
  }).filter(Boolean);
}

/**
 * Every arrow is one smooth arc that bulges up the screen, near or far, like a flight taking off and landing: it
 * leaves the origin rising, peaks, and comes down into the host. (It is not the route people travelled; the map's
 * note says so.) A quadratic curve: the control point sits on the upper side of the straight line between the ends
 * and, where it fits, above both ends. Its height is about 30% of the distance on screen, between D.ARC[0] and
 * D.ARC[1]. A nearly vertical route (Sri Lanka to India) leans to one side so it still arches over the top and comes
 * down into the host: never a hook, loop or S. An arc that would leave the globe is lowered (towards a straight
 * line), never flipped downwards. Returns d, the sampled points, the control point, the up direction and the lift used.
 */
function upArc(start, end, D, inClip, lift = 1) {
  const v = sub(end, start);
  const len = Math.hypot(v[0], v[1]) || 1;
  const mid = mul(add(start, end), 0.5);
  let up = [-v[1] / len, v[0] / len];
  if (up[1] > 0) up = mul(up, -1);                  // the normal that points up the screen (smaller y)
  if (Math.abs(up[1]) < 0.02) {                     // straight up or down the screen: lean towards the globe's middle
    up = [mid[0] > D.S / 2 ? -1 : 1, 0];
  }
  // never taller than about half its length: a short hop that rose by the full minimum would turn into a hook
  const bulge = Math.min(D.ARC[1], Math.max(D.ARC[0], len * 0.3), len * 0.5) * lift;
  const ctrl0 = add(mid, mul(up, 2 * bulge));       // a quadratic's peak is half way to its control point
  // take off and land: the control point above both ends, so the arc rises from the origin and comes down into the host
  const top = Math.min(start[1], end[1]) - Math.min(Math.max(D.ARC[0] * 0.5, bulge * 0.5), len * 0.3);
  if (ctrl0[1] > top) ctrl0[1] = top;
  // keep it on the globe: lower the arc (towards the straight line) until every point is inside the circle
  let ctrl = ctrl0;
  let used = 0;
  for (const f of [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.2, 0.1, 0]) {
    const c = add(mid, mul(sub(ctrl0, mid), f));
    let ok = true;
    for (let t = 0; t <= 1.0001; t += 0.04) if (!inClip(qpt(start, c, end, t))) { ok = false; break; }
    ctrl = c;
    used = f;
    if (ok) break;
  }
  const f1 = (n) => n.toFixed(1);
  const d = `M${f1(start[0])},${f1(start[1])} Q${f1(ctrl[0])},${f1(ctrl[1])} ${f1(end[0])},${f1(end[1])}`;
  const pts = Array.from({ length: 41 }, (_, k) => qpt(start, ctrl, end, k / 40));
  return { d, pts, ctrl, up, lift: used };
}

// ------------------------------------------------------------------ labels
let measureCtx = null;
/** Width of a label in SVG units (the map's text uses the page font). */
function textW(text, px, weight = 400) {
  measureCtx ||= document.createElement("canvas").getContext("2d");
  const fam = getComputedStyle(document.body).fontFamily || "sans-serif";
  measureCtx.font = `${weight} ${px}px ${fam}`;
  return measureCtx.measureText(text).width;
}
const labelBox = (x, y, w, h) => [x - w / 2, y - h * 0.8, x + w / 2, y + h * 0.25];
const overlaps = (a, b, m = 2) => !(a[2] + m < b[0] || b[2] + m < a[0] || a[3] + m < b[1] || b[3] + m < a[1]);

// ------------------------------------------------------------------ tooltips (both sizes)
const tipKey = (el) => el.dataset.iso || el.dataset.name || "";
/**
 * One tooltip per map: the country under the pointer, highlighted or not, by name; the origin and hosts with their
 * role and figure ("India · host · 89,507 refugees (2025)"). It appears after about 80 ms, follows the pointer, stays
 * inside the map and hides on leave. Touch and keyboard call show() themselves (the large map).
 */
function attachTip(box, tip, lineFor, { busy = () => false } = {}) {
  let timer = 0;
  let key = null;
  const place = (cx, cy) => {
    const r = box.getBoundingClientRect();
    const pr = (tip.offsetParent || tip.parentElement).getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = cx + 14;
    let y = cy + 14;
    if (x + w > r.right - 4) x = cx - w - 14;
    if (y + h > r.bottom - 4) y = cy - h - 14;
    x = Math.max(r.left + 4, Math.min(x, r.right - w - 4));
    y = Math.max(r.top + 4, Math.min(y, r.bottom - h - 4));
    tip.style.left = `${(x - pr.left).toFixed(0)}px`;
    tip.style.top = `${(y - pr.top).toFixed(0)}px`;
  };
  let by = null;                                     // what opened it: "pointer", "tap" or "focus"
  const show = (el, cx, cy, how = "pointer") => {
    clearTimeout(timer);
    tip.innerHTML = lineFor(el.dataset.iso || "", el.dataset.name || "");
    tip.hidden = false;
    key = tipKey(el);
    by = how;
    place(cx, cy);
  };
  const hide = () => { clearTimeout(timer); tip.hidden = true; key = null; by = null; };
  box.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || busy()) return;
    const el = e.target.closest?.("[data-name], [data-iso]");
    if (!el) { hide(); return; }
    if (tipKey(el) === key) { place(e.clientX, e.clientY); return; }
    clearTimeout(timer);
    const { clientX: x, clientY: y } = e;
    timer = setTimeout(() => show(el, x, y), key ? 0 : 80);
  });
  box.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") hide(); });
  return { show, hide, get key() { return key; }, get by() { return by; } };
}

// ------------------------------------------------------------------ large map
const ZOOM_STEP = 1.4;

function largeMap(el, geo, D, base, opts) {
  const { features, byIso } = geo;
  const { origin, originName, figures = {} } = opts;
  const extraAll = (figures.extra || []).map((x) => ({ ...x, f: byIso.get(x.iso) })).filter((x) => x.f);
  const state = { showExtra: false, rot: null, scale: null, fitScale: null, dragging: false, listed: [] };
  const uid = `mgl${++seq}`;
  el.innerHTML = `<div class="mgl" id="${uid}">
      <div class="mgl__svg" tabindex="0" aria-describedby="${uid}-help"></div>
      <div class="mgl__tip" role="tooltip" hidden></div>
      <p class="sr-only" id="${uid}-help">Drag or use the arrow keys to turn the globe; plus and minus keys zoom.</p>
      <div class="mgl__xlist small" hidden></div>
    </div>`;
  const svgBox = el.querySelector(".mgl__svg");
  const tip = el.querySelector(".mgl__tip");
  const xList = el.querySelector(".mgl__xlist");
  let xKey = "";
  /** Other hosts (the optional layer): their figures in a small list under the map (no figures on the map for them). */
  function renderXList() {
    const key = `${state.listed.map((x) => x.iso).join()}|${fmt(1000)}`;
    if (key === xKey) return;
    xKey = key;
    xList.hidden = !state.listed.length;
    xList.innerHTML = state.listed.length ? `<p class="mgl__xlist-h">Other host countries</p>
      <table class="table table--compact"><thead><tr><th scope="col">Country</th><th scope="col" class="num">${esc(measureWord[0].toUpperCase() + measureWord.slice(1))}</th><th scope="col" class="num">Year</th></tr></thead>
      <tbody>${state.listed.map((x) => `<tr><th scope="row">${esc(x.name)}</th><td class="num tabular">${Number.isFinite(x.value) ? esc(fmt(x.value)) : '<span class="no-data">no data</span>'}</td><td class="num tabular">${esc(String(x.year ?? ""))}</td></tr>`).join("")}</tbody></table>` : "";
  }

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
    // figures on the arrows, just above the peak of each arc (the arcs all bulge upwards); the overlap rules as before
    for (const a of sc.arrows) {
      if (a.extra) continue;     // other hosts' figures are in the list under the map
      const figObj = figures.hosts?.[a.iso];
      let text = fig(figObj);
      const fpx = 12.5 * ts;
      let w = textW(text, fpx, 600) + 8;
      const mid = a.pts[Math.floor(a.pts.length / 2)];
      const peak = a.pts.reduce((m, q) => (q[1] < m[1] ? q : m), a.pts[0]);
      const tan = norm(sub(a.pts[Math.min(a.pts.length - 1, Math.floor(a.pts.length / 2) + 1)], a.pts[Math.max(0, Math.floor(a.pts.length / 2) - 1)]));
      let nrm = [-tan[1], tan[0]];
      if (dot(nrm, a.up || [0, -1]) < 0) nrm = mul(nrm, -1);      // the side the arc bulges to
      const along = (t) => a.pts[Math.max(0, Math.min(a.pts.length - 1, Math.round(t * (a.pts.length - 1))))];
      const spots = [];
      // above the peak first (centred, then nudged sideways), a line higher each time
      for (let k = 0; k < 4; k++) for (const dx of [0, -w / 3, w / 3]) spots.push([peak[0] + dx, peak[1] - fpx * (0.95 + 1.25 * k)]);
      for (const t of [0.5, 0.38, 0.62]) for (const off of [14, 26, 40, 54, -14, -26]) spots.push(add(along(t), mul(nrm, off)));
      for (const t of [0.28, 0.72, 0.2, 0.8]) for (const off of [14, 26, 40, 54, 68, -14, -26, -40]) spots.push(add(along(t), mul(nrm, off)));
      const inGlobe = (box) => [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]]
        .every((q) => Math.hypot(q[0] - D.S / 2, q[1] - D.S / 2) < sc.clipR - 4);
      const boxAt = (p) => labelBox(p[0], p[1] + fpx * 0.35, w, fpx * 1.2);
      // clear of the other figures, and of the arrows (a figure never sits on an arc)
      const clearOfArrows = (box) => arrowPts.every(([px, py]) => px < box[0] - 2 || px > box[2] + 2 || py < box[1] - 2 || py > box[3] + 2);
      const tryPlace = (strict = true) => {
        for (const p of spots) {
          const box = boxAt(p);
          if (inGlobe(box) && !taken.some((t) => overlaps(t, box)) && (!strict || clearOfArrows(box))) return { p, box };
        }
        return null;
      };
      let place = tryPlace() || tryPlace(false);
      // no room for the full label: the figure and year alone (the tooltip and the table say what it counts)
      if (!place && figObj && Number.isFinite(figObj.value)) {
        text = `${fmt(figObj.value)} (${figObj.year})`;
        w = textW(text, fpx, 600) + 8;
        place = tryPlace() || tryPlace(false);
      }
      // still nothing: slide the first spots up or down, a line at a time, until the label is clear of the others
      if (!place) {
        outer: for (const base0 of spots.slice(0, 12)) {
          for (let k = 1; k <= 8; k++) for (const dir of [-1, 1]) {
            const p = [base0[0], base0[1] + dir * k * fpx * 1.3];
            const box = boxAt(p);
            if (inGlobe(box) && !taken.some((t) => overlaps(t, box))) { place = { p, box }; break outer; }
          }
        }
      }
      // a host's own figure is always shown: if nothing is free, the first spot that stays on the globe
      if (!place) {
        const p = spots.find((q) => inGlobe(boxAt(q))) || mid;
        place = { p, box: boxAt(p) };
      }
      taken.push(place.box);
      texts.push(`<text class="mgl-fig" x="${place.p[0].toFixed(1)}" y="${(place.p[1] + fpx * 0.35).toFixed(1)}" text-anchor="middle">${esc(text)}</text>`);
    }
    // other hosts: no names or figures on the map; all of them are in the list under it
    state.listed = [...pairs()].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    renderXList();
    const roles = new Map([[origin, "o"], ...base.hostPairs.map((h) => [h.iso, "h"]), ...pairs().map((h) => [h.iso, "hx"])]);
    const focused = svgBox.contains(document.activeElement) ? document.activeElement.dataset?.iso : null;
    svgBox.innerHTML = svgMarkup(D, sc, {
      label: `Larger map: ${originName}${base.hostPairs.length ? ` to ${base.hostPairs.map((h) => h.name).join(" and ")}` : ""}.`,
      extraLayers: `<g class="mgl-texts">${texts.join("")}</g>`,
      landAttrs: (p) => (roles.get(p.iso) === "o" || roles.get(p.iso) === "h"
        ? ` tabindex="0" role="img" aria-label="${esc(tipLine(p.iso, p.name).replace(/<[^>]+>/g, ""))}"` : ""),
    });
    trimArrows(svgBox, D);
    if (focused) svgBox.querySelector(`[data-iso="${focused}"][tabindex]`)?.focus({ preventScroll: true });
    last = { proj: sc.proj, origin: base.fo, hosts: [...base.hostPairs, ...pairs()], arrows: sc.arrows };
    return last;
  }

  // ---- tooltips: any country under the pointer (hover), a tap on touch screens, keyboard focus on the origin and hosts
  function tipLine(iso, name) {
    if (iso === origin) return lineFor(originName, figures.originRole ?? "origin", figures.origin, figures.originAll ? " in all host countries" : "");
    const h = base.hostPairs.find((x) => x.iso === iso);
    if (h) return lineFor(h.name, "host", figures.hosts?.[iso], "", true);
    const x = extraAll.find((e) => e.iso === iso);
    if (x && state.showExtra) return lineFor(x.name, "other host", x, "", true);
    return lineFor(name || iso);
  }
  function lineFor(name, role = "", v = undefined, after = "", always = false) {
    const figure = v && Number.isFinite(v.value) ? `${fmt(v.value)} ${measureWord}${after} (${v.year})` : always ? "no data" : "";
    return `<strong>${esc(name)}</strong>${role ? ` · ${esc(role)}` : ""}${figure ? ` · ${esc(figure)}` : ""}`;
  }
  const tips = attachTip(svgBox, tip, tipLine, { busy: () => state.dragging });
  const hideTip = tips.hide;
  // a tap anywhere outside the map closes a tooltip opened by a tap
  document.addEventListener("pointerdown", (e) => { if (tips.key && !svgBox.contains(e.target)) hideTip(); });
  svgBox.addEventListener("focusin", (e) => {
    const p = e.target.closest?.("[data-iso][tabindex]");
    if (!p) return;
    const r = p.getBoundingClientRect();
    tips.show(p, r.left + r.width / 2, r.top + r.height / 2, "focus");
  });
  // leaving a focused country hides only a tooltip focus opened (on touch, focus moves after a tap has shown its own)
  svgBox.addEventListener("focusout", (e) => {
    const p = e.target.closest?.("[data-iso][tabindex]");
    if (p && tips.by === "focus" && tips.key === tipKey(p)) hideTip();
  });

  // ---- drag to rotate (mouse, pen, touch); a tap without movement shows the tooltip on touch screens
  let drag = null;
  let raf = 0;
  const redrawFast = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw({ fast: true })); };
  svgBox.addEventListener("pointerdown", (e) => {
    // remember the country under the finger now: after pointer capture, later events target the map itself
    drag = { x: e.clientX, y: e.clientY, rot: state.rot.slice(), moved: false, el: e.target.closest?.("[data-name], [data-iso]") };
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
      if (was.el && (tipKey(was.el) !== tips.key || tips.by !== "tap")) tips.show(was.el, e.clientX, e.clientY, "tap"); else hideTip();
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
    redraw() { draw(); if (tips.key) hideTip(); },
    get limits() { return { scale: state.scale, min: whole, max: clampScale(Infinity), fit: state.fitScale }; },
    get drawn() { return last; },
    hasExtra: extraAll.length > 0,
    get hiddenExtra() { return state.showExtra ? state.hidden.map((x) => x.iso) : []; },
    get listedExtra() { return state.listed.map((x) => x.iso); },
  };
  refit();
  draw();
  return { ...last, controls };
}
