// In-host HIV dynamics under therapy (Section VII D). Target cells T are held constant, as in the paper's decay formula.
// Infected cells I and infectious (V_I) and non-infectious (V_NI) virions, after the drugs start at t = 0:
//   dI/dt = (1 - ε_RT) β T V_I - ν I,   dV_I/dt = (1 - ε_PI) p I - c V_I,   dV_NI/dt = ε_PI p I - c V_NI.
// Before treatment the infection sits at its steady state (β T V0 = ν I0, p I0 = c V0), so in units of I0 and V0
// only c, ν and the two efficacies matter. For ε_PI = 1, ε_RT = 0 the total load follows Perelson and colleagues:
//   V(t)/V0 = e^{-ct} + c/(c-ν) [ c/(c-ν) (e^{-νt} - e^{-ct}) - ν t e^{-ct} ].
import * as kit from "../kit.js";

const T_END = 10;     // days
const H = 0.005;      // integration step, days
const YMIN = 1e-4;

function solve({ c, nu, eRT, ePI }) {
  let i = 1, a = 1, b = 0;
  const out = [];
  const f = (i, a, b) => [nu * ((1 - eRT) * a - i), c * ((1 - ePI) * i - a), c * (ePI * i - b)];
  const n = Math.round(T_END / H);
  for (let k = 0; k <= n; k++) {
    if (k % 4 === 0) out.push([k * H, a + b, a, b, i]);
    const k1 = f(i, a, b);
    const k2 = f(i + (H / 2) * k1[0], a + (H / 2) * k1[1], b + (H / 2) * k1[2]);
    const k3 = f(i + (H / 2) * k2[0], a + (H / 2) * k2[1], b + (H / 2) * k2[2]);
    const k4 = f(i + H * k3[0], a + H * k3[1], b + H * k3[2]);
    i += (H / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    a += (H / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    b += (H / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  }
  return out;
}

const perelson = (t, c, nu) => Math.exp(-c * t) + (c / (c - nu)) * ((c / (c - nu)) * (Math.exp(-nu * t) - Math.exp(-c * t)) - nu * t * Math.exp(-c * t));

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 0.95 : 2.3), minHeight: 280, maxHeight: 520,
    label: "Chart of viral load against days after the start of therapy, on a logarithmic scale: total virus, infectious and non-infectious virions, infected cells, and the decay formula for a fully effective protease inhibitor.",
  });
  const { ctx } = st;
  const p = { c: 3, nu: 0.5, eRT: 0, ePI: 1 };
  let sol = [], t = kit.reducedMotion() ? T_END : 0, hold = 0;

  function recompute() { sol = solve(p); }

  function draw() {
    if (!ro.v7) return;
    const c = kit.colors;
    st.clear();
    const r = st.narrow ? { x: 50, y: 58, w: st.w - 66, h: st.h - 112 } : { x: 62, y: 44, w: st.w - 84, h: st.h - 100 };
    const A = kit.axes(ctx, r, { x: [0, T_END], y: [YMIN, 2], ylog: true, xlabel: "days after the drugs start", ylabel: "level relative to before treatment", xticks: [0, 2, 4, 6, 8, 10] });
    const upto = sol.filter((q) => q[0] <= t + 1e-9);
    const col = (k, floor = YMIN * 0.5) => upto.map((q) => [q[0], q[k] > floor ? q[k] : NaN]);
    ctx.save(); A.clip();
    const ref = []; for (let i = 0; i <= 300; i++) { const s = (T_END * i) / 300; const v = perelson(s, p.c, p.nu); ref.push([s, v > YMIN * 0.5 ? v : NaN]); }
    kit.line(ctx, ref, A, { color: c.pink, width: 2, dash: [6, 5] });
    kit.line(ctx, col(4), A, { color: c.gold, width: 1.5 });
    if (p.ePI > 0) kit.line(ctx, col(3), A, { color: c.brown, width: 1.5 });
    kit.line(ctx, col(2), A, { color: c.teal, width: 1.5 });
    kit.line(ctx, col(1), A, { color: c.blue, width: 2.8 });
    ctx.fillStyle = kit.alpha(c.ink, 0.35); ctx.fillRect(Math.round(A.X(t)), r.y, 1, r.h);
    ctx.restore();
    const items = [{ label: "total virus V", color: c.blue }, { label: "infectious", color: c.teal }, { label: "non-infectious", color: c.brown }, { label: "infected cells", color: c.gold }, { label: "formula, perfect protease inhibitor", color: c.pink, dash: [6, 5] }];
    if (st.narrow) { kit.legend(ctx, items.slice(0, 3), 12, 14); kit.legend(ctx, items.slice(3), 12, 32); }
    else kit.legend(ctx, items, r.x, r.y - 30);
    const at = (d) => sol[Math.min(sol.length - 1, Math.round(d / (4 * H)))][1];
    ro.v7.set(`${kit.fmtNum(1 / at(7), 2)}-fold`);
    const eff = 1 - (1 - p.eRT) * (1 - p.ePI);
    const slow = (-(p.nu + p.c) + Math.sqrt((p.nu + p.c) ** 2 - 4 * p.nu * p.c * eff)) / 2;
    ro.slope.set(`${kit.fmtNum(-slow, 2)} per day`);
    ro.hv.set(`${kit.fmtNum((Math.LN2 / p.c) * 24, 2)} hours`);
    ro.hi.set(`${kit.fmtNum(Math.LN2 / p.nu, 2)} days`);
  }

  function step(dt) {
    if (t >= T_END) { hold += dt; if (hold > 2.5) { t = 0; hold = 0; } return; }
    t = Math.min(T_END, t + dt * 2);
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  const ro = {};
  let loop = null;
  const changed = () => { recompute(); if (loop) loop.redraw(); };
  recompute();
  ui.slider({ label: "Protease inhibitor efficacy, ε_PI", min: 0, max: 1, step: 0.01, value: p.ePI, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { p.ePI = v; changed(); } });
  ui.slider({ label: "Reverse transcriptase inhibitor efficacy, ε_RT", min: 0, max: 1, step: 0.01, value: p.eRT, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { p.eRT = v; changed(); } });
  ui.slider({ label: "Virion clearance rate, c", min: 1, max: 10, step: 0.1, value: p.c, format: (v) => `${v.toFixed(1)} per day`, onInput: (v) => { p.c = v; changed(); } });
  ui.slider({ label: "Infected-cell death rate, ν", min: 0.1, max: 0.9, step: 0.01, value: p.nu, format: (v) => `${v.toFixed(2)} per day`, onInput: (v) => { p.nu = v; changed(); } });
  ro.v7 = ui.readout({ label: "Drop in viral load after 7 days" });
  ro.slope = ui.readout({ label: "Late decline rate" });
  ro.hv = ui.readout({ label: "Virion half-life" });
  ro.hi = ui.readout({ label: "Infected-cell half-life" });
  loop = kit.animate(plate, { step, draw, ui });
  ui.button({ label: "Restart treatment", onClick: () => { t = 0; hold = 0; loop.redraw(); } });
  st.onResize(() => loop.redraw());
  loop.redraw();
}
