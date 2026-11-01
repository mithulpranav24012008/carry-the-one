// The three moves. Parts are drawn once with the Anatomy kit; this file only moves them,
// writing attributes directly and sleeping whenever nothing is moving.
import "./iso/iso.css";
import { lineOnTop, translateAlong } from "./iso/iso-kit.mjs";
import { FIG } from "./figures.generated.js";

const still = matchMedia("(prefers-reduced-motion: reduce)");

function mount(host, html, theme, controls) {
  const fig = document.createElement("div");
  fig.className = "fig iso";
  if (theme === "light") fig.dataset.theme = "light";
  fig.innerHTML = html;
  const bar = document.createElement("div");
  bar.className = "fig-controls";
  bar.innerHTML = controls;
  fig.append(bar);
  host.append(fig);
  return fig;
}

// A tiny frame clock per figure: follow toward targets, stop at rest.
function animator(update) {
  let frame = 0, last = 0;
  const tick = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    frame = update(dt) ? requestAnimationFrame(tick) : 0;
  };
  return () => { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } };
}
const follow = (x, to, dt, tau) => (Math.abs(to - x) < 0.002 ? to : x + (to - x) * (1 - Math.exp(-dt / tau)));
const needlePath = (center, radius, z, P, turns) => {
  const a = turns * Math.PI * 2;
  return lineOnTop([center[0] - Math.sin(a) * radius * 0.16, center[1] + Math.cos(a) * radius * 0.16], [center[0] + Math.sin(a) * radius * 0.68, center[1] - Math.cos(a) * radius * 0.68], z, P);
};

function figSet() {
  const { P, x0, STEP } = FIG.set.data;
  const host = document.querySelector("#fig-set");
  const fig = mount(host, FIG.set.svg, "light", `<label for="set-digit">Digit</label><input id="set-digit" type="range" min="0" max="9" step="1" value="7"><output id="set-out">7</output>`);
  const block = fig.querySelector('[data-part="block"]');
  const cap = fig.querySelector('[data-part="cap"]');
  const input = fig.querySelector("#set-digit");
  const out = fig.querySelector("#set-out");
  let x = 7, to = 7, press = 0, pressTo = 0;
  const draw = () => {
    block.setAttribute("transform", translateAlong(P, [x0 + x * STEP, 0, 0]));
    cap.setAttribute("transform", translateAlong(P, [0, 0, -press * 5]));
  };
  const run = animator((dt) => {
    x = still.matches ? to : follow(x, to, dt, 0.12);
    press = follow(press, pressTo, dt, 0.05);
    if (Math.abs(press - pressTo) < 0.02 && pressTo === 1) pressTo = 0;
    draw();
    return x !== to || press !== pressTo || pressTo === 1;
  });
  input.addEventListener("input", () => { to = Number(input.value); out.textContent = input.value; pressTo = 1; run(); });
  draw();
}

function figTurn() {
  const { P, left, LANE, GAP, rest, bridgeY, dial, dialR, top } = FIG.turn.data;
  const host = document.querySelector("#fig-turn");
  const fig = mount(host, FIG.turn.svg, "light", `<label for="turn-digit">Digit</label><input id="turn-digit" type="range" min="0" max="9" step="1" value="5"><output id="turn-out">5</output><button type="button" id="turn-go">Turn</button>`);
  const rack = fig.querySelector('[data-part="rack"]');
  const pinion = fig.querySelector('[data-part="pinion"]');
  const needle = fig.querySelector('[data-part="needle"]');
  const input = fig.querySelector("#turn-digit");
  const out = fig.querySelector("#turn-out");
  const button = fig.querySelector("#turn-go");
  const END = 14;
  // A tooth t reaches t lanes in from the right, so lane d is crossed by exactly d teeth.
  const laneOf = (d) => d - 0.5;
  let digit = 5, lane = laneOf(5), laneTo = lane, y = rest, phase = 1, wheel = 0, base = 0;
  const passed = (at) => {
    let n = 0;
    for (let t = 10 - digit; t <= 9; t++) if (at + (t - 1) * GAP + 5 > bridgeY) n++;
    return n;
  };
  const draw = () => {
    rack.setAttribute("transform", translateAlong(P, [0, y, 0]));
    pinion.setAttribute("transform", translateAlong(P, [left + lane * LANE, bridgeY, 0]));
    needle.setAttribute("d", needlePath(dial, dialR, top + 0.3, P, wheel / 10));
  };
  const run = animator((dt) => {
    lane = still.matches ? laneTo : follow(lane, laneTo, dt, 0.1);
    if (phase < 1) {
      phase = Math.min(1, phase + dt / (still.matches ? 0.01 : 1.6));
      y = rest + (END - rest) * (phase * phase * (3 - 2 * phase));
      wheel = base + passed(y);
    } else {
      // The rack draws back clear of the pinion, which has lifted out of mesh.
      y = still.matches ? rest : follow(y, rest, dt, 0.16);
    }
    draw();
    return lane !== laneTo || phase < 1 || y !== rest;
  });
  input.addEventListener("input", () => { digit = Number(input.value); out.textContent = input.value; laneTo = laneOf(digit); run(); });
  button.addEventListener("click", () => {
    if (phase < 1) wheel = base + digit;
    base = wheel;
    phase = 0;
    run();
  });
  draw();
}

function figCarry() {
  const { P, tens, units, R, TOP } = FIG.carry.data;
  const host = document.querySelector("#fig-carry");
  const fig = mount(host, FIG.carry.svg, "dark", `<button type="button" id="carry-go">Add 1</button><output id="carry-out">37</output><button type="button" id="carry-nine">Add 9</button>`);
  const nU = fig.querySelector('[data-part="needle-units"]');
  const nT = fig.querySelector('[data-part="needle-tens"]');
  const pawl = fig.querySelector('[data-part="pawl"]');
  const out = fig.querySelector("#carry-out");
  let value = 37, u = 7, t = 3, trip = 0;
  const draw = () => {
    nU.setAttribute("d", needlePath(units, R, TOP + 0.3, P, u / 10));
    nT.setAttribute("d", needlePath(tens, R, TOP + 0.3, P, t / 10));
    const swing = trip * 16;
    pawl.setAttribute("d", lineOnTop([0, -52], [swing, -30 - trip * 2], 13, P));
    pawl.dataset.tone = trip > 0.15 ? "lit" : "hi";
  };
  const run = animator((dt) => {
    const uTo = value;
    const tTo = Math.floor(value / 10);
    u = still.matches ? uTo : follow(u, uTo, dt, 0.14);
    // The tens wheel waits for the units wheel to reach the tooth.
    const ready = u > tTo * 10 - 0.5;
    t = still.matches ? tTo : ready ? follow(t, tTo, dt, 0.09) : t;
    trip = follow(trip, Math.abs(t - tTo) > 0.05 ? 1 : 0, dt, 0.05);
    draw();
    return u !== uTo || t !== tTo || trip !== 0;
  });
  // Units turn counts whole places so the needle keeps rolling past zero rather than rewinding.
  const add = (n) => { value += n; out.textContent = String(value % 100).padStart(2, "0"); run(); };
  u = value;
  fig.querySelector("#carry-go").addEventListener("click", () => add(1));
  fig.querySelector("#carry-nine").addEventListener("click", () => add(9));
  draw();
}

export function mountFigures() {
  try { figSet(); figTurn(); figCarry(); } catch (error) { console.warn("figure", error); }
}
