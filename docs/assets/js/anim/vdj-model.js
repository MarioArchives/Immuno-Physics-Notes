// vdj-model.js: a toy V(D)J recombination model (Section VI B) shared by the vdj and repertoire-sharing plates.
// Pure functions only (no DOM), so the model can be tested in Node.
//
// A scenario r is (V, D, J, delV, delD5, delD3, delJ, insVD, insDJ). Its probability factorizes as
//   P(V) P(D,J) P(delV|V) P(delD5|D) P(delD3|D) P(delJ|J) P(insVD) P(insDJ),
// where an insertion of length L has probability P_len(L) times the product of a nucleotide composition.
// The sequence is V minus its last delV letters, insVD, D trimmed on both ends, insDJ, J minus its first delJ letters.
// The generation probability of a sequence sums over every scenario that produces it: Pgen(s) = sum_{r -> s} P(r).
//
// All segment sequences are made up for illustration. They are not real human or mouse genes.

const NT = "ACGT";

export const TOY = {
  V: [
    { name: "V1", seq: "GCTCAGCGA", p: 0.5, del: [0.35, 0.25, 0.2, 0.12, 0.08] },
    { name: "V2", seq: "ATCGTGAGC", p: 0.3, del: [0.2, 0.3, 0.25, 0.15, 0.1] },
    { name: "V3", seq: "CAGTCCATG", p: 0.2, del: [0.4, 0.3, 0.15, 0.1, 0.05] },
  ],
  D: [
    { name: "D1", seq: "GGTACAGG", del5: [0.4, 0.3, 0.2, 0.1], del3: [0.3, 0.3, 0.25, 0.15] },
    { name: "D2", seq: "GGGACTGG", del5: [0.35, 0.3, 0.2, 0.15], del3: [0.4, 0.25, 0.2, 0.15] },
  ],
  J: [
    { name: "J1", seq: "TACGAGCAG", del: [0.3, 0.3, 0.2, 0.12, 0.08] },
    { name: "J2", seq: "AACTCCTAT", del: [0.25, 0.3, 0.25, 0.12, 0.08] },
    { name: "J3", seq: "TGGAGCTGT", del: [0.35, 0.25, 0.2, 0.12, 0.08] },
  ],
  // P(D, J): rows D1, D2; columns J1, J2, J3. D2 sits downstream of J1 and J2 in this toy locus, so it can only join J3.
  DJ: [
    [0.25, 0.2, 0.15],
    [0, 0, 0.4],
  ],
  insLenVD: [0.2, 0.25, 0.22, 0.16, 0.1, 0.07],
  insLenDJ: [0.25, 0.25, 0.2, 0.15, 0.1, 0.05],
  comp: { A: 0.2, C: 0.3, G: 0.3, T: 0.2 },
};

function pick(probs, u) {
  let c = 0;
  for (let i = 0; i < probs.length; i++) { c += probs[i]; if (u < c) return i; }
  return probs.length - 1;
}

function compArray(m) { return [m.comp.A, m.comp.C, m.comp.G, m.comp.T]; }

/** Draw one recombination scenario. random() returns a uniform number in [0, 1). */
export function sampleScenario(m, random) {
  const v = pick(m.V.map((g) => g.p), random());
  const flatDJ = m.DJ.flat();
  const dj = pick(flatDJ, random());
  const d = Math.floor(dj / m.J.length), j = dj % m.J.length;
  const ins = (lens) => {
    const L = pick(lens, random());
    let s = "";
    for (let k = 0; k < L; k++) s += NT[pick(compArray(m), random())];
    return s;
  };
  return {
    v, d, j,
    delV: pick(m.V[v].del, random()),
    delD5: pick(m.D[d].del5, random()),
    delD3: pick(m.D[d].del3, random()),
    delJ: pick(m.J[j].del, random()),
    insVD: ins(m.insLenVD),
    insDJ: ins(m.insLenDJ),
  };
}

/** The pieces of the recombined sequence, in order. */
export function scenarioParts(m, r) {
  const V = m.V[r.v].seq, D = m.D[r.d].seq, J = m.J[r.j].seq;
  return [
    { kind: "V", text: V.slice(0, V.length - r.delV) },
    { kind: "N", text: r.insVD },
    { kind: "D", text: D.slice(r.delD5, D.length - r.delD3) },
    { kind: "N", text: r.insDJ },
    { kind: "J", text: J.slice(r.delJ) },
  ];
}

export function scenarioSequence(m, r) { return scenarioParts(m, r).map((p) => p.text).join(""); }

function insProb(m, lens, s) {
  if (s.length >= lens.length) return 0;
  let p = lens[s.length];
  for (const c of s) p *= m.comp[c];
  return p;
}

