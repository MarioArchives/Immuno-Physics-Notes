// glossary.js: renders one paper's abbreviation list on glossary.html (?paper=<id>), with a filter.
import { PAPERS, findPaper } from "../../papers/papers.js";
import { loadAcronyms, slug } from "./acronyms.js";

const ROOT = new URL("../../", import.meta.url);
const listEl = document.getElementById("gl-list");
const countEl = document.getElementById("gl-count");
const input = document.getElementById("gl-filter");
const titleEl = document.getElementById("gl-paper");

let stored = null;
try { stored = localStorage.getItem("ipn-paper"); } catch { /* storage unavailable */ }
const paper = findPaper(new URLSearchParams(location.search).get("paper")) || findPaper(stored) || PAPERS[0];

const fold = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function render(entries, query) {
  const q = fold(query.trim());
  const shown = entries.filter((e) => !q || fold(`${e.key} ${e.expansion} ${e.description}`).includes(q));
  listEl.replaceChildren();
  let letter = "", dl = null;
  for (const e of shown) {
    const first = fold(e.key)[0].toUpperCase();
    if (first !== letter) {
      letter = first;
      const hd = document.createElement("h2");
      hd.className = "gl-letter";
      hd.textContent = /[A-Z]/.test(letter) ? letter : "Other";
      dl = document.createElement("dl");
      dl.className = "gl-list";
      listEl.append(hd, dl);
    }
    const row = document.createElement("div");
    row.className = "gl-entry";
    row.id = slug(e.key);
    const dt = document.createElement("dt");
    dt.textContent = e.key;
    const dd = document.createElement("dd");
    const exp = document.createElement("span"); exp.className = "exp"; exp.textContent = e.expansion;
    const desc = document.createElement("span"); desc.textContent = e.description + " ";
    const src = document.createElement("span"); src.className = "src";
    src.textContent = e.source === "paper" ? "Spelled out in the paper." : "Standard meaning; not spelled out in the paper.";
    dd.append(exp, desc, src);
    row.append(dt, dd);
    dl.append(row);
  }
  countEl.textContent = q ? `${shown.length} of ${entries.length} entries match.` : `${entries.length} entries.`;
  if (!shown.length) listEl.innerHTML = "<p>No abbreviation matches that filter. Try part of the word, such as \"inter\" for interleukin.</p>";
}

titleEl.textContent = paper.title;
titleEl.href = new URL(`papers/${paper.id}/index.html`, ROOT).href;
document.title = `Abbreviations in ${paper.short} | Immuno-Physics Notes`;

loadAcronyms(new URL(`papers/${paper.id}/acronyms.json`, ROOT)).then((entries) => {
  entries.sort((a, b) => fold(a.key).localeCompare(fold(b.key)));
  render(entries, input.value);
  input.addEventListener("input", () => render(entries, input.value));
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) { target.classList.add("is-target"); target.scrollIntoView({ block: "center" }); }
}).catch((err) => {
  listEl.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = `The glossary could not load (${err.message}). If you opened this file directly from disk, serve the folder over HTTP instead, as the README explains.`;
  listEl.append(p);
});
