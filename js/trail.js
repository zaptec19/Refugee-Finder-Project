// The site's own Back: a short trail of the pages visited in this tab (sessionStorage wv1:trail, last 20), so the top
// bar can say where Back goes ("Back to Sri Lankan refugees in India") and land the reader where they left off.
//   - each page visit adds { url, title, scrollY } (url without the #hash); a reload or the browser's own back
//     doesn't add one; the current page's scroll position is kept up to date;
//   - Back goes to the previous entry (history.back() when the browser's history leads there, so back/forward stay
//     in step; else location.href) and restores its scroll position on arrival;
//   - no trail (a shared link, a new tab, a bookmark): the logical parent (a pair -> the host's country page,
//     <o>-all and <c>-idp -> that country, a country page and the other pages -> Home); never off the site;
//   - the previous page was a search typed on the home page: "Back to search" (home with the query and its results);
//   - in-page jumps (rail steps, [n] citations, #anchors) replace the history entry instead of adding one.
const KEY = "wv1:trail";
const MARK = "wv1:trail-back";
const MAX = 20;

const read = (k, f) => { try { return JSON.parse(sessionStorage.getItem(k) || "null") ?? f; } catch { return f; } };
const write = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: no trail */ } };
const drop = (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } };

/** This page's address inside the site: file name + query, no #hash ("" -> index.html). */
export const here = () => `${location.pathname.split("/").pop() || "index.html"}${location.search}`;
const same = (a, b) => String(a || "").replace(/\.html(?=\?|$)/, "") === String(b || "").replace(/\.html(?=\?|$)/, "");

let trail = [];

export function initTrail(title) {
  trail = read(KEY, []);
  if (!Array.isArray(trail)) trail = [];
  const url = here();
  const nav = performance.getEntriesByType?.("navigation")?.[0]?.type;
  const mark = read(MARK, null);
  drop(MARK);
  const last = trail[trail.length - 1];
  if (mark && same(mark.url, url)) {
    restoreScroll(mark.scrollY);                            // our Back: the trail was already shortened
  } else if (last && same(last.url, url)) {
    /* a reload: same page, same entry */
  } else if (nav === "back_forward" && trail.length >= 2 && same(trail[trail.length - 2].url, url)) {
    trail.pop();                                            // the browser's own back
  } else {
    trail.push({ url, title: title || document.title.replace(/ · Refugee Finder$/, ""), scrollY: 0 });
    while (trail.length > MAX) trail.shift();
  }
  write(KEY, trail);
  // keep this page's scroll position (where Back should land later)
  let t = 0;
  addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(saveScroll, 150); }, { passive: true });
  addEventListener("pagehide", saveScroll);
  addEventListener("pageshow", (e) => { if (e.persisted) { trail = read(KEY, trail); } });
  // in-page jumps never add a history entry (the browser's back and ours go to the previous page, not section)
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href^='#']");
    if (!a || a.getAttribute("href").length < 2) return;
    const target = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
    if (!target) return;
    e.preventDefault();
    history.replaceState(history.state, "", a.getAttribute("href"));
    target.scrollIntoView({ block: "start" });
    if (target.tabIndex < 0 && !/^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
    target.focus?.({ preventScroll: true });
  });
}

function saveScroll() {
  const last = trail[trail.length - 1];
  if (!last || !same(last.url, here())) return;
  last.scrollY = Math.round(scrollY);
  write(KEY, trail);
}

/** The page's title, once it is known (the h1 is drawn by script on most pages). */
export function setTrailTitle(title) {
  const last = trail[trail.length - 1];
  if (!title || !last || !same(last.url, here())) return;
  last.title = title;
  write(KEY, trail);
}

/** Home: the query typed in the search box (Back from the next page then says "Back to search"). */
export function noteSearch(q) {
  const last = trail[trail.length - 1];
  if (!last || !same(last.url, here())) return;
  if (q) last.q = q; else delete last.q;
  write(KEY, trail);
}

/** Where Back goes from here: { href, label, title, history } or null (home with nothing before it). */
export async function backTarget(page) {
  const prev = trail.length >= 2 && same(trail[trail.length - 1].url, here()) ? trail[trail.length - 2] : null;
  if (prev) {
    if (/^index(\.html)?(\?|$)/.test(prev.url) && prev.q) {
      return { href: `index.html?q=${encodeURIComponent(prev.q)}`, label: "Back to search", title: `Back to search: ${prev.q}`, entry: prev };
    }
    const t = /^index(\.html)?(\?|$)/.test(prev.url) ? "Home" : prev.title || "the previous page";
    return { href: prev.url, label: `Back to ${t}`, title: `Back to ${t}`, entry: prev, history: true };
  }
  if (page === "home") return null;
  // no trail: the logical parent
  const p = new URLSearchParams(location.search);
  let iso = null;
  if (page === "situation") {
    const id = (p.get("id") || "").toUpperCase().split("-");
    iso = id.length === 2 && !["ALL", "IDP"].includes(id[1]) ? id[1] : id[0] || null;
  }
  if (iso) {
    let name = iso;
    try { name = (await (await fetch("data/web/names.json")).json())[iso]?.n || iso; } catch { /* the code then */ }
    return { href: `country.html?iso=${iso}`, label: `Back to ${name}`, title: `Back to ${name}` };
  }
  return { href: "index.html", label: "Back to Home", title: "Back to Home" };
}

/** Go back to t (from backTarget): the trail loses this page; on arrival the scroll position comes back. */
export function goBack(t) {
  saveScroll();
  if (t.entry) {
    trail.pop();
    write(KEY, trail);
    write(MARK, { url: t.entry.q ? t.href : t.entry.url, scrollY: t.entry.q ? 0 : t.entry.scrollY || 0 });
    // the browser's own history leads there: step back in it, so its back/forward stay in step with ours
    let ref = null;
    try { ref = document.referrer ? new URL(document.referrer) : null; } catch { /* no referrer */ }
    if (t.history && ref && ref.origin === location.origin && same(`${ref.pathname.split("/").pop() || "index.html"}${ref.search}`, t.entry.url) && history.length > 1) {
      history.back();
      return;
    }
  }
  location.href = t.href;
}

/** On arrival from our Back: back to where the reader was, once the page has drawn enough to scroll there. */
function restoreScroll(y) {
  if (!y) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let moved = false;
  const stop = () => { moved = true; };
  ["wheel", "touchstart", "keydown"].forEach((ev) => addEventListener(ev, stop, { once: true, passive: true }));
  const t0 = performance.now();
  const go = () => { if (!moved) window.scrollTo({ top: y, behavior: "instant" }); };
  const step = () => {
    const tall = document.documentElement.scrollHeight >= y + innerHeight;
    if (tall || performance.now() - t0 > 4000) { go(); setTimeout(go, 500); setTimeout(go, 1400); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const trailNow = () => trail.slice();
