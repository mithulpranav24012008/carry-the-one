import * as THREE from "three";
import { Machine, reading, settingReading, counterReading } from "./machine/model.js";
import { Scientific, formatNumber } from "./machine/sci.js";
import { FACE } from "./machine/morph.js";
import { Player, poseOf } from "./machine/player.js";
import { buildMachine, buildStage } from "./machine/scene.js";
import { Sound } from "./machine/sound.js";
import { mountFigures } from "./figures.js";

const still = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// A critically damped or slightly bouncy spring, in Apple's terms: response and damping ratio.
function spring(state, target, dt, response = 0.3, ratio = 1) {
  const w = (Math.PI * 2) / response;
  const k = w * w, c = 2 * ratio * w;
  const steps = Math.ceil(dt / (1 / 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.v += (k * (target - state.x) - c * state.v) * h;
    state.x += state.v * h;
  }
  return state.x;
}
// Soft edge: the further past the limit, the less it follows.
const rubber = (over, size = 1, c = 0.55) => (over * size * c) / (size + c * Math.abs(over));

// ---- the machine, loaded with a sum so the page opens working ----
const machine = new Machine();
for (const k of "1234*56=") machine.press(k);
const sound = new Sound();
// The sound sheet is 0.8 MB, so it waits until the browser is idle rather than competing with the first paint.
if ('requestIdleCallback' in window) requestIdleCallback(() => sound.prepare(), { timeout: 3000 });
else setTimeout(() => sound.prepare(), 1500);

// ---- the other calculator it can become ----
const sci = new Scientific();
const MORPH_SECONDS = 6.4;
const form = { m: 0, target: 0 };
const isSci = () => form.m === 1 && form.target === 1;
const isMech = () => form.m === 0 && form.target === 0;
// The keys both calculators share keep their place on the machine but mean something new.
const SCI_MEANS = { "shift-left": "(", "shift-right": ")", "turn+": "Ans", "turn-": "EE", C: "DEL" };
const SCI_KEYBOARD = {
  "(": "shift-left", ")": "shift-right", Backspace: "C", Delete: "C", Escape: "AC", Enter: "=", "=": "=",
  s: "sin", c: "cos", t: "tan", l: "log", n: "ln", r: "sqrt", p: "pi", e: "e", a: "turn+", "^": "pow", "!": "fact", "%": "%", x: "*", X: "*", "\u00d7": "*", "\u00f7": "/", "\u2212": "-",
};

const readout = {
  value: $("#r-value"), expr: $("#r-expr"), set: $("#r-set"), count: $("#r-count"), turns: $("#r-turns"), live: $("#r-live"),
  show(registers) {
    const text = reading(registers);
    this.value.textContent = text;
    this.value.style.setProperty("--len", text.length);
    this.set.textContent = settingReading(registers);
    this.count.textContent = counterReading(registers);
  },
  message() {
    this.expr.textContent = machine.status === "Ready" ? "Ready" : machine.status;
    this.expr.classList.toggle("jam", !!machine.locked);
    const run = machine.lastRun;
    this.turns.textContent = run ? `${run.turns} crank ${run.turns === 1 ? "turn" : "turns"}` : "0 crank turns";
  },
};

const tableLabels = [...document.querySelectorAll(".r-table dt")];
function showScientific() {
  const main = sci.display;
  readout.value.textContent = main;
  readout.value.style.setProperty("--len", Math.max(6, main.length));
  readout.expr.textContent = sci.done ? `${sci.expression} =` : sci.error ? "Press any key to go on" : "Type a sum, then =";
  readout.expr.classList.toggle("jam", !!sci.error);
  readout.set.textContent = sci.mode;
  readout.count.textContent = sci.memory ? formatNumber(sci.memory) : "0";
  readout.turns.textContent = formatNumber(sci.ans);
  readout.live.textContent = sci.done || sci.error ? `Result ${main}` : "";
  const flags = [sci.mode, sci.second ? "2nd" : "", sci.memory ? "M" : ""].filter(Boolean).join("   ");
  screen3d?.({ expression: sci.done ? sci.expression : "", main: main || "0", flags });
}
function showMechanical() {
  readout.show(machine.r);
  readout.message();
}
function labelReadout(scientific) {
  ["Setting", "Counter", "Last run"].forEach((text, i) => { tableLabels[i].textContent = scientific ? ["Angle", "Memory", "Ans"][i] : text; });
}
let screen3d = null;
let second3d = null;

const player = new Player(machine.r, {
  onStep(step, dur) {
    if (step.after) readout.show(step.after);
    sound.step(step, dur);
    wake();
  },
  onSettle() {
    readout.show(machine.r);
    readout.message();
    readout.live.textContent = `${machine.status}. Reading ${reading(machine.r)}.`;
  },
});

let wake = () => {};
let settleHand = () => {};
let board3d = null;

function pressKey(key) {
  sound.unlock();
  if (form.m !== form.target || (form.m !== 0 && form.m !== 1)) return;
  if (isSci()) {
    if (!inDemo) cancelDemo();
    const wasSecond = sci.second;
    sci.press(SCI_MEANS[key] ?? key);
    if (sci.second !== wasSecond) second3d?.(sci.second);
    showScientific();
    board3d?.(key);
    wake();
    return;
  }
  if (!inDemo) cancelDemo();
  settleHand();
  if (key === "turn+" || key === "turn-") { handTurn(key === "turn+" ? 1 : -1); return; }
  const steps = machine.press(key);
  player.enqueue(steps);
  if (still.matches) player.flush();
  readout.message();
  if (!steps.length && player.queue.length === 0) readout.show(machine.r);
  wake();
}

// ---- the DOM keypad: real buttons, always usable, the thumb's way in on a phone ----
const KEYBOARD = { Enter: "=", "=": "=", Escape: "AC", Delete: "C", c: "C", C: "C", ArrowLeft: "shift-left", ArrowRight: "shift-right", x: "*", X: "*", "×": "*", "÷": "/", "−": "-", n: "+/-" };
const keyDown = new Map();
function keyOf(event) {
  if (/^[0-9.+\-*/]$/.test(event.key)) return event.key;
  if (form.target === 1) return SCI_KEYBOARD[event.key];
  return KEYBOARD[event.key];
}
function depress(key, down) {
  if (!!keyDown.get(key) !== down) { sound.unlock(); sound.key(down); }
  keyDown.set(key, down);
  wake();
}

function tap(key, ms = 110) {
  depress(key, true);
  pressKey(key);
  setTimeout(() => depress(key, false), ms);
}

document.querySelectorAll("[data-key]").forEach((button) => {
  const key = button.dataset.key;
  button.addEventListener("pointerdown", () => depress(key, true));
  ["pointerup", "pointerleave", "pointercancel"].forEach((n) => button.addEventListener(n, () => depress(key, false)));
  button.addEventListener("click", () => pressKey(key));
});
document.querySelectorAll("[data-crank]").forEach((button) => {
  button.addEventListener("click", () => handTurn(Number(button.dataset.crank)));
});

function handTurn(dir) {
  if (!isMech()) return;
  sound.unlock();
  cancelDemo();
  settleHand();
  player.flush();
  const step = machine.previewTurn(dir);
  if (!step) { readout.message(); return; }
  const made = machine.crank(dir);
  player.enqueue([made.step, ...made.follow]);
  if (still.matches) player.flush();
  readout.message();
  wake();
}

let partKeys = null;
const inField = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
const heroInView = { value: true };
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || inField(e.target)) return;
  if (!heroInView.value) return;
  if (partKeys?.(e)) { e.preventDefault(); return; }
  const key = keyOf(e);
  if (!key) return;
  if (e.target?.closest?.("button, a") && (e.key === "Enter" || e.key === " ")) return;
  e.preventDefault();
  if (e.repeat) return;
  depress(key, true);
  pressKey(key);
});
addEventListener("keyup", (e) => { const key = keyOf(e); if (key) depress(key, false); });
// A key released while the window was elsewhere would otherwise stay down.
addEventListener("blur", () => { for (const [key, down] of keyDown) if (down) depress(key, false); });
// A button clicked with the mouse shouldn't keep focus, or the next Enter presses it again instead of =.
document.addEventListener("click", (e) => { if (e.detail > 0) e.target.closest?.("button")?.blur(); });

