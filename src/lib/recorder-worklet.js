// AudioWorklet: junta bloques de 128 muestras en bloques más grandes y los manda
// al hilo principal sin comprimir (calidad completa, sin pérdida).
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 8192;
    this.l = new Float32Array(this.size);
    this.r = new Float32Array(this.size);
    this.n = 0;
    this.peak = 0;
    this.on = true;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this.flush();
        this.port.postMessage({ done: true });
      } else if (e.data === 'stop') this.on = false;
    };
  }

  flush() {
    if (!this.n) return;
    const l = this.l.slice(0, this.n);
    const r = this.r.slice(0, this.n);
    this.port.postMessage({ l, r, peak: this.peak }, [l.buffer, r.buffer]);
    this.n = 0;
    this.peak = 0;
  }

  process(inputs) {
    if (!this.on) return false;
    const input = inputs[0];
    if (input && input.length) {
      const a = input[0];
      const b = input[1] ?? input[0];
      for (let i = 0; i < a.length; i++) {
        this.l[this.n] = a[i];
        this.r[this.n] = b[i];
        const p = Math.max(Math.abs(a[i]), Math.abs(b[i]));
        if (p > this.peak) this.peak = p;
        if (++this.n === this.size) this.flush();
      }
    }
    return true;
  }
}

registerProcessor('samplea-recorder', RecorderProcessor);
