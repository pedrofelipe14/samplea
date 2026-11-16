// Service worker: pide el permiso de captura de la pestaña y maneja el documento
// offscreen que graba. El estado real vive en el offscreen (el service worker
// puede dormirse en cualquier momento).

const OFFSCREEN = 'src/offscreen.html';

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return ctx.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: ['USER_MEDIA'],
    justification: 'Grabar el audio de la pestaña que eligió el usuario.',
  });
}

const toOffscreen = (msg) => chrome.runtime.sendMessage({ ...msg, target: 'offscreen' });

async function setBadge(on) {
  await chrome.action.setBadgeText({ text: on ? 'REC' : '' });
  if (on) await chrome.action.setBadgeBackgroundColor({ color: '#e5322d' });
}

function openEditor(id) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`src/editor.html${id ? `#${id}` : ''}`) });
}

async function handle(msg) {
  switch (msg.type) {
    case 'status': {
      if (!(await hasOffscreen())) return { recording: false };
      return (await toOffscreen({ type: 'status' })) ?? { recording: false };
    }
    case 'start': {
      const tab = msg.tab;
      if (await hasOffscreen()) {
        const st = await toOffscreen({ type: 'status' });
        if (st?.recording) throw new Error('Ya hay una grabación en curso.');
      }
      let streamId;
      try {
        streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      } catch (e) {
        throw new Error(/chrome:|edge:|Chrome pages|cannot be captured/i.test(e.message)
          ? 'Esta pestaña no se puede grabar (las páginas internas del navegador están protegidas).'
          : e.message);
      }
      await ensureOffscreen();
      const res = await toOffscreen({ type: 'start', streamId, title: tab.title, url: tab.url, tabId: tab.id });
      if (res?.error) throw new Error(res.error);
      await setBadge(true);
      return res;
    }
    case 'stop': {
      if (!(await hasOffscreen())) return { recording: false };
      const res = await toOffscreen({ type: 'stop' });
      await finish(res);
      return res;
    }
    case 'finished': // el offscreen terminó solo (se cerró la pestaña o llegó al límite)
      await finish(msg);
      return { ok: true };
    case 'open-editor':
      await openEditor(msg.id);
      return { ok: true };
    default:
      return null;
  }
}

async function finish(res) {
  await setBadge(false);
  if (await hasOffscreen()) await chrome.offscreen.closeDocument();
  if (res?.id) await openEditor(res.id);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'bg') return false;
  handle(msg).then(sendResponse, (e) => sendResponse({ error: e.message }));
  return true;
});

// si el navegador se reinicia con el badge puesto, lo limpiamos
chrome.runtime.onStartup.addListener(() => setBadge(false));