// ---- running a sum for someone ----
let demoTimers = [];
let inDemo = false;
// Your own press takes over: the rest of a demo must not type into your sum.
function cancelDemo() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
}
const demoTap = (key) => { inDemo = true; tap(key); inDemo = false; };
const ALIAS = Object.fromEntries(Object.entries(SCI_MEANS).map(([key, meaning]) => [meaning, key]));
function runSum(text) {
  cancelDemo();
  const gap = still.matches ? 0 : 170;
  demoTap("AC");
  // A sum is either plain characters, or for the scientific keys, names separated by spaces.
  const keys = text.includes(" ") ? text.split(" ").flatMap((k) => (/^[0-9]+$/.test(k) ? [...k] : [ALIAS[k] ?? k])) : [...text];
  keys.forEach((k, i) => demoTimers.push(setTimeout(() => demoTap(k), 500 + i * gap)));
}
document.querySelectorAll("[data-run]").forEach((button) => {
  button.addEventListener("click", () => {
    sound.unlock();
    const hero = $("#machine");
    const far = hero.getBoundingClientRect().bottom < innerHeight * 0.4;
    if (far) hero.scrollIntoView({ behavior: still.matches ? "auto" : "smooth" });
    cancelDemo();
    const sum = (form.target === 1 && button.dataset.runSci) || button.dataset.run;
    demoTimers.push(setTimeout(() => runSum(sum), far && !still.matches ? 700 : 0));
  });
});

