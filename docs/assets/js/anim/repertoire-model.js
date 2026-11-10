// repertoire-model.js: shared maths for the optimal-repertoire plates (not a plate itself).
//
// Shape space is a periodic grid (a ring in 1D, a torus in 2D) of n or nx*ny sites with spacing dx, in units of the
// cross-reactivity width sigma. Antigens a and receptors r live on the same sites. With f(r - a) the cross-reactivity
// kernel, the coverage is Pt_a = sum_r f(r - a) P_r, and the expected cost is
//   <F> = sum_a Q_a Fbar(Pt_a),
// where Fbar(x) is the mean harm of an infection whose encounters each succeed with probability x:
//   F(m) = m^alpha        ->  Fbar = Gamma(1+alpha) x^-alpha
//   F(m) = 1 - e^{-b m}   ->  Fbar = b / (b + x)
//   F(m) = Theta(m - m0)  ->  Fbar = e^{-m0 x}
//   F(m) = ln m           ->  Fbar = -gamma_E - ln x
// Convolutions use FFTs, so each sum over the kernel costs O(n log n).

/* ---------------- cost functions ---------------- */

const EULER = 0.5772156649015329;

/** Log-gamma (Lanczos), enough for Gamma(1 + alpha) with alpha in [0, 10]. */
export function lgamma(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * A cost family. kind: "power" (param alpha), "saturating" (param beta), "threshold" (param m0), "log".
 * Returns { kind, p, Fbar(x), dF(x) = Fbar'(x) (negative), h(y) = inverse of Fbar' (for y < 0), label }.
 */
export function costFamily(kind, p = 1) {
  if (kind === "power") {
    const G = Math.exp(lgamma(1 + p));
    return {
      kind, p, label: `m^${p}`,
      Fbar: (x) => G * Math.pow(x, -p),
      dF: (x) => -p * G * Math.pow(x, -p - 1),
      h: (y) => Math.pow(-y / (p * G), -1 / (1 + p)),
    };
  }
  if (kind === "saturating") {
    return {
      kind, p, label: `1 − e^(−${p}m)`,
      Fbar: (x) => p / (p + x),
      dF: (x) => -p / ((p + x) * (p + x)),
      h: (y) => Math.sqrt(-p / y) - p,
    };
  }
  if (kind === "threshold") {
    return {
      kind, p, label: `Θ(m − ${p})`,
      Fbar: (x) => Math.exp(-p * x),
      dF: (x) => -p * Math.exp(-p * x),
      h: (y) => -Math.log(-y / p) / p,
    };
  }
  if (kind === "log") {
    return {
      kind, p, label: "ln m",
      Fbar: (x) => -EULER - Math.log(x),
      dF: (x) => -1 / x,
      h: (y) => -1 / y,
    };
  }
  throw new Error(`unknown cost ${kind}`);
}

/**
 * Optimum without cross-reactivity (f = identity): P*_r = max(h(-lambda / Q_r), 0) with lambda set by sum P* = 1.
 * Q need not be normalised. Returns { P: Float64Array, lambda }.
 */
export function optimalSpecific(Q, cost) {
  const n = Q.length, P = new Float64Array(n);
  const total = (lam) => {
    let s = 0;
    for (let i = 0; i < n; i++) if (Q[i] > 0) s += Math.max(cost.h(-lam / Q[i]), 0);
    return s;
  };
  // total(lambda) decreases with lambda; bracket in log space.
  let lo = -60, hi = 60;
  for (let k = 0; k < 200; k++) {
    const mid = 0.5 * (lo + hi);
    if (total(Math.exp(mid)) > 1) lo = mid; else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  const lam = Math.exp(0.5 * (lo + hi));
  let s = 0;
  for (let i = 0; i < n; i++) { P[i] = Q[i] > 0 ? Math.max(cost.h(-lam / Q[i]), 0) : 0; s += P[i]; }
  for (let i = 0; i < n; i++) P[i] /= s;
  return { P, lambda: lam };
}

/* ---------------- FFT and periodic convolution ---------------- */

/** In-place radix-2 complex FFT of length n (a power of two). sign = -1 forward, +1 inverse (unscaled). */
export function fft(re, im, sign = -1) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/**
 * A periodic grid in 1D (ny = 1) or 2D, with spacing dx (in units of sigma).
 * grid.conv(src, khat, out) computes out_a = sum_r k(r - a) src_r for a kernel given by its transform khat.
 */
export function makeGrid(nx, ny = 1, dx = 0.1) {
  const n = nx * ny;
  const re = new Float64Array(n), im = new Float64Array(n);
  const rowRe = new Float64Array(Math.max(nx, ny)), rowIm = new Float64Array(Math.max(nx, ny));

  const cr = new Float64Array(nx), ci = new Float64Array(nx);
  function fft2(sign) {
    if (ny === 1) { fft(re, im, sign); return; }
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) { cr[x] = re[y * nx + x]; ci[x] = im[y * nx + x]; }
      fft(cr, ci, sign);
      for (let x = 0; x < nx; x++) { re[y * nx + x] = cr[x]; im[y * nx + x] = ci[x]; }
    }
    const rr = rowRe.subarray(0, ny), ri = rowIm.subarray(0, ny);
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) { rr[y] = re[y * nx + x]; ri[y] = im[y * nx + x]; }
      fft(rr, ri, sign);
      for (let y = 0; y < ny; y++) { re[y * nx + x] = rr[y]; im[y * nx + x] = ri[y]; }
    }
  }

  /** Signed periodic offset of site index i along an axis of length m, in units of sigma. */
  const off = (i, m) => (i <= m / 2 ? i : i - m) * dx;

  return {
    nx, ny, n, dx, off,
    /** Real transform of a symmetric kernel k(distance in sigma units). */
    kernel(k) {
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const d = ny === 1 ? Math.abs(off(x, nx)) : Math.hypot(off(x, nx), off(y, ny));
        re[y * nx + x] = k(d); im[y * nx + x] = 0;
      }
      fft2(-1);
      return Float64Array.from(re); // symmetric kernel: transform is real
    },
    conv(src, khat, out) {
      for (let i = 0; i < n; i++) { re[i] = src[i]; im[i] = 0; }
      fft2(-1);
      for (let i = 0; i < n; i++) { re[i] *= khat[i]; im[i] *= khat[i]; }
      fft2(1);
      for (let i = 0; i < n; i++) out[i] = re[i] / n;
      return out;
    },
    /** Squared modulus of the discrete Fourier transform of src, |sum_r src_r e^{i q.r}|^2, indexed like the grid. */
    power(src, out = new Float64Array(n)) {
      for (let i = 0; i < n; i++) { re[i] = src[i]; im[i] = 0; }
      fft2(-1);
      for (let i = 0; i < n; i++) out[i] = re[i] * re[i] + im[i] * im[i];
      return out;
    },
    /** Wave number |q| (in units of 1/sigma) of grid index i in Fourier space. */
    qOf(i) {
      const x = i % nx, y = (i / nx) | 0;
      const qx = (2 * Math.PI * (x <= nx / 2 ? x : x - nx)) / (nx * dx);
      const qy = ny === 1 ? 0 : (2 * Math.PI * (y <= ny / 2 ? y : y - ny)) / (ny * dx);
      return Math.hypot(qx, qy);
    },
    /** Filter white noise to the power spectrum spec(|q| in units of 1/sigma); returns a zero-mean, unit-variance field. */
    filtered(normal, spec) {
      for (let i = 0; i < n; i++) { re[i] = normal(); im[i] = 0; }
      fft2(-1);
      for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const qx = (2 * Math.PI * (x <= nx / 2 ? x : x - nx)) / (nx * dx);
        const qy = ny === 1 ? 0 : (2 * Math.PI * (y <= ny / 2 ? y : y - ny)) / (ny * dx);
        const a = Math.sqrt(spec(Math.hypot(qx, qy)));
        re[y * nx + x] *= a; im[y * nx + x] *= a;
      }
      re[0] = 0; im[0] = 0;
      fft2(1);
      let s2 = 0;
      for (let i = 0; i < n; i++) s2 += re[i] * re[i];
      const sd = Math.sqrt(s2 / n) || 1;
      return Float64Array.from(re, (v) => v / sd);
    },
  };
}

