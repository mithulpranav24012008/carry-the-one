// What's under the scientific calculator's faceplate: a key matrix, a scanner, a main chip and a bus to the display.
// It's wired from the real key layout, so pressing a key lights the actual row and column that key sits on.
import * as THREE from "three";
import { LAYOUT } from "./morph.js";

const W = 15.5, H = 29.6;
const TOP = 0.04; // the board's surface, in the deck's coordinates
const COPPER = 0xb5854a, GLOW = 0xffa63d, GLOW_POWER = 2.6;
const FADE = 0.3; // seconds for a lit trace to fall to a third
const SCANNER = { x: -4.5, z: 2.32, w: 2.2, d: 0.9 };
const CHIP = { x: 0.7, z: 2.32, w: 6.6, d: 0.95 };
const unique = (list) => [...new Set(list)].sort((a, b) => a - b);

export function buildBoard({ add, rbox, cylY, label, font, tag }) {
  const group = new THREE.Group();
  group.visible = false;
  const copper = () => new THREE.MeshStandardMaterial({ color: COPPER, roughness: 0.38, metalness: 0.7, emissive: GLOW, emissiveIntensity: 0 });

  const art = label(1024, 1956, (g, w, h) => {
    const X = (x) => ((x + W / 2) / W) * w, Z = (z) => ((z + H / 2) / H) * h;
    g.fillStyle = "#2c3a1e"; g.fillRect(0, 0, w, h);
    // Hatched ground plane, as etched copper shows through the solder mask.
    g.strokeStyle = "rgba(190, 200, 140, 0.07)"; g.lineWidth = 2;
    for (let i = -h; i < w; i += 22) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    g.strokeStyle = "#cfc9a8"; g.lineWidth = 3;
    g.strokeRect(X(-7.4), Z(-7.2), X(7.45) - X(-7.4), Z(1.72) - Z(-7.2));
    g.strokeRect(X(-7.4), Z(2.86), X(7.45) - X(-7.4), Z(13.72) - Z(2.86));
    g.fillStyle = "#cfc9a8"; g.textBaseline = "middle"; g.textAlign = "left";
    g.font = `500 30px ${font}`;
    g.fillText("Carry Model 20 logic board", X(-7), Z(14.25));
    g.font = `500 21px ${font}`;
    g.fillText("Scan", X(SCANNER.x - 1.1), Z(3.1));
    g.fillText("Display bus", X(4.6), Z(1.45));
  });
  const surface = new THREE.MeshStandardMaterial({ map: art, roughness: 0.62, metalness: 0.05 });
  const pcb = add(group, rbox(W, 0.1, H, 0.04), new THREE.MeshStandardMaterial({ color: 0x2c3a1e, roughness: 0.7 }), 0, TOP - 0.05, 0);
  const print = add(group, new THREE.PlaneGeometry(W, H), surface, 0, TOP + 0.002, 0, -Math.PI / 2);
  pcb.castShadow = false;
  print.castShadow = false;

  // A trace is a run of thin strips laid along a list of points.
  const trace = (points, material, width = 0.085) => {
    const strips = [];
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.001) continue;
      const strip = add(group, new THREE.BoxGeometry(length + width, 0.014, width), material, (ax + bx) / 2, TOP + 0.01, (az + bz) / 2);
      strip.rotation.y = -Math.atan2(bz - az, bx - ax);
      strip.castShadow = false;
      strips.push(strip);
    }
    return strips;
  };

  const names = Object.keys(LAYOUT);
  const rows = unique(names.map((n) => LAYOUT[n].z));
  const isTop = (n) => LAYOUT[n].z < 2;
  const topCols = unique(names.filter(isTop).map((n) => LAYOUT[n].x));
  const lowCols = unique(names.filter((n) => !isTop(n)).map((n) => LAYOUT[n].x));

  // Rows run out to the left edge, down it, and into the scanner.
  const rowMats = rows.map((z, i) => {
    const mat = copper();
    const inRow = names.filter((n) => LAYOUT[n].z === z).map((n) => LAYOUT[n].x);
    const edge = -7.62 + i * 0.09, fan = 1.94 + i * 0.094;
    tag("board-row", trace([[Math.max(...inRow), z], [edge, z], [edge, fan], [SCANNER.x - SCANNER.w / 2, fan]], mat));
    return mat;
  });
  // Columns run down the block, then jog across to their pin on the main chip.
  const topMats = topCols.map((x, i) => {
    const mat = copper();
    const pin = CHIP.x - 2.8 + i * 1.12, jog = 1.02 + i * 0.09;
    tag("board-column", trace([[x, Math.min(...names.filter((n) => isTop(n) && LAYOUT[n].x === x).map((n) => LAYOUT[n].z))], [x, jog], [pin, jog], [pin, CHIP.z - CHIP.d / 2]], mat));
    return mat;
  });
  const lowMats = lowCols.map((x, i) => {
    const mat = copper();
    const pin = CHIP.x - 2.4 + i * 1.2, jog = 3.1 + i * 0.09;
    tag("board-column", trace([[x, Math.max(...names.filter((n) => !isTop(n) && LAYOUT[n].x === x).map((n) => LAYOUT[n].z))], [x, jog], [pin, jog], [pin, CHIP.z + CHIP.d / 2]], mat));
    return mat;
  });
  // The scanner hands over to the chip, and the chip drives the display round the right-hand edge.
  const link = copper(), bus = copper();
  for (let i = 0; i < 4; i++) {
    const z = SCANNER.z - 0.27 + i * 0.18;
    tag("board-link", trace([[SCANNER.x + SCANNER.w / 2, z], [CHIP.x - CHIP.w / 2, z]], link));
  }
  for (let i = 0; i < 6; i++) {
    const z = CHIP.z - 0.4 + i * 0.16, edge = 7.54 - i * 0.1;
    tag("board-bus", trace([[CHIP.x + CHIP.w / 2, z], [edge, z], [edge, -7.3]], bus));
  }

  // A contact under every key.
  const pads = {};
  for (const name of names) {
    const { x, z, s } = LAYOUT[name];
    const mat = copper();
    const ring = add(group, new THREE.RingGeometry(0.34 * s, 0.56 * s, 28), mat, x, TOP + 0.012, z, -Math.PI / 2);
    ring.castShadow = false;
    tag("board-contact", ring, name);
    pads[name] = mat;
  }

  const epoxy = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.46 });
  const leg = new THREE.MeshStandardMaterial({ color: 0xbfb49b, roughness: 0.34, metalness: 1 });
  const dip = (part, pins) => {
    const pieces = [add(group, rbox(part.w, 0.3, part.d, 0.05), epoxy, part.x, TOP + 0.17, part.z)];
    const geo = new THREE.BoxGeometry(0.09, 0.1, 0.14);
    for (let i = 0; i < pins; i++) {
      const x = part.x - part.w / 2 + ((i + 0.5) * part.w) / pins;
      for (const side of [-1, 1]) {
        const pin = add(group, geo, leg, x, TOP + 0.06, part.z + side * (part.d / 2 + 0.05));
        pin.castShadow = false;
        pieces.push(pin);
      }
    }
    return pieces;
  };
  tag("scanner-chip", dip(SCANNER, 7));
  const chipPieces = dip(CHIP, 20);
  const stamp = label(512, 74, (g, w, h) => {
    g.fillStyle = "#15130f"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b9b09a"; g.textAlign = "left"; g.textBaseline = "middle"; g.font = `500 36px ${font}`;
    g.fillText("Carry C-20", 54, h / 2 + 2);
  });
  const stamped = add(group, new THREE.PlaneGeometry(CHIP.w - 0.3, CHIP.d - 0.1), new THREE.MeshStandardMaterial({ map: stamp, roughness: 0.46 }), CHIP.x, TOP + 0.322, CHIP.z, -Math.PI / 2);
  stamped.castShadow = false;
  tag("main-chip", [...chipPieces, stamped]);
  // A pilot lamp on the chip, which blinks as it works.
  const lamp = new THREE.MeshStandardMaterial({ color: 0x4d2c10, roughness: 0.3, emissive: GLOW, emissiveIntensity: 0 });
  tag("pilot-lamp", add(group, new THREE.SphereGeometry(0.13, 14, 10), lamp, CHIP.x + CHIP.w / 2 - 0.45, TOP + 0.36, CHIP.z));

  // The smaller parts along the foot of the board.
  const can = new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 0.42 });
  [2.6, 3.5, 4.4, 5.3].forEach((x, i) => {
    tag("board-part", add(group, cylY(i % 2 ? 0.24 : 0.32, 0.52, 18), i % 2 ? leg : can, x, TOP + 0.26, 14.2));
  });

  tag("board", [pcb, print]);
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });

  // Lighting up. Each channel waits its turn, so a press reads as a signal travelling: contact, scanner, chip, display.
  const channel = (materials) => ({ materials, level: 0, wait: -1 });
  const links = channel([link]), chip = channel([lamp]), display = channel([bus]);
  const channels = new Map();
  const lit = new Set();
  const start = (ch, wait) => { ch.wait = wait; lit.add(ch); };
  const ofKey = (name) => {
    if (!channels.has(name)) {
      const { x, z } = LAYOUT[name];
      const col = isTop(name) ? topMats[topCols.indexOf(x)] : lowMats[lowCols.indexOf(x)];
      channels.set(name, channel([pads[name], rowMats[rows.indexOf(z)], col]));
    }
    return channels.get(name);
  };

  return {
    group,
    fire(name) {
      if (!LAYOUT[name]) return;
      start(ofKey(name), 0);
      start(links, 0.05);
      start(chip, 0.1);
      start(display, 0.16);
    },
    // True while anything is still glowing, so the render loop stays awake for it.
    tick(dt) {
      if (!lit.size) return false;
      const power = new Map();
      for (const ch of lit) {
        if (ch.wait >= 0) {
          ch.wait -= dt;
          if (ch.wait < 0) ch.level = 1;
        } else {
          ch.level *= Math.exp(-dt / FADE);
          if (ch.level < 0.01) { ch.level = 0; lit.delete(ch); }
        }
      }
      // A row or column is shared by several keys, so it shines as brightly as the brightest of them.
      for (const ch of [...channels.values(), links, chip, display]) {
        for (const mat of ch.materials) power.set(mat, Math.max(power.get(mat) ?? 0, ch.level));
      }
      for (const [mat, level] of power) mat.emissiveIntensity = level * GLOW_POWER;
      return true;
    },
  };
}
