const $ = (s) => document.querySelector(s);
const bg = (msg) => chrome.runtime.sendMessage({ ...msg, target: 'bg' });

let tab = null;
let recording = false;
let busy = false;
let level = 0;

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
    const st = await bg({ type: 'status' });
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

$('#library').addEventListener('click', async () => {
  await bg({ type: 'open-editor' });
  window.close();
});

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); $('#rec').click(); }
});

[tab] = await chrome.tabs.query({ active: true, currentWindow: true });
render({});
poll();
