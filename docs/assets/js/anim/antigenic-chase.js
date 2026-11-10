// Section IX B: a virus population chased through a one-dimensional antigenic space by the immune memory of its hosts.
// Multi-strain SIR dynamics with the closed-form susceptibility S_a = exp(-sum_b K_ab R_b), K_ab = exp(-|a-b|/d),
// simulated stochastically (tau-leaping) so that the nose of the wave is made of individual infections.
import * as kit from "../kit.js";

// ---- model (pure, no DOM; tested in Node) ----
function makeRandom(seed) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, r;
    do { u = 2 * random() - 1; v = 2 * random() - 1; r = u * u + v * v; } while (r >= 1 || r === 0);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = v * f;
    return u * f;
  };
  const poisson = (lam) => {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal()));
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= random(); } while (p > L);
    return k - 1;
  };
  const binomial = (n, p) => {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    if (n < 40) { let k = 0; for (let i = 0; i < n; i++) if (random() < p) k++; return k; }
    const m = n * p, q = n * (1 - p);
    if (m < 30) return Math.min(n, poisson(m));
    if (q < 30) return n - Math.min(n, poisson(q));
    return Math.min(n, Math.max(0, Math.round(m + Math.sqrt(m * (1 - p)) * normal())));
  };
  return { random, normal, poisson, binomial, reseed(s) { a = s >>> 0; spare = null; } };
}

// out[i] = sum_j exp(-|i-j|/d) R[j], plus `tail`, the forward sum at index -1 (immunity to strains that scrolled off the left).
function crossImmunity(R, d, tail, out) {
  const a = Math.exp(-1 / d), L = R.length;
  let f = tail;
  for (let i = 0; i < L; i++) { f = f * a + R[i]; out[i] = f; }
  let b = 0;
  for (let i = L - 1; i >= 0; i--) { out[i] += b; b = a * (R[i] + b); }
  return out;
}

