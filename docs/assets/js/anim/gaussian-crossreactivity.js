// The solvable case (well-adapted immune system, cross-reactivity): a Gaussian antigen distribution of width
// sigma_Q (= 1 here), Gaussian cross-reactivity f(d) = exp(-d^2 / 2 sigma^2) and cost F(m) = m^alpha.
// Below sigma_c = sigma_Q sqrt(1 + alpha) the optimum is Gaussian with variance (1 + alpha) sigma_Q^2 - sigma^2 and
// its coverage is proportional to Q^{1/(1+alpha)}; from sigma_c on it is a single receptor type at the center.
// Optimal cost times (sigma / sigma_Q)^alpha (cost at fixed recognition capability, int f = sqrt(2 pi) sigma),
// dropping the constant Gamma(1 + alpha):
//   (1 + alpha)^{(1+alpha)/2}                              for sigma < sigma_c
//   (sigma/sigma_Q)^alpha / sqrt(1 - alpha sigma_Q^2/sigma^2)  for sigma >= sigma_c.
import * as kit from "../kit.js";

const XR = 4.5;
const gauss = (x, v) => Math.exp(-(x * x) / (2 * v)) / Math.sqrt(2 * Math.PI * v);

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.8 : 1.75), minHeight: 340, maxHeight: 580,
    label: "Two charts. Top: the Gaussian antigen distribution, the optimal receptor distribution and its coverage of antigens along a one-dimensional shape space. Bottom: the optimal cost at fixed recognition capability against the cross-reactivity width, flat up to the critical width and rising after it.",
  });
  const { ctx } = st;
  const s = { sigma: 0.8, alpha: 1 };
  const sc = () => Math.sqrt(1 + s.alpha);
  const normCost = (sg, a) => (sg < Math.sqrt(1 + a) ? Math.pow(1 + a, (1 + a) / 2) : Math.pow(sg, a) / Math.sqrt(1 - a / (sg * sg)));

  function draw() {
    const c = kit.colors;
    st.clear();
    const narrow = st.narrow;
    const left = narrow ? 44 : 58, right = 16, gap = 72;
    const topH = Math.round((st.h - 56 - gap - 44) * 0.56);
    const top = { x: left, y: 56, w: st.w - left - right, h: topH };
    const bot = { x: left, y: top.y + top.h + gap, w: top.w, h: st.h - (top.y + top.h + gap) - 44 };
    const delta = s.sigma >= sc();
    const v = (1 + s.alpha) - s.sigma * s.sigma;

    // --- distributions ---
    const ytop = 0.95;
    const A = kit.axes(ctx, top, {
      x: [-XR, XR], y: [0, ytop], yticks: [0, 0.4, 0.8],
      xlabel: narrow ? "shape space, in units of σ_Q" : "position in shape space, in units of the antigen spread σ_Q",
      ylabel: "density",
    });
    const xs = []; for (let i = 0; i <= 240; i++) xs.push(-XR + (2 * XR * i) / 240);
    ctx.save(); A.clip();
    // Q, filled
    ctx.fillStyle = kit.alpha(c.brown, 0.18);
    ctx.beginPath(); ctx.moveTo(A.X(-XR), A.Y(0));
    for (const x of xs) ctx.lineTo(A.X(x), A.Y(gauss(x, 1)));
    ctx.lineTo(A.X(XR), A.Y(0)); ctx.closePath(); ctx.fill();
    kit.line(ctx, xs.map((x) => [x, gauss(x, 1)]), A, { color: c.brown, width: 2 });
    // coverage shape, scaled to the same peak as Q for comparison
    const covVar = delta ? s.sigma * s.sigma : 1 + s.alpha;
    kit.line(ctx, xs.map((x) => [x, gauss(0, 1) * Math.exp(-(x * x) / (2 * covVar))]), A, { color: c.teal, width: 2, dash: [6, 4] });
    // optimal repertoire
    if (!delta && v > 0.004) {
      kit.line(ctx, xs.map((x) => [x, gauss(x, v)]), A, { color: c.blue, width: 2.6 });
    }
    ctx.restore();
    if (delta || v <= 0.004 || gauss(0, v) > ytop) {
      const x0 = A.X(0), yb = A.Y(0), yt = top.y + 4;
      ctx.strokeStyle = c.blue; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0, yt + 8); ctx.stroke();
      ctx.fillStyle = c.blue; ctx.beginPath(); ctx.moveTo(x0, yt); ctx.lineTo(x0 - 5, yt + 10); ctx.lineTo(x0 + 5, yt + 10); ctx.closePath(); ctx.fill();
      if (delta) kit.label(ctx, "a single receptor type", x0 + 9, yt + 14, { color: c.blue, size: 11.5 });
    }
    // kernel width bar
    const kx = A.X(-XR) + 10, ky = top.y + 14;
    ctx.strokeStyle = c.pink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + (A.X(s.sigma) - A.X(0)), ky); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(kx, ky - 4); ctx.lineTo(kx, ky + 4); ctx.moveTo(kx + (A.X(s.sigma) - A.X(0)), ky - 4); ctx.lineTo(kx + (A.X(s.sigma) - A.X(0)), ky + 4); ctx.stroke();
    kit.label(ctx, "cross-reactivity σ", kx, ky + 16, { color: c.pink, size: 11 });
    kit.legend(ctx, narrow
      ? [{ label: "Q", color: c.brown }, { label: "P*", color: c.blue }, { label: "coverage P̃ (shape)", color: c.teal, dash: [6, 4] }]
      : [{ label: "antigens Q(a)", color: c.brown }, { label: "optimal receptors P*(r)", color: c.blue }, { label: "coverage P̃(a), shape only", color: c.teal, dash: [6, 4] }],
    narrow ? 8 : top.x - 30, top.y - 42);

    // --- cost against sigma ---
    const smin = 0.1, smax = 3;
    let cmax = 0; for (let i = 0; i <= 200; i++) cmax = Math.max(cmax, normCost(smin + ((smax - smin) * i) / 200, s.alpha));
    const B = kit.axes(ctx, bot, {
      x: [0, smax], y: [0, cmax * 1.1], yfmt: (v2) => kit.fmtNum(v2, 2),
      xlabel: narrow ? "cross-reactivity σ / σ_Q" : "cross-reactivity width σ, in units of σ_Q",
      ylabel: narrow ? "cost × (σ/σ_Q)^α" : "optimal cost at fixed recognition capability, ⟨F⟩ (σ/σ_Q)^α",
    });
    ctx.save(); B.clip();
    const cs = []; for (let i = 0; i <= 300; i++) { const sg = smin + ((smax - smin) * i) / 300; cs.push([sg, normCost(sg, s.alpha)]); }
    kit.line(ctx, cs, B, { color: c.blue, width: 2.4 });
    ctx.strokeStyle = c.muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(B.X(sc()), bot.y); ctx.lineTo(B.X(sc()), bot.y + bot.h); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.pink; ctx.beginPath(); ctx.arc(B.X(s.sigma), B.Y(normCost(s.sigma, s.alpha)), 5, 0, 7); ctx.fill();
    ctx.restore();
    kit.label(ctx, `σ_c = √(1+α) σ_Q`, Math.min(B.X(sc()) + 6, bot.x + bot.w - 104), bot.y + 12, { color: c.muted, size: 11 });

    ro.sc.set(`${sc().toFixed(2)} σ_Q`);
    ro.w.set(delta ? "0, one type" : `${Math.sqrt(v).toFixed(2)} σ_Q`);
    ro.c.set(kit.fmtNum(normCost(s.sigma, s.alpha), 3));
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  ui.slider({ label: "Cross-reactivity width σ / σ_Q", min: 0.1, max: 3, step: 0.02, value: s.sigma, format: (v) => v.toFixed(2), onInput: (v) => { s.sigma = v; draw(); } });
  ui.slider({ label: "Cost exponent α, F(m) = m^α", min: 0.25, max: 3, step: 0.25, value: s.alpha, format: (v) => v.toFixed(2), onInput: (v) => { s.alpha = v; draw(); } });
  const ro = { sc: ui.readout({ label: "Critical width σ_c" }), w: ui.readout({ label: "Spread of P*" }), c: ui.readout({ label: "Normalized cost" }) };
  kit.onThemeChange(draw);
  st.onResize(draw);
  if (document.fonts) document.fonts.ready.then(draw);
  draw();
}