/** Cross-reactivity kernels: exp[-(d/eta)^gamma / 2] with eta = 1 sigma for gamma = 2 (Gaussian). */
export const gaussian = (d) => Math.exp(-0.5 * d * d);
export function stretched(gamma) { return (d) => Math.exp(-Math.pow(d, gamma)); }

/* ---------------- landscapes ---------------- */

/**
 * Random antigen landscape: Q_a = exp(s z_a) normalised to sum 1, with z standard normal and
 * s^2 = ln(1 + cv^2), so Q is log-normal with coefficient of variation cv.
 * With spec (a power spectrum in |q|), z is correlated across shape space; otherwise independent per site.
 */
export function landscape(grid, random, cv, spec = null) {
  const s = Math.sqrt(Math.log(1 + cv * cv));
  const z = spec ? grid.filtered(random.normal, spec) : Float64Array.from({ length: grid.n }, () => random.normal());
  return normalise(Float64Array.from(z, (v) => Math.exp(s * v)));
}

export function normalise(v) {
  let s = 0;
  for (const x of v) s += x;
  for (let i = 0; i < v.length; i++) v[i] /= s;
  return v;
}

/** Cosine overlap of two non-negative vectors, between 0 and 1. */
export function overlap(a, b) {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return ab / Math.sqrt(aa * bb);
}

/* ---------------- optimisation ---------------- */

/** Euclidean projection of y onto the probability simplex (sort-based), written into out. */
export function projectSimplex(y, out, scratch) {
  const n = y.length, u = scratch || new Float64Array(n);
  u.set(y);
  u.sort();
  let css = 0, theta = 0;
  for (let i = n - 1, k = 1; i >= 0; i--, k++) {
    css += u[i];
    const t = (css - 1) / k;
    if (i === 0 || u[i - 1] <= t) { theta = t; break; }
  }
  for (let i = 0; i < n; i++) out[i] = Math.max(y[i] - theta, 0);
  return out;
}

