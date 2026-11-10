// Cytokine niches (Section IV B): secreting cells in a tissue of cytokine-consuming cells. In the linear,
// mean-field regime the steady state around one secreting cell of radius R is
//   c(r) = c(R) (R/r) exp((R - r)/xi),   c(R) = k_prod / (4 pi D R (1 + R/xi)),   xi = sqrt(D / (k_on N_R n_consum)),
// with no autocrine capture. The niche is where c exceeds the signaling threshold K_D.
import * as kit from "../kit.js";

/* ---------- fixed parameters (the paper's IL-2 numbers) ---------- */
const D = 100;                         // µm²/s, cytokine diffusion coefficient in tissue
const R = 5;                           // µm, cell radius
const PER_MOLAR = 6.02214e23 / 1e15;   // molecules per µm³ in 1 M
const KD = 3e-12 * PER_MOLAR;          // 3 pM signaling threshold, in molecules per µm³
const KON = 3e7 / PER_MOLAR;           // 3×10⁷ M⁻¹s⁻¹, in µm³ per second
const HALF = 150;                      // half-width of the tissue view, µm
const LATTICE = 10.5;                  // spacing of the close-packed arrangement of 10-µm cells, µm

/* ---------- model (checked numerically against the paper's equations) ---------- */
const consumption = (NR, n) => KON * NR * n;                  // k_c, per second
const screening = (kc) => Math.sqrt(D / kc);                   // xi, µm
function conc(r, kprod, xi) {                                  // molecules per µm³, r >= R
  const cR = kprod / (4 * Math.PI * D * R * (1 + R / xi));
  return cR * (R / r) * Math.exp((R - r) / xi);
}
function nicheRadius(kprod, xi) {                              // µm, or null if the surface is below K_D
  if (conc(R, kprod, xi) < KD) return null;
  let lo = R, hi = 2 * R;
  while (conc(hi, kprod, xi) >= KD && hi < 1e7) hi *= 2;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (conc(m, kprod, xi) >= KD) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
const relax = (r, kc, xi) => (1 + r / xi) / (2 * kc);         // local time to reach steady state, s

function sci(v) {                                              // 2.5×10⁻⁴, always in powers of ten
  const e = Math.floor(Math.log10(v) + 1e-9), m = v / 10 ** e, ms = m.toFixed(1).replace(/\.0$/, "");
  return ms === "10" ? kit.pow10(e + 1) : (ms === "1" ? "" : ms + "×") + kit.pow10(e);
}
const fmtLen = (v) => (v >= 1000 ? `${kit.fmtNum(v / 1000, 1)} mm` : `${Math.round(v)} µm`);
const fmtTime = (s) => (s < 90 ? `${kit.fmtNum(s, 1)} s` : s < 5400 ? `${kit.fmtNum(s / 60, 1)} min` : `${kit.fmtNum(s / 3600, 1)} h`);

function rgb(hex) {
  const h = String(hex).trim().replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16);
  return /^[0-9a-f]{6}$/i.test(f) ? [n >> 16, (n >> 8) & 255, n & 255] : [133, 85, 42];
}

