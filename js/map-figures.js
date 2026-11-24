// Figures for the situation maps (the mini globe's tooltips and the larger map), straight from the situation file.
// The map never calculates a number; a missing value says "no data".
import { fmt } from "./format.js";

const last = (s) => (Array.isArray(s) && s.length ? s[s.length - 1] : null);

/** Figures for the map, straight from the situation file. */
export function figuresFor(S, MEAS, SRC) {
  const measureWord = (MEAS[S.main_measure]?.label || "people").toLowerCase();
  const srcName = (id) => SRC[id]?.short || id || "";
  const hosts = {};
  const hostIsos = S.type === "named" ? S.hosts || [] : S.host_iso3 ? [S.host_iso3] : [];
  for (const iso of hostIsos) {
    let p = null;
    if (S.type === "named") p = S.series?.by_host?.[iso] && !Array.isArray(S.series.by_host[iso]) ? S.series.by_host[iso] : last(S.series?.by_host?.[iso]);
    else p = last(S.series?.[S.main_measure]);
    if (!p) {
      const h = (S.hosts_latest || []).find((x) => x.host_iso3 === iso);
      if (h) p = { value: h.value, year: h.year, source_id: "unhcr-pop-2026" };
    }
    hosts[iso] = p ? { value: p.value, year: p.year, source: srcName(p.source_id) } : null;
  }
  const ot = last(S.origin_total);
  const main = last(S.series?.[S.main_measure]);
  const originText = () => {
    if (ot && Number.isFinite(ot.value)) return `${fmt(ot.value)} ${measureWord} from ${S.origin_name} in all host countries, ${ot.year} · ${srcName(ot.source_id)}`;
    if (S.type === "idp" && main && Number.isFinite(main.value)) return `${fmt(main.value)}: ${MEAS[S.main_measure]?.label || ""}, ${main.year} · ${srcName(main.source_id)}`;
    return "no data";
  };
  const extra = (S.hosts_latest || [])
    .filter((h) => h.host_iso3 && h.host_iso3 !== S.origin_iso3 && !hostIsos.includes(h.host_iso3))
    .slice(0, 5)
    .map((h) => ({ iso: h.host_iso3, name: h.name, value: h.value, year: h.year, source: "UNHCR",
      id: `${S.origin_iso3}-${h.host_iso3}`.toLowerCase() }));
  // originAll: the origin's figure is the total over all host countries (else it is the situation's own figure)
  return { measureWord, hosts, originText, origin: ot || main, originAll: !!(ot && Number.isFinite(ot.value)), extra, hostIsos };
}

