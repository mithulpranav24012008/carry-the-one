// The scientific calculator the machine turns into. Unlike the mechanical side, this one really is
// floating point: it takes a whole expression, like the pocket electronics that ended the line.

export const MEMORY_LIMIT = 1e99;
const MODES = ["DEG", "RAD", "GRAD"];
const TO_RAD = { DEG: Math.PI / 180, RAD: 1, GRAD: Math.PI / 200 };

// What a key does once 2nd has been pressed.
export const SECOND = { sin: "asin", cos: "acos", tan: "atan", ln: "exp", log: "pow10", sqrt: "cbrt", pow: "root", sq: "cube", inv: "abs", fact: "ran" };

const FUNCTIONS = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "exp", "pow10", "sqrt", "cbrt", "abs"]);
const POSTFIX = new Set(["sq", "cube", "inv", "fact", "%"]);
const BINARY = new Set(["+", "-", "*", "/", "pow", "root"]);
const CONSTANTS = new Set(["pi", "e", "Ans", "M"]);

const SHOW = {
  "+": "+", "-": "−", "*": "×", "/": "÷", pow: "^", root: "ʸ√", neg: "−",
  sq: "²", cube: "³", inv: "⁻¹", fact: "!", "%": "%", pi: "π", e: "e", Ans: "Ans", M: "M", "(": "(", ")": ")",
  sin: "sin(", cos: "cos(", tan: "tan(", asin: "sin⁻¹(", acos: "cos⁻¹(", atan: "tan⁻¹(",
  ln: "ln(", log: "log(", exp: "e^(", pow10: "10^(", sqrt: "√(", cbrt: "∛(", abs: "Abs(",
};

class MathError extends Error {}
class SyntaxFault extends Error {}

const isNumber = (atom) => /^[0-9.]/.test(atom);

export function formatNumber(value) {
  if (!Number.isFinite(value)) throw new MathError();
  if (value === 0) return "0";
  // Twelve significant digits inside, ten on show: the guard digits hide binary rounding like 0.1 + 0.2.
  const clean = Number(value.toPrecision(12));
  if (clean === 0) return "0";
  const size = Math.abs(clean);
  let text;
  if (size >= 1e10 || size < 1e-9) {
    const [m, x] = clean.toExponential(9).split("e");
    text = m.replace(/\.?0+$/, "") + "E" + x.replace("+", "");
  } else {
    text = String(Number(clean.toPrecision(10)));
  }
  return text.replaceAll("-", "−");
}