// Strains sit on a line; index i is antigenic position offset + i, counted in mutations from the first strain.
// n[i]: infected hosts carrying strain i. R[i]: fraction of hosts who have recovered from strain i.
// Each new infection is a transmission; with probability mu it carries a mutation that moves the strain one step on.
function createChase(o = {}) {
  const p = Object.assign({ L: 256, N: 1e10, R0: 2, nu: 0.25, dt: 0.1, mu: 3e-5, d: 15, seed: 5 }, o);
  const rnd = makeRandom(p.seed);
  const L = p.L;
  const R = new Float64Array(L), n = new Float64Array(L), C = new Float64Array(L);
  // lo..hi: occupied strains. top: furthest strain ever occupied (R is zero beyond it).
  // fIdx, fSum: cached forward kernel sum up to fIdx < lo; immunity there is final, since mutations only move forward.
  const s = { p, R, n, C, offset: 0, tail: 0, t: 0, lo: 0, hi: 0, top: 0, fIdx: -1, fSum: 0, extinct: false, hist: [], clock: 0, mark: 0 };

  s.reset = (seed = p.seed) => {
    R.fill(0); n.fill(0); C.fill(0);
    rnd.reseed(seed);
    s.offset = -Math.round(L * 0.45); s.t = 0; s.extinct = false; s.hist = []; s.clock = 0; s.mark = 0;
    // Start from hosts who are already immune to every strain behind position 0 (a past wave), with the
    // density that puts position 0 at zero fitness, and seed infections there.
    const i0 = -s.offset, rho = Math.log(p.R0) / (p.d + 0.5);
    for (let i = 0; i < i0; i++) R[i] = rho;
    s.tail = rho / (1 - Math.exp(-1 / p.d));
    n[i0] = Math.round(1e-4 * p.N);
    s.lo = s.hi = s.top = i0;
    s.fIdx = -1; s.fSum = s.tail;
    crossImmunity(R, p.d, s.tail, C);
  };

  // growth rate per day of strain i: beta S - nu, with beta = R0 nu
  s.fitness = (i) => p.R0 * p.nu * Math.exp(-C[i]) - p.nu;

  // C over lo..top only, which is all a step needs; exact, because R is frozen below lo and zero above top.
  function localImmunity() {
    const a = Math.exp(-1 / p.d);
    while (s.fIdx < s.lo - 1) { s.fIdx++; s.fSum = s.fSum * a + R[s.fIdx]; }
    let f = s.fSum;
    for (let i = s.lo; i <= s.top; i++) { f = f * a + R[i]; C[i] = f; }
    let b = 0;
    for (let i = s.top; i >= s.lo; i--) { C[i] += b; b = a * (R[i] + b); }
  }

  function shift(k) {
    const a = Math.exp(-1 / p.d);
    let f = s.tail;
    for (let j = 0; j < k; j++) f = f * a + R[j];   // forward sum up to index k - 1 becomes the new tail
    s.tail = f;
    // the cached sum keeps its absolute position (k <= lo, so the dropped bins are final)
    if (s.fIdx >= k - 1) s.fIdx -= k; else { s.fIdx = -1; s.fSum = f; }
    R.copyWithin(0, k); n.copyWithin(0, k);
    R.fill(0, L - k); n.fill(0, L - k);
    s.offset += k; s.lo -= k; s.hi -= k; s.top -= k;
  }

  s.step = () => {
    if (s.extinct) return;
    const { dt, nu, mu, N } = p, beta = p.R0 * p.nu;
    localImmunity();
    for (let i = Math.min(L - 2, s.hi); i >= s.lo; i--) {   // top down, so mutants are not stepped twice
      const ni = n[i];
      if (ni <= 0) continue;
      const births = rnd.poisson(beta * Math.exp(-C[i]) * ni * dt);
      const mut = births > 0 ? Math.min(births, rnd.poisson(births * mu)) : 0;
      const rec = rnd.binomial(ni, nu * dt);
      n[i] = ni + births - mut - rec;
      n[i + 1] += mut;
      R[i] += rec / N;
    }
    let lo = -1, hi = -1;
    for (let i = s.lo; i <= Math.min(L - 1, s.hi + 1); i++) if (n[i] > 0) { if (lo < 0) lo = i; hi = i; }
    s.t += dt;
    if (hi < 0) { s.extinct = true; return; }
    s.lo = lo; s.hi = hi; if (hi > s.top) s.top = hi;
    if (hi > L - 40) shift(hi - Math.round(L * 0.6));
    s.clock += dt;
    if (s.clock >= 10) { s.clock = 0; s.record(); }
  };

  s.total = () => { let I = 0; for (let i = s.lo; i <= s.hi; i++) I += n[i]; return I; };

  // Snapshot of the wave: mean position, nose, fitness gained per mutation (slope of fitness across the
  // population, per day) and the nose fitness relative to the mean.
  s.measure = () => {
    crossImmunity(R, p.d, s.tail, C);
    let I = 0, X = 0, F = 0, XX = 0, XF = 0;
    for (let i = s.lo; i <= s.hi; i++) {
      const w = n[i]; if (!w) continue;
      const f = s.fitness(i);
      I += w; X += w * i; F += w * f; XX += w * i * i; XF += w * i * f;
    }
    if (!I) return null;
    const xm = X / I, fm = F / I, varx = XX / I - xm * xm;
    return {
      I, mean: s.offset + xm, nose: s.offset + s.hi, lead: s.hi - xm, meanFit: fm,
      s: varx > 0.02 ? (XF / I - xm * fm) / varx : NaN,
      fNose: s.fitness(s.hi) - fm,
    };
  };

  s.record = () => {
    const m = s.measure();
    if (!m) return;
    s.hist.push({ t: s.t, mean: m.mean, nose: m.nose, I: m.I, s: m.s, fNose: m.fNose, lead: m.lead });
    if (s.hist.length > 2600) s.hist.shift();
  };

  // Averages over the last `span` days since the parameters last changed (s.mark).
  // v: speed in mutations per day (least squares), r: the text's rate f_m / ln(f_m / mu), per day.
  s.stats = (span = 20 * 365) => {
    const h = s.hist;
    if (!h.length) return null;
    const t1 = h[h.length - 1].t, t0 = Math.max(s.mark, t1 - span);
    let k = h.length - 1; while (k > 0 && h[k - 1].t >= t0) k--;
    const rows = h.slice(k);
    if (rows.length < 30) return { ready: false, days: t1 - t0 };
    let n0 = 0, st = 0, sx = 0, stt = 0, stx = 0, fN = 0, sl = 0, ns = 0, lead = 0;
    for (const r of rows) {
      n0++; st += r.t; sx += r.mean; stt += r.t * r.t; stx += r.t * r.mean;
      fN += r.fNose; lead += r.lead;
      if (Number.isFinite(r.s)) { sl += r.s; ns++; }
    }
    const v = (n0 * stx - st * sx) / (n0 * stt - st * st);
    const fm = fN / n0, sMean = ns ? sl / ns : NaN;
    const r = fm > p.mu ? fm / Math.log(fm / p.mu) : NaN;
    const q = fm / sMean;
    return { ready: true, v, fm, s: sMean, r, q, lead: lead / n0, split: r * Math.exp(-p.d / q), t0 };
  };

  s.reset();
  return s;
}
// ---- end model ----