// ---- cover ----
const coverState = { x: 0, v: 0, target: 0 };
const coverButtons = document.querySelectorAll("[data-cover]");
let startMorph = null;
const morphButton = $("#morph");
const runLabel = $("#run-main");
const hint = $(".hint");
function showHint() {
  if (coverState.target === 1) hint.textContent = form.target === 1 ? "Every part is out. Click one to see it alone, or type a sum and watch the signal run across the board." : "Every part is out. Click one to see it alone, or type a sum and watch it all still turn.";
  else if (form.target !== 1) hint.textContent = "Press the keys or type. Drag the crank handle. Drag anywhere else to turn it right round.";
  else hint.textContent = "Press the keys or type. Drag anywhere to turn it right round.";
}
// The cover stays shut while the machine is changing, because the parts it would lift are on the move.
let closingFirst = false;
const lockCover = (locked) => coverButtons.forEach((b) => { b.disabled = locked; });
// Which calculator you are on decides the buttons, the keypad and what the readout's labels mean.
function dressFor(scientific) {
  document.documentElement.classList.toggle("is-sci", scientific);
  morphButton.textContent = scientific ? "Mechanical Calculator" : "Scientific Calculator";
  morphButton.setAttribute("aria-pressed", String(scientific));
  runLabel.textContent = scientific ? runLabel.dataset.sciLabel : runLabel.dataset.mechLabel;
  showHint();
  labelReadout(scientific);
  if (scientific) showScientific(); else showMechanical();
}
morphButton.addEventListener("click", () => {
  if (closingFirst) return;
  sound.unlock();
  cancelDemo();
  settleHand();
  player.flush();
  for (const [key, down] of keyDown) if (down) depress(key, false);
  const to = form.target === 1 ? 0 : 1;
  closingFirst = coverState.target === 1;
  lockCover(true);
  if (closingFirst) setCover(false);
  const change = () => {
    // The parts have to be home before anything can turn into anything else.
    if (closingFirst && coverState.x > 0.01 && startMorph) { setTimeout(change, 50); return; }
    closingFirst = false;
    form.target = to;
    dressFor(to === 1);
    if (startMorph) startMorph(to);
    else form.m = to; // no 3D stage: just change over
    lockCover(form.m !== form.target);
  };
  change();
});
let coverMoved = null;
function setCover(open) {
  coverState.target = open ? 1 : 0;
  coverMoved?.(open);
  coverButtons.forEach((b) => {
    b.textContent = open ? "Close the cover" : "Lift the cover";
    b.setAttribute("aria-pressed", String(open));
  });
  if (still.matches) coverState.x = coverState.target;
  showHint();
  wake();
}
coverButtons.forEach((b) => b.addEventListener("click", () => {
  const far = $("#machine").getBoundingClientRect().bottom < innerHeight * 0.4;
  if (far) $("#machine").scrollIntoView({ behavior: still.matches ? "auto" : "smooth" });
  setCover(coverState.target === 0);
}));

const soundButton = $("#sound");
soundButton?.addEventListener("click", () => {
  sound.unlock();
  sound.enabled = !sound.enabled;
  soundButton.textContent = sound.enabled ? "Sound on" : "Sound off";
  soundButton.setAttribute("aria-pressed", String(sound.enabled));
});

readout.show(machine.r);
readout.message();

