// Shared map data: world-atlas TopoJSON -> features keyed by ISO3.
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";
import { countries } from "./data.js";
import { MAP_SOURCE } from "./config.js";

// the version here and in every map's source line comes from one place (js/config.js MAP_SOURCE)
const ATLAS = {
  110: `https://cdn.jsdelivr.net/npm/world-atlas@${MAP_SOURCE.atlasVersion}/countries-110m.json`,
  50: `https://cdn.jsdelivr.net/npm/world-atlas@${MAP_SOURCE.atlasVersion}/countries-50m.json`,
};
const loaded = new Map();

/** @returns {Promise<{features: object[], byIso: Map<string, object>, land: object}>} */
export function worldFeatures(res = 110) {
  if (!loaded.has(res)) {
    loaded.set(res, (async () => {
      const [topo, cs] = await Promise.all([fetch(ATLAS[res]).then((r) => r.json()), countries()]);
      const byM49 = new Map();
      const byName = new Map();
      for (const [iso3, c] of Object.entries(cs)) {
        if (c.m49) byM49.set(String(c.m49).padStart(3, "0"), iso3);
        for (const n of [c.name, ...(c.other_names || [])]) byName.set(n.toLowerCase(), iso3);
      }
      const fc = topojson.feature(topo, topo.objects.countries);
      const byIso = new Map();
      const geoms = topo.objects.countries.geometries;
      fc.features.forEach((f, i) => {
        const iso = (f.id && byM49.get(String(f.id).padStart(3, "0"))) || byName.get((f.properties.name || "").toLowerCase()) || null;
        f.properties.iso3 = iso;
        if (geoms[i]) geoms[i].properties = { ...(geoms[i].properties || {}), iso3: iso };
        if (iso && !byIso.has(iso)) byIso.set(iso, f);
      });
      const land = topojson.merge(topo, topo.objects.countries.geometries);
      /** Borders shared by two different countries that are both in `isos` (a MultiLineString). */
      const sharedBorders = (isos) => topojson.mesh(topo, topo.objects.countries,
        (a, b) => a !== b && isos.has(a.properties?.iso3) && isos.has(b.properties?.iso3));
      return { features: fc.features, byIso, land, sharedBorders };
    })());
  }
  return loaded.get(res);
}
