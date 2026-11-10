// acronyms.js: turns every acronym in the reading text into a button that opens a short definition.
// Each paper keeps its definitions in docs/papers/<id>/acronyms.json: [{ key, expansion, description, source, aliases? }].

const SKIP = new Set(["A", "BUTTON", "CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "LABEL", "H1", "H2", "H3", "MJX-CONTAINER", "SVG", "CANVAS", "TITLE"]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const slug = (key) => "acr-" + key.normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

export async function loadAcronyms(jsonUrl) {
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`${jsonUrl}: HTTP ${res.status}`);
  return res.json();
}

/** Wrap acronyms found in text under `container`. glossaryUrl is where "Open in the glossary" points. */
export function wrapAcronyms(container, entries, glossaryUrl) {
  const byForm = new Map();
  for (const e of entries) for (const form of [e.key, ...(e.aliases || [])]) byForm.set(form, e);
  const forms = [...byForm.keys()].filter(Boolean).sort((a, b) => b.length - a.length).map(esc);
  if (!forms.length) return 0; // this paper has no abbreviations listed yet
  // Shortened forms in coordinations: the "B" of "B and T cells" or the "T" of "T- and B-cell" stands for "B cell"
  // and "T cell". Collect, for every form "<prefix> <head>" whose head is a lowercase word, the prefixes per head.
  const heads = new Map();
  for (const form of byForm.keys()) {
    const m = form.match(/^(.+?)[ -]([a-z]{3,})$/);
    if (m) { if (!heads.has(m[2])) heads.set(m[2], new Set()); heads.get(m[2]).add(m[1]); }
  }
  const headList = [...heads.keys()];
  const ellipses = headList.map((head) => {
    const p = `(?:${[...heads.get(head)].sort((a, b) => b.length - a.length).map(esc).join("|")})`;
    // prefix, optional hyphen, then ", X" items, then "and"/"or" and a full "<prefix> <head>" or "<prefix>-<head>"
    return `(${p.slice(3, -1)})(?=-?(?:\\s*,\\s*${p}-?)*\\s*,?\\s+(?:and|or|&)\\s+${p}[ \\u00a0-]${esc(head)})`;
  });
  // Whole tokens only, optionally followed by a plural "s". \p{L}\p{N} keep "IL" from matching inside "sIL-6R".
  const re = new RegExp(`(?<![\\p{L}\\p{N}-])(?:(${forms.join("|")})(s?)${ellipses.map((e) => "|" + e).join("")})(?![\\p{L}\\p{N}])`, "gu");

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      for (let p = node.parentElement; p && p !== container.parentElement; p = p.parentElement) {
        if (SKIP.has(p.tagName) || p.classList.contains("no-acr") || p.classList.contains("plate-controls") || p.classList.contains("acr-pop")) return NodeFilter.FILTER_REJECT;
      }
      // Leave untypeset TeX alone if MathJax has not run (for example offline).
      if (/\\\(|\\\[/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let count = 0;
  for (const node of nodes) {
    const text = node.nodeValue;
    re.lastIndex = 0;
    if (!re.test(text)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let at = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > at) frag.append(text.slice(at, m.index));
      let entry, word = m[1];
      if (word !== undefined) entry = byForm.get(word);
      else {
        const k = m.findIndex((g, i) => i > 2 && g !== undefined);
        const head = headList[k - 3];
        word = m[k];
        entry = byForm.get(`${word} ${head}`) || byForm.get(`${word}-${head}`);
      }
      if (!entry) { frag.append(m[0]); at = m.index + m[0].length; continue; }
      const b = document.createElement("button");
      b.type = "button";
      b.className = "acr";
      b.dataset.key = entry.key;
      b.setAttribute("aria-haspopup", "dialog");
      b.setAttribute("aria-expanded", "false");
      b.title = entry.expansion;
      b.textContent = word;
      frag.append(b);
      if (m[2]) frag.append(m[2]);
      at = m.index + m[0].length;
      count++;
    }
    if (at < text.length) frag.append(text.slice(at));
    node.replaceWith(frag);
  }

  setupPopover(container, entries, glossaryUrl);
  return count;
}

let pop = null;

function setupPopover(container, entries, glossaryUrl) {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  if (!pop) {
    pop = document.createElement("div");
    pop.className = "acr-pop";
    pop.id = "acr-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-labelledby", "acr-pop-key");
    pop.hidden = true;
    pop.innerHTML = `<button type="button" class="close" aria-label="Close definition">×</button>
      <p class="key" id="acr-pop-key"></p><p class="exp"></p><p class="desc"></p>
      <a class="more" href="#">Open in the glossary</a>`;
    document.body.append(pop);
    pop.querySelector(".close").addEventListener("click", () => close(true));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) close(true); });
    document.addEventListener("click", (e) => {
      if (pop.hidden || pop.contains(e.target) || e.target.closest(".acr")) return;
      close(false);
    });
    window.addEventListener("resize", () => { if (!pop.hidden) place(current); });
  }
  let current = null;

  function close(refocus) {
    if (!current) { pop.hidden = true; return; }
    current.setAttribute("aria-expanded", "false");
    pop.hidden = true;
    if (refocus) current.focus();
    current = null;
  }
  function place(btn) {
    const r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = r.left + window.scrollX + r.width / 2 - pw / 2;
    left = Math.max(window.scrollX + 12, Math.min(left, window.scrollX + document.documentElement.clientWidth - pw - 12));
    let top = r.bottom + window.scrollY + 8;
    if (r.bottom + ph + 16 > window.innerHeight && r.top - ph - 8 > 0) top = r.top + window.scrollY - ph - 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  function open(btn) {
    const e = byKey.get(btn.dataset.key);
    if (!e) return;
    if (current) current.setAttribute("aria-expanded", "false");
    current = btn;
    pop.querySelector(".key").textContent = e.key;
    pop.querySelector(".exp").textContent = e.expansion;
    pop.querySelector(".desc").textContent = e.description;
    pop.querySelector(".more").href = `${glossaryUrl}#${slug(e.key)}`;
    btn.setAttribute("aria-expanded", "true");
    btn.setAttribute("aria-controls", "acr-pop");
    pop.hidden = false;
    place(btn);
  }
  container.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".acr");
    if (!btn) return;
    if (current === btn) close(false); else open(btn);
  });
}
