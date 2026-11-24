// Site settings. REPO is the GitHub repository ("owner/name") that data requests open issues in.
// Leave empty until the repository exists; the request page then offers the text to copy instead.
export const REPO = "zaptec19/Refugee-Finder-Project";

// Map credits: one place for the wording and the release used under every map. The borders are Natural Earth's
// India point of view (Admin 0 countries, 1:10m, release v5.1.2), simplified by pipeline/geo.py into the two files
// js/geo.js loads (data/web/geo/countries-ind-110m.json and -50m.json).
const NE_RELEASE = "v5.1.2";
const BORDERS = `Natural Earth (India point of view, ${NE_RELEASE})`;
const FIGURES_UNHCR = "UNHCR Refugee Data Finder (2026 release)";
const ARROWS = "Arrows link origin and host countries; they don't show the route people travelled.";
export const MAP_SOURCE = {
  release: NE_RELEASE,
  files: { 110: "data/web/geo/countries-ind-110m.json", 50: "data/web/geo/countries-ind-50m.json" },
  figuresUNHCR: FIGURES_UNHCR,
  /** home globe */
  home: `Borders: ${BORDERS}. Shading: ${FIGURES_UNHCR}.`,
  /** mini globes on situation and country pages; the tooltip has the full credit */
  mini: `Borders: ${BORDERS}`,
  miniTitle: `Borders: Natural Earth Admin 0 countries, India point of view (${NE_RELEASE}, public domain), simplified for this site.`,
  /** the big map pop-out; `figures` is the figures' source (UNHCR, or IDMC for internal displacement) */
  big: (figures = FIGURES_UNHCR) => `Borders: ${BORDERS}. Figures: ${figures}. ${ARROWS}`,
  bordersNote: "Borders follow India's official position, using Natural Earth's India point of view. Some borders are disputed and are drawn differently on other countries' maps. Maps are shown only to place the data.",
  /** for an area India's map doesn't show separately (Western Sahara, Kosovo); `source` is whose figures they are */
  notSeparate: (name, source = "UNHCR") => `This map follows India's official map, which doesn't show ${name} as a separate area. The figures come from ${source}'s data for ${name}.`,
  /** for a place drawn as part of another country (PART_OF): that country is highlighted */
  partOf: (name, parent, source = "UNHCR") => `This map draws ${name} as part of ${parent}, so ${parent} is highlighted. The figures come from ${source}'s data for ${name}.`,
};
/** Areas that India's official map doesn't show as separate shapes (Natural Earth, India point of view). */
export const NOT_SEPARATE = { ESH: "Western Sahara", XKX: "Kosovo" };
/** Places with no shape of their own on the map: Natural Earth draws them as part of another country (France's
 *  overseas regions, Norway's Svalbard). The map highlights that country, zoomed on the place's own part of it:
 *  the parts within `km` of `at` (longitude, latitude; only used to pick the part, never shown). */
export const PART_OF = {
  GUF: { iso: "FRA", name: "France", at: [-53.1, 3.9], km: 300 },
  GLP: { iso: "FRA", name: "France", at: [-61.55, 16.25], km: 120 },
  MTQ: { iso: "FRA", name: "France", at: [-61.0, 14.65], km: 80 },
  REU: { iso: "FRA", name: "France", at: [55.5, -21.1], km: 200 },
  MYT: { iso: "FRA", name: "France", at: [45.15, -12.8], km: 150 },
  SJM: { iso: "NOR", name: "Norway", at: [16, 78.5], km: 600 },
};
