// Ligands diffusing onto membrane receptors: Brownian motion, an Arrhenius sticking probability per collision,
// and unbinding at rate k_off. Section II, "Physical chemistry of ligand-receptor interaction".
import * as kit from "../kit.js";

const BOX_H = 0.62;   // default height of the simulation box (it is 1 wide); the membrane is the bottom edge
const D = 0.015;      // ligand diffusion coefficient, box widths squared per second
const RC = 0.03;      // capture radius around a receptor's binding site
const H = 1 / 120;    // integration step, seconds

export default function init(plate) {
  const hero = plate.dataset.variant === "hero";
  const st = kit.stage(plate.querySelector(".plate-stage"), {
    aspect: (w) => (hero ? (w < 560 ? 1.6 : 4.4) : w < 640 ? w / (w * BOX_H + 230) : 2.15),
    minHeight: hero ? 200 : 300, maxHeight: hero ? 290 : 760,
    label: hero
      ? "Animation: ligand molecules drift by diffusion above a cell membrane and occasionally bind Y-shaped receptors."
      : "Simulation of ligands diffusing above a membrane carrying receptors, with a plot of the fraction of receptors bound over time.",
  });
  const { ctx } = st;
  const rand = kit.rng(7);

  const p = { nL: hero ? 110 : 40, nR: hero ? 26 : 10, barrier: hero ? 1.5 : 2, tauOff: hero ? 2.5 : 5, speed: 1 };

  let boxH = BOX_H;     // matched to the drawn box so that diffusion looks the same in x and y
  let lig = [], rec = [], t = 0, trace = [], flashes = [];
  let colls = 0, binds = 0;           // since the barrier was last changed
  let collAll = 0, pairTime = 0;       // for the measured collision rate per ligand-receptor pair
  let sampleClock = 0;

  function reset() {
    rec = Array.from({ length: p.nR }, (_, i) => ({ x: (i + 0.5) / p.nR, bound: -1 }));
    lig = [];
    setLigands(p.nL);
    t = 0; trace = []; flashes = []; colls = binds = collAll = pairTime = 0; sampleClock = 0;
  }
  function setLigands(n) {
    while (lig.length < n) lig.push({ x: rand.random(), y: rand.random() * boxH * 0.85, r: -1, zone: -1 });
    while (lig.length > n) {
      const l = lig.pop();
      if (l.r >= 0) rec[l.r].bound = -1;
    }
    lig.forEach((l, i) => { if (l.r >= 0) rec[l.r].bound = i; });
  }

  const stick = () => Math.exp(-p.barrier);

  function sub() {
    const s = Math.sqrt(2 * D * H), koff = 1 / p.tauOff;
    let freeL = 0, freeR = 0;
    for (const r of rec) if (r.bound < 0) freeR++;
    for (let i = 0; i < lig.length; i++) {
      const l = lig[i];
      if (l.r >= 0) {
        if (rand.random() < koff * H) {           // unbinding
          rec[l.r].bound = -1;
          const a = Math.PI * (0.15 + 0.7 * rand.random());
          l.x = rec[l.r].x + Math.cos(a) * RC * 1.4; l.y = boxH - Math.sin(a) * RC * 1.4;
          l.zone = l.r; l.r = -1;
        }
        continue;
      }
      freeL++;
      l.x += s * rand.normal(); l.y += s * rand.normal();
      if (l.x < 0) l.x = -l.x; if (l.x > 1) l.x = 2 - l.x;
      if (l.y < 0) l.y = -l.y; if (l.y > boxH) l.y = Math.max(0, 2 * boxH - l.y);
      // which receptor's capture zone is it in?
      let zone = -1;
      const j = Math.min(p.nR - 1, Math.max(0, Math.floor(l.x * p.nR)));
      for (const k of [j - 1, j, j + 1]) {
        if (k < 0 || k >= p.nR) continue;
        const dx = l.x - rec[k].x, dy = l.y - boxH;
        if (dx * dx + dy * dy < RC * RC) { zone = k; break; }
      }
      if (zone >= 0 && zone !== l.zone && rec[zone].bound < 0) {   // a fresh collision with a free receptor
        colls++; collAll++;
        if (rand.random() < stick()) {
          binds++; l.r = zone; rec[zone].bound = i; l.x = rec[zone].x; l.y = boxH;
          if (p.speed <= 4) flashes.push({ x: rec[zone].x, age: 0, hit: true });
        } else if (!hero && p.speed <= 4) {
          flashes.push({ x: rec[zone].x, age: 0, hit: false });
        }
      }
      l.zone = zone;
    }
    pairTime += freeL * freeR * H;
    t += H;
    sampleClock += H;
    if (sampleClock >= 0.25) {
      sampleClock = 0;
      trace.push([t, rec.filter((r) => r.bound >= 0).length / p.nR]);
      while (trace.length && trace[0][0] < t - 120) trace.shift();
    }
  }

  function prediction() {
    if (collAll < 25 || pairTime <= 0) return null;
    const kon = (collAll / pairTime) * stick(), koff = 1 / p.tauOff, L = p.nL, R = p.nR;
    const b = kon * (L + R) + koff;
    const C = (b - Math.sqrt(Math.max(0, b * b - 4 * kon * kon * L * R))) / (2 * kon);
    return C / R;
  }

  /* ---------- drawing ---------- */

  function layout() {
    if (hero) return { box: { x: 0, y: 0, w: st.w, h: st.h }, plot: null };
    if (st.w < 640) {
      const bh = Math.round(st.w * BOX_H);
      return { box: { x: 0, y: 0, w: st.w, h: bh }, plot: { x: 46, y: bh + 44, w: st.w - 64, h: st.h - bh - 92 } };
    }
    const bw = Math.round(st.w * 0.56);
    return { box: { x: 0, y: 0, w: bw, h: st.h }, plot: { x: bw + 58, y: 44, w: st.w - bw - 78, h: st.h - 96 } };
  }

  function drawBox(b) {
    const c = kit.colors;
    const sx = b.w, sy = sx;                            // simulation units to pixels; membrane band is 18 px
    const X = (x) => b.x + x * sx, Y = (y) => b.y + y * sy;
    ctx.save();
    ctx.beginPath(); ctx.rect(b.x, b.y, b.w, b.h); ctx.clip();
    // membrane
    const my = Y(boxH);
    ctx.fillStyle = c.blueSoft; ctx.fillRect(b.x, my, b.w, b.h - (my - b.y));
    ctx.fillStyle = c.rule;
    for (let x = b.x + 3; x < b.x + b.w; x += 7) { ctx.beginPath(); ctx.arc(x, my + 3.5, 2.4, 0, 7); ctx.fill(); }
    if (!hero) kit.label(ctx, "cell membrane", b.x + 10, b.y + b.h - 3, { color: c.muted, size: 10.5, weight: 400 });
    // collision flashes
    for (const f of flashes) {
      const k = f.age / (f.hit ? 0.6 : 0.3);
      ctx.strokeStyle = kit.alpha(f.hit ? c.pink : c.muted, (1 - k) * (f.hit ? 0.9 : 0.5));
      ctx.lineWidth = f.hit ? 2 : 1;
      ctx.beginPath(); ctx.arc(X(f.x), my - 9, 6 + k * (f.hit ? 16 : 7), 0, 7); ctx.stroke();
    }
    // receptors: Y shapes
    const scale = Math.max(0.75, Math.min(1.25, b.w / 520));
    for (const r of rec) {
      const x = X(r.x), on = r.bound >= 0;
      ctx.strokeStyle = on ? c.pink : c.blue; ctx.lineWidth = 2.6 * scale; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, my + 2); ctx.lineTo(x, my - 7 * scale);
      ctx.moveTo(x, my - 7 * scale); ctx.lineTo(x - 5 * scale, my - 14 * scale);
      ctx.moveTo(x, my - 7 * scale); ctx.lineTo(x + 5 * scale, my - 14 * scale);
      ctx.stroke();
      if (on) { ctx.fillStyle = c.brown; ctx.beginPath(); ctx.arc(x, my - 13 * scale, 4 * scale, 0, 7); ctx.fill(); }
    }
    // free ligands
    ctx.fillStyle = c.brown;
    for (const l of lig) {
      if (l.r >= 0) continue;
      ctx.beginPath(); ctx.arc(X(l.x), Math.min(Y(l.y), my - 10), 3.6 * scale, 0, 7); ctx.fill();
    }
    if (!hero) kit.label(ctx, "ligands in solution", b.x + 10, b.y + 18, { color: c.muted, size: 10.5, weight: 400 });
    ctx.restore();
    if (!hero) { ctx.fillStyle = c.grid; ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h); }
  }

  function drawPlot(r) {
    const c = kit.colors;
    const tmax = Math.max(60, t), tmin = tmax - 60;
    const A = kit.axes(ctx, r, { x: [tmin, tmax], y: [0, 1], xlabel: "time, seconds", ylabel: "fraction of receptors bound", yticks: [0, 0.25, 0.5, 0.75, 1] });
    const pred = prediction();
    ctx.save(); A.clip();
    if (pred !== null) kit.line(ctx, [[tmin, pred], [tmax, pred]], A, { color: c.pink, width: 1.6, dash: [6, 5] });
    kit.line(ctx, trace.filter((q) => q[0] >= tmin - 1), A, { color: c.blue, width: 2 });
    ctx.restore();
    const items = [{ label: "simulation", color: c.blue }];
    if (pred !== null) items.push({ label: "well-mixed prediction", color: c.pink, dash: [6, 5] });
    kit.legend(ctx, items, r.x, r.y - 26);
  }

  function draw() {
    st.clear();
    const L = layout();
    const h = Math.max(0.15, (L.box.h - 18) / L.box.w);
    if (Math.abs(h - boxH) > 1e-6) { for (const l of lig) l.y = l.r >= 0 ? h : (l.y * h) / boxH; boxH = h; collAll = 0; pairTime = 0; }
    drawBox(L.box);
    if (L.plot) drawPlot(L.plot);
    if (ro) {
      ro.coll.set(colls.toLocaleString("en-US"));
      ro.bind.set(binds.toLocaleString("en-US"));
      ro.ratio.set(binds ? kit.fmtNum(colls / binds, 2) : "none yet");
      ro.expect.set(kit.fmtNum(Math.exp(p.barrier), 2));
    }
  }

  function step(dt) {
    const n = Math.round((dt * p.speed) / H);
    for (let i = 0; i < n; i++) sub();
    for (const f of flashes) f.age += dt;
    flashes = flashes.filter((f) => f.age < (f.hit ? 0.6 : 0.3));
  }

  /* ---------- controls ---------- */

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  let ro = null;
  reset();
  const loop = kit.animate(plate, { step, draw, ui });
  if (!hero) {
    ui.button({ label: "Reset", onClick: () => { reset(); draw(); } });
    ui.select({
      label: "Speed", value: "1",
      options: [{ value: "1", label: "real time" }, { value: "4", label: "4 times" }, { value: "16", label: "16 times" }, { value: "64", label: "64 times" }],
      onChange: (v) => { p.speed = +v; },
    });
    ui.slider({ label: "Ligand molecules", min: 4, max: 120, step: 1, value: p.nL, format: (v) => String(Math.round(v)), onInput: (v) => { p.nL = Math.round(v); setLigands(p.nL); loop.redraw(); } });
    ui.slider({ label: "Energy barrier, in kT", min: 0, max: 7, step: 0.5, value: p.barrier, format: (v) => v.toFixed(1), onInput: (v) => { p.barrier = v; colls = binds = 0; loop.redraw(); } });
    ui.slider({ label: "Mean time bound, 1/k_off", min: 0.5, max: 60, log: true, value: p.tauOff, format: (v) => `${kit.fmtNum(v, 1)} s`, onInput: (v) => { p.tauOff = v; loop.redraw(); } });
    ro = {
      coll: ui.readout({ label: "Collisions" }),
      bind: ui.readout({ label: "Bindings" }),
      ratio: ui.readout({ label: "Collisions per binding" }),
      expect: ui.readout({ label: "Arrhenius factor e^(ΔG/kT)" }),
    };
    // a short head start so the still frame (reduced motion) already shows bound receptors and a trace
    for (let i = 0; i < 20 / H; i++) sub();
  } else {
    for (let i = 0; i < 6 / H; i++) sub();
  }
  st.onResize(() => loop.redraw());
  loop.redraw();
}
