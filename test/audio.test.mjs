import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, decodeWav } from '../src/lib/wav.js';
import * as dsp from '../src/lib/dsp.js';

const sine = (n, f = 440, sr = 48000, a = 0.5) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));

test('wav: encabezado y tamaño correctos', () => {
  const ch = [sine(1000), sine(1000, 220)];
  for (const bits of [16, 24, 32]) {
    const buf = encodeWav(ch, 48000, bits);
    assert.equal(buf.byteLength, 44 + 1000 * 2 * (bits / 8));
    const v = new DataView(buf);
    assert.equal(v.getUint16(20, true), bits === 32 ? 3 : 1);
    assert.equal(v.getUint16(22, true), 2);
    assert.equal(v.getUint32(24, true), 48000);
    assert.equal(v.getUint16(34, true), bits);
  }
});

test('wav: ida y vuelta conserva el audio', () => {
  const ch = [sine(4800), sine(4800, 330, 48000, -0.9)];
  for (const [bits, tol] of [[16, 1 / 16000], [24, 1 / 4000000], [32, 1e-7]]) {
    const back = decodeWav(encodeWav(ch, 44100, bits));
    assert.equal(back.sampleRate, 44100);
    assert.equal(back.channels.length, 2);
    for (let c = 0; c < 2; c++) for (let i = 0; i < 4800; i += 37) assert.ok(Math.abs(back.channels[c][i] - ch[c][i]) <= tol, `${bits} bits, c${c} i${i}`);
  }
});

test('wav: los extremos no desbordan', () => {
  const back = decodeWav(encodeWav([Float32Array.from([1, -1, 1.5, -1.5, 0])], 48000, 24));
  assert.deepEqual([...back.channels[0]].map((x) => Math.round(x * 1000) / 1000), [1, -1, 1, -1, 0]);
  const b16 = decodeWav(encodeWav([Float32Array.from([1, -1])], 48000, 16));
  assert.ok(b16.channels[0][0] > 0.999 && b16.channels[0][1] === -1);
});

test('dsp: recortar, borrar, invertir', () => {
  const ch = [Float32Array.from([0, 1, 2, 3, 4, 5]), Float32Array.from([5, 4, 3, 2, 1, 0])];
  assert.deepEqual([...dsp.crop(ch, 1, 4)[0]], [1, 2, 3]);
  assert.deepEqual([...dsp.crop(ch, 4, 1)[1]], [4, 3, 2]); // al revés también
  assert.deepEqual([...dsp.remove(ch, 1, 4)[0]], [0, 4, 5]);
  assert.deepEqual([...dsp.reverse(ch, 0, 3)[0]], [2, 1, 0, 3, 4, 5]);
  assert.deepEqual([...ch[0]], [0, 1, 2, 3, 4, 5], 'no modifica la entrada');
});

test('dsp: normalizar lleva el pico al objetivo solo en el rango', () => {
  const ch = [Float32Array.from([0.1, -0.25, 0.2, 0.05])];
  const n = dsp.normalize(ch, 0, 3, 1);
  assert.ok(Math.abs(dsp.peak(n, 0, 3) - 1) < 1e-6);
  assert.equal(n[0][3], ch[0][3]);
  assert.deepEqual([...dsp.normalize([new Float32Array(4)])[0]], [0, 0, 0, 0]);
});

test('dsp: fades empiezan/terminan en silencio', () => {
  const ch = [new Float32Array(100).fill(1)];
  const fi = dsp.fade(ch, 0, 100, 'in')[0];
  const fo = dsp.fade(ch, 0, 100, 'out')[0];
  assert.equal(fi[0], 0);
  assert.ok(fi[99] > 0.99);
  assert.ok(fo[0] > 0.99 && fo[99] < 0.05);
  for (let i = 1; i < 100; i++) assert.ok(fi[i] >= fi[i - 1]);
});

test('dsp: cruce por cero y silencio', () => {
  const s = sine(48000, 100); // cruza por cero cada 240 muestras
  const z = dsp.nearestZeroCrossing([s], 250);
  assert.equal(z % 240 <= 1 || z % 240 >= 239, true, `z=${z}`);
  const padded = new Float32Array(1000);
  padded.set(sine(500), 250);
  const t = dsp.trimSilence([padded, padded]);
  assert.ok(t[0].length <= 500 && t[0].length > 480);
  assert.equal(dsp.trimSilence([new Float32Array(50)])[0].length, 0);
  const th = dsp.thumbnail([sine(1200)], 12);
  assert.equal(th.length, 12);
  assert.ok(th.every((v) => v > 0.4 && v <= 0.5));
});

test('dsp: mono, remuestreo y largo musical', () => {
  const m = dsp.mixdown([Float32Array.from([1, 0]), Float32Array.from([0, 1])]);
  assert.equal(m.length, 1);
  assert.deepEqual([...m[0]], [0.5, 0.5]);

  // un seno de 1 kHz a 48 kHz pasado a 44,1 kHz sigue siendo un seno de 1 kHz
  const src = sine(48000, 1000, 48000, 0.8);
  const [out] = dsp.resample([src], 48000, 44100);
  assert.equal(out.length, 44100);
  let err = 0;
  for (let i = 1000; i < 43000; i += 7) err = Math.max(err, Math.abs(out[i] - 0.8 * Math.sin((2 * Math.PI * 1000 * i) / 44100)));
  assert.ok(err < 0.002, `error ${err}`);
  // un tono por encima del nuevo Nyquist (23 kHz) se filtra al bajar a 44,1 kHz
  const [alias] = dsp.resample([sine(48000, 23000, 48000, 0.8)], 48000, 44100);
  let pk = 0;
  for (let i = 1000; i < 43000; i++) pk = Math.max(pk, Math.abs(alias[i]));
  assert.ok(pk < 0.1, `alias ${pk}`);

  assert.equal(dsp.musicalBeats(3.9), 4);
  assert.equal(dsp.musicalBeats(7.6), 8);
  assert.equal(dsp.musicalBeats(0.9), 1);
  assert.equal(dsp.musicalBeats(1.6), 2);
  assert.equal(dsp.musicalBeats(0.3), 0.25);
  assert.ok(Math.abs(dsp.peakDb([Float32Array.from([0.5])]) + 6.02) < 0.01);
});
