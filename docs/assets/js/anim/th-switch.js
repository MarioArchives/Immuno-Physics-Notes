// Th1/Th2 toggle switch (Section V A1). Two transcription factors, P1 (Tbet, Th1) and P2 (GATA-3, Th2), each
// repress the other's gene through a Hill function; mRNAs R1, R2 are made at the tonic rates v1, v2:
//   dR1/dt = v1 K^n/(K^n + P2^n) - gR R1,   dP1/dt = k R1 - gP P1   (and the same with 1 and 2 swapped).
// Nondimensional parameters below make the largest protein level equal to v (k v / (gR gP) = v, K = 1).
import * as kit from "../kit.js";

const PAR = { gR: 2, gP: 1, k: 2, K: 1 };
const NCELL = 80;
const XMAX = 8.4, YMAX = 6.4, V1MAX = 8;
const H = 0.01;            // integration step, model time units
const TRAIL = 36;          // trail samples kept per cell in the phase plane
const TAGGED = 6;          // cells whose path is drawn in the bifurcation diagram during a sweep

const hill = (P, n) => 1 / (1 + Math.pow(Math.max(P, 0) / PAR.K, n));
const top = (v) => (v * PAR.k) / (PAR.gR * PAR.gP);   // steady protein level with the gene fully on

// Steady states: P1 = top(v1) h(P2), P2 = top(v2) h(P1). Scan g(P1) for sign changes.
function fixedPoints(v1, v2, n) {
  const a1 = top(v1), a2 = top(v2);
  const g = (p) => a1 * hill(a2 * hill(p, n), n) - p;
  const out = [], N = 1500, hi = a1 + 1e-6;
  let x0 = 0, g0 = g(0);
  if (Math.abs(g0) < 1e-12) out.push(0);
  for (let i = 1; i <= N; i++) {
    const x1 = (hi * i) / N, g1 = g(x1);
    if (g0 * g1 < 0) {
      let a = x0, b = x1;
      for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (g(a) * g(m) <= 0) b = m; else a = m; }
      out.push((a + b) / 2);
    }
    x0 = x1; g0 = g1;
  }
  const dh = (P) => (-n * Math.pow(P, n - 1)) / Math.pow(1 + Math.pow(P, n), 2);
  return out.map((p1) => {
    const p2 = a2 * hill(p1, n);
    // stable when the product of the two nullcline slopes is below one (positive feedback loop: no oscillations)
    return { p1, p2, stable: a1 * dh(p2) * a2 * dh(p1) < 1 };
  });
}

