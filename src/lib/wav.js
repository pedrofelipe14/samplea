// Codifica audio (un Float32Array por canal) como WAV.
// bits: 16 o 24 (PCM entero) o 32 (float IEEE).

export function encodeWav(channels, sampleRate, bits = 16) {
  const nch = channels.length;
  const len = channels[0]?.length ?? 0;
  const bytes = bits / 8;
  const isFloat = bits === 32;
  const dataSize = len * nch * bytes;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, isFloat ? 3 : 1, true); // 1 = PCM, 3 = float
  v.setUint16(22, nch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nch * bytes, true);
  v.setUint16(32, nch * bytes, true);
  v.setUint16(34, bits, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]));
      if (isFloat) {
        v.setFloat32(o, x, true);
      } else if (bits === 16) {
        v.setInt16(o, x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff), true);
      } else {
        const s = x < 0 ? Math.round(x * 0x800000) : Math.round(x * 0x7fffff);
        v.setUint8(o, s & 0xff);
        v.setUint8(o + 1, (s >> 8) & 0xff);
        v.setUint8(o + 2, (s >> 16) & 0xff);
      }
      o += bytes;
    }
  }
  return buf;
}

/** Lee un WAV PCM 16/24 o float 32 (para los tests y para importar). */
export function decodeWav(buf) {
  const v = new DataView(buf);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('No es un WAV');
  let o = 12;
  let fmt = null;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = { format: v.getUint16(o + 8, true), nch: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    } else if (id === 'data') {
      const bytes = fmt.bits / 8;
      const len = Math.floor(size / (bytes * fmt.nch));
      const channels = Array.from({ length: fmt.nch }, () => new Float32Array(len));
      let p = o + 8;
      for (let i = 0; i < len; i++) {
        for (let c = 0; c < fmt.nch; c++) {
          let x;
          if (fmt.format === 3) x = v.getFloat32(p, true);
          else if (fmt.bits === 16) x = v.getInt16(p, true) / 0x8000;
          else {
            let s = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16);
            if (s & 0x800000) s -= 0x1000000;
            x = s / 0x800000;
          }
          channels[c][i] = x;
          p += bytes;
        }
      }
      return { sampleRate: fmt.sampleRate, channels, bits: fmt.bits };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('WAV sin datos');
}
