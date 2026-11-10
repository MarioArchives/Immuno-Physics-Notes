// The cyton model (Section V D1): each stimulated lymphocyte runs two internal timers, one for division and one for
// death, drawn from log-normal distributions; whichever fires first decides its fate. In round i only a fraction F_i
// of cells are prepared to divide. Left: family trees of a few founder cells. Right: cells in each generation,
// counted in an agent simulation and computed from the cyton equations.
import * as kit from "../kit.js";

const T_END = 160;      // hours shown
const DT = 0.5;         // grid for the equations and the counts, hours
const FOUNDERS = 500;   // founder cells in the population simulation
const TREES = 6;        // founder cells whose family trees are drawn
const DIV_LATER = 10;   // median time between later divisions, hours (fixed)

function erf(x) { // Abramowitz and Stegun 7.1.26
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
const lnCdf = (t, med, sg) => (t <= 0 ? 0 : 0.5 * (1 + erf(Math.log(t / med) / (sg * Math.SQRT2))));

const F = (p, i) => (i >= p.m ? 0 : i === 0 ? p.F0 : 1);   // fraction prepared to divide in round i
const divMed = (p, i) => (i === 0 ? p.div0 : DIV_LATER);

/* The cyton equations, per founder cell, on a grid of step DT:
   n_i^div(t) = 2 F_i ∫ n_{i-1}^div(t') [1 - Ψ_i(t-t')] φ_i(t-t') dt'
   n_i^die(t) = 2   ∫ n_{i-1}^div(t') [1 - F_i Φ_i(t-t')] ψ_i(t-t') dt'
   with capital letters for cumulative distributions; generation 0 starts with one cell at t = 0. */
function theory(p) {
  const K = Math.round(T_END / DT) + 1, G = p.m + 1;
  const dens = (med, sg, k) => (lnCdf((k + 0.5) * DT, med, sg) - lnCdf(Math.max(0, (k - 0.5) * DT), med, sg)) / DT;
  const ndiv = [], ndie = [], N = [];
  for (let i = 0; i < G; i++) {
    const phi = new Float64Array(K), Phi = new Float64Array(K), psi = new Float64Array(K), Psi = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      phi[k] = dens(divMed(p, i), p.sg, k); Phi[k] = lnCdf(k * DT, divMed(p, i), p.sg);
      psi[k] = dens(p.die, p.sg, k); Psi[k] = lnCdf(k * DT, p.die, p.sg);
    }
    const a = new Float64Array(K), b = new Float64Array(K), Fi = F(p, i);
    if (i === 0) {
      for (let k = 0; k < K; k++) { a[k] = Fi * phi[k] * (1 - Psi[k]); b[k] = (1 - Fi * Phi[k]) * psi[k]; }
    } else {
      const src = ndiv[i - 1];
      for (let k = 0; k < K; k++) {
        let sa = 0, sb = 0;
        for (let j = 0; j <= k; j++) {
          const s = src[j]; if (s === 0) continue;
          const u = k - j;
          sa += s * (1 - Psi[u]) * phi[u];
          sb += s * (1 - Fi * Phi[u]) * psi[u];
        }
        a[k] = 2 * Fi * sa * DT; b[k] = 2 * sb * DT;
      }
    }
    ndiv.push(a); ndie.push(b);
    const n = new Float64Array(K);
    let acc = i === 0 ? 1 : 0;
    for (let k = 0; k < K; k++) { n[k] = acc; acc += ((i ? 2 * ndiv[i - 1][k] : 0) - a[k] - b[k]) * DT; }
    N.push(n);
  }
  return N;
}

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.62 : 2.1), minHeight: 300, maxHeight: 780,
    label: "Two charts. Left: family trees of six stimulated founder cells over 160 hours, each line a cell, branching when it divides and ending in a cross when it dies. Right: number of cells in each generation over time, from a simulation of 500 founders and from the cyton equations.",
  });
  const { ctx } = st;
  const p = { div0: 32, die: 50, sg: 0.3, F0: 0.8, m: 4 };
  let th = [], sim = [], trees = [], stats = {};
  let t = 0, hold = 0;

  function lognormal(rand, med) { return med * Math.exp(p.sg * rand.normal()); }

  // one cell: returns { birth, end, gen, fate, kids }
  function grow(rand, birth, gen, rec) {
    const tDie = birth + lognormal(rand, p.die);
    const tDiv = rand.random() < F(p, gen) ? birth + lognormal(rand, divMed(p, gen)) : Infinity;
    const node = { birth, gen, end: Math.min(tDie, tDiv), fate: tDiv < tDie ? "div" : "die", kids: null };
    if (rec) rec(node);
    if (node.fate === "div" && node.end < T_END) node.kids = [grow(rand, node.end, gen + 1, rec), grow(rand, node.end, gen + 1, rec)];
    return node;
  }

  function rebuild() {
    th = theory(p);
    const K = th[0].length, G = p.m + 1;
    const diffs = Array.from({ length: G }, () => new Float64Array(K + 1));
    const rand = kit.rng(2024);
    let undivided = 0, biggest = 0;
    for (let f = 0; f < FOUNDERS; f++) {
      let count = 0;
      const root = grow(rand, 0, 0, (c) => {
        const k0 = Math.ceil(c.birth / DT - 1e-9), k1 = Math.min(K, Math.ceil(c.end / DT - 1e-9));
        if (k0 < k1) { diffs[c.gen][k0] += 1; diffs[c.gen][k1] -= 1; }
        count++;
      });
      if (root.fate === "die") undivided++;
      biggest = Math.max(biggest, count);
    }
    sim = diffs.map((d) => { const a = new Float64Array(K); let s = 0; for (let k = 0; k < K; k++) { s += d[k]; a[k] = s / FOUNDERS; } return a; });
    stats = { undivided: undivided / FOUNDERS };
    const tr = kit.rng(77);
    trees = Array.from({ length: TREES }, () => grow(tr, 0, 0, null));
  }

  /* ---------- drawing ---------- */

  let pal = [];
  function palette() {
    const c = kit.colors;
    const hex = (h) => { const x = String(h).trim().replace("#", ""); const n = parseInt(x.length === 3 ? x.split("").map((q) => q + q).join("") : x, 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const a = hex(c.blue), b = hex(c.pink);
    pal = [];
    for (let g = 0; g <= p.m + 1; g++) {
      const f = Math.min(1, p.m ? g / p.m : 0);
      pal.push(a.some(Number.isNaN) || b.some(Number.isNaN) ? c.blue : `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`);
    }
  }
  const genColor = (g) => pal[Math.min(g, pal.length - 1)];

  function layout() {
    if (st.narrow) {
      const h1 = Math.round(st.h * 0.46);
      return { tr: { x: 16, y: 36, w: st.w - 32, h: h1 - 76 }, pop: { x: 52, y: h1 + 40, w: st.w - 70, h: st.h - h1 - 92 } };
    }
    const half = Math.round(st.w * 0.48);
    return { tr: { x: 16, y: 36, w: half - 32, h: st.h - 88 }, pop: { x: half + 54, y: 44, w: st.w - half - 72, h: st.h - 100 } };
  }

  function drawTrees(r) {
    const c = kit.colors;
    const X = (v) => r.x + (Math.min(v, T_END) / T_END) * r.w;
    const band = r.h / TREES;
    kit.label(ctx, "Six founder cells and their descendants", r.x, r.y - 14, { color: c.ink, size: 12, weight: 500 });
    ctx.save();
    ctx.lineCap = "round";
    function node(nd, y0, y1) {
      if (nd.birth > t) return;
      const y = (y0 + y1) / 2, end = Math.min(nd.end, t, T_END);
      ctx.strokeStyle = genColor(nd.gen); ctx.lineWidth = Math.max(1, 2.2 - nd.gen * 0.25);
      ctx.beginPath(); ctx.moveTo(X(nd.birth), y); ctx.lineTo(X(end), y); ctx.stroke();
      if (nd.end <= t && nd.end < T_END) {
        if (nd.fate === "die") {
          const s = 3; ctx.strokeStyle = c.ink; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(X(end) - s, y - s); ctx.lineTo(X(end) + s, y + s); ctx.moveTo(X(end) - s, y + s); ctx.lineTo(X(end) + s, y - s); ctx.stroke();
        } else if (nd.kids) {
          const ya = (y0 + y) / 2, yb = (y + y1) / 2;
          ctx.strokeStyle = genColor(nd.gen + 1); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(X(end), ya); ctx.lineTo(X(end), yb); ctx.stroke();
          node(nd.kids[0], y0, y); node(nd.kids[1], y, y1);
        }
      }
    }
    trees.forEach((tr, i) => {
      const y0 = r.y + i * band;
      if (i) { ctx.fillStyle = c.grid; ctx.fillRect(r.x, Math.round(y0) + 0.5, r.w, 1); }
      node(tr, y0 + 3, y0 + band - 3);
    });
    ctx.restore();
    // time axis
    ctx.fillStyle = c.muted; ctx.fillRect(r.x, r.y + r.h + 2, r.w, 1);
    for (let h = 0; h <= T_END; h += 40) {
      ctx.fillRect(Math.round(X(h)), r.y + r.h + 2, 1, 4);
      kit.label(ctx, String(h), X(h), r.y + r.h + 18, { color: c.muted, size: 11, weight: 400, align: "center" });
    }
    kit.label(ctx, "hours after stimulation", r.x + r.w / 2, r.y + r.h + 34, { color: c.ink, size: 12, align: "center" });
    // time cursor
    ctx.fillStyle = kit.alpha(c.pink, 0.8); ctx.fillRect(Math.round(X(t)), r.y, 1.5, r.h);
  }

  function drawPop(r) {
    const c = kit.colors;
    const K = th[0].length;
    let ymax = 1;
    for (let k = 0; k < K; k++) { let s = 0; for (const a of th) s += a[k]; ymax = Math.max(ymax, s); }
    ymax = Math.ceil(ymax * 1.08);
    const A = kit.axes(ctx, r, { x: [0, T_END], y: [0, ymax], xlabel: "hours after stimulation", ylabel: "cells per founder cell", xticks: [0, 40, 80, 120, 160] });
    const kNow = Math.min(K - 1, Math.round(t / DT));
    const series = (arr, k1) => { const out = []; for (let k = 0; k <= k1; k++) out.push([k * DT, arr[k]]); return out; };
    const total = (set) => { const a = new Float64Array(K); for (const s of set) for (let k = 0; k < K; k++) a[k] += s[k]; return a; };
    ctx.save(); A.clip();
    th.forEach((a, g) => kit.line(ctx, series(a, K - 1), A, { color: kit.alpha(genColor(g), 0.9), width: 1.4, dash: [5, 4] }));
    kit.line(ctx, series(total(th), K - 1), A, { color: c.ink, width: 1.6, dash: [5, 4] });
    sim.forEach((a, g) => kit.line(ctx, series(a, kNow), A, { color: genColor(g), width: 2 }));
    kit.line(ctx, series(total(sim), kNow), A, { color: c.ink, width: 2.6 });
    ctx.restore();
    // generation labels at the theoretical peaks
    th.forEach((a, g) => {
      let kb = 0; for (let k = 1; k < K; k++) if (a[k] > a[kb]) kb = k;
      if (a[kb] > ymax * 0.04) kit.label(ctx, String(g), A.X(kb * DT), A.Y(a[kb]) - 6, { color: genColor(g), size: 11.5, weight: 700, align: "center" });
    });
    kit.legend(ctx, [{ label: "simulation", color: c.ink }, { label: "cyton equations", color: c.ink, dash: [5, 4] }], r.x, r.y - 26);
    kit.label(ctx, "numbers: generation", r.x + r.w, r.y - 26, { color: c.muted, size: 11, weight: 400, align: "right", baseline: "middle" });
  }

  function draw() {
    if (!ro.sim) return;
    palette();
    st.clear();
    const L = layout();
    drawTrees(L.tr);
    drawPop(L.pop);
    const k = Math.min(th[0].length - 1, Math.round(t / DT));
    const sumAt = (set) => set.reduce((s, a) => s + a[k], 0);
    ro.time.set(`${Math.round(t)} h`);
    ro.sim.set(kit.fmtNum(sumAt(sim), 2));
    ro.th.set(kit.fmtNum(sumAt(th), 2));
    ro.undiv.set(`${Math.round(stats.undivided * 100)}%`);
  }

  function step(dt) {
    if (t >= T_END) { hold += dt; if (hold > 2.5) { t = 0; hold = 0; } return; }
    t = Math.min(T_END, t + dt * 16);
  }

  /* ---------- controls ---------- */

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const ro = {};
  let loop = null;
  let pending = 0;   // coalesce slider events: rebuild at most once per animation frame
  const changed = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; rebuild(); if (loop) loop.redraw(); }); };
  rebuild();
  ui.slider({ label: "Median time to first division", min: 16, max: 60, step: 1, value: p.div0, format: (v) => `${Math.round(v)} h`, onInput: (v) => { p.div0 = v; changed(); } });
  ui.slider({ label: "Median time to death", min: 20, max: 120, step: 1, value: p.die, format: (v) => `${Math.round(v)} h`, onInput: (v) => { p.die = v; changed(); } });
  ui.slider({ label: "Spread of the timers, σ", min: 0.05, max: 0.6, step: 0.01, value: p.sg, format: (v) => v.toFixed(2), onInput: (v) => { p.sg = v; changed(); } });
  ui.slider({ label: "Fraction that respond, F₀", min: 0, max: 1, step: 0.05, value: p.F0, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { p.F0 = v; changed(); } });
  ui.slider({ label: "Division destiny (rounds)", min: 1, max: 7, step: 1, value: p.m, format: (v) => String(Math.round(v)), onInput: (v) => { p.m = Math.round(v); changed(); } });
  ro.time = ui.readout({ label: "Time" });
  ro.sim = ui.readout({ label: "Cells per founder, simulation" });
  ro.th = ui.readout({ label: "Cells per founder, equations" });
  ro.undiv = ui.readout({ label: "Founders that die undivided" });
  t = T_END * 0.55;   // the still frame (reduced motion) shows the expansion under way
  loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "Restart clock", onClick: () => { t = 0; hold = 0; loop.redraw(); } });
  st.onResize(() => loop.redraw());
  loop.redraw();
}
