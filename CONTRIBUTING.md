# Writing notes on a paper

Each paper has a folder, `docs/papers/<id>/`, with one page per section of the paper. Start a new paper with `tools/new_paper.py` (see the README). For tone, length and markup, use `docs/papers/quantitative-immunology/chapters/02-physical-chemistry.html` as the model.

## Explain the ideas, not the paper

The notes should read like good lecture notes on the science, not like a report about a document.

- **State ideas directly.** Write "Diffusion caps association at about 10⁹ M⁻¹s⁻¹", not "The authors show that diffusion caps…".
- **No narration about the paper.** Avoid "the paper", "the authors", "the review", "this section", "the introduction" and "Section IV". Each part's heading already links to the page of the PDF it covers, and that link is the reference to the text.
- **Credit specific results by name.** Write "Mason argued…" or "Perelson and colleagues fitted…". That cites the literature.
- **Keep the epistemic status.** A proposal stays a proposal ("One proposal is…"), and an estimate stays an estimate. Never turn a hedge into a fact, and never add one.
- **Link related topics, not section numbers.** For example `<a href="03-antigen-discrimination.html">kinetic proofreading</a>`, used sparingly.

## New writing only

Most papers are not licensed for republication, so the notes **explain** a paper in fresh words and never reproduce it.

- **Write every sentence yourself.** Don't paraphrase sentence by sentence or keep the paper's structure with a few words swapped. Read a paragraph, close it, and say what it argues.
- **Facts are free to use.** Equations, numbers, model definitions and the names of people and methods are facts. Keep the paper's notation so readers can move between the two texts.
- **Quote rarely.** Quote only when the wording itself matters, in a `<blockquote>` with a `<cite>`, under about 40 words, and at most once per page.
- **No copied figures.** Don't copy or redraw the paper's figures; plates (interactive models) take their place. To point at a figure, use a short link: `(<a href="…pdf#page=22">figure on page 22</a>)`.
- **Check for copied text.** `python3 tools/check.py --source <id>=<path to the LaTeX source>` flags any run of nine or more words shared with the paper. Rewrite each one it finds.

## Faithful to the paper

- **Every claim must have a source.** Every claim, number and equation must come from the paper, or be standard background a reader needs and that any textbook would support. Keep background brief.
- **Cover everything, in order.** Cover every subsection in the paper's order, using its letters (A, B, C, …) as the `data-part` of each `<section>`. You may compress, but you may not drop a result or a caveat.
- **Misprints.** When the printed paper has an evident misprint, follow the version its own derivation or surrounding text supports, and add one short note: `<p class="aside"><b>Note on the printed text.</b> …</p>`. These notes are the one place where the paper itself is discussed.

## Style

- **Spelling.** Use American spelling for papers that use it, matching their terms ("signaling", "tumor", "behavior").
- **Audience.** Write for a physicist who knows little immunology: define biological terms in passing the first time they appear on a page.
- **Paragraphs and headings.** Prefer short paragraphs that each make one point. Use `<h3>` for the paper's numbered sub-subsections.
- **Abbreviations.** Write them as the paper does (TCR, pMHC, IL-2). Every abbreviation listed in the paper's `acronyms.json` becomes a clickable definition. `tools/check.py` warns about any that are missing. An entry has:
  - `key`;
  - `expansion`;
  - a one-line `description` in your own words;
  - `source`: `"paper"` if the paper spells it out, otherwise `"standard"`.
- **Maths.** Use MathJax: `\( ... \)` inline, and `<div class="equation">\[ ... \]</div>` for display. Shared macros such as `\kon`, `\koff`, `\KD`, `\kBT` and `\Pgen` are defined in `docs/assets/js/mathjax-config.js`. Don't use `$`. Split very long inline formulas at an `=` sign so they can wrap on phones.
- **Ending.** End each page with `<section class="in-short" id="in-short"><h2>In short</h2>…</section>`: one paragraph, no bullets.

## Markup skeleton

```html
<body data-paper="quantitative-immunology" data-chapter="03-antigen-discrimination">
<main id="content">
<article class="chapter">
<header class="chapter-head">
<h1><span class="numeral">Section III</span> Antigen discrimination</h1>
<p class="lede">Two or three sentences on the question and the answer.</p>
</header>
<p>Opening paragraphs.</p>
<section id="t-cells" data-part="A" data-page="9">
<h2>T cells</h2>
<h3>Kinetic proofreading</h3>
…
<figure class="plate" data-anim="proofreading">…</figure>
</section>
…
<section class="in-short" id="in-short"><h2>In short</h2><p>…</p></section>
</article>
</main>
</body>
```

`data-page` is the page of the PDF where the subsection starts. Each section must also be listed, with its `slug` and starting page, in the paper's `paper.js`. `site.js` adds the paper menu, the contents rail, the part letters, the links to the paper and the previous/next pager, so don't write them by hand. Copy the `<head>` from an existing page of the same paper, changing only the `<title>` and `<meta name="description">`.

Plates are shared between papers and documented in `docs/assets/js/anim/README.md`.
