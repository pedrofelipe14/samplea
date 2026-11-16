// Biblioteca de grabaciones en IndexedDB (la comparten el documento que graba y el editor).
// 'meta' guarda los datos chicos (para listar rápido) y 'audio' los canales.
import { thumbnail } from './dsp.js';

const DB = 'samplea';
let dbp = null;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('meta', { keyPath: 'id' });
      r.result.createObjectStore('audio', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = fn(t);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('IndexedDB: transacción abortada'));
  }));
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Guarda una grabación. rec: { id?, title, url?, sampleRate, channels } */
export async function saveRecording(rec) {
  const id = rec.id ?? newId();
  const meta = {
    id,
    title: rec.title || 'Sin título',
    url: rec.url ?? '',
    createdAt: rec.createdAt ?? Date.now(),
    sampleRate: rec.sampleRate,
    frames: rec.channels[0].length,
    nch: rec.channels.length,
    thumb: thumbnail(rec.channels),
    parent: rec.parent ?? null,
  };
  await tx(['meta', 'audio'], 'readwrite', (t) => {
    t.objectStore('meta').put(meta);
    t.objectStore('audio').put({ id, channels: rec.channels });
  });
  return meta;
}

export async function listRecordings() {
  const all = await tx(['meta'], 'readonly', (t) => t.objectStore('meta').getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecording(id) {
  const [meta, audio] = await Promise.all([
    tx(['meta'], 'readonly', (t) => t.objectStore('meta').get(id)),
    tx(['audio'], 'readonly', (t) => t.objectStore('audio').get(id)),
  ]);
  if (!meta || !audio) return null;
  return { ...meta, channels: audio.channels };
}

export async function renameRecording(id, title) {
  const meta = await tx(['meta'], 'readonly', (t) => t.objectStore('meta').get(id));
  if (!meta) return;
  meta.title = title;
  await tx(['meta'], 'readwrite', (t) => t.objectStore('meta').put(meta));
}

export async function deleteRecording(id) {
  await tx(['meta', 'audio'], 'readwrite', (t) => {
    t.objectStore('meta').delete(id);
    t.objectStore('audio').delete(id);
  });
}