// ---- 3D ----
function start3D() {
  const canvas = $("#stage");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const { scene, floor } = buildStage(renderer);
  // The floor is only a place for a shadow to land.
  floor.material.transparent = true;
  const built = buildMachine();
  scene.add(built.root);
  document.fonts?.load?.('900 64px "Epilogue"').then(() => { built.redrawLabels(); wake(); });

  const camera = new THREE.PerspectiveCamera(24, 1, 1, 400);
  const HOME_TARGET = new THREE.Vector3(0, 5.1, 1.2);
  const SCI_TARGET = new THREE.Vector3(0, 15.8, 0.5);
  const target = HOME_TARGET.clone();
  const MECH_POSE = { az: 0.42, el: 0.68 }, SCI_POSE = { az: 0.16, el: 0.14 };
  // Where to stand to see each calculator in pieces: from the side, so the layers don't hide each other.
  const PARTS_POSE = { mech: { az: 0.72, el: 0.3 }, sci: { az: 1.02, el: 0.16 } };
  const view = { az: { x: MECH_POSE.az, v: 0 }, el: { x: MECH_POSE.el, v: 0 }, azTo: MECH_POSE.az, elTo: MECH_POSE.el, dist: 90, zoom: 1, mech: { ...MECH_POSE }, sci: { ...SCI_POSE } };
  // The view has no limits, so any angle has endless names. These pick the name nearest to where the camera is, so it takes the short way there.
  const TURN = Math.PI * 2;
  const nearest = (angle, from) => angle + Math.round((from - angle) / TURN) * TURN;
  const lookAtPose = (pose) => {
    view.azTo = nearest(pose.az, view.azTo);
    view.elTo = nearest(pose.el, view.elTo);
    if (still.matches) { view.az.x = view.azTo; view.el.x = view.elTo; }
    wake();
  };

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const w = box.width, h = box.height;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 1.75 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const wide = w >= 900;
    // Distance that fits the machine's width, leaving the headline its corner on a desk screen.
    const spanW = wide ? 60 : 46, spanH = wide ? 42 : 34;
    const tan = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.dist = Math.max(spanW / camera.aspect, spanH) / tan;
    view.distSci = Math.max((wide ? 40 : 24) / camera.aspect, 44) / tan;
    view.w = w; view.h = h; view.wide = wide;
    view.vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (!wide) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    wake();
  }
  new ResizeObserver(resize).observe(canvas.parentElement);

  // ---- pointer: keys and levers, the crank by hand, everything else turns the view ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pick = (e) => {
    const b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (parts.open) return null;
    // Mid-transformation nothing can be pressed, and each form only offers its own controls.
    if (form.m !== form.target || (form.m !== 0 && form.m !== 1)) return null;
    const allowed = isSci() ? "sci" : "mech";
    for (const hit of ray.intersectObjects(built.hits, false)) {
      const action = hit.object.userData.action;
      if (action.mode && action.mode !== allowed) continue;
      return action;
    }
    return null;
  };
  let drag = null;
  const fingers = new Map();
  let hand = null; // a hand on the crank
  let hover = null;
  const project = (v) => {
    const p = v.clone().project(camera);
    const b = canvas.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * b.width, y: ((1 - p.y) / 2) * b.height };
  };
  // Where the handle sits on screen at a given crank angle.
  const handleAt = (angle) => project(new THREE.Vector3(
    built.crankHome.x + 1.8,
    built.crankHome.y + Math.cos(angle) * built.crankRadius,
    built.crankHome.z + Math.sin(angle) * built.crankRadius,
  ));
  // The angle whose handle position is nearest the pointer, walked from the current angle so it never jumps across the circle.
  function angleUnderPointer(px, py, from) {
    let a = from;
    for (let i = 0; i < 5; i++) {
      const here = handleAt(a), next = handleAt(a + 0.01);
      const jx = (next.x - here.x) / 0.01, jy = (next.y - here.y) / 0.01;
      const step = ((px - here.x) * jx + (py - here.y) * jy) / Math.max(40, jx * jx + jy * jy);
      a += clamp(step, -0.5, 0.5);
    }
    return a;
  }

  settleHand = () => {
    if (!hand) return;
    if (!hand.held && hand.to === 1 && hand.step) commitHand();
    else player.pose = poseOf(machine.r);
    hand = null;
    canvas.style.cursor = "";
    wake();
  };

  const span = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  canvas.addEventListener("pointerdown", (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A second finger turns the gesture into a pinch, whatever the first one was doing.
    if (fingers.size === 2) {
      if (drag?.type === "key") depress(drag.key, false);
      hover = null;
      drag = { type: "pinch", from: span(), zoom: view.zoom };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (!e.isPrimary) return;
    sound.unlock();
    const action = pick(e);
    if (action?.type === "key" && e.pointerType === "touch") {
      // A finger on a key may be starting a scroll, so it only counts when it lifts in place.
      drag = { type: "tap", key: action.key, x: e.clientX, y: e.clientY };
      hover = action.key;
      wake();
      return;
    }
    if (action?.type === "key") {
      depress(action.key, true);
      pressKey(action.key);
      drag = { type: "key", key: action.key };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (action?.type === "crank") {
      cancelDemo();
      settleHand();
      player.flush();
      player.pose = poseOf(machine.r);
      const angle = player.pose.crank * Math.PI * 2;
      const box = canvas.getBoundingClientRect();
      const at = handleAt(angle);
      // Keep the offset from where it was grabbed.
      hand = { phase: 0, dir: 0, step: null, base: player.pose.crank, angle, ox: e.clientX - box.left - at.x, oy: e.clientY - box.top - at.y, t: e.timeStamp, velocity: 0, held: true };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
      return;
    }
    startOrbit(e);
    canvas.setPointerCapture(e.pointerId);
  });

  // Past the top or bottom the machine is upside down, and turning has to follow the hand rather than the sum.
  const startOrbit = (e) => {
    drag = { type: "orbit", x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, flip: Math.cos(view.el.x) < 0 ? -1 : 1, still: true, vx: 0, vy: 0, t: e.timeStamp };
  };
  canvas.addEventListener("pointermove", (e) => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag?.type === "pinch") {
      if (fingers.size === 2) { view.zoom = clamp(drag.zoom * (drag.from / Math.max(1, span())), 0.25, 2.5); wake(); }
      return;
    }
    if (!e.isPrimary) return;
    if (drag?.type === "tap") {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) {
        hover = null;
        startOrbit(e);
      }
      return;
    }
    if (hand?.held) {
      const box = canvas.getBoundingClientRect();
      const next = angleUnderPointer(e.clientX - box.left - hand.ox, e.clientY - box.top - hand.oy, hand.angle);
      const dt = Math.max(1, e.timeStamp - hand.t) / 1000;
      hand.t = e.timeStamp;
      const dTurn = (next - hand.angle) / (Math.PI * 2);
      hand.angle = next;
      moveHand(dTurn);
      hand.velocity = hand.velocity * 0.6 + (dTurn / dt) * 0.4;
      return;
    }
    if (drag?.type === "orbit") {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) drag.still = false;
      view.azTo -= dx * 0.0052 * drag.flip;
      view.elTo += dy * 0.0042;
      const dt = Math.max(1, e.timeStamp - drag.t) / 1000;
      drag.t = e.timeStamp;
      drag.vx = drag.vx * 0.6 + (dx / dt) * 0.4;
      drag.vy = drag.vy * 0.6 + (dy / dt) * 0.4;
      parts.glow(null);
      wake();
      return;
    }
    if (e.pointerType === "mouse" && parts.open) {
      parts.hover(e);
      return;
    }
    if (e.pointerType === "mouse") {
      const action = pick(e);
      const name = action?.type === "key" ? action.key : null;
      if (name !== hover) { hover = name; wake(); }
      canvas.style.cursor = action ? (action.type === "crank" ? "grab" : "pointer") : "move";
    }
  });

  canvas.addEventListener("pointerleave", () => {
    parts.glow(null);
    if (hover !== null && drag?.type !== "tap") { hover = null; wake(); }
  });

  const end = (e) => {
    fingers.delete(e.pointerId);
    if (drag?.type === "pinch") {
      drag = null;
      return;
    }
    if (!e.isPrimary) return;
    if (drag?.type === "tap") {
      hover = null;
      if (e.type === "pointerup") tap(drag.key);
      wake();
    }
    if (hand?.held) {
      hand.held = false;
      canvas.style.cursor = "grab";
      // Momentum decides: a flick carries the handle over the top.
      const projected = hand.phase + hand.velocity * hand.dir * 0.16;
      hand.to = hand.step && projected > 0.5 ? 1 : 0;
      hand.spring = { x: hand.phase, v: hand.velocity * hand.dir };
      wake();
    }
    if (drag?.type === "key") depress(drag.key, false);
    if (drag?.type === "orbit") {
      if (drag.still && e.type === "pointerup") parts.click(e);
      // A flick keeps turning. An old sample means the hand had already stopped.
      else if (!still.matches && e.timeStamp - drag.t < 60) {
        view.azTo -= drag.vx * 0.0052 * drag.flip * 0.16;
        view.elTo += drag.vy * 0.0042 * 0.16;
      }
      wake();
    }
    drag = null;
    if (e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  function moveHand(dTurn) {
    const signed = hand.phase * (hand.dir || 1) + dTurn;
    let dir = signed === 0 ? hand.dir : Math.sign(signed);
    if (dir !== hand.dir) {
      hand.dir = dir;
      hand.step = dir ? machine.previewTurn(dir) : null;
    }
    if (!hand.step) {
      // A jammed machine gives a little and refuses.
      hand.phase = Math.abs(rubber(signed, 0.08));
      player.pose.crank = hand.base + hand.dir * hand.phase;
      wake();
      return;
    }
    hand.phase = Math.abs(signed);
    while (hand.phase >= 1) {
      commitHand();
      hand.phase -= 1;
    }
    if (hand.step) player.scrub(hand.step, hand.phase);
    sound.crankDrag(hand.phase);
    wake();
  }

  function commitHand() {
    const made = machine.crank(hand.dir);
    if (!made) return;
    player.pose = poseOf(made.step.after);
    readout.show(machine.r);
    readout.message();
    readout.live.textContent = `${machine.status}. Reading ${reading(machine.r)}.`;
    sound.home();
    // The hand may still be turning, so the bell and sign flag take effect at once rather than on a queue.
    for (const step of made.follow) sound.step(step, 0.2);
    if (made.follow.length) player.pose = poseOf(machine.r);
    hand.base = player.pose.crank;
    hand.step = machine.previewTurn(hand.dir);
  }

  // ---- seeing the parts: everything apart, then any one part by itself ----
  // Picks a camera distance that fits a sphere of this radius in what's left of the stage.
  view.aspectFit = () => {
    const width = view.wide ? 0.66 : 1;
    const shorter = Math.min(view.vTan, view.vTan * camera.aspect * width);
    return (radius) => Math.max(radius, 0.35) / Math.sin(Math.atan(shorter));
  };
  const panel = $("#inspect"), tip = $("#part-tip");
  const out = { count: $("#i-count"), name: $("#i-name"), note: $("#i-note"), size: $("#i-size"), material: $("#i-group"), select: $("#i-select"), prev: $("#i-prev"), next: $("#i-next"), back: $("#i-back") };
  const SOLO_LAYER = 2;
  scene.traverse((o) => { if (o.isLight) o.layers.enable(SOLO_LAYER); });
  ray.layers.enable(SOLO_LAYER);
  // Clears what's been drawn so far by a given amount. Fading the picture is what lets a part this size of model fade as one, without touching any material.
  const eraseScene = new THREE.Scene();
  const eraseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const eraser = new THREE.ShaderMaterial({
    uniforms: { amount: { value: 0 } },
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform float amount; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, amount); }",
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  eraseScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), eraser));
  const erase = (amount) => {
    eraser.uniforms.amount.value = amount;
    renderer.autoClear = false;
    renderer.render(eraseScene, eraseCamera);
    renderer.autoClear = true;
  };
  const parts = {
    open: false, list: [], bounds: null, part: null, shown: null, focus: new THREE.Vector3(), focusRadius: { x: 10, v: 0 },
    solo: { x: 0, v: 0 }, appear: { x: 1, v: 0 }, pose: null,
    get soloLevel() { return this.solo.x; },
    // Opening: works out the layout and fills in the list of every part.
    begin() {
      const form = isSci() ? "sci" : "mech";
      const made = built.pose.prepareParts();
      this.list = made.parts;
      this.bounds = made.bounds;
      this.open = true;
      this.pose = { az: view.azTo, el: view.elTo };
      out.select.replaceChildren();
      const all = new Option(`All ${this.list.length} parts`, "");
      out.select.add(all);
      let group = null, into = null;
      this.list.forEach((p, i) => {
        if (p.group !== group) {
          group = p.group;
          into = document.createElement("optgroup");
          into.label = group;
          out.select.append(into);
        }
        into.append(new Option(p.title, String(i)));
      });
      view.zoom = 1;
      lookAtPose(PARTS_POSE[form]);
      document.documentElement.classList.add("parts-open");
      panel.hidden = false;
      this.card();
    },
    end() {
      this.select(null);
      this.glow(null);
      this.open = false;
      view.zoom = 1;
      if (this.pose) lookAtPose(this.pose);
      document.documentElement.classList.remove("parts-open");
      panel.hidden = true;
    },
    card() {
      const p = this.part;
      panel.classList.toggle("solo", !!p);
      out.count.textContent = p ? `Part ${this.list.indexOf(p) + 1} of ${this.list.length}` : `${this.list.length} parts`;
      out.name.textContent = p ? p.title : isSci() ? "The scientific calculator, in pieces" : "The mechanical calculator, in pieces";
      out.note.textContent = p ? p.note : "Click any part to see it on its own, turn it right round, or go through them all with Previous and Next.";
      out.material.textContent = p ? p.group : "";
      out.size.textContent = p ? `${p.size} cm` : "";
      out.select.value = p ? String(this.list.indexOf(p)) : "";
      out.back.hidden = !p;
      readout.live.textContent = p ? `${p.title}. ${p.note}` : "";
    },
    select(p) {
      if (p === this.part) return;
      const switching = this.part && p;
      this.part = p;
      this.glow(null);
      if (switching && !still.matches) this.appear.x = 0.15;
      if (p) {
        // From all the parts to one, the camera sets out from the middle of them; between parts it travels.
        if (!switching) this.focus.copy(p.centre);
        this.goal = p;
      }
      if (!switching) this.focusRadius.x = p ? p.radius : this.focusRadius.x;
      this.card();
      if (still.matches) { this.solo.x = p ? 1 : 0; this.appear.x = 1; if (p) { this.focus.copy(p.centre); this.focusRadius.x = p.radius; } }
      this.hold(p);
      wake();
    },
    // Moves a part's meshes onto a layer of their own, so that they can be drawn separately from everything else.
    hold(p) {
      for (const m of this.shown?.meshes ?? []) m.layers.set(0);
      this.shown = p;
      for (const m of p?.meshes ?? []) m.layers.set(SOLO_LAYER);
    },
    step(by) {
      const i = this.part ? this.list.indexOf(this.part) : by > 0 ? -1 : 0;
      this.select(this.list[(i + by + this.list.length) % this.list.length]);
    },
    glow(p) {
      built.exploded.glow(p);
      if (!p) tip.hidden = true;
    },
    under(e) {
      const box = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return built.exploded.pick(ray, this.part ? [this.part] : this.list);
    },
    hover(e) {
      const p = this.part ? null : this.under(e);
      this.glow(p);
      canvas.style.cursor = p ? "pointer" : "move";
      if (!p) return;
      const box = canvas.getBoundingClientRect();
      tip.textContent = p.title;
      tip.hidden = false;
      tip.style.transform = `translate(${e.clientX - box.left + 14}px, ${e.clientY - box.top + 14}px)`;
      wake();
    },
    click(e) {
      if (!this.open) return;
      const p = this.under(e);
      // Clicking the empty stage around a part goes back to all of them.
      if (this.part) { if (!p) this.select(null); return; }
      if (p) this.select(p);
    },
    tick(dt) {
      let moving = false;
      if (Math.abs((this.part ? 1 : 0) - this.solo.x) > 0.001 || Math.abs(this.solo.v) > 0.01) { spring(this.solo, this.part ? 1 : 0, dt, 0.5, 1); moving = true; }
      else this.solo.x = this.part ? 1 : 0;
      if (this.appear.x < 0.999) { spring(this.appear, 1, dt, 0.3, 1); moving = true; }
      else this.appear.x = 1;
      if (this.part) {
        const k = 1 - Math.exp(-dt * 9);
        if (this.focus.distanceToSquared(this.part.centre) > 1e-5) { this.focus.lerp(this.part.centre, k); moving = true; }
        if (Math.abs(this.focusRadius.x - this.part.radius) > 1e-3) { this.focusRadius.x += (this.part.radius - this.focusRadius.x) * k; moving = true; }
      }
      return moving;
    },
    // Everything else, faded by the amount a part has taken over, and the chosen part on top of it.
    draw() {
      const level = this.solo.x;
      camera.layers.set(0);
      if (!this.shown) { renderer.render(scene, camera); return; }
      if (level < 0.995) {
        renderer.render(scene, camera);
        erase(level);
      } else renderer.clear();
      renderer.clearDepth();
      renderer.autoClear = false;
      camera.layers.set(SOLO_LAYER);
      renderer.render(scene, camera);
      renderer.autoClear = true;
      if (this.appear.x < 0.999) erase(1 - this.appear.x);
      camera.layers.set(0);
    },
  };
  coverMoved = (open) => {
    if (open && !parts.open) parts.begin();
    else if (!open && parts.open) parts.end();
  };
  out.select.addEventListener("change", () => parts.select(parts.list[Number(out.select.value)] ?? null));
  out.prev.addEventListener("click", () => parts.step(-1));
  out.next.addEventListener("click", () => parts.step(1));
  out.back.addEventListener("click", () => parts.select(null));
  partKeys = (e) => {
    if (!parts.open) return false;
    if (e.key === "ArrowRight") parts.step(1);
    else if (e.key === "ArrowLeft") parts.step(-1);
    else if (e.key === "Escape" && parts.part) parts.select(null);
    else return false;
    return true;
  };

  // ---- the named views, and zoom, which also serve anyone who can't drag ----
  const NAMED = { front: { az: 0, el: 0.1 }, back: { az: Math.PI, el: 0.1 }, left: { az: -Math.PI / 2, el: 0.1 }, right: { az: Math.PI / 2, el: 0.1 }, top: { az: 0, el: Math.PI / 2 }, under: { az: 0, el: -Math.PI / 2 } };
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => lookAtPose(NAMED[b.dataset.view])));
  document.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => { view.zoom = clamp(view.zoom * Number(b.dataset.zoom), 0.25, 2.5); wake(); }));
  canvas.addEventListener("wheel", (e) => {
    // A plain wheel still scrolls the page. Holding control, or pinching a trackpad, zooms.
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    view.zoom = clamp(view.zoom * Math.exp(e.deltaY * 0.01), 0.25, 2.5);
    wake();
  }, { passive: false });

  // ---- loop: draws only when something moved, and not at all off screen ----
  const keySprings = new Map();
  let visible = true;
  let last = 0;
  let frame = 0;
  let idleFrames = 0;
  wake = () => {
    idleFrames = 0;
    if (!frame && visible) { last = 0; frame = requestAnimationFrame(loop); }
  };

  function loop(now) {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 1 / 8) : 1 / 60;
    last = now;
    let moving = player.tick(dt);

    if (hand && !hand.held && hand.to !== undefined) {
      const x = spring(hand.spring, hand.to, dt, 0.32, 1);
      if (hand.step) { player.scrub(hand.step, clamp(x, 0, 1)); sound.crankDrag(clamp(x, 0, 1)); }
      else player.pose.crank = hand.base + hand.dir * x; // a jammed crank gives back what it gave
      moving = true;
      if (Math.abs(hand.to - x) < 0.004 && Math.abs(hand.spring.v) < 0.03) {
        if (hand.to === 1 && hand.step) commitHand();
        else player.pose = poseOf(machine.r);
        hand = null;
        canvas.style.cursor = "";
      }
    }

    // Keys
    const names = Object.keys(built.keys);
    for (const name of names) {
      let s = keySprings.get(name);
      if (!s) keySprings.set(name, (s = { x: 0, v: 0 }));
      const down = keyDown.get(name);
      const to = down ? 1 : hover === name ? 0.1 : 0;
      if (Math.abs(to - s.x) > 0.001 || Math.abs(s.v) > 0.01) {
        // Keys go down at once and come back on a spring.
        spring(s, to, dt, down ? 0.09 : 0.2, down ? 1 : 0.72);
        built.pose.setKey(name, clamp(s.x, -0.1, 1.05));
        moving = true;
      }
    }

    // Cover
    if (Math.abs(coverState.target - coverState.x) > 0.001 || Math.abs(coverState.v) > 0.002) {
      spring(coverState, coverState.target, dt, 1.05, 1);
      moving = true;
    } else coverState.x = coverState.target;
    built.pose.setCover(clamp(coverState.x, 0, 1));
    const apart = clamp(coverState.x, 0, 1);
    floor.material.opacity = 0.36 * (1 - Math.min(1, apart * 4));
    floor.visible = apart < 0.25;
    if (parts.tick(dt)) moving = true;

    // The transformation runs on its own clock, and can be turned round halfway.
    if (form.m !== form.target) {
      const step = dt / MORPH_SECONDS;
      form.m = form.target > form.m ? Math.min(form.target, form.m + step) : Math.max(form.target, form.m - step);
      built.pose.setMorph(form.m);
      moving = true;
      if (form.m === form.target) lockCover(false);
    }
    if (built.pose.tickBoard(dt)) moving = true;
    // The camera arrives as the machine stands up, so the keys deploy on a face that's already looking at you.
    const framed = clamp((form.m - 0.04) / 0.56, 0, 1);
    const framing = framed * framed * framed * (framed * (framed * 6 - 15) + 10);
    // The camera travels with the machine rather than swinging round ahead of it.
    if (moving && form.m !== 0 && form.m !== 1 && drag?.type !== "orbit") {
      view.azTo = view.mech.az + (view.sci.az - view.mech.az) * framing;
      view.elTo = view.mech.el + (view.sci.el - view.mech.el) * framing;
    }
    // It pulls back mid-way to keep the parts in the air in shot.
    const dist = (view.dist + ((view.distSci ?? view.dist) - view.dist) * framing) * (1 + 0.24 * Math.sin(Math.PI * clamp(form.m / 0.72, 0, 1)) ** 2);
    target.lerpVectors(HOME_TARGET, SCI_TARGET, framing);
    const room = view.aspectFit();
    const apartEased = apart * apart * (3 - 2 * apart);
    let seeing = dist;
    if (parts.bounds && apartEased > 0) {
      target.lerp(parts.bounds.centre, apartEased);
      seeing += (room(parts.bounds.radius) - seeing) * apartEased;
    }
    // On one part alone, the camera comes in as close as that part's size allows.
    const solo = parts.soloLevel;
    if (solo > 0) {
      target.lerp(parts.focus, solo);
      seeing *= (room(parts.focusRadius.x) / seeing) ** solo;
    }
    seeing *= view.zoom;
    // The headline's corner matters less once the calculator stands: it only needs moving aside, not down.
    if (view.wide) {
      camera.setViewOffset(view.w, view.h, -view.w * (0.105 - 0.09 * apartEased), -view.h * 0.085 * (1 - framing) * (1 - apartEased), view.w, view.h);
    }
    camera.near = Math.max(0.05, seeing / 60);
    camera.far = seeing * 6 + 200;
    camera.updateProjectionMatrix();

    // The view is free in both directions, so the machine can be turned over the top and right round.
    spring(view.az, view.azTo, dt, 0.26, 1);
    spring(view.el, view.elTo, dt, 0.26, 1);
    if (Math.abs(view.az.x - view.azTo) > 0.0005 || Math.abs(view.el.x - view.elTo) > 0.0005) moving = true;

    const sinA = Math.sin(view.az.x), cosA = Math.cos(view.az.x), sinE = Math.sin(view.el.x), cosE = Math.cos(view.el.x);
    camera.position.set(target.x + sinA * cosE * seeing, target.y + sinE * seeing, target.z + cosA * cosE * seeing);
    // Worked out from the angles rather than fixed to the sky, which is what lets the camera pass straight over the poles.
    camera.up.set(-sinA * sinE, cosE, -cosA * sinE);
    camera.lookAt(target);
    built.pose.apply(player.pose);
    parts.draw();

    idleFrames = moving ? 0 : idleFrames + 1;
    if (visible && (idleFrames < 3 || drag || hand)) frame = requestAnimationFrame(loop);
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    heroInView.value = visible;
    if (visible) wake();
  }, { threshold: 0.02 }).observe(canvas);

  screen3d = (state) => { built.pose.setScreen(state); wake(); };
  second3d = (on) => { built.pose.setSecond(on); wake(); };
  board3d = (key) => { built.pose.fireBoard(key); wake(); };
  startMorph = (to) => {
    sound.transform(MORPH_SECONDS);
    // Wherever you have turned it to is where the camera sets out from.
    // It may have been turned many times over, and the trip shouldn't unwind them all.
    const azTurns = Math.round(view.azTo / TURN) * TURN, elTurns = Math.round(view.elTo / TURN) * TURN;
    view.azTo -= azTurns; view.az.x -= azTurns;
    view.elTo -= elTurns; view.el.x -= elTurns;
    const near = (pose) => ({ az: nearest(pose.az, view.azTo), el: nearest(pose.el, view.elTo) });
    if (to && form.m === 0) { view.mech = { az: view.azTo, el: view.elTo }; view.sci = near(SCI_POSE); }
    if (!to && form.m === 1) { view.sci = { az: view.azTo, el: view.elTo }; view.mech = near(MECH_POSE); }
    view.zoom = 1;
    if (still.matches) {
      form.m = to;
      built.pose.setMorph(to);
      view.azTo = to ? view.sci.az : view.mech.az;
      view.elTo = to ? view.sci.el : view.mech.el;
    }
    if (!to) { sci.second = false; second3d(false); }
    if (to) showScientific();
    wake();
  };

  // A way in for the page's checks and for the film's stills.
  window.__carry = { machine, sci, form, player, built, camera, view, target, renderer, scene, setCover, coverState, runSum, wake, handTurn, parts };
  resize();
  built.pose.apply(player.pose);
  document.documentElement.classList.add("has-3d", "js-ready");
  wake();
  setTimeout(() => built.pose.warm(renderer, scene, camera), 800);
}

