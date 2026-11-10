# Plates: the interactive models

A plate is a small simulation embedded in a chapter. Each one lives in `docs/assets/js/anim/<name>.js`, and the page refers to it by name:

```html
<figure class="plate" data-anim="binding">
  <div class="plate-stage"></div>
  <div class="plate-controls"></div>
  <figcaption><b class="plate-title">Collisions versus bindings.</b> What it shows, what to try, and how it connects to the text.</figcaption>
</figure>
```

`site.js` imports the module when the plate comes near the viewport and calls its default export with the `<figure>`. If the module throws, the plate shows an error message instead. Optional `data-*` attributes on the figure can select variants (see `binding.js`, which has a `data-variant="hero"` mode for the home page).

Code shared by several plates can sit beside them as a module that is not itself a plate: `vdj-model.js` (a toy recombination model) and `repertoire-model.js` (periodic shape spaces, FFT convolution, random antigen landscapes, the cost families and the projected-gradient optimizer behind the optimal-repertoire plates).

## Module shape

```js
import * as kit from "../kit.js";

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), { aspect: (w) => (w < 560 ? 1 : 2.2), label: "Text alternative for screen readers" });
  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const state = { /* model parameters and variables */ };

  function step(dt) { /* advance the model by dt seconds of wall time */ }
  function draw() { st.clear(); /* render with st.ctx in CSS pixels, colours from kit.colors */ }

  const loop = kit.animate(plate, { step, draw, ui });     // adds Play/Pause, pauses off-screen, respects reduced motion
  ui.slider({ label: "Division rate", min: 0.1, max: 2, value: 1, format: (v) => v.toFixed(1) + " per day", onInput: (v) => { state.b = v; loop.redraw(); } });
  ui.button({ label: "Reset", onClick: () => { reset(); loop.redraw(); } });
  const r = ui.readout({ label: "Clones" });               // r.set("1,204") inside draw()
  st.onResize(() => loop.redraw());
}
```

A plate with no time evolution (a calculator or a static chart that responds to sliders) can skip `kit.animate` and redraw from its control callbacks, plus `st.onResize` and `kit.onThemeChange`.

## kit.js reference

| Function | What it does |
|---|---|
| `stage(host, { aspect, minHeight, maxHeight, label })` | HiDPI canvas filling `host`. `aspect` is width/height, or a function of the CSS width so phones can get a taller layout. Returns `{ canvas, ctx, w, h, narrow, onResize(fn), clear(color) }`. Draw in CSS pixels. |
| `controls(host)` | Builder with `slider({ label, min, max, step, value, log, format, onInput })`, `button({ label, onClick, primary })`, `toggle({ label, value, onChange })`, `select({ label, options, value, onChange })` and `readout({ label })`. Every control is a real, labelled form element. |
| `animate(plate, { step, draw, ui, autoplay })` | Runs `step(dt)` and `draw()` each frame while the plate is visible and playing. `dt` is in seconds, at most 0.05. With `prefers-reduced-motion` it starts paused, so `draw()` must produce a meaningful still frame. Returns `{ play, pause, toggle, playing, redraw }`. |
| `colors` | Theme colours, refreshed in place when the theme changes: `bg, paper, ink, muted, rule, grid, blue, blueSoft, brown, brownSoft, pink, teal, gold`, plus `series` (five categorical colours). Read them at draw time; never hard-code hex values. |
| `alpha(color, a)` | Theme colour with transparency. |
| `onThemeChange(fn)` | Run `fn` after a light/dark switch. `animate` already redraws. |
| `rng(seed)` | Seeded generator: `random, normal, exp(rate), int(n), poisson(lam), binomial(n, p), pick(arr), reseed(s)`. Use a fixed seed so the first frame is reproducible. |
| `axes(ctx, rect, { x, y, xlog, ylog, xlabel, ylabel, xticks, yticks, xfmt, yfmt, grid })` | Draws axes and returns `{ X, Y, r, clip }` mapping data to pixels. |
| `line(ctx, pts, A, { color, width, dash })` | Polyline through `[[x, y], ...]`. |
| `legend(ctx, items, x, y)` | One-row legend of `{ label, color, dash }`. |
| `label(ctx, text, x, y, opts)`, `font(px, weight)` | Text in the site's UI face. |
| `fmtNum(v)`, `pow10(e)`, `niceTicks(min, max, n)` | Number formatting: `2.4×10⁻⁴`, `10⁵`, round tick positions. |
| `css(id, text)` | Inject a plate's own CSS once, using the theme custom properties (`var(--hema)` and so on). |

## Conventions

- **Faithful to the paper.** The model is the one the section describes, with its equations and parameter ranges. Where the plate simplifies, the caption says how. Don't invent results; let the reader discover what the text claims.
- **One idea per plate.** The caption names the idea, says what to try ("raise the barrier to six kT and…"), and ties the outcome back to the text.
- **Colour roles.** Blue (hematoxylin) for the main actors or the main curve, brown (DAB) for ligands or a second population, pink (eosin) for events and highlights, teal and gold for further series. Text and axes use `ink` and `muted`.
- **Phones.** Test at 360 px wide: use `st.narrow` or an `aspect` function to stack panels vertically, and keep labels at 11 px or more.
- **Performance.** Keep each frame under about 4 ms. Cap the number of agents and sub-steps, and prefer typed arrays for large populations.
- **No dependencies.** Plain ES modules, no build step, no external libraries.
- **Accessibility.** Give the canvas a `label` that describes what is drawn. Interactive pieces that the reader clicks (such as the numbered key in `scales.js`) should be DOM buttons, not canvas hit-tests.
