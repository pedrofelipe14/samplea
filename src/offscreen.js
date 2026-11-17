// Documento invisible que graba la pestaña.
import { Recorder } from './lib/recorder.js';
import { saveRecording } from './lib/db.js';
import { trimSilence } from './lib/dsp.js';

let rec = null;
let meta = null;
let startedAt = 0;
let finishing = null;

async function start({ streamId, title, url, tabId }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: false,
    });
  } catch (e) {
    throw new Error(`No pude acceder al audio de la pestaña (${e.message}). Probá recargarla y volver a intentar.`);
  }
  rec = new Recorder({ maxSeconds: 600 });
  rec.onLimit = () => finishAndNotify();
  stream.getAudioTracks()[0].addEventListener('ended', () => finishAndNotify());
  await rec.start(stream);
  meta = { title, url, tabId };
  startedAt = Date.now();
  return status();
}

function status() {
  return {
    recording: !!rec?.recording,
    seconds: rec?.seconds ?? 0,
    peak: rec?.takePeak() ?? 0,
    title: meta?.title ?? '',
    tabId: meta?.tabId ?? null,
    startedAt,
  };
}

async function stop() {
  if (!rec) return { recording: false };
  finishing ??= (async () => {
    const out = await rec.stop();
    rec = null;
    // el silencio del principio y del final no sirve para nada
    const channels = trimSilence(out.channels);
    if (!channels[0].length) return { recording: false, empty: true };
    const saved = await saveRecording({ title: meta?.title, url: meta?.url, sampleRate: out.sampleRate, channels });
    return { recording: false, id: saved.id, seconds: saved.frames / saved.sampleRate };
  })();
  return finishing;
}

async function discard() {
  if (rec) {
    await rec.stop();
    rec = null;
  }
  return { recording: false, discarded: true };
}

async function finishAndNotify() {
  const res = await stop();
  chrome.runtime.sendMessage({ target: 'bg', type: 'finished', ...res });
}

chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg?.target !== 'offscreen') return false;
  const run = { start: () => start(msg), stop, discard, status: async () => status() }[msg.type];
  if (!run) return false;
  run().then(send, (e) => send({ error: e.message }));
  return true;
});
