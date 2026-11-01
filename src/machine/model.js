// The machine, as digits. There is no Number arithmetic on values here: a crank
// turn adds one digit column at a time and ripples carries, the way the wheels do.
// Every number on the page, and every motion of the 3D model, comes from this file.

export const SETTING = 10; // setting wheels (the number you key in)
export const COUNTER = 10; // revolution counter wheels
export const ACCUM = 20; // accumulator wheels
export const MAX_POS = 9; // carriage shifts
const ADD_DEC = 9; // accumulator decimal marker during addition

const zeros = (n) => new Array(n).fill(0);
const digitOf = (wheel) => ((wheel % 10) + 10) % 10;

export function initialRegisters() {
  return {
    s: zeros(SETTING), a: zeros(ACCUM), c: zeros(COUNTER), // true digits, index 0 = units
    sw: zeros(SETTING), aw: zeros(ACCUM), cw: zeros(COUNTER), // cumulative wheel position, so wheels never spin backwards by accident
    pos: 0, sDec: 0, aDec: ADD_DEC, cDec: 0,
    flag: false, // red sign flag: accumulator holds a magnitude, and it is negative
    sNeg: false,
    readFrom: "a",
    turns: 0,
    crank: 0, // cumulative crank turns
  };
}

const copy = (r) => ({ ...r, s: [...r.s], a: [...r.a], c: [...r.c], sw: [...r.sw], aw: [...r.aw], cw: [...r.cw] });
const isZero = (d) => d.every((x) => x === 0);

// One crank turn. dir +1 adds, -1 subtracts. Returns per-wheel motion split into the
// drive phase (teeth on the stepped drum) and the carry phase (one wheel nudging the next).
function turnOnce(r, dir, countDir = dir, crankDir = dir) {
  const drive = [];
  for (let i = 0; i < SETTING; i++) {
    const w = i + r.pos;
    if (w < ACCUM && r.s[i]) drive.push({ wheel: w, by: dir * r.s[i], from: i });
  }
  const a = [...r.a];
  const pending = zeros(ACCUM + 1);
  for (const d of drive) {
    const v = a[d.wheel] + dir * r.s[d.from];
    if (v > 9) { a[d.wheel] = v - 10; pending[d.wheel + 1] += 1; }
    else if (v < 0) { a[d.wheel] = v + 10; pending[d.wheel + 1] -= 1; }
    else a[d.wheel] = v;
  }
  const carries = [];
  let out = 0;
  for (let w = 1; w <= ACCUM; w++) {
    if (!pending[w]) continue;
    if (w === ACCUM) { out = pending[w]; break; }
    carries.push({ wheel: w, by: pending[w] });
    const v = a[w] + pending[w];
    if (v > 9) { a[w] = v - 10; pending[w + 1] += 1; }
    else if (v < 0) { a[w] = v + 10; pending[w + 1] -= 1; }
    else a[w] = v;
  }
  // The counter is a smaller machine on the same crank.
  const c = [...r.c];
  const count = [];
  let carry = countDir;
  for (let w = r.pos; w < COUNTER && carry; w++) {
    const v = c[w] + carry;
    count.push({ wheel: w, by: carry });
    if (v > 9) { c[w] = v - 10; carry = 1; }
    else if (v < 0) { c[w] = v + 10; carry = -1; }
    else { c[w] = v; carry = 0; }
  }
  const before = copy(r);
  r.a = a; r.c = c;
  if (isZero(a)) r.flag = false;
  for (const d of drive) r.aw[d.wheel] += d.by;
  for (const d of carries) r.aw[d.wheel] += d.by;
  for (const d of count) r.cw[d.wheel] += d.by;
  r.turns += 1;
  r.crank += crankDir;
  return { type: "turn", dir, crankDir, drive, carries, count, out, before, after: copy(r) };
}

function setWheels(digits, wheels, to) {
  for (let i = 0; i < digits.length; i++) {
    let delta = to[i] - digitOf(wheels[i]);
    if (delta > 5) delta -= 10;
    if (delta < -5) delta += 10;
    wheels[i] += delta;
    digits[i] = to[i];
  }
}

