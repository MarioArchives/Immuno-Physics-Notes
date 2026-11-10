# Immuno-Physics Notes

Study notes on papers where physics meets immunology. The site is published with GitHub Pages and has no build step. Each paper gets:

- **Section-by-section notes.** Every section is explained in plain terms with its key equations, and each part links to the page of the paper it covers.
- **Clickable abbreviations.** Every TCR, pMHC or IL-2 opens a short definition, and each paper has a searchable glossary.
- **Live models.** Small simulations of the models in the text run in the page, and you can change their parameters.

A **paper menu** in the header switches between papers, and the home page lists them all.

Papers so far:

- *Quantitative Immunology for Physicists*, Altan-Bonnet, Mora and Walczak, Physics Reports 849 (2020).
- *How a well-adapted immune system is organized*, Mayer, Balasubramanian, Mora and Walczak, PNAS 112 (2015).

Once published, the site is at **https://marioarchives.github.io/Immuno-Physics-Notes/**.

## Read it locally

```sh
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000>. A web server is needed because the pages load JavaScript modules and JSON; opening the files straight from disk will not work. MathJax and the fonts come from CDNs, so the first load needs a network connection.

## Add a paper

```sh
python3 tools/new_paper.py t-cell-activation \
  --title "A Paper on T Cell Activation" --short "T cell activation" \
  --authors "A. Author and B. Author" --year 2021 \
  --journal "Physical Review X 11, 011001 (2021)" \
  --url https://arxiv.org/abs/XXXX.XXXXX --pdf https://arxiv.org/pdf/XXXX.XXXXX
```

This creates `docs/papers/t-cell-activation/` and adds the paper to the menu. The folder holds:

- `paper.js`: the paper's details and its list of sections, with the PDF page where each starts;
- `index.html`: the paper's home page;
- `acronyms.json`: its glossary;
- `chapters/01-introduction.html`: a first section page to copy for the others.

Two optional fields in `paper.js` handle papers that differ from the first one:

- `numbered: false` for a paper whose sections have no numbers. The notes then number their parts 1, 2, 3…, and each page says which pages it covers instead of "Section N of the paper".
- `pdfName: "preprint"` when the page links open something other than the published paper, such as a free arXiv version. The links then read "Preprint, page N".

Write the notes following [CONTRIBUTING.md](CONTRIBUTING.md), then run the checks.

## Publish on GitHub Pages

1. Push this repository to GitHub.
2. In the repository's **Settings, Pages**, set **Source** to **GitHub Actions**.

Every push to `main` then runs `.github/workflows/pages.yml`, which deploys `docs/` once `tools/check.py` passes. Alternatively, set Source to **Deploy from a branch** with branch `main` and folder `/docs`, which skips the checks.

## Layout

```
docs/                                 the website, served as is
  index.html                          home page: the list of papers
  glossary.html                       abbreviations of one paper (?paper=<id>), searchable
  papers/papers.js                    registry of papers: the paper menu reads it
  papers/<id>/paper.js                one paper's details and sections
  papers/<id>/index.html              the paper's home page and contents
  papers/<id>/acronyms.json           the paper's abbreviations
  papers/<id>/chapters/NN-name.html   one page per section
  assets/css/site.css                 all styling, light and dark themes
  assets/js/site.js                   masthead and paper menu, contents rail, pager, theme switch, lazy plates
  assets/js/acronyms.js               wraps abbreviations and shows their definitions
  assets/js/mathjax-config.js         MathJax setup and shared TeX macros
  assets/js/kit.js                    toolkit for the interactive plates
  assets/js/anim/*.js                 one module per plate, shared by all papers (see anim/README.md)
tools/check.py                        checks structure, links, plates, abbreviations and copied text
tools/new_paper.py                    starts notes on a new paper
CONTRIBUTING.md                       how notes are written
```

## Checks

```sh
python3 tools/check.py
python3 tools/check.py --source quantitative-immunology=path/to/main.tex   # also flags runs of 9+ words copied from that paper's LaTeX
```

Papers' LaTeX sources are available from arXiv but are not part of this repository.

## About the text

The papers discussed here are generally not licensed for republication. The notes therefore explain each paper in new words, keep the equations and numbers (which are facts), and link to the original for everything else. They contain none of the papers' prose or figures.

The site's own text, code and data are released under the MIT licence (see [LICENSE](LICENSE)).
