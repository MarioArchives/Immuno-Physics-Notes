// site.js: page chrome (masthead with the paper menu, contents rail, pager), theme switch,
// abbreviation popovers and lazy-loaded plates. Works for every paper registered in docs/papers/papers.js.
import { PAPERS, findPaper, pdfPage } from "../../papers/papers.js";
import { loadAcronyms, wrapAcronyms } from "./acronyms.js";
import { showError } from "./kit.js";

const SITE_NAME = "Immuno-Physics Notes";
const ROOT = new URL("../../", import.meta.url); // the docs/ folder, wherever the site is hosted
const url = (path) => new URL(path, ROOT).href;
const body = document.body;
const page = body.dataset.page || (body.dataset.chapter ? "chapter" : "");

// Which paper is this page about? Paper pages say so; the glossary takes ?paper=; otherwise use the last one read.
const PAPER_KEY = "ipn-paper";
function storedPaper() { try { return localStorage.getItem(PAPER_KEY); } catch { return null; } }
const paperId = body.dataset.paper || new URLSearchParams(location.search).get("paper") || (page === "glossary" ? storedPaper() : null);
const paper = findPaper(paperId) || (page === "glossary" ? PAPERS[0] : null);
if (paper && body.dataset.paper) { try { localStorage.setItem(PAPER_KEY, paper.id); } catch { /* storage unavailable */ } }
const chapter = paper && body.dataset.chapter ? paper.chapters.find((c) => c.slug === body.dataset.chapter) : null;

const paperHome = (p) => url(`papers/${p.id}/index.html`);
const chapterUrl = (p, c) => url(`papers/${p.id}/chapters/${c.slug}.html`);
const glossaryUrl = (p) => url(`glossary.html?paper=${encodeURIComponent(p.id)}`);

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
};

/* ---------- theme ---------- */

function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function themeButton() {
  const b = h("button", { type: "button", class: "theme-toggle" });
  const label = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    b.textContent = next === "dark" ? "Dark" : "Light";
    b.setAttribute("aria-label", `Switch to ${next} theme`);
  };
  b.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("qi-theme", next); } catch { /* storage unavailable */ }
    label();
    window.dispatchEvent(new Event("qi-themechange"));
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", label);
  label();
  return b;
}

/* ---------- paper menu ---------- */

function paperMenu() {
  const wrap = h("div", { class: "paper-menu" });
  const btn = h("button", { type: "button", class: "paper-menu-button", "aria-expanded": "false", "aria-controls": "paper-menu-list" },
    h("span", { class: "label", text: "Paper" }),
    h("span", { class: "current", text: paper ? paper.short : "Choose a paper" }));
  const list = h("div", { class: "paper-menu-list", id: "paper-menu-list", hidden: "" });
  const ul = h("ul");
  for (const p of PAPERS) {
    const a = h("a", { href: page === "glossary" ? glossaryUrl(p) : paperHome(p) },
      h("span", { class: "t", text: p.title }),
      h("span", { class: "m", text: `${p.authors}, ${p.year}` }));
    if (paper && p.id === paper.id) a.setAttribute("aria-current", "true");
    ul.append(h("li", {}, a));
  }
  list.append(ul, h("a", { class: "all", href: url("index.html"), text: `All papers (${PAPERS.length})` }));
  const open = (yes) => {
    list.hidden = !yes;
    btn.setAttribute("aria-expanded", String(yes));
  };
  btn.addEventListener("click", () => open(list.hidden));
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) open(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !list.hidden) { open(false); btn.focus(); }
  });
  wrap.append(btn, list);
  return wrap;
}

/* ---------- masthead and footer ---------- */

