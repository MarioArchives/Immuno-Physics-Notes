// Time to first recognition (well-adapted immune system, the cost of an infection).
// Counted in effective time m (the mean number of receptor encounters so far), encounters arrive as a Poisson
// process of unit rate, and each one recognizes the antigen with probability equal to the coverage Pt.
// The first success ends the infection, so m at recognition is exponential with rate Pt:
//   H(m) = Pt e^{-m Pt},   <m> = 1/Pt,   <F> = <m^alpha> = Gamma(1+alpha) Pt^{-alpha}.
import * as kit from "../kit.js";
import { lgamma } from "./repertoire-model.js";

const BINS = 28;

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.78 : 1.9), minHeight: 340, maxHeight: 560,
    label: "Two charts. Top: one simulated infection along the effective-time axis, with a tick for each receptor encounter, a highlighted tick where the antigen is first recognized, and the harm curve m to the power alpha. Bottom: histogram of the effective time at recognition over all simulated infections, with the predicted exponential density.",
  });
  const { ctx } = st;
  const R = kit.rng(11);
  const s = { Pt: 0.05, alpha: 1, ticks: [], hit: 0, cursor: 0, hold: 0, n: 0, sumM: 0, sumF: 0, hist: new Float64Array(BINS) };
  const mmax = () => 4.5 / s.Pt;

  function newInfection() {
    s.ticks = [];
    let m = 0;
    for (;;) {
      m += R.exp(1);
      const ok = R.random() < s.Pt;
      s.ticks.push(m);
      if (ok) break;
      if (s.ticks.length > 20000) break;
    }
    s.hit = m;
    s.cursor = 0;
    s.hold = 0;
  }
  function record(m) {
    s.n++; s.sumM += m; s.sumF += Math.pow(m, s.alpha);
    const b = Math.floor((m / mmax()) * BINS);
    if (b < BINS) s.hist[b]++;
  }
  function resetStats() { s.n = 0; s.sumM = 0; s.sumF = 0; s.hist.fill(0); newInfection(); }
  function runMany(k) {
    for (let i = 0; i < k; i++) {
      let m = 0;
      for (;;) { m += R.exp(1); if (R.random() < s.Pt) break; }
      record(m);
    }
  }

  function step(dt) {
    if (s.cursor < s.hit) {
      s.cursor = Math.min(s.hit, s.cursor + dt * (1 / s.Pt) / 1.6);
      if (s.cursor >= s.hit) record(s.hit);
    } else {
      s.hold += dt;
      if (s.hold > 0.7) newInfection();
    }
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    const narrow = st.narrow;
    const left = narrow ? 48 : 60, right = 16;
    const gap = narrow ? 70 : 64;
    const topH = Math.round((st.h - 40 - gap - 44) * 0.42);
    const top = { x: left, y: 34, w: st.w - left - right, h: topH };
    const bot = { x: left, y: top.y + top.h + gap, w: top.w, h: st.h - (top.y + top.h + gap) - 44 };
    const M = mmax();

    // --- one infection ---
    const fmax = Math.pow(M, s.alpha);
    const A = kit.axes(ctx, top, {
      x: [0, M], y: [0, fmax], yticks: [0, fmax], yfmt: (v) => (v ? "max" : "0"),
      xlabel: narrow ? "effective time m (encounters)" : "effective time m, the expected number of receptor encounters so far",
      ylabel: narrow ? `harm, m^${fmtA(s.alpha)}` : `harm F(m) = m^α, with α = ${fmtA(s.alpha)}`, grid: false,
    });
    ctx.save(); A.clip();
    const pts = []; for (let i = 0; i <= 160; i++) { const m = (i / 160) * M; pts.push([m, Math.pow(m, s.alpha)]); }
    kit.line(ctx, pts, A, { color: kit.alpha(c.brown, 0.35), width: 1.5, dash: [4, 4] });
    const now = s.cursor;
    kit.line(ctx, pts.filter(([m]) => m <= now).concat([[now, Math.pow(now, s.alpha)]]), A, { color: c.brown, width: 2.4 });
    // encounter ticks
    const base = top.y + top.h;
    ctx.lineWidth = 1.2;
    for (const m of s.ticks) {
      if (m > now || m > M) break;
      const x = A.X(m);
      const isHit = m === s.hit;
      ctx.strokeStyle = isHit ? c.pink : kit.alpha(c.blue, 0.55);
      ctx.lineWidth = isHit ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(x, base); ctx.lineTo(x, base - (isHit ? top.h : 12)); ctx.stroke();
    }
    if (now >= s.hit && s.hit <= M) {
      ctx.fillStyle = c.pink;
      ctx.beginPath(); ctx.arc(A.X(s.hit), A.Y(Math.pow(s.hit, s.alpha)), 5, 0, 7); ctx.fill();
    }
    ctx.restore();
    const done = now >= s.hit;
    kit.label(ctx, done ? `recognized after ${countBefore(s.ticks, s.hit)} encounters, at m = ${s.hit.toFixed(1)}` : `${countBefore(s.ticks, now)} encounters, none successful${narrow ? "" : " yet"}`,
      narrow ? top.x + 8 : top.x + top.w, narrow ? top.y + 12 : top.y - 12, { align: narrow ? "left" : "right", size: 11.5, color: done ? c.pink : c.muted });

    // --- histogram ---
    const binW = M / BINS;
    const dens = Array.from(s.hist, (k) => (s.n ? k / (s.n * binW) : 0));
    const ymax = Math.max(s.Pt * 1.15, ...dens) || 1;
    const B = kit.axes(ctx, bot, {
      x: [0, M], y: [0, ymax], yfmt: (v) => kit.fmtNum(v, 2),
      xlabel: narrow ? "m at recognition" : "effective time m at which the infection was recognized",
      ylabel: "fraction of infections per unit m",
    });
    ctx.save(); B.clip();
    ctx.fillStyle = kit.alpha(c.blue, 0.45); ctx.strokeStyle = c.blue; ctx.lineWidth = 1;
    for (let i = 0; i < BINS; i++) {
      if (!dens[i]) continue;
      const x0 = B.X(i * binW), x1 = B.X((i + 1) * binW), y = B.Y(dens[i]);
      ctx.fillRect(x0 + 0.5, y, x1 - x0 - 1, bot.y + bot.h - y);
    }
    const th = []; for (let i = 0; i <= 120; i++) { const m = (i / 120) * M; th.push([m, s.Pt * Math.exp(-m * s.Pt)]); }
    kit.line(ctx, th, B, { color: c.pink, width: 2.2 });
    ctx.restore();
    const items = [{ label: `${s.n.toLocaleString("en-US")} infections`, color: kit.alpha(c.blue, 0.8) }, { label: "predicted, P̃ e^(−mP̃)", color: c.pink }];
    ctx.save(); ctx.font = kit.font(11.5, 500);
    const lw = items.reduce((w, it) => w + 37 + ctx.measureText(it.label).width, 0);
    ctx.restore();
    kit.legend(ctx, items, Math.max(bot.x + 8, bot.x + bot.w - lw), bot.y + 8);

    if (!ro) return;
    const G = Math.exp(lgamma(1 + s.alpha));
    ro.mean.set(s.n ? `${(s.sumM / s.n).toFixed(1)} (1/P̃ = ${(1 / s.Pt).toFixed(1)})` : `— (1/P̃ = ${(1 / s.Pt).toFixed(1)})`);
    ro.harm.set(s.n ? `${kit.fmtNum(s.sumF / s.n, 2)} (theory ${kit.fmtNum(G * Math.pow(s.Pt, -s.alpha), 2)})` : `— (theory ${kit.fmtNum(G * Math.pow(s.Pt, -s.alpha), 2)})`);
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  const loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "Run 1,000 infections", onClick: () => { runMany(1000); loop.redraw(); } });
  ui.slider({ label: "Coverage P̃ (chance an encounter recognizes)", min: 0.01, max: 0.5, log: true, value: s.Pt,
    format: (v) => v.toFixed(v < 0.1 ? 3 : 2), onInput: (v) => { s.Pt = v; resetStats(); loop.redraw(); } });
  ui.slider({ label: "Cost exponent α", min: 0.5, max: 3, step: 0.25, value: s.alpha,
    format: fmtA, onInput: (v) => { s.alpha = v; resetStats(); loop.redraw(); } });
  ro = { mean: ui.readout({ label: "Mean m at recognition" }), harm: ui.readout({ label: "Mean harm ⟨F⟩" }) };
  st.onResize(() => loop.redraw());
  newInfection();
  runMany(200);
  s.cursor = s.hit * 0.6;
  loop.redraw();
}

function fmtA(v) { return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ""); }
function countBefore(ticks, m) { let k = 0; for (const t of ticks) { if (t <= m) k++; else break; } return k; }
