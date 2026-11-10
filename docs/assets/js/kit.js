// kit.js: shared helpers for the interactive plates.
//
// A plate is authored in HTML as
//   <figure class="plate" data-anim="name">
//     <div class="plate-stage"></div>
//     <div class="plate-controls"></div>
//     <figcaption><b class="plate-title">Title.</b> Caption.</figcaption>
//   </figure>
// and site.js lazily imports assets/js/anim/name.js and calls its default export with the <figure>.
// See docs/assets/js/anim/README.md for the conventions.

/* ---------------- theme colours ---------------- */

// Read from CSS custom properties, refreshed in place when the theme changes.
export const colors = { series: [] };

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  Object.assign(colors, {
    bg: v("--plate-bg"), paper: v("--paper"), ink: v("--ink"), muted: v("--muted"),
    rule: v("--rule"), grid: v("--grid"),
    blue: v("--hema"), blueSoft: v("--hema-soft"), brown: v("--dab"), brownSoft: v("--dab-soft"),
    pink: v("--eosin"), teal: v("--teal"), gold: v("--gold"),
  });
  colors.series = [colors.blue, colors.pink, colors.teal, colors.brown, colors.gold];
}
readColors();

const themeListeners = new Set();
/** Call fn whenever the light/dark theme changes (colors are already updated when it runs). */
export function onThemeChange(fn) { themeListeners.add(fn); return () => themeListeners.delete(fn); }
function themeChanged() { readColors(); themeListeners.forEach((f) => f()); }
window.addEventListener("qi-themechange", themeChanged);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeChanged);

