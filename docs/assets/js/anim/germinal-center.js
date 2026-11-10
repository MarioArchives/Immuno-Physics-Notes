// A toy germinal center (Section VIII). Default variant: one center cycling between the dark zone (division with
// hypermutation) and the light zone (selection), with its affinity distribution colored by founder lineage.
// data-variant="scan": many centers at each antigen level, showing the trade-off between stringent and lenient selection.
// The model is in germinal-center-model.js.
import * as kit from "../kit.js";
import * as G from "./germinal-center-model.js";

const PALETTE = 10;                 // lineage colors, as in the ten-color "brainbow" mice
const XLO = -2, XHI = 4, NBIN = 48; // log10 affinity relative to the founders' average

function lineageColor(f) {
  const s = kit.colors.series;
  const k = f % PALETTE;
  return k < s.length ? s[k] : kit.alpha(s[k - s.length], 0.42);
}

function rngFor(seed) { const r = kit.rng(seed); return { random: r.random, normal: r.normal }; }

export default function init(plate) {
  if (plate.dataset.variant === "scan") return scan(plate);
  return live(plate);
}

/* ======================= one germinal center ======================= */

function live(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 640 ? 0.72 : 2.2), minHeight: 320, maxHeight: 720,
    label: "Left: histogram of B cell affinities in a simulated germinal center, colored by founder lineage, with the chance of surviving selection overlaid. Right: number of cells after each cycle, colored by lineage.",
  });
  const { ctx } = st;
  const prm = { A: G.DEFAULTS.A, mu: G.DEFAULTS.mu };
  let seed = 3, gc = null, phase = "start", clock = 0, hold = 0, speed = 1, yTop = 60;

  function reset() {
    gc = G.create({ A: prm.A, mu: prm.mu }, rngFor(seed++));
    phase = "start"; clock = 0; hold = 0; yTop = 60;
  }

  const PHASE_T = 0.55; // seconds of wall time per half cycle at normal speed
  function step(dt) {
    if (gc.status !== "running") {
      hold += dt;
      if (hold > 3.5) reset();
      return;
    }
    clock += dt * speed;
    while (clock >= PHASE_T && gc.status === "running") {
      clock -= PHASE_T;
      if (phase === "dark") { G.lightZone(gc); phase = "light"; }
      else { G.darkZone(gc); phase = "dark"; }
    }
  }

  function histogram() {
    const h = Array.from({ length: PALETTE }, () => new Float64Array(NBIN));
    const mean0 = gc.history[0].meanE;
    for (let i = 0; i < gc.n; i++) {
      const x = (mean0 - gc.E[i]) / Math.LN10;  // log10 of affinity relative to the starting average
      const b = Math.floor(((x - XLO) / (XHI - XLO)) * NBIN);
      if (b < 0 || b >= NBIN) continue;
      h[gc.lin[i] % PALETTE][b]++;
    }
    return h;
  }

  function drawHist(r) {
    const c = kit.colors;
    const h = histogram();
    let top = 1;
    for (let b = 0; b < NBIN; b++) { let t = 0; for (let k = 0; k < PALETTE; k++) t += h[k][b]; top = Math.max(top, t); }
    yTop = Math.max(top * 1.1, yTop * 0.96); // follows the population down smoothly as it shrinks
    const A = kit.axes(ctx, r, {
      x: [XLO, XHI], y: [0, yTop], xticks: [-2, -1, 0, 1, 2, 3, 4],
      xfmt: (v) => (v === 0 ? "1" : kit.pow10(v)),
      xlabel: "affinity relative to the cells that started", ylabel: "cells",
    });
    const w = (XHI - XLO) / NBIN;
    for (let b = 0; b < NBIN; b++) {
      let y0 = 0;
      for (let k = 0; k < PALETTE; k++) {
        const v = h[k][b];
        if (!v) continue;
        ctx.fillStyle = lineageColor(k);
        const x0 = A.X(XLO + b * w), x1 = A.X(XLO + (b + 1) * w);
        ctx.fillRect(x0 + 0.5, A.Y(y0 + v), Math.max(1, x1 - x0 - 1), A.Y(y0) - A.Y(y0 + v));
        y0 += v;
      }
    }
    // chance of surviving selection, on its own 0-1 scale
    const mean0 = gc.history[0].meanE;
    const ps = [];
    for (let x = XLO; x <= XHI + 1e-9; x += 0.05) ps.push([x, G.survival(prm.A, mean0 - x * Math.LN10)]);
    const P = { X: A.X, Y: (v) => r.y + r.h - v * r.h };
    kit.line(ctx, ps, P, { color: c.ink, width: 1.4, dash: [5, 4] });
    ctx.save(); ctx.fillStyle = c.muted; ctx.font = kit.font(11, 400); ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("1", r.x + r.w + 5, r.y); ctx.fillText("0", r.x + r.w + 5, r.y + r.h); ctx.restore();
    const xs = Math.log10(1 / prm.A) + 0.15; // label near where half the cells survive
    if (xs > XLO + 0.4 && xs < XHI - 1.2) {
      const text = "chance of passing selection";
      ctx.save(); ctx.font = kit.font(11, 500); const tw = ctx.measureText(text).width; ctx.restore();
      const right = A.X(xs) + tw < r.x + r.w, left = A.X(xs) - 14 - tw > r.x;
      if (right || left) kit.label(ctx, text, right ? A.X(xs) : A.X(xs) - 14, r.y + r.h * 0.5 - 6, { color: c.ink, size: 11, align: right ? "left" : "right" });
    }
    // phase banner
    const msg = gc.status === "refilled" ? `Refilled after ${gc.cycle} cycles: reaction over`
      : gc.status === "failed" ? `All cells died: failed at cycle ${gc.cycle}`
      : gc.status === "stalled" ? `Not refilled after ${gc.cycle} cycles`
      : phase === "dark" ? `Cycle ${gc.cycle + 1} · dark zone: divide, mutate`
      : phase === "light" ? `Cycle ${gc.cycle} · light zone: selection`
      : "Before hypermutation";
    kit.label(ctx, msg, (st.w < 640) ? 12 : r.x, r.y - 26, { color: gc.status === "running" ? c.ink : c.pink, size: 12.5, weight: 700 });
  }

  function drawHistory(r) {
    const c = kit.colors;
    const H = gc.history;
    const xmax = Math.max(12, H.length);
    const ymax = Math.max(gc.p.N0 * 1.25, ...H.map((q) => q.n * 1.05));
    const A = kit.axes(ctx, r, { x: [0, xmax], y: [0, ymax], xlabel: "cycle", ylabel: "cells, by lineage" });
    // stacked areas, one per color
    const cum = H.map(() => 0);
    for (let k = 0; k < PALETTE; k++) {
      const lower = cum.slice();
      for (let t = 0; t < H.length; t++) { let v = 0; for (let f = k; f < gc.p.founders; f += PALETTE) v += H[t].shares[f]; cum[t] += v * H[t].n; }
      ctx.fillStyle = lineageColor(k);
      ctx.beginPath();
      for (let t = 0; t < H.length; t++) ctx[t ? "lineTo" : "moveTo"](A.X(t), A.Y(cum[t]));
      for (let t = H.length - 1; t >= 0; t--) ctx.lineTo(A.X(t), A.Y(lower[t]));
      ctx.closePath(); ctx.fill();
    }
    kit.line(ctx, [[0, gc.p.N0], [xmax, gc.p.N0]], A, { color: c.ink, width: 1.2, dash: [4, 4] });
    kit.label(ctx, "full: the reaction stops here", A.X(xmax) - 4, A.Y(gc.p.N0) - 5, { color: c.ink, size: 11, align: "right" });
  }

  function draw() {
    st.clear();
    const L = (st.w < 640) ? { x: 48, y: 40, w: st.w - 80, h: st.h * 0.5 - 92 } : { x: 52, y: 44, w: st.w * 0.55 - 92, h: st.h - 100 };
    const R = (st.w < 640) ? { x: 48, y: st.h * 0.5 + 40, w: st.w - 68, h: st.h * 0.5 - 92 } : { x: st.w * 0.55 + 40, y: 44, w: st.w * 0.45 - 60, h: st.h - 100 };
    drawHist(L);
    drawHistory(R);
    if (!ro) return;
    // statistics of the cells present right now
    let sE = 0, sM = 0, top = 0, left = 0;
    const per = new Int32Array(gc.p.founders);
    for (let i = 0; i < gc.n; i++) { sE += gc.E[i]; sM += gc.mut[i]; per[gc.lin[i]]++; }
    for (const v of per) { if (v) left++; top = Math.max(top, v); }
    ro.cycle.set(String(gc.cycle));
    ro.cells.set(gc.n.toLocaleString("en-US"));
    ro.gain.set(gc.n ? `${kit.fmtNum(Math.exp(gc.history[0].meanE - sE / gc.n), 1)}×` : "none");
    ro.mut.set(gc.n ? (sM / gc.n).toFixed(1) : "none");
    ro.top.set(gc.n ? `${Math.round((top / gc.n) * 100)}% (${left} of ${gc.p.founders} left)` : "none");
    ro.ps.set(`${Math.round(G.survival(prm.A, gc.history[0].meanE) * 100)}%`);
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  reset();
  const loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "New germinal center", onClick: () => { reset(); loop.redraw(); } });
  ui.select({
    label: "Speed", value: "1",
    options: [{ value: "0.5", label: "slow" }, { value: "1", label: "normal" }, { value: "3", label: "fast" }],
    onChange: (v) => { speed = +v; },
  });
  ui.slider({ label: "Antigen on display, A", min: 0.003, max: 3, log: true, value: prm.A, format: (v) => kit.fmtNum(v, 1), onInput: (v) => { prm.A = v; gc.p.A = v; loop.redraw(); } });
  ui.slider({ label: "Mutation chance per division, μ", min: 0.02, max: 0.5, step: 0.01, value: prm.mu, format: (v) => v.toFixed(2), onInput: (v) => { prm.mu = v; gc.p.mu = v; loop.redraw(); } });
  ro = {
    cycle: ui.readout({ label: "Cycle" }),
    cells: ui.readout({ label: "Cells" }),
    gain: ui.readout({ label: "Affinity gain" }),
    mut: ui.readout({ label: "Mutations per cell" }),
    top: ui.readout({ label: "Largest lineage" }),
    ps: ui.readout({ label: "Founders passing selection" }),
  };
  // with reduced motion the plate starts paused: show a center a few cycles in, so the still frame has content
  if (!loop.playing) { for (let k = 0; k < 6 && gc.status === "running"; k++) G.step(gc); phase = "light"; }
  st.onResize(() => loop.redraw());
  loop.redraw();
}

