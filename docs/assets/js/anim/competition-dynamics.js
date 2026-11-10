// Reaching the optimum by competition (well-adapted immune system).
// Clone sizes N_r on a ring of 128 sites (spacing 0.2 sigma) follow
//   dN_r/dt = N_r [ sum_a Q_a A(Nt_a) f(r - a) - d ],   Nt_a = sum_r N_r f(r - a),   A(N) = 1 / (1 + N/N0)^2,
// the availability matched to the saturating cost F(m) = 1 - e^{-beta m}: A = -c' Fbar'(Nt / N_st) with c' = beta and
// N0 = beta N_st. Sizes are in units of N_st. The death rate is set to d = beta lambda*, where lambda* is the Lagrange
// multiplier of the directly minimized cost, so that the fixed point holds exactly N_st cells. Time is in cell
// lifetimes 1/d, shown on a logarithmic axis from 0.1 to 1,000 lifetimes. "Stochastic" presents one antigen a ~ Q at a time, every 0.005/d (200 per lifetime), and changes every
// clone by N_r dt [A(Nt_a) f(r - a) - d]; "mean field" integrates the averaged equation.
import * as kit from "../kit.js";
import { makeGrid, gaussian, landscape, normalise, costFamily, optimiser, overlap } from "./repertoire-model.js";

