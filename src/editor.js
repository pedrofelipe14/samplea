// Editor de samples: biblioteca, forma de onda, selección, reproducción y exportación.
import { listRecordings, getRecording, saveRecording, deleteRecording, renameRecording } from './lib/db.js';
import { encodeWav } from './lib/wav.js';
import * as dsp from './lib/dsp.js';

const $ = (s) => document.querySelector(s);
const MIP = 256; // muestras por bloque del resumen de la onda
const store = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const st = {
  meta: null, // datos de la grabación abierta
  ch: null, // canales actuales (Float32Array)
  sr: 48000,
  undo: [],
  redo: [],
  view: { s: 0, e: 1 }, // ventana visible, en muestras
  sel: null, // { a, b } en muestras
  cursor: 0,
  mip: null,
  loop: store.get('sa:loop', true),
  play: null,
  buffer: null,
  list: [],
};

let ac = null;
const audio = () => (ac ??= new AudioContext({ latencyHint: 'interactive' }));
const frames = () => st.ch?.[0].length ?? 0;

/* ---------- utilidades ---------- */
function fmtTime(sec, ms = true) {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return ms ? `${m}:${s.toFixed(3).padStart(6, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}
function ago(t) {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'recién';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  if (d < 172800) return 'ayer';
  return new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = (s) => (s || 'sample').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60).toLowerCase() || 'sample';

let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

function fit(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr, ctx: canvas.getContext('2d') };
}

/* ---------- biblioteca ---------- */
async function refreshList() {
  st.list = await listRecordings();
  const ul = $('#list');
  if (!st.list.length) {
    ul.innerHTML = '<li class="none">Acá van a aparecer tus grabaciones.</li>';
    return;
  }
  ul.innerHTML = st.list.map((m) => `
    <li class="item${m.id === st.meta?.id ? ' on' : ''}${m.parent ? ' child' : ''}" data-id="${m.id}">
      <span class="t" title="${esc(m.title)}">${esc(m.title)}</span>
      <button class="link del" data-del="${m.id}" title="Borrar">✕</button>
      <span class="d">${fmtTime(m.frames / m.sampleRate, false)} · ${ago(m.createdAt)}</span>
      <canvas data-thumb="${m.id}"></canvas>
    </li>`).join('');
  for (const m of st.list) drawThumb(ul.querySelector(`canvas[data-thumb="${m.id}"]`), m.thumb, m.id === st.meta?.id);
}

function drawThumb(canvas, thumb, on) {
  if (!canvas || !thumb) return;
  const { w, h, ctx } = fit(canvas);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = on ? '#a6d86e' : '#55604f';
  const n = thumb.length;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0.03, Math.min(1, thumb[i]));
    const bh = v * h;
    ctx.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 1), bh);
  }
}

$('#list').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    if (!del.classList.contains('confirm')) {
      del.classList.add('confirm');
      del.textContent = '¿borrar?';
      setTimeout(() => { del.classList.remove('confirm'); del.textContent = '✕'; }, 2500);
      return;
    }
    const id = del.dataset.del;
    await deleteRecording(id);
    if (st.meta?.id === id) {
      stop();
      st.meta = null;
      st.ch = null;
    }
    await refreshList();
    if (!st.meta) openFirst();
    toast('Grabación borrada');
    return;
  }
  const li = e.target.closest('.item');
  if (li) location.hash = li.dataset.id;
});

/* ---------- abrir ---------- */
async function open(id) {
  const rec = id && (await getRecording(id));
  if (!rec) return openFirst();
  stop();
  st.meta = rec;
  st.ch = rec.channels;
  st.sr = rec.sampleRate;
  st.undo = [];
  st.redo = [];
  st.sel = null;
  st.cursor = 0;
  st.buffer = null;
  st.view = { s: 0, e: frames() };
  buildMip();
  $('#empty').hidden = true;
  $('#work').hidden = false;
  $('#title').value = rec.title;
  $('#saved').textContent = '';
  renderInfo();
  await refreshList();
  drawAll();
}

function openFirst() {
  if (st.list.length) {
    location.hash = st.list[0].id;
  } else {
    st.meta = null;
    st.ch = null;
    $('#work').hidden = true;
    $('#empty').hidden = false;
  }
}

function renderInfo() {
  const n = frames();
  $('#info').textContent = `${fmtTime(n / st.sr)} · ${(st.sr / 1000).toFixed(1).replace('.0', '')} kHz · ${st.ch.length === 1 ? 'mono' : 'estéreo'}`;
}

/* ---------- resumen de la onda (para dibujar rápido archivos largos) ---------- */
function buildMip() {
  st.mip = st.ch.map((c) => {
    const n = Math.ceil(c.length / MIP);
    const lo = new Float32Array(n);
    const hi = new Float32Array(n);
    for (let b = 0; b < n; b++) {
      let l = 1;
      let h = -1;
      const end = Math.min(c.length, (b + 1) * MIP);
      for (let i = b * MIP; i < end; i++) {
        const v = c[i];
        if (v < l) l = v;
        if (v > h) h = v;
      }
      lo[b] = l;
      hi[b] = h;
    }
    return { lo, hi };
  });
}

function rangeMinMax(k, fs, fe) {
  const c = st.ch[k];
  let lo = 1;
  let hi = -1;
  if (fe - fs > MIP * 2) {
    const m = st.mip[k];
    const bs = Math.floor(fs / MIP);
    const be = Math.min(m.lo.length, Math.ceil(fe / MIP));
    for (let b = bs; b < be; b++) {
      if (m.lo[b] < lo) lo = m.lo[b];
      if (m.hi[b] > hi) hi = m.hi[b];
    }
  } else {
    const end = Math.min(c.length, Math.ceil(fe));
    for (let i = Math.max(0, Math.floor(fs)); i < end; i++) {
      const v = c[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo > hi) return [0, 0];
  return [lo, hi];
}

/* ---------- dibujo ---------- */
const wave = $('#wave');
const ruler = $('#ruler');
const overview = $('#overview');

function frameToX(f, w) {
  return ((f - st.view.s) / (st.view.e - st.view.s)) * w;
}
function xToFrame(clientX) {
  const r = wave.getBoundingClientRect();
  const t = (clientX - r.left) / r.width;
  return Math.max(0, Math.min(frames(), st.view.s + t * (st.view.e - st.view.s)));
}

function playPos() {
  const p = st.play;
  if (!p) return null;
  const el = (audio().currentTime - p.t0) * st.sr;
  if (p.loop) return p.a + (el % (p.b - p.a));
  return Math.min(p.b, p.a + el);
}

function drawWave() {
  const { w, h, dpr, ctx } = fit(wave);
  ctx.fillStyle = '#0f110f';
  ctx.fillRect(0, 0, w, h);
  if (!st.ch) return;
  const nch = st.ch.length;
  const spp = (st.view.e - st.view.s) / w;
  const sel = st.sel;
  const xa = sel ? frameToX(sel.a, w) : 0;
  const xb = sel ? frameToX(sel.b, w) : 0;

  if (sel) {
    ctx.fillStyle = 'rgba(166, 216, 110, .13)';
    ctx.fillRect(xa, 0, Math.max(1, xb - xa), h);
  }
  // líneas de centro y separación
  ctx.fillStyle = '#1d211d';
  for (let k = 0; k < nch; k++) ctx.fillRect(0, Math.round(h * (k + 0.5) / nch), w, dpr);
  if (nch > 1) {
    ctx.fillStyle = '#232823';
    ctx.fillRect(0, Math.round(h / 2) - dpr, w, dpr);
  }

  for (let k = 0; k < nch; k++) {
    const cy = h * (k + 0.5) / nch;
    const amp = (h / nch / 2) * 0.92;
    if (spp > 1) {
      for (let x = 0; x < w; x++) {
        const fs = st.view.s + x * spp;
        const [lo, hi] = rangeMinMax(k, fs, fs + spp);
        const inSel = sel && x >= xa && x <= xb;
        ctx.fillStyle = !sel ? '#a6d86e' : inSel ? '#d4f5ac' : '#5f7a4a';
        const y1 = cy - hi * amp;
        const y2 = cy - lo * amp;
        ctx.fillRect(x, y1, 1, Math.max(dpr, y2 - y1));
      }
    } else {
      // con mucho zoom se ven las muestras una por una
      const c = st.ch[k];
      const f0 = Math.max(0, Math.floor(st.view.s) - 1);
      const f1 = Math.min(c.length - 1, Math.ceil(st.view.e) + 1);
      ctx.strokeStyle = '#a6d86e';
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let f = f0; f <= f1; f++) {
        const x = frameToX(f, w);
        const y = cy - c[f] * amp;
        if (f === f0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (spp < 0.12) {
        ctx.fillStyle = '#d4f5ac';
        for (let f = f0; f <= f1; f++) ctx.fillRect(frameToX(f, w) - 2 * dpr, cy - c[f] * amp - 2 * dpr, 4 * dpr, 4 * dpr);
      }
    }
    // L / R
    if (nch > 1) {
      ctx.fillStyle = '#4b544b';
      ctx.font = `${11 * dpr}px ui-monospace, Consolas, monospace`;
      ctx.fillText(k === 0 ? 'L' : 'R', 6 * dpr, h * k / nch + 14 * dpr);
    }
  }

  // bordes de la selección
  if (sel) {
    ctx.fillStyle = '#a6d86e';
    ctx.fillRect(Math.round(xa), 0, dpr, h);
    ctx.fillRect(Math.round(xb), 0, dpr, h);
  }
  // cursor o cabezal
  const pp = playPos();
  if (pp != null) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(frameToX(pp, w)), 0, 1.5 * dpr, h);
  } else if (!sel) {
    ctx.fillStyle = '#e5322d';
    ctx.fillRect(Math.round(frameToX(st.cursor, w)), 0, 1.5 * dpr, h);
  }
}

function niceStep(secPerPx) {
  const steps = [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  return steps.find((s) => s / secPerPx >= 80) ?? 600;
}

function drawRuler() {
  const { w, h, dpr, ctx } = fit(ruler);
  ctx.fillStyle = '#121412';
  ctx.fillRect(0, 0, w, h);
  if (!st.ch) return;
  const secPerPx = (st.view.e - st.view.s) / st.sr / (w / dpr);
  const step = niceStep(secPerPx);
  const t0 = st.view.s / st.sr;
  const t1 = st.view.e / st.sr;
  if (st.sel) {
    ctx.fillStyle = 'rgba(166, 216, 110, .25)';
    const xa = frameToX(st.sel.a, w);
    ctx.fillRect(xa, 0, frameToX(st.sel.b, w) - xa, h);
  }
  ctx.font = `${10.5 * dpr}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    const x = Math.round(frameToX(t * st.sr, w));
    ctx.fillStyle = '#3a413a';
    ctx.fillRect(x, h * 0.55, dpr, h * 0.45);
    ctx.fillStyle = '#7d857b';
    const label = step < 1 ? (t < 60 ? `${t.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}s` : fmtTime(t)) : fmtTime(t, false);
    ctx.fillText(label, x + 4 * dpr, h * 0.45);
  }
}

