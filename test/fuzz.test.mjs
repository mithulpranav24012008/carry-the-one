// Checks the machine against exact arithmetic and against its own invariants, on seeded random input.
import test from "node:test";
import assert from "node:assert/strict";
import { Machine, reading, settingReading, digitOf, SETTING, ACCUM, COUNTER, MAX_POS } from "../src/machine/model.js";
import { poseAt, poseOf, samplePose, timeline } from "../src/machine/player.js";

function random(seed) {
  let s = seed;
  return (n) => (s = (s * 16807) % 2147483647) % n;
}

const toBig = (text) => {
  // Value scaled by 10^30, from a machine reading.
  const neg = text.startsWith("−");
  const [i, f = ""] = text.replace("−", "").replaceAll(",", "").split(".");
  const v = BigInt(i + f.padEnd(30, "0"));
  return neg ? -v : v;
};
const SCALE = 10n ** 30n;

function number(rnd) {
  const digits = 1 + rnd(5);
  let text = "";
  for (let i = 0; i < digits; i++) text += String(rnd(10));
  text = text.replace(/^0+(?=\d)/, "");
  if (rnd(3) === 0 && digits < 9) text += "." + String(rnd(1000));
  return text;
}
const key = (m, text) => { for (const ch of text) m.press(ch); };

function checkRegisters(r, where) {
  assert.ok(Number.isInteger(r.pos) && r.pos >= 0 && r.pos <= MAX_POS, `${where}: carriage at ${r.pos}`);
  for (const [name, digits, wheels, size] of [["a", r.a, r.aw, ACCUM], ["c", r.c, r.cw, COUNTER], ["s", r.s, r.sw, SETTING]]) {
    assert.equal(digits.length, size, `${where}: ${name} has ${digits.length} digits`);
    digits.forEach((d, i) => {
      assert.ok(Number.isInteger(d) && d >= 0 && d <= 9, `${where}: ${name}[${i}] = ${d}`);
      assert.equal(d, digitOf(wheels[i]), `${where}: wheel ${name}[${i}] disagrees with its digit`);
    });
  }
  assert.ok(!/NaN|undefined/.test(reading(r)), `${where}: reading ${reading(r)}`);
}

test("+, - and x match exact arithmetic", () => {
  const rnd = random(4242);
  for (let i = 0; i < 1500; i++) {
    const a = number(rnd), b = number(rnd);
    const op = "+-*"[rnd(3)];
    const m = new Machine();
    key(m, a + op + b + "=");
    const A = toBig(a), B = toBig(b);
    const want = op === "+" ? A + B : op === "-" ? A - B : (A * B) / SCALE;
    assert.equal(toBig(reading(m.r)), want, `${a} ${op} ${b} read ${reading(m.r)}`);
  }
});

test("/ is within one unit of the last digit it holds", () => {
  const rnd = random(777);
  for (let i = 0; i < 800; i++) {
    const a = number(rnd), b = number(rnd);
    if (toBig(b) === 0n) continue;
    const m = new Machine();
    key(m, a + "/" + b + "=");
    const got = toBig(reading(m.r));
    const exact = (toBig(a) * SCALE) / toBig(b);
    const tolerance = exact === 0n ? 1n : 10n ** BigInt(Math.max(0, exact.toString().length - 8));
    const gap = got > exact ? got - exact : exact - got;
    assert.ok(gap <= tolerance, `${a} / ${b} read ${reading(m.r)}`);
  }
});

test("random key mashing never breaks the machine, and steps chain without a jump", () => {
  const KEYS = ["0", "1", "2", "5", "7", "9", ".", "+", "-", "*", "/", "=", "=", "+/-", "C", "AC", "shift-left", "shift-right", "clear-a", "clear-c"];
  const rnd = random(99);
  for (let run = 0; run < 150; run++) {
    const m = new Machine();
    let previous = structuredClone(m.r);
    for (let i = 0; i < 80; i++) {
      const action = rnd(12) === 0 ? null : KEYS[rnd(KEYS.length)];
      const where = `run ${run} press ${i} (${action ?? "crank"})`;
      let steps;
      if (action) steps = m.press(action);
      else {
        const made = m.crank(rnd(2) ? 1 : -1);
        steps = made ? [made.step, ...made.follow] : [];
      }
      checkRegisters(m.r, where);
      for (const step of steps) {
        if (step.before) {
          for (const field of ["aw", "cw", "sw"]) assert.deepEqual(step.before[field], previous[field] ?? step.before[field], `${where}: ${field} jumped`);
          samplePose(step, 0.5);
        }
        previous = step.after;
      }
      assert.ok(m.locked === null || /AC/.test(m.locked), `${where}: jam message must name the way out`);
    }
  }
});

test("the pose timeline ends exactly on the registers", () => {
  const m = new Machine();
  const line = timeline([{ steps: m.press("3") }, { steps: m.press("/") }, { steps: m.press("7") }, { steps: m.press("=") }]);
  const pose = poseAt(line, line.total + 1, poseOf(new Machine().r));
  assert.deepEqual(pose.aw, m.r.aw);
  assert.deepEqual(pose.cw, m.r.cw);
});

const calc = (s) => { const m = new Machine(); for (const k of s.split(" ")) { if (/^[0-9.]+$/.test(k)) key(m, k); else m.press(k); } return m; };

test("a sign keyed first stays through the digits that follow", () => {
  assert.equal(reading(calc("5 +/- 3 =").r), "−53");
  assert.equal(settingReading(calc("5 +/- 3").r), "−53");
  assert.equal(reading(calc("10 + +/- 3 =").r), "7");
  assert.equal(reading(calc("2 * +/- 4 =").r), "−8");
});
test("a sign does not leak into the next number", () => {
  assert.equal(reading(calc("5 +/- + 3 =").r), "−2");
  assert.equal(reading(calc("5 +/- = 3 + 1 =").r), "4");
});
test("clearing the entry mid-sum adds nothing", () => assert.equal(reading(calc("5 * 3 + 2 C =").r), "15"));
test("very small answers carry on without running off the carriage", () => {
  const m = calc("1 / 3000 + 1 =");
  checkRegisters(m.r, "1/3000+1");
  assert.equal(reading(m.r), "1.000333333");
  assert.equal(reading(calc("1 / 3000 + =").r), "0.000666666");
});
test("changing your mind about the operator leaves one in the expression", () => {
  const m = calc("5 + *");
  assert.equal(m.status, "5 ×");
  m.press("3"); m.press("=");
  assert.equal(reading(m.r), "15");
});
test("after a division the setting reads as the number keyed", () => assert.equal(settingReading(calc("22 / 7 =").r), "7"));
test("the accumulator's clear lever shows its work after a division", () => {
  const m = calc("22 / 7 =");
  m.press("clear-a");
  assert.equal(reading(m.r), "0");
});
test("the crank goes the way the hand pushes it, even on a negative number", () => {
  const m = new Machine();
  m.press("7");
  m.crank(-1);
  assert.equal(m.r.flag, true);
  const before = m.r.crank;
  const preview = m.previewTurn(1);
  assert.equal(preview.crankDir, 1);
  const pose = samplePose(preview, 0.5);
  assert.equal(pose.crank, before + 0.5);
  const made = m.crank(1);
  assert.equal(made.step.crankDir, 1);
  assert.equal(m.r.crank, before + 1);
});
test("a hand turn after a division starts from a positive accumulator", () => {
  const m = calc("6 +/- / 4 =");
  assert.equal(m.r.flag, true);
  m.press("1");
  const made = m.crank(1);
  assert.equal(made.step.dir, 1);
  assert.equal(m.r.flag, false);
});