export default function init(plate) {
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (w < 620 ? w / (w + 250) : 2.05), minHeight: 300, maxHeight: 980,
    label: "A slice of tissue 300 micrometers across with consuming cells drawn as circles and one or three secreting cells; brown shading shows the cytokine concentration and a contour marks the niche where it exceeds the signaling threshold. Beside it, a chart of concentration against distance from a secreting cell, with and without consumers.",
  });
  const { ctx } = st;
  const p = { kprod: 100, n: 1e-3, NR: 3000, nsec: 1 };

  // A jittered hexagonal arrangement of possible cell positions; each has a rank so that lowering the density
  // removes cells at random but always the same ones.
  const rand = kit.rng(21);
  const cells = [];
  for (let row = 0, y = -HALF - LATTICE; y <= HALF + LATTICE; row++, y += LATTICE * Math.sqrt(3) / 2) {
    for (let x = -HALF - LATTICE + (row % 2) * LATTICE / 2; x <= HALF + LATTICE; x += LATTICE) {
      cells.push({ x: x + (rand.random() - 0.5) * 2.4, y: y + (rand.random() - 0.5) * 2.4, u: rand.random() });
    }
  }
  const latticeDensity = 2 / (Math.sqrt(3) * LATTICE * LATTICE);   // per µm² of slice
  const SECRETORS = { 1: [[0, 0]], 3: [[-62, -38], [58, -24], [4, 66]] };

  let off = null, offCtx = null, G = 0;

  function derived() {
    const kc = consumption(p.NR, p.n), xi = screening(kc), rn = nicheRadius(p.kprod, xi);
    return { kc, xi, rn };
  }

  function fieldAt(x, y, secs, xi) {
    let c = 0;
    for (const [sx, sy] of secs) c += conc(Math.max(R, Math.hypot(x - sx, y - sy)), p.kprod, xi);
    return c;
  }

  function drawTissue(b, d) {
    const c = kit.colors, secs = SECRETORS[p.nsec], s = b.side / (2 * HALF);
    const X = (x) => b.x + (x + HALF) * s, Y = (y) => b.y + (y + HALF) * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.side, b.side); ctx.clip();
    ctx.fillStyle = c.paper || c.bg; ctx.fillRect(b.x, b.y, b.side, b.side);

    // consuming cells in a thin slice (centers within one radius of the plane), drawn as outlines under the field
    const frac = Math.min(1, (p.n * 2 * R) / latticeDensity);
    const rad = Math.max(1.5, R * s * 0.86);
    const shown = cells.filter((q) => q.u < frac && !secs.some(([sx, sy]) => Math.hypot(q.x - sx, q.y - sy) < LATTICE));
    ctx.lineWidth = 1; ctx.strokeStyle = kit.alpha(c.blue, 0.6); ctx.fillStyle = kit.alpha(c.blue, 0.07);
    for (const q of shown) { ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), rad, 0, 7); ctx.fill(); ctx.stroke(); }

    // concentration field on a coarse grid, shaded on a log scale from 0.03 K_D to 100 K_D
    const g = Math.max(40, Math.min(170, Math.round(b.side / 3)));
    if (g !== G) { G = g; off = document.createElement("canvas"); off.width = off.height = G; offCtx = off.getContext("2d"); }
    const img = offCtx.createImageData(G, G), lv = new Float32Array(G * G), [r0, g0, b0] = rgb(c.brown);
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const x = -HALF + (i + 0.5) * (2 * HALF / G), y = -HALF + (j + 0.5) * (2 * HALF / G);
        const v = Math.log10(fieldAt(x, y, secs, d.xi) / KD);
        lv[j * G + i] = v;
        const a = Math.max(0, Math.min(1, (v + 1.5) / 3.5));
        const k = 4 * (j * G + i);
        img.data[k] = r0; img.data[k + 1] = g0; img.data[k + 2] = b0; img.data[k + 3] = Math.round(255 * 0.6 * a ** 0.8);
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, b.x, b.y, b.side, b.side);

    // consumers that sense the cytokine (c >= K_D at their center) get a solid core
    ctx.fillStyle = c.blue;
    for (const q of shown) {
      if (fieldAt(q.x, q.y, secs, d.xi) < KD) continue;
      ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), Math.max(1.5, rad * 0.62), 0, 7); ctx.fill();
    }

    // niche boundary (marching squares on log10(c/K_D) = 0)
    const step = b.side / G, tx = (i) => b.x + (i + 0.5) * step, ty = (j) => b.y + (j + 0.5) * step;
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.8; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let j = 0; j < G - 1; j++) {
      for (let i = 0; i < G - 1; i++) {
        const a = lv[j * G + i], bb = lv[j * G + i + 1], cc = lv[(j + 1) * G + i + 1], dd = lv[(j + 1) * G + i];
        const idx = (a > 0 ? 8 : 0) | (bb > 0 ? 4 : 0) | (cc > 0 ? 2 : 0) | (dd > 0 ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const f = (u, v) => u / (u - v);
        const T = [i + f(a, bb), j], Rt = [i + 1, j + f(bb, cc)], B = [i + f(dd, cc), j + 1], Lf = [i, j + f(a, dd)];
        const seg = (P, Q) => { ctx.moveTo(tx(P[0]), ty(P[1])); ctx.lineTo(tx(Q[0]), ty(Q[1])); };
        switch (idx) {
          case 1: case 14: seg(Lf, B); break;
          case 2: case 13: seg(B, Rt); break;
          case 3: case 12: seg(Lf, Rt); break;
          case 4: case 11: seg(T, Rt); break;
          case 5: seg(Lf, T); seg(B, Rt); break;
          case 6: case 9: seg(T, B); break;
          case 7: case 8: seg(Lf, T); break;
          case 10: seg(T, Rt); seg(Lf, B); break;
        }
      }
    }
    ctx.stroke();

    // screening length around the first secreting cell
    const [s0x, s0y] = secs[0];
    if (d.xi * s < b.side * 1.5) {
      ctx.strokeStyle = c.teal; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(X(s0x), Y(s0y), d.xi * s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      const lx = X(s0x) + d.xi * s * Math.cos(-0.6), ly = Y(s0y) + d.xi * s * Math.sin(-0.6);
      if (lx < b.x + b.side - 12 && ly > b.y + 12) kit.label(ctx, "ξ", lx + 4, ly - 3, { color: c.teal, size: 13, weight: 700 });
    }
    // secreting cells
    for (const [sx, sy] of secs) {
      ctx.fillStyle = c.pink; ctx.strokeStyle = c.paper || c.bg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(sx), Y(sy), Math.max(3, R * s * 1.05), 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // frame and scale bar
    ctx.strokeStyle = c.rule; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.side - 1, b.side - 1);
    const bar = 50 * s, bx = b.x + 10, by = b.y + b.side - 12;
    ctx.fillStyle = kit.alpha(c.bg, 0.85); ctx.fillRect(bx - 4, by - 16, bar + 8, 22);
    ctx.fillStyle = c.ink; ctx.fillRect(bx, by, bar, 2.5);
    kit.label(ctx, "50 µm", bx + bar / 2, by - 4, { size: 11, align: "center", color: c.ink });
  }

  function drawProfile(r, d) {
    const c = kit.colors;
    const A = kit.axes(ctx, r, {
      x: [0, 300], y: [1e-2, 1e3], ylog: true, yfmt: (v) => (Math.abs(v - 1) < 1e-9 ? "1" : kit.pow10(Math.round(Math.log10(v)))), xticks: [0, 50, 100, 150, 200, 250, 300], xfmt: (v) => String(v),
      xlabel: "distance from the secreting cell's center, µm", ylabel: "concentration ÷ K_D",
    });
    const rs = []; for (let x = R; x <= 300; x += 1) rs.push(x);
    ctx.save(); A.clip();
    kit.line(ctx, [[0, 1], [300, 1]], A, { color: c.ink, width: 1, dash: [3, 4] });
    kit.line(ctx, rs.map((x) => [x, p.kprod / (4 * Math.PI * D * x) / KD]), A, { color: c.muted, width: 1.5, dash: [6, 5] });
    if (d.xi <= 300) kit.line(ctx, [[d.xi, 1e-2], [d.xi, 1e3]], A, { color: c.teal, width: 1.2, dash: [5, 5] });
    kit.line(ctx, rs.map((x) => [x, conc(x, p.kprod, d.xi) / KD]), A, { color: c.brown, width: 2.4 });
    if (d.rn !== null && d.rn <= 300) {
      ctx.fillStyle = c.pink; ctx.beginPath(); ctx.arc(A.X(d.rn), A.Y(1), 4.5, 0, 7); ctx.fill();
    }
    ctx.restore();
    kit.label(ctx, "K_D", r.x + r.w - 4, A.Y(1) - 5, { color: c.ink, size: 11, align: "right" });
    if (d.xi <= 300) kit.label(ctx, "ξ", A.X(d.xi) + 4, r.y + 13, { color: c.teal, size: 13, weight: 700 });
    kit.legend(ctx, [{ label: "with consumers", color: c.brown }, { label: "no consumers", color: c.muted, dash: [6, 5] }], r.x, r.y - 32);
  }

  function layout() {
    const W = st.w;
    if (W < 620) {
      const side = W - 24;
      return { tissue: { x: 12, y: 10, side }, chart: { x: 50, y: side + 10 + 62, w: W - 66, h: st.h - side - 10 - 62 - 46 } };
    }
    const side = Math.min(st.h - 20, W * 0.47);
    return { tissue: { x: 12, y: 10, side }, chart: { x: side + 12 + 62, y: 56, w: W - side - 12 - 62 - 18, h: st.h - 56 - 48 } };
  }

  function draw() {
    st.clear();
    const d = derived(), L = layout();
    drawTissue(L.tissue, d);
    drawProfile(L.chart, d);
    if (!ro) return;
    ro.xi.set(fmtLen(d.xi));
    ro.cs.set(`${kit.fmtNum(conc(R, p.kprod, d.xi) / KD, 2)} × K_D`);
    if (d.rn === null) {
      ro.rn.set("none: below K_D at the surface");
      ro.v.set("none"); ro.cells.set("none"); ro.t.set(fmtTime(relax(R, d.kc, d.xi)) + " at the surface");
    } else {
      const vol = (4 / 3) * Math.PI * d.rn ** 3;
      ro.rn.set(fmtLen(d.rn));
      ro.v.set(`${kit.fmtNum(vol / 1000, 2)} pL`);
      ro.cells.set(kit.fmtNum(Math.round(p.n * (vol - (4 / 3) * Math.PI * R ** 3)), 2));
      ro.t.set(fmtTime(relax(d.rn, d.kc, d.xi)));
    }
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  ui.slider({ label: "Secretion rate, k_prod", min: 1, max: 1000, log: true, value: p.kprod, format: (v) => `${kit.fmtNum(v, 1)} molecules/s`, onInput: (v) => { p.kprod = v; draw(); } });
  ui.slider({ label: "Consuming cells, n_consum", min: 1e-6, max: 1e-3, log: true, value: p.n, format: (v) => `${sci(v)} per µm³`, onInput: (v) => { p.n = v; draw(); } });
  ui.slider({ label: "Receptors per consuming cell, N_R", min: 100, max: 30000, log: true, value: p.NR, format: (v) => kit.fmtNum(Math.round(v / (v < 1000 ? 10 : 100)) * (v < 1000 ? 10 : 100)), onInput: (v) => { p.NR = v; draw(); } });
  ui.select({ label: "Secreting cells", value: "1", options: [{ value: "1", label: "one" }, { value: "3", label: "three, about 100 µm apart" }], onChange: (v) => { p.nsec = +v; draw(); } });
  ro = {
    xi: ui.readout({ label: "Screening length ξ" }),
    rn: ui.readout({ label: "Niche radius" }),
    v: ui.readout({ label: "Niche volume" }),
    cells: ui.readout({ label: "Consuming cells inside" }),
    cs: ui.readout({ label: "At the cell surface" }),
    t: ui.readout({ label: "Time to settle at the niche edge" }),
  };
  kit.onThemeChange(draw);
  st.onResize(draw);
  if (document.fonts) document.fonts.ready.then(draw);
  draw();
}