// The S-shaped curve of steady states, parameterized by P1: v1 = P1 / h(P2) with P2 = top(v2) h(P1).
function sCurve(v2, n) {
  const pts = [];
  for (let i = 0; i <= 600; i++) {
    const p1 = (XMAX * i) / 600;
    const v1 = (p1 / hill(top(v2) * hill(p1, n), n)) * (PAR.gR * PAR.gP) / PAR.k;
    pts.push([v1, p1]);
  }
  const folds = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const d0 = pts[i][0] - pts[i - 1][0], d1 = pts[i + 1][0] - pts[i][0];
    if (d0 * d1 < 0) folds.push(pts[i][0]);
  }
  return { pts, folds };
}

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.6 : 2.05), minHeight: 300, maxHeight: 760,
    label: "Two linked charts. Left: the phase plane of Tbet against GATA-3 levels, with the two nullclines, their crossing points, and a population of cells moving towards the Th1 or the Th2 state. Right: steady Tbet level against the drive v1, an S-shaped curve with a bistable middle range, and the paths of cells as v1 is swept up and down.",
  });
  const { ctx } = st;
  const rand = kit.rng(5);
  const p = { v1: 3, v2: 3, n: 2, noise: 0.1 };
  const cells = Array.from({ length: NCELL }, () => ({ s: new Float64Array(4), trail: [] }));
  let fps = [], curve = { pts: [], folds: [] };
  let t = 0, trailClock = 0;
  let sweep = null;           // { dir: +1 | -1 } while sweeping
  let paths = [];             // per tagged cell, [[v1, P1], ...] recorded during a sweep

  function analyse() { fps = fixedPoints(p.v1, p.v2, p.n); curve = sCurve(p.v2, p.n); }

  function naive() {
    for (const c of cells) {
      c.s[0] = 0.05 * rand.random(); c.s[2] = 0.05 * rand.random();
      c.s[1] = 0.3 * rand.random(); c.s[3] = 0.3 * rand.random();
      c.trail = [[c.s[1], c.s[3]]];
    }
    t = 0;
  }

  function stepCells(dt) {
    const n = p.n, sq = p.noise * Math.sqrt(H);
    const steps = Math.max(1, Math.round(dt / H));
    for (let k = 0; k < steps; k++) {
      if (sweep) {
        p.v1 += sweep.dir * sweep.rate * H;
        if (p.v1 >= sweep.hi) { p.v1 = sweep.hi; sweep.dir = -1; }
        if (p.v1 <= 0 && sweep.dir < 0) { p.v1 = 0; sweep = null; sweepEnded(); }
      }
      for (const c of cells) {
        const s = c.s;
        const d0 = p.v1 * hill(s[3], n) - PAR.gR * s[0];
        const d1 = PAR.k * s[0] - PAR.gP * s[1];
        const d2 = p.v2 * hill(s[1], n) - PAR.gR * s[2];
        const d3 = PAR.k * s[2] - PAR.gP * s[3];
        s[0] += d0 * H; s[2] += d2 * H;
        s[1] = Math.abs(s[1] + d1 * H + sq * rand.normal());
        s[3] = Math.abs(s[3] + d3 * H + sq * rand.normal());
      }
      t += H;
      trailClock += H;
      if (sweep && trailClock >= 0.25) {
        trailClock = 0;
        for (let i = 0; i < TAGGED; i++) paths[i].push([p.v1, cells[i].s[1]]);
      }
    }
  }

  function sampleTrails() {
    for (const c of cells) { c.trail.push([c.s[1], c.s[3]]); if (c.trail.length > TRAIL) c.trail.shift(); }
  }

  /* ---------- drawing ---------- */

  function layout() {
    if (st.narrow) {
      const h1 = Math.round(st.h * 0.52);
      return {
        pp: { x: 48, y: 40, w: st.w - 64, h: h1 - 92 },
        bf: { x: 48, y: h1 + 38, w: st.w - 64, h: st.h - h1 - 90 },
      };
    }
    const half = Math.round(st.w / 2);
    return {
      pp: { x: 54, y: 40, w: half - 84, h: st.h - 96 },
      bf: { x: half + 46, y: 40, w: st.w - half - 66, h: st.h - 96 },
    };
  }

  function drawPhase(r) {
    const c = kit.colors;
    const A = kit.axes(ctx, r, { x: [0, XMAX], y: [0, YMAX], xlabel: "Tbet level, P₁ (Th1 factor)", ylabel: "GATA-3 level, P₂ (Th2 factor)", xticks: [0, 2, 4, 6, 8], yticks: [0, 2, 4, 6] });
    ctx.save(); A.clip();
    // nullclines (protein steady state with mRNA at its own steady state)
    const n1 = [], n2 = [];
    for (let i = 0; i <= 300; i++) {
      const q = (YMAX * i) / 300; n1.push([top(p.v1) * hill(q, p.n), q]);
      const x = (XMAX * i) / 300; n2.push([x, top(p.v2) * hill(x, p.n)]);
    }
    kit.line(ctx, n1, A, { color: c.blue, width: 2 });
    kit.line(ctx, n2, A, { color: c.brown, width: 2 });
    // cell trails and cells
    ctx.lineWidth = 1;
    for (const cell of cells) {
      const th1 = cell.s[1] > cell.s[3];
      ctx.strokeStyle = kit.alpha(th1 ? c.blue : c.brown, 0.22);
      ctx.beginPath();
      cell.trail.forEach(([x, y], i) => (i ? ctx.lineTo(A.X(x), A.Y(y)) : ctx.moveTo(A.X(x), A.Y(y))));
      ctx.lineTo(A.X(cell.s[1]), A.Y(cell.s[3]));
      ctx.stroke();
    }
    for (const cell of cells) {
      const th1 = cell.s[1] > cell.s[3];
      ctx.fillStyle = kit.alpha(th1 ? c.blue : c.brown, 0.75);
      ctx.beginPath(); ctx.arc(A.X(cell.s[1]), A.Y(cell.s[3]), 3, 0, 7); ctx.fill();
    }
    // fixed points
    for (const f of fps) {
      ctx.beginPath(); ctx.arc(A.X(f.p1), A.Y(f.p2), 6, 0, 7);
      if (f.stable) { ctx.fillStyle = c.ink; ctx.fill(); }
      else { ctx.fillStyle = c.bg; ctx.fill(); ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.restore();
    kit.legend(ctx, [{ label: "P₁ nullcline", color: c.blue }, { label: "P₂ nullcline", color: c.brown }], r.x, r.y - 26);
    const lx = r.x + r.w - 8;
    kit.label(ctx, "● stable   ○ unstable", lx, r.y + 14, { color: c.muted, size: 11, weight: 500, align: "right" });
  }

  function drawBif(r) {
    const c = kit.colors;
    const A = kit.axes(ctx, r, { x: [0, V1MAX], y: [0, XMAX], xlabel: "drive of the Th1 gene, v₁", ylabel: "steady Tbet level, P₁", xticks: [0, 2, 4, 6, 8], yticks: [0, 2, 4, 6, 8] });
    ctx.save(); A.clip();
    if (curve.folds.length === 2) {
      const a = Math.min(...curve.folds), b = Math.max(...curve.folds);
      ctx.fillStyle = kit.alpha(c.gold, 0.16);
      ctx.fillRect(A.X(a), r.y, A.X(Math.min(b, V1MAX + 1)) - A.X(a), r.h);
    }
    // stable branches solid, unstable dashed (unstable where v1 decreases along the curve)
    let seg = [], segStable = null;
    const flush = () => { if (seg.length > 1) kit.line(ctx, seg, A, segStable ? { color: c.blue, width: 2.4 } : { color: c.blue, width: 1.6, dash: [5, 5] }); };
    for (let i = 0; i < curve.pts.length; i++) {
      const prev = curve.pts[Math.max(0, i - 1)], cur = curve.pts[i], nxt = curve.pts[Math.min(curve.pts.length - 1, i + 1)];
      const stable = nxt[0] - prev[0] >= 0;
      if (segStable === null) segStable = stable;
      if (stable !== segStable) { seg.push(cur); flush(); seg = [cur]; segStable = stable; } else seg.push(cur);
    }
    flush();
    for (const path of paths) if (path.length > 1) kit.line(ctx, path, A, { color: kit.alpha(c.pink, 0.75), width: 1.4 });
    // current drive and the cells at it
    ctx.strokeStyle = kit.alpha(c.pink, 0.9); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(A.X(p.v1), r.y); ctx.lineTo(A.X(p.v1), r.y + r.h); ctx.stroke();
    for (const cell of cells) {
      ctx.fillStyle = kit.alpha(cell.s[1] > cell.s[3] ? c.blue : c.brown, 0.6);
      ctx.beginPath(); ctx.arc(A.X(p.v1), A.Y(cell.s[1]), 2.6, 0, 7); ctx.fill();
    }
    ctx.restore();
    const items = [{ label: "stable", color: c.blue }, { label: "unstable", color: c.blue, dash: [5, 5] }];
    if (paths.some((q) => q.length > 1)) items.push({ label: "cells during sweep", color: c.pink });
    kit.legend(ctx, items, r.x, r.y - 26);
    if (curve.folds.length === 2) kit.label(ctx, "bistable", A.X(Math.min(...curve.folds)) + 4, r.y + 14, { color: c.muted, size: 11, weight: 600 });
  }

  function draw() {
    if (!ro.fp) return;
    st.clear();
    const L = layout();
    drawPhase(L.pp);
    drawBif(L.bf);
    const nStable = fps.filter((f) => f.stable).length, nUn = fps.length - nStable;
    ro.fp.set(`${nStable} stable, ${nUn} unstable`);
    if (curve.folds.length === 2) {
      const a = Math.min(...curve.folds), b = Math.max(...curve.folds);
      ro.range.set(`${a.toFixed(2)} to ${b > V1MAX ? "beyond " + V1MAX : b.toFixed(2)}`);
    } else ro.range.set("none");
    const th1 = cells.filter((q) => q.s[1] > q.s[3]).length;
    ro.split.set(`${th1} Th1-like, ${NCELL - th1} Th2-like`);
    if (sweep) v1Slider.value = p.v1;
  }

  let sampleClock = 0;
  function step(dt) {
    const speed = sweep ? 30 : 3;
    stepCells(dt * speed);
    sampleClock += dt * speed;
    if (sampleClock > (sweep ? 1.2 : 0.12)) { sampleClock = 0; sampleTrails(); }
    if (sweep) analyse();
  }

  /* ---------- controls ---------- */

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const ro = {};
  let loop = null, sweepBtn = null;
  analyse();
  naive();
  // head start, so the still frame (reduced motion) already shows cells that have chosen a fate
  for (let i = 0; i < 40; i++) { stepCells(0.15); sampleTrails(); }
  function sweepEnded() { if (sweepBtn) sweepBtn.label = "Sweep v₁ up and down"; v1Slider.value = p.v1; analyse(); }
  const redraw = () => loop && loop.redraw();
  const v1Slider = ui.slider({ label: "Drive of the Th1 gene, v₁", min: 0, max: V1MAX, step: 0.05, value: p.v1, format: (v) => v.toFixed(2), onInput: (v) => { p.v1 = v; if (sweep) { sweep = null; sweepEnded(); } analyse(); redraw(); } });
  ui.slider({ label: "Drive of the Th2 gene, v₂", min: 1, max: 6, step: 0.05, value: p.v2, format: (v) => v.toFixed(2), onInput: (v) => { p.v2 = v; analyse(); redraw(); } });
  ui.slider({ label: "Hill coefficient, n", min: 1, max: 3, step: 0.25, value: p.n, format: (v) => v.toFixed(2), onInput: (v) => { p.n = v; analyse(); redraw(); } });
  ui.slider({ label: "Expression noise", min: 0, max: 0.4, step: 0.01, value: p.noise, format: (v) => v.toFixed(2), onInput: (v) => { p.noise = v; } });
  ro.fp = ui.readout({ label: "Steady states" });
  ro.range = ui.readout({ label: "Bistable for v₁ from" });
  ro.split = ui.readout({ label: "Cells now" });
  loop = kit.animate(plate, { step, draw, ui });
  sweepBtn = ui.button({
    label: "Sweep v₁ up and down",
    onClick: () => {
      if (sweep) { sweep = null; sweepEnded(); return; }
      p.v1 = 0; paths = Array.from({ length: TAGGED }, () => []);
      sweep = { dir: 1, rate: 0.02, hi: 6 };
      sweepBtn.label = "Stop sweep";
      analyse(); loop.play();
    },
  });
  ui.button({ label: "New naive cells", onClick: () => { naive(); redraw(); } });
  st.onResize(() => loop.redraw());
  loop.redraw();
}