function clearWheels(digits, wheels) {
  for (let i = 0; i < digits.length; i++) {
    wheels[i] += (10 - digitOf(wheels[i])) % 10; // a clear lever only ever rolls forward to zero
    digits[i] = 0;
  }
}

// ---- reading registers as decimal strings (BigInt only at this printing stage) ----

function digitsToBig(d) {
  let v = 0n;
  for (let i = d.length - 1; i >= 0; i--) v = v * 10n + BigInt(d[i]);
  return v;
}

export function formatScaled(big, dec, neg = false, group = true) {
  let s = big.toString();
  if (dec < 0) { s = s + "0".repeat(-dec); dec = 0; }
  if (dec > 0) {
    s = s.padStart(dec + 1, "0");
    const intPart = s.slice(0, s.length - dec);
    const frac = s.slice(s.length - dec).replace(/0+$/, "");
    s = frac ? intPart + "." + frac : intPart;
  }
  if (group) {
    const [i, f] = s.split(".");
    s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : "");
  }
  const zero = /^[0.,]*$/.test(s);
  return (neg && !zero ? "−" : "") + s;
}

export function reading(r) {
  if (r.readFrom === "c") return formatScaled(digitsToBig(r.c), r.cDec, r.flag);
  return formatScaled(digitsToBig(r.a), r.aDec, r.flag);
}

export const settingReading = (r) => formatScaled(digitsToBig(r.s), r.sDec, r.sNeg);
export const counterReading = (r) => formatScaled(digitsToBig(r.c), 0, false, false);

// ---- the operator: a controller that compiles a key press into machine steps ----

const OP_SYMBOL = { "+": "+", "-": "−", "*": "×", "/": "÷" };

export class Machine {
  constructor() {
    this.r = initialRegisters();
    this.entry = ""; // what the operator has keyed, as typed
    this.entering = false;
    this.entryNeg = false; // the sign keyed for the number being entered
    this.pending = null; // an operator waiting for its right-hand number
    this.left = null; // {digits:[...], dec, neg} captured for × and ÷
    this.locked = null; // message when the machine has jammed (overflow, ÷0)
    this.status = "Ready";
    this.lastRun = null;
    this.expression = "";
    this.steps = [];
  }

  // Steps are appended here, then handed to the player.
  push(step) { this.steps.push(step); return step; }
  mutate(type, extra, fn) {
    const before = copy(this.r);
    fn(this.r);
    return this.push({ type, ...extra, before, after: copy(this.r) });
  }

  // ---- low level moves ----
  shiftTo(p) {
    if (this.r.pos === p) return;
    this.mutate("shift", { to: p }, (r) => { r.pos = p; });
  }
  setSetting(digits, dec, neg = false, why = "set") {
    this.mutate("set", { why }, (r) => {
      setWheels(r.s, r.sw, digits);
      r.sDec = dec;
      r.sNeg = neg;
    });
  }
  clearAccum() {
    if (isZero(this.r.a) && !this.r.flag) return;
    this.mutate("clear", { which: "a" }, (r) => { clearWheels(r.a, r.aw); r.flag = false; });
  }
  clearCounter() {
    if (isZero(this.r.c)) return;
    this.mutate("clear", { which: "c" }, (r) => { clearWheels(r.c, r.cw); });
  }
  clearSetting() {
    if (isZero(this.r.s)) { this.r.sDec = 0; this.r.sNeg = false; return; }
    this.mutate("clear", { which: "s" }, (r) => { clearWheels(r.s, r.sw); r.sDec = 0; r.sNeg = false; });
  }
  turn(dir, countDir = dir, crankDir = dir) { return this.push(turnOnce(this.r, dir, countDir, crankDir)); }

  // A number with more decimals than the addition scale holds is rounded to fit, or the carriage would need to go past its stop.
  fitSetting() {
    const r = this.r;
    if (r.sDec <= ADD_DEC) return;
    const unit = 10n ** BigInt(r.sDec - ADD_DEC);
    const value = (digitsToBig(r.s) + unit / 2n) / unit;
    const digits = zeros(SETTING);
    [...value.toString()].reverse().forEach((ch, i) => { digits[i] = Number(ch); });
    this.setSetting(digits, ADD_DEC, r.sNeg, "transfer");
  }

