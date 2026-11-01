// Builds the three "moves" as Anatomy figures: static kit art precomputed here,
// and only the projection and part names handed to the page, which moves the parts.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../src/iso/iso-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);

function basePlate(plan, height, P, feetInset = 16) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, -height - 4, height, P)}"/>`];
  for (const [x, y] of k.corners(plan, feetInset).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))) {
    out.push(S(k.cylinder(x, y, 5.5, -height - 4, 4, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(plan, -height, height, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 4), 0, P), { tone: "lo" }));
  const screws = k.corners(plan, 9);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 14)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => k.iso([x, y, 0], P)), { size: 0.5 }));
  return out.join("");
}

function labelPlate(x, y, P) {
  const plan = { x, y, w: 30, d: 12, r: 1 };
  return S(k.slabOf(plan, 0, 0.6, P, 3), { tone: "lo", crease: "none" })
    + L(k.lineOnTop([x + 3, y + 4], [x + 27, y + 4], 0.6, P), { tone: "mid", free: "both" })
    + L(k.lineOnTop([x + 3, y + 8], [x + 19, y + 8], 0.6, P), { tone: "lo", free: "both" });
}

// ---- Set: a key, and the pinion it walks along a ruler ----
function figSet() {
  const W = 440, H = 340, STEP = 15;
  const plate = { x: -92, y: -46, w: 190, d: 92, r: 7 };
  const P = k.fitProjection([...k.boxCorners(plate, -14, 0), [-70, -20, 62]], W, H, { pad: 16, azimuth: 42 });
  const out = [basePlate(plate, 9, P)];
  const x0 = -48;
  // Ruler with one numbered stop per digit.
  const strip = { x: x0 - 8, y: 24, w: STEP * 9 + 16, d: 15, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(x0, x0 + STEP * 9 + 0.1, STEP, 1, 24.6, 0.8, [3.2, 3.2], P);
  out.push(L(ticks.major, { tone: "hi" }));
  for (let d = 0; d < 10; d++) out.push(k.faceTextSvg(k.topMatrix([x0 + d * STEP, 35], 0.8, P, "x"), String(d), { size: 5.6, tone: "hi", anchor: "middle" }));
  // Two rails.
  for (const y of [-14, 8]) {
    out.push(S(k.slabOf({ x: x0 - 14, y, w: STEP * 9 + 28, d: 4, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
    out.push(D([x0 - 10, x0 + STEP * 9 + 10].map((x) => k.iso([x, y + 2, 3], P)), { size: 0.4 }));
  }
  for (const x of [x0 - 18, x0 + STEP * 9 + 14]) {
    out.push(S(k.slabOf({ x, y: -18, w: 5, d: 30, r: 1 }, 0, 7, P, 3, 0.5), { tone: "mid" }));
    out.push(D([k.iso([x + 2.5, -14, 7], P), k.iso([x + 2.5, 8, 7], P)], { size: 0.45 }));
  }
  // The key itself, on a post at the back, with a spring on its stem.
  const keyAt = [-72, -28];
  out.push(S(k.cylinder(keyAt[0], keyAt[1], 8, 0, 3, P, 24, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(keyAt[0], keyAt[1], 2, 3, 30, P, 14), { tone: "mid", crease: "none" }));
  for (let z = 6; z < 32; z += 3.4) out.push(L(k.sideArc(keyAt[0], keyAt[1], 4.6, z, P, 18), { tone: "mid" }));
  // The moving block and pinion.
  const block = [
    S(k.slabOf({ x: -11, y: -18, w: 22, d: 34, r: 2 }, 3, 5, P, 4, 0.6), { tone: "mid" }),
    L(k.planOutline({ x: -7, y: -14, w: 14, d: 26, r: 1 }, 8, P, 3), { tone: "faint" }),
    S(k.cylinder(0, -2, 8.5, 8, 7, P, 36, 0.4), { tone: "hi", lit: true, crease: "lo" }),
    L(k.knurl(0, -2, 8.5, 9, 14.4, 28, P, 0.3), { tone: "lo" }),
    D([k.iso([0, -2, 15], P)], { size: 0.6, tone: "hi" }),
    S(k.slabOf({ x: -1.6, y: 16, w: 3.2, d: 10, r: 0.6 }, 3, 1.4, P, 2), { tone: "hi", lit: true, crease: "none" }),
  ].join("");
  out.push(`<g data-part="block" transform="${k.translateAlong(P, [x0 + 7 * STEP, 0, 0])}">${block}</g>`);
  out.push(`<g data-part="cap">${S(k.cylinder(keyAt[0], keyAt[1], 11, 33, 6, P, 32, 1), { tone: "hi", lit: true })}${L(k.ring(keyAt[0], keyAt[1], 8, 39, P, 32), { tone: "faint" })}</g>`);
  return {
    svg: k.figureSvg({ width: W, height: H, label: "A key on a sprung stem beside two rails. A block carrying a pinion slides along the rails to one of ten numbered stops.", body: out }),
    data: { P, x0, STEP },
  };
}

// ---- Turn: the stepped drum laid flat, a rack of nine teeth, each longer than the last ----
function figTurn() {
  const W = 560, H = 430, LANE = 10, GAP = 8;
  const plate = { x: -92, y: -100, w: 200, d: 200, r: 8 };
  const P = k.fitProjection([...k.boxCorners(plate, -14, 0), [20, 0, 34]], W, H, { pad: 12, azimuth: 40 });
  const out = [basePlate(plate, 9, P)];
  const left = -70;
  const rest = -62, bridgeY = 10; // the rack rests behind the bridge and travels past it
  // Slide-way for the rack.
  for (const x of [left - 6, left + 9 * LANE + 2]) {
    out.push(S(k.slabOf({ x, y: -92, w: 4, d: 184, r: 1 }, 0, 2.4, P, 3, 0.3), { tone: "lo", crease: "none" }));
    out.push(D([-86, 86].map((y) => k.iso([x + 2, y, 2.4], P)), { size: 0.4 }));
  }
  // Rack: a bed with nine teeth of stepped length.
  const rack = [S(k.slabOf({ x: left - 2, y: -6, w: 9 * LANE + 4, d: GAP * 9 + 8, r: 2 }, 0.6, 3, P, 3, 0.4), { tone: "mid" })];
  for (let t = 9; t >= 1; t--) {
    const len = t * LANE;
    const y = (t - 1) * GAP;
    rack.push(S(k.slabOf({ x: left + 9 * LANE - len, y, w: len, d: 5, r: 1 }, 3.6, 3.4, P, 3, 0.4), { tone: "hi", crease: "lo" }));
  }
  out.push(`<g data-part="rack" transform="${k.translateAlong(P, [0, rest, 0])}">${rack.join("")}</g>`);
  // Gantry with the lane ruler: the bridge the pinion hangs from.
  for (const x of [left - 14, left + 9 * LANE + 8]) {
    out.push(S(k.slabOf({ x, y: bridgeY - 4, w: 6, d: 8, r: 1 }, 0, 24, P, 3, 0.4), { tone: "mid" }));
  }
  const bar = { x: left - 16, y: bridgeY - 5, w: 9 * LANE + 32, d: 10, r: 1.2 };
  out.push(S(k.slabOf(bar, 24, 4, P, 3, 0.5), { tone: "mid" }));
  const ticks = k.topTicks(left + LANE / 2, left + 9 * LANE + 0.1, LANE, 1, bridgeY - 3.6, 28, [2.6, 2.6], P);
  out.push(L(ticks.major, { tone: "hi" }));
  out.push(D([bar.x + 3, bar.x + bar.w - 3].map((x) => k.iso([x, bridgeY, 28], P)), { size: 0.45 }));
  const pin = [
    S(k.slabOf({ x: -2, y: -2.4, w: 4, d: 4.8, r: 0.8 }, 12, 12, P, 2), { tone: "mid", crease: "none" }),
    S(k.cylinder(0, 0, 8, 7, 5, P, 32, 0.3), { tone: "hi", lit: true, crease: "lo" }),
    L(k.knurl(0, 0, 8, 7.6, 11.6, 24, P, 0.3), { tone: "lo" }),
  ].join("");
  out.push(`<g data-part="pinion" transform="${k.translateAlong(P, [left + 4.5 * LANE, bridgeY, 0])}">${pin}</g>`);
  // The number wheel it drives, at the side, with its ten printed places.
  const dial = [84, -52];
  const dialR = 17;
  out.push(S(k.cylinder(dial[0], dial[1], dialR, 0, 6, P, 48, 0.6), { tone: "hi", crease: "lo" }));
  const tick = k.radialTicks(dial[0], dial[1], dialR - 2, 10, 1, 6, [2, 2], P);
  out.push(L(tick.major || tick.minor, { tone: "mid", free: "start" }));
  out.push(`<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d=""/>`);
  out.push(D([k.iso([dial[0], dial[1], 6], P)], { size: 0.7, tone: "hi" }));
  out.push(labelPlate(plate.x + 10, plate.y + plate.d - 22, P));
  return {
    svg: k.figureSvg({ width: W, height: H, label: "A stepped drum laid flat: nine teeth of increasing length on a rack, sliding under a pinion. Beside it, a number wheel with a needle.", body: out }),
    data: { P, left, LANE, GAP, rest, bridgeY, dial, dialR, top: 6 },
  };
}

// ---- Carry: two wheels, one tooth ----
function figCarry() {
  const W = 620, H = 620;
  const plate = { x: -92, y: -66, w: 184, d: 132, r: 9 };
  const R = 38;
  const tens = [-44, 0], units = [44, 0];
  const P = k.fitProjection([...k.boxCorners(plate, -16, 0), [0, 0, 20]], W, H, { pad: 14, azimuth: 45 });
  const out = [basePlate(plate, 10, P, 18)];
  const TOP = 9;
  for (const [cx, cy] of [tens, units]) {
    out.push(S(k.cylinder(cx, cy, R + 2.2, 0, 3, P, 56, 0.5), { tone: "mid" }));
    out.push(S(k.cylinder(cx, cy, R, 3, TOP - 3, P, 64, 0.7), { tone: "hi", crease: "lo" }));
    out.push(L(k.ring(cx, cy, R - 2.4, TOP, P, 56), { tone: "lo" }));
    const t = k.radialTicks(cx, cy, R - 2.4, 10, 1, TOP, [3, 3], P);
    out.push(L(t.major || t.minor, { tone: "mid", free: "start" }));
    for (let d = 0; d < 10; d++) {
      const a = (d / 10) * Math.PI * 2;
      out.push(k.faceTextSvg(k.topMatrix([cx + Math.sin(a) * (R - 11.5), cy - Math.cos(a) * (R - 11.5) + 2.2], TOP, P, "x"), String(d), { size: 6.6, tone: "hi", anchor: "middle" }));
    }
    out.push(L(k.ring(cx, cy, 3, TOP, P, 20), { tone: "mid" }));
  }
  out.push(`<path data-part="needle-tens" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.2" d=""/>`);
  out.push(`<path data-part="needle-units" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.2" d=""/>`);
  // The pawl bridge between the wheels; its tip is lit when it trips.
  const bridge = { x: -5, y: -60, w: 10, d: 11, r: 1.5 };
  out.push(S(k.slabOf(bridge, 0, 13, P, 3, 0.5), { tone: "mid" }));
  out.push(D([k.iso([0, -57, 13], P), k.iso([0, -52, 13], P)], { size: 0.45 }));
  out.push(`<path data-part="pawl" class="iso-line" data-tone="hi" data-free="end" style="stroke-width:1.5" d=""/>`);
  out.push(labelPlate(plate.x + 12, plate.y + plate.d - 24, P));
  out.push(D([units, tens].map(([x, y]) => k.iso([x, y, TOP], P)), { size: 0.9, tone: "hi" }));
  return {
    svg: k.figureSvg({ width: W, height: H, label: "Two number wheels side by side with printed digits and needles. A pawl stands between them: when the right wheel rolls from 9 to 0 it trips the pawl, and the left wheel moves on by one.", body: out }),
    data: { P, tens, units, R, TOP },
  };
}

const figures = { set: figSet(), turn: figTurn(), carry: figCarry() };
writeFileSync(join(HERE, "..", "src", "figures.generated.js"), `// Written by figures/build.mjs. Do not edit.\nexport const FIG = ${JSON.stringify(figures)};\n`);
console.log("figures built", Object.entries(figures).map(([n, f]) => `${n} ${(f.svg.length / 1024).toFixed(0)}KB`).join(", "));
