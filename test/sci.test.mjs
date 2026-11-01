import test from "node:test";
import assert from "node:assert/strict";
import { Scientific, formatNumber } from "../src/machine/sci.js";

const WORDS = { "(": "(", ")": ")" };
function run(text, setup) {
  const c = new Scientific();
  setup?.(c);
  for (const token of text.split(" ")) {
    if (/^[0-9.]+$/.test(token)) for (const ch of token) c.press(ch);
    else c.press(WORDS[token] ?? token);
  }
  return c;
}
const M = "−";

const CASES = [
  ["2 + 3 * 4 =", "14"],
  ["( 2 + 3 ) * 4 =", "20"],
  ["0.1 + 0.2 =", "0.3"],
  ["10 / 4 =", "2.5"],
  ["1 / 3 =", "0.3333333333"],
  ["2 pow 10 =", "1024"],
  ["2 pow 3 pow 2 =", "512"],
  ["+/- 2 pow 2 =", M + "4"],
  ["2 pow +/- 2 =", "0.25"],
  ["sin 30 =", "0.5"],
  ["cos 60 =", "0.5"],
  ["tan 45 =", "1"],
  ["sin 180 =", "0"],
  ["cos 90 =", "0"],
  ["sin 90 =", "1"],
  ["2nd sin 0.5 =", "30"],
  ["2nd cos 0.5 =", "60"],
  ["2nd tan 1 =", "45"],
  ["ln e =", "1"],
  ["log 1000 =", "3"],
  ["2nd log 3 =", "1000"],
  ["2nd ln 0 =", "1"],
  ["sqrt 16 =", "4"],
  ["2nd sqrt 27 =", "3"],
  ["5 sq =", "25"],
  ["2nd sq", ""],
  ["3 cube =", "27"],
  ["4 inv =", "0.25"],
  ["5 fact =", "120"],
  ["0 fact =", "1"],
  ["50 % =", "0.5"],
  ["27 2nd pow 3 =", "3"],
  ["+/- 8 2nd pow 3 =", M + "2"],
  ["2 pi =", "6.283185307"],
  ["2 ( 3 ) =", "6"],
  ["( 2 ) ( 3 ) =", "6"],
  ["2 sin 30 =", "1"],
  ["sin ( 30 =", "0.5"],
  ["( ( 2 + 3 =", "5"],
  ["1.5 EE 3 =", "1500"],
  ["1 EE +/- 2 =", "0.01"],
  ["5 +/- =", M + "5"],
  ["5 +/- +/- =", "5"],
  ["1 EE 15 =", "1E15"],
  ["1 EE 15 + 1 EE 15 =", "2E15"],
  ["1 EE +/- 12 =", "1E" + M + "12"],
  ["2nd inv +/- 3 ) =", "3"],
];
for (const [keys, want] of CASES) {
  if (want === "") continue;
  test(`${keys} → ${want}`, () => assert.equal(run(keys).result, want));
}

const ERRORS = [
  ["1 / 0 =", "Math ERROR"], ["0 inv =", "Math ERROR"], ["sqrt +/- 1 =", "Math ERROR"], ["ln 0 =", "Math ERROR"],
  ["log +/- 5 =", "Math ERROR"], ["tan 90 =", "Math ERROR"], ["2nd sin 2 =", "Math ERROR"], ["171 fact =", "Math ERROR"],
  ["2.5 fact =", "Math ERROR"], ["10 pow 400 =", "Math ERROR"], ["+/- 8 pow 0.5 =", M + "2.828427125"],
  ["2 + =", "Syntax ERROR"], ["* 3 =", "Syntax ERROR"], [") 3 =", "Syntax ERROR"], ["1.2 . 3 + ) =", "Syntax ERROR"],
];
for (const [keys, want] of ERRORS) test(`${keys} → ${want}`, () => assert.equal(run(keys).result, want));

test("radians and grads change the angle unit", () => {
  const rad = (c) => { c.press("drg"); };
  assert.equal(run("sin pi =", rad).result, "0");
  assert.equal(run("sin pi / 2 ) =", rad).result, "1");
  const grad = (c) => { c.press("drg"); c.press("drg"); };
  assert.equal(run("sin 100 =", grad).result, "1");
  const c = new Scientific();
  c.press("drg"); c.press("drg"); c.press("drg");
  assert.equal(c.mode, "DEG");
});