try {
  start3D();
} catch (error) {
  console.warn("3D stage unavailable", error);
  document.documentElement.classList.add("no-3d", "js-ready");
  // No stage to animate on: the arithmetic still runs, the answers just arrive at once.
  wake = () => { if (player.busy) player.flush(); };
}
mountFigures();

// ---- chapter motion ----
setTimeout(() => $(".name")?.classList.add("settled"), 1100);
const reveal = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add("in");
    reveal.unobserve(entry.target);
  }
}, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
document.querySelectorAll("[data-in]").forEach((el) => reveal.observe(el));

// The film: its tabs seek to the sum's chapters, and follow along as it plays.
const film = $("#film");
const tabs = [...document.querySelectorAll("[data-seek]")];
const markTab = (tab) => tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    markTab(tab);
    if (film) { film.currentTime = Number(tab.dataset.seek); film.play?.().catch(() => {}); }
  });
});
film?.addEventListener("timeupdate", () => {
  markTab(tabs.filter((t) => Number(t.dataset.seek) <= film.currentTime).pop() ?? tabs[0]);
});
if (film) {
  new IntersectionObserver(([e]) => {
    if (still.matches) return;
    if (e.isIntersecting) film.play?.().catch(() => {}); else film.pause?.();
  }, { threshold: 0.2 }).observe(film);
}

// The fan of cards is dealt by the scroll.
const fan = $("#fan");
if (fan && !still.matches) {
  const cards = [...fan.querySelectorAll(".card")];
  const wide = matchMedia("(min-width: 900px)");
  const place = () => {
    if (!wide.matches) { cards.forEach((c) => { c.style.transform = ""; }); return; }
    const box = fan.getBoundingClientRect();
    const span = box.height - innerHeight;
    const t = clamp(-box.top / Math.max(1, span), 0, 1);
    cards.forEach((card, i) => {
      if (i === 0) return;
      const from = (i - 1) / 3, to = i / 3;
      const e = clamp((t - from) / (to - from) * 1.15, 0, 1);
      const eased = 1 - (1 - e) ** 3;
      card.style.transform = `translateY(${(1 - eased) * 110}vh) rotate(var(--r))`;
    });
  };
  addEventListener("scroll", () => requestAnimationFrame(place), { passive: true });
  addEventListener("resize", place);
  place();
}
