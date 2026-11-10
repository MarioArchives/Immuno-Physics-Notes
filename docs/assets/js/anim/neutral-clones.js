// Clone-size distributions (Section VII A and C).
// Neutral mode: new clones of one cell arrive at rate θ; every cell divides at rate ν and dies at rate μ > ν.
//   Exact stochastic simulation (Gillespie), compared with the paper's solution for an initially empty repertoire:
//   N_C(t) = (θ/ν) (1/C) (ν/μ)^C [(1 - e^{-t(μ-ν)}) / (1 - (ν/μ) e^{-t(μ-ν)})]^C.
// Expansion mode: each clone's log-size x = ln C falls at rate μ and jumps by Δx at rate sp (antigen encounters);
//   clones enter at x0 = ln C0 and leave at x = 0. The steady state is a power law N_C ∝ C^{-1-α} with
//   μα = sp (e^{αΔx} - 1), and the totals N_tot = θ ln C0 / (μ - spΔx), C_tot = θ (C0 - 1) / (μ - sp(e^{Δx} - 1)).
// Time is measured in units of the mean cell lifetime 1/μ (μ = 1).
import * as kit from "../kit.js";

const MU = 1;
const CAP = 1 << 17;        // cell capacity, neutral simulation
const CLONECAP = 30000;     // clone capacity, expansion simulation
const XMAX = 1e5;           // largest clone size on the axis
const EDGES = (() => { const e = []; for (let c = 1; c <= 10; c++) e.push(c); let x = 10; while (x < XMAX) { x = Math.ceil(x * 1.35); e.push(x); } return e; })();
const NB = EDGES.length - 1;

const NC = (C, t, th, nu) => {
  const r = nu / MU, z = Math.exp(-t * (MU - nu)), q = (1 - z) / (1 - r * z);
  return (th / nu) * Math.exp(C * Math.log(r * q)) / C;
};
const Ntot = (t, th, nu) => (th / nu) * Math.log((MU - nu * Math.exp(-t * (MU - nu))) / (MU - nu));
const Ctot = (t, th, nu) => (th / (MU - nu)) * (1 - Math.exp(-t * (MU - nu)));

