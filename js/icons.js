// Small inline icons (stroke = currentColor). Decorative unless given a label by the caller.
const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
  collection: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  pin: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5V14M12 17h.01"/>',
  steady: '<circle cx="12" cy="12" r="9"/><path d="M8 10h8M8 14h8"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  chart: '<path d="M4 19h16M6 16l4-5 3 3 5-7"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M10 10v9"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  landmark: '<path d="M12 3 3 8h18z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  wave: '<path d="M3 13c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  trace: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5"/>',
};

export function icon(name, { label = "", size = 18, cls = "icon" } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ${a11y}>${P[name] || ""}</svg>`;
}

/** B4: the one pin button. Its name stays "Pin <label> to collection"; aria-pressed says whether it is pinned,
 *  the icon turns into a check and the hover/focus tooltip reads "Pinned". `attrs` adds data attributes. */
export function pinButton({ key, label, attrs = "" }) {
  const e = (t) => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<button class="pin-btn" type="button" data-pin-key="${e(key)}" ${attrs} aria-pressed="false" aria-label="Pin ${e(label)} to collection">`
    + `<span class="pin-btn__off">${icon("pin", { size: 16 })}</span><span class="pin-btn__on">${icon("check", { size: 16 })}</span></button>`;
}