/** Every factor of P_rearr(r), in the order of the formula, and their product. */
export function scenarioFactors(m, r) {
  const f = [
    { label: `P(${m.V[r.v].name})`, p: m.V[r.v].p },
    { label: `P(${m.D[r.d].name},${m.J[r.j].name})`, p: m.DJ[r.d][r.j] },
    { label: `P(delV=${r.delV}|${m.V[r.v].name})`, p: m.V[r.v].del[r.delV] },
    { label: `P(delD5′=${r.delD5}|${m.D[r.d].name})`, p: m.D[r.d].del5[r.delD5] },
    { label: `P(delD3′=${r.delD3}|${m.D[r.d].name})`, p: m.D[r.d].del3[r.delD3] },
    { label: `P(delJ=${r.delJ}|${m.J[r.j].name})`, p: m.J[r.j].del[r.delJ] },
    { label: `P(insVD=${r.insVD || "∅"})`, p: insProb(m, m.insLenVD, r.insVD) },
    { label: `P(insDJ=${r.insDJ || "∅"})`, p: insProb(m, m.insLenDJ, r.insDJ) },
  ];
  return { factors: f, p: f.reduce((a, x) => a * x.p, 1) };
}

export function scenarioProb(m, r) { return scenarioFactors(m, r).p; }

export function sameScenario(a, b) {
  return a.v === b.v && a.d === b.d && a.j === b.j && a.delV === b.delV && a.delD5 === b.delD5 &&
    a.delD3 === b.delD3 && a.delJ === b.delJ && a.insVD === b.insVD && a.insDJ === b.insDJ;
}

/**
 * Every scenario that produces sequence s, with its probability. Enumerates the V end and J end that match,
 * then every D choice, D trimming and split of the remaining letters into the two insertions.
 */
export function scenariosFor(m, s, { keep = true } = {}) {
  const out = [];
  let total = 0;
  const n = s.length;
  // cumulative product of the insertion composition along s, so any insertion s[a..b) costs cp[b] / cp[a]
  const cp = new Float64Array(n + 1);
  cp[0] = 1;
  for (let k = 0; k < n; k++) cp[k + 1] = cp[k] * (m.comp[s[k]] || 0);
  const insP = (lens, a, b) => (b - a < lens.length && cp[a] > 0 ? lens[b - a] * (cp[b] / cp[a]) : 0);
  for (let v = 0; v < m.V.length; v++) {
    const V = m.V[v].seq;
    let lcp = 0;                                    // longest common prefix of s and this V
    while (lcp < V.length && lcp < n && s[lcp] === V[lcp]) lcp++;
    for (let dv = 0; dv < m.V[v].del.length; dv++) {
      const lv = V.length - dv;
      if (!m.V[v].del[dv] || lv > lcp) continue;
      const pv = m.V[v].p * m.V[v].del[dv];
      for (let j = 0; j < m.J.length; j++) {
        const J = m.J[j].seq;
        let lcs = 0;                                // longest common suffix of s and this J
        while (lcs < J.length && lcs < n && s[n - 1 - lcs] === J[J.length - 1 - lcs]) lcs++;
        for (let dj = 0; dj < m.J[j].del.length; dj++) {
          const lj = J.length - dj;
          if (!m.J[j].del[dj] || lj > lcs || lv + lj > n) continue;
          const pj = m.J[j].del[dj];
          const end = n - lj;                       // the middle (insVD + D part + insDJ) is s[lv..end)
          const nVD = m.insLenVD.length, nDJ = m.insLenDJ.length;
          for (let d = 0; d < m.D.length; d++) {
            const pdj = m.DJ[d][j];
            if (!pdj) continue;
            const D = m.D[d].seq, L = D.length, del5 = m.D[d].del5, del3 = m.D[d].del3;
            // o is where the untrimmed D would start in s; the kept part D[d5..L-d3) then sits at a = o + d5
            for (let o = lv - del5.length + 1; o < lv + nVD; o++) {
              // run[i] = number of consecutive matches of D against s starting at D position i (alignment o)
              const run = new Int8Array(L + 1);
              for (let i = L - 1; i >= 0; i--) { const q = o + i; run[i] = q >= 0 && q < n && s[q] === D[i] ? run[i + 1] + 1 : 0; }
              for (let d5 = 0; d5 < del5.length; d5++) {
                const a = o + d5;
                if (a < lv || a - lv >= nVD || !del5[d5]) continue;
                for (let d3 = 0; d3 < del3.length; d3++) {
                  const ld = L - d5 - d3;
                  if (ld <= 0 || !del3[d3] || run[d5] < ld || end - a - ld < 0 || end - a - ld >= nDJ) continue;
                  const p = pv * pj * pdj * del5[d5] * del3[d3] * insP(m.insLenVD, lv, a) * insP(m.insLenDJ, a + ld, end);
                  if (!p) continue;
                  total += p;
                  if (keep) out.push({ r: { v, d, j, delV: dv, delD5: d5, delD3: d3, delJ: dj, insVD: s.slice(lv, a), insDJ: s.slice(a + ld, end) }, p });
                }
              }
            }
          }
        }
      }
    }
  }
  if (keep) out.sort((x, y) => y.p - x.p);
  return { list: out, pgen: total };
}

/** Generation probability of a sequence: the sum over all scenarios that produce it. */
export function pgen(m, s) { return scenariosFor(m, s, { keep: false }).pgen; }

/** Memoized Pgen, for evaluating many sequences. */
export function pgenCache(m) {
  const cache = new Map();
  return (s) => {
    let p = cache.get(s);
    if (p === undefined) { p = pgen(m, s); cache.set(s, p); }
    return p;
  };
}

/** Draw a sequence (not a scenario) from Pgen. */
export function sampleSequence(m, random) { return scenarioSequence(m, sampleScenario(m, random)); }
