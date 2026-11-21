// The operating system's reduced-motion setting (an accessibility setting, not a site option).
// Everything that moves asks reducedMotion() first and then only fades, or does nothing.
const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export const reducedMotion = () => !!mq?.matches;