/* ======================= many germinal centers ======================= */

function scan(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 640 ? 0.8 : 2.4), minHeight: 300, maxHeight: 640,
    label: "Two charts against the amount of antigen on display: the share of simulated germinal centers that refill rather than die out, and the number of hypermutations per cell they end with.",
  });
  const { ctx } = st;
  const LEVELS = Array.from({ length: 17 }, (_, i) => 10 ** (-2.75 + i * 0.1875)); // 0.0018 to 2.4
  const RUNS = 60;
  const s = { mu: G.DEFAULTS.mu, seed: 1, res: [], job: 0 };

  function start() {
    const id = ++s.job;
    s.res = [];
    let i = 0;
    const tick = () => {
      if (id !== s.job) return;
      const t0 = performance.now();
      while (i < LEVELS.length && performance.now() - t0 < 30) {
        const A = LEVELS[i];
        s.res.push({ A, ...G.outcomes({ A, mu: s.mu }, RUNS, (r) => rngFor(s.seed * 100003 + i * 1009 + r)) });
        i++;
      }
      draw();
      if (i < LEVELS.length) setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    const L = (st.w < 640) ? { x: 46, y: 52, w: st.w - 64, h: st.h * 0.5 - 100 } : { x: 52, y: 56, w: st.w * 0.5 - 84, h: st.h - 112 };
    const R = (st.w < 640) ? { x: 46, y: st.h * 0.5 + 48, w: st.w - 64, h: st.h * 0.5 - 100 } : { x: st.w * 0.5 + 40, y: 56, w: st.w * 0.5 - 64, h: st.h - 112 };
    const xo = { x: [LEVELS[0], LEVELS[LEVELS.length - 1]], xlog: true, xticks: [0.01, 0.1, 1], xfmt: (v) => kit.fmtNum(v), xlabel: "antigen on display, A (log scale)" };
    const A = kit.axes(ctx, L, { ...xo, y: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1], yfmt: (v) => `${Math.round(v * 100)}%`, ylabel: "germinal centers that refill" });
    const pts = s.res.map((q) => [q.A, q.refill]);
    kit.line(ctx, pts, A, { color: c.blue, width: 2.2 });
    ctx.fillStyle = c.blue; for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(A.X(x), A.Y(y), 3, 0, 7); ctx.fill(); }

    let ymax = 2;
    for (const q of s.res) if (isFinite(q.mutRefilled)) ymax = Math.max(ymax, q.mutRefilled * 1.12);
    const B = kit.axes(ctx, R, { ...xo, y: [0, ymax], ylabel: "mutations per cell at the end" });
    const ref = s.res.filter((q) => isFinite(q.mutRefilled)).map((q) => [q.A, q.mutRefilled]);
    const per = s.res.map((q) => [q.A, q.mutPerAttempt]);
    kit.line(ctx, ref, B, { color: c.pink, width: 1.6, dash: [5, 4] });
    kit.line(ctx, per, B, { color: c.blue, width: 2.2 });
    ctx.fillStyle = c.blue; for (const [x, y] of per) { ctx.beginPath(); ctx.arc(B.X(x), B.Y(y), 3, 0, 7); ctx.fill(); }
    kit.legend(ctx, [{ label: "all attempts", color: c.blue }, { label: "refilled only", color: c.pink, dash: [5, 4] }], R.x, R.y - 28);

    if (s.res.length === LEVELS.length) {
      let best = s.res[0];
      for (const q of s.res) if (q.mutPerAttempt > best.mutPerAttempt) best = q;
      const bx = B.X(best.A), by = B.Y(best.mutPerAttempt);
      ctx.strokeStyle = c.pink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.stroke();
      ro.best.set(`A ≈ ${kit.fmtNum(best.A, 1)}: ${best.mutPerAttempt.toFixed(1)} per attempt, ${Math.round(best.refill * 100)}% refill`);
      const lenient = s.res[s.res.length - 1];
      ro.lenient.set(`${lenient.mutRefilled.toFixed(1)} mutations, ${kit.fmtNum(10 ** lenient.log10Gain, 1)}× affinity`);
    } else {
      kit.label(ctx, `Simulating… ${s.res.length} of ${LEVELS.length} antigen levels`, st.w - 12, st.h - 6, { color: c.muted, size: 11, align: "right" });
      ro.best.set("…"); ro.lenient.set("…");
    }
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  ui.button({ label: "Run again", primary: true, onClick: () => { s.seed++; start(); } });
  let debounce = 0;
  ui.slider({ label: "Mutation chance per division, μ", min: 0.05, max: 0.5, step: 0.01, value: s.mu, format: (v) => v.toFixed(2), onInput: (v) => { s.mu = v; clearTimeout(debounce); debounce = setTimeout(start, 200); } });
  const ro = {
    best: ui.readout({ label: "Most mutations per attempt" }),
    lenient: ui.readout({ label: "At the most lenient level" }),
  };
  ui.readout({ label: "Centers per level" }).set(String(RUNS));
  st.onResize(draw);
  kit.onThemeChange(draw);
  draw();
  start();
}