function masthead() {
  const links = [];
  if (paper) {
    links.push(h("a", { href: `${paperHome(paper)}#contents`, text: "Contents", class: "nav-contents" }));
    links.push(h("a", { href: glossaryUrl(paper), text: "Glossary", ...(page === "glossary" ? { "aria-current": "page" } : {}) }));
    links.push(h("a", { href: paper.abs, text: "Paper", class: "nav-paper" }));
  }
  const nav = h("nav", { "aria-label": "Site" }, ...links, themeButton());
  const home = h("a", { class: "home", href: url("index.html"), text: SITE_NAME });
  const bar = h("header", { class: "masthead" }, home, paperMenu(), nav);
  const skip = h("a", { class: "skip-link", href: "#content", text: "Skip to the text" });
  body.prepend(skip, bar);
}

function footer() {
  const kids = [];
  if (paper) {
    kids.push(h("p", {}, "Notes on ", h("a", { href: paper.abs, text: paper.title }),
      ` by ${paper.authors}, ${paper.journal}. The notes and the models are written for this site; the paper itself is at the link.`));
  } else {
    kids.push(h("p", { text: "Notes and models are written for this site. Each paper is linked from its notes." }));
  }
  if (paper) kids.push(h("p", { text: "Click any underlined abbreviation to see what it stands for." }));
  body.append(h("footer", { class: "site-foot" }, ...kids));
}

/* ---------- chapter pages ---------- */

function chapterChrome() {
  const docName = paper.pdfName || "paper"; // what the page links open
  const main = document.getElementById("content");
  const article = main.querySelector("article");

  // Paper reference under the title.
  const head = article.querySelector(".chapter-head");
  if (head && chapter) {
    const next = paper.chapters[paper.chapters.indexOf(chapter) + 1];
    const end = next ? next.page : chapter.page;
    const range = end > chapter.page ? `pages ${chapter.page}–${end}` : `page ${chapter.page}`;
    const where = paper.numbered === false ? `${docName[0].toUpperCase()}${docName.slice(1)} ${range}. ` : `Section ${chapter.n} of the ${docName}, ${range}. `;
    head.querySelector("h1").after(h("p", { class: "paper-ref" }, where, h("a", { href: pdfPage(paper, chapter.page), text: "Open the PDF here" })));
  }

  // Part letters and page links on h2s that carry data-part / data-page.
  const parts = [];
  for (const sec of article.querySelectorAll("section[id]")) {
    const h2 = sec.querySelector(":scope > h2");
    if (!h2) continue;
    const letter = sec.dataset.part || "";
    if (letter) h2.prepend(h("span", { class: "part", "aria-hidden": "true", text: letter }));
    if (sec.dataset.page && !sec.querySelector(":scope > .paper-ref")) {
      h2.after(h("p", { class: "paper-ref" },
        h("a", { href: pdfPage(paper, sec.dataset.page), text: `${docName[0].toUpperCase()}${docName.slice(1)}, page ${sec.dataset.page}` })));
    }
    parts.push({ id: sec.id, letter, h2 });
  }

  // Contents rail.
  const ol = h("ol");
  for (const c of paper.chapters) {
    const a = h("a", { href: chapterUrl(paper, c) }, h("span", { class: "num", text: c.n }), h("span", { text: c.title }));
    const li = h("li", {}, a);
    if (c === chapter) {
      a.setAttribute("aria-current", "page");
      if (parts.length) {
        const sub = h("ol", { class: "parts" });
        for (const p of parts) {
          const t = p.h2.cloneNode(true); t.querySelector(".part")?.remove();
          sub.append(h("li", {}, h("a", { href: `#${p.id}`, "data-target": p.id },
            h("span", { class: "num", text: p.letter }), h("span", { text: t.textContent.trim() }))));
        }
        li.append(sub);
      }
    }
    ol.append(li);
  }
  const toggle = h("button", { type: "button", class: "contents-toggle", "aria-expanded": "false", text: "Contents" });
  const railBody = h("div", { class: "rail-body", id: "rail-body" }, ol);
  toggle.setAttribute("aria-controls", "rail-body");
  const rail = h("nav", { class: "rail", "aria-label": "Sections", "data-collapsed": "true" },
    h("h2", {}, h("a", { href: paperHome(paper), text: paper.short })), toggle, railBody);
  toggle.addEventListener("click", () => {
    const open = rail.dataset.collapsed === "true";
    rail.dataset.collapsed = String(!open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  const layout = h("div", { class: "layout" });
  main.before(layout);
  layout.append(rail, main);

  // Highlight the part being read.
  const links = new Map([...rail.querySelectorAll(".parts a")].map((a) => [a.dataset.target, a]));
  if (links.size) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        links.forEach((a) => a.classList.remove("active"));
        links.get(e.target.id)?.classList.add("active");
      }
    }, { rootMargin: "-20% 0px -70% 0px" });
    parts.forEach((p) => io.observe(document.getElementById(p.id)));
  }

  // Previous / next.
  if (chapter) {
    const i = paper.chapters.indexOf(chapter);
    const prev = paper.chapters[i - 1], next = paper.chapters[i + 1];
    const pager = h("nav", { class: "pager", "aria-label": "Section" });
    if (prev) pager.append(h("a", { class: "prev", href: chapterUrl(paper, prev) }, h("span", { text: "Previous" }), h("b", { text: `${prev.n}. ${prev.title}` })));
    if (next) pager.append(h("a", { class: "next", href: chapterUrl(paper, next) }, h("span", { text: "Next" }), h("b", { text: `${next.n}. ${next.title}` })));
    article.append(pager);
  }
}