/**
 * Minimise <F>(P) = sum_a Q_a Fbar((f * P)_a) over the simplex by accelerated projected gradient with
 * backtracking (momentum k/(k+3), restarted whenever the cost goes up).
 * opt.iterate(k) runs k iterations. Fields: P (current repertoire), Pt (its coverage), cost, gap (a certified
 * relative distance to the optimum, from the convexity bound <F>* >= <F>(P) + min_r g_r - sum_r P_r g_r).
 */
const FLOOR = 1e-13;

export function optimiser(grid, khat, Q, cost, P0 = null) {
  const n = grid.n;
  const P = P0 ? Float64Array.from(P0) : new Float64Array(n).fill(1 / n);
  const Pprev = Float64Array.from(P), Y = new Float64Array(n), Z = new Float64Array(n);
  const G = new Float64Array(n), Pt = new Float64Array(n), work = new Float64Array(n), scratch = new Float64Array(n);
  const W = new Float64Array(n);
  let k = 0, s = 1e-3, costY = Infinity;

  function evalCost(x, ptOut) {
    grid.conv(x, khat, ptOut);
    let c = 0;
    for (let a = 0; a < n; a++) {
      // FFT round-off can push a vanishing coverage slightly below zero; floor it.
      const v = ptOut[a] = Math.max(ptOut[a], FLOOR);
      c += Q[a] * cost.Fbar(v);
    }
    return c;
  }
  function gradAt(ptIn, gOut) {
    for (let a = 0; a < n; a++) W[a] = Q[a] * cost.dF(ptIn[a]);
    return grid.conv(W, khat, gOut);
  }

  const self = { P, Pt, cost: evalCost(P, Pt), gap: Infinity, iterations: 0, lambda: NaN };
  // Initial step size: scale so the first move is a small fraction of the simplex.
  gradAt(Pt, G);
  { let gmax = 0; for (const g of G) gmax = Math.max(gmax, Math.abs(g)); s = 0.1 / (n * (gmax || 1)); }

  self.iterate = function (count = 1) {
    for (let it = 0; it < count; it++) {
      k++;
      const w = k / (k + 3);
      for (let i = 0; i < n; i++) Y[i] = Math.max(P[i] + w * (P[i] - Pprev[i]), 0);
      costY = evalCost(Y, work);
      if (!isFinite(costY)) { Y.set(P); costY = evalCost(Y, work); }
      gradAt(work, G);
      // Backtracking: shrink s until the quadratic upper bound holds; try a slightly larger step first.
      s *= 1.25;
      let cz;
      for (let tries = 0; tries < 60; tries++) {
        for (let i = 0; i < n; i++) scratch[i] = Y[i] - s * G[i];
        projectSimplex(scratch, Z, Pt);
        cz = evalCost(Z, Pt);
        let lin = 0, quad = 0;
        for (let i = 0; i < n; i++) { const d = Z[i] - Y[i]; lin += d * G[i]; quad += d * d; }
        if (cz <= costY + lin + quad / (2 * s)) break;
        s *= 0.5;
      }
      Pprev.set(P);
      if (cz > self.cost) { k = 0; } // restart momentum
      P.set(Z);
      self.cost = cz;
    }
    // Certificate at the current point.
    self.cost = evalCost(P, Pt);
    gradAt(Pt, G);
    let gmin = Infinity, pg = 0, supp = 0, lam = 0;
    for (let i = 0; i < n; i++) {
      gmin = Math.min(gmin, G[i]); pg += P[i] * G[i];
      if (P[i] > 1e-9) { supp += P[i]; lam -= P[i] * G[i]; }
    }
    const lb = self.cost + gmin - pg;
    self.gap = Math.max(0, (self.cost - lb) / Math.abs(lb));
    self.lambda = lam / (supp || 1);
    self.iterations += count;
    return self;
  };
  return self;
}

/** Count local maxima of P above a fraction of its largest value (peaks of the repertoire). */
export function countPeaks(grid, P, frac = 0.02) {
  const { nx, ny, n } = grid;
  let max = 0;
  for (const v of P) max = Math.max(max, v);
  const thr = frac * max;
  let peaks = 0;
  for (let i = 0; i < n; i++) {
    const v = P[i];
    if (v <= thr) continue;
    const x = i % nx, y = (i / nx) | 0;
    let top = true;
    for (let dy = ny === 1 ? 0 : -1; dy <= (ny === 1 ? 0 : 1) && top; dy++) {
      for (let dxi = -1; dxi <= 1; dxi++) {
        if (!dxi && !dy) continue;
        const j = ((y + dy + ny) % ny) * nx + ((x + dxi + nx) % nx);
        if (P[j] > v || (P[j] === v && j < i)) { top = false; break; }
      }
    }
    if (top) peaks++;
  }
  return peaks;
}
