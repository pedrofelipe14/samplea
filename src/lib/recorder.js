// Graba un MediaStream de audio a PCM float sin pérdida.
// También lo manda a los parlantes, porque capturar una pestaña la silencia.

export class Recorder {
  constructor({ maxSeconds = 600, monitor = true } = {}) {
    this.maxSeconds = maxSeconds;
    this.monitor = monitor;
    this.chunksL = [];
    this.chunksR = [];
    this.frames = 0;
    this.peak = 0;
    this.recording = false;
    this.onLimit = null;
  }

  get seconds() {
    return this.ctx ? this.frames / this.ctx.sampleRate : 0;
  }

  async start(stream) {
    this.stream = stream;
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
    this.src = this.ctx.createMediaStreamSource(stream);
    if (this.monitor) this.src.connect(this.ctx.destination);
    this.node = new AudioWorkletNode(this.ctx, 'samplea-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    // la salida del worklet va a un volumen 0: así el navegador lo sigue procesando sin que suene doble
    this.mute = this.ctx.createGain();
    this.mute.gain.value = 0;
    this.src.connect(this.node).connect(this.mute).connect(this.ctx.destination);
    this.node.port.onmessage = (e) => {
      if (!e.data.l || !this.recording) return;
      this.chunksL.push(e.data.l);
      this.chunksR.push(e.data.r);
      this.frames += e.data.l.length;
      this.peak = Math.max(this.peak, e.data.peak);
      if (this.seconds >= this.maxSeconds) this.onLimit?.();
    };
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.recording = true;
  }

  /** Pico desde la última consulta (para el medidor). */
  takePeak() {
    const p = this.peak;
    this.peak = 0;
    return p;
  }

  /** Para y devuelve { sampleRate, channels: [L, R] }. */
  async stop() {
    if (!this.ctx) return null;
    // vaciar lo que quedó en el worklet
    await new Promise((resolve) => {
      const prev = this.node.port.onmessage;
      const t = setTimeout(resolve, 500);
      this.node.port.onmessage = (e) => {
        if (e.data.done) { clearTimeout(t); resolve(); return; }
        prev(e);
      };
      this.node.port.postMessage('flush');
    });
    this.recording = false;
    this.node.port.postMessage('stop');
    this.stream.getTracks().forEach((t) => t.stop());
    const sampleRate = this.ctx.sampleRate;
    await this.ctx.close();
    this.ctx = null;
    const join = (chunks) => {
      const out = new Float32Array(this.frames);
      let o = 0;
      for (const c of chunks) { out.set(c, o); o += c.length; }
      return out;
    };
    const channels = [join(this.chunksL), join(this.chunksR)];
    this.chunksL = [];
    this.chunksR = [];
    return { sampleRate, channels };
  }
}