function drawOverview() {
  const { w, h, dpr, ctx } = fit(overview);
  ctx.fillStyle = '#121412';
  ctx.fillRect(0, 0, w, h);
  if (!st.ch) return;
  const n = frames();
  const per = n / w;
  ctx.fillStyle = '#4c5a43';
  for (let x = 0; x < w; x++) {
    let p = 0;
    for (let k = 0; k < st.ch.length; k++) {
      const [lo, hi] = rangeMinMax(k, x * per, (x + 1) * per);
      p = Math.max(p, -lo, hi);
    }
    const bh = Math.max(dpr, p * h * 0.85);
    ctx.fillRect(x, (h - bh) / 2, 1, bh);
  }
  if (st.sel) {
    ctx.fillStyle = 'rgba(166, 216, 110, .35)';
    ctx.fillRect((st.sel.a / n) * w, 0, Math.max(dpr, ((st.sel.b - st.sel.a) / n) * w), h);
  }
  const vx = (st.view.s / n) * w;
  const vw = Math.max(3 * dpr, ((st.view.e - st.view.s) / n) * w);
  ctx.strokeStyle = '#a6d86e';
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeRect(vx + dpr, dpr, vw - 2 * dpr, h - 2 * dpr);
  const pp = playPos();
  if (pp != null) {
    ctx.fillStyle = '#fff';
    ctx.fillRect((pp / n) * w, 0, dpr, h);
  }
}

