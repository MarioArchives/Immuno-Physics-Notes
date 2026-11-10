// Sharing by chance (Section VI E): n people each sample N sequences from the same toy recombination model.
// Left: how many sequences are found in exactly m people, simulated (bars) and predicted from the generating function
//   g(x) = sum_s prod_i [ e^{-N p(s)} + (1 - e^{-N p(s)}) x ]   (dots).
// Right: generation probabilities of the sequences in each sharing class. Shared sequences are the probable ones,
//   because sharing by m people weights each sequence by about p(s)^m (a lower "temperature" 1/m).
// The sums over all possible sequences are estimated from a reference sample s_k ~ Pgen: sum_s f(p_s) = E[f(p_k) / p_k].
import * as kit from "../kit.js";
import { TOY, sampleSequence, pgenCache } from "./vdj-model.js";

const REF = 12000;        // reference sample size
const SUB = 2500;         // singletons whose Pgen is evaluated for the right-hand chart
const LO = -11, HI = -3;  // log10 Pgen range shown
const NB = 32;            // histogram bins

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 640 ? 0.62 : 2.2), minHeight: 320, maxHeight: 720,
    label: "Two charts. Left: the number of sequences found in exactly 1, 2, 3 and more people of a simulated cohort, with the theoretical prediction. Right: the generation probabilities of sequences found in one person, in two, and in three or more, compared with all generated sequences.",
  });
  const { ctx } = st;
  const pg = pgenCache(TOY);
  const s = { n: 4, N: 4000, seed: 1, ref: null, sim: null, busy: "" };
  const binom = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return c; };
  const bin = (p) => Math.min(NB - 1, Math.max(0, Math.floor(((Math.log10(p) - LO) / (HI - LO)) * NB)));
  const classOf = (m) => (m >= 3 ? 3 : m); // 1, 2, or 3 = "three or more"

  /* ---------- cooperative computation, in slices so the page stays responsive ---------- */
  let job = 0;
  function runJob(gen) {
    const id = ++job;
    const tick = () => {
      if (id !== job) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 24) { if (gen.next().done) { draw(); return; } }
      draw();
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  }

  function* buildRef() {
    s.busy = "Sampling the recombination model…";
    const r = kit.rng(4242), ref = new Float64Array(REF);
    for (let k = 0; k < REF; k++) { ref[k] = pg(sampleSequence(TOY, r.random)); if (k % 200 === 0) yield; }
    let s2 = 0; for (const p of ref) s2 += p;
    s.ref = { p: ref, sumP2: s2 / REF };
  }

  function* simulate() {
    if (!s.ref) yield* buildRef();
    s.busy = "Drawing the cohort…";
    const { n, N } = s, r = kit.rng(1000 + s.seed);
    const count = new Map(), distinct = [], first = [];
    for (let i = 0; i < n; i++) {
      const mine = new Set();
      for (let k = 0; k < N; k++) { mine.add(sampleSequence(TOY, r.random)); if (k % 500 === 0) yield; }
      distinct.push(mine.size);
      if (i < 2) first.push(mine);
      for (const q of mine) count.set(q, (count.get(q) || 0) + 1);
    }
    const Mm = new Array(n + 1).fill(0);
    for (const c of count.values()) Mm[c]++;
    let pair = 0;
    for (const q of first[0]) if (first[1].has(q)) pair++;
    // Pgen of every shared sequence and of a subsample of the singletons
    s.busy = "Computing generation probabilities…";
    const hist = [null, new Float64Array(NB), new Float64Array(NB), new Float64Array(NB)];
    const keep = Math.min(1, SUB / Math.max(1, Mm[1]));
    let k = 0;
    for (const [q, c] of count) {
      if (c === 1 && r.random() > keep) continue;
      hist[classOf(c)][bin(pg(q))]++;
      if (++k % 100 === 0) yield;
    }
    s.sim = { n, N, Mm, hist, pair, distinct: distinct.reduce((a, b) => a + b, 0) / n };
    s.busy = "";
  }

  function theory(n, N) {
    const { p } = s.ref;
    const M = new Float64Array(n + 1), hist = [null, new Float64Array(NB), new Float64Array(NB), new Float64Array(NB)], all = new Float64Array(NB);
    for (let k = 0; k < p.length; k++) {
      const pi = -Math.expm1(-N * p[k]), b = bin(p[k]);
      all[b]++;
      for (let m = 1; m <= n; m++) {
        const w = (binom(n, m) * pi ** m * (1 - pi) ** (n - m)) / p[k];
        M[m] += w; hist[classOf(m)][b] += w;
      }
    }
    for (let m = 1; m <= n; m++) M[m] /= p.length;
    return { M, hist, all };
  }

  /* ---------- drawing ---------- */
  const norm = (h) => { let t = 0; for (const v of h) t += v; return Array.from(h, (v) => (t ? v / t / ((HI - LO) / NB) : 0)); };

  function draw() {
    const c = kit.colors;
    st.clear();
    const narrow = st.w < 640;
    const L = narrow ? { x: 52, y: 44, w: st.w - 70, h: st.h * 0.5 - 98 } : { x: 58, y: 48, w: st.w * 0.42 - 70, h: st.h - 104 };
    const R = narrow ? { x: 22, y: st.h * 0.5 + 44, w: st.w - 40, h: st.h * 0.5 - 98 } : { x: st.w * 0.42 + 40, y: 48, w: st.w * 0.58 - 60, h: st.h - 104 };
    if (!s.sim || !s.ref) {
      kit.label(ctx, s.busy || "Preparing…", st.w / 2, st.h / 2, { color: c.muted, align: "center" });
      return;
    }
    const sim = s.sim, th = theory(sim.n, sim.N);
    const classColor = [null, c.blue, c.teal, c.pink];

    // left: sequences found in exactly m people
    const ymax = Math.max(10, ...sim.Mm.slice(1), ...th.M.slice(1)) * 2;
    const ticksY = []; for (let e = 0; 10 ** e <= ymax; e++) ticksY.push(10 ** e);
    const A = kit.axes(ctx, L, {
      x: [0.4, sim.n + 0.6], y: [0.5, ymax], ylog: true, yticks: ticksY,
      xticks: Array.from({ length: sim.n }, (_, i) => i + 1), xfmt: (v) => String(v),
      xlabel: "found in exactly m people", ylabel: "number of sequences",
    });
    const bw = Math.min(34, (L.w / sim.n) * 0.6);
    for (let m = 1; m <= sim.n; m++) {
      const v = sim.Mm[m];
      if (v > 0) { const y = A.Y(v); ctx.fillStyle = kit.alpha(classColor[classOf(m)], 0.8); ctx.fillRect(A.X(m) - bw / 2, y, bw, L.y + L.h - y); }
      const t = th.M[m];
      if (t >= 0.5) {
        ctx.fillStyle = c.ink;
        ctx.beginPath(); ctx.arc(A.X(m), A.Y(t), 3.6, 0, 7); ctx.fill();
      }
    }
    kit.label(ctx, "bars: this cohort", L.x - 40, L.y - 30, { color: c.ink, size: 11.5 });
    ctx.save(); ctx.fillStyle = c.ink; ctx.font = kit.font(11.5, 500); ctx.textBaseline = "alphabetic";
    const lx = L.x + 66; ctx.beginPath(); ctx.arc(lx + 4, L.y - 34, 3.6, 0, 7); ctx.fill(); ctx.fillText("dots: theory", lx + 12, L.y - 30); ctx.restore();

    // right: Pgen of each sharing class
    const dens = [null, norm(sim.hist[1]), norm(sim.hist[2]), norm(sim.hist[3])];
    const tdens = [null, norm(th.hist[1]), norm(th.hist[2]), norm(th.hist[3])], tall = norm(th.all);
    let dmax = 0.05; for (const d of [...dens.slice(1), ...tdens.slice(1), tall]) for (const v of d) dmax = Math.max(dmax, v);
    const B = kit.axes(ctx, R, {
      x: [LO, HI], y: [0, dmax * 1.08], xticks: [-11, -9, -7, -5, -3], xfmt: (v) => kit.pow10(v), yticks: [],
      xlabel: "Pgen(s) of the sequences in each group",
    });
    const w = (HI - LO) / NB, mid = (b) => LO + (b + 0.5) * w;
    ctx.save(); B.clip();
    // all generated sequences, as a filled outline
    ctx.fillStyle = kit.alpha(c.muted, 0.16);
    ctx.beginPath(); ctx.moveTo(B.X(LO), B.Y(0));
    for (let b = 0; b < NB; b++) { ctx.lineTo(B.X(LO + b * w), B.Y(tall[b])); ctx.lineTo(B.X(LO + (b + 1) * w), B.Y(tall[b])); }
    ctx.lineTo(B.X(HI), B.Y(0)); ctx.closePath(); ctx.fill();
    for (let k = 1; k <= 3; k++) {
      if (k > sim.n) continue;
      const simTotal = sim.hist[k].reduce((a, b) => a + b, 0);
      kit.line(ctx, Array.from({ length: NB }, (_, b) => [mid(b), tdens[k][b]]), B, { color: classColor[k], width: 1.4, dash: [5, 4] });
      if (simTotal >= 5) kit.line(ctx, Array.from({ length: NB }, (_, b) => [mid(b), dens[k][b]]), B, { color: classColor[k], width: 2.2 });
    }
    ctx.restore();
    const items = [{ label: "found in 1 person", color: c.blue }, { label: "in 2", color: c.teal }];
    if (sim.n >= 3) items.push({ label: "in 3+", color: c.pink });
    kit.legend(ctx, items, R.x, R.y - 32);
    const lw = kit.legend(ctx, [{ label: "theory", color: c.muted, dash: [5, 4] }], R.x, R.y - 14);
    ctx.fillStyle = kit.alpha(c.muted, 0.3); ctx.fillRect(R.x + lw, R.y - 19, 16, 10);
    kit.label(ctx, "everything generated", R.x + lw + 21, R.y - 10, { color: c.ink, size: 11.5 });

    if (s.busy) kit.label(ctx, s.busy, st.w - 12, st.h - 6, { color: c.muted, size: 11, align: "right" });

    // readouts
    let shared = 0, sharedTh = 0;
    for (let m = 2; m <= sim.n; m++) { shared += sim.Mm[m]; sharedTh += th.M[m]; }
    ro.distinct.set(Math.round(sim.distinct).toLocaleString("en-US"));
    ro.shared.set(`${shared.toLocaleString("en-US")} (theory ${Math.round(sharedTh).toLocaleString("en-US")})`);
    ro.pair.set(`${sim.pair.toLocaleString("en-US")} (N²Σp² gives ${Math.round(sim.N * sim.N * s.ref.sumP2).toLocaleString("en-US")})`);
  }

  /* ---------- controls ---------- */
  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const go = () => runJob(simulate());
  let debounce = 0;
  const later = () => { clearTimeout(debounce); debounce = setTimeout(go, 180); };
  ui.button({ label: "New cohort", primary: true, onClick: () => { s.seed++; go(); } });
  ui.slider({ label: "People in the cohort, n", min: 2, max: 8, step: 1, value: s.n, format: (v) => String(v), onInput: (v) => { s.n = v; later(); } });
  ui.slider({ label: "Sequences sampled per person, N", min: 300, max: 12000, log: true, value: s.N, format: (v) => Math.round(v).toLocaleString("en-US"), onInput: (v) => { s.N = Math.round(v); later(); } });
  const ro = {
    distinct: ui.readout({ label: "Distinct sequences per person" }),
    shared: ui.readout({ label: "Found in 2 or more people" }),
    pair: ui.readout({ label: "Shared by persons 1 and 2" }),
  };
  st.onResize(draw);
  kit.onThemeChange(draw);
  if (document.fonts) document.fonts.ready.then(draw);
  draw();
  go();
}
