// Two individuals, one world (well-adapted immune system, cross-reactivity and sparse repertoires).
// A smooth random landscape Q (fluctuations on scales larger than sigma: power spectrum 1/(1 + (10 q sigma)^2),
// coefficient of variation 0.5) is perceived by two people as Q e^{eps z1} and Q e^{eps z2}, with z1, z2 independent
// standard normal noise at each site. Both optimal repertoires (cost F(m) = m, Gaussian cross-reactivity) are computed
// live on a ring of 512 sites spaced 0.05 sigma. Overlaps are cosine similarities, between 0 and 1.
import * as kit from "../kit.js";
import { makeGrid, gaussian, landscape, costFamily, optimiser, normalise, overlap } from "./repertoire-model.js";

const N = 512, DX = 0.05;
const COST = costFamily("power", 1);

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.72 : 1.6), minHeight: 380, maxHeight: 620,
    label: "Three stacked charts along the same shape space. Top: the antigen landscapes perceived by two individuals. Middle: their optimal receptor repertoires, one drawn upward and one downward, made of peaks at different places. Bottom: the coverage each repertoire provides, nearly identical.",
  });
  const { ctx } = st;
  const grid = makeGrid(N, 1, DX);
  const khat = grid.kernel(gaussian);
  const s = { eps: 0.2, seed: 2, done: false };
  let Q, z1, z2, Q1, Q2, o1, o2;

  function world() {
    const R = kit.rng(500 + s.seed);
    Q = landscape(grid, R, 0.5, (q) => 1 / (1 + (10 * q) ** 2));
    z1 = Float64Array.from({ length: N }, () => R.normal());
    z2 = Float64Array.from({ length: N }, () => R.normal());
  }
  function perceive(warm) {
    Q1 = normalise(Float64Array.from(Q, (v, i) => v * Math.exp(s.eps * z1[i])));
    Q2 = normalise(Float64Array.from(Q, (v, i) => v * Math.exp(s.eps * z2[i])));
    o1 = optimiser(grid, khat, Q1, COST, warm && o1 ? o1.P : null);
    o2 = optimiser(grid, khat, Q2, COST, warm && o2 ? o2.P : null);
    s.done = false;
  }

  function step() {
    if (s.done) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 8) {
      o1.iterate(4); o2.iterate(4);
      if ((o1.gap < 1e-7 && o2.gap < 1e-7) || o1.iterations >= 30000) { s.done = true; break; }
    }
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    const narrow = st.narrow;
    const left = narrow ? 46 : 58, right = 14, gap = 30, top0 = 48, foot = 40;
    const H = st.h - top0 - foot - 2 * gap;
    const rects = [0.27, 0.46, 0.27].reduce((acc, f, k) => {
      const y = k ? acc[k - 1].y + acc[k - 1].h + gap : top0;
      acc.push({ x: left, y, w: st.w - left - right, h: Math.round(H * f) });
      return acc;
    }, []);
    const L = N * DX, xs = (i) => (i + 0.5) * DX;
    const one = c.blue, two = c.pink;

    // perceived landscapes
    let qm = 0; for (let i = 0; i < N; i++) qm = Math.max(qm, Q1[i] * N, Q2[i] * N);
    const A = kit.axes(ctx, rects[0], { x: [0, L], y: [0, qm * 1.05], xticks: [], ylabel: "perceived threat Q", grid: false, yticks: [0, 1, 2, 3].filter((v) => v <= qm) });
    ctx.save(); A.clip();
    kit.line(ctx, Array.from(Q2, (v, i) => [xs(i), v * N]), A, { color: kit.alpha(two, 0.75), width: 1 });
    kit.line(ctx, Array.from(Q1, (v, i) => [xs(i), v * N]), A, { color: kit.alpha(one, 0.75), width: 1 });
    ctx.restore();
    kit.legend(ctx, [{ label: "person 1", color: one }, { label: "person 2", color: two }], rects[0].x - 30, rects[0].y - 34);

    // mirrored repertoires
    let pm = 0; for (let i = 0; i < N; i++) pm = Math.max(pm, o1.P[i], o2.P[i]);
    const B = kit.axes(ctx, rects[1], { x: [0, L], y: [-pm * 1.05, pm * 1.05], xticks: [], yticks: [0], yfmt: () => "", ylabel: "optimal repertoires, 1 up and 2 down", grid: false });
    ctx.save(); B.clip();
    ctx.strokeStyle = c.rule; ctx.beginPath(); ctx.moveTo(rects[1].x, B.Y(0)); ctx.lineTo(rects[1].x + rects[1].w, B.Y(0)); ctx.stroke();
    const bw = Math.max(1.5, rects[1].w / N);
    ctx.lineWidth = bw;
    for (const [o, col, sgn] of [[o1, one, 1], [o2, two, -1]]) {
      ctx.strokeStyle = col; ctx.beginPath();
      for (let i = 0; i < N; i++) {
        if (o.P[i] < pm * 2e-3) continue;
        const x = B.X(xs(i));
        ctx.moveTo(x, B.Y(0)); ctx.lineTo(x, B.Y(sgn * o.P[i]));
      }
      ctx.stroke();
    }
    ctx.restore();

    // coverages
    let cm = 0, mean1 = 0; for (let i = 0; i < N; i++) { cm = Math.max(cm, o1.Pt[i], o2.Pt[i]); mean1 += o1.Pt[i] / N; }
    const C = kit.axes(ctx, rects[2], {
      x: [0, L], y: [0, (cm / mean1) * 1.1], ylabel: "coverage P̃, relative", yticks: [0, 1], grid: false,
      xlabel: narrow ? "shape space, in units of σ" : "position in shape space, in units of the cross-reactivity width σ",
    });
    ctx.save(); C.clip();
    kit.line(ctx, Array.from(o1.Pt, (v, i) => [xs(i), v / mean1]), C, { color: one, width: 2.2 });
    kit.line(ctx, Array.from(o2.Pt, (v, i) => [xs(i), v / mean1]), C, { color: two, width: 2, dash: [6, 4] });
    ctx.restore();

    if (!ro) return;
    ro.q.set(overlap(Q1, Q2).toFixed(3));
    ro.p.set(overlap(o1.P, o2.P).toFixed(3));
    ro.c.set(overlap(o1.Pt, o2.Pt).toFixed(3));
    ro.st.set(s.done ? "optimal" : `${o1.iterations.toLocaleString("en-US")} iterations`);
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  world(); perceive(false);
  const loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "New world", onClick: () => { s.seed++; world(); perceive(false); loop.play(); loop.redraw(); } });
  ui.slider({ label: "Perception noise ε", min: 0, max: 0.5, step: 0.01, value: s.eps, format: (v) => v.toFixed(2),
    onInput: (v) => { s.eps = v; perceive(true); loop.play(); loop.redraw(); } });
  ro = {
    q: ui.readout({ label: "Overlap of landscapes" }), p: ui.readout({ label: "of repertoires" }),
    c: ui.readout({ label: "of coverages" }), st: ui.readout({ label: "Status" }),
  };
  st.onResize(() => loop.redraw());
  loop.redraw();
}
