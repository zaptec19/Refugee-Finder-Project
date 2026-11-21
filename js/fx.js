// "Reduce effects": one switch for blur, glow, pulsing and movement. On when the reader picks it in the
// Display menu, and automatically with prefers-reduced-motion. Everything that animates asks fxOff() first.
import { store } from "./store.js";

const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export const reducedMotion = () => !!mq?.matches;
export const effectsChosenOff = () => store.get("fx", "on") === "off";
export const fxOff = () => reducedMotion() || effectsChosenOff();

/** Keep html.fx-off in step with the setting and the system preference. */
export function applyFx() {
  document.documentElement.classList.toggle("fx-off", fxOff());
}
export function setEffects(on) {
  store.set("fx", on ? "on" : "off");
  applyFx();
  document.dispatchEvent(new CustomEvent("fx-change", { detail: !fxOff() }));
}
mq?.addEventListener?.("change", () => { applyFx(); document.dispatchEvent(new CustomEvent("fx-change", { detail: !fxOff() })); });