  // A signed turn on the magnitude-and-flag accumulator; complements if it goes below zero.
  signedTurn(dir) {
    const eff = this.r.flag ? -dir : dir;
    const step = this.turn(eff, dir);
    if (step.out === 1) {
      this.mutate("bell", { why: "overflow" }, () => {});
      this.jam("Overflow: the top wheel rolled past 9. Press AC to go on.");
    } else if (step.out === -1) {
      this.mutate("bell", { why: "negative" }, () => {});
      this.mutate("complement", {}, (r) => {
        const to = tensComplement(r.a);
        setWheels(r.a, r.aw, to);
        r.flag = !r.flag;
      });
    }
    return step;
  }

  jam(message) { this.locked = message; this.status = message; }

  // ---- reading out what's in the register that holds the answer ----
  // Returns up to SETTING significant digits, rounded, ready to be set on the keyboard.
  backTransfer() {
    const r = this.r;
    const source = r.readFrom === "c" ? r.c : r.a;
    const dec = r.readFrom === "c" ? r.cDec : r.aDec;
    let top = source.length - 1;
    while (top > 0 && source[top] === 0) top--;
    const len = top + 1;
    let digits = source.slice(0, len);
    let d = dec;
    if (len > SETTING) {
      const drop = len - SETTING;
      let value = digitsToBig(digits);
      const unit = 10n ** BigInt(drop);
      value = (value + unit / 2n) / unit;
      d = dec - drop;
      digits = [...value.toString()].reverse().map(Number);
      if (digits.length > SETTING) { digits = digits.slice(1); d -= 1; }
    }
    // Trailing zeros after the decimal marker are only padding.
    while (d > 0 && digits.length > 1 && digits[0] === 0) { digits = digits.slice(1); d -= 1; }
    while (digits.length < SETTING) digits.push(0);
    if (d < 0) {
      // A number too large for its marker: multiply out if there's room on the keys.
      const shift = -d;
      const used = 10 - [...digits].reverse().findIndex((x) => x !== 0);
      if (used + shift <= SETTING) { digits = [...zeros(shift), ...digits].slice(0, SETTING); d = 0; }
      else { return null; }
    }
    return { digits, dec: d, neg: r.flag };
  }

  // Make the accumulator hold the current setting at the addition scale.
  loadSettingToAccum(dir = 1) {
    this.fitSetting();
    this.clearAccum();
    this.clearCounter();
    this.mutate("mark", {}, (r) => { r.aDec = ADD_DEC; r.readFrom = "a"; });
    this.shiftTo(ADD_DEC - this.r.sDec);
    this.signedTurn(this.r.sNeg ? -dir : dir);
  }

  // After × or ÷ the answer may sit at another scale. Bring it back to the addition scale.
  normalise() {
    const r = this.r;
    if (r.aDec === ADD_DEC && r.readFrom === "a") return true;
    const transfer = this.backTransfer();
    if (!transfer) { this.jam("That result is too long to carry on with. Press AC to go on."); return false; }
    this.setSetting(transfer.digits, transfer.dec, transfer.neg, "transfer");
    this.loadSettingToAccum();
    return true;
  }

  // ---- arithmetic: each is the sequence an operator performs by hand ----
  addSub(op) {
    this.fitSetting();
    const r = this.r;
    this.shiftTo(ADD_DEC - r.sDec);
    const dir = (op === "+" ? 1 : -1) * (r.sNeg ? -1 : 1);
    this.signedTurn(dir);
  }