/* ---------- lists on the home pages ---------- */

function paperContents() {
  const list = document.getElementById("toc-list");
  if (!list || !paper) return;
  for (const c of paper.chapters) {
    list.append(h("li", {}, h("a", { href: chapterUrl(paper, c) },
      h("span", { class: "num", text: c.n }), h("span", { class: "t", text: c.title }), h("span", { class: "d", text: c.blurb }))));
  }
  for (const el of document.querySelectorAll("[data-fill]")) {
    const v = { title: paper.title, authors: paper.authors, journal: paper.journal, summary: paper.summary }[el.dataset.fill];
    if (v) el.textContent = v;
  }
  for (const a of document.querySelectorAll("a[data-link]")) {
    const v = { abs: paper.abs, doi: paper.doi, pdf: paper.pdf, glossary: glossaryUrl(paper) }[a.dataset.link];
    if (v) a.href = v;
  }
}

function library() {
  const list = document.getElementById("paper-list");
  if (!list) return;
  const last = findPaper(storedPaper());
  for (const p of PAPERS) {
    const a = h("a", { href: paperHome(p) },
      h("span", { class: "t", text: p.title }),
      h("span", { class: "a", text: `${p.authors}. ${p.journal}.` }),
      h("span", { class: "d", text: p.summary }),
      h("span", { class: "n", text: `${p.chapters.length} sections${last && last.id === p.id ? ", last read" : ""}` }));
    list.append(h("li", {}, a));
  }
}

/* ---------- plates ---------- */

function plates() {
  const all = document.querySelectorAll(".plate[data-anim]");
  const start = async (plate) => {
    const name = plate.dataset.anim;
    try {
      const mod = await import(url(`assets/js/anim/${name}.js`));
      await mod.default(plate);
    } catch (err) {
      showError(plate, err);
    }
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); start(e.target); }
  }, { rootMargin: "300px 0px" });
  all.forEach((p) => { p.querySelector(".plate-stage")?.classList.add("loading"); io.observe(p); });
}

/* ---------- abbreviations, after MathJax has typeset ---------- */

async function acronyms() {
  const target = document.getElementById("content");
  if (!target || !paper || page === "glossary") return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (window.__mathReady) await Promise.race([window.__mathReady, wait(6000)]);
  try {
    const entries = await loadAcronyms(url(`papers/${paper.id}/acronyms.json`));
    wrapAcronyms(target, entries, glossaryUrl(paper));
  } catch (err) {
    console.error(err);
  }
}

masthead();
if (page === "chapter" && paper) chapterChrome();
paperContents();
library();
footer();
plates();
acronyms();
