// Site settings. REPO is the GitHub repository ("owner/name") that data requests open issues in.
// Leave empty until the repository exists; the request page then offers the text to copy instead.
export const REPO = "zaptec19/Refugee-Finder-Project";

// Map credits: one place for the wording and version numbers used under every map (js/geo.js loads the
// same world-atlas version). Borders are Natural Earth Admin 0 countries, delivered by the world-atlas package.
const ATLAS_VERSION = "2.0.2";
const FIGURES_UNHCR = "UNHCR Refugee Data Finder (2026 release)";
const ARROWS = "Arrows link origin and host countries; they don't show the route people travelled.";
export const MAP_SOURCE = {
  atlasVersion: ATLAS_VERSION,
  figuresUNHCR: FIGURES_UNHCR,
  /** home globe (1:110m) */
  home: `Borders: Natural Earth (via world-atlas ${ATLAS_VERSION}, 1:110m). Shading: ${FIGURES_UNHCR}.`,
  /** mini globes on situation and country pages (1:50m): one short line; the tooltip has the full credit */
  mini: "Map: Natural Earth (1:50m)",
  miniTitle: `Borders: Natural Earth Admin 0 countries (public domain), via world-atlas ${ATLAS_VERSION} (1:50m).`,
  /** the big map pop-out (1:50m); `figures` is the figures' source (UNHCR, or IDMC for internal displacement) */
  big: (figures = FIGURES_UNHCR) => `Borders: Natural Earth via world-atlas ${ATLAS_VERSION} (1:50m). Figures: ${figures}. ${ARROWS}`,
  bordersNote: "Borders are from Natural Earth and show the areas each country controls in practice. Some are disputed and may differ from official national maps. They are shown only to place the data and are not an endorsement of any border or claim.",
};