function renderReadout() {
  const pp = playPos();
  $('#pos').textContent = fmtTime((pp ?? (st.sel ? st.sel.a : st.cursor)) / st.sr);
  const s = st.sel;
  $('#sel-a').textContent = s ? fmtTime(s.a / st.sr) : '—';
  $('#sel-b').textContent = s ? fmtTime(s.b / st.sr) : '—';
  $('#sel-len').textContent = s ? fmtTime((s.b - s.a) / st.sr) : '—';
  const bpm = +$('#bpm').value;
  if (s && bpm > 0) {
    const beats = ((s.b - s.a) / st.sr) * (bpm / 60);
    const bars = beats / 4;
    const nearBars = Math.abs(bars - Math.round(bars)) < 0.03 && Math.round(bars) > 0;
    $('#beats').textContent = `= ${beats.toFixed(2)} tiempos${nearBars ? ` · ${Math.round(bars)} ${Math.round(bars) === 1 ? 'compás' : 'compases'}` : ''}`;
  } else $('#beats').textContent = '';
  $('#dl-what').textContent = s ? 'la selección' : 'todo';
  $('#save-cut').disabled = !s;
  $('#play').classList.toggle('on', !!st.play);
  $('#loop').classList.toggle('on', st.loop);
  document.querySelector('[data-op=undo]').disabled = !st.undo.length;
  document.querySelector('[data-op=redo]').disabled = !st.redo.length;
}

