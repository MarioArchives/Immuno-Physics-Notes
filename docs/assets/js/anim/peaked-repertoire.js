// Optimal repertoires with cross-reactivity (well-adapted immune system, cross-reactivity and sparse repertoires).
// Direct minimization of <F> = sum_a Q_a / Pt_a (cost F(m) = m) over the simplex, with Gaussian cross-reactivity of
// width sigma, on a random log-normal landscape Q of coefficient of variation kappa. Shape space is a ring (1D,
// 256 sites, spacing 0.1 sigma) or a torus (2D, 64 x 64 sites, spacing 0.25 sigma); periodic, so there are no edges.
// The optimizer (accelerated projected gradient) runs live from a uniform start.
// In 2D the power spectrum S(q) = |sum_r P_r e^{iqr}|^2 / sum_r P_r^2 is averaged over directions; peaks placed at
// random would give S = 1 at every q.
import * as kit from "../kit.js";
import { makeGrid, gaussian, landscape, costFamily, optimiser, countPeaks } from "./repertoire-model.js";

const CFG = { 1: { nx: 256, ny: 1, dx: 0.1 }, 2: { nx: 64, ny: 64, dx: 0.25 } };
const COST = costFamily("power", 1);

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.6 : 1.75), minHeight: 340, maxHeight: 640,
    label: "The optimal receptor repertoire for a random antigen landscape, computed live. In one dimension: antigen threats as bars with the repertoire's coverage as a line, and below them the repertoire itself, which breaks into separated peaks. In two dimensions: a map of the landscape with the peaks as disks, and the power spectrum of the peak pattern.",
  });
  const { ctx } = st;
  const s = { dim: 1, kappa: 1, width: 1, seed: 5, done: false };
  let grid, khat, Q, opt, qmap = null, spec = null;

  function build(newLandscape = true) {
    const c = CFG[s.dim];
    grid = makeGrid(c.nx, c.ny, c.dx);
    khat = grid.kernel((d) => gaussian(d / s.width));
    if (newLandscape || !Q || Q.length !== grid.n) Q = landscape(grid, kit.rng(1000 * s.dim + s.seed), s.kappa);
    opt = optimiser(grid, khat, Q, COST);
    s.done = false;
    qmap = null;
  }

  function step() {
    if (s.done) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 7) {
      opt.iterate(s.dim === 1 ? 5 : 1);
      if (opt.gap < 1e-7 || opt.iterations >= 40000) { s.done = true; break; }
    }
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    if (s.dim === 1) draw1D(c); else draw2D(c);
    if (!ro) return;
    const peaks = countPeaks(grid, opt.P);
    const L = grid.nx * grid.dx;
    const spacing = s.dim === 1 ? L / peaks : Math.sqrt((L * grid.ny * grid.dx) / peaks);
    ro.it.set(opt.iterations.toLocaleString("en-US") + (s.done ? ", done" : ""));
    ro.gap.set(isFinite(opt.gap) ? kit.fmtNum(opt.gap, 1) : "—");
    ro.pk.set(String(peaks));
    ro.sp.set(`${(spacing / s.width).toFixed(2)} σ`);
  }

  function draw1D(c) {
    const narrow = st.narrow;
    const left = narrow ? 46 : 58, right = 14, gap = 58;
    const L = grid.nx * grid.dx;
    const topH = Math.round((st.h - 52 - gap - 44) * 0.45);
    const top = { x: left, y: 52, w: st.w - left - right, h: topH };
    const bot = { x: left, y: top.y + top.h + gap, w: top.w, h: st.h - (top.y + top.h + gap) - 44 };
    const n = grid.n, xs = (i) => i * grid.dx;

    // threats and coverage, both relative to their average
    let qmax = 0; for (const v of Q) qmax = Math.max(qmax, v * n);
    let ptMean = 0; for (const v of opt.Pt) ptMean += v / n;
    const ymax = Math.min(Math.max(3, qmax * 1.05), 12);
    const A = kit.axes(ctx, top, {
      x: [0, L], y: [0, ymax], xticks: [], ylabel: "relative to the average", grid: true,
    });
    ctx.save(); A.clip();
    ctx.fillStyle = kit.alpha(c.brown, 0.55);
    const bw = Math.max(1, top.w / n - 0.4);
    for (let i = 0; i < n; i++) { const y = A.Y(Math.min(Q[i] * n, ymax)); ctx.fillRect(A.X(xs(i)), y, bw, A.Y(0) - y); }
    const cov = []; for (let i = 0; i < n; i++) cov.push([xs(i) + grid.dx / 2, opt.Pt[i] / ptMean]);
    kit.line(ctx, cov, A, { color: c.teal, width: 2.4 });
    ctx.restore();
    kit.legend(ctx, [{ label: "threat Q", color: kit.alpha(c.brown, 0.8) }, { label: "coverage P̃", color: c.teal }], top.x - 30, top.y - 38);

    // repertoire
    let pmax = 0; for (const v of opt.P) pmax = Math.max(pmax, v);
    const B = kit.axes(ctx, bot, {
      x: [0, L], y: [0, Math.max(pmax * 1.1, 2 / n)], yfmt: (v) => `${+(v * 100).toPrecision(2)}%`,
      xlabel: narrow ? "position in shape space" : "position in shape space (the pink bar is the cross-reactivity width σ)", xfmt: () => "",
      ylabel: "repertoire share P_r", xticks: kit.niceTicks(0, L, narrow ? 4 : 8).filter((v) => v <= L),
    });
    ctx.save(); B.clip();
    ctx.strokeStyle = c.blue; ctx.lineWidth = Math.max(1.5, bw);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (opt.P[i] <= pmax * 1e-3) continue;
      const x = B.X(xs(i)) + bw / 2;
      ctx.moveTo(x, B.Y(0)); ctx.lineTo(x, B.Y(opt.P[i]));
    }
    ctx.stroke();
    // cross-reactivity scale bar
    const x0 = bot.x + 10, y0 = bot.y + 12, wpx = (B.X(s.width) - B.X(0));
    ctx.strokeStyle = c.pink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + wpx, y0); ctx.moveTo(x0, y0 - 4); ctx.lineTo(x0, y0 + 4); ctx.moveTo(x0 + wpx, y0 - 4); ctx.lineTo(x0 + wpx, y0 + 4); ctx.stroke();
    ctx.restore();
    kit.label(ctx, "σ", x0 + wpx + 6, y0 + 4, { color: c.pink, size: 12 });
  }

  function draw2D(c) {
    const narrow = st.narrow;
    const L = grid.nx * grid.dx;
    let map, chart;
    if (narrow) {
      const side = Math.min(st.w - 24, st.h * 0.5);
      map = { x: (st.w - side) / 2, y: 40, w: side, h: side };
      chart = { x: 52, y: map.y + side + 78, w: st.w - 66, h: st.h - (map.y + side + 78) - 44 };
    } else {
      const side = st.h - 64;
      map = { x: 18, y: 40, w: side, h: side };
      chart = { x: map.x + side + 70, y: 40, w: st.w - (map.x + side + 70) - 16, h: side - 28 };
    }
    // landscape, cached as an image
    if (!qmap) {
      qmap = document.createElement("canvas"); qmap.width = grid.nx; qmap.height = grid.ny;
      const g = qmap.getContext("2d");
      let qm = 0; for (const v of Q) qm = Math.max(qm, Math.log(v));
      let ql = Infinity; for (const v of Q) ql = Math.min(ql, Math.log(v));
      for (let i = 0; i < grid.n; i++) {
        const t = (Math.log(Q[i]) - ql) / (qm - ql || 1);
        g.fillStyle = kit.alpha(c.brown, 0.04 + 0.8 * t * t);
        g.fillRect(i % grid.nx, (i / grid.nx) | 0, 1, 1);
      }
    }
    ctx.save();
    ctx.fillStyle = c.paper; ctx.fillRect(map.x, map.y, map.w, map.h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(qmap, map.x, map.y, map.w, map.h);
    ctx.strokeStyle = c.rule; ctx.strokeRect(map.x + 0.5, map.y + 0.5, map.w - 1, map.h - 1);
    let pmax = 0; for (const v of opt.P) pmax = Math.max(pmax, v);
    const cell = map.w / grid.nx;
    ctx.fillStyle = c.blue;
    for (let i = 0; i < grid.n; i++) {
      const v = opt.P[i];
      if (v < pmax * 0.02) continue;
      const r = Math.sqrt(v / pmax) * cell * 1.7;
      ctx.beginPath(); ctx.arc(map.x + ((i % grid.nx) + 0.5) * cell, map.y + (((i / grid.nx) | 0) + 0.5) * cell, r, 0, 7); ctx.fill();
    }
    ctx.restore();
    const wpx = (s.width / L) * map.w;
    ctx.strokeStyle = c.pink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(map.x, map.y - 10); ctx.lineTo(map.x + wpx, map.y - 10); ctx.stroke();
    kit.label(ctx, "σ  (threat: darker brown is more frequent)", map.x + wpx + 6, map.y - 6, { color: c.muted, size: 11 });

    // power spectrum, averaged over directions
    if (!spec || spec.it !== opt.iterations) {
      const pw = grid.power(opt.P);
      let s2 = 0; for (const v of opt.P) s2 += v * v;
      const dq = (2 * Math.PI) / L, nb = 26, sum = new Float64Array(nb), cnt = new Float64Array(nb);
      for (let i = 1; i < grid.n; i++) {
        const b = Math.round(grid.qOf(i) / dq);
        if (b >= 1 && b <= nb) { sum[b - 1] += pw[i] / s2; cnt[b - 1]++; }
      }
      spec = { it: opt.iterations, pts: [...sum].map((v, k) => [(k + 1) * dq * s.width, cnt[k] ? v / cnt[k] : NaN]).filter((p) => isFinite(p[1])) };
    }
    const qmax = spec.pts.length ? spec.pts[spec.pts.length - 1][0] : 10;
    const ys = spec.pts.map((p) => p[1]).filter((v) => v > 0);
    const ylo = Math.max(1e-4, 10 ** Math.floor(Math.log10(Math.min(...ys, 0.5))));
    const C = kit.axes(ctx, chart, {
      x: [0, qmax], y: [ylo, 10], ylog: true,
      xlabel: narrow ? "wave number q, in 1/σ" : "wave number |q|, in units of 1/σ", ylabel: "power spectrum S(q)",
    });
    ctx.save(); C.clip();
    kit.line(ctx, [[0, 1], [qmax, 1]], C, { color: c.muted, width: 1.4, dash: [5, 5] });
    kit.line(ctx, spec.pts.map(([q, v]) => [q, Math.max(v, ylo)]), C, { color: c.blue, width: 2.2 });
    for (const [q, v] of spec.pts) { ctx.fillStyle = c.blue; ctx.beginPath(); ctx.arc(C.X(q), C.Y(Math.max(v, ylo)), 2.6, 0, 7); ctx.fill(); }
    ctx.restore();
    kit.legend(ctx, [{ label: "optimal peaks", color: c.blue }, { label: "peaks at random", color: c.muted, dash: [5, 5] }], narrow ? 10 : chart.x + 12, narrow ? chart.y - 40 : chart.y + 12);
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  build();
  const loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "New landscape", onClick: () => { s.seed++; build(true); loop.play(); loop.redraw(); } });
  ui.button({ label: "Restart from uniform", onClick: () => { build(false); loop.play(); loop.redraw(); } });
  ui.select({ label: "Shape space", options: [{ value: "1", label: "one dimension (ring)" }, { value: "2", label: "two dimensions (torus)" }], value: "1",
    onChange: (v) => { s.dim = +v; build(true); loop.play(); loop.redraw(); } });
  ui.slider({ label: "Heterogeneity of threats κ", min: 0.1, max: 2, step: 0.05, value: s.kappa, format: (v) => v.toFixed(2),
    onInput: (v) => { s.kappa = v; build(true); loop.redraw(); } });
  ui.slider({ label: "Cross-reactivity width σ (relative)", min: 0.5, max: 2, step: 0.05, value: s.width, format: (v) => `×${v.toFixed(2)}`,
    onInput: (v) => { s.width = v; build(false); loop.redraw(); } });
  ro = {
    it: ui.readout({ label: "Iterations" }), gap: ui.readout({ label: "Distance to optimum, at most" }),
    pk: ui.readout({ label: "Peaks" }), sp: ui.readout({ label: "Mean spacing" }),
  };
  kit.onThemeChange(() => { qmap = null; loop.redraw(); });
  st.onResize(() => loop.redraw());
  loop.redraw();
}