const YEAR = 365;

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 640 ? w / 600 : 2.05), minHeight: 320, maxHeight: 640,
    label: "Simulation of a virus population moving through a one-dimensional antigenic space. One panel shows the share of hosts protected against each strain, another the number of infected hosts per strain on a log scale, and a third the position of the wave over time.",
  });
  const { ctx } = st;
  const model = createChase();
  const view = { left: null, yearsPerSec: 3, W: 60, seed: model.p.seed, d: model.p.d };
  let dTimer = 0;

  function restart() {
    model.p.d = view.d;
    // a 20-year head start, so the first frame shows a settled wave; try another seed if the virus dies out meanwhile
    for (let tries = 0; tries < 8; tries++) {
      model.reset(view.seed);
      for (let k = 0; k < (20 * YEAR) / model.p.dt && !model.extinct; k++) model.step();
      if (!model.extinct) break;
      view.seed += 1;
    }
    view.left = null;
  }

  function step(dt) {
    if (model.extinct) return;
    const n = Math.min(1500, Math.round((dt * view.yearsPerSec * YEAR) / model.p.dt));
    for (let k = 0; k < n; k++) model.step();
  }

  /* ---------- drawing ---------- */

  function layout() {
    if (st.w < 640) {
      const x = 52, w = st.w - x - 14;
      return { imm: { x, y: 30, w, h: 88 }, inf: { x, y: 146, w, h: 160 }, tr: { x, y: 386, w, h: st.h - 386 - 46 } };
    }
    const lw = Math.round(st.w * 0.6);
    const x = 56, w = lw - x - 10;
    return { imm: { x, y: 30, w, h: Math.round(st.h * 0.24) }, inf: { x, y: Math.round(st.h * 0.24) + 48, w, h: st.h - Math.round(st.h * 0.24) - 48 - 50 },
      tr: { x: lw + 62, y: 30, w: st.w - lw - 62 - 18, h: st.h - 30 - 50 } };
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    const Lo = layout();
    const m = model.measure();
    const stats = model.stats();
    const p = model.p;

    // camera follows the mean position, keeping most of the window behind the wave
    if (m) {
      const target = m.mean - view.W * 0.7;
      view.left = view.left === null ? target : view.left + (target - view.left) * 0.15;
    }
    const x0 = Math.max(view.left ?? 0, model.offset), x1 = x0 + view.W;
    const idx = (x) => Math.round(x - model.offset);

    // --- immunity panel: share of hosts protected against each strain, 1 - S
    const Ai = kit.axes(ctx, Lo.imm, { x: [x0, x1], y: [0, 1], xticks: [], yticks: [0, 0.5, 1], yfmt: (v) => (v === 0.5 ? "½" : String(v)), ylabel: "hosts protected against each strain" });
    ctx.save(); Ai.clip();
    ctx.beginPath();
    ctx.moveTo(Ai.X(x0), Ai.Y(0));
    for (let x = Math.ceil(x0); x <= x1; x++) {
      const i = idx(x); if (i < 0 || i >= p.L) continue;
      ctx.lineTo(Ai.X(x), Ai.Y(1 - Math.exp(-model.C[i])));
    }
    ctx.lineTo(Ai.X(x1), Ai.Y(0)); ctx.closePath();
    ctx.fillStyle = kit.alpha(c.brown, 0.28); ctx.fill();
    ctx.beginPath();
    let pen = false;
    for (let x = Math.ceil(x0); x <= x1; x++) {
      const i = idx(x); if (i < 0 || i >= p.L) continue;
      const y = Ai.Y(1 - Math.exp(-model.C[i]));
      if (pen) ctx.lineTo(Ai.X(x), y); else { ctx.moveTo(Ai.X(x), y); pen = true; }
    }
    ctx.strokeStyle = c.brown; ctx.lineWidth = 2; ctx.stroke();
    const thr = 1 - 1 / p.R0;
    kit.line(ctx, [[x0, thr], [x1, thr]], Ai, { color: c.ink, width: 1, dash: [4, 4] });
    ctx.restore();
    kit.label(ctx, "a strain grows only below the dashed line", Lo.imm.x + Lo.imm.w - 4, Ai.Y(thr) - 5, { color: c.muted, size: 11, weight: 400, align: "right" });

    // --- infected panel: hosts infected with each strain, log scale
    const Af = kit.axes(ctx, Lo.inf, {
      x: [x0, x1], y: [0.3, 3e9], ylog: true, yticks: [1, 1e3, 1e6, 1e9], xfmt: (v) => String(v).replace("-", "−"),
      xlabel: "antigenic position, in mutations from the first strain", ylabel: "infected hosts carrying each strain",
    });
    ctx.save(); Af.clip();
    const bw = Math.max(1.5, (Lo.inf.w / view.W) * 0.8);
    for (let i = model.lo; i <= model.hi; i++) {
      const v = model.n[i]; if (v <= 0) continue;
      const x = model.offset + i; if (x < x0 - 1 || x > x1 + 1) continue;
      const nose = i === model.hi;
      ctx.fillStyle = nose ? c.pink : c.blue;
      const y = Af.Y(Math.max(1, v));
      ctx.fillRect(Af.X(x) - bw / 2, y, bw, Af.Y(0.3) - y);
    }
    ctx.restore();
    if (m && !model.extinct) {
      const nx = Af.X(m.nose), ny = Af.Y(Math.max(1, model.n[model.hi]));
      kit.label(ctx, "nose", Math.min(nx + 6, Lo.inf.x + Lo.inf.w - 30), Math.max(Lo.inf.y + 12, ny - 6), { color: c.pink, size: 11.5, weight: 700 });
      // mean position marker
      const mx = Af.X(m.mean);
      ctx.fillStyle = c.ink;
      ctx.beginPath(); ctx.moveTo(mx, Lo.inf.y + Lo.inf.h - 1); ctx.lineTo(mx - 5, Lo.inf.y + Lo.inf.h - 10); ctx.lineTo(mx + 5, Lo.inf.y + Lo.inf.h - 10); ctx.closePath(); ctx.fill();
      kit.label(ctx, "mean", mx - 8, Lo.inf.y + Lo.inf.h - 13, { color: c.muted, size: 11, weight: 500, align: "right" });
    }
    if (model.extinct) {
      kit.label(ctx, `The virus died out in year ${Math.round(model.t / YEAR)}: immunity caught up with it.`, Lo.inf.x + Lo.inf.w / 2, Lo.inf.y + Lo.inf.h / 2 - 8, { color: c.pink, size: 13, weight: 700, align: "center" });
      kit.label(ctx, "Press Reset to start again.", Lo.inf.x + Lo.inf.w / 2, Lo.inf.y + Lo.inf.h / 2 + 12, { color: c.muted, size: 12, weight: 500, align: "center" });
    }

    // --- trace panel: position against time
    drawTrace(Lo.tr, stats);

    // readouts
    ro.t.set(`${Math.floor(model.t / YEAR)} years`);
    if (stats && stats.ready) {
      ro.v.set(`${(stats.v * YEAR).toFixed(2)} per year`);
      ro.r.set(Number.isFinite(stats.r) ? `${(stats.r * YEAR).toFixed(2)} per year` : "–");
      ro.s.set(Number.isFinite(stats.s) ? `${stats.s.toFixed(4)} per day` : "–");
      ro.q.set(Number.isFinite(stats.q) ? `${stats.q.toFixed(1)} mutations` : "–");
      ro.sp.set(Number.isFinite(stats.split) ? `${kit.fmtNum(stats.split * YEAR * 100, 1)} per century` : "–");
    } else {
      for (const k of ["v", "r", "s", "q", "sp"]) ro[k].set("measuring…");
    }
  }

  function drawTrace(r, stats) {
    const c = kit.colors;
    const h = model.hist;
    const t1 = Math.max(60, model.t / YEAR), t0 = t1 - 60;
    const rows = h.filter((q) => q.t / YEAR >= t0);
    let lo = Infinity, hi = -Infinity;
    for (const q of rows) { lo = Math.min(lo, q.mean); hi = Math.max(hi, q.nose); }
    if (!rows.length) { lo = 0; hi = 10; }
    const pad = Math.max(2, (hi - lo) * 0.08);
    const A = kit.axes(ctx, r, { x: [t0, t1], y: [Math.floor(lo - pad), Math.ceil(hi + pad)], yfmt: (v) => String(v).replace("-", "−"), xlabel: "years", ylabel: "position of the wave" });
    ctx.save(); A.clip();
    kit.line(ctx, rows.map((q) => [q.t / YEAR, q.nose]), A, { color: c.pink, width: 1.2 });
    kit.line(ctx, rows.map((q) => [q.t / YEAR, q.mean]), A, { color: c.blue, width: 2.2 });
    if (stats && stats.ready && Number.isFinite(stats.r) && rows.length) {
      // the text's rate, drawn through the latest mean position over the averaging window
      const last = rows[rows.length - 1], ta = Math.max(t0, stats.t0 / YEAR);
      const tb = last.t / YEAR;
      kit.line(ctx, [[ta, last.mean - stats.r * YEAR * (tb - ta)], [tb, last.mean]], A, { color: c.gold, width: 2, dash: [6, 5] });
    }
    ctx.restore();
    const items = [{ label: "mean", color: c.blue }, { label: "nose", color: c.pink }, { label: "slope r", color: c.gold, dash: [6, 5] }];
    kit.legend(ctx, items, r.x + 4, r.y + 12);
  }

  /* ---------- controls ---------- */

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const ro = {
    t: ui.readout({ label: "Time" }),
    v: ui.readout({ label: "Wave speed, measured" }),
    r: ui.readout({ label: "Text's rate r ≈ fₘ / ln(fₘ/μ)" }),
    s: ui.readout({ label: "Fitness gain per mutation, s" }),
    q: ui.readout({ label: "Nose lead, q = fₘ/s" }),
    sp: ui.readout({ label: "Splitting rate, r·e^(−d/q)" }),
  };
  restart();
  const loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "Reset", onClick: () => { view.seed += 1; restart(); loop.redraw(); } });
  ui.select({
    label: "Speed", value: "3",
    options: [{ value: "1", label: "1 year per second" }, { value: "3", label: "3 years per second" }, { value: "10", label: "10 years per second" }],
    onChange: (v) => { view.yearsPerSec = +v; },
  });
  ui.slider({
    label: "Mutation rate μ, per transmission", min: 1e-6, max: 1e-3, log: true, value: model.p.mu,
    format: (v) => kit.fmtNum(v, 1),
    onInput: (v) => { model.p.mu = v; model.mark = model.t; loop.redraw(); },
  });
  ui.slider({
    label: "Cross-reactivity range d", min: 4, max: 40, step: 1, value: model.p.d,
    format: (v) => `${v} mutations`,
    onInput: (v) => {
      view.d = v;
      clearTimeout(dTimer);
      dTimer = setTimeout(() => { restart(); loop.redraw(); }, 250);   // a new range means a new immune landscape: start over
    },
  });
  st.onResize(() => loop.redraw());
  loop.redraw();
}

export { makeRandom, crossImmunity, createChase };