function drawAll() {
  if (!st.ch) return;
  drawWave();
  drawRuler();
  drawOverview();
  renderReadout();
}

new ResizeObserver(() => drawAll()).observe(wave);

/* ---------- vista (zoom y desplazamiento) ---------- */
function setView(s, e) {
  const n = frames();
  const minSpan = Math.min(n, Math.max(32, wave.clientWidth / 16));
  let span = Math.max(minSpan, Math.min(n, e - s));
  s = Math.max(0, Math.min(n - span, s));
  st.view = { s, e: s + span };
  drawAll();
}
function zoomAt(frame, factor) {
  const { s, e } = st.view;
  const ns = frame - (frame - s) * factor;
  const ne = frame + (e - frame) * factor;
  setView(ns, ne);
}

wave.addEventListener('wheel', (e) => {
  if (!st.ch) return;
  e.preventDefault();
  const span = st.view.e - st.view.s;
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    const d = (e.shiftKey ? e.deltaY : e.deltaX) || e.deltaY;
    setView(st.view.s + (d / wave.clientWidth) * span, st.view.e + (d / wave.clientWidth) * span);
  } else {
    zoomAt(xToFrame(e.clientX), Math.exp(e.deltaY * 0.0018));
  }
}, { passive: false });

/* ---------- selección con el mouse ---------- */
let drag = null;
const EDGE = 7;

function edgeAt(clientX) {
  if (!st.sel) return null;
  const r = wave.getBoundingClientRect();
  const xa = r.left + (frameToX(st.sel.a, r.width));
  const xb = r.left + (frameToX(st.sel.b, r.width));
  if (Math.abs(clientX - xa) <= EDGE) return 'a';
  if (Math.abs(clientX - xb) <= EDGE) return 'b';
  return null;
}

function snap(f) {
  return $('#zc').checked ? dsp.nearestZeroCrossing(st.ch, f, Math.round(st.sr * 0.01)) : Math.round(f);
}

