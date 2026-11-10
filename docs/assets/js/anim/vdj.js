// V(D)J recombination with toy segments (Section VI B): draw a scenario, show the junction it makes and its probability,
// then list every scenario that makes the same sequence. Their sum is the generation probability Pgen(s).
import * as kit from "../kit.js";
import { TOY, sampleScenario, scenarioParts, scenarioSequence, scenarioFactors, scenariosFor, sameScenario } from "./vdj-model.js";

const SHOW = 6; // scenarios listed before "and n more"

export default function init(plate) {
  kit.css("vdj", `
    .vdj { padding: 1.1rem 1rem 0.6rem; font-family: var(--sans); }
    .vdj-row { display: grid; grid-template-columns: 6.6rem minmax(0, 1fr); gap: 0.4rem 0.8rem; align-items: start; margin: 0 0 0.75rem; }
    .vdj-tag { font-size: 0.82rem; color: var(--muted); padding-top: 0.15rem; }
    .vdj-mono { font: 600 1.02rem/1.45 ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace; letter-spacing: 0.05em; }
    .vdj-germ { display: flex; flex-wrap: wrap; gap: 0.2rem 1.1rem; }
    .vdj-seg { display: inline-flex; flex-direction: column; }
    .vdj-seg small { font: 500 0.74rem var(--sans); color: var(--muted); letter-spacing: 0; }
    .nt-V { color: var(--hema); } .nt-D { color: var(--dab); } .nt-J { color: var(--teal); }
    .nt-N { color: var(--eosin); background: color-mix(in srgb, var(--eosin) 13%, transparent); border-radius: 2px; }
    .nt-x { text-decoration: line-through; opacity: 0.38; }
    .nt-dots { color: var(--muted); font-weight: 400; }
    .vdj-new .vdj-mono > span { animation: vdj-in 0.45s ease-out both; }
    @keyframes vdj-in { from { opacity: 0; transform: translateY(-0.25rem); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .vdj-new .vdj-mono > span { animation: none; } }
    .vdj-formula { font-size: 0.82rem; color: var(--muted); line-height: 1.55; margin: -0.2rem 0 0.9rem 7.4rem; }
    .vdj-formula b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
    .vdj-list { border-top: 1px solid var(--rule); padding-top: 0.7rem; }
    .vdj-list h4 { font: 600 0.88rem var(--sans); margin: 0 0 0.5rem; color: var(--ink); }
    .vdj-alt { display: grid; grid-template-columns: 1.4rem auto minmax(0, 1fr); gap: 0.15rem 0.7rem; align-items: baseline; padding: 0.2rem 0.3rem; border-radius: 4px; }
    .vdj-alt.is-true { box-shadow: inset 0 0 0 1.5px var(--eosin); }
    .vdj-alt .rank { font-size: 0.78rem; color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
    .vdj-alt .meta { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
    .vdj-alt .meta b { color: var(--ink); font-weight: 600; }
    .vdj-alt .meta em { color: var(--eosin); font-style: normal; font-weight: 600; }
    .vdj-more { font-size: 0.8rem; color: var(--muted); margin: 0.3rem 0 0 2.4rem; }
    .vdj-bar { display: flex; height: 0.9rem; margin: 0.7rem 0 0.25rem; border-radius: 3px; overflow: hidden; background: var(--grid); }
    .vdj-bar span { display: block; min-width: 0; border-right: 1px solid var(--plate-bg); background: color-mix(in srgb, var(--hema) 38%, var(--plate-bg)); }
    .vdj-bar span:nth-child(even) { background: color-mix(in srgb, var(--hema) 22%, var(--plate-bg)); }
    .vdj-bar span.is-true { background: var(--eosin); }
    .vdj-bar-note { font-size: 0.78rem; color: var(--muted); margin: 0; }
    @media (max-width: 34rem) {
      .vdj-row { grid-template-columns: 1fr; gap: 0.15rem; }
      .vdj-formula { margin-left: 0; }
      .vdj-alt { grid-template-columns: 1.4rem minmax(0, 1fr); }
      .vdj-alt .meta { grid-column: 2; }
      .vdj-mono { font-size: 0.92rem; letter-spacing: 0.03em; }
      .vdj-more { margin-left: 2.1rem; }
    }
  `);
  const host = plate.querySelector(".plate-stage");
  host.classList.remove("loading");
  const rand = kit.rng(7); // the first draw is a sequence whose true scenario ranks second of 24
  const tally = { n: 0, right: 0 };
  let cur = null, showAll = false;

  const box = document.createElement("div");
  box.className = "vdj";
  box.innerHTML = `
    <div class="vdj-row"><span class="vdj-tag">Germline pieces</span><div class="vdj-germ vdj-mono" data-k="germ"></div></div>
    <div class="vdj-row"><span class="vdj-tag">Recombined</span><div class="vdj-mono" data-k="made"></div></div>
    <p class="vdj-formula" data-k="formula"></p>
    <div class="vdj-list">
      <h4 data-k="head"></h4>
      <div data-k="alts"></div>
      <p class="vdj-more" data-k="more"></p>
      <div class="vdj-bar" data-k="bar" aria-hidden="true"></div>
      <p class="vdj-bar-note" data-k="note"></p>
    </div>`;
  host.append(box);
  const $ = (k) => box.querySelector(`[data-k="${k}"]`);

  const span = (cls, text) => { const s = document.createElement("span"); s.className = cls; s.textContent = text; return s; };
  const fmtP = (p) => kit.fmtNum(p, 1);
  const pct = (x) => (x >= 0.995 ? "100%" : x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

  // the recombined sequence, colored by the roles a scenario gives each letter
  function colored(r) {
    const el = document.createElement("div");
    el.className = "vdj-mono";
    for (const part of scenarioParts(TOY, r)) if (part.text) el.append(span(`nt-${part.kind}`, part.text));
    return el;
  }
  function describe(r) {
    const n = r.insVD.length + r.insDJ.length;
    return `${TOY.V[r.v].name}·${TOY.D[r.d].name}·${TOY.J[r.j].name}, trims ${r.delV}/${r.delD5}+${r.delD3}/${r.delJ}, ${n} inserted`;
  }

  function renderGermline(r) {
    const g = $("germ"); g.replaceChildren();
    const seg = (name, cls, seq, from, to, dotsBefore, dotsAfter) => {
      const w = document.createElement("span"); w.className = "vdj-seg";
      const line = document.createElement("span");
      if (dotsBefore) line.append(span("nt-dots", "…"));
      if (from > 0) line.append(span(`${cls} nt-x`, seq.slice(0, from)));
      line.append(span(cls, seq.slice(from, to)));
      if (to < seq.length) line.append(span(`${cls} nt-x`, seq.slice(to)));
      if (dotsAfter) line.append(span("nt-dots", "…"));
      const lab = document.createElement("small"); lab.textContent = name;
      w.append(line, lab);
      g.append(w);
    };
    const V = TOY.V[r.v], D = TOY.D[r.d], J = TOY.J[r.j];
    seg(`${V.name}, ${r.delV} trimmed`, "nt-V", V.seq, 0, V.seq.length - r.delV, true, false);
    seg(`${D.name}, ${r.delD5}+${r.delD3} trimmed`, "nt-D", D.seq, r.delD5, D.seq.length - r.delD3, false, false);
    seg(`${J.name}, ${r.delJ} trimmed`, "nt-J", J.seq, r.delJ, J.seq.length, false, true);
    g.setAttribute("aria-label", `Chosen segments ${V.name}, ${D.name} and ${J.name}; struck-through letters are deleted.`);
  }

  function render() {
    const r = cur.r, seq = cur.seq, list = cur.list, pg = cur.pgen;
    renderGermline(r);
    const made = colored(r);
    made.setAttribute("aria-label", `Recombined sequence ${seq}; pink letters are random insertions.`);
    $("made").replaceWith(made); made.dataset.k = "made";
    const { factors, p } = scenarioFactors(TOY, r);
    $("formula").innerHTML = "";
    factors.forEach((f, i) => {
      if (i) $("formula").append(" × ");
      $("formula").append(`${f.label} `, Object.assign(document.createElement("b"), { textContent: kit.fmtNum(f.p, 2) }));
    });
    $("formula").append(" = ", Object.assign(document.createElement("b"), { textContent: fmtP(p) }), " for this scenario");

    $("head").textContent = `${list.length === 1 ? "The only scenario" : `All ${list.length} scenarios`} that give this exact sequence`;
    const alts = $("alts"); alts.replaceChildren();
    const trueRank = list.findIndex((x) => sameScenario(x.r, r));
    const rows = showAll ? list.map((x, i) => i) : [...Array(Math.min(SHOW, list.length)).keys()];
    if (!showAll && trueRank >= SHOW) rows.push(trueRank);
    for (const i of rows) {
      const x = list[i], isTrue = i === trueRank;
      const row = document.createElement("div");
      row.className = "vdj-alt" + (isTrue ? " is-true" : "");
      const meta = document.createElement("span"); meta.className = "meta";
      meta.innerHTML = `${describe(x.r)} · <b>${fmtP(x.p)}</b> (${pct(x.p / pg)})${isTrue ? " · <em>what happened</em>" : ""}`;
      row.append(span("rank", String(i + 1)), colored(x.r), meta);
      alts.append(row);
    }
    const hidden = list.length - rows.length;
    $("more").textContent = hidden > 0 ? `and ${hidden} less likely scenario${hidden > 1 ? "s" : ""}, all spelling the same letters` : "";
    const bar = $("bar"); bar.replaceChildren();
    list.forEach((x, i) => { const s = document.createElement("span"); s.style.flex = `${x.p / pg} 0 0`; if (i === trueRank) s.className = "is-true"; bar.append(s); });
    $("note").textContent = `The bar is Pgen(s) = ${fmtP(pg)}, the sum over all ${list.length} scenarios; the pink slice is the one that happened.`;

    ro.n.set(String(list.length));
    ro.pg.set(fmtP(pg));
    ro.share.set(pct(p / pg));
    ro.best.set(trueRank === 0 ? "yes" : `no (it ranks ${trueRank + 1})`);
    ro.tally.set(tally.n ? `${tally.right.toLocaleString("en-US")} of ${tally.n.toLocaleString("en-US")} (${pct(tally.right / tally.n)})` : "none yet");
    box.classList.remove("vdj-new"); void box.offsetWidth; box.classList.add("vdj-new");
  }

  function draw(count = 1) {
    for (let k = 0; k < count; k++) {
      const r = sampleScenario(TOY, rand.random);
      const seq = scenarioSequence(TOY, r);
      const { list, pgen } = scenariosFor(TOY, seq);
      tally.n++;
      if (sameScenario(list[0].r, r)) tally.right++;
      cur = { r, seq, list, pgen };
    }
    render();
  }

  const ui = kit.controls(plate.querySelector(".plate-controls"));
  ui.button({ label: "Recombine", primary: true, onClick: () => draw(1) });
  ui.button({ label: "Recombine 1,000 times", onClick: () => draw(1000) });
  ui.toggle({ label: "List every scenario", value: false, onChange: (v) => { showAll = v; render(); } });
  const ro = {
    n: ui.readout({ label: "Scenarios for this sequence" }),
    pg: ui.readout({ label: "Pgen(s)" }),
    share: ui.readout({ label: "Share from what happened" }),
    best: ui.readout({ label: "Most likely scenario is right" }),
    tally: ui.readout({ label: "Right so far" }),
  };
  draw(1);
}
