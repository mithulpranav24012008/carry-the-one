// The machine's noises are real ones: a 1930s Brunsviga crank and a vintage adding machine's keys,
// cut into one sheet by sounds/build.py. Each plays on the frame its step starts. Only the bell is synthesised.
import { SHEET } from "./sound-map.js";

const MAX_RATE = 1.35; // faster than this and a recording stops sounding like the same machine

export class Sound {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.buffer = null;
    this.last = {};
    this.notch = 0;
    this.grabbed = null;
  }

  // Fetch and decode up front, so the first key press already has its sound.
  prepare() {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline || !window.fetch) return;
    fetch("./sounds/machine.wav")
      .then((r) => r.arrayBuffer())
      .then((data) => new Offline(1, 1, 44100).decodeAudioData(data))
      .then((buffer) => { this.buffer = buffer; })
      .catch((error) => console.warn("sounds unavailable", error));
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    this.out = this.ctx.createDynamicsCompressor();
    this.out.threshold.value = -14;
    this.out.ratio.value = 3;
    this.out.attack.value = 0.002;
    this.out.release.value = 0.09;
    const level = this.ctx.createGain();
    level.gain.value = 0.95;
    this.out.connect(level).connect(this.ctx.destination);
  }

  get ready() { return this.ctx && this.buffer && this.enabled; }

  // A different take each time, never the same one twice running: real machines don't repeat exactly.
  pick(name) {
    const takes = SHEET[name];
    let i = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && i === this.last[name]) i = (i + 1) % takes.length;
    this.last[name] = i;
    return takes[i];
  }

  play([offset, length], { gain = 1, rate = 1, skip = 0, stop = length, when = 0 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = rate * (0.985 + Math.random() * 0.03);
    const amp = this.ctx.createGain();
    const span = (stop - skip) / rate;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + 0.003);
    amp.gain.setValueAtTime(gain, t + Math.max(0.004, span - 0.012));
    amp.gain.linearRampToValueAtTime(0, t + span);
    src.connect(amp).connect(this.out);
    src.start(t, offset + skip, stop - skip);
  }

  key(down) { this.play(this.pick(down ? "keydown" : "keyup"), { gain: down ? 1 : 0.8 }); }
  home() { this.play(this.pick("home"), { gain: 0.9 }); }

  // Fit a recording to the time available: speed it up a little, then keep only the part around its strike.
  fit(name, dur, gain) {
    const take = this.pick(name);
    const [, length, strike] = take;
    if (dur * MAX_RATE >= length) { this.play(take, { gain, rate: Math.max(1, length / dur) }); return; }
    const span = dur * MAX_RATE;
    const skip = Math.max(0, Math.min(length - span, strike - span * 0.3));
    this.play(take, { gain, rate: MAX_RATE, skip, stop: skip + span });
  }

  // The hand sets the speed: the recording is walked in small grains as the crank goes round.
  crankDrag(phase) {
    if (!this.ready) return;
    const notch = Math.floor(phase * 30);
    if (notch === this.notch) return;
    const forward = notch > this.notch;
    this.notch = notch;
    if (!this.grabbed || phase < 0.04) this.grabbed = this.pick("crank");
    const length = this.grabbed[1];
    const at = Math.min(length - 0.08, phase * length);
    this.play(this.grabbed, { gain: forward ? 0.95 : 0.55, skip: Math.max(0, at), stop: at + 0.08 });
  }

  // The transformation: ratchets, keys and levers going off in waves, over a rising motor, ending on one heavy strike.
  transform(duration) {
    if (!this.ready) return;
    const names = ["keydown", "lever", "crank", "keyup", "shift", "home", "keydown", "keydown"];
    let t = 0.05;
    let i = 0;
    while (t < duration * 0.88) {
      const u = t / duration;
      const name = names[i++ % names.length];
      const take = this.pick(name);
      const span = name === "crank" ? 0.34 : take[1];
      const skip = name === "crank" ? Math.max(0, take[2] - 0.12) : 0;
      this.play(take, { when: t, gain: 0.5 + 0.45 * Math.sin(Math.PI * u), rate: 0.85 + 0.55 * u + Math.random() * 0.12, skip, stop: Math.min(take[1], skip + span) });
      // Clusters and gaps: mechanisms throw in bursts, not at a steady beat.
      t += i % 5 === 0 ? 0.16 + Math.random() * 0.1 : 0.035 + Math.random() * 0.05;
    }
    const start = this.ctx.currentTime;
    const motor = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const amp = this.ctx.createGain();
    motor.type = "sawtooth";
    motor.frequency.setValueAtTime(42, start);
    motor.frequency.exponentialRampToValueAtTime(150, start + duration * 0.86);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(220, start);
    filter.frequency.exponentialRampToValueAtTime(720, start + duration * 0.86);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(0.09, start + duration * 0.3);
    amp.gain.setValueAtTime(0.09, start + duration * 0.84);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.9);
    motor.connect(filter).connect(amp).connect(this.out);
    motor.start(start);
    motor.stop(start + duration * 0.91);
    // Each stage ends on a part locking home.
    for (const at of [0.2, 0.42, 0.54, 0.66, 0.72, 0.8]) this.play(this.pick("home"), { when: duration * at, gain: 0.85, rate: 0.8 + Math.random() * 0.1 });
    // The landing.
    const strike = duration * 0.9;
    this.play(this.pick("home"), { when: strike, gain: 1, rate: 0.72 });
    this.play(this.pick("shift"), { when: strike + 0.01, gain: 0.9, rate: 0.8 });
    const thud = this.ctx.createOscillator();
    const thudAmp = this.ctx.createGain();
    thud.frequency.setValueAtTime(95, start + strike);
    thud.frequency.exponentialRampToValueAtTime(38, start + strike + 0.22);
    thudAmp.gain.setValueAtTime(0.0001, start);
    thudAmp.gain.setValueAtTime(0.5, start + strike);
    thudAmp.gain.exponentialRampToValueAtTime(0.0008, start + strike + 0.3);
    thud.connect(thudAmp).connect(this.out);
    thud.start(start + strike);
    thud.stop(start + strike + 0.32);
  }

  bell() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    for (const [f, g, d] of [[1760, 0.22, 0.9], [4220, 0.08, 0.5], [6680, 0.03, 0.25]]) {
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.frequency.value = f;
      amp.gain.setValueAtTime(g, t);
      amp.gain.exponentialRampToValueAtTime(0.0008, t + d);
      osc.connect(amp).connect(this.out);
      osc.start(t);
      osc.stop(t + d);
    }
  }

  step(step, dur) {
    if (!this.ctx || !this.enabled) return;
    switch (step.type) {
      case "turn":
        // Hurried through by the next key press: too quick to be heard as separate turns.
        if (dur < 0.06) break;
        // A long run's turns come quick and sit back; a single turn gets its full weight and its drop home.
        this.fit("crank", dur, dur < 0.25 ? 0.7 : 1);
        if (dur >= 0.6) this.play(this.pick("home"), { gain: 0.85, when: dur * 0.96 });
        break;
      case "shift": this.fit("shift", Math.max(dur, 0.3), 0.85); break;
      case "set": if (step.why !== "key") this.play(this.pick("lever"), { gain: 0.4 }); break;
      case "clear": if (dur >= 0.06) this.fit("clear", dur, 0.9); break;
      case "complement": this.play(this.pick(step.why === "sign" ? "keyup" : "lever"), { gain: 0.55 }); break;
      case "bell": this.bell(); break;
      default:
    }
  }
}