wave.addEventListener('pointerdown', (e) => {
  if (!st.ch || e.button !== 0) return;
  wave.setPointerCapture(e.pointerId);
  const f = xToFrame(e.clientX);
  const edge = edgeAt(e.clientX);
  if (edge) {
    drag = { mode: 'edge', anchor: edge === 'a' ? st.sel.b : st.sel.a, x0: e.clientX, moved: true };
  } else if (e.shiftKey && (st.sel || st.cursor)) {
    const ref = st.sel ? (Math.abs(f - st.sel.a) < Math.abs(f - st.sel.b) ? st.sel.b : st.sel.a) : st.cursor;
    drag = { mode: 'new', anchor: ref, x0: e.clientX, moved: true };
    st.sel = { a: Math.min(ref, f), b: Math.max(ref, f) };
  } else {
    drag = { mode: 'new', anchor: f, x0: e.clientX, moved: false };
  }
  drawAll();
});

wave.addEventListener('pointermove', (e) => {
  if (!st.ch) return;
  if (!drag) {
    wave.classList.toggle('edge', !!edgeAt(e.clientX));
    return;
  }
  if (Math.abs(e.clientX - drag.x0) > 3) drag.moved = true;
  if (!drag.moved) return;
  const f = xToFrame(e.clientX);
  st.sel = { a: Math.min(drag.anchor, f), b: Math.max(drag.anchor, f) };
  // si arrastrás fuera de la vista, se mueve sola
  const r = wave.getBoundingClientRect();
  const span = st.view.e - st.view.s;
  if (e.clientX > r.right) setView(st.view.s + span * 0.02, st.view.e + span * 0.02);
  else if (e.clientX < r.left) setView(st.view.s - span * 0.02, st.view.e - span * 0.02);
  else drawAll();
});

wave.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) {
    st.sel = null;
    st.cursor = Math.round(xToFrame(e.clientX));
    if (st.play) play();
  } else if (st.sel) {
    const a = snap(st.sel.a);
    const b = snap(st.sel.b);
    st.sel = b - a >= 2 ? { a: Math.min(a, b), b: Math.max(a, b) } : null;
    if (st.play) play();
  }
  drawAll();
});

ruler.addEventListener('pointerdown', (e) => {
  if (!st.ch) return;
  st.cursor = Math.round(xToFrame(e.clientX));
  st.sel = null;
  if (st.play) play();
  drawAll();
});

let ovDrag = false;
function ovMove(e) {
  const r = overview.getBoundingClientRect();
  const f = ((e.clientX - r.left) / r.width) * frames();
  const span = st.view.e - st.view.s;
  setView(f - span / 2, f + span / 2);
}
overview.addEventListener('pointerdown', (e) => { if (!st.ch) return; ovDrag = true; overview.setPointerCapture(e.pointerId); ovMove(e); });
overview.addEventListener('pointermove', (e) => { if (ovDrag) ovMove(e); });
overview.addEventListener('pointerup', () => { ovDrag = false; });

/* ---------- reproducción ---------- */
function getBuffer() {
  if (st.buffer) return st.buffer;
  const ctx = audio();
  const b = ctx.createBuffer(st.ch.length, frames(), st.sr);
  st.ch.forEach((c, i) => b.copyToChannel(c, i));
  st.buffer = b;
  return b;
}

function stop() {
  if (st.play) {
    const p = st.play;
    st.play = null;
    try { p.src.stop(); } catch {}
  }
  renderReadout();
}

function play() {
  if (!st.ch) return;
  const ctx = audio();
  if (ctx.state === 'suspended') ctx.resume();
  const pos = playPos();
  stop();
  const n = frames();
  let a;
  let b;
  if (st.sel) {
    a = st.sel.a;
    b = st.sel.b;
  } else {
    a = st.cursor >= n - 1 ? 0 : st.cursor;
    b = n;
  }
  const loop = st.loop && !!st.sel;
  // si ya estaba sonando dentro de la selección, sigue desde ahí
  const from = pos != null && pos > a && pos < b && loop ? pos : a;
  const src = ctx.createBufferSource();
  src.buffer = getBuffer();
  src.connect(ctx.destination);
  if (loop) {
    src.loop = true;
    src.loopStart = a / st.sr;
    src.loopEnd = b / st.sr;
    src.start(0, from / st.sr);
  } else {
    src.start(0, from / st.sr, (b - from) / st.sr);
  }
  st.play = { src, t0: ctx.currentTime - (from - a) / st.sr, a, b, loop };
  src.onended = () => {
    if (st.play?.src === src) {
      st.play = null;
      drawAll();
    }
  };
  requestAnimationFrame(tick);
  renderReadout();
}

