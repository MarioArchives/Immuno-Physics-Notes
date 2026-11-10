// germinal-center-model.js: a toy germinal center (Section VIII B and C) for the germinal-center plate.
// Pure functions only (no DOM), so the model can be tested in Node.
//
// Each B cell carries a binding energy E (in kT, relative to the founders' average; lower is tighter, affinity ~ e^-E),
// the founder lineage it descends from, and its number of hypermutations.
// One cycle:
//   dark zone   each cell divides twice; each daughter acquires a mutation with probability mu. A mutation destroys
//               the receptor with probability `lethal`; otherwise it shifts E by a Gaussian step that is usually harmful.
//   light zone  each cell survives selection with probability P_s(E) = A e^-E / (1 + A e^-E), where A is the amount of
//               antigen on display (antigen capture and T cell help are lumped into this one survival chance).
//   exit        a fraction `recycle` of the survivors returns to the dark zone; the rest leave as output cells.
// The reaction stops when no cell is left (the center fails) or when the recycled population is back to its
// starting size N0 (the center has refilled).

export const DEFAULTS = {
  founders: 50,      // distinct clones seeding the center
  N0: 1500,          // cells when hypermutation starts
  sigma0: 0.5,       // spread of founder binding energies, kT
  A: 0.07,           // antigen availability, in units of the founders' average affinity
  mu: 0.2,           // mutation probability per daughter per division
  divisions: 2,      // divisions per dark-zone visit
  lethal: 0.3,       // share of mutations that destroy the receptor
  stepMean: 0.6,     // mean change of E for a non-lethal mutation (positive: binding gets worse)
  stepSd: 1.0,       // its spread
  recycle: 0.9,      // share of selected cells returning to the dark zone
  maxCycles: 60,
};

const CAP = 400000;  // hard cap on the number of cells held

export function survival(A, E) { const x = A * Math.exp(-E); return x / (1 + x); }

/** A new germinal center. rand: { random(), normal() }. */
export function create(params, rand) {
  const p = { ...DEFAULTS, ...params };
  const gc = {
    p, rand, cycle: 0, status: "running",
    E: new Float64Array(CAP), lin: new Int32Array(CAP), mut: new Int32Array(CAP), n: 0,
    founderE: new Float64Array(p.founders),
    output: 0, outE: 0, outMut: 0,           // running sums over cells that exited
    history: [],                              // per cycle: { n, meanE, meanMut, shares }
  };
  for (let f = 0; f < p.founders; f++) gc.founderE[f] = p.sigma0 * rand.normal();
  // clonal expansion without mutation: N0 cells shared at random among the founders
  for (let i = 0; i < p.N0; i++) { const f = Math.floor(rand.random() * p.founders); gc.E[i] = gc.founderE[f]; gc.lin[i] = f; gc.mut[i] = 0; }
  gc.n = p.N0;
  record(gc);
  return gc;
}

function record(gc) {
  const { n, E, mut, lin, p } = gc;
  const shares = new Float64Array(p.founders);
  let sE = 0, sM = 0;
  for (let i = 0; i < n; i++) { sE += E[i]; sM += mut[i]; shares[lin[i]]++; }
  if (n) for (let f = 0; f < p.founders; f++) shares[f] /= n;
  gc.history.push({ n, meanE: n ? sE / n : NaN, meanMut: n ? sM / n : NaN, shares });
}

/** Advance one dark-zone / light-zone cycle. Returns the status. */
export function step(gc) {
  if (gc.status !== "running") return gc.status;
  darkZone(gc);
  return lightZone(gc);
}

/** Dark zone: divisions with hypermutation. */
export function darkZone(gc) {
  const { p, rand } = gc;
  let { E, lin, mut } = gc;
  for (let d = 0; d < p.divisions; d++) {
    let m = 0;
    const nE = new Float64Array(Math.min(CAP, gc.n * 2)), nL = new Int32Array(nE.length), nM = new Int32Array(nE.length);
    for (let i = 0; i < gc.n && m < nE.length; i++) {
      for (let c = 0; c < 2 && m < nE.length; c++) {
        let e = E[i], k = mut[i];
        if (rand.random() < p.mu) {
          k++;
          if (rand.random() < p.lethal) continue;            // receptor no longer expressed: the cell is lost
          e += p.stepMean + p.stepSd * rand.normal();
        }
        nE[m] = e; nL[m] = lin[i]; nM[m] = k; m++;
      }
    }
    E = nE; lin = nL; mut = nM; gc.n = m;
  }
  gc.E = E; gc.lin = lin; gc.mut = mut;
}

/** Light zone: selection, then recycling or exit. Returns the status. */
export function lightZone(gc) {
  const { p, rand, E, lin, mut } = gc;
  let m = 0;
  for (let i = 0; i < gc.n; i++) {
    if (rand.random() >= survival(p.A, E[i])) continue;
    if (rand.random() < p.recycle) { E[m] = E[i]; lin[m] = lin[i]; mut[m] = mut[i]; m++; }
    else { gc.output++; gc.outE += E[i]; gc.outMut += mut[i]; }
  }
  gc.n = m;
  gc.cycle++;
  record(gc);
  if (m === 0) gc.status = "failed";
  else if (m >= p.N0) gc.status = "refilled";
  else if (gc.cycle >= p.maxCycles) gc.status = "stalled";
  return gc.status;
}

/** Run to the end and summarize. */
export function run(params, rand) {
  const gc = create(params, rand);
  while (step(gc) === "running");
  return summary(gc);
}

export function summary(gc) {
  const h = gc.history[gc.history.length - 1];
  let top = 0;
  for (const s of h.shares) top = Math.max(top, s);
  let lineages = 0;
  for (const s of h.shares) if (s > 0) lineages++;
  return {
    status: gc.status, cycles: gc.cycle, n: gc.n,
    // gain: geometric-mean affinity now, relative to the cells present when hypermutation started
    meanE: h.meanE, meanMut: h.meanMut, gain: Math.exp(gc.history[0].meanE - h.meanE), top, lineages,
    output: gc.output,
  };
}

/**
 * Many germinal centers at one setting: the share that refill, the mean number of mutations per cell in those that
 * do, and the same averaged over every attempt (a center that fails contributes zero).
 */
export function outcomes(params, runs, makeRand) {
  let ok = 0, mut = 0, logGain = 0;
  for (let r = 0; r < runs; r++) {
    const s = run(params, makeRand(r));
    if (s.status === "refilled") { ok++; mut += s.meanMut; logGain += Math.log10(s.gain); }
  }
  return { refill: ok / runs, mutRefilled: ok ? mut / ok : NaN, mutPerAttempt: mut / runs, log10Gain: ok ? logGain / ok : NaN };
}
