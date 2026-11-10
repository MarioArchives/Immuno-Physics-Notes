// Optimal repertoire without cross-reactivity (well-adapted immune system, more uniform than the threats).
// Twenty antigen classes with threats Q_k; each receptor type recognizes exactly one class, so the coverage of
// class k is P_k. The optimum minimizes sum_k Q_k Fbar(P_k) on the simplex:
//   P*_k = max[h(-lambda / Q_k), 0],  h = inverse of Fbar',  lambda fixed by sum_k P*_k = 1.
import * as kit from "../kit.js";
import { costFamily, optimalSpecific, normalise } from "./repertoire-model.js";

const K = 20;

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.72 : 2.15), minHeight: 300, maxHeight: 640,
    label: "Two charts. Left: bars for twenty antigen classes ranked by threat, showing each class's share of threats and its share of the optimal repertoire. Right: the optimal repertoire share against the threat share on logarithmic axes, with the line of proportional allocation for comparison.",
  });
  const { ctx } = st;
  const s = { kind: "power", alpha: 1, beta: 0.02, m0: 60, skew: 1, random: false, seed: 3 };
  let Q = null;

  function makeQ() {
    if (s.random) {
      const R = kit.rng(s.seed), sd = Math.sqrt(Math.log(1 + 1.5 * 1.5));
      const v = Float64Array.from({ length: K }, () => Math.exp(sd * R.normal()));
      Q = normalise(Float64Array.from([...v].sort((a, b) => b - a)));
    } else {
      Q = normalise(Float64Array.from({ length: K }, (_, k) => Math.pow(k + 1, -s.skew)));
    }
  }
  const param = () => ({ power: s.alpha, saturating: s.beta, threshold: s.m0, log: 1 })[s.kind];
  const expected = (cost, P) => { let c = 0; for (let k = 0; k < K; k++) c += Q[k] * cost.Fbar(P[k]); return c; };

  function draw() {
    const c = kit.colors;
    st.clear();
    const cost = costFamily(s.kind, param());
    const { P } = optimalSpecific(Q, cost);
    const narrow = st.narrow;
    const pad = { l: narrow ? 48 : 56, r: 14, t: 58, b: 46 };
    let left, right;
    if (narrow) {
      const h = (st.h - 2 * pad.t - 2 * pad.b) / 2;
      left = { x: pad.l, y: pad.t, w: st.w - pad.l - pad.r, h };
      right = { x: pad.l, y: pad.t + h + pad.b + pad.t, w: left.w, h };
    } else {
      const w = (st.w - 2 * pad.l - 2 * pad.r - 10) / 2;
      left = { x: pad.l, y: pad.t, w: w * 1.08, h: st.h - pad.t - pad.b };
      right = { x: left.x + left.w + pad.r + pad.l + 10, y: pad.t, w: st.w - (left.x + left.w + pad.r + pad.l + 10) - pad.r, h: left.h };
    }

    // --- bars ---
    const ymax = Math.max(...Q, ...P) * 1.08;
    const A = kit.axes(ctx, left, {
      x: [0.5, K + 0.5], y: [0, ymax], xticks: [1, 5, 10, 15, 20], yfmt: (v) => `${Math.round(v * 100)}%`,
      xlabel: "antigen class, ranked by threat", ylabel: "share", grid: true,
    });
    const bw = (left.w / K) * 0.72;
    for (let k = 0; k < K; k++) {
      const x = A.X(k + 1);
      ctx.fillStyle = kit.alpha(c.blue, 0.85);
      if (P[k] > 0) ctx.fillRect(x - bw / 2, A.Y(P[k]), bw, A.Y(0) - A.Y(P[k]));
      else { ctx.fillStyle = c.pink; ctx.beginPath(); ctx.arc(x, A.Y(0) - 4, 2.6, 0, 7); ctx.fill(); }
      ctx.strokeStyle = c.brown; ctx.lineWidth = 1.6;
      ctx.strokeRect(x - bw / 2 - 1, A.Y(Q[k]), bw + 2, A.Y(0) - A.Y(Q[k]));
    }
    kit.legend(ctx, [{ label: "threat Q", color: c.brown }, { label: "optimal repertoire P*", color: kit.alpha(c.blue, 0.85) }], left.x - 30, left.y - 42);

    // --- log-log ---
    const qmin = Math.min(...Q), qmax = Math.max(...Q);
    const pos = [...P].filter((v) => v > 0);
    const lo = 10 ** Math.floor(Math.log10(Math.min(qmin, ...pos) * 0.8)), hi = 10 ** Math.ceil(Math.log10(Math.max(qmax, ...pos) * 1.2));
    const B = kit.axes(ctx, right, {
      x: [lo, hi], y: [lo, hi], xlog: true, ylog: true,
      xlabel: "threat share Q", ylabel: "repertoire share P*",
    });
    ctx.save(); B.clip();
    // proportional and uniform references
    kit.line(ctx, [[lo, lo], [hi, hi]], B, { color: c.muted, width: 1.4, dash: [5, 5] });
    kit.line(ctx, [[lo, 1 / K], [hi, 1 / K]], B, { color: kit.alpha(c.teal, 0.9), width: 1.4, dash: [2, 4] });
    for (let k = 0; k < K; k++) {
      const x = B.X(Q[k]);
      if (P[k] > 0) { ctx.fillStyle = c.blue; ctx.beginPath(); ctx.arc(x, B.Y(P[k]), 4, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = c.pink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, right.y + right.h - 6, 4, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
    kit.legend(ctx, [{ label: "P ∝ Q", color: c.muted, dash: [5, 5] }, { label: "uniform", color: c.teal, dash: [2, 4] }], right.x - 30, right.y - 42);
    if (s.kind === "power") kit.label(ctx, `slope 1/(1+α) = ${(1 / (1 + s.alpha)).toFixed(2)}`, right.x + right.w - 4, right.y + right.h - 10, { align: "right", size: 11.5, color: c.blue });
    if (s.kind === "log") kit.label(ctx, "slope 1: proportional", right.x + right.w - 4, right.y + right.h - 10, { align: "right", size: 11.5, color: c.blue });

    // --- readouts ---
    const cOpt = expected(cost, P);
    const cProp = expected(cost, Q);
    const cUni = expected(cost, new Float64Array(K).fill(1 / K));
    const pct = (x) => `${x >= cOpt * 1.0005 ? "+" : ""}${((x / cOpt - 1) * 100).toFixed(1)}%`;
    ro.cost.set(`optimum ${kit.fmtNum(cOpt, 2)}; P ∝ Q ${pct(cProp)}; uniform ${pct(cUni)}`);
    ro.none.set(String(P.filter((v) => v === 0).length));
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  ui.select({
    label: "Cost of late recognition F(m)",
    options: [
      { value: "power", label: "power law, m^α" },
      { value: "saturating", label: "saturating, 1 − e^(−βm)" },
      { value: "threshold", label: "threshold, Θ(m − m₀)" },
      { value: "log", label: "logarithmic, ln m" },
    ],
    value: s.kind, onChange: (v) => { s.kind = v; showParam(); draw(); },
  });
  const sA = ui.slider({ label: "Exponent α", min: 0.25, max: 4, step: 0.25, value: s.alpha, format: (v) => v.toFixed(2), onInput: (v) => { s.alpha = v; draw(); } });
  const sB = ui.slider({ label: "Saturation rate β", min: 0.002, max: 0.2, log: true, value: s.beta, format: (v) => kit.fmtNum(v, 2), onInput: (v) => { s.beta = v; draw(); } });
  const sM = ui.slider({ label: "Threshold m₀ (encounters)", min: 10, max: 400, log: true, value: s.m0, format: (v) => Math.round(v), onInput: (v) => { s.m0 = v; draw(); } });
  ui.slider({ label: "Skew of threats, Q ∝ k^−s", min: 0, max: 2.5, step: 0.1, value: s.skew, format: (v) => v.toFixed(1), onInput: (v) => { s.skew = v; s.random = false; makeQ(); draw(); } });
  ui.button({ label: "Random threats", onClick: () => { s.random = true; s.seed++; makeQ(); draw(); } });
  const ro = { cost: ui.readout({ label: "Expected cost" }), none: ui.readout({ label: "Classes with no receptors" }) };
  function showParam() {
    sA.el.style.display = s.kind === "power" ? "" : "none";
    sB.el.style.display = s.kind === "saturating" ? "" : "none";
    sM.el.style.display = s.kind === "threshold" ? "" : "none";
  }
  showParam();
  makeQ();
  kit.onThemeChange(draw);
  st.onResize(draw);
  if (document.fonts) document.fonts.ready.then(draw);
  draw();
}