function tick() {
  if (!st.play) return;
  const pp = playPos();
  // seguir al cabezal si se va de la vista
  if (pp != null && (pp > st.view.e || pp < st.view.s) && !drag) {
    const span = st.view.e - st.view.s;
    setView(pp - span * 0.1, pp + span * 0.9);
  } else {
    drawWave();
    drawOverview();
    renderReadout();
  }
  requestAnimationFrame(tick);
}

$('#play').addEventListener('click', () => (st.play ? stop() : play()));
$('#loop').addEventListener('click', toggleLoop);
function toggleLoop() {
  st.loop = !st.loop;
  store.set('sa:loop', st.loop);
  if (st.play && st.sel) play();
  renderReadout();
}

/* ---------- edición ---------- */
let saveT = 0;
function scheduleSave() {
  $('#saved').textContent = 'guardando…';
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    const m = st.meta;
    await saveRecording({ id: m.id, title: $('#title').value.trim() || m.title, url: m.url, createdAt: m.createdAt, parent: m.parent, sampleRate: st.sr, channels: st.ch });
    $('#saved').textContent = 'guardado ✓';
    refreshList();
  }, 700);
}

function apply(fn, { needSel = false, label } = {}) {
  if (!st.ch) return;
  if (needSel && !st.sel) {
    toast('Primero seleccioná una parte arrastrando sobre la onda.');
    return;
  }
  stop();
  st.undo.push({ ch: st.ch, sel: st.sel, cursor: st.cursor, view: st.view });
  if (st.undo.length > 40) st.undo.shift();
  st.redo = [];
  const res = fn();
  st.ch = res.ch;
  st.sel = res.sel === undefined ? st.sel : res.sel;
  if (res.cursor != null) st.cursor = res.cursor;
  afterEdit(res.fullView);
  if (label) toast(label);
}

function afterEdit(fullView) {
  st.buffer = null;
  buildMip();
  const n = frames();
  if (st.sel) st.sel = { a: Math.min(st.sel.a, n), b: Math.min(st.sel.b, n) };
  st.cursor = Math.min(st.cursor, n);
  if (fullView || st.view.e > n) st.view = { s: 0, e: n };
  renderInfo();
  drawAll();
  scheduleSave();
}

function stepHistory(from, to) {
  if (!from.length) return;
  stop();
  to.push({ ch: st.ch, sel: st.sel, cursor: st.cursor, view: st.view });
  const prev = from.pop();
  st.ch = prev.ch;
  st.sel = prev.sel;
  st.cursor = prev.cursor;
  st.view = prev.view;
  afterEdit(false);
}

const range = () => (st.sel ? [st.sel.a, st.sel.b] : [0, frames()]);

const OPS = {
  all: () => { st.sel = { a: 0, b: frames() }; drawAll(); },
  crop: () => apply(() => ({ ch: dsp.crop(st.ch, st.sel.a, st.sel.b), sel: null, cursor: 0, fullView: true }), { needSel: true, label: 'Recortado' }),
  delete: () => apply(() => ({ ch: dsp.remove(st.ch, st.sel.a, st.sel.b), sel: null, cursor: st.sel.a }), { needSel: true }),
  normalize: () => apply(() => ({ ch: dsp.normalize(st.ch, ...range()) }), { label: st.sel ? 'Selección normalizada' : 'Normalizado' }),
  fadein: () => apply(() => ({ ch: dsp.fade(st.ch, st.sel.a, st.sel.b, 'in') }), { needSel: true }),
  fadeout: () => apply(() => ({ ch: dsp.fade(st.ch, st.sel.a, st.sel.b, 'out') }), { needSel: true }),
  reverse: () => apply(() => ({ ch: dsp.reverse(st.ch, ...range()) }), { label: 'Invertido' }),
  undo: () => stepHistory(st.undo, st.redo),
  redo: () => stepHistory(st.redo, st.undo),
};

document.querySelector('.tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-op]');
  if (b) OPS[b.dataset.op]();
});