  multiply() {
    const r = this.r;
    const multiplier = { digits: [...r.s], dec: r.sDec, neg: r.sNeg };
    const multiplicand = this.left;
    this.setSetting(multiplicand.digits, multiplicand.dec, false, "multiplicand");
    this.clearAccum();
    this.clearCounter();
    this.mutate("mark", {}, (reg) => { reg.aDec = multiplicand.dec + multiplier.dec; reg.readFrom = "a"; reg.cDec = 0; });
    // Short-cut multiplication: a 9 is one turn up the next column and one turn back.
    let carry = 0;
    let top = SETTING - 1;
    while (top > 0 && multiplier.digits[top] === 0) top--;
    for (let p = 0; p <= top + 1 && p <= MAX_POS; p++) {
      let d = (multiplier.digits[p] ?? 0) + carry;
      carry = 0;
      if (d === 0) continue;
      this.shiftTo(p);
      let dir = 1;
      if (d > 5 && p < MAX_POS) { d = 10 - d; dir = -1; carry = 1; }
      for (let t = 0; t < d; t++) this.turn(dir);
    }
    this.mutate("mark", {}, (reg) => { reg.flag = multiplicand.neg !== multiplier.neg; });
  }

  divide() {
    const r = this.r;
    const divisor = { digits: [...r.s], dec: r.sDec, neg: r.sNeg };
    const dividend = this.left;
    if (isZero(divisor.digits)) {
      // The bell only rings when a subtraction goes through zero. Against a divisor of zero it never does.
      this.clearAccum();
      for (let t = 0; t < 9; t++) this.turn(-1, 1);
      this.jam("Divide by zero: the bell never rings, so a real machine would turn forever. Press AC to stop it.");
      return;
    }
    const length = (d) => { let n = d.length; while (n > 0 && d[n - 1] === 0) n--; return n; };
    const ln = length(dividend.digits);
    const ld = length(divisor.digits);
    if (ln === 0) {
      this.clearAccum();
      this.clearCounter();
      this.mutate("mark", {}, (reg) => { reg.readFrom = "c"; reg.cDec = 0; reg.flag = false; });
      return;
    }
    const left = (d, n) => [...zeros(SETTING - n), ...d.slice(0, n)];
    // Hard left, with the decimal marker moved along so the wheels still read as the same number.
    const leftDec = (dec, n) => dec + SETTING - n;
    // Set the dividend hard left, enter it at the far end of the carriage.
    this.setSetting(left(dividend.digits, ln), leftDec(dividend.dec, ln), false, "dividend");
    this.clearAccum();
    this.clearCounter();
    this.shiftTo(MAX_POS);
    this.turn(1, 0);
    // Set the divisor hard left and subtract, column by column, until the bell.
    this.setSetting(left(divisor.digits, ld), leftDec(divisor.dec, ld), false, "divisor");
    // From here the answer grows in the counter, one column at a time.
    const quotientDec = MAX_POS - (ln - ld - dividend.dec + divisor.dec);
    this.mutate("mark", {}, (reg) => { reg.readFrom = "c"; reg.cDec = quotientDec; reg.flag = false; });
    for (let p = MAX_POS; p >= 0; p--) {
      this.shiftTo(p);
      for (let guard = 0; guard < 11; guard++) {
        const step = this.turn(-1, 1);
        if (step.out === -1) {
          this.mutate("bell", { why: "division" }, () => {});
          this.turn(1, -1); // one too many: put it back
          break;
        }
      }
      if (isZero(this.r.a)) break;
    }
    this.shiftTo(0);
    this.mutate("mark", {}, (reg) => {
      reg.readFrom = "c";
      reg.cDec = quotientDec;
      reg.flag = dividend.neg !== divisor.neg;
    });
  }

  // ---- key handlers ----
  captureAccumAsLeft() {
    const transfer = this.backTransfer();
    if (!transfer) { this.jam("That result is too long to carry on with. Press AC to go on."); return null; }
    return transfer;
  }

  run(op) {
    // Applies the pending operator using the setting register.
    if (op === "+" || op === "-") {
      // normalise() may use the setting to move the answer, so put back what the operator keyed.
      const r = this.r;
      const right = { digits: [...r.s], dec: r.sDec, neg: r.sNeg };
      const moves = r.aDec !== ADD_DEC || r.readFrom !== "a";
      if (!this.normalise()) return;
      if (this.locked) return;
      if (moves) this.setSetting(right.digits, right.dec, right.neg, "restore");
      this.addSub(op);
    } else if (op === "*") {
      this.multiply();
    } else if (op === "/") {
      this.divide();
    }
  }