function alphaOf(sp, dx) {   // positive root of μα = sp (e^{αΔx} - 1); exists when spΔx < μ
  if (sp * dx >= MU) return NaN;
  const f = (a) => sp * (Math.exp(a * dx) - 1) - MU * a;
  let lo = 1e-9, hi = 1;
  while (f(hi) < 0 && hi < 1e3) hi *= 2;
  for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.62 : 2.1), minHeight: 300, maxHeight: 780,
    label: "Two charts. Left: number of clones of each size, on logarithmic axes, from a stochastic simulation (dots) and from the analytic result (lines). Right: total numbers of clones and of cells over time, simulated and predicted.",
  });
  const { ctx } = st;
  const rand = kit.rng(31);
  const p = { mode: "neutral", th: 100, nu: 0.95, thE: 150, C0: 10, sp: 0.2, dx: 1.5 };

  // neutral state
  const cell = new Int32Array(CAP), size = new Int32Array(CAP), freeIds = new Int32Array(CAP);
  let nCells = 0, nClones = 0, nextId = 0, nFree = 0;
  // expansion state
  const xs = new Float64Array(CLONECAP);
  let nX = 0;
  // shared
  let t = 0, trace = [], hist = new Float64Array(NB), avg = { on: false, hist: new Float64Array(NB), N: 0, C: 0 };
  let sampleClock = 0;

  function reset() {
    nCells = nClones = nextId = nFree = 0; nX = 0;
    t = 0; trace = [[0, 0, 0]]; sampleClock = 0;
    hist.fill(0); avg = { on: false, hist: new Float64Array(NB), N: 0, C: 0 };
  }

  const tRelax = () => (p.mode === "neutral" ? 1 / (MU - p.nu) : 20);
  const tView = () => (p.mode === "neutral" ? Math.max(10, Math.ceil(4 * tRelax() / 10) * 10) : 150);
  const speed = () => (p.mode === "neutral" ? Math.max(1.5, 0.3 * tRelax()) : 12);

  function neutralEvents(tTarget) {
    const th = p.th, nu = p.nu;
    let budget = 30000;
    while (t < tTarget && budget-- > 0) {
      const Rb = nu * nCells, Rd = MU * nCells, R = Rb + Rd + th;
      t += rand.exp(R);
      const u = rand.random() * R;
      if (u < th) {
        const id = nFree ? freeIds[--nFree] : nextId++;
        size[id] = 1; cell[nCells++] = id; nClones++;
      } else {
        const i = Math.floor(rand.random() * nCells), id = cell[i];
        if (u < th + Rb) { if (nCells < CAP) { cell[nCells++] = id; size[id]++; } }
        else { cell[i] = cell[--nCells]; if (--size[id] === 0) { freeIds[nFree++] = id; nClones--; } }
      }
    }
    // if the budget runs out, the simulated clock simply runs slower this frame (no events are skipped)
  }

  function expansionSteps(tTarget) {
    const h = 0.02, x0 = Math.log(p.C0), jump = p.sp * h;
    while (t < tTarget) {
      let k = rand.poisson(p.thE * h);
      while (k-- > 0 && nX < CLONECAP) xs[nX++] = x0 - rand.random() * MU * h;
      for (let i = 0; i < nX; i++) {
        let x = xs[i] - MU * h;
        if (rand.random() < jump) { x += p.dx; if (rand.random() < jump / 2) x += p.dx; }
        if (x <= 0) { xs[i] = xs[--nX]; i--; } else xs[i] = x;
      }
      t += h;
    }
  }

  const binOf = (c) => { let lo = 0, hi = NB; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (EDGES[m] <= c) lo = m; else hi = m; } return lo; };

  function measure() {
    hist.fill(0);
    let N = 0, C = 0;
    if (p.mode === "neutral") {
      for (let id = 0; id < nextId; id++) { const s = size[id]; if (s > 0) { const b = binOf(s); if (b < NB) hist[b]++; } }
      N = nClones; C = nCells;
    } else {
      for (let i = 0; i < nX; i++) { const c = Math.exp(xs[i]); C += c; const b = binOf(c); if (b < NB) hist[b]++; }
      N = nX;
    }
    return { N, C };
  }

  function step(dt) {
    const before = t;
    if (p.mode === "neutral") neutralEvents(t + dt * speed()); else expansionSteps(t + dt * speed());
    const { N, C } = measure();
    // time average for the expansion mode, once the repertoire has filled up
    if (p.mode !== "neutral" && t > 40) {
      const w = avg.on ? 1 - Math.exp(-(t - before) / 60) : 1;
      for (let b = 0; b < NB; b++) avg.hist[b] += w * (hist[b] - avg.hist[b]);
      avg.N += w * (N - avg.N); avg.C += w * (C - avg.C); avg.on = true;
    }
    sampleClock += t - before;
    if (sampleClock >= tView() / 300) {
      sampleClock = 0;
      trace.push([t, N, C]);
      if (trace.length > 900) trace = trace.filter((_, i) => i % 2 === 0 || i === trace.length - 1);
    }
  }

  /* ---------- drawing ---------- */

  function layout() {
    if (st.narrow) {
      const h1 = Math.round(st.h * 0.52);
      return { hi: { x: 52, y: 44, w: st.w - 70, h: h1 - 98 }, tr: { x: 52, y: h1 + 44, w: st.w - 70, h: st.h - h1 - 96 } };
    }
    const w1 = Math.round(st.w * 0.55);
    return { hi: { x: 58, y: 44, w: w1 - 86, h: st.h - 100 }, tr: { x: w1 + 52, y: 44, w: st.w - w1 - 70, h: st.h - 100 } };
  }

  function drawHist(r) {
    const c = kit.colors, neutral = p.mode === "neutral";
    const A = kit.axes(ctx, r, { x: [1, XMAX], y: [1e-4, 1e3], xlog: true, ylog: true, xlabel: "clone size C (cells)", ylabel: "clones per unit size, N_C" });
    ctx.save(); A.clip();
    const curve = (f) => { const pts = []; for (let i = 0; i <= 240; i++) { const C = Math.pow(10, (5 * i) / 240), v = f(C); pts.push([C, v > 1e-12 ? v : NaN]); } return pts; };
    if (neutral) {
      kit.line(ctx, curve((C) => (p.th / p.nu) / C), A, { color: c.muted, width: 1, dash: [2, 4] });
      kit.line(ctx, curve((C) => NC(C, 1e9, p.th, p.nu)), A, { color: c.muted, width: 1.4 });
      kit.line(ctx, curve((C) => NC(C, t, p.th, p.nu)), A, { color: c.pink, width: 2, dash: [6, 4] });
    }
    const H = neutral ? hist : avg.hist;
    const pts = [];
    for (let b = 0; b < NB; b++) {
      const a = EDGES[b], e = EDGES[b + 1], w = e - a;
      const x = neutral && w === 1 ? a : w / Math.log(e / a);
      if (H[b] > 0) pts.push([x, H[b] / w]);
    }
    if (!neutral) {
      const al = alphaOf(p.sp, p.dx);
      if (isFinite(al) && pts.length) {
        // a line with the predicted slope -(1+α), passed through the simulated point nearest to C = 3 C0
        const anchor = pts.reduce((best, q) => (Math.abs(Math.log(q[0] / (3 * p.C0))) < Math.abs(Math.log(best[0] / (3 * p.C0))) ? q : best), pts[0]);
        kit.line(ctx, curve((C) => (C < p.C0 ? NaN : anchor[1] * Math.pow(C / anchor[0], -1 - al))), A, { color: c.pink, width: 2, dash: [6, 4] });
      }
      ctx.fillStyle = kit.alpha(c.gold, 0.9);
      ctx.fillRect(Math.round(A.X(p.C0)), r.y, 1.5, r.h);
    }
    ctx.fillStyle = c.blue;
    for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(A.X(x), A.Y(y), 3.4, 0, 7); ctx.fill(); }
    ctx.restore();
    const items = neutral
      ? [{ label: "simulation", color: c.blue }, { label: "N_C(t)", color: c.pink, dash: [6, 4] }, { label: "steady state", color: c.muted }]
      : [{ label: "simulation, time-averaged", color: c.blue }, { label: "slope −(1+α)", color: c.pink, dash: [6, 4] }];
    kit.legend(ctx, items, r.x, r.y - 30);
    if (neutral) kit.label(ctx, "dotted: 1/C", r.x + r.w - 6, r.y + 14, { color: c.muted, size: 11, weight: 400, align: "right" });
    else kit.label(ctx, "C₀", A.X(p.C0) + 4, r.y + 14, { color: c.gold, size: 11, weight: 700 });
  }

  function drawTrace(r) {
    const c = kit.colors, neutral = p.mode === "neutral";
    const T = Math.max(tView(), t);
    const A = kit.axes(ctx, r, { x: [0, T], y: [1, 1e5], ylog: true, xlabel: "time, in mean cell lifetimes 1/μ", ylabel: "totals" });
    ctx.save(); A.clip();
    if (neutral) {
      const thN = [], thC = [];
      const pos = (v) => (v > 0.5 ? v : NaN);
      for (let i = 0; i <= 200; i++) { const s = (T * i) / 200; thN.push([s, pos(Ntot(s, p.th, p.nu))]); thC.push([s, pos(Ctot(s, p.th, p.nu))]); }
      kit.line(ctx, thC, A, { color: c.brown, width: 1.6, dash: [6, 4] });
      kit.line(ctx, thN, A, { color: c.blue, width: 1.6, dash: [6, 4] });
    } else {
      const { N, C } = formulasE();
      if (isFinite(C) && C > 0) kit.line(ctx, [[0, C], [T, C]], A, { color: c.brown, width: 1.6, dash: [6, 4] });
      if (isFinite(N) && N > 0) kit.line(ctx, [[0, N], [T, N]], A, { color: c.blue, width: 1.6, dash: [6, 4] });
    }
    kit.line(ctx, trace.map((q) => [q[0], Math.max(q[2], 0.5)]), A, { color: c.brown, width: 2 });
    kit.line(ctx, trace.map((q) => [q[0], Math.max(q[1], 0.5)]), A, { color: c.blue, width: 2 });
    ctx.restore();
    kit.legend(ctx, [{ label: "cells", color: c.brown }, { label: "clones", color: c.blue }, { label: neutral ? "formulas" : "steady-state formulas", color: c.muted, dash: [6, 4] }], r.x, r.y - 30);
  }

  function formulasE() {
    const N = p.sp * p.dx < MU ? (p.thE * Math.log(p.C0)) / (MU - p.sp * p.dx) : Infinity;
    const g = p.sp * (Math.exp(p.dx) - 1);
    const C = g < MU ? (p.thE * (p.C0 - 1)) / (MU - g) : Infinity;
    return { N, C };
  }

  const fmt = (v) => (isFinite(v) ? kit.fmtNum(Math.round(v)) : "no steady state");

  function draw() {
    if (!ro.time) return;
    st.clear();
    const L = layout();
    drawHist(L.hi);
    drawTrace(L.tr);
    ro.time.set(`${t.toFixed(t < 10 ? 1 : 0)} lifetimes`);
    if (p.mode === "neutral") {
      ro.clones.set(`${kit.fmtNum(nClones)} / ${fmt(Ntot(t, p.th, p.nu))}`);
      ro.cells.set(`${kit.fmtNum(nCells)} / ${fmt(Ctot(t, p.th, p.nu))}`);
      ro.extra.set(`${fmt(Ntot(1e9, p.th, p.nu))} clones, ${fmt(p.th / (MU - p.nu))} cells`);
    } else {
      const { N, C } = formulasE(), al = alphaOf(p.sp, p.dx);
      ro.clones.set(`${avg.on ? kit.fmtNum(Math.round(avg.N)) : "…"} / ${fmt(N)}`);
      ro.cells.set(`${avg.on ? kit.fmtNum(Math.round(avg.C)) : "…"} / ${fmt(C)}`);
      ro.extra.set(isFinite(al) ? (1 + al).toFixed(2) : "none: spΔx ≥ μ");
    }
  }

  /* ---------- controls ---------- */

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const ro = {};
  let loop = null;
  const restart = () => { reset(); if (loop) loop.redraw(); };
  const modeSel = ui.select({
    label: "Model", value: p.mode,
    options: [{ value: "neutral", label: "Neutral birth and death (part A)" }, { value: "expand", label: "Antigen-driven expansions (part C)" }],
    onChange: (v) => { p.mode = v; showMode(); restart(); },
  });
  const sN = [
    ui.slider({ label: "New clones per lifetime, θ", min: 20, max: 200, step: 5, value: p.th, format: (v) => String(Math.round(v)), onInput: (v) => { p.th = v; restart(); } }),
    ui.slider({ label: "Division rate, ν/μ", min: 0.05, max: 0.99, step: 0.01, value: p.nu, format: (v) => v.toFixed(2), onInput: (v) => { p.nu = v; restart(); } }),
  ];
  const sE = [
    ui.slider({ label: "New clones per lifetime, θ", min: 20, max: 300, step: 5, value: p.thE, format: (v) => String(Math.round(v)), onInput: (v) => { p.thE = v; restart(); } }),
    ui.slider({ label: "Size of a new clone, C₀", min: 2, max: 50, step: 1, value: p.C0, format: (v) => `${Math.round(v)} cells`, onInput: (v) => { p.C0 = Math.round(v); restart(); } }),
    ui.slider({ label: "Expansions per clone per lifetime, sp", min: 0.02, max: 1, step: 0.01, value: p.sp, format: (v) => v.toFixed(2), onInput: (v) => { p.sp = v; restart(); } }),
    ui.slider({ label: "Jump in log size per expansion, Δx", min: 0.1, max: 3, step: 0.05, value: p.dx, format: (v) => `${v.toFixed(2)} (×${Math.exp(v).toFixed(1)})`, onInput: (v) => { p.dx = v; restart(); } }),
  ];
  ro.time = ui.readout({ label: "Time" });
  ro.clones = ui.readout({ label: "Clones, simulated / predicted" });
  ro.cells = ui.readout({ label: "Cells, simulated / predicted" });
  ro.extra = ui.readout({ label: "Steady state" });
  function showMode() {
    const neutral = p.mode === "neutral";
    sN.forEach((s) => { s.el.style.display = neutral ? "" : "none"; });
    sE.forEach((s) => { s.el.style.display = neutral ? "none" : ""; });
    ro.extra.el.firstChild.textContent = neutral ? "Steady state" : "Predicted exponent, 1 + α";
  }
  showMode();
  reset();
  // head start for the still frame (reduced motion): about one relaxation time
  for (let i = 0; i < 120; i++) step(1 / 60);
  loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "Empty repertoire", onClick: restart });
  void modeSel;
  st.onResize(() => loop.redraw());
  loop.redraw();
}