/* ---------- nombre ---------- */
let renameT = 0;
$('#title').addEventListener('input', () => {
  clearTimeout(renameT);
  renameT = setTimeout(async () => {
    const t = $('#title').value.trim();
    if (!t || !st.meta) return;
    st.meta.title = t;
    await renameRecording(st.meta.id, t);
    refreshList();
  }, 500);
});
$('#title').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });

/* ---------- exportar ---------- */
function wavBlob() {
  const [a, b] = range();
  const ch = dsp.crop(st.ch, a, b);
  return new Blob([encodeWav(ch, st.sr, +$('#bits').value)], { type: 'audio/wav' });
}
const fileName = () => `${slug($('#title').value)}${st.sel ? '-recorte' : ''}.wav`;

$('#download').addEventListener('click', () => {
  if (!st.ch) return;
  const url = URL.createObjectURL(wavBlob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
});

$('#drag').addEventListener('dragstart', (e) => {
  if (!st.ch) return e.preventDefault();
  const url = URL.createObjectURL(wavBlob());
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('DownloadURL', `audio/wav:${fileName()}:${url}`);
  setTimeout(() => URL.revokeObjectURL(url), 120000);
});

$('#save-cut').addEventListener('click', async () => {
  if (!st.sel) return;
  const meta = await saveRecording({
    title: `${$('#title').value.trim() || 'sample'} · recorte`,
    url: st.meta.url,
    parent: st.meta.id,
    sampleRate: st.sr,
    channels: dsp.crop(st.ch, st.sel.a, st.sel.b),
  });
  await refreshList();
  toast('Recorte guardado en la biblioteca');
  return meta;
});

$('#bpm').value = store.get('sa:bpm', 120);
$('#bpm').addEventListener('input', () => { store.set('sa:bpm', +$('#bpm').value); renderReadout(); });

/* ---------- importar archivos ---------- */
async function importFile(file) {
  try {
    const data = await file.arrayBuffer();
    const buf = await audio().decodeAudioData(data);
    const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice());
    const meta = await saveRecording({ title: file.name.replace(/\.[^.]+$/, ''), sampleRate: buf.sampleRate, channels });
    await refreshList();
    location.hash = meta.id;
    toast(`Abrí «${file.name}»`);
  } catch {
    toast('No pude abrir ese archivo de audio.');
  }
}
$('#import').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) importFile(f);
  e.target.value = '';
});
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  dragDepth++;
  $('#drop').hidden = false;
});
window.addEventListener('dragleave', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; }
});
window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  dragDepth = 0;
  $('#drop').hidden = true;
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aac|webm|opus|aif+)$/i.test(x.name));
  if (f) importFile(f);
});

/* ---------- teclado ---------- */
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || !st.ch) return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (k === ' ') { e.preventDefault(); st.play ? stop() : play(); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? OPS.redo() : OPS.undo(); }
  else if (mod && k === 'y') { e.preventDefault(); OPS.redo(); }
  else if (mod && k === 'a') { e.preventDefault(); OPS.all(); }
  else if (mod) return;
  else if (k === 'l') toggleLoop();
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); OPS.delete(); }
  else if (k === 'c') OPS.crop();
  else if (k === 'n') OPS.normalize();
  else if (k === 'r') OPS.reverse();
  else if (k === 'escape') { st.sel = null; drawAll(); }
  else if (k === 'z' && st.sel) { const pad = (st.sel.b - st.sel.a) * 0.05; setView(st.sel.a - pad, st.sel.b + pad); }
  else if (k === '0') setView(0, frames());
  else if (k === '+' || k === '=') zoomAt((st.view.s + st.view.e) / 2, 0.6);
  else if (k === '-') zoomAt((st.view.s + st.view.e) / 2, 1 / 0.6);
  else if (k === 'home') { st.cursor = 0; st.sel = null; setView(0, st.view.e - st.view.s); }
});

/* ---------- inicio ---------- */
window.addEventListener('hashchange', () => open(location.hash.slice(1)));
await refreshList();
if (location.hash.length > 1) await open(location.hash.slice(1));
else openFirst();

// para las pruebas automáticas
window.__samplea = { st, open, refreshList, OPS, play, stop };