  // The public entry point. Returns the steps the press caused.
  press(key) {
    this.steps = [];
    const started = this.r.turns;
    if (this.locked && key !== "AC") {
      return this.finish(started);
    }
    if (/^[0-9]$/.test(key)) this.keyDigit(key);
    else if (key === ".") this.keyPoint();
    else if (key === "+/-") this.keySign();
    else if (key === "C") this.keyClearEntry();
    else if (key === "AC") this.keyClearAll();
    else if (key === "+" || key === "-" || key === "*" || key === "/") this.keyOperator(key);
    else if (key === "=") this.keyEquals();
    else if (key === "shift-left") this.manualShift(-1);
    else if (key === "shift-right") this.manualShift(1);
    else if (key === "clear-a") {
      this.clearAccum();
      this.mutate("mark", {}, (r) => { r.readFrom = "a"; r.aDec = ADD_DEC; r.flag = false; });
      this.afterManual();
      this.status = "Accumulator cleared";
    } else if (key === "clear-c") {
      this.clearCounter();
      this.status = "Counter cleared";
    }
    else if (key === "clear-s") { this.keyClearEntry(); }
    return this.finish(started);
  }

  finish(started) {
    const used = this.r.turns - started;
    if (used > 0) this.lastRun = { turns: used, steps: this.steps.length };
    return this.steps;
  }

  keyDigit(k) {
    if (!this.entering) {
      this.entry = "";
      this.entering = true;
      if (this.after === "result") {
        // Keying after = starts a new sum; the old answer stays on the wheels until it's replaced.
        this.pending = null;
        this.expression = "";
        this.after = null;
      }
    }
    const count = this.entry.replace(".", "").length;
    if (count >= SETTING) { this.status = "All ten setting wheels are used"; return; }
    if (this.entry === "0" && k === "0") return;
    this.entry = this.entry === "0" ? k : this.entry + k;
    this.applyEntry();
  }

  keyPoint() {
    if (!this.entering) {
      this.entry = "0";
      this.entering = true;
      if (this.after === "result") { this.pending = null; this.expression = ""; this.after = null; }
    }
    if (!this.entry.includes(".")) this.entry = (this.entry || "0") + ".";
    this.applyEntry();
  }

  keySign() {
    if (this.entering || this.pending) {
      this.entryNeg = !this.entryNeg;
      if (this.entering) {
        const neg = this.entryNeg;
        this.mutate("set", { why: "sign" }, (r) => { r.sNeg = neg; });
        this.status = "Setting " + settingReading(this.r);
      } else this.status = (this.entryNeg ? "Next number is negative" : "Next number is positive");
    } else {
      this.mutate("complement", { why: "sign" }, (r) => { r.flag = !r.flag; });
    }
  }

  applyEntry() {
    const [whole, frac = ""] = this.entry.split(".");
    const text = whole + frac;
    const digits = zeros(SETTING);
    [...text].reverse().forEach((ch, i) => { digits[i] = Number(ch); });
    this.setSetting(digits, frac.length, this.entryNeg, "key");
    this.status = "Setting " + settingReading(this.r);
  }

  keyOperator(op) {
    // A second operator in a row is a change of mind, not a second step.
    if (this.pending && !this.entering) this.expression = this.expression.replace(/ [+\u2212\u00d7\u00f7]$/, "");
    if (this.entering || !this.pending) {
      if (this.pending && this.entering) {
        const pendingOp = this.pending;
        this.addExpression(settingReading(this.r));
        this.applyPending(pendingOp);
      } else if (this.entering) {
        this.expression = settingReading(this.r);
        this.loadSettingToAccum();
      } else if (this.after === "result") {
        this.expression = reading(this.r);
      }
    }
    if (this.locked) return;
    this.pending = op;
    this.entering = false;
    this.entryNeg = false;
    this.after = null;
    if (op === "*" || op === "/") {
      this.left = this.captureAccumAsLeft();
      if (!this.left) return;
    }
    this.expression = this.expression + " " + OP_SYMBOL[op];
    this.status = this.expression.trim();
  }

  addExpression(text) { this.expression = (this.expression + " " + text).trim(); }

  applyPending(op) {
    this.run(op);
    if ((op === "*" || op === "/") && !this.locked) this.after = "applied";
  }

