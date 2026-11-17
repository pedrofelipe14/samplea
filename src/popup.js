import { listRecordings } from './lib/db.js';

const $ = (s) => document.querySelector(s);
const bg = (msg) => chrome.runtime.sendMessage({ ...msg, target: 'bg' });

let tab = null;
let recording = false;
let busy = false;
let level = 0;
let demo = null; // estado fijo para capturas de pantalla

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
};

function render(st = {}) {
  recording = !!st.recording;
  document.body.classList.toggle('recording', recording);
  $('#rec').setAttribute('aria-label', recording ? 'Parar' : 'Grabar');
  const other = recording && st.tabId && tab && st.tabId !== tab.id;
  $('#label').textContent = recording ? (other ? 'grabando otra pestaña · parar' : 'parar y editar') : 'grabar esta pestaña';
  $('#tab').textContent = recording ? st.title : (tab?.title ?? '');
  $('#time').textContent = fmt(st.seconds ?? 0);
  $('#discard').hidden = !recording;
  $('#recent').hidden = recording || !$('#recent-list').children.length;
  level = Math.max(level * 0.82, st.peak ?? 0);
  const db = level > 0 ? 20 * Math.log10(level) : -60;
  $('#meter-fill').style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
  $('#meter-fill').classList.toggle('hot', level > 0.98);
}

function showError(e) {
  $('#msg').textContent = e;
  $('#msg').classList.add('error');
}

async function poll() {
  try {
    const st = demo ?? (await bg({ type: 'status' }));
    if (!busy) render(st ?? {});
  } catch {}
  setTimeout(poll, recording ? 80 : 400);
}

$('#rec').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  $('#msg').textContent = '';
  $('#msg').classList.remove('error');
  try {
    if (!recording) {
      const res = await bg({ type: 'start', tab });
      if (res?.error) showError(res.error);
      else render(res);
    } else {
      $('#label').textContent = 'guardando…';
      const res = await bg({ type: 'stop' });
      if (res?.error) showError(res.error);
      else if (res?.empty) showError('No se grabó sonido: ¿estaba sonando algo en la pestaña?');
      else window.close(); // el editor se abre solo
      render({ recording: false });
    }
  } catch (e) {
    showError(e.message);
  }
  busy = false;
});

$('#discard').addEventListener('click', async () => {
  busy = true;
  await bg({ type: 'discard' });
  busy = false;
  render({ recording: false });
  $('#msg').textContent = 'Grabación descartada.';
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function renderRecent() {
  try {
    const items = (await listRecordings()).slice(0, 3);
    $('#recent-list').innerHTML = items.map((m) => `<li><button type="button" data-id="${m.id}"><span>${esc(m.title)}</span><b>${fmt(m.frames / m.sampleRate).replace(/\.\d$/, '')}</b></button></li>`).join('');
    $('#recent').hidden = recording || !items.length;
  } catch {}
}
$('#recent-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  await bg({ type: 'open-editor', id: b.dataset.id });
  window.close();
});

$('#library').addEventListener('click', async () => {
  await bg({ type: 'open-editor' });
  window.close();
});

document.addEventListener('keydown', (e) => {
  // Espacio/Enter graban, salvo que el foco esté en otro botón
  if ((e.key === ' ' || e.key === 'Enter') && (e.target === document.body || e.target === $('#rec'))) {
    e.preventDefault();
    $('#rec').click();
  }
});

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
render({});
renderRecent();
poll();
// para capturas y pruebas automáticas
window.__samplea = { demo: (st) => { demo = st; tab = { id: st.tabId, title: st.title }; render(st); } };
