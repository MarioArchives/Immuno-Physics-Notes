#!/usr/bin/env python3
"""Static checks for the notes site. Standard library only, so it runs in CI as is.

    python3 tools/check.py                                  # structure, links, plates, abbreviations
    python3 tools/check.py --source ID=path/to/main.tex     # also flag word runs copied from paper ID's LaTeX source

Exit status is 1 if any error is found. Warnings do not fail the run.
"""
import argparse
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
errors, warnings = [], []
# Abbreviations that need no glossary entry.
IGNORE = {"PDF", "HTML", "CSS", "URL", "OK"}


def err(where, msg):
    errors.append(f"ERROR {where}: {msg}")


def warn(where, msg):
    warnings.append(f"warn  {where}: {msg}")


class Page(html.parser.HTMLParser):
    """Collects ids, links, scripts, plates and visible prose text (without maths)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.links, self.scripts, self.styles, self.anims = set(), [], [], [], []
        self.body_attrs, self.text, self.stack, self.sections, self.h2_in = {}, [], [], [], {}
        self.skip = 0
        self.name = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag not in ("meta", "link", "br", "img", "input", "hr", "source"):
            self.stack.append(tag)
        if "id" in a:
            if a["id"] in self.ids:
                err(self.name, f'duplicate id "{a["id"]}"')
            self.ids.add(a["id"])
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        if tag == "script":
            self.skip += 1
            if a.get("src"):
                self.scripts.append(a["src"])
        if tag == "style":
            self.skip += 1
        if tag == "link" and a.get("rel") == "stylesheet":
            self.styles.append(a.get("href", ""))
        if tag == "body":
            self.body_attrs = a
        if tag == "figure" and "data-anim" in a:
            self.anims.append(a["data-anim"])
        if tag == "section" and "id" in a:
            self.sections.append(a["id"])
            self.h2_in[a["id"]] = False
        if tag == "h2" and self.sections:
            self.h2_in[self.sections[-1]] = True

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
        while self.stack:
            if self.stack.pop() == tag:
                break

    def handle_data(self, data):
        if not self.skip and "head" not in self.stack and "blockquote" not in self.stack:
            self.text.append(data)


def prose(text):
    t = re.sub(r"\\\[.*?\\\]|\\\(.*?\\\)", " ", text, flags=re.S)
    return re.sub(r"\s+", " ", t)


def words(t):
    return re.findall(r"[a-z]+", t.lower().replace("-", " "))


def latex_words(path):
    tex = Path(path).read_text(encoding="utf-8", errors="replace")
    tex = re.sub(r"(?<!\\)%.*", "", tex)
    tex = re.sub(r"\\begin\{thebibliography\}.*", "", tex, flags=re.S)
    tex = re.sub(r"\\(beq|bea)\b.*?\\(eeq|eea)\b|\\begin\{(equation|eqnarray|align)\*?\}.*?\\end\{\3\*?\}", " ", tex, flags=re.S)
    tex = re.sub(r"\$\$.*?\$\$|\$[^$]*\$", " ", tex, flags=re.S)
    tex = re.sub(r"\\(cite|ref|eqref|label|includegraphics|url)(\[[^\]]*\])?\{[^}]*\}", " ", tex)
    tex = re.sub(r"\\[a-zA-Z]+\*?", " ", tex)
    return words(tex)


def load_papers():
    """Each docs/papers/<id>/ folder with a paper.js is one paper."""
    registry = (DOCS / "papers/papers.js").read_text(encoding="utf-8") if (DOCS / "papers/papers.js").exists() else ""
    if not registry:
        err("docs/papers/papers.js", "missing")
    papers = {}
    for manifest in sorted(DOCS.glob("papers/*/paper.js")):
        folder = manifest.parent
        pid = folder.name
        text = manifest.read_text(encoding="utf-8")
        m = re.search(r'\bid:\s*"([^"]+)"', text)
        if not m or m.group(1) != pid:
            err(f"papers/{pid}/paper.js", f'id must be "{pid}", the folder name')
        if f'"./{pid}/paper.js"' not in registry:
            err("papers/papers.js", f"paper {pid} is not imported")
        known = set()
        acr_path = folder / "acronyms.json"
        acr = json.loads(acr_path.read_text(encoding="utf-8")) if acr_path.exists() else []
        if not acr_path.exists():
            warn(f"papers/{pid}", "no acronyms.json")
        for e in acr:
            for k in [e.get("key", ""), *e.get("aliases", [])]:
                known.add(k)
            for field in ("key", "expansion", "description", "source"):
                if not e.get(field):
                    err(f"papers/{pid}/acronyms.json", f"entry {e.get('key')!r} has no {field}")
        papers[pid] = {"folder": folder, "slugs": re.findall(r'slug:\s*"([^"]+)"', text), "known": known}
        for slug in papers[pid]["slugs"]:
            if not (folder / "chapters" / f"{slug}.html").exists():
                warn(f"papers/{pid}/paper.js", f"no page yet for {slug}")
    return papers


def copied_runs(text, src_runs, n):
    w = words(text)
    hits, i = [], 0
    while i <= len(w) - n:
        if tuple(w[i:i + n]) in src_runs:
            j = i + n
            while j < len(w) and tuple(w[j - n + 1:j + 1]) in src_runs:
                j += 1
            hits.append(" ".join(w[i:j]))
            i = j
        else:
            i += 1
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", action="append", default=[], metavar="ID=PATH",
                    help="LaTeX source of paper ID, to flag word runs copied from it (repeatable; a bare PATH works when there is one paper)")
    ap.add_argument("--run", type=int, default=9, help="flag shared runs of at least this many words (default 9)")
    args = ap.parse_args()

    papers = load_papers()
    all_known = set().union(*(p["known"] for p in papers.values())) if papers else set()

    sources = {}
    for spec in args.source:
        pid, sep, path = spec.partition("=")
        if not sep:
            if len(papers) != 1:
                sys.exit("--source needs ID=PATH when there is more than one paper")
            pid, path = next(iter(papers)), spec
        if pid not in papers:
            sys.exit(f"--source: unknown paper {pid}")
        sw = latex_words(path)
        sources[pid] = {tuple(sw[i:i + args.run]) for i in range(len(sw) - args.run + 1)}

    pages = sorted(DOCS.glob("*.html")) + sorted(DOCS.glob("papers/*/*.html")) + sorted(DOCS.glob("papers/*/chapters/*.html"))
    for path in pages:
        rel = path.relative_to(DOCS).as_posix()
        p = Page()
        p.name = rel
        p.feed(path.read_text(encoding="utf-8"))
        up = os.path.relpath(DOCS, path.parent).replace(os.sep, "/") + "/"
        up = "" if up == "./" else up
        parts = rel.split("/")
        pid = parts[1] if parts[0] == "papers" else None
        is_chapter = len(parts) == 4 and parts[2] == "chapters"

        # Required head and body wiring.
        if f"{up}assets/css/site.css" not in p.styles:
            err(rel, "missing site.css")
        if f"{up}assets/js/site.js" not in p.scripts:
            err(rel, "missing site.js")
        if pid:
            if pid not in papers:
                err(rel, f"folder papers/{pid} has no paper.js")
                continue
            if p.body_attrs.get("data-paper") != pid:
                err(rel, f'<body data-paper="{pid}"> is missing or wrong')
        if is_chapter:
            slug = path.stem
            if p.body_attrs.get("data-chapter") != slug:
                err(rel, f'<body data-chapter="{slug}"> is missing or wrong')
            if slug not in papers[pid]["slugs"]:
                err(rel, f"page is not listed in papers/{pid}/paper.js")
            if f"{up}assets/js/mathjax-config.js" not in p.scripts:
                err(rel, "missing mathjax-config.js")
            for sid, has in p.h2_in.items():
                if not has:
                    err(rel, f'section "{sid}" has no <h2>')

        # Plates.
        for name in p.anims:
            if not (DOCS / "assets/js/anim" / f"{name}.js").exists():
                err(rel, f'plate data-anim="{name}" has no assets/js/anim/{name}.js')

        # Local links and anchors.
        for href in p.links:
            if re.match(r"^(https?:|mailto:)", href):
                continue
            target, _, frag = href.partition("#")
            target = target.partition("?")[0]
            tpath = (path.parent / target).resolve() if target else path
            if not tpath.exists():
                err(rel, f"broken link {href}")
                continue
            if frag and tpath.suffix == ".html":
                tp = Page()
                tp.name = tpath.name
                tp.feed(tpath.read_text(encoding="utf-8"))
                if frag not in tp.ids and not (tpath.name == "glossary.html" and frag.startswith("acr-")):
                    err(rel, f"link {href} points to a missing anchor")

        text = prose(" ".join(p.text))

        # Unbalanced maths delimiters.
        raw = " ".join(p.text)
        if raw.count("\\(") != raw.count("\\)") or raw.count("\\[") != raw.count("\\]"):
            err(rel, "unbalanced \\( \\) or \\[ \\] maths delimiters")

        # Acronym-like tokens with no glossary entry.
        known = papers[pid]["known"] if pid else all_known
        cand = set(re.findall(r"(?<![\w-])((?:[a-z]{0,2}[A-Z]{2,}[A-Za-z0-9Ͱ-Ͽ-]*)|(?:[A-Z][a-z]?[0-9]+[A-Za-z]*))(?![\w])", text))
        missing = sorted(c for c in cand if c not in known and c.rstrip("s") not in known and c not in IGNORE and not re.fullmatch(r"[IVX]+", c))
        if missing:
            warn(rel, "abbreviations without a glossary entry: " + ", ".join(missing))

        # Copied word runs.
        if is_chapter and pid in sources:
            for h in copied_runs(text, sources[pid], args.run):
                warn(rel, f"{len(h.split())} words match the paper verbatim: \"{h}\"")

    # JavaScript syntax.
    node = shutil.which("node")
    if node:
        with tempfile.TemporaryDirectory() as tmp:
            for js in sorted((DOCS / "assets/js").rglob("*.js")) + sorted((DOCS / "papers").rglob("*.js")):
                copy = Path(tmp) / (js.stem + ".mjs")
                copy.write_text(js.read_text(encoding="utf-8"), encoding="utf-8")
                r = subprocess.run([node, "--check", str(copy)], capture_output=True, text=True)
                if r.returncode:
                    lines = r.stderr.strip().splitlines()
                    err(js.relative_to(DOCS).as_posix(), "syntax error: " + (lines[-1] if lines else "unknown"))
    else:
        warn("tools/check.py", "node not found; JavaScript syntax not checked")

    for line in warnings + errors:
        print(line)
    print(f"{len(papers)} papers, {len(pages)} pages checked: {len(errors)} errors, {len(warnings)} warnings")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