  keyEquals() {
    if (this.pending && this.entering) {
      const op = this.pending;
      this.addExpression(settingReading(this.r));
      this.applyPending(op);
      if (this.locked) return;
      this.pending = null;
      this.entering = false;
      this.entryNeg = false;
      this.after = "result";
      this.expression = this.expression + " =";
      this.status = this.expression;
    } else if (this.entering) {
      this.expression = settingReading(this.r) + " =";
      this.loadSettingToAccum();
      this.entering = false;
      this.entryNeg = false;
      this.after = "result";
      this.status = this.expression;
    } else if (this.pending) {
      // "5 × =" and friends: use the number already on the wheels again.
      const op = this.pending;
      const held = this.captureAccumAsLeft();
      if (held) {
        this.setSetting(held.digits, held.dec, held.neg, "repeat");
        this.entryNeg = false;
        this.addExpression(settingReading(this.r));
        this.applyPending(op);
        this.pending = null;
        this.after = "result";
        this.expression += " =";
        this.status = this.expression;
      }
    }
  }

  keyClearEntry() {
    this.clearSetting();
    this.entry = "";
    this.entryNeg = false;
    this.status = "Setting cleared";
  }

  keyClearAll() {
    this.locked = null;
    this.clearSetting();
    this.clearAccum();
    this.clearCounter();
    this.shiftTo(0);
    this.mutate("mark", {}, (r) => { r.aDec = ADD_DEC; r.readFrom = "a"; r.cDec = 0; r.flag = false; });
    this.entry = ""; this.entering = false; this.pending = null; this.left = null;
    this.entryNeg = false; this.expression = ""; this.after = null;
    this.lastRun = null;
    this.status = "Ready";
  }

  // ---- hands on the machine: crank and carriage directly ----
  manualShift(by) {
    const to = this.r.pos + by;
    if (to < 0 || to > MAX_POS) return;
    this.shiftTo(to);
    this.status = "Carriage at position " + to;
  }

  afterManual() {
    this.entering = false;
    this.pending = null;
    this.after = "result";
    this.expression = "";
  }

  // The turn a hand on the crank would make, without making it, so the handle can scrub it.
  previewTurn(dir) {
    if (this.locked) return null;
    const clone = copy(this.r);
    readyForHand(clone);
    return turnOnce(clone, clone.flag ? -dir : dir, dir, dir);
  }

  // A hand turn of the crank. The player scrubs the returned step directly with the handle.
  crank(dir) {
    this.steps = [];
    if (this.locked) return null;
    readyForHand(this.r);
    // On a negative number a forward turn takes away from the magnitude, while the handle still goes the way it's pushed.
    return this.afterCrank(this.turn(this.r.flag ? -dir : dir, dir, dir));
  }

  afterCrank(step) {
    const follow = [];
    if (step.out === -1) {
      follow.push(this.mutate("bell", { why: "negative" }, () => {}));
      follow.push(this.mutate("complement", {}, (r) => {
        const to = tensComplement(r.a);
        setWheels(r.a, r.aw, to);
        r.flag = !r.flag;
      }));
    } else if (step.out === 1) {
      follow.push(this.mutate("bell", { why: "overflow" }, () => {}));
      this.jam("Overflow: the top wheel rolled past 9. Press AC to go on.");
    }
    if (!this.locked) this.status = "Hand turn " + (step.crankDir > 0 ? "+" : "−");
    this.afterManual();
    this.lastRun = { turns: 1, steps: 1 };
    return { step, follow };
  }
}

// A hand on the crank works on the accumulator, whatever register last held the answer.
function readyForHand(r) {
  if (r.readFrom === "c") r.flag = false;
  r.readFrom = "a";
  // On empty wheels the decimal marker takes its place from the first number turned in.
  if (isZero(r.a)) r.aDec = r.sDec + r.pos;
}

function tensComplement(d) {
  const out = [];
  let borrow = true;
  for (let i = 0; i < d.length; i++) {
    if (borrow) {
      if (d[i] === 0) out.push(0);
      else { out.push(10 - d[i]); borrow = false; }
    } else out.push(9 - d[i]);
  }
  return out;
}

export { digitOf };
