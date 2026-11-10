#!/usr/bin/env python3
"""Start notes on a new paper.

    python3 tools/new_paper.py ID --title "Paper title" --authors "A. Author and B. Author" \
        --year 2021 --journal "Journal 12, 34 (2021)" --url https://arxiv.org/abs/XXXX.XXXXX \
        [--pdf https://arxiv.org/pdf/XXXX.XXXXX] [--doi https://doi.org/...] [--short "Short title"] [--summary "One sentence."]

Creates docs/papers/ID/ with paper.js (metadata and the list of sections), index.html (the paper's home page),
acronyms.json (its glossary, initially empty) and chapters/01-introduction.html (a first section to fill in),
and registers the paper in docs/papers/papers.js so it appears in the paper menu. Add further sections to
the chapters list in paper.js and copy the first chapter page for each.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "docs" / "papers"
FONTS = ("https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400"
         "&amp;family=Schibsted+Grotesk:ital,wght@0,400;0,500;0,700;1,700&amp;display=swap")


def head(title, description, up, math=True):
    lines = [
        "<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{html.escape(title)}</title>",
        f'<meta name="description" content="{html.escape(description)}">',
        '<script>try{var t=localStorage.getItem("qi-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>',
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        f'<link rel="stylesheet" href="{FONTS}">',
        f'<link rel="stylesheet" href="{up}assets/css/site.css">',
        f'<link rel="icon" href="{up}assets/favicon.svg" type="image/svg+xml">',
    ]
    if math:
        lines += [f'<script src="{up}assets/js/mathjax-config.js"></script>',
                  '<script async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js"></script>']
    lines += [f'<script type="module" src="{up}assets/js/site.js"></script>', "</head>"]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("id", help="folder name and identifier: lowercase words joined by hyphens, e.g. t-cell-activation")
    ap.add_argument("--title", required=True)
    ap.add_argument("--short", help="shorter title for the paper menu (default: the title)")
    ap.add_argument("--authors", required=True)
    ap.add_argument("--year", required=True, type=int)
    ap.add_argument("--journal", required=True, help='citation line, e.g. "Physical Review X 9, 011027 (2019)"')
    ap.add_argument("--url", required=True, help="landing page of the paper (arXiv abstract, journal page)")
    ap.add_argument("--pdf", help="PDF link used for page references (default: --url)")
    ap.add_argument("--doi", default="", help="DOI link")
    ap.add_argument("--summary", default="One sentence on what the paper is about.")
    a = ap.parse_args()

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", a.id):
        sys.exit("id must be lowercase letters and digits joined by single hyphens")
    folder = PAPERS / a.id
    if folder.exists():
        sys.exit(f"{folder} already exists")
    registry = PAPERS / "papers.js"
    reg = registry.read_text(encoding="utf-8")
    var = re.sub(r"-(\w)", lambda m: m.group(1).upper(), a.id)
    if not var[0].isalpha():
        var = "p" + var.capitalize()
    if f"./{a.id}/paper.js" in reg:
        sys.exit(f"{a.id} is already registered in papers.js")

    short = a.short or a.title
    meta = {
        "id": a.id, "title": a.title, "short": short, "authors": a.authors, "year": a.year,
        "journal": a.journal, "abs": a.url, "pdf": a.pdf or a.url, "doi": a.doi, "summary": a.summary,
    }
    js = ["// One paper's notes: its metadata and its sections, in reading order.",
          "// Page numbers are pages of the PDF linked below, so \"Paper, page N\" links open it at the right place.",
          "", "export default {"]
    js += [f"  {k}: {json.dumps(v, ensure_ascii=False)}," for k, v in meta.items()]
    js += ["  chapters: [",
           "    {",
           '      n: "I", slug: "01-introduction", title: "Introduction", page: 1,',
           '      blurb: "One sentence on what this section explains.",',
           "    },",
           "  ],", "};", ""]

    (folder / "chapters").mkdir(parents=True)
    (folder / "paper.js").write_text("\n".join(js), encoding="utf-8")
    (folder / "acronyms.json").write_text("[]\n", encoding="utf-8")

    t = html.escape
    links = f'<a href="{t(a.url)}">paper</a>' + (f', <a href="{t(a.doi)}">DOI</a>' if a.doi else "")
    home = f"""{head(f"{a.title} | Immuno-Physics Notes", f"Section-by-section notes on {a.title}.", "../../")}
<body data-paper="{a.id}" data-page="paper">
<main id="content">

<section class="hero paper-hero">
<h1>{t(a.title)}</h1>
<p class="byline">{t(a.authors)}. {t(a.journal)}. {links}.</p>
<p class="sub">{t(a.summary)}</p>
</section>

<div class="home-body">
<h2>How to read these notes</h2>
<p>Each page follows one section of the paper and explains its arguments, numbers and equations in plain terms; every part names the page of the PDF it covers. Underlined abbreviations open a short definition, and the <a href="../../glossary.html?paper={a.id}">glossary</a> lists all of them.</p>

<h2 id="contents">Contents</h2>
<ol class="toc-list" id="toc-list"></ol>
</div>

</main>
</body>
</html>
"""
    (folder / "index.html").write_text(home, encoding="utf-8")

    chapter = f"""{head(f"I. Introduction | Immuno-Physics Notes", f"Notes on the introduction of {a.title}.", "../../../")}
<body data-paper="{a.id}" data-chapter="01-introduction">
<main id="content">
<article class="chapter">

<header class="chapter-head">
<h1><span class="numeral">Section I</span> Introduction</h1>
<p class="lede">Two or three sentences on the question this part of the paper answers.</p>
</header>

<section id="overview" data-part="A" data-page="1">
<h2>A first part</h2>
<p>Explain the idea directly, in your own words. Inline maths uses \\( k_{{\\rm on}} \\); display maths goes in a div:</p>
<div class="equation">\\[ K_D = k_{{\\rm off}} / k_{{\\rm on}} \\]</div>
</section>

<section class="in-short" id="in-short">
<h2>In short</h2>
<p>One paragraph that sums up the section.</p>
</section>

</article>
</main>
</body>
</html>
"""
    (folder / "chapters" / "01-introduction.html").write_text(chapter, encoding="utf-8")

    imports = re.findall(r'^import .*? from "\./[^"]+/paper\.js";$', reg, flags=re.M)
    if not imports:
        sys.exit("could not find the import lines in papers.js; add the paper by hand")
    last = imports[-1]
    reg = reg.replace(last, last + f'\nimport {var} from "./{a.id}/paper.js";', 1)
    m = re.search(r"export const PAPERS = \[(.*?)\];", reg, flags=re.S)
    if not m:
        sys.exit("could not find PAPERS in papers.js; add the paper by hand")
    items = [x.strip() for x in m.group(1).split(",") if x.strip()]
    reg = reg.replace(m.group(0), "export const PAPERS = [" + ", ".join(items + [var]) + "];", 1)
    registry.write_text(reg, encoding="utf-8")

    print(f"Created {folder.relative_to(ROOT)}/ and registered it in docs/papers/papers.js.")
    print("Next: fill in paper.js (sections and PDF pages), write each chapter page, add abbreviations to acronyms.json,")
    print("then run python3 tools/check.py.")


if __name__ == "__main__":
    main()