function evaluate(atoms, env) {
  let i = 0;
  const peek = () => atoms[i];
  const startsValue = (a) => a !== undefined && (isNumber(a) || CONSTANTS.has(a) || FUNCTIONS.has(a) || a === "(");

  const trig = (fn, x) => {
    const y = fn(x * TO_RAD[env.mode]);
    return Math.abs(y) < 1e-14 ? 0 : y;
  };
  const inverse = (fn, x) => {
    if (fn !== Math.atan && Math.abs(x) > 1) throw new MathError();
    return fn(x) / TO_RAD[env.mode];
  };
  const CALL = {
    sin: (x) => trig(Math.sin, x),
    cos: (x) => trig(Math.cos, x),
    tan: (x) => {
      // Where cos is zero, tan has no value; floating point would otherwise report a huge number.
      if (Math.abs(trig(Math.cos, x)) === 0) throw new MathError();
      return trig(Math.tan, x);
    },
    asin: (x) => inverse(Math.asin, x),
    acos: (x) => inverse(Math.acos, x),
    atan: (x) => inverse(Math.atan, x),
    ln: (x) => { if (x <= 0) throw new MathError(); return Math.log(x); },
    log: (x) => { if (x <= 0) throw new MathError(); return Math.log10(x); },
    exp: (x) => Math.exp(x),
    pow10: (x) => 10 ** x,
    sqrt: (x) => { if (x < 0) throw new MathError(); return Math.sqrt(x); },
    cbrt: (x) => Math.cbrt(x),
    abs: (x) => Math.abs(x),
  };

  function expr() {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = atoms[i++];
      const right = term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function term() {
    let left = unary();
    for (;;) {
      const a = peek();
      if (a === "*" || a === "/") {
        i++;
        const right = unary();
        if (a === "/" && right === 0) throw new MathError();
        left = a === "*" ? left * right : left / right;
      } else if (startsValue(a)) {
        left *= unary(); // 2π, 3(4), (2)(3)
      } else return left;
    }
  }
  function unary() {
    if (peek() === "neg" || peek() === "-") { i++; return -unary(); }
    if (peek() === "+") { i++; return unary(); }
    return power();
  }
  function power() {
    const base = postfix();
    if (peek() === "pow") {
      i++;
      const y = unary(); // right associative, and -2^2 is -4 because unary sits above this
      const v = base ** y;
      if (Number.isNaN(v)) throw new MathError();
      return v;
    }
    if (peek() === "root") {
      i++;
      const n = unary(); // x ʸ√ y: the y-th root of x
      if (n === 0) throw new MathError();
      if (base < 0) {
        if (Number.isInteger(n) && Math.abs(n % 2) === 1) return -((-base) ** (1 / n));
        throw new MathError();
      }
      return base ** (1 / n);
    }
    return base;
  }
  function postfix() {
    let v = primary();
    while (POSTFIX.has(peek())) {
      const p = atoms[i++];
      if (p === "sq") v *= v;
      else if (p === "cube") v = v * v * v;
      else if (p === "%") v /= 100;
      else if (p === "inv") {
        if (v === 0) throw new MathError();
        v = 1 / v;
      } else {
        if (!Number.isInteger(v) || v < 0 || v > 170) throw new MathError();
        let f = 1;
        for (let n = 2; n <= v; n++) f *= n;
        v = f;
      }
    }
    return v;
  }
  function primary() {
    const a = atoms[i];
    if (a === undefined) throw new SyntaxFault();
    if (isNumber(a)) {
      i++;
      if (!/^(\d+\.?\d*|\.\d+)(E-?\d+)?$/.test(a)) throw new SyntaxFault();
      return Number(a);
    }
    if (a === "pi") { i++; return Math.PI; }
    if (a === "e") { i++; return Math.E; }
    if (a === "Ans") { i++; return env.ans; }
    if (a === "M") { i++; return env.memory; }
    if (a === "(" || FUNCTIONS.has(a)) {
      i++;
      const inner = expr();
      if (peek() === ")") i++;
      else if (peek() !== undefined) throw new SyntaxFault();
      return a === "(" ? inner : CALL[a](inner);
    }
    throw new SyntaxFault();
  }

  const value = expr();
  if (i < atoms.length) throw new SyntaxFault();
  if (!Number.isFinite(value)) throw new MathError();
  return value;
}

export class Scientific {
  constructor({ random = Math.random } = {}) {
    this.atoms = [];
    this.ans = 0;
    this.memory = 0;
    this.mode = "DEG";
    this.second = false;
    this.result = "0";
    this.error = null;
    this.done = false; // the last thing pressed was =
    this.random = random;
  }

  // What the main line of the display should say right now.
  get display() {
    if (this.error) return this.error;
    if (this.done || !this.atoms.length) return this.result;
    return this.expression;
  }

  get expression() {
    return this.atoms.map((a) => (isNumber(a) ? a : SHOW[a] ?? a)).join("");
  }

  // Finishing a sum: what the next key does depends on what kind of key it is.
  fresh(kind) {
    if (this.error) { this.atoms = []; this.error = null; this.result = "0"; }
    if (!this.done) return;
    this.done = false;
    this.atoms = kind === "continue" ? ["Ans"] : [];
  }

  calculate() {
    if (!this.atoms.length) return this.ans;
    return evaluate(this.atoms, { ans: this.ans, memory: this.memory, mode: this.mode });
  }

  fail(error) {
    this.error = error instanceof MathError ? "Math ERROR" : "Syntax ERROR";
    this.result = this.error;
    this.done = false;
  }

  press(key) {
    const name = this.second && SECOND[key] ? SECOND[key] : key;
    if (key !== "2nd") this.second = false;
    if (/^[0-9]$/.test(name) || name === ".") return this.digit(name);
    if (BINARY.has(name)) { this.fresh("continue"); this.atoms.push(name); return; }
    if (POSTFIX.has(name)) { this.fresh("continue"); this.atoms.push(name); return; }
    if (FUNCTIONS.has(name)) { this.fresh("new"); this.atoms.push(name); return; }
    if (CONSTANTS.has(name)) { this.fresh("new"); this.atoms.push(name); return; }
    if (name === "(") { this.fresh("new"); this.atoms.push("("); return; }
    if (name === ")") { this.fresh("continue"); this.atoms.push(")"); return; }
    switch (name) {
      case "2nd": this.second = !this.second; return;
      case "drg": this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]; return;
      case "ran": this.fresh("new"); this.atoms.push(this.random().toFixed(3)); return;
      case "EE": return this.exponent();
      case "+/-": return this.sign();
      case "DEL": return this.remove();
      case "AC":
        this.atoms = []; this.result = "0"; this.error = null; this.done = false;
        return;
      case "=": return this.equals();
      case "mc": this.memory = 0; return;
      case "mr": this.fresh("new"); this.atoms.push("M"); return;
      case "m+": return this.store(1);
      case "m-": return this.store(-1);
      default:
    }
  }

  digit(ch) {
    this.fresh("new");
    const last = this.atoms[this.atoms.length - 1];
    if (last !== undefined && isNumber(last)) {
      if (ch === "." && /[.E]/.test(last)) return;
      this.atoms[this.atoms.length - 1] = last + ch;
    } else this.atoms.push(ch === "." ? "0." : ch);
  }

  exponent() {
    this.fresh("new");
    const last = this.atoms[this.atoms.length - 1];
    if (last !== undefined && isNumber(last)) {
      if (!last.includes("E")) this.atoms[this.atoms.length - 1] = last + "E";
    } else this.atoms.push("1E");
  }

  sign() {
    this.fresh("continue");
    const at = this.atoms.length - 1;
    const last = this.atoms[at];
    if (last !== undefined && isNumber(last) && /E-?\d*$/.test(last)) {
      // In the exponent, ± belongs to the exponent.
      this.atoms[at] = last.includes("E-") ? last.replace("E-", "E") : last.replace("E", "E-");
      return;
    }
    if (last !== undefined && (isNumber(last) || CONSTANTS.has(last))) {
      if (this.atoms[at - 1] === "neg") this.atoms.splice(at - 1, 1);
      else this.atoms.splice(at, 0, "neg");
      return;
    }
    if (last === "neg") this.atoms.pop();
    else this.atoms.push("neg");
  }

  remove() {
    if (this.error) { this.error = null; this.result = "0"; return; }
    if (this.done) { this.done = false; return; }
    const last = this.atoms[this.atoms.length - 1];
    if (last === undefined) return;
    if (isNumber(last) && last.length > 1) this.atoms[this.atoms.length - 1] = last.slice(0, -1);
    else this.atoms.pop();
  }

  equals() {
    if (this.error) { this.fresh("new"); return; }
    if (this.done || !this.atoms.length) return;
    try {
      const value = this.calculate();
      this.result = formatNumber(value);
      this.ans = value;
      this.done = true;
    } catch (error) {
      this.fail(error);
    }
  }

  store(direction) {
    try {
      const value = this.calculate();
      const next = this.memory + direction * value;
      if (!Number.isFinite(next) || Math.abs(next) > MEMORY_LIMIT) throw new MathError();
      this.memory = next;
      this.ans = value;
      this.result = formatNumber(value);
      this.done = true;
    } catch (error) {
      this.fail(error);
    }
  }
}
