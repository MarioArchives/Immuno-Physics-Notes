// A map of immune processes by time scale (across) and length scale (up), both logarithmic.
// The processes and named levels follow the paper's figure of time and length scales; each box is an
// order-of-magnitude placement using numbers quoted in the notes. Boxes are numbered, and a numbered list of
// buttons under the map names them; choosing one shows the process's scales and links to the notes that cover it.
import * as kit from "../kit.js";

const ROOT = new URL("../../../", import.meta.url); // docs/
const chapterUrl = (slug) => new URL(`papers/quantitative-immunology/chapters/${slug}.html`, ROOT).href;

const LEVELS = {
  mol: { label: "molecular", css: "--hema", c: "blue" },
  cell: { label: "cellular", css: "--teal", c: "teal" },
  org: { label: "organismal", css: "--dab", c: "brown" },
  pop: { label: "population", css: "--eosin", c: "pink" },
};

const CH = {
  II: ["02-physical-chemistry", "Ligand–receptor binding"],
  III: ["03-antigen-discrimination", "Antigen discrimination"],
  IV: ["04-cytokines", "Cytokine communication"],
  V: ["05-cell-fate", "Cell fate"],
  VI: ["06-repertoires", "Repertoires"],
  VII: ["07-lymphocyte-population-dynamics", "Lymphocyte population dynamics"],
  VIII: ["08-affinity-maturation", "Affinity maturation"],
  IX: ["09-pathogens-and-hosts", "Pathogens and hosts"],
};

// t and L are [low, high] in log10 seconds and log10 meters. Boxes are chosen not to overlap.
// The list is ordered from the smallest scales to the largest, and the map numbers the boxes in this order.
const PROCESSES = [
  {
    name: "Ligand–receptor binding", short: "Binding", level: "mol", t: [-3, 4.1], L: [-10, -8],
    time: "milliseconds to hours", length: "0.1 to 10 nm",
    text: "Single molecules meeting and parting. Bound lifetimes run from under a tenth of a second for early antibodies to more than three hours for a cytokine on its receptor.",
    links: ["II"],
  },
  {
    name: "Antigen discrimination", short: "Discrimination", level: "mol", t: [0, 3], L: [-8, -5],
    time: "seconds to minutes", length: "10 nm to a cell, about 10 µm",
    text: "A T cell reads antigen ligands that each stay bound for a few seconds, and decides whether to respond within minutes of meeting an antigen-presenting cell.",
    links: ["III"],
  },
  {
    name: "Cell fate and differentiation", short: "Cell fate", level: "cell", t: [4, 6.1], L: [-5.5, -4.6],
    time: "hours to weeks", length: "single cells, 5 to 20 µm",
    text: "Cells commit to specialized types. Gene regulation switches within hours, and producing committed blood cells from early progenitors takes about twenty rounds of differentiation, roughly two weeks.",
    links: ["V"],
  },
  {
    name: "Cytokine signaling", short: "Cytokines", level: "cell", t: [3.5, 5.3], L: [-4.6, -3],
    time: "hours to days", length: "a cytokine niche, about 25 µm, up to a lymph node",
    text: "Cells exchange small signaling molecules. A signal may reach only the nearest neighbors or a whole lymphoid organ, depending on how many cells consume it, and the cells answer over hours to days.",
    links: ["IV"],
  },
  {
    name: "Affinity maturation", short: "Germinal centers", level: "org", t: [5.4, 6.35], L: [-4, -3],
    time: "days to weeks", length: "germinal centers inside a lymph node",
    text: "B cells mutate their receptors and compete for antigen. The germinal center reaction starts about three days after exposure, and one lineage may take over within days, after more than two weeks, or never.",
    links: ["VIII"],
  },
  {
    name: "Proliferation and clearance", short: "Expansion", level: "org", t: [5, 6.45], L: [-2.7, 0.2],
    time: "days to weeks", length: "lymph node to whole body",
    text: "Clones that recognize the pathogen multiply over days, the pathogen is cleared, and most of the expanded cells die again.",
    links: ["VII"],
  },
  {
    name: "Repertoire and memory", short: "Memory", level: "org", t: [6.45, 9.4], L: [-1.5, 0.4],
    time: "months to a lifetime", length: "the whole body",
    text: "The full collection of receptors, carried by about a million million B and T cells in a human, together with the memory cells that past infections leave behind for months to years.",
    links: ["VI", "VII"],
  },
  {
    name: "Pathogen evolution", short: "Evolution", level: "pop", t: [7.5, 9.5], L: [3, 7],
    time: "years to decades", length: "up to thousands of kilometers",
    text: "Viruses such as influenza evolve across the whole host population, which is why the flu vaccine is renewed every year, and the immunity of the hosts evolves with them.",
    links: ["IX"],
  },
];