const n = 128, DX = 0.2, BETA = 0.014, T0 = 0.1, T1 = 1000, ROWS = 161;

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.62 : 1.45), minHeight: 420, maxHeight: 680,
    label: "Three stacked charts. Top: a space-time picture of the receptor repertoire, with shape space across and time running down, in which a random start fragments into separated clones. Middle: the current repertoire compared with the optimal one, over the antigen landscape. Bottom: the relative gap between the current expected cost and the optimal cost, on a logarithmic scale, against time in cell lifetimes.",
  });
  const { ctx } = st;
  const grid = makeGrid(n, 1, DX);
  const khat = grid.kernel(gaussian);
  const fk = Float64Array.from({ length: n }, (_, k) => gaussian(grid.off(k, n)));
  const cost = costFamily("saturating", BETA);
  const s = { mode: "mean", start: "random", seed: 4, speed: 15, carry: 0 };
  let Q, cumQ, Pstar, Fstar, d, N, t, rows, gaps, done, R, kymo, snaps;
  const Nt = new Float64Array(n), W = new Float64Array(n), G = new Float64Array(n), P = new Float64Array(n), Pt = new Float64Array(n);
  const A = (x) => 1 / (1 + x / BETA) ** 2;

  function newLandscape() {
    Q = landscape(grid, kit.rng(70 + s.seed), 1, (q) => 1 / (1 + (5 * q) ** 2));
    cumQ = new Float64Array(n); let c = 0; for (let i = 0; i < n; i++) { c += Q[i]; cumQ[i] = c; }
    const o = optimiser(grid, khat, Q, cost);
    while (o.iterations < 20000 && o.gap > 1e-9) o.iterate(50);
    Pstar = Float64Array.from(o.P); Fstar = o.cost; d = BETA * o.lambda;
  }
  function restart() {
    R = kit.rng(900 + s.seed * 7 + (s.mode === "stoch" ? 1 : 0));
    if (s.start === "uniform") N = new Float64Array(n).fill(1 / n);
    else {
      const z = grid.filtered(R.normal, (q) => 1 / (1 + (5 * q) ** 2)), sd = Math.sqrt(Math.log(1 + 4)); // coefficient of variation 2
      N = normalise(Float64Array.from(z, (v) => Math.exp(sd * v)));
    }
    t = 0; rows = 0; gaps = []; done = false; snaps = []; s.acc = 0; s.carry = 0;
    kymo = document.createElement("canvas"); kymo.width = n; kymo.height = ROWS;
    record();
  }
  // Row 0 is the start; rows 1 .. ROWS-1 are spaced evenly in log time from T0 to T1 lifetimes.
  const rowTime = (k) => (k === 0 ? 0 : T0 * (T1 / T0) ** ((k - 1) / (ROWS - 2)));

  function costGap() {
    let tot = 0; for (const v of N) tot += v;
    for (let i = 0; i < n; i++) P[i] = N[i] / tot;
    grid.conv(P, khat, Pt);
    let c = 0; for (let i = 0; i < n; i++) c += Q[i] * cost.Fbar(Math.max(Pt[i], 1e-13));
    return { gap: Math.max((c - Fstar) / Fstar, 1e-9), tot };
  }
  function record() {
    const { gap } = costGap();
    gaps.push([t, gap]);
    snaps.push(Float32Array.from(P));
    paintRow(rows);
    rows++;
  }
  function paintRow(k) {
    const g = kymo.getContext("2d");
    const img = g.createImageData(n, 1);
    const [r0, g0, b0] = rgb(kit.colors.blue);
    for (let i = 0; i < n; i++) {
      const a = 1 - Math.exp(-(snaps[k][i] * n) / 3);
      img.data.set([r0, g0, b0, Math.round(255 * a)], 4 * i);
    }
    g.putImageData(img, 0, k);
  }

  function advanceMean(dtL) { // dtL in lifetimes
    let left = dtL / d;
    while (left > 0) {
      grid.conv(N, khat, Nt);
      for (let i = 0; i < n; i++) W[i] = Q[i] * A(Math.max(Nt[i], 0));
      grid.conv(W, khat, G);
      let rmax = 0; for (let i = 0; i < n; i++) rmax = Math.max(rmax, Math.abs(G[i] - d));
      const dt = Math.min(left, 0.2 / d, 0.2 / rmax);
      for (let i = 0; i < n; i++) N[i] *= Math.exp((G[i] - d) * dt);
      left -= dt;
    }
  }
  function advanceStoch(dtL) {
    s.acc = (s.acc || 0) + dtL / 0.005;
    const k = Math.floor(s.acc), Dt = 0.005 / d;
    s.acc -= k;
    for (let j = 0; j < k; j++) {
      const u = R.random();
      let lo = 0, hi = n - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cumQ[m] < u) lo = m + 1; else hi = m; }
      let Na = 0;
      for (let r = 0; r < n; r++) Na += N[r] * fk[(r - lo + n) % n];
      const Aa = A(Na);
      for (let r = 0; r < n; r++) N[r] *= 1 + Dt * (Aa * fk[(r - lo + n) % n] - d);
    }
  }

  function step(dt) {
    if (done) return;
    s.carry += s.speed * dt; // rows of the picture to fill this frame
    const t0 = performance.now();
    while (s.carry >= 1 && !done && performance.now() - t0 < 20) {
      const h = rowTime(rows) - t;
      if (h > 0) { if (s.mode === "mean") advanceMean(h); else advanceStoch(h); t += h; }
      record();
      s.carry -= 1;
      if (rows >= ROWS) done = true;
    }
    s.carry = Math.min(s.carry, 2);
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    const narrow = st.narrow;
    const left = narrow ? 50 : 70, right = 14, top0 = 34, gap = 46, foot = 44;
    const H = st.h - top0 - foot - 2 * gap;
    const kr = { x: left, y: top0, w: st.w - left - right, h: Math.round(H * 0.44) };
    const pr = { x: left, y: kr.y + kr.h + gap - 16, w: kr.w, h: Math.round(H * 0.24) };
    const gr = { x: left, y: pr.y + pr.h + gap + 16, w: kr.w, h: st.h - (pr.y + pr.h + gap + 16) - foot };
    const L = n * DX;
    // log time, with the start (t = 0) drawn at the top edge
    const lt = (x) => (x <= T0 ? 0 : Math.log(x / T0) / Math.log(T1 / T0));
    const tTicks = [0.1, 1, 10, 100, 1000];

    // space-time picture, time running down on a square-root scale
    ctx.fillStyle = c.paper; ctx.fillRect(kr.x, kr.y, kr.w, kr.h);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    const shown = Math.max(rows, 1);
    ctx.drawImage(kymo, 0, 0, n, shown, kr.x, kr.y, kr.w, kr.h * (shown / ROWS));
    ctx.restore();
    ctx.strokeStyle = c.rule; ctx.strokeRect(kr.x + 0.5, kr.y + 0.5, kr.w - 1, kr.h - 1);
    ctx.save();
    ctx.fillStyle = c.muted; ctx.font = kit.font(11, 400); ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (const v of tTicks.slice(1)) { const y = kr.y + (1 / ROWS + lt(v) * (1 - 1 / ROWS)) * kr.h; ctx.fillText(kit.fmtNum(v), kr.x - 6, Math.min(y, kr.y + kr.h - 5)); ctx.fillRect(kr.x - 4, Math.round(y), 4, 1); }
    ctx.fillText("start", kr.x - 6, kr.y + 4);
    ctx.restore();
    kit.label(ctx, narrow ? "time (lifetimes) ↓" : "time, in cell lifetimes ↓ (logarithmic)", kr.x - (narrow ? 46 : 64), kr.y - 12, { size: 12 });

    // current repertoire against the optimum, over the landscape
    let pm = 0; for (let i = 0; i < n; i++) pm = Math.max(pm, P[i], Pstar[i]);
    let qm = 0; for (const v of Q) qm = Math.max(qm, v);
    const B = kit.axes(ctx, { ...pr }, { x: [0, L], y: [0, pm * 1.12], xticks: [], yticks: [0], yfmt: () => "0", grid: false });
    ctx.save(); B.clip();
    ctx.fillStyle = kit.alpha(c.brown, 0.18);
    ctx.beginPath(); ctx.moveTo(B.X(0), B.Y(0));
    for (let i = 0; i < n; i++) ctx.lineTo(B.X((i + 0.5) * DX), B.Y((Q[i] / qm) * pm));
    ctx.lineTo(B.X(L), B.Y(0)); ctx.closePath(); ctx.fill();
    const bw = Math.max(2, (pr.w / n) * 0.7);
    ctx.fillStyle = c.blue;
    for (let i = 0; i < n; i++) if (P[i] > pm * 1e-3) { const x = B.X((i + 0.5) * DX); ctx.fillRect(x - bw / 2, B.Y(P[i]), bw, B.Y(0) - B.Y(P[i])); }
    ctx.fillStyle = c.pink;
    for (let i = 0; i < n; i++) if (Pstar[i] > pm * 0.01) {
      const x = B.X((i + 0.5) * DX), y = B.Y(Pstar[i]);
      ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    kit.legend(ctx, [{ label: "repertoire now", color: c.blue }, { label: "optimum", color: c.pink }, { label: "threat Q", color: kit.alpha(c.brown, 0.6) }], pr.x, pr.y - 10);

    // cost gap
    const ys = gaps.map((p) => p[1]);
    const ylo = 10 ** Math.floor(Math.log10(Math.max(1e-6, Math.min(...ys, 1e-3))));
    const yhi = 10 ** Math.ceil(Math.log10(Math.max(...ys, 1e-1)));
    const Cg = kit.axes(ctx, gr, {
      x: [T0, T1], xlog: true, y: [ylo, yhi], ylog: true, xfmt: (v) => kit.fmtNum(v),
      xlabel: "time, in cell lifetimes", ylabel: "relative cost gap to the optimum",
    });
    ctx.save(); Cg.clip();
    kit.line(ctx, gaps.filter(([tt]) => tt >= T0 * 0.999), Cg, { color: s.mode === "mean" ? c.blue : c.teal, width: 2.2 });
    ctx.restore();

    if (!ro) return;
    const { tot } = costGap();
    ro.t.set(`${t < 10 ? t.toFixed(1) : Math.round(t).toLocaleString("en-US")} lifetimes${done ? ", end" : ""}`);
    ro.g.set(kit.fmtNum(gaps[gaps.length - 1][1], 1));
    ro.k.set(overlap(P, Pstar).toFixed(2));
    ro.n.set(`${tot.toFixed(3)} N_st`);
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  newLandscape(); restart();
  const loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "Restart", onClick: () => { restart(); loop.play(); loop.redraw(); } });
  ui.button({ label: "New landscape", onClick: () => { s.seed++; newLandscape(); restart(); loop.play(); loop.redraw(); } });
  ui.select({ label: "Dynamics", value: s.mode, options: [{ value: "mean", label: "mean field (averaged)" }, { value: "stoch", label: "stochastic, one antigen at a time" }],
    onChange: (v) => { s.mode = v; restart(); loop.play(); loop.redraw(); } });
  ui.select({ label: "Starting repertoire", value: s.start, options: [{ value: "random", label: "random" }, { value: "uniform", label: "uniform" }],
    onChange: (v) => { s.start = v; restart(); loop.play(); loop.redraw(); } });
  ui.slider({ label: "Speed", min: 3, max: 60, log: true, value: s.speed, format: (v) => `${Math.round(v)} rows/s`, onInput: (v) => { s.speed = v; } });
  ro = { t: ui.readout({ label: "Time" }), g: ui.readout({ label: "Cost gap" }), k: ui.readout({ label: "Overlap with the optimum" }), n: ui.readout({ label: "Total cells" }) };
  kit.onThemeChange(() => { for (let k = 0; k < rows; k++) paintRow(k); loop.redraw(); });
  st.onResize(() => loop.redraw());
  loop.redraw();
}

function rgb(hex) {
  let h = String(hex).trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const v = parseInt(h, 16);
  return Number.isFinite(v) ? [v >> 16, (v >> 8) & 255, v & 255] : [51, 71, 155];
}
