// Kinetic proofreading (Section III A): a receptor bound to its ligand steps through phosphorylation states
// C_0 ... C_N at rate k_p and is reset to C_0 whenever the ligand unbinds (rate k_off = 1/tau_off).
// Two populations of receptors, one bound to an agonist and one to a non-agonist, are simulated exactly
// (event by event), next to the closed-form chance of completing the cascade and the resulting discrimination.
import * as kit from "../kit.js";

const M = 10;        // receptors drawn per ligand type
const NMAX = 20;     // the TCR complex carries about 20 phosphorylation sites

/* ---------- model (checked against the steady state of McKeithan's equations) ---------- */
// One race: the next phosphorylation (k_p) happens before unbinding (k_off = 1/tau).
const stepWin = (kp, tau) => (kp * tau) / (1 + kp * tau);
// Chance that a binding event completes all N steps; also the steady-state share of bound complexes in C_N.
const complete = (N, kp, tau) => stepWin(kp, tau) ** N;
// Steady-state shares of the bound complexes in C_0 ... C_N (the last state only leaves by unbinding).
function shares(N, kp, tau) {
  const r = stepWin(kp, tau), out = [];
  for (let i = 0; i < N; i++) out.push((1 - r) * r ** i);
  out.push(r ** N);
  return out;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n) => String(n).split("").map((d) => SUB[+d]).join("");