/** A theme colour (a #rrggbb custom property) with transparency, e.g. alpha(colors.blue, 0.3). */
export function alpha(color, a) {
  let h = String(color).trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return color;
  const n = parseInt(h, 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Canvas font string in the site's UI face. */
export function font(px = 12, weight = 500) {
  return `${weight} ${px}px "Schibsted Grotesk", "Segoe UI", system-ui, sans-serif`;
}

/* ---------------- stage ---------------- */

/**
 * Create a HiDPI canvas filling `host` (normally the .plate-stage).
 * aspect: width/height ratio, or a function (cssWidth) => ratio, so a plate can be taller on phones.
 * Returns { canvas, ctx, w, h, narrow, onResize(fn), clear(color) }. w and h are CSS pixels;
 * the context is pre-scaled, so draw in CSS pixels.
 */
export function stage(host, { aspect = 16 / 9, minHeight = 220, maxHeight = 520, label = "" } = {}) {
  host.classList.remove("loading");
  const canvas = document.createElement("canvas");
  if (label) { canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", label); }
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const s = { canvas, ctx, w: 0, h: 0, dpr: 1, narrow: false };
  const listeners = [];
  function fit() {
    const w = Math.max(1, Math.floor(host.clientWidth));
    const ratio = typeof aspect === "function" ? aspect(w) : aspect;
    const h = Math.round(Math.max(minHeight, Math.min(maxHeight, w / ratio)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === s.w && h === s.h && dpr === s.dpr) return;
    Object.assign(s, { w, h, dpr, narrow: w < 560 });
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    listeners.forEach((f) => f(s));
  }
  s.onResize = (fn) => { listeners.push(fn); };
  s.clear = (color = colors.bg) => { ctx.fillStyle = color; ctx.fillRect(0, 0, s.w, s.h); };
  new ResizeObserver(() => fit()).observe(host);
  fit();
  return s;
}

/* ---------------- controls ---------------- */

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

/**
 * Build accessible controls inside `host` (normally the .plate-controls).
 * Every control returns an object with `.value` (get/set) and `.el`.
 */
export function controls(host) {
  let readoutRow = null;
  const api = {
    host,
    /** Range slider. log: true makes the scale logarithmic (min and max must be > 0). */
    slider({ label, min, max, step = "any", value, log = false, format = (v) => fmtNum(v), onInput = () => {} }) {
      const id = nextId("s");
      const wrap = el("div", "ctl");
      const lab = el("label", "ctl-label");
      lab.htmlFor = id;
      const name = el("span"); name.textContent = label;
      const out = el("output"); out.setAttribute("for", id);
      lab.append(name, out);
      const input = el("input");
      Object.assign(input, { type: "range", id });
      const toPos = (v) => (log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) * 1000 : v);
      const fromPos = (p) => (log ? Math.exp(Math.log(min) + (p / 1000) * (Math.log(max) - Math.log(min))) : +p);
      if (log) { input.min = 0; input.max = 1000; input.step = 1; } else { input.min = min; input.max = max; input.step = step; }
      input.value = toPos(value);
      let current = log ? value : +input.value;
      const show = () => { out.textContent = format(current); input.setAttribute("aria-valuetext", format(current)); };
      input.addEventListener("input", () => { current = fromPos(input.value); show(); onInput(current); });
      show();
      wrap.append(lab, input);
      host.insertBefore(wrap, readoutRow);
      return {
        el: wrap, input,
        get value() { return current; },
        set value(v) { current = v; input.value = toPos(v); show(); },
      };
    },
    /** Push button. primary: true for the main action. */
    button({ label, onClick = () => {}, primary = false }) {
      const b = el("button", primary ? "btn primary" : "btn");
      b.type = "button"; b.textContent = label;
      b.addEventListener("click", onClick);
      buttonRow().append(b);
      return { el: b, set label(t) { b.textContent = t; } };
    },
    /** Checkbox. */
    toggle({ label, value = false, onChange = () => {} }) {
      const lab = el("label", "ctl-check");
      const input = el("input"); input.type = "checkbox"; input.checked = value;
      const t = el("span"); t.textContent = label;
      lab.append(input, t);
      input.addEventListener("change", () => onChange(input.checked));
      host.insertBefore(lab, readoutRow);
      return { el: lab, get value() { return input.checked; }, set value(v) { input.checked = v; } };
    },
    /** Drop-down. options: [{ value, label }]. */
    select({ label, options, value, onChange = () => {} }) {
      const id = nextId("c");
      const wrap = el("div", "ctl");
      const lab = el("label", "ctl-label"); lab.htmlFor = id;
      const name = el("span"); name.textContent = label; lab.append(name);
      const sel = el("select"); sel.id = id;
      for (const o of options) { const op = el("option"); op.value = o.value; op.textContent = o.label; sel.append(op); }
      if (value !== undefined) sel.value = value;
      sel.addEventListener("change", () => onChange(sel.value));
      wrap.append(lab, sel);
      host.insertBefore(wrap, readoutRow);
      return { el: wrap, get value() { return sel.value; }, set value(v) { sel.value = v; } };
    },
    /** A live number shown under the controls. Call .set(text). Updates are announced politely to screen readers. */
    readout({ label, value = "" }) {
      if (!readoutRow) { readoutRow = el("div", "readouts"); readoutRow.setAttribute("aria-live", "polite"); host.append(readoutRow); }
      const r = el("span", "readout");
      const n = el("span"); n.textContent = label;
      const out = el("output"); out.textContent = value;
      r.append(n, out); readoutRow.append(r);
      let last = value;
      return { el: r, set(text) { text = String(text); if (text !== last) { out.textContent = text; last = text; } } };
    },
  };
  let row = null;
  function buttonRow() {
    if (!row) { row = el("div", "btn-row"); host.insertBefore(row, host.firstChild); }
    return row;
  }
  return api;
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

/* ---------------- animation loop ---------------- */

/**
 * Run step(dt) then draw() every frame while the plate is on screen and playing.
 * dt is in seconds, capped at 1/20 s. With reduced motion the plate starts paused
 * (draw() still runs once, so it must render a meaningful still).
 * If `ui` (a controls() object) is given, a Play/Pause button is added.
 * Returns { play(), pause(), toggle(), playing, redraw() }.
 */
export function animate(plate, { step = () => {}, draw = () => {}, ui = null, autoplay = true } = {}) {
  let want = autoplay && !reducedMotion();
  let visible = false, raf = 0, last = 0;
  const btn = ui ? ui.button({ label: want ? "Pause" : "Play", primary: true, onClick: () => api.toggle() }) : null;
  const sync = () => {
    if (btn) { btn.label = want ? "Pause" : "Play"; btn.el.setAttribute("aria-pressed", String(want)); }
    const go = want && visible && !document.hidden;
    if (go && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  function frame(t) {
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; sync(); }, { rootMargin: "80px" }).observe(plate);
  document.addEventListener("visibilitychange", sync);
  onThemeChange(() => draw());
  if (document.fonts) document.fonts.ready.then(() => draw());
  const api = {
    play() { want = true; sync(); },
    pause() { want = false; sync(); },
    toggle() { want = !want; sync(); },
    get playing() { return want; },
    redraw: () => draw(),
  };
  draw();
  return api;
}

/* ---------------- random numbers ---------------- */

/** Seeded generator (mulberry32) with common distributions. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, r;
    do { u = 2 * random() - 1; v = 2 * random() - 1; r = u * u + v * v; } while (r >= 1 || r === 0);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = v * f;
    return u * f;
  };
  const exp = (rate) => -Math.log(1 - random()) / rate;
  const int = (n) => Math.floor(random() * n);
  const poisson = (lam) => {
    if (lam <= 0) return 0;
    if (lam > 40) return Math.max(0, Math.round(lam + Math.sqrt(lam) * normal()));
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= random(); } while (p > L);
    return k - 1;
  };
  const binomial = (n, p) => {
    if (n * p > 30 && n * (1 - p) > 30) return Math.min(n, Math.max(0, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normal())));
    let k = 0; for (let i = 0; i < n; i++) if (random() < p) k++;
    return k;
  };
  return { random, normal, exp, int, poisson, binomial, pick: (arr) => arr[int(arr.length)], reseed(s) { a = s >>> 0; spare = null; } };
}

/* ---------------- plotting ---------------- */

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
/** "10⁻⁵" style power of ten. */
export const pow10 = (e) => "10" + String(e).split("").map((c) => SUP[c] ?? c).join("");

/** Compact number for labels and readouts. */
export function fmtNum(v, digits = 2) {
  if (!isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) {
    const e = Math.floor(Math.log10(a));
    const m = v / 10 ** e;
    const ms = m.toFixed(1).replace(/\.0$/, "");
    return (ms === "1" ? "" : ms === "-1" ? "−" : ms + "×") + pow10(e);
  }
  if (Number.isInteger(v)) return v.toLocaleString("en-US");
  return Number(v.toPrecision(digits + 1)).toLocaleString("en-US", { maximumFractionDigits: 6 }).replace("-", "−");
}

/** Round tick positions for a linear axis. */
export function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}

/**
 * Draw axes in rectangle r = { x, y, w, h } (CSS px) and return the data-to-pixel maps.
 * o: { x: [min, max], y: [min, max], xlog, ylog, xlabel, ylabel, xticks, yticks, xfmt, yfmt, grid }
 * Returns { X(v), Y(v), r, clip() } where clip() clips subsequent drawing to the plot area (wrap in ctx.save/restore).
 */
export function axes(ctx, r, o) {
  const [x0, x1] = o.x, [y0, y1] = o.y;
  const lx = (v) => (o.xlog ? Math.log10(v) : v), ly = (v) => (o.ylog ? Math.log10(v) : v);
  const X = (v) => r.x + ((lx(v) - lx(x0)) / (lx(x1) - lx(x0))) * r.w;
  const Y = (v) => r.y + r.h - ((ly(v) - ly(y0)) / (ly(y1) - ly(y0))) * r.h;
  const logTicks = (a, b) => { const t = []; for (let e = Math.ceil(Math.log10(a) - 1e-9); e <= Math.log10(b) + 1e-9; e++) t.push(10 ** e); return t; };
  const xt = o.xticks ?? (o.xlog ? logTicks(x0, x1) : niceTicks(x0, x1, Math.max(2, Math.round(r.w / 80))));
  const yt = o.yticks ?? (o.ylog ? logTicks(y0, y1) : niceTicks(y0, y1, Math.max(2, Math.round(r.h / 50))));
  const xf = o.xfmt ?? (o.xlog ? (v) => pow10(Math.round(Math.log10(v))) : (v) => fmtNum(v));
  const yf = o.yfmt ?? (o.ylog ? (v) => pow10(Math.round(Math.log10(v))) : (v) => fmtNum(v));
  ctx.save();
  ctx.lineWidth = 1;
  if (o.grid !== false) {
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (const v of yt) { const y = Math.round(Y(v)) + 0.5; ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = colors.muted;
  ctx.beginPath();
  ctx.moveTo(r.x + 0.5, r.y); ctx.lineTo(r.x + 0.5, r.y + r.h + 0.5); ctx.lineTo(r.x + r.w, r.y + r.h + 0.5);
  ctx.stroke();
  ctx.fillStyle = colors.muted; ctx.font = font(11, 400);
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const v of xt) { const x = X(v); ctx.fillText(xf(v), x, r.y + r.h + 5); ctx.fillRect(Math.round(x), r.y + r.h, 1, 4); }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const v of yt) ctx.fillText(yf(v), r.x - 6, Y(v));
  ctx.font = font(12, 500); ctx.fillStyle = colors.ink;
  if (o.xlabel) { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(o.xlabel, r.x + r.w / 2, r.y + r.h + 21); }
  if (o.ylabel) { ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(o.ylabel, r.x - 4, r.y - 8); }
  ctx.restore();
  return {
    X, Y, r,
    clip() { ctx.beginPath(); ctx.rect(r.x, r.y - 1, r.w + 1, r.h + 2); ctx.clip(); },
  };
}

/** Polyline through data points [[x, y], ...] using maps from axes(). */
export function line(ctx, pts, A, { color = colors.blue, width = 2, dash = null } = {}) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  let pen = false;
  for (const [x, y] of pts) {
    if (!isFinite(x) || !isFinite(y)) { pen = false; continue; }
    const px = A.X(x), py = A.Y(y);
    if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
  }
  ctx.stroke();
  ctx.restore();
}

/** Text helper. */
export function label(ctx, text, x, y, { color = colors.ink, size = 12, weight = 500, align = "left", baseline = "alphabetic" } = {}) {
  ctx.save();
  ctx.fillStyle = color; ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Small legend: items [{ label, color, dash }] drawn as a row starting at (x, y). Returns its width. */
export function legend(ctx, items, x, y) {
  ctx.save();
  ctx.font = font(11.5, 500); ctx.textBaseline = "middle";
  let cx = x;
  for (const it of items) {
    ctx.strokeStyle = it.color; ctx.lineWidth = 2; ctx.setLineDash(it.dash || []);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + 16, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.ink; ctx.fillText(it.label, cx + 21, y);
    cx += 21 + ctx.measureText(it.label).width + 16;
  }
  ctx.restore();
  return cx - x;
}

/** Add a plate's own CSS once (use the theme custom properties, e.g. var(--hema), so both themes work). */
export function css(id, text) {
  if (document.querySelector(`style[data-plate="${id}"]`)) return;
  const s = document.createElement("style");
  s.dataset.plate = id;
  s.textContent = text;
  document.head.append(s);
}

/** Shown in place of a plate that failed to start. */
export function showError(plate, err) {
  const stageEl = plate.querySelector(".plate-stage");
  if (stageEl) stageEl.classList.remove("loading");
  const p = document.createElement("p");
  p.className = "plate-error";
  p.textContent = `This model could not start: ${err && err.message ? err.message : err}. Reload the page to try again.`;
  (stageEl || plate).append(p);
  console.error(err);
}
