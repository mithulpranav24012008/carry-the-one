// Turns the steps the model emits into a pose of the machine at any moment.
// Pure sampling: the site plays it with a clock, the film plays it with a frame number.
import { initialRegisters, SETTING, ACCUM, COUNTER } from "./model.js";

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const windowed = (phase, from, to) => smooth(clamp01((phase - from) / Math.max(1e-4, to - from)));

export function poseOf(r) {
  return {
    aw: [...r.aw], cw: [...r.cw], sw: [...r.sw], sd: [...r.s],
    pos: r.pos, crank: r.crank, aDec: r.aDec, sDec: r.sDec, cDec: r.cDec,
    readFrom: r.readFrom, flag: r.flag ? 1 : 0, bell: 0, clearA: 0, clearC: 0, clearS: 0, carry: new Array(ACCUM).fill(0),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerpInto = (out, from, to, t) => { for (let i = 0; i < out.length; i++) out[i] = lerp(from[i], to[i], t); };

export function samplePose(step, phase) {
  const pose = poseOf(step.before ?? step.after);
  const before = step.before ?? step.after;
  const after = step.after;
  if (step.type === "turn") {
    // Each stepped drum engages its pinion for as many teeth as the digit asks for.
    for (const d of step.drive) {
      const span = 0.06 + 0.56 * (Math.abs(d.by) / 9);
      pose.aw[d.wheel] += d.by * windowed(phase, 0.08, 0.08 + span);
    }
    step.carries.forEach((c, i) => {
      const start = 0.7 + (0.24 * i) / Math.max(1, step.carries.length);
      const e = windowed(phase, start, start + 0.09);
      pose.aw[c.wheel] += c.by * e;
      pose.carry[c.wheel] = Math.sin(Math.PI * clamp01((phase - start) / 0.09));
    });
    step.count.forEach((c, i) => {
      pose.cw[c.wheel] += c.by * windowed(phase, 0.3 + i * 0.03, 0.62 + i * 0.03);
    });
    pose.crank = before.crank + step.crankDir * phase;
    if (phase >= 1) pose.flag = after.flag ? 1 : 0;
  } else if (step.type === "shift") {
    pose.pos = lerp(before.pos, after.pos, smooth(phase));
  } else if (step.type === "set") {
    const e = smooth(phase);
    lerpInto(pose.sw, before.sw, after.sw, e);
    lerpInto(pose.sd, before.s, after.s, e);
    pose.sDec = lerp(before.sDec, after.sDec, e);
  } else if (step.type === "clear") {
    const e = smooth(phase);
    lerpInto(pose.aw, before.aw, after.aw, e);
    lerpInto(pose.cw, before.cw, after.cw, e);
    lerpInto(pose.sw, before.sw, after.sw, e);
    lerpInto(pose.sd, before.s, after.s, e);
    pose.flag = lerp(before.flag ? 1 : 0, after.flag ? 1 : 0, e);
    const pull = Math.sin(Math.PI * phase);
    if (step.which === "a") pose.clearA = pull;
    if (step.which === "c") pose.clearC = pull;
    if (step.which === "s") pose.clearS = pull;
  } else if (step.type === "complement") {
    lerpInto(pose.aw, before.aw, after.aw, smooth(phase));
    pose.flag = lerp(before.flag ? 1 : 0, after.flag ? 1 : 0, smooth(phase));
  } else if (step.type === "bell") {
    pose.bell = Math.sin(Math.PI * clamp01(phase * 2.2));
  } else if (step.type === "mark") {
    Object.assign(pose, { aDec: after.aDec, cDec: after.cDec, sDec: after.sDec, readFrom: after.readFrom, flag: after.flag ? 1 : 0 });
  }
  return pose;
}

// How long each step takes. A long division runs quick; a single turn is unhurried.
export function durations(steps) {
  const turns = steps.filter((s) => s.type === "turn").length;
  const turnTime = turns <= 2 ? 0.85 : Math.max(0.1, Math.min(0.5, 6.5 / turns));
  return steps.map((s) => {
    switch (s.type) {
      case "turn": return turnTime;
      case "shift": return Math.min(0.5, 0.11 + 0.05 * Math.abs(s.after.pos - s.before.pos));
      case "set": return s.why === "key" ? 0.13 : 0.3;
      case "clear": return 0.34;
      case "complement": return s.why === "sign" ? 0.12 : 0.42;
      case "bell": return s.why === "division" ? 0.07 : 0.22;
      default: return 0;
    }
  });
}

export class Player {
  constructor(registers = initialRegisters(), { onStep, onSettle } = {}) {
    this.pose = poseOf(registers);
    this.queue = [];
    this.time = 0;
    this.speed = 1;
    this.hurried = 0;
    this.onStep = onStep;
    this.onSettle = onSettle;
    this.started = false;
    this.manual = null;
  }

  get busy() { return this.queue.length > 0; }

  enqueue(steps) {
    if (!steps.length) return;
    const times = durations(steps);
    // A key pressed while the machine runs hurries what is left rather than waiting for it.
    if (this.queue.length) {
      this.speed = Math.max(this.speed, this.remaining() / 0.16);
      this.hurried = this.queue.length;
    }
    steps.forEach((step, i) => this.queue.push({ step, dur: times[i] }));
  }

  remaining() { return this.queue.reduce((sum, q) => sum + q.dur, 0) - this.time; }

  // Finish everything at once, for when a hand takes the crank.
  flush() {
    while (this.queue.length) {
      const { step } = this.queue.shift();
      this.pose = poseOf(step.after);
    }
    this.time = 0; this.started = false; this.speed = 1; this.hurried = 0;
    this.onSettle?.();
  }

  tick(dt) {
    if (!this.queue.length) return false;
    let left = dt * this.speed;
    while (this.queue.length && left >= 0) {
      const head = this.queue[0];
      if (!this.started) { this.started = true; this.onStep?.(head.step, head.dur / this.speed); }
      const room = head.dur - this.time;
      if (left < room) {
        this.time += left;
        this.pose = samplePose(head.step, this.time / head.dur);
        return true;
      }
      left -= room;
      this.pose = poseOf(head.step.after);
      this.queue.shift();
      this.time = 0;
      this.started = false;
      // Only what was already running is hurried; the new sum runs at its own pace.
      if (this.hurried > 0 && --this.hurried === 0) { left /= this.speed; this.speed = 1; }
    }
    this.speed = 1;
    this.hurried = 0;
    this.onSettle?.();
    return true;
  }

  // A hand on the crank: the phase comes from the handle, not from a clock.
  scrub(step, phase) { this.pose = samplePose(step, phase); }
}

// A whole scripted run laid out on a timeline, for the film.
export function timeline(entries) {
  let t = 0;
  const out = [];
  for (const entry of entries) {
    const times = durations(entry.steps);
    entry.steps.forEach((step, i) => {
      out.push({ step, start: t, dur: times[i] });
      t += times[i];
    });
    t += entry.wait ?? 0.12;
  }
  return { items: out, total: t };
}

export function poseAt(line, t, resting) {
  let pose = resting;
  for (const item of line.items) {
    if (t < item.start) break;
    if (t < item.start + item.dur && item.dur > 0) return samplePose(item.step, (t - item.start) / item.dur);
    pose = poseOf(item.step.after);
  }
  return pose;
}

export const REGISTER_SIZES = { SETTING, ACCUM, COUNTER };
