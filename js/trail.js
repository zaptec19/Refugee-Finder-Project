// The site's own Back: the briefs opened since the reader was last on the home page (sessionStorage wv1:trail).
//   - The home page is square one: it never shows Back, and any load of it (logo, Back, a tour ending, the browser,
//     a typed address) empties the trail.
//   - A brief is a topic page: a situation page (built, or built in the browser) or a country page. Opening one adds
//     it, unless it is the last entry (a reload); a brief already in the trail cuts the trail back to it (no loops).
//   - Learn, collection, datasets and request never enter the trail.
//   - Back goes to the brief before this one (from a non-brief page: the last brief), else Home. It navigates with
//     location.assign (the browser's own history is left alone), restores that page's scroll position on arrival,
//     and pops the trail, so pressing it again walks back one brief at a time, then Home.
//   - In-page jumps (rail steps, [n] citations, #anchors) replace the history entry instead of adding one.
const KEY = "wv1:trail";
const MARK = "wv1:trail-back";
const BRIEF = new Set(["situation", "country"]);

const read = (k, f) => { try { return JSON.parse(sessionStorage.getItem(k) || "null") ?? f; } catch { return f; } };
const write = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: no trail */ } };
const drop = (k) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } };

/** This page's address inside the site: file name + query, no #hash. */
export const here = () => `${location.pathname.split("/").pop() || "index.html"}${location.search}`;
const same = (a, b) => String(a || "").replace(/\.html(?=\?|$)/, "") === String(b || "").replace(/\.html(?=\?|$)/, "");

let trail = [];
let kind = "";

/** Apply the rules for this page (on load, and again when the page is shown from the back/forward cache). */
function sync() {
  trail = read(KEY, []);
  if (!Array.isArray(trail)) trail = [];
  const url = here();
  if (kind === "home") trail = [];
  else if (BRIEF.has(kind)) {
    const at = trail.findIndex((e) => same(e.url, url));
    if (at >= 0) trail = trail.slice(0, at + 1);                         // a reload, or back to a brief already here
    else trail.push({ url, title: document.title.replace(/ · Refugee Finder$/, ""), scrollY: 0 });
  }
  write(KEY, trail);
}

export function initTrail(page) {
  kind = page;
  sync();
  const mark = read(MARK, null);
  drop(MARK);
  if (mark && same(mark.url, here())) restoreScroll(mark.scrollY);
  let t = 0;
  addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(saveScroll, 150); }, { passive: true });
  addEventListener("pagehide", saveScroll);
  addEventListener("pageshow", (e) => { if (e.persisted) { sync(); document.dispatchEvent(new CustomEvent("trail-change")); } });
  // in-page jumps never add a history entry
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

const mine = () => BRIEF.has(kind) && trail.length && same(trail[trail.length - 1].url, here());

function saveScroll() {
  if (!mine()) return;
  trail[trail.length - 1].scrollY = Math.round(scrollY);
  write(KEY, trail);
}

/** The page's title, once it is known (the h1 is drawn by script). */
export function setTrailTitle(title) {
  if (!title || !mine()) return;
  trail[trail.length - 1].title = title;
  write(KEY, trail);
}

/** Where Back goes from here: { url, label, title, entry } or null (the home page). */
export function backTarget(page = kind) {
  if (page === "home") return null;
  const prev = mine() ? trail[trail.length - 2] : (!BRIEF.has(page) ? trail[trail.length - 1] : null);
  if (prev) return { url: prev.url, label: `Back to ${prev.title}`, title: `Back to ${prev.title}`, entry: prev };
  return { url: "index.html", label: "Back to Home", title: "Back to Home" };
}

/** Go back: this brief leaves the trail; the target's scroll position comes back on arrival. */
export function goBack(t) {
  saveScroll();
  if (mine()) { trail.pop(); write(KEY, trail); }
  if (t.entry) write(MARK, { url: t.entry.url, scrollY: t.entry.scrollY || 0 });
  location.assign(t.url);
}

/** On arrival from our Back: back to where the reader was, once the page has drawn enough to scroll there. */
function restoreScroll(y) {
  if (!y) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  let moved = false;
  ["wheel", "touchstart", "keydown"].forEach((ev) => addEventListener(ev, () => { moved = true; }, { once: true, passive: true }));
  const t0 = performance.now();
  const go = () => { if (!moved) window.scrollTo({ top: y, behavior: "instant" }); };
  const step = () => {
    if (document.documentElement.scrollHeight >= y + innerHeight || performance.now() - t0 > 4000) { go(); setTimeout(go, 500); setTimeout(go, 1400); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
