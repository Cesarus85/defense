import * as THREE from 'three';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  ensure() {
    if (this.ctx || !this.enabled) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // kurzer „Tech“-Schuss (Noise + Click)
  playShot() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(420, t);
    gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.035);
    // Noise burst
    const buffer = this.ctx.createBuffer(1, 2205, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(0.08, t); g2.gain.linearRampToValueAtTime(0.0, t + 0.05);
    src.connect(g2).connect(this.ctx.destination); src.start(t);
  }
  playOverheat() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, t);
    gain.gain.setValueAtTime(0.0, t); gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.26);
  }
  playVent() {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, 4096, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.linearRampToValueAtTime(0.0, t + 0.3);
    src.connect(g).connect(this.ctx.destination); src.start(t);
  }
}
