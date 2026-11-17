// Synthesised sound for Solmar Bay: no audio files, everything is generated
// with the Web Audio API. Engine hum, sirens, gunshots, pickups and a small
// bass-driven music loop. All of it stays silent until the first user gesture.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = null;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startMusic();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speedRatio 0..1 (0 = parked / on foot), called every frame.
  setEngine(speedRatio, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.02 + speedRatio * 0.06 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speedRatio * 140, t, 0.08);
  }

  blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol = 0.3, lowpass = 1200) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shoot() { this.noiseBurst(0.12, 0.35, 2500); this.blip(180, 0.08, 'square', 0.12); }
  punch() { this.noiseBurst(0.08, 0.2, 700); }
  hit() { this.blip(120, 0.15, 'triangle', 0.25); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); this.blip(990, 0.14, 'sine', 0.22, 0.08); }
  crash() { this.noiseBurst(0.3, 0.4, 500); this.blip(70, 0.25, 'sine', 0.3); }
  door() { this.blip(220, 0.06, 'square', 0.15); this.noiseBurst(0.05, 0.12, 900); }
  busted() { this.blip(392, 0.2, 'sawtooth', 0.2); this.blip(311, 0.3, 'sawtooth', 0.2, 0.18); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.22, 'triangle', 0.22, i * 0.11));
  }
  missionFail() {
    [392, 330, 262].forEach((f, i) => this.blip(f, 0.25, 'triangle', 0.2, i * 0.13));
  }
  horn() { this.blip(370, 0.18, 'square', 0.12); this.blip(466, 0.18, 'square', 0.1); }

  setSiren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (on && this.ctx && !this.sirenTimer) {
      let high = true;
      this.sirenTimer = setInterval(() => {
        if (!this.ctx || this.muted) return;
        this.blip(high ? 880 : 659, 0.32, 'sine', 0.05);
        high = !high;
      }, 340);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
  }

  // A slow sun-soaked bass loop: root notes of a i–VI–III–VII walk in A minor.
  startMusic() {
    const roots = [55, 43.65, 65.41, 49];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const root = roots[this.musicStep % roots.length];
      this.musicStep++;
      this.blip(root, 0.5, 'triangle', 0.07);
      this.blip(root * 2, 0.3, 'sine', 0.04, 0.12);
      if (this.musicStep % 2 === 0) this.blip(root * 3, 0.18, 'sine', 0.025, 0.25);
    }, 480);
  }
}
