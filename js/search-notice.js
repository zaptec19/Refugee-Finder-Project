// "Showing: Russian refugees in India · You searched: "rusian refugee in indai"" on the page a search led to, when
// the search was changed on the way (spelling, another name, a year, a dropped word, a match by meaning).
// The search box saves the notice in sessionStorage just before it navigates; the landing page shows it once:
// a bar under the top bar (it sticks there) for about 6 s, then a quiet line that stays until the reader scrolls or closes it.
// Not shown when a result was clicked, or when the page's title is what was typed.
import { esc } from "./format.js";
import { reducedMotion } from "./motion.js";

const KEY = "wv1:search-notice";

/** Called by the search box just before Enter navigates to a changed search. */
export function rememberNotice({ typed, shown, href }) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ typed, shown, href, at: Date.now() })); } catch { /* storage blocked: no notice */ }
}

export const hasNotice = () => {
  try { return !!sessionStorage.getItem(KEY); } catch { return false; }
};

const same = (href) => {
  const u = new URL(href, location.href);
  const path = (x) => x.replace(/\.html$/, "").replace(/\/index$/, "/");      // hosts with clean URLs drop .html
  return path(u.pathname) === path(location.pathname) && [...u.searchParams].every(([k, v]) => new URLSearchParams(location.search).get(k) === v);
};

/** On every page: show the saved notice if it is for this page (and fresh), then forget it. */
export function showNotice() {
  let n = null;
  try { n = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch { return; }
  if (!n || Date.now() - n.at > 60000 || !same(n.href)) return;
  const bar = document.createElement("div");
  bar.className = "search-notice";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<p class="search-notice__text">Showing: <strong>${esc(n.shown)}</strong> <span class="search-notice__sep" aria-hidden="true">·</span>
      You searched: <q>${esc(n.typed)}</q></p>
    <a class="search-notice__instead" href="index.html?q=${encodeURIComponent(n.typed)}&exact=1">Search instead for <q>${esc(n.typed)}</q></a>
    <button class="icon-btn search-notice__close" type="button" aria-label="Close this notice">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
  const top = document.querySelector(".topbar");
  (top || document.body.firstElementChild)?.after(bar);
  if (!reducedMotion()) bar.classList.add("is-in");
  const close = () => {
    removeEventListener("scroll", onScroll);
    if (reducedMotion()) { bar.remove(); return; }
    bar.classList.add("is-out");
    setTimeout(() => bar.remove(), 260);
  };
  bar.querySelector(".search-notice__close").addEventListener("click", close);
  // after about 6 s it settles into a quiet line; it stays until the reader scrolls (or closes it)
  // (the page's own scroll to the people type asked about doesn't count: only the reader's, after it went quiet)
  let from = 0;
  const onScroll = () => { if (Math.abs(scrollY - from) > 40) close(); };
  setTimeout(() => {
    if (!bar.isConnected) return;
    from = scrollY;
    bar.classList.add("is-quiet");
    addEventListener("scroll", onScroll, { passive: true });
  }, 6000);
}
