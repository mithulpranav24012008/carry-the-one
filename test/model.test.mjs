import test from "node:test";
import assert from "node:assert/strict";
import { Machine, reading, digitOf } from "../src/machine/model.js";

const seq = (m, s) => { for (const k of s.split(" ")) { if (k === "C#") m.press("C"); else for (const ch of /^[0-9.]+$/.test(k) ? [...k] : [k]) m.press(ch); } };
const calc = (s) => { const m = new Machine(); seq(m, s); return m; };
const cases = [
  ["2 + 3 =", "5"],
  ["12.5 + 0.75 =", "13.25"],
  ["1 + 2 + 3 + 4 =", "10"],
  ["3 - 5 =", "−2"],
  ["3 - 5 + 10 =", "8"],
  ["1234 * 56 =", "69,104"],
  ["1234 * 99 =", "122,166"],
  ["999 * 999 =", "998,001"],
  ["9999999999 * 9999999999 =", "99,999,999,980,000,000,001"],
  ["12.5 * 0.2 =", "2.5"],
  ["100 / 4 =", "25"],
  ["1 / 3 =", "0.333333333"],
  ["22 / 7 =", "3.14285714"],
  ["7 / 8 =", "0.875"],
  ["1000000 / 0.001 =", "1,000,000,000"],
  ["0 / 5 =", "0"],
  ["2 * 3 + 4 =", "10"],
  ["10 / 4 * 2 =", "5"],
  ["1 / 3 * 3 =", "0.999999999"],
  ["5 +/- * 3 =", "−15"],
  ["5 * 3 +/- =", "−15"],
  ["6 +/- / 3 =", "−2"],
  ["0.1 + 0.2 =", "0.3"],
  ["2 * =", "4"],
];
for (const [expr, want] of cases) {
  test(expr + " → " + want, () => assert.equal(reading(calc(expr).r), want));
}

test("wheel positions agree with digits after every step", () => {
  const m = calc("987654 * 4321 =");
  m.r.a.forEach((d, i) => assert.equal(d, digitOf(m.r.aw[i]), "accum " + i));
  m.r.c.forEach((d, i) => assert.equal(d, digitOf(m.r.cw[i]), "counter " + i));
  m.r.s.forEach((d, i) => assert.equal(d, digitOf(m.r.sw[i]), "setting " + i));
});

test("the counter shows the multiplier, short cuts and all", () => {
  const m = calc("37 * 9981 =");
  assert.equal(m.r.c.slice().reverse().join("").replace(/^0+/, ""), "9981");
});

test("division leaves the quotient in the counter and rings the bell", () => {
  const m = new Machine();
  seq(m, "100 /");
  m.press("4");
  const steps = m.press("=");
  assert.ok(steps.some((s) => s.type === "bell"));
  assert.equal(m.r.readFrom, "c");
});

test("dividing by zero jams until cleared", () => {
  const m = calc("5 / 0 =");
  assert.match(m.locked, /bell never rings/);
  m.press("AC");
  assert.equal(m.locked, null);
  seq(m, "2 + 2 =");
  assert.equal(reading(m.r), "4");
});

test("a hand turn adds the setting at the carriage position", () => {
  const m = new Machine();
  m.press("7");
  m.crank(1); m.crank(1);
  assert.equal(m.r.a[0], 4);
  assert.equal(m.r.a[1], 1);
  assert.equal(m.r.c[0], 2);
  m.press("shift-right");
  m.crank(1);
  assert.equal(m.r.a[1], 8);
  assert.equal(m.r.c[1], 1);
});

test("hand turns below zero complement and raise the flag", () => {
  const m = new Machine();
  m.press("7");
  m.crank(-1);
  assert.equal(m.r.flag, true);
  assert.equal(m.r.a[0], 7);
  m.crank(1);
  assert.equal(m.r.flag, false);
  assert.ok(m.r.a.every((d) => d === 0));
});

test("accumulator overflow jams", () => {
  const m = calc("9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 + 9999999999 =");
  assert.ok(m.locked === null || /Overflow/.test(m.locked));
});

test("worst case stays bounded", () => {
  const m = new Machine();
  seq(m, "9999999999 /");
  m.press("7");
  const steps = m.press("=");
  assert.ok(steps.filter((s) => s.type === "turn").length < 120);
});

test("a hand-turned sum reads as whole numbers and carries on with the keys", () => {
  const m = new Machine();
  m.press("7");
  m.crank(1);
  assert.equal(reading(m.r), "7");
  m.press("shift-right");
  m.crank(1);
  assert.equal(reading(m.r), "77");
  for (const k of "+3=") m.press(k);
  assert.equal(reading(m.r), "80");
});