const X_RANGE = [-3.4, 9.8], Y_RANGE = [-10.5, 7.4];
const D_PROTEIN = 2e-10; // m^2/s, a small protein in solution (about 200 µm^2/s)

const T_TICKS = [
  [-3, "ms"], [0, "s"], [Math.log10(60), "min"], [Math.log10(3600), "hour"], [Math.log10(86400), "day"],
  [Math.log10(30 * 86400), "month"], [Math.log10(3.156e7), "year"], [Math.log10(3.156e8), "decade"], [Math.log10(3.156e9), "century"],
];
const L_TICKS = [[-10, "0.1 nm"], [-8, "10 nm"], [-6, "1 µm"], [-4, "100 µm"], [-2, "1 cm"], [0, "1 m"], [2, "100 m"], [4, "10 km"], [6, "1000 km"]];
// Named levels of the length axis, shown on the right.
const L_NAMES = [[-9, "molecule"], [-7, "membrane"], [-5, "cell"], [-3, "lymph node"], [-1.5, "tissue"], [0.2, "organism"], [5, "population"]];

const diffusionL = (lt) => 0.5 * Math.log10(6 * D_PROTEIN * 10 ** lt);

export default function init(plate) {
  kit.css("scales", `
    .scales-key { list-style: none; margin: 0; padding: 0.2rem 1rem 0.6rem; display: grid; gap: 0.15rem 1rem;
      grid-template-columns: repeat(auto-fill, minmax(14.5rem, 1fr)); }
    .scales-key button { display: flex; align-items: center; gap: 0.55rem; width: 100%; text-align: left; cursor: pointer;
      font: 500 0.86rem/1.25 var(--sans); color: var(--ink); background: none; border: 0; border-radius: 4px; padding: 0.3rem 0.4rem; }
    .scales-key button:hover { background: color-mix(in srgb, var(--lv) 12%, transparent); }
    .scales-key button:focus-visible { outline: 2px solid var(--eosin); outline-offset: 1px; }
    .scales-key button[aria-pressed="true"] { background: color-mix(in srgb, var(--lv) 20%, transparent); font-weight: 700; }
    .scales-key .badge { flex: none; display: grid; place-items: center; width: 1.3rem; height: 1.3rem; border-radius: 50%;
      font: 700 0.72rem/1 var(--sans); background: var(--lv); color: var(--plate-bg); }
    .scales-card { margin: 0 1rem 0.9rem; padding: 0.65rem 0.8rem; font-family: var(--sans); font-size: 0.88rem; line-height: 1.5;
      border-left: 3px solid var(--lv, var(--rule)); background: color-mix(in srgb, var(--lv, var(--rule)) 7%, transparent); border-radius: 0 4px 4px 0; }
    .scales-card h3 { margin: 0 0 0.15rem; font: 700 0.98rem var(--sans); color: var(--ink); }
    .scales-card p { margin: 0 0 0.35rem; }
    .scales-card p:last-child { margin-bottom: 0; }
    .scales-card .sc-scales { color: var(--muted); font-size: 0.82rem; }
    .scales-card .sc-hint { color: var(--muted); }
  `);
  const host = plate.querySelector(".plate-stage");
  host.classList.remove("loading");
  const mapHost = document.createElement("div");
  host.append(mapHost);
  const st = kit.stage(mapHost, {
    aspect: (w) => (w < 560 ? 0.82 : 1.5), minHeight: 320, maxHeight: 560,
    label: "Map of immune processes by time scale, from milliseconds to a century across, and length scale, from a tenth of a nanometer to thousands of kilometers up. Each process is a numbered box; the numbered list below the map names them.",
  });
  const { ctx, canvas } = st;

  // The key: one button per process, numbered as on the map.
  const key = document.createElement("ol");
  key.className = "scales-key";
  const buttons = PROCESSES.map((p, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.style.setProperty("--lv", `var(${LEVELS[p.level].css})`);
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = String(i + 1);
    const name = document.createElement("span"); name.textContent = p.name;
    b.append(badge, name);
    b.setAttribute("aria-label", `${i + 1}. ${p.name}: ${p.time}, ${p.length}`);
    b.addEventListener("click", () => select(i));
    li.append(b); key.append(li);
    return b;
  });
  host.append(key);
  const card = document.createElement("div");
  card.className = "scales-card";
  card.setAttribute("aria-live", "polite");
  host.append(card);

  const state = { sel: -1, diffusion: true };
  function select(i) { state.sel = state.sel === i ? -1 : i; render(); }

  let A = null, R = null, boxes = [];

  function plotRect() {
    return st.narrow
      ? { x: 50, y: 34, w: st.w - 64, h: st.h - 34 - 74 }
      : { x: 60, y: 40, w: st.w - 60 - 92, h: st.h - 40 - 50 };
  }

  // Keep only tick labels that have room, in order of importance (first, last, then the rest left to right).
  function thinTicks(ticks, toPx, minGap) {
    ctx.save(); ctx.font = kit.font(11, 400);
    const kept = [];
    const fits = (t) => kept.every((k) => Math.abs(toPx(k[0]) - toPx(t[0])) >= (ctx.measureText(k[1]).width + ctx.measureText(t[1]).width) / 2 + minGap);
    for (const t of [ticks[0], ticks[ticks.length - 1], ...ticks.slice(1, -1)]) if (fits(t)) kept.push(t);
    ctx.restore();
    return kept.sort((a, b) => a[0] - b[0]);
  }

  function draw() {
    const c = kit.colors;
    st.clear();
    R = plotRect();
    const X = (v) => R.x + ((v - X_RANGE[0]) / (X_RANGE[1] - X_RANGE[0])) * R.w;
    const ticksX = thinTicks(T_TICKS, X, 10);
    const ticksY = st.narrow ? L_TICKS.filter((_, k) => k % 2 === 0) : L_TICKS;
    A = kit.axes(ctx, R, {
      x: X_RANGE, y: Y_RANGE,
      xticks: ticksX.map((t) => t[0]), xfmt: (v) => (ticksX.find((t) => Math.abs(t[0] - v) < 1e-9) || [0, ""])[1],
      yticks: ticksY.map((t) => t[0]), yfmt: (v) => (ticksY.find((t) => Math.abs(t[0] - v) < 1e-9) || [0, ""])[1],
      xlabel: "time scale", ylabel: "length scale",
    });
    boxes = PROCESSES.map((p) => {
      const x0 = A.X(p.t[0]), x1 = A.X(p.t[1]), y0 = A.Y(p.L[1]), y1 = A.Y(p.L[0]);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    });

    // legend of levels
    let lx = st.narrow ? 12 : R.x + 100;
    const ly = st.narrow ? R.y + R.h + 56 : R.y - 16;
    ctx.save();
    ctx.font = kit.font(11.5, 500); ctx.textBaseline = "middle";
    for (const k of Object.keys(LEVELS)) {
      const L = LEVELS[k];
      ctx.fillStyle = kit.alpha(c[L.c], 0.25); ctx.strokeStyle = c[L.c]; ctx.lineWidth = 1.2;
      ctx.fillRect(lx, ly - 5, 10, 10); ctx.strokeRect(lx + 0.5, ly - 4.5, 9, 9);
      ctx.fillStyle = c.ink; ctx.fillText(L.label, lx + 15, ly);
      lx += 15 + ctx.measureText(L.label).width + (st.narrow ? 10 : 16);
    }
    ctx.restore();

    // named levels on a right-hand axis
    if (!st.narrow) {
      ctx.save();
      ctx.strokeStyle = c.muted; ctx.lineWidth = 1;
      for (const [v] of L_NAMES) { const y = Math.round(A.Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(R.x + R.w, y); ctx.lineTo(R.x + R.w + 4, y); ctx.stroke(); }
      ctx.restore();
      for (const [v, name] of L_NAMES) kit.label(ctx, name, R.x + R.w + 8, A.Y(v), { color: c.muted, size: 11, weight: 400, baseline: "middle" });
    }

    ctx.save(); A.clip();
    // diffusion reference line
    if (state.diffusion) {
      const pts = [];
      for (let lt = X_RANGE[0]; lt <= X_RANGE[1] + 1e-9; lt += 0.2) pts.push([lt, diffusionL(lt)]);
      kit.line(ctx, pts, A, { color: c.muted, width: 1.3, dash: [5, 5] });
      const lt0 = -3.2, ly0 = diffusionL(lt0);
      const ang = Math.atan2(A.Y(ly0 + 0.5) - A.Y(ly0), A.X(lt0 + 1) - A.X(lt0));
      ctx.save();
      ctx.translate(A.X(lt0), A.Y(ly0) - 6); ctx.rotate(ang);
      kit.label(ctx, st.narrow ? "protein diffusion" : "how far a small protein diffuses", 0, 0, { color: c.muted, size: 10.5, weight: 500 });
      ctx.restore();
    }
    // process boxes with numbered badges
    boxes.forEach((b, i) => {
      const col = c[LEVELS[PROCESSES[i].level].c];
      const on = state.sel === i, dim = state.sel >= 0 && !on;
      ctx.fillStyle = kit.alpha(col, on ? 0.32 : dim ? 0.05 : 0.15);
      ctx.strokeStyle = kit.alpha(col, on ? 1 : dim ? 0.3 : 0.8);
      ctx.lineWidth = on ? 2 : 1.2;
      roundRect(ctx, b.x, b.y, b.w, b.h, 5);
      ctx.fill(); ctx.stroke();
    });
    boxes.forEach((b, i) => {
      const col = c[LEVELS[PROCESSES[i].level].c];
      const dim = state.sel >= 0 && state.sel !== i;
      const rad = 8.5;
      // top-left corner when the box has room, otherwise its middle
      const bx = b.w >= 2 * rad + 8 ? b.x + rad + 4 : b.x + b.w / 2;
      const by = b.h >= 2 * rad + 8 ? b.y + rad + 4 : b.y + b.h / 2;
      ctx.globalAlpha = dim ? 0.4 : 1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(bx, by, rad, 0, 7); ctx.fill();
      kit.label(ctx, String(i + 1), bx, by + 0.5, { color: c.bg, size: 11, weight: 700, align: "center", baseline: "middle" });
      ctx.globalAlpha = 1;
    });
    ctx.restore();

    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(state.sel === i)));
  }

  function showDetail() {
    card.replaceChildren();
    if (state.sel < 0) {
      card.style.removeProperty("--lv");
      const p = document.createElement("p");
      p.className = "sc-hint";
      p.textContent = "Choose a process, on the map or in the list, to see its time and length scales and where to read about it.";
      card.append(p);
      return;
    }
    const p = PROCESSES[state.sel];
    card.style.setProperty("--lv", `var(${LEVELS[p.level].css})`);
    const h = document.createElement("h3"); h.textContent = `${state.sel + 1}. ${p.name}`;
    const sc = document.createElement("p"); sc.className = "sc-scales";
    sc.textContent = `Time: ${p.time}. Length: ${p.length}.`;
    const tx = document.createElement("p"); tx.textContent = p.text;
    const ln = document.createElement("p");
    ln.append("Read more: ");
    p.links.forEach((k, j) => {
      if (j) ln.append(" and ");
      const a = document.createElement("a");
      a.href = chapterUrl(CH[k][0]); a.textContent = CH[k][1];
      ln.append(a);
    });
    ln.append(".");
    card.append(h, sc, tx, ln);
  }

  // Clicking a box on the canvas selects it too.
  const boxAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let hit = -1, area = Infinity;
    boxes.forEach((b, i) => { if (x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y - 3 && y <= b.y + b.h + 3 && b.w * b.h < area) { hit = i; area = b.w * b.h; } });
    return hit;
  };
  canvas.addEventListener("click", (e) => { const i = boxAt(e); if (i >= 0) select(i); });
  canvas.addEventListener("mousemove", (e) => { canvas.style.cursor = boxAt(e) >= 0 ? "pointer" : ""; });

  function render() { showDetail(); draw(); }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  ui.toggle({ label: "Show how far a small protein diffuses", value: state.diffusion, onChange: (v) => { state.diffusion = v; draw(); } });
  ui.button({ label: "Clear selection", onClick: () => { state.sel = -1; render(); } });

  st.onResize(draw);
  kit.onThemeChange(draw);
  if (document.fonts) document.fonts.ready.then(draw);
  render();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
