// Two-step cytokine binding (Section IV A): L + R1 + R2 <-> LR1 + R2 <-> LR1R2. At equilibrium
//   [LR1R2] = [R2]_total / (1 + (K2/[R1]_total) (1 + K1/[L])),
// and when the first step is weak ([L] << K1) this becomes a simple binding curve with amplitude [R2]_total and
// half-maximum at K1 K2 / [R1]_total. Concentrations are in units of K1 (ligand) and K2 (alpha chain).
import * as kit from "../kit.js";

/* ---------- model (checked numerically against the two equilibrium conditions) ---------- */
const exact = (L, R1, R2) => R2 / (1 + (1 / R1) * (1 + 1 / L));          // L in units of K1, R1 in units of K2
const approx = (L, R1, R2) => (R2 * L) / (L + 1 / R1);
const halfApprox = (R1) => 1 / R1;                                        // K1 K2 / [R1]_total, in units of K1
const halfExact = (R1) => 1 / (R1 + 1);                                   // K1 K2 / ([R1]_total + K2)
const plateau = (R1, R2) => R2 / (1 + 1 / R1);

const START = { R1: 100, R2: 0.6 };
const LMIN = 1e-5, LMAX = 1e2;

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 560 ? 1.05 : 2.3), minHeight: 260, maxHeight: 420,
    label: "Chart of the number of fully assembled cytokine-receptor complexes against cytokine concentration on a logarithmic axis, for the current receptor chain levels, the weak-first-step approximation, and a fixed reference cell.",
  });
  const { ctx } = st;
  const p = { ...START };

  function draw() {
    const c = kit.colors;
    st.clear();
    const r = { x: 56, y: 46, w: st.w - 76, h: st.h - 46 - 52 };
    const A = kit.axes(ctx, r, {
      x: [LMIN, LMAX], xlog: true, y: [0, 1], yticks: [0, 0.25, 0.5, 0.75, 1],
      xlabel: "cytokine concentration [L], in units of K₁", ylabel: "signaling complexes [LR₁R₂], relative units",
    });
    const xs = []; for (let e = Math.log10(LMIN); e <= Math.log10(LMAX) + 1e-9; e += 0.02) xs.push(10 ** e);
    ctx.save(); A.clip();
    kit.line(ctx, xs.map((L) => [L, exact(L, START.R1, START.R2)]), A, { color: kit.alpha(c.muted, 0.8), width: 1.5 });
    kit.line(ctx, xs.map((L) => [L, approx(L, p.R1, p.R2)]), A, { color: c.pink, width: 1.8, dash: [6, 5] });
    kit.line(ctx, xs.map((L) => [L, exact(L, p.R1, p.R2)]), A, { color: c.blue, width: 2.4 });
    // half-maximum points
    const he = halfExact(p.R1), ha = halfApprox(p.R1);
    if (he >= LMIN && he <= LMAX) { ctx.fillStyle = c.blue; ctx.beginPath(); ctx.arc(A.X(he), A.Y(plateau(p.R1, p.R2) / 2), 4.5, 0, 7); ctx.fill(); }
    if (ha >= LMIN && ha <= LMAX) {
      ctx.fillStyle = c.pink;
      ctx.beginPath(); ctx.moveTo(A.X(ha), r.y + r.h - 1); ctx.lineTo(A.X(ha) - 5, r.y + r.h - 10); ctx.lineTo(A.X(ha) + 5, r.y + r.h - 10); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const narrow = st.w < 560;
    kit.legend(ctx, [
      { label: "this cell", color: c.blue },
      { label: narrow ? "weak 1st step" : "weak first step", color: c.pink, dash: [6, 5] },
      { label: narrow ? "reference" : "reference cell", color: c.muted },
    ], narrow ? 10 : r.x, r.y - 32);
    if (!ro) return;
    ro.ha.set(`${kit.fmtNum(ha, 2)} K₁`);
    ro.he.set(`${kit.fmtNum(he, 2)} K₁`);
    ro.pl.set(kit.fmtNum(plateau(p.R1, p.R2), 2));
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  const sR1 = ui.slider({ label: "α chains, [R₁]total ÷ K₂", min: 0.3, max: 3000, log: true, value: p.R1, format: (v) => kit.fmtNum(v, 1), onInput: (v) => { p.R1 = v; draw(); } });
  const sR2 = ui.slider({ label: "β–γ chains, [R₂]total", min: 0.05, max: 1, step: 0.05, value: p.R2, format: (v) => v.toFixed(2), onInput: (v) => { p.R2 = v; draw(); } });
  ui.button({ label: "Back to the reference cell", onClick: () => { Object.assign(p, START); sR1.value = p.R1; sR2.value = p.R2; draw(); } });
  ro = {
    ha: ui.readout({ label: "Half-maximum, K₁K₂/[R₁]" }),
    he: ui.readout({ label: "Half-maximum, exact" }),
    pl: ui.readout({ label: "Plateau" }),
  };
  kit.onThemeChange(draw);
  st.onResize(draw);
  if (document.fonts) document.fonts.ready.then(draw);
  draw();
}
