// Operaciones de edición. Todas devuelven canales nuevos (no modifican la entrada),
// así el editor puede guardar el estado anterior para deshacer.

const clampRange = (ch, a, b) => {
  const n = ch[0].length;
  const s = Math.max(0, Math.min(n, Math.round(Math.min(a, b))));
  const e = Math.max(0, Math.min(n, Math.round(Math.max(a, b))));
  return [s, e];
};

/** Se queda solo con [a, b). */
export function crop(ch, a, b) {
  const [s, e] = clampRange(ch, a, b);
  return ch.map((c) => c.slice(s, e));
}

/** Borra [a, b). */
export function remove(ch, a, b) {
  const [s, e] = clampRange(ch, a, b);
  return ch.map((c) => {
    const out = new Float32Array(c.length - (e - s));
    out.set(c.subarray(0, s), 0);
    out.set(c.subarray(e), s);
    return out;
  });
}

export function peak(ch, a = 0, b = ch[0].length) {
  const [s, e] = clampRange(ch, a, b);
  let p = 0;
  for (const c of ch) for (let i = s; i < e; i++) { const x = Math.abs(c[i]); if (x > p) p = x; }
  return p;
}

/** Normaliza [a, b) para que el pico quede en `target` (0..1). */
export function normalize(ch, a = 0, b = ch[0].length, target = 0.98) {
  const [s, e] = clampRange(ch, a, b);
  const p = peak(ch, s, e);
  if (p === 0) return ch.map((c) => c.slice());
  const g = target / p;
  return ch.map((c) => {
    const out = c.slice();
    for (let i = s; i < e; i++) out[i] *= g;
    return out;
  });
}

/** Fade lineal: 'in' sube de 0 a 1 en [a, b); 'out' baja de 1 a 0. */
export function fade(ch, a, b, dir = 'in') {
  const [s, e] = clampRange(ch, a, b);
  const n = Math.max(1, e - s);
  return ch.map((c) => {
    const out = c.slice();
    for (let i = s; i < e; i++) {
      const t = (i - s) / n;
      // curva suave (cuarto de seno): suena más natural que una recta
      const g = dir === 'in' ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
      out[i] *= g;
    }
    return out;
  });
}

/** Da vuelta [a, b). */
export function reverse(ch, a = 0, b = ch[0].length) {
  const [s, e] = clampRange(ch, a, b);
  return ch.map((c) => {
    const out = c.slice();
    out.subarray(s, e).reverse();
    return out;
  });
}

/** Cruce por cero más cercano a `i` (en la mezcla de canales), buscando hasta `radius` muestras. */
export function nearestZeroCrossing(ch, i, radius = 2000) {
  const n = ch[0].length;
  const mono = (k) => { let x = 0; for (const c of ch) x += c[k]; return x; };
  i = Math.max(0, Math.min(n - 1, Math.round(i)));
  for (let d = 0; d <= radius; d++) {
    for (const k of [i - d, i + d]) {
      if (k <= 0 || k >= n) continue;
      const a = mono(k - 1);
      const b = mono(k);
      if (a === 0 || (a < 0) !== (b < 0)) return k;
    }
  }
  return i;
}

/** Resumen para dibujar: min/max por columna en [a, b) de la mezcla de canales c. */
export function minMax(c, a, b, cols) {
  const out = new Float32Array(cols * 2);
  const span = (b - a) / cols;
  for (let x = 0; x < cols; x++) {
    const s = Math.floor(a + x * span);
    const e = Math.max(s + 1, Math.floor(a + (x + 1) * span));
    let lo = 1;
    let hi = -1;
    for (let i = s; i < e && i < c.length; i++) {
      const v = c[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo > hi) { lo = 0; hi = 0; }
    out[x * 2] = lo;
    out[x * 2 + 1] = hi;
  }
  return out;
}

/** Forma de onda chiquita (para la biblioteca): picos de la mezcla en `cols` columnas. */
export function thumbnail(ch, cols = 120) {
  const n = ch[0].length;
  const out = new Float32Array(cols);
  for (let x = 0; x < cols; x++) {
    const s = Math.floor((x * n) / cols);
    const e = Math.floor(((x + 1) * n) / cols);
    let p = 0;
    for (const c of ch) for (let i = s; i < e; i++) { const v = Math.abs(c[i]); if (v > p) p = v; }
    out[x] = p;
  }
  return out;
}

/** Recorta silencio del principio y del final (umbral en amplitud). */
export function trimSilence(ch, threshold = 0.002) {
  const n = ch[0].length;
  const loud = (i) => ch.some((c) => Math.abs(c[i]) > threshold);
  let s = 0;
  while (s < n && !loud(s)) s++;
  let e = n;
  while (e > s && !loud(e - 1)) e--;
  return crop(ch, s, e);
}
