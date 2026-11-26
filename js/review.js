// Team review notes ("to check", "to confirm") stay in the data but only show with ?review=1 in the URL.
// On the normal site a figure still to be confirmed gets a small neutral "Unverified" tag instead.
import { esc } from "./format.js";

export const REVIEW = (() => {
  try { return new URLSearchParams(location.search).get("review") === "1"; } catch { return false; }
})();

/** A team note, shown only in review mode. */
export function reviewNote(text, tag = "div") {
  if (!REVIEW || !text) return "";
  return `<${tag} class="review-note"><strong>Review note:</strong> ${esc(text)}</${tag}>`;
}

const UNVERIFIED_TIP = "Still to be confirmed against the original document. Shown exactly as the source gives it.";

/** Neutral tag for a figure or source whose details are still being confirmed. */
export function unverifiedTag(note) {
  return `<span class="status status--unverified" tabindex="0" title="${esc(UNVERIFIED_TIP)}" aria-label="Unverified: ${esc(UNVERIFIED_TIP)}">Unverified</span>${note ? reviewNote(note, "span") : ""}`;
}