test("after =, an operator continues from Ans and a digit starts afresh", () => {
  const c = run("2 + 3 =");
  c.press("*"); c.press("2"); c.press("=");
  assert.equal(c.result, "10");
  c.press("7");
  assert.equal(c.expression, "7");
  c.press("=");
  assert.equal(c.result, "7");
  c.press("sq"); c.press("=");
  assert.equal(c.result, "49");
  c.press("Ans"); c.press("+"); c.press("1"); c.press("=");
  assert.equal(c.result, "50");
});

test("memory adds, subtracts, recalls and clears", () => {
  const c = run("5 m+");
  assert.equal(c.memory, 5);
  for (const k of "3") c.press(k);
  c.press("m-");
  assert.equal(c.memory, 2);
  c.press("mr"); c.press("*"); c.press("4"); c.press("=");
  assert.equal(c.result, "8");
  c.press("mc");
  c.press("mr"); c.press("=");
  assert.equal(c.result, "0");
});

test("errors clear on the next key, and AC keeps Ans and memory", () => {
  const c = run("1 / 0 =");
  assert.equal(c.error, "Math ERROR");
  c.press("2"); c.press("=");
  assert.equal(c.result, "2");
  c.press("m+");
  c.press("AC");
  assert.equal(c.ans, 2);
  assert.equal(c.memory, 2);
  assert.equal(c.result, "0");
});

test("DEL takes one digit or one atom", () => {
  const c = run("12 + sin");
  c.press("DEL");
  assert.equal(c.expression, "12+");
  c.press("DEL");
  c.press("DEL");
  assert.equal(c.expression, "1");
  c.press("DEL"); c.press("DEL");
  assert.equal(c.expression, "");
});

test("2nd only lasts for one key, and pressing it twice cancels it", () => {
  const c = run("2nd 2nd sin 30 =");
  assert.equal(c.result, "0.5");
  const d = new Scientific();
  d.press("2nd");
  d.press("sin");
  assert.equal(d.second, false);
  assert.equal(d.expression, "sin⁻¹(");
});

test("ran gives a three-decimal number from the source", () => {
  const c = new Scientific({ random: () => 0.1234 });
  c.press("2nd"); c.press("fact"); c.press("=");
  assert.equal(c.result, "0.123");
});

test("number formatting", () => {
  assert.equal(formatNumber(1234567890), "1234567890");
  assert.equal(formatNumber(12345678901), "1.23456789E10");
  assert.equal(formatNumber(-0.5), M + "0.5");
  assert.equal(formatNumber(0.30000000000000004), "0.3");
  assert.equal(formatNumber(1e-10), "1E" + M + "10");
});

test("random expressions match JavaScript's own arithmetic", () => {
  let seed = 31337;
  const rnd = (n) => (seed = (seed * 16807) % 2147483647) % n;
  for (let i = 0; i < 3000; i++) {
    const a = 1 + rnd(999), b = 1 + rnd(99), d = 1 + rnd(9);
    const op1 = "+-*/"[rnd(4)], op2 = "+-*/"[rnd(4)];
    const c = new Scientific();
    for (const k of `${a}${op1}(${b}${op2}${d})`) c.press(k);
    c.press("=");
    const inner = { "+": b + d, "-": b - d, "*": b * d, "/": b / d }[op2];
    if (op1 === "/" && inner === 0) { assert.equal(c.result, "Math ERROR"); continue; }
    const want = { "+": a + inner, "-": a - inner, "*": a * inner, "/": a / inner }[op1];
    assert.equal(c.result, formatNumber(want), `${a}${op1}(${b}${op2}${d})`);
  }
});

test("key mashing never leaves it throwing", () => {
  const KEYS = ["0", "5", "9", ".", "+", "-", "*", "/", "pow", "root", "(", ")", "sin", "cos", "tan", "ln", "log", "sqrt", "sq", "inv", "fact", "%", "pi", "e", "Ans", "EE", "+/-", "DEL", "AC", "=", "=", "2nd", "drg", "mc", "mr", "m+", "m-"];
  let seed = 555;
  const rnd = (n) => (seed = (seed * 16807) % 2147483647) % n;
  for (let run = 0; run < 400; run++) {
    const c = new Scientific();
    for (let i = 0; i < 60; i++) {
      c.press(KEYS[rnd(KEYS.length)]);
      assert.equal(typeof c.result, "string");
      assert.ok(!/NaN|undefined|Infinity/.test(c.result + c.expression), c.result + " / " + c.expression);
    }
  }
});
