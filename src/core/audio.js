/**
 * Procedural Web Audio API casino sound synthesizer.
 * Zero external audio assets required; gracefully no-ops when muted or unavailable.
 */

class SoundEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  ensureContext() {
    if (!this.enabled || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
  }

  isEnabled() {
    return this.enabled;
  }

  tone(freq, duration = 0.12, type = 'sine', gainPeak = 0.12, delay = 0, endFreq = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(gainPeak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  chipClick() {
    this.tone(1950, 0.055, 'triangle', 0.08, 0, 1400);
    this.tone(2850, 0.04, 'sine', 0.05, 0.012, 2200);
  }

  throwWhoosh() {
    this.tone(240, 0.22, 'sine', 0.08, 0, 520);
    this.tone(180, 0.18, 'triangle', 0.05, 0.04, 110);
  }

  catchThud() {
    this.tone(155, 0.14, 'sine', 0.18, 0, 58);
    this.tone(320, 0.07, 'triangle', 0.07, 0, 120);
  }

  rimClink() {
    this.tone(860, 0.14, 'triangle', 0.11, 0, 620);
    this.tone(1340, 0.11, 'sine', 0.07, 0.02, 920);
  }

  cardFlick() {
    this.tone(420, 0.06, 'triangle', 0.07, 0, 210);
  }

  tileTap() {
    this.tone(520, 0.045, 'triangle', 0.06, 0, 380);
  }

  winChime() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this.tone(n, 0.26, 'triangle', 0.1, i * 0.075);
    });
  }

  loseTone() {
    this.tone(260, 0.18, 'sawtooth', 0.05, 0, 195);
    this.tone(195, 0.28, 'triangle', 0.07, 0.14, 130);
  }

  unoCall() {
    this.tone(660, 0.11, 'triangle', 0.11, 0);
    this.tone(990, 0.22, 'triangle', 0.12, 0.1);
  }
}

export const sound = new SoundEngine();
