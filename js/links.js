// External links (another website) open in a new tab. Links inside this site stay in the same tab.
// Runs once per page from initPage(); a MutationObserver catches links drawn later by script
// (briefs, sources, readings, pop-outs, the collection table).

const HINT_ID = "ext-link-hint";

function hintId() {
  if (!document.getElementById(HINT_ID)) {
    const s = document.createElement("span");
    s.id = HINT_ID;
    s.hidden = true;
    s.textContent = "opens in a new tab";
    document.body.append(s);
  }
  return HINT_ID;
}

function isExternal(a) {
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#") || a.hasAttribute("download")) return false;
  let url;
  try { url = new URL(href, location.href); } catch { return false; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin !== location.origin;
}

function mark(a) {
  const ext = isExternal(a);
  if (a.dataset.ext === "1" && !ext) {
    // its href now points inside the site: same tab again, and no "opens in a new tab" for screen readers
    delete a.dataset.ext;
    a.removeAttribute("target");
    const ids = (a.getAttribute("aria-describedby") || "").split(/\s+/).filter((x) => x && x !== HINT_ID);
    if (ids.length) a.setAttribute("aria-describedby", ids.join(" "));
    else a.removeAttribute("aria-describedby");
    return;
  }
  if (a.dataset.ext === "1" || !ext) return;
  a.dataset.ext = "1";
  a.target = "_blank";
  const rel = new Set((a.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
  rel.add("noopener"); rel.add("noreferrer");
  a.setAttribute("rel", [...rel].join(" "));
  // screen readers hear "opens in a new tab" from one shared hidden description. Not injected into the
  // link text, so copying a citation by selecting it never picks up the hint.
  const ids = new Set((a.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  ids.add(hintId());
  a.setAttribute("aria-describedby", [...ids].join(" "));
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.("a[href]")) mark(root);
  root.querySelectorAll?.("a[href]").forEach(mark);
}

export function externalLinksNewTab() {
  scan(document.body);
  let queued = new Set();
  let raf = 0;
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") queued.add(r.target);
      else r.addedNodes.forEach((n) => queued.add(n));
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const nodes = queued; queued = new Set();
      nodes.forEach((n) => { if (n.isConnected) scan(n); });
    });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
}