const pct = (v) => (v >= 0.001 ? `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%` : kit.fmtNum(v, 1));
const secs = (v) => `${kit.fmtNum(v, 1)} s`;
const p10 = (v) => (v === 1 ? "1" : kit.pow10(Math.round(Math.log10(v))));

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 640 ? w / 740 : w / 545), minHeight: 320, maxHeight: 900,
    label: "Two groups of ten T cell receptors, one bound to an agonist and one to a non-agonist, each shown as a dot stepping right through phosphorylation states and jumping back to the start when its ligand unbinds. Below, two charts against the number of steps: the chance that a binding event reaches the last state, and the ratio of that chance between agonist and non-agonist.",
  });
  const { ctx } = st;
  const rand = kit.rng(3);
  const p = { N: 5, kp: 0.5, tau: [4, 2], speed: 1 };
  let t = 0;

  const lanes = [0, 1].map(() => ({
    s: new Int8Array(M), next: new Float64Array(M), x: new Float32Array(M), done: new Uint8Array(M),
    ended: 0, reached: 0, ghosts: [], hits: [],
  }));

  const rate = (k, s) => (s < p.N ? p.kp + 1 / p.tau[k] : 1 / p.tau[k]);

  // Start every receptor in a state drawn from the steady state, so the picture is right from the first frame.
  function settle() {
    for (let k = 0; k < 2; k++) {
      const L = lanes[k], sh = shares(p.N, p.kp, p.tau[k]);
      for (let i = 0; i < M; i++) {
        let u = rand.random(), s = 0;
        while (s < p.N && u > sh[s]) { u -= sh[s]; s++; }
        L.s[i] = s; L.x[i] = s; L.done[i] = s === p.N ? 1 : 0;
        L.next[i] = t + rand.exp(rate(k, s));
      }
      L.ended = 0; L.reached = 0; L.ghosts = []; L.hits = [];
    }
  }

  // Exact event-driven simulation up to simulated time T.
  function advance(T, show) {
    for (let k = 0; k < 2; k++) {
      const L = lanes[k], koff = 1 / p.tau[k];
      for (let i = 0; i < M; i++) {
        let guard = 0;
        while (L.next[i] <= T && guard++ < 2000) {
          const now = L.next[i];
          if (L.s[i] < p.N && rand.random() < p.kp / (p.kp + koff)) {
            L.s[i]++;
            if (L.s[i] === p.N) { L.done[i] = 1; if (show) L.hits.push({ i, age: 0 }); }
          } else {                                   // the ligand leaves: the receptor is reset, and a new one binds
            L.ended++; if (L.done[i]) L.reached++;
            if (show) L.ghosts.push({ i, x: L.x[i], age: 0 });
            L.s[i] = 0; L.done[i] = 0; L.x[i] = 0;
          }
          L.next[i] = now + rand.exp(rate(k, L.s[i]));
        }
      }
    }
    t = T;
  }

  function step(dt) {
    const show = p.speed <= 4;
    advance(t + dt * p.speed, show);
    const ease = show ? Math.min(1, dt * 10) : 1;
    for (const L of lanes) {
      for (let i = 0; i < M; i++) L.x[i] += (L.s[i] - L.x[i]) * ease;
      for (const g of L.ghosts) g.age += dt;
      for (const h of L.hits) h.age += dt;
      L.ghosts = L.ghosts.filter((g) => g.age < 0.5);
      L.hits = L.hits.filter((h) => h.age < 0.7);
    }
  }

  /* ---------- drawing ---------- */

  function layout() {
    const W = st.w, narrow = W < 640;
    const rowH = narrow ? 8 : 9, laneH = 40 + M * rowH, lanesTop = 6, gap = 12;
    const ln = [0, 1].map((k) => ({ x: 14, y: lanesTop + k * (laneH + gap), w: W - 28, rowH, narrow }));
    const top = lanesTop + 2 * laneH + gap + 20;
    let charts;
    if (narrow) {
      const blk = (st.h - top - 4) / 2;
      charts = [0, 1].map((k) => ({ x: 52, y: top + k * blk + 44, w: W - 70, h: blk - 44 - 46 }));
    } else {
      const cw = (W - 58 - 18 - 76) / 2;
      charts = [0, 1].map((k) => ({ x: 58 + k * (cw + 76), y: top + 44, w: cw, h: st.h - top - 44 - 46 }));
    }
    return { lanes: ln, charts };
  }

  function drawLane(k, b) {
    const c = kit.colors, L = lanes[k], col = k === 0 ? c.blue : c.brown, n = p.N;
    const colW = b.w / (n + 1), cx = (j) => b.x + (j + 0.5) * colW;
    const tracksTop = b.y + 36, tracksH = M * b.rowH;
    const who = k === 0 ? "Agonist" : "Non-agonist";
    const title = b.narrow ? `${who}, τ_off = ${secs(p.tau[k])}` : `${who}, bound for ${secs(p.tau[k])} on average`;
    kit.label(ctx, title, b.x, b.y + 13, { color: col, size: 12.5, weight: 700 });
    const est = L.ended ? `${L.reached} of ${L.ended}${b.narrow ? "" : " bindings"} reached C${sub(n)}` : "";
    if (est) kit.label(ctx, est, b.x + b.w, b.y + 13, { color: c.muted, size: 11.5, weight: 400, align: "right" });
    // the activation state
    ctx.fillStyle = kit.alpha(c.pink, 0.12);
    ctx.fillRect(b.x + n * colW + 1, b.y + 20, colW - 2, tracksH + 18);
    // column labels
    const every = colW >= 27 ? 1 : colW >= 15 ? 5 : 10;
    ctx.save();
    ctx.font = kit.font(11, 500); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let j = 0; j <= n; j++) {
      if (j !== 0 && j !== n && j % every) continue;
      if (j !== n && n - j < every && every > 1) continue;
      ctx.fillStyle = j === n ? c.pink : c.muted;
      ctx.fillText("C" + sub(j), cx(j), b.y + 28);
    }
    ctx.restore();
    // tracks
    ctx.save();
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < M; i++) { const y = Math.round(tracksTop + (i + 0.5) * b.rowH) + 0.5; ctx.moveTo(cx(0), y); ctx.lineTo(cx(n), y); }
    ctx.stroke();
    ctx.fillStyle = c.grid;
    for (let j = 0; j <= n; j++) ctx.fillRect(Math.round(cx(j)), tracksTop + 1, 1, tracksH - 2);
    const rad = Math.min(3.8, b.rowH * 0.42, colW * 0.3 + 1.2);
    for (const g of L.ghosts) {
      const y = tracksTop + (g.i + 0.5) * b.rowH, a = 1 - g.age / 0.5;
      ctx.strokeStyle = kit.alpha(c.muted, 0.7 * a); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx(g.x), y, rad + 2 + 4 * (1 - a), 0, 7); ctx.stroke();
    }
    for (const h of L.hits) {
      const y = tracksTop + (h.i + 0.5) * b.rowH, a = 1 - h.age / 0.7;
      ctx.strokeStyle = kit.alpha(c.pink, 0.9 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx(n), y, rad + 2 + 9 * (1 - a), 0, 7); ctx.stroke();
    }
    for (let i = 0; i < M; i++) {
      const y = tracksTop + (i + 0.5) * b.rowH;
      ctx.fillStyle = L.s[i] === n ? c.pink : col;
      ctx.beginPath(); ctx.arc(cx(Math.min(L.x[i], n)), y, rad, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function drawCharts(r1, r2) {
    const c = kit.colors, N = p.N;
    const Ns = Array.from({ length: NMAX }, (_, i) => i + 1);
    const xo = { x: [1, NMAX], xticks: [1, 5, 10, 15, 20], xfmt: (v) => String(v), xlabel: "number of steps, N" };
    // left: chance to complete the cascade
    const A = kit.axes(ctx, r1, { ...xo, y: [1e-8, 1], ylog: true, yticks: [1e-8, 1e-6, 1e-4, 1e-2, 1], yfmt: p10, ylabel: "chance a binding reaches the last state" });
    ctx.save(); A.clip();
    kit.line(ctx, [[N, 1e-8], [N, 1]], A, { color: c.muted, width: 1, dash: [3, 4] });
    kit.line(ctx, Ns.map((n) => [n, complete(n, p.kp, p.tau[0])]), A, { color: c.blue, width: 2 });
    kit.line(ctx, Ns.map((n) => [n, complete(n, p.kp, p.tau[1])]), A, { color: c.brown, width: 2 });
    for (const k of [0, 1]) {
      const v = complete(N, p.kp, p.tau[k]);
      ctx.fillStyle = k ? c.brown : c.blue;
      ctx.beginPath(); ctx.arc(A.X(N), A.Y(Math.max(v, 1e-9)), 4, 0, 7); ctx.fill();
    }
    ctx.restore();
    kit.legend(ctx, [{ label: "agonist", color: c.blue }, { label: "non-agonist", color: c.brown }], r1.x, r1.y - 32);

    // right: discrimination
    const ratio = (n) => (stepWin(p.kp, p.tau[0]) / stepWin(p.kp, p.tau[1])) ** n;
    const ideal = (n) => (p.tau[0] / p.tau[1]) ** n;
    const B = kit.axes(ctx, r2, { ...xo, y: [1, 1e8], ylog: true, yticks: [1, 1e2, 1e4, 1e6, 1e8], yfmt: p10, ylabel: "agonist ÷ non-agonist" });
    ctx.save(); B.clip();
    kit.line(ctx, [[N, 1], [N, 1e8]], B, { color: c.muted, width: 1, dash: [3, 4] });
    kit.line(ctx, Ns.map((n) => [n, Math.min(ideal(n), 1e9)]), B, { color: c.teal, width: 1.6, dash: [6, 5] });
    kit.line(ctx, Ns.map((n) => [n, Math.min(ratio(n), 1e9)]), B, { color: c.teal, width: 2.2 });
    const v = ratio(N);
    if (v >= 1) { ctx.fillStyle = c.teal; ctx.beginPath(); ctx.arc(B.X(N), B.Y(Math.min(v, 1e8)), 4, 0, 7); ctx.fill(); }
    ctx.restore();
    if (p.tau[1] >= p.tau[0]) kit.label(ctx, "the non-agonist now binds at least as long as the agonist", r2.x + 8, r2.y + 16, { color: c.pink, size: 11.5 });
    kit.legend(ctx, [{ label: "at this k_p", color: c.teal }, { label: "slow-step limit (τa/τn)ᴺ", color: c.teal, dash: [6, 5] }], r2.x, r2.y - 32);
  }

  function draw() {
    st.clear();
    const Lo = layout();
    drawLane(0, Lo.lanes[0]);
    drawLane(1, Lo.lanes[1]);
    drawCharts(Lo.charts[0], Lo.charts[1]);
    if (!ro) return;
    const pa = complete(p.N, p.kp, p.tau[0]), pn = complete(p.N, p.kp, p.tau[1]);
    ro.a.set(pct(pa));
    ro.n.set(pct(pn));
    ro.r.set(`${kit.fmtNum(pa / pn, 2)} (limit ${kit.fmtNum((p.tau[0] / p.tau[1]) ** p.N, 2)})`);
    ro.t.set(secs(p.N / p.kp));
  }

  /* ---------- controls ---------- */

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  settle();
  advance(t + 120, false);                          // a head start, so a still frame already has counts
  const loop = kit.animate(plate, { step, draw: () => draw(), ui });
  const changed = () => { settle(); advance(t + 60, false); loop.redraw(); };
  ui.button({ label: "Reset counts", onClick: () => { settle(); loop.redraw(); } });
  ui.select({
    label: "Speed", value: "1",
    options: [{ value: "1", label: "real time" }, { value: "4", label: "4 times" }, { value: "16", label: "16 times" }, { value: "64", label: "64 times" }],
    onChange: (v) => { p.speed = +v; },
  });
  ui.slider({ label: "Proofreading steps, N", min: 1, max: NMAX, step: 1, value: p.N, format: (v) => String(Math.round(v)), onInput: (v) => { p.N = Math.round(v); changed(); } });
  ui.slider({ label: "Phosphorylation rate, k_p", min: 0.05, max: 5, log: true, value: p.kp, format: (v) => `${kit.fmtNum(v, 1)} per s`, onInput: (v) => { p.kp = v; changed(); } });
  ui.slider({ label: "Agonist lifetime, τ_off", min: 1, max: 10, log: true, value: p.tau[0], format: secs, onInput: (v) => { p.tau[0] = v; changed(); } });
  ui.slider({ label: "Non-agonist lifetime, τ_off", min: 0.3, max: 3, log: true, value: p.tau[1], format: secs, onInput: (v) => { p.tau[1] = v; changed(); } });
  ro = {
    a: ui.readout({ label: "Agonist reaches the end" }),
    n: ui.readout({ label: "Non-agonist reaches the end" }),
    r: ui.readout({ label: "Agonist ÷ non-agonist" }),
    t: ui.readout({ label: "Time for N steps, N/k_p" }),
  };
  st.onResize(() => loop.redraw());
  loop.redraw();
}
