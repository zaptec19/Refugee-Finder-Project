// Request data: builds a pre-filled GitHub issue from what the researcher types.
import { initPage } from "./layout.js";
import { esc } from "./format.js";
import { REPO } from "./config.js";

initPage({ page: "request" });
const params = new URLSearchParams(location.search);
const about = params.get("q") || params.get("about") || "";
const main = document.getElementById("main");
main.innerHTML = `<div class="page page--narrow" style="max-width:720px">
  <h1>Request data or a source</h1>
  <p class="muted">Tell us what you were looking for. This opens a pre-filled issue on GitHub, which is public: please don't include personal details.</p>
  <form class="req" id="req">
    <label for="r-what">What are you looking for?</label>
    <input id="r-what" name="what" required value="${esc(about)}" placeholder="e.g. Rohingya refugees in India, by year">
    <label for="r-where">Place or group</label>
    <input id="r-where" name="where" placeholder="e.g. India; Rohingya">
    <label for="r-years">Years</label>
    <input id="r-years" name="years" placeholder="e.g. 2012 to 2025">
    <label for="r-source">A source you know of (optional)</label>
    <input id="r-source" name="source" placeholder="Organisation, report or link">
    <label for="r-why">How would you use it? (optional)</label>
    <textarea id="r-why" name="why" rows="3"></textarea>
    <div class="req__actions"><button class="btn btn--primary" type="submit">Open the request on GitHub</button></div>
    <p class="req__out small" role="status" aria-live="polite"></p>
  </form></div>`;

document.getElementById("req").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const title = `Data request: ${f.get("what")}`.slice(0, 120);
  const body = [
    `**What:** ${f.get("what")}`, `**Place or group:** ${f.get("where") || "-"}`, `**Years:** ${f.get("years") || "-"}`,
    `**Known source:** ${f.get("source") || "-"}`, `**Use:** ${f.get("why") || "-"}`, "", `_Sent from ${location.pathname}_`,
  ].join("\n");
  const out = e.target.querySelector(".req__out");
  if (!REPO) {
    out.innerHTML = `The site's GitHub repository is not set yet. Copy this text and send it to the team:<pre class="req__pre">${esc(`${title}\n\n${body}`)}</pre>`;
    return;
  }
  const url = `https://github.com/${REPO}/issues/new?${new URLSearchParams({ title, body, labels: "data-request" })}`;
  window.open(url, "_blank", "noopener");
  out.textContent = "Opened GitHub in a new tab.";
});
