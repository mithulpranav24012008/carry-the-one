// The machine as geometry. One unit is a centimetre; x runs left to right, y up, z toward the operator.
// Nothing here knows any arithmetic: apply(pose) places every moving part from the pose the model produced.
import * as THREE from "three";
import { buildMorph, FACE, SCI } from "./morph.js";
import { buildBoard } from "./board.js";
import { buildExplode } from "./parts.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const PITCH = 1.12; // one digit column
const S0X = 6; // x of the setting units column
const DIGIT = (Math.PI * 2) / 10;
const BODY_W = 31;
const TEXT_FONT = '"Epilogue", "Helvetica Neue", Arial, sans-serif';

const COLORS = {
  cream: 0xece4d0,
  ochre: 0xc98f2f,
  grip: 0x3a2214,
};

// Walnut, drawn rather than photographed: long wavy growth rings, fine fibres and pores, tiling in both directions.
// Grain runs up the canvas. Seeded, so the site and the film show the same tree.
function walnut(size = 1024) {
  let seed = 7321;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const field = (nx, ny) => {
    const values = new Float32Array(nx * ny);
    for (let i = 0; i < values.length; i++) values[i] = rnd();
    return (u, v) => {
      const x = u * nx, y = v * ny;
      const x0 = Math.floor(x), y0 = Math.floor(y);
      let fx = x - x0, fy = y - y0;
      fx = fx * fx * (3 - 2 * fx);
      fy = fy * fy * (3 - 2 * fy);
      const at = (i, j) => values[((j % ny) + ny) % ny * nx + ((i % nx) + nx) % nx];
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
      const low = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
      return top + (low - top) * fy;
    };
  };
  const broad = field(4, 2), wander = field(11, 5), figure = field(7, 3), fibre = field(420, 6), pore = field(640, 44);
  const make = () => { const c = document.createElement("canvas"); c.width = c.height = size; return c; };
  const colour = make(), height = make();
  const gc = colour.getContext("2d"), gh = height.getContext("2d");
  const ci = gc.createImageData(size, size), hi = gh.createImageData(size, size);
  const stops = [[0, [34, 19, 11]], [0.45, [74, 44, 25]], [0.75, [112, 72, 42]], [1, [146, 99, 60]]];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const t = u * 15 + broad(u, v) * 3.4 + wander(u, v) * 0.7;
      const ring = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      const streak = fibre(u, v);
      const hole = Math.max(0, Math.min(1, (pore(u, v) - 0.74) / 0.08));
      let tone = 0.2 + 0.4 * ring ** 0.8 + 0.22 * figure(u, v) + 0.14 * streak - 0.11 * hole;
      tone = Math.max(0, Math.min(1, tone));
      let k = 0;
      while (k < stops.length - 2 && tone > stops[k + 1][0]) k++;
      const e = (tone - stops[k][0]) / (stops[k + 1][0] - stops[k][0]);
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) ci.data[i + c] = stops[k][1][c] + (stops[k + 1][1][c] - stops[k][1][c]) * e;
      ci.data[i + 3] = 255;
      const h = 128 + (ring - 0.5) * 30 + (streak - 0.5) * 34 - hole * 50;
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = h;
      hi.data[i + 3] = 255;
    }
  }
  gc.putImageData(ci, 0, 0);
  gh.putImageData(hi, 0, 0);
  const texture = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: texture(colour, true), bump: texture(height, false) };
}

// Maps wood onto a part by its position, so the grain runs along x and carries across joins.
// Each face takes the plane it mostly lies in. `shift` lets separate boards differ.
function grained(geometry, shift = 0, tile = 30) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.crossVectors(b.sub(a), c.sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      const [m, w] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [z, x] : [y, x];
      uv[(i + j) * 2] = m / tile + shift;
      uv[(i + j) * 2 + 1] = w / tile + shift * 0.37;
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function materials() {
  const m = (o) => new THREE.MeshStandardMaterial(o);
  // Lacquer: a hard clear coat over the colour, so highlights stay sharp on top of it.
  const gloss = (o) => new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.07, ...o });
  const wood = walnut();
  // Hand-rubbed oil under a thin coat: a soft sheen that lets the grain show through.
  const polished = (o) => new THREE.MeshPhysicalMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.35, roughness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.2, ...o });
  return {
    walnut: polished({}),
    walnutDark: polished({ color: 0x8a7468 }),
    chrome: m({ color: 0xd9c9a3, roughness: 0.2, metalness: 1 }), // nickel-brass
    grip: gloss({ color: COLORS.grip, roughness: 0.4 }),
    steel: m({ color: 0x8c8474, roughness: 0.46, metalness: 1 }),
    brass: m({ color: 0xc69a4c, roughness: 0.3, metalness: 1 }),
    black: gloss({ color: 0x101312, roughness: 0.4, metalness: 0 }),
    rubber: m({ color: 0x0c0d0d, roughness: 0.9 }),
    cream: gloss({ color: COLORS.cream, roughness: 0.3 }),
    pink: gloss({ color: COLORS.ochre, roughness: 0.3 }),
    red: gloss({ color: 0x8f3a20, roughness: 0.3 }),
    plate: m({ color: 0xb58f55, roughness: 0.42, metalness: 0.82 }), // brushed brass
  };
}

// ---- small geometry helpers ----
function add(parent, geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.01));
const cylY = (r, h, seg = 32, r2 = r) => new THREE.CylinderGeometry(r, r2, h, seg);
const cylX = (r, h, seg = 32) => cylY(r, h, seg).rotateZ(Math.PI / 2);
const cylZ = (r, h, seg = 32) => cylY(r, h, seg).rotateX(Math.PI / 2);

function roundedRect(shape, x, y, w, h, r) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function gear(teeth, rOuter, rRoot, width) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [[rRoot, a], [rOuter, a + step * 0.22], [rOuter, a + step * 0.48], [rRoot, a + step * 0.7]];
    pts.forEach(([r, t], j) => {
      const px = Math.cos(t) * r, py = Math.sin(t) * r;
      if (i === 0 && j === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
    });
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  return g; // axis along z
}

function screw(parent, material, x, y, z, r = 0.16, slot = 0.6) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = slot;
  add(group, cylY(r, 0.07, 18, r * 1.1), material, 0, 0.035, 0);
  add(group, new THREE.BoxGeometry(r * 1.7, 0.02, r * 0.26), screw.slot, 0, 0.072, 0);
  parent.add(group);
  return group;
}

function helix(radius, height, turns, wire) {
  class Coil extends THREE.Curve {
    getPoint(t) { const a = t * turns * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * radius, t * height, Math.sin(a) * radius); }
  }
  return new THREE.TubeGeometry(new Coil(), Math.ceil(turns * 12), wire, 6, false);
}

// A number wheel, with its numerals on the rim: axis along x, zero up at rotation 0.
function wheelGeometry(radius, width, segments = 60) {
  const pos = [], uv = [], normal = [], index = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, a = t * Math.PI * 2;
    const y = Math.cos(a) * radius, z = Math.sin(a) * radius;
    for (const side of [0, 1]) {
      pos.push((side - 0.5) * width, y, z);
      normal.push(0, Math.cos(a), Math.sin(a));
      uv.push(side, 0.95 - t);
    }
    if (i < segments) {
      const k = i * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

function plateWithHoles(w, d, holes, thickness, radius = 0.14) {
  const shape = roundedRect(new THREE.Shape(), -w / 2, -d / 2, w, d, radius);
  for (const h of holes) shape.holes.push(roundedRect(new THREE.Path(), h.x - h.w / 2, h.y - h.h / 2, h.w, h.h, 0.05));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  return g; // top face near y = thickness, shape y maps to -z
}

function hollowTray(parent, material, w, h, d, wall = 0.1) {
  add(parent, new THREE.BoxGeometry(w, wall, d), material, 0, -h, 0);
  add(parent, new THREE.BoxGeometry(wall, h, d), material, -w / 2, -h / 2, 0);
  add(parent, new THREE.BoxGeometry(wall, h, d), material, w / 2, -h / 2, 0);
  add(parent, new THREE.BoxGeometry(w, h, wall), material, 0, -h / 2, -d / 2);
  add(parent, new THREE.BoxGeometry(w, h, wall), material, 0, -h / 2, d / 2);
}

export function buildMachine() {
  const M = materials();
  screw.slot = M.black;
  const root = new THREE.Group();
  const hits = [];
  const labelJobs = [];
  // Every part is named here as it is made. A part inside another part is named first.
  const tagged = [];
  const T = (family, members, label) => { tagged.push({ family, members: [].concat(members), label }); return members; };

  const label = (w, h, draw, opts = {}) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    Object.assign(tex, opts);
    const job = () => { const g = canvas.getContext("2d"); g.clearRect(0, 0, w, h); draw(g, w, h); tex.needsUpdate = true; };
    job();
    labelJobs.push(job);
    return tex;
  };

  // ---- digit strips ----
  const strip = (ink, paper) => label(160, 1600, (g, w, h) => {
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `900 150px ${TEXT_FONT}`;
    for (let k = 0; k < 10; k++) g.fillText(String(k), w / 2, (k + 0.5) * (h / 10) + 10);
  }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  const digitsCream = new THREE.MeshStandardMaterial({ map: strip("#101312", "#ece4d0"), roughness: 0.42 });
  const digitsDark = new THREE.MeshStandardMaterial({ map: strip("#ece4d0", "#141816"), roughness: 0.42 });

  const wheelAssembly = (parent, x, y, z, radius, width, material) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    add(g, wheelAssembly.geo(radius, width), material);
    const disc = wheelAssembly.disc(radius);
    add(g, disc, M.black, width / 2, 0, 0, 0, Math.PI / 2);
    add(g, disc, M.black, -width / 2, 0, 0, 0, -Math.PI / 2);
    parent.add(g);
    return g;
  };
  const geoCache = new Map();
  wheelAssembly.geo = (r, w) => { const k = `w${r}:${w}`; if (!geoCache.has(k)) geoCache.set(k, wheelGeometry(r, w)); return geoCache.get(k); };
  wheelAssembly.disc = (r) => { const k = `d${r}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.CircleGeometry(r, 40)); return geoCache.get(k); };

  // ---- base and frame: stays in place when the cover lifts ----
  const base = new THREE.Group();
  root.add(base);
  // The inside was never lacquered: a matte base plate, so the works read clearly.
  const basePlate = add(base, grained(rbox(BODY_W, 0.6, 24.6, 0.2), 0.4), new THREE.MeshStandardMaterial({ map: M.walnut.map, color: 0x9a8877, roughness: 0.85 }), 0, 1.0, 0.5);
  for (const [x, z] of [[-13.6, -9.6], [13.6, -9.6], [-13.6, 10.6], [13.6, 10.6]]) {
    T("foot", [add(base, cylY(1.15, 0.72, 28, 1.25), M.rubber, x, 0.36, z), add(base, cylY(0.5, 0.04, 16), M.steel, x, 0.72, z)]);
  }
  const frameProfile = (inset) => {
    const s = new THREE.Shape();
    s.moveTo(-11.2 + inset, 1.1);
    s.lineTo(12.2 - inset, 1.1);
    s.lineTo(12.2 - inset, 2.0 - inset * 0.3);
    s.lineTo(-1.4, 7.1 - inset);
    s.lineTo(-2.2, 8.1 - inset);
    s.lineTo(-10.4 + inset, 8.1 - inset);
    s.closePath();
    return s;
  };
  // Shape x is world z here.
  const sideFrame = new THREE.ExtrudeGeometry(frameProfile(0.5), { depth: 0.3, bevelEnabled: false });
  const frames = [];
  for (const x of [-14.6, 14.9]) {
    const f = add(base, sideFrame, M.steel, x, 0, 0);
    f.rotation.set(0, -Math.PI / 2, 0);
    frames.push(f);
  }

  // Carriage rails, on the frame.
  const RAIL_Y = 8.56;
  const rails = [-8.9, -4.6].map((z) => {
    const rail = new THREE.Group();
    rail.position.set(0, RAIL_Y, z);
    root.add(rail);
    T("rail", add(rail, cylX(0.2, BODY_W + 3.6, 20), M.chrome));
    for (const x of [-16.6, 16.6]) {
      T("rail-bracket", add(rail, rbox(0.8, 0.82, 0.8, 0.1), M.steel, x, -0.22, 0));
      T("rail-screw", screw(rail, M.chrome, x, 0.19, 0, 0.14));
    }
    return rail;
  });
  for (const x of [-13.8, 13.8]) for (const z of [-8.9, -4.6]) frames.push(add(base, cylY(0.34, 7.2, 16), M.steel, x, 4.8, z));

  // ---- the works ----
  const works = new THREE.Group();
  root.add(works);
  const drumZ = 3.2, drumLen = 6.6, drumR = 0.4, drumY = 2.95;
  const drumParts = [cylZ(drumR, drumLen + 0.4, 24)];
  for (let k = 1; k <= 9; k++) {
    const len = (k / 9) * drumLen;
    const tooth = new THREE.BoxGeometry(0.1, 0.13, len);
    tooth.translate(0, drumR + 0.04, drumLen / 2 - len / 2);
    tooth.rotateZ((k * Math.PI * 2) / 9 * 0.7);
    drumParts.push(tooth);
  }
  drumParts.forEach((g, i) => { if (g.index) drumParts[i] = g.toNonIndexed(); drumParts[i].deleteAttribute("uv"); });
  const drumGeo = mergeGeometries(drumParts);
  const pinionGeo = gear(10, 0.3, 0.2, 0.2);
  const bevelGeo = cylZ(0.34, 0.2, 14);
  const squareShaft = new THREE.BoxGeometry(0.15, 0.15, 11.2);
  const drums = [], pinions = [], shafts = [], forks = [];
  const pinionY = drumY + drumR + 0.42;
  for (let i = 0; i < 10; i++) {
    const x = S0X - i * PITCH;
    const drum = T("drum", add(works, drumGeo, M.brass, x, drumY, drumZ));
    drums.push(drum);
    T("drum-bevel", add(works, bevelGeo, M.steel, x, drumY, drumZ - drumLen / 2 - 0.15));
    const shaft = T("square-shaft", add(works, squareShaft, M.steel, x, pinionY, 1.1));
    shafts.push(shaft);
    const pinion = T("pinion", add(works, pinionGeo, M.chrome, x, pinionY, 0));
    pinions.push(pinion);
    const fork = new THREE.Group();
    add(fork, rbox(0.1, 0.7, 0.5, 0.03), M.steel, 0.15, 0.2, 0);
    add(fork, rbox(0.1, 0.7, 0.5, 0.03), M.steel, -0.15, 0.2, 0);
    add(fork, rbox(0.4, 0.1, 0.5, 0.03), M.steel, 0, 0.55, 0);
    add(fork, new THREE.BoxGeometry(0.06, 0.06, 1.6), M.steel, 0, 0.58, 0);
    fork.position.set(x, pinionY, 0);
    works.add(fork);
    T("fork", fork);
    forks.push(fork);
  }
  // Cross shaft from the crank to every drum.
  const crossZ = drumZ - drumLen / 2 - 0.42;
  const crossShaft = T("cross-shaft", add(works, cylX(0.13, 26, 12), M.steel, -0.6, drumY, crossZ));
  const crossGears = [];
  for (let i = 0; i < 10; i++) crossGears.push(T("cross-gear", add(works, bevelGeo, M.brass, S0X - i * PITCH + 0.3, drumY, crossZ, 0, Math.PI / 2)));
  const bigGear = T("big-gear", add(works, gear(36, 2.0, 1.82, 0.22), M.brass, 13.7, 3.4, crossZ, 0, Math.PI / 2));
  const smallGear = T("small-gear", add(works, gear(14, 0.78, 0.6, 0.26), M.chrome, 13.7, drumY - 0.12, crossZ + 2.3, 0, Math.PI / 2));
  for (const x of [-8.4, 0.6, 9.8]) {
    T("bearing", add(works, rbox(0.5, 1.9, 0.5, 0.06), M.steel, x, 2.2, crossZ));
    T("bearing", add(works, rbox(0.5, 1.9, 0.5, 0.06), M.steel, x, 2.2, drumZ + drumLen / 2 + 0.35));
  }
  T("tie-bar", add(works, new THREE.BoxGeometry(12.5, 0.2, 0.4), M.steel, 0.9, 3.05, drumZ + drumLen / 2 + 0.35));
  // Bell, hammer and its spring.
  const bellAt = [-10.4, 1.3, 5.2];
  const bellProfile = [[0.02, 1.32], [0.4, 1.3], [0.82, 1.08], [1.12, 0.6], [1.4, 0.06], [1.32, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const bell = T("bell", add(works, new THREE.LatheGeometry(bellProfile, 40), M.brass.clone(), ...bellAt));
  bell.material.side = THREE.DoubleSide;
  T("bell-post", add(works, cylY(0.14, 1.5, 12), M.steel, bellAt[0], bellAt[1] + 0.72, bellAt[2]));
  const hammer = new THREE.Group();
  hammer.position.set(bellAt[0] - 2.6, bellAt[1] + 0.2, bellAt[2]);
  add(hammer, new THREE.BoxGeometry(1.6, 0.1, 0.12), M.steel, 0.76, 0.12, 0);
  add(hammer, new THREE.SphereGeometry(0.22, 18, 14), M.chrome, 1.5, 0.22, 0);
  add(hammer, cylZ(0.16, 0.36, 14), M.steel, 0, 0.12, 0);
  works.add(hammer);
  T("hammer", hammer);
  const hammerSpring = helix(0.12, 1, 7, 0.022);
  T("hammer-spring", add(works, hammerSpring, M.steel, bellAt[0] - 2.2, 1.3, bellAt[2])).scale.y = 0.5;
  // Screws across the base plate and carry-lever comb.
  for (const x of [-14, -7, 0, 7, 14]) for (const z of [-10.8, 11.5]) T("base-screw", screw(works, M.chrome, x, 1.3, z, 0.17, x));
  T("comb", add(works, new THREE.BoxGeometry(12.6, 0.46, 0.34), M.walnutDark, 0.9, 1.5, -5.3));
  const coil = helix(0.16, 1.7, 11, 0.03);
  for (const x of [-10.6, -8.2, 11.4]) T("coil", add(works, coil, M.steel, x, 1.3, -1.8));

  // ---- the cover ----
  const cover = new THREE.Group();
  root.add(cover);
  const shell = new THREE.Shape();
  const P = [[-11.2, 1.25], [12.3, 1.25], [12.6, 1.7], [12.3, 2.15], [-1.1, 7.15], [-1.9, 7.75], [-2.7, 8.25], [-10.3, 8.25], [-11.15, 7.5]];
  shell.moveTo(P[0][0], P[0][1]);
  P.slice(1).forEach(([a, b]) => shell.lineTo(a, b));
  shell.closePath();
  const shellGeo = new THREE.ExtrudeGeometry(shell, { depth: BODY_W, bevelEnabled: true, bevelThickness: 0.28, bevelSize: 0.2, bevelSegments: 4, curveSegments: 4 });
  shellGeo.translate(0, 0, -BODY_W / 2);
  shellGeo.rotateY(-Math.PI / 2);
  shellGeo.computeVertexNormals();
  const coverMat = M.walnut.clone();
  const coverMesh = T("cover", add(cover, grained(shellGeo), coverMat));
  // The same cover cut into planks, unseen until it comes apart. Grain is mapped before they are centred, so it lines up.
  const SLICE_COUNT = 6;
  const sliceWidth = (BODY_W + 0.56) / SLICE_COUNT;
  const slices = [];
  for (let i = 0; i < SLICE_COUNT; i++) {
    const g = new THREE.ExtrudeGeometry(shell, { depth: sliceWidth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.2, bevelSegments: 1, curveSegments: 4 });
    g.rotateY(-Math.PI / 2);
    g.translate(-(BODY_W + 0.56) / 2 + (i + 1) * sliceWidth, 0, 0);
    g.computeVertexNormals();
    const mapped = grained(g);
    mapped.computeBoundingBox();
    const c = mapped.boundingBox.getCenter(new THREE.Vector3());
    mapped.translate(-c.x, -c.y, -c.z);
    const plank = add(cover, mapped, coverMat, c.x, c.y, c.z);
    plank.visible = false;
    slices.push(plank);
  }
  // Chrome trim along the foot of the cover and a nameplate on its top.
  const trimMat = M.brass.clone();
  const coverExtras = [T("trim", add(cover, rbox(BODY_W + 0.5, 0.18, 0.1, 0.03), trimMat, 0, 1.75, 12.92))];
  const namePlate = label(1024, 280, (g, w, h) => {
    g.fillStyle = "#c9a667"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#23150b"; g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = `900 176px ${TEXT_FONT}`;
    g.fillText("Carry", 44, 190);
    g.font = `500 44px ${TEXT_FONT}`;
    g.textAlign = "right";
    g.fillText("Model 20", w - 44, 110);
    g.fillText("10 · 10 · 20", w - 44, 172);
  });

  // ---- the deck: keys and setting wheels, mounted on the works ----
  const deck = new THREE.Group();
  deck.position.set(0, 4.9, 5.62);
  deck.rotation.x = Math.atan2(5.0, 13.4);
  root.add(deck);
  const deckY = 0.02;

  // Key well.
  const well = new RoundedBoxGeometry(26.6, 0.1, 11.1, 3, 0.05);
  const wellMesh = add(cover, well, M.plate.clone(), 0, 0, 0);
  wellMesh.position.copy(deck.position);
  wellMesh.rotation.copy(deck.rotation);
  wellMesh.translateZ(0.72);
  wellMesh.translateY(0.03);
  for (const [x, z] of [[-12.9, -5.15], [12.9, -5.15], [-12.9, 5.15], [12.9, 5.15]]) {
    const s = T("plate-screw", screw(wellMesh, M.chrome, x, 0.03, z, 0.14, x + z));
    s.traverse((o) => { if (o.isMesh && o.material === M.chrome) o.material = trimMat; });
  }

  const keys = {};
  const legend = (text, color, paper) => label(256, 256, (g, w, h) => {
    g.fillStyle = paper;
    g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
    const size = text.length > 2 ? 86 : text.length === 2 ? 110 : 142;
    g.font = `900 ${size}px ${TEXT_FONT}`;
    g.fillText(text, w / 2, h / 2 + size * 0.06);
  });
  const keyProfile = (r) => [[0, -0.5], [r * 0.86, -0.5], [r * 0.9, -0.1], [r, 0.04], [r, 0.2], [r * 0.93, 0.27], [0.0, 0.27]].map(([a, b]) => new THREE.Vector2(a, b));
  const keyGeos = new Map();
  const springGeo = helix(0.3, 2.2, 8, 0.035);
  const stemGeo = cylY(0.13, 2.5, 12); // stops short of the base plate
  const collarGeo = new THREE.TorusGeometry(0.72, 0.075, 10, 36).rotateX(Math.PI / 2);

  const makeKey = (name, text, x, z, material, ink, paper, r = 1.0) => {
    if (!keyGeos.has(r)) keyGeos.set(r, new THREE.LatheGeometry(keyProfile(r), 36));
    const group = new THREE.Group();
    group.position.set(x, deckY + 0.5, z);
    deck.add(group);
    const cap = add(group, keyGeos.get(r), material);
    const face = new THREE.MeshPhysicalMaterial({ map: legend(text, ink, paper), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2 });
    const top = add(group, new THREE.CircleGeometry(r * 0.9, 36), face, 0, 0.275, 0, -Math.PI / 2);
    top.castShadow = false;
    top.userData.ownMaterial = true;
    const stem = T("key-stem", add(group, stemGeo, M.steel, 0, -1.7, 0), text);
    const collar = T("key-collar", add(deck, collarGeo, trimMat, x, deckY + 0.13, z), text);
    collar.scale.setScalar(r / 0.72 * 0.98);
    const spring = T("key-spring", add(deck, springGeo, M.steel, x, deckY - 2.5, z), text);
    const hit = add(group, new THREE.CylinderGeometry(r * 1.12, r * 1.12, 1, 10), new THREE.MeshBasicMaterial({ visible: false }));
    hit.castShadow = false; hit.receiveShadow = false;
    hit.userData.action = { type: "key", key: name };
    hits.push(hit);
    T("key-cap", [cap, top, hit], text);
    keys[name] = { group, baseY: group.position.y, y: group.position.y, spring, stem, collar, collarBase: collar.scale.x, top, home: group.position.clone(), mech: top.material.map };
  };

  const CREAM_INK = "#23150b";
  const COL = [-2.45, 0, 2.45];
  const ROW = [-3.1, -0.65, 1.8, 4.25];
  [["7", 0, 0], ["8", 1, 0], ["9", 2, 0], ["4", 0, 1], ["5", 1, 1], ["6", 2, 1], ["1", 0, 2], ["2", 1, 2], ["3", 2, 2], ["0", 0, 3], [".", 1, 3]].forEach(([k, c, r]) => makeKey(k, k, COL[c], ROW[r], M.cream, CREAM_INK, "#ece4d0"));
  makeKey("+/-", "±", COL[2], ROW[3], M.cream, CREAM_INK, "#ece4d0");
  const OPX = 5.3, EQX = 7.9;
  [["/", "÷", 0], ["*", "×", 1], ["-", "−", 2], ["+", "+", 3]].forEach(([k, t, r]) => makeKey(k, t, OPX, ROW[r], M.pink, "#23150b", "#c98f2f"));
  makeKey("=", "=", EQX, ROW[3], M.red, "#ffffff", "#8f3a20");
  makeKey("C", "C", -5.3, ROW[2], M.grip, "#ece4d0", "#3a2214");
  makeKey("AC", "AC", -5.3, ROW[3], M.black, "#ece4d0", "#101312");
  makeKey("shift-left", "←", -10.6, ROW[3], M.steel, "#23150b", "#a79e8c", 0.9);
  makeKey("shift-right", "→", -8.2, ROW[3], M.steel, "#23150b", "#a79e8c", 0.9);

  // Motor bars: one press, one turn of the crank.
  const makeBar = (name, text, x, z, material, ink, paper) => {
    const group = new THREE.Group();
    group.position.set(x, deckY + 0.42, z);
    deck.add(group);
    const cap = add(group, rbox(1.9, 0.6, 3.5, 0.2), material);
    const face = new THREE.MeshStandardMaterial({ map: label(256, 472, (g, w, h) => {
      g.fillStyle = paper; g.fillRect(0, 0, w, h);
      g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 92px ${TEXT_FONT}`;
      g.fillText("Turn", w / 2, h / 2 - 50);
      g.font = `900 130px ${TEXT_FONT}`;
      g.fillText(text, w / 2, h / 2 + 62);
    }), roughness: 0.4 });
    const top = add(group, new THREE.PlaneGeometry(1.62, 3.0), face, 0, 0.305, 0, -Math.PI / 2);
    top.castShadow = false;
    const stem = T("key-stem", add(group, cylY(0.16, 2.2, 12), M.steel, 0, -1.3, 0), `Turn ${text}`);
    const collar = T("key-collar", add(deck, rbox(2.2, 0.16, 3.8, 0.06), trimMat, x, deckY + 0.06, z), `Turn ${text}`);
    const hit = add(group, new THREE.BoxGeometry(2.2, 1, 3.8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.castShadow = false;
    hit.userData.action = { type: "key", key: name };
    hits.push(hit);
    T("key-cap", [cap, top, hit], `Turn ${text}`);
    keys[name] = { group, baseY: group.position.y, y: group.position.y, spring: new THREE.Group(), stem, collar, collarBase: 1, top, home: group.position.clone(), mech: face.map, isBar: true };
  };
  makeBar("turn+", "+", 11.2, 2.9, M.cream, "#23150b", "#ece4d0");
  makeBar("turn-", "−", 11.2, -1.1, M.pink, "#23150b", "#c98f2f");

  // ---- the keys only the scientific calculator has: hidden in the deck until they are thrown out of the setting wheels ----
  const sciKey = (name, text, material, ink, paper) => {
    makeKey(name, text, 1 + (Object.keys(keys).length % 10 - 5) * PITCH, -6.35, material, ink, paper);
    const k = keys[name];
    k.sciOnly = true;
    k.group.visible = false;
    k.collar.visible = false;
    k.collarBase = 1 / 0.72 * 0.98;
    k.group.traverse((o) => { if (o.userData.action) o.userData.action.mode = "sci"; });
    k.sci = k.mech;
  };
  const BONE = "#ece4d0", DARK = "#3a2214", SOOT = "#101312", SOIL = "#23150b", OCHRE = "#c98f2f";
  sciKey("2nd", "2nd", M.pink, SOIL, OCHRE);
  sciKey("drg", "DRG", M.black, BONE, SOOT);
  for (const [n, t] of [["mc", "MC"], ["mr", "MR"], ["m+", "M+"], ["m-", "M\u2212"]]) sciKey(n, t, M.black, BONE, SOOT);
  for (const [n, t] of [["sin", "sin"], ["cos", "cos"], ["tan", "tan"], ["ln", "ln"], ["log", "log"], ["pow", "x\u02b8"], ["sqrt", "\u221a"], ["sq", "x\u00b2"], ["inv", "1/x"], ["fact", "n!"], ["pi", "\u03c0"], ["e", "e"]]) sciKey(n, t, M.grip, BONE, DARK);
  sciKey("%", "%", M.pink, SOIL, OCHRE);
  sciKey("cube", "x\u00b3", M.pink, SOIL, OCHRE);
  // What the keys it keeps say once the machine has turned.
  const relabel = { "shift-left": ["(", SOIL, "#a79e8c"], "shift-right": [")", SOIL, "#a79e8c"], C: ["DEL", BONE, DARK], AC: ["AC", BONE, "#101312"] };
  for (const [name, [text, ink, paper]] of Object.entries(relabel)) keys[name].sci = legend(text, ink, paper);
  const barLegend = (text, ink, paper) => label(256, 472, (g, w, h) => {
    g.fillStyle = paper; g.fillRect(0, 0, w, h);
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
    // The bar is squashed to fit a key's row, so the letters are drawn tall to come out right.
    g.save(); g.translate(w / 2, h / 2); g.scale(1, 1 / 0.58);
    g.font = `900 ${text.length > 2 ? 86 : 104}px ${TEXT_FONT}`;
    g.fillText(text, 0, 4);
    g.restore();
  });
  keys["turn+"].sci = barLegend("Ans", "#23150b", "#ece4d0");
  keys["turn-"].sci = barLegend("EE", "#23150b", "#c98f2f");
  const SHIFTED = { sin: "sin\u207b\u00b9", cos: "cos\u207b\u00b9", tan: "tan\u207b\u00b9", ln: "e\u02e3", log: "10\u02e3", pow: "\u02b8\u221a", sqrt: "\u221b", sq: "x\u00b3", inv: "Abs", fact: "Ran" };
  for (const [name, text] of Object.entries(SHIFTED)) keys[name].shifted = legend(text, BONE, DARK);

  // Name plate on the deck, to the left of the keys.
  const plateTex = new THREE.MeshStandardMaterial({ map: namePlate, metalness: 0.45, roughness: 0.42 });
  const plateMesh = add(wellMesh, new THREE.PlaneGeometry(6.4, 1.75), plateTex, -9.15, 0.11, -3.47, -Math.PI / 2);
  plateMesh.castShadow = false;
  T("nameplate", plateMesh);

  // Setting wheels in their housing at the head of the deck.
  const housing = new THREE.Group();
  housing.position.set(1, 0.92, -6.35);
  housing.rotation.x = 0.16;
  deck.add(housing);
  const SH_W = 12.4, SH_D = 2.3;
  const setHoles = [];
  for (let i = 0; i < 10; i++) setHoles.push({ x: S0X - 1 - i * PITCH, y: 0, w: 0.98, h: 0.92 });
  T("setting-plate", add(housing, plateWithHoles(SH_W, SH_D, setHoles, 0.09), M.plate));
  const tray = new THREE.Group();
  housing.add(tray);
  hollowTray(tray, M.black, SH_W - 0.1, 1.9, SH_D - 0.1);
  T("setting-tray", tray);
  const settingWheels = [];
  for (let i = 0; i < 10; i++) settingWheels.push(T("setting-wheel", wheelAssembly(housing, S0X - 1 - i * PITCH, -0.98, 0, 0.95, 1.0, digitsCream)));
  for (const x of [-SH_W / 2 + 0.28, SH_W / 2 - 0.28]) for (const z of [-0.8, 0.8]) T("setting-screw", screw(housing, M.chrome, x, 0.1, z, 0.1, x + z));
  const setMark = T("setting-mark", add(housing, new THREE.ConeGeometry(0.12, 0.26, 3).rotateX(-Math.PI / 2), M.red, 0, 0.14, -0.74));

  // ---- the carriage ----
  const carriageRig = new THREE.Group();
  carriageRig.position.set(0, 9.0, -6.75);
  root.add(carriageRig);
  const carriage = new THREE.Group();
  carriageRig.add(carriage);
  const xA = (i) => S0X - i * PITCH;
  const C_LEN = 20 * PITCH + 1.6, C_MID = (xA(0) + xA(19)) / 2;
  const cBody = grained(rbox(C_LEN + 1.2, 1.5, 5.2, 0.34), 0.23);
  T("carriage-body", add(carriage, cBody, coverMat, C_MID, 0.4, 0));
  // Bushings on the rails.
  for (const z of [-2.15, 2.15]) for (const x of [xA(19) + 0.6, xA(0) - 0.6]) T("bushing", add(carriage, rbox(1.4, 0.5, 0.7, 0.08), M.steel, x, -0.26, z));
  // Accumulator row, tilted to the operator.
  const aRow = new THREE.Group();
  aRow.position.set(C_MID, 1.72, 0.92);
  aRow.rotation.x = 0.46;
  carriage.add(aRow);
  const aHoles = [];
  for (let i = 0; i < 20; i++) aHoles.push({ x: xA(i) - C_MID, y: 0, w: 0.98, h: 0.92 });
  T("answer-plate", add(aRow, plateWithHoles(C_LEN, 2.2, aHoles, 0.09), M.plate));
  const aTray = new THREE.Group();
  aRow.add(aTray);
  hollowTray(aTray, M.black, C_LEN - 0.1, 1.15, 2.1);
  T("answer-tray", aTray);
  const aWheels = [], cWheels = [], pawls = [];
  for (let i = 0; i < 20; i++) {
    const w = T("answer-wheel", wheelAssembly(aRow, xA(i) - C_MID, -0.98, 0, 0.95, 1.0, digitsCream));
    aWheels.push(w);
  }
  const aMark = T("answer-mark", add(aRow, new THREE.ConeGeometry(0.12, 0.26, 3).rotateX(-Math.PI / 2), M.red, 0, 0.14, -0.72));
  // Counter row, behind and above. Dark wheels so the eye separates it from the answer.
  const cRow = new THREE.Group();
  cRow.position.set(C_MID, 2.42, -1.36);
  cRow.rotation.x = 0.3;
  carriage.add(cRow);
  const cHoles = [];
  for (let i = 0; i < 10; i++) cHoles.push({ x: xA(i) - C_MID, y: 0, w: 0.98, h: 0.92 });
  const flagHole = { x: xA(12) - C_MID, y: 0, w: 2.8, h: 0.92 };
  T("counter-plate", add(cRow, plateWithHoles(C_LEN, 2.2, [...cHoles, flagHole], 0.09), M.plate));
  const cTray = new THREE.Group();
  cRow.add(cTray);
  hollowTray(cTray, M.black, C_LEN - 0.1, 1.2, 2.1);
  T("counter-tray", cTray);
  for (let i = 0; i < 10; i++) cWheels.push(T("counter-wheel", wheelAssembly(cRow, xA(i) - C_MID, -0.98, 0, 0.95, 1.0, digitsDark)));
  const cMark = T("counter-mark", add(cRow, new THREE.ConeGeometry(0.12, 0.26, 3).rotateX(-Math.PI / 2), M.red, 0, 0.14, -0.74));
  // The sign flag, rising in its own window, and a small plate with the row names.
  const signFlag = new THREE.Group();
  signFlag.position.set(flagHole.x, -1, 0);
  add(signFlag, new THREE.BoxGeometry(2.7, 0.08, 0.86), M.red);
  const minus = add(signFlag, new THREE.BoxGeometry(1.1, 0.02, 0.18), M.cream, 0, 0.05, 0);
  minus.castShadow = false;
  cRow.add(signFlag);
  T("sign-flag", signFlag);
  const rowPlate = label(720, 110, (g, w, h) => {
    g.fillStyle = "#b9965a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#23150b"; g.textBaseline = "middle"; g.font = `500 44px ${TEXT_FONT}`;
    g.fillText("Counter  →", 20, h / 2 + 3);
  });
  T("row-plate", add(cRow, new THREE.PlaneGeometry(3.6, 0.55), new THREE.MeshStandardMaterial({ map: rowPlate, roughness: 0.4, metalness: 0.4 }), xA(15.4) - C_MID, 0.122, 0, -Math.PI / 2)).castShadow = false;
  // Carry pawls behind the accumulator: little levers that visibly flick on a carry.
  for (let i = 1; i < 20; i++) {
    const pawl = T("carry-pawl", add(aRow, new THREE.BoxGeometry(0.12, 0.08, 0.5), M.brass, xA(i) - C_MID + PITCH / 2, 0.14, 0.86));
    pawls[i] = pawl;
  }
  // End caps and shift knobs.
  for (const [x, side] of [[C_MID - C_LEN / 2 - 0.65, -1], [C_MID + C_LEN / 2 + 0.65, 1]]) {
    T("end-cap", add(carriage, grained(rbox(0.5, 3.4, 5.0, 0.2), 0.61), M.walnutDark, x, 1.3, 0));
    const knob = [add(carriage, cylX(0.85, 0.82, 36), M.chrome, x + side * 0.6, 1.3, 1.4)];
    for (let n = 0; n < 24; n++) {
      const a = (n / 24) * Math.PI * 2;
      knob.push(add(carriage, new THREE.BoxGeometry(0.76, 0.05, 0.05), M.steel, x + side * 0.6, 1.3 + Math.cos(a) * 0.86, 1.4 + Math.sin(a) * 0.86, a));
    }
    T("shift-knob", knob);
  }
  // Clear levers on the carriage ends.
  const lever = (x, y, z, action, ball) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    carriage.add(g);
    add(g, cylX(0.16, 0.5, 14), M.steel, 0, 0, 0);
    add(g, cylY(0.09, 1.6, 12), M.chrome, 0, 0.8, 0);
    add(g, new THREE.SphereGeometry(0.34, 22, 16), ball, 0, 1.7, 0);
    const hit = add(g, new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), 0, 1.5, 0);
    hit.castShadow = false;
    hit.userData.action = { type: "key", key: action, mode: "mech" };
    hits.push(hit);
    T("clear-lever", g);
    return g;
  };
  const clearA = lever(C_MID + C_LEN / 2 + 0.65, 3.0, -1.2, "clear-a", M.pink);
  const clearC = lever(C_MID - C_LEN / 2 - 0.65, 3.0, -1.2, "clear-c", M.grip);

  // Position ruler on the cover, so the shift can be read.
  const ruler = label(1280, 56, (g, w, h) => {
    g.fillStyle = "#b9965a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#23150b"; g.font = `900 32px ${TEXT_FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i < 10; i++) g.fillText(String(i), ((i + 0.5) / 10) * w, h / 2 + 2);
  });
  const rulerMesh = add(cover, new THREE.PlaneGeometry(PITCH * 10, 0.42), new THREE.MeshStandardMaterial({ map: ruler, roughness: 0.4, metalness: 0.4 }), 11 - 0.6, 7.54, -1.2, -Math.atan2(1, 1) * 0.98);
  rulerMesh.castShadow = false;
  T("ruler", rulerMesh);
  coverExtras.push(rulerMesh);

  // ---- the crank ----
  const crankRadius = 4.3;
  const crankHome = new THREE.Vector3(16.15, 5.6, 3.4);
  const crankRig = new THREE.Group();
  crankRig.position.copy(crankHome);
  root.add(crankRig);
  const crank = new THREE.Group();
  crankRig.add(crank);
  const hub = new THREE.Group();
  hub.position.copy(crankHome);
  root.add(hub);
  T("crank-boss", [add(hub, cylX(0.86, 0.5, 36), M.steel, -0.4), add(hub, cylX(1.15, 0.12, 40), M.chrome, -0.59)]);
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * Math.PI * 2;
    T("hub-bolt", add(hub, cylX(0.07, 0.07, 10), M.black, -0.55, Math.cos(a) * 0.92, Math.sin(a) * 0.92));
  }
  T("crank-collar", add(crank, cylX(0.55, 0.6, 28), M.chrome, 0.18, 0, 0));
  const arm = new THREE.Shape();
  arm.moveTo(-0.46, 0);
  arm.lineTo(-0.24, crankRadius);
  arm.absarc(0, crankRadius, 0.24, Math.PI, 0, true);
  arm.lineTo(0.46, 0);
  arm.absarc(0, 0, 0.46, 0, Math.PI, true);
  const armGeo = new THREE.ExtrudeGeometry(arm, { depth: 0.16, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  armGeo.rotateY(Math.PI / 2);
  T("crank-arm", add(crank, armGeo, M.chrome, 0.38, 0, 0));
  T("crank-pin", add(crank, cylX(0.13, 0.5, 12), M.steel, 0.68, crankRadius, 0));
  const grip = new THREE.Group();
  grip.position.set(0.9, crankRadius, 0);
  const gripPoints = [[0, 0], [0.32, 0.03], [0.46, 0.5], [0.5, 1.0], [0.42, 1.8], [0.46, 2.1], [0.3, 2.42], [0, 2.46]].map(([a, b]) => new THREE.Vector2(a, b));
  add(grip, new THREE.LatheGeometry(gripPoints, 28).rotateZ(-Math.PI / 2), M.grip);
  crank.add(grip);
  const crankHit = add(crank, new THREE.SphereGeometry(1.55, 10, 8), new THREE.MeshBasicMaterial({ visible: false }), 2.0, crankRadius, 0);
  crankHit.castShadow = false;
  crankHit.userData.action = { type: "crank", mode: "mech" };
  hits.push(crankHit);
  T("crank-grip", [grip, crankHit]);

  // ---- placing every moving part from a pose ----
  // ---- the scientific calculator's own parts ----
  const { WIDTH: SW, HEIGHT: SH, THICK: ST } = SCI;
  // Laid out flat (y thick, z tall) so its grain runs across, then stood up like the deck.
  const body = add(root, grained(rbox(SW, ST, SH, 0.5), 0.15), M.walnut.clone());
  body.position.copy(FACE.centre);
  body.quaternion.copy(FACE.deck);
  body.visible = false;
  const sciFront = new THREE.Group();
  sciFront.visible = false;
  deck.add(sciFront);
  T("display-bezel", add(sciFront, rbox(15.2, 0.36, 6.1, 0.12), M.black, 0, 0.2, -10.45));
  const SCREEN_W = 1024, SCREEN_H = 400;
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = SCREEN_W; screenCanvas.height = SCREEN_H;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 8;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  const screen = add(sciFront, new THREE.PlaneGeometry(14.4, 5.4), screenMat, 0, 0.39, -10.45, -Math.PI / 2);
  screen.castShadow = false;
  T("display-screen", screen);
  const crest = label(1024, 80, (g, w, h) => {
    g.fillStyle = "#c2a063"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#23150b"; g.textBaseline = "middle"; g.textAlign = "left"; g.font = `900 56px ${TEXT_FONT}`;
    g.fillText("Carry", 16, h / 2 + 3);
    g.textAlign = "right"; g.font = `500 40px ${TEXT_FONT}`;
    g.fillText("Model 20 Scientific", w - 16, h / 2 + 3);
  });
  const crestMesh = add(sciFront, new THREE.PlaneGeometry(14.4, 1.1), new THREE.MeshStandardMaterial({ map: crest, roughness: 0.5, metalness: 0.4 }), 0, 0.14, -14.1, -Math.PI / 2);
  crestMesh.castShadow = false;
  T("crest", crestMesh);
  for (const [x, z] of [[-7.5, -14.7], [7.5, -14.7], [-7.5, 14.4], [7.5, 14.4]]) T("display-screw", screw(sciFront, M.chrome, x, 0.08, z, 0.15, x + z));

  // Amber on near-black, like a vacuum-fluorescent display of the 1970s.
  let screenState = { expression: "", main: "0", flags: "" };
  const drawScreen = () => {
    const g = screenCanvas.getContext("2d");
    g.fillStyle = "#0d0a06"; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.fillStyle = "#ffb347"; g.textBaseline = "alphabetic";
    g.font = `500 44px ${TEXT_FONT}`; g.textAlign = "left";
    g.fillText(screenState.flags, 30, 62);
    const fit = (text, size, right, y, weight) => {
      let s = size;
      g.textAlign = "right";
      g.font = `${weight} ${s}px ${TEXT_FONT}`;
      const room = SCREEN_W - 60;
      while (g.measureText(text).width > room && s > 60) { s -= 6; g.font = `${weight} ${s}px ${TEXT_FONT}`; }
      // A long expression shows its end, where you're typing.
      let shown = text;
      while (g.measureText(shown).width > room && shown.length > 1) shown = shown.slice(1);
      g.fillText(shown, right, y);
    };
    if (screenState.expression) fit(screenState.expression, 72, SCREEN_W - 30, 160, 500);
    fit(screenState.main, 170, SCREEN_W - 30, 348, 900);
    screenTex.needsUpdate = true;
  };
  drawScreen();
  labelJobs.push(drawScreen);

  const board = buildBoard({ add, rbox, cylY, label, font: TEXT_FONT, tag: T });
  deck.add(board.group);

  // ---- the faces nobody saw until the machine could be turned right over ----
  const sheet = new THREE.MeshStandardMaterial({ color: 0x24211c, roughness: 0.55, metalness: 0.75 });
  const slot = new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.9 });
  // A screw head facing down, or out of the back.
  const under = (parent, x, y, z, r, turn) => { const s = screw(parent, M.chrome, x, y, z, r, turn); s.rotation.x = Math.PI; return s; };
  const behind = (parent, x, y, z, r, turn) => { const s = screw(parent, M.chrome, x, y, z, r, 0); s.rotation.set(-Math.PI / 2, turn, 0); return s; };
  const dataPlate = (title, lines, w = 1024, h = 360) => label(w, h, (g) => {
    g.fillStyle = "#c2a063"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#23150b"; g.lineWidth = 5; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = "#23150b"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.font = `900 112px ${TEXT_FONT}`; g.fillText(title, 44, 134);
    g.font = `500 44px ${TEXT_FONT}`;
    lines.forEach((line, i) => g.fillText(line, 44, 210 + i * 58));
  });

  // Underneath the mechanical calculator, and under the plinth it draws in to.
  const underPlate = add(base, rbox(29.4, 0.1, 22.8, 0.04), sheet, 0, 0.66, 0.5);
  for (const x of [-4.8, 4.8]) for (const z of [3.6, 8.4]) T("hatch-screw", under(base, x, 0.53, z, 0.2, x + z));
  for (const [x, z] of [[-7, -9.5], [0, -9.5], [7, -9.5], [-7, 11.5], [0, 11.5], [7, 11.5], [-13.6, 0.5], [13.6, 0.5]]) T("under-screw", under(base, x, 0.61, z, 0.16, x));
  const hatch = add(base, rbox(11, 0.08, 6.2, 0.03), M.plate, 0, 0.59, 6);
  const underLabel = add(base, new THREE.PlaneGeometry(8.4, 2.95), new THREE.MeshStandardMaterial({ map: dataPlate("Carry", ["Model 20, serial 01234", "Oil the drums. Never the carry levers."]), roughness: 0.45, metalness: 0.4 }), 0, 0.605, -4.4, Math.PI / 2);
  underLabel.castShadow = false;
  const vents = [];
  for (let i = 0; i < 8; i++) vents.push(add(base, new THREE.BoxGeometry(0.4, 0.03, 3.2), slot, -13 + i * 1.1, 0.605, 6));
  T("under-label", underLabel);
  T("hatch", hatch);
  vents.forEach((v) => T("vent", v));
  T("under-plate", underPlate);
  T("base-plate", basePlate);

  // On the back of the mechanical cover.
  const rearPlate = add(cover, new THREE.PlaneGeometry(8.4, 2.95), new THREE.MeshStandardMaterial({ map: dataPlate("Carry", ["Model 20, serial 01234", "10 setting, 10 counter, 20 answer"]), roughness: 0.45, metalness: 0.4 }), -8, 4.65, -11.47, 0, Math.PI);
  rearPlate.castShadow = false;
  const rearScrews = [-12, -4].flatMap((x) => [3.35, 5.95].map((y) => behind(cover, x, y, -11.47, 0.13, x + y)));
  const rearVents = [];
  for (let i = 0; i < 6; i++) rearVents.push(add(cover, rbox(9, 0.26, 0.04, 0.01), slot, 7, 2.9 + i * 0.72, -11.46));
  coverExtras.push(rearPlate, ...rearScrews, ...rearVents);
  T("rear-plate", rearPlate);
  rearScrews.forEach((s) => T("rear-screw", s));
  rearVents.forEach((v) => T("rear-vent", v));

  // On the back of the scientific body. The body lies flat in its own terms, so its back is its underside.
  const backY = -ST / 2 - 0.02;
  const backHatch = add(body, rbox(11.6, 0.08, 9, 0.03), M.plate, 0, backY, -7.6);
  const backScrews = [-5.3, 5.3].flatMap((x) => [-11.6, -3.6].map((z) => under(body, x, backY - 0.02, z, 0.2, x + z)));
  const backVents = [];
  for (let i = 0; i < 7; i++) backVents.push(add(body, new THREE.BoxGeometry(8.4, 0.03, 0.34), slot, 0, backY - 0.045, -10.3 + i * 0.9));
  const backLabel = add(body, new THREE.PlaneGeometry(9.4, 3.3), new THREE.MeshStandardMaterial({ map: dataPlate("Carry", ["Model 20 Scientific, serial 01234", "DRG changes degrees, radians, grads"]), roughness: 0.45, metalness: 0.4 }), 3, backY, 11.2, Math.PI / 2, 0, Math.PI);
  backLabel.castShadow = false;
  T("back-label", backLabel);
  backVents.forEach((v) => T("back-vent", v));
  backScrews.forEach((s) => T("back-screw", s));
  T("back-hatch", backHatch);

  let morph = 0;
  const applyMorph = buildMorph({
    root, base, frames, rails, works, hub, deck, housing, keys, carriageRig, crankRig, slices, sliceWidth, coverMesh, coverExtras,
    plate: wellMesh, plateChildren: [...wellMesh.children], carriageMid: (xA(0) + xA(19)) / 2, body, sciFront,
    sciBrightness: (b) => screenMat.color.setScalar(0.04 + 0.96 * b),
  });

  const markX = (dec, row) => xA(0) + PITCH / 2 - Math.min(dec, row) * PITCH;
  const pose3d = {
    apply(p) {
      // As the machine turns every wheel spins up, the carriage centres itself and the crank winds back to rest.
      const whirl = morph * morph * 40;
      aWheels.forEach((w, i) => { w.rotation.x = -(p.aw[i] + whirl * (1 + i % 3)) * DIGIT; });
      cWheels.forEach((w, i) => { w.rotation.x = -(p.cw[i] + whirl * (1 + i % 2)) * DIGIT; });
      settingWheels.forEach((w, i) => { w.rotation.x = -(p.sw[i] + whirl) * DIGIT; });
      // Both are finished before they travel: a crank still unwinding would swing its handle across the keys.
      const wound = Math.min(1, morph / 0.1);
      carriage.position.x = p.pos * PITCH * (1 - wound);
      const windDown = wound * wound * (3 - 2 * wound);
      const turn = p.crank * Math.PI * 2 * (1 - windDown);
      crank.rotation.x = turn;
      grip.rotation.x = -turn;
      crossShaft.rotation.x = turn;
      crossGears.forEach((g) => { g.rotation.x = turn; });
      bigGear.rotation.x = turn * 0.4;
      smallGear.rotation.x = -turn;
      const whole = Math.round(p.pos);
      for (let i = 0; i < 10; i++) {
        drums[i].rotation.z = turn;
        const z = drumZ + drumLen / 2 - 0.2 - (p.sd[i] / 9) * (drumLen - 0.3);
        pinions[i].position.z = z;
        forks[i].position.z = z;
        const wheel = p.aw[i + whole] ?? 0;
        pinions[i].rotation.z = wheel * DIGIT;
        shafts[i].rotation.z = wheel * DIGIT;
      }
      for (let i = 1; i < 20; i++) pawls[i].rotation.y = p.carry[i] * 0.8;
      signFlag.position.y = -0.45 - (1 - p.flag) * 0.75;
      setMark.position.x = (p.sDec > 0 ? S0X - 1 + PITCH / 2 - Math.min(p.sDec, 9) * PITCH : S0X - 1 + PITCH / 2);
      aMark.position.x = markX(p.aDec, 19) - C_MID;
      cMark.position.x = p.cDec >= 0 ? markX(p.cDec, 9) - C_MID : xA(0) - C_MID + PITCH / 2;
      clearA.rotation.x = -0.55 * p.clearA;
      clearC.rotation.x = -0.55 * p.clearC;
      hammer.rotation.z = p.bell * -0.5 + 0.08;
    },
    // Press depth, 0 up to 1 down, for one key.
    setKey(name, depth) {
      const k = keys[name];
      if (!k) return;
      k.depth = depth;
      k.group.position.y = k.y - depth * 0.46;
      k.spring.scale.y = 1 - depth * 0.2;
    },
    // 0 is the mechanical calculator, 1 the scientific one. Anything between is the transformation.
    setMorph(m) {
      morph = m;
      applyMorph(m);
    },
    // The 2nd key changes what the function keys say.
    setSecond(on) {
      for (const k of Object.values(keys)) {
        if (!k.shifted) continue;
        k.top.material.map = on ? k.shifted : k.mech;
      }
    },
    setScreen(state) {
      screenState = state;
      drawScreen();
    },
    // Builds the board's shaders ahead of time, so the first lift of the cover doesn't stutter.
    warm(renderer, scene, camera) {
      const shown = board.group.visible;
      board.group.visible = true;
      renderer.compile(scene, camera);
      board.group.visible = shown;
    },
    // A key made contact: light its row and column on the board.
    fireBoard: (name) => board.fire(name),
    tickBoard: (dt) => board.tick(dt),
    // Works out where each part goes for the calculator as it stands. Called just before the cover lifts.
    prepareParts() {
      board.group.visible = morph >= 1;
      return exploded.prepare(morph >= 1 ? "sci" : "mech");
    },
    // 0 is whole, 1 is every part floating free.
    setCover(v) {
      const e = Math.max(0, v);
      if (e === exploded.level) return;
      exploded.apply(e);
      if (e === 0) board.group.visible = false;
    },
  };

  // Frames and posts last, because the morph needed them as a list.
  frames.slice(0, 2).forEach((f) => T("side-frame", f));
  frames.slice(2).forEach((f) => T("post", f));
  T("plate", wellMesh);
  T("body", body);
  pose3d.setMorph(0);
  const exploded = buildExplode(root, tagged);
  return { root, hits, pose: pose3d, exploded, crankRadius, crank, crankHome, carriage, redrawLabels: () => labelJobs.forEach((job) => job()), keys };
}

// A photo studio for the lacquer to reflect: a dim room and a few bright strip lights.
// Gloss reads through crisp highlights against dark reflections, so the room must not be bright.
function studio() {
  const room = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.MeshBasicMaterial({ color: 0x423a30, side: THREE.BackSide }));
  room.add(shell);
  const panel = (w, h, x, y, z, power, tint = 0xffffff) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(power), side: THREE.DoubleSide }));
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 5, 0);
    room.add(mesh);
  };
  // The deck mirrors the sky almost straight up from the default view, so only thin strips go there:
  // a broad overhead light would turn the whole deck into one white reflection.
  panel(170, 5, -32, 92, -36, 5); // the sharp streak across the deck
  panel(170, 2, -32, 90, -47, 3); // and its thin companion
  panel(120, 6, -28, 62, -72, 4); // highlight on the top of the case and the carriage
  panel(60, 24, 10, 58, 92, 3.2); // front softbox, caught by the domes of the keys
  panel(16, 90, -86, 26, 16, 14); // left and right strips: edge highlights on the body and chrome
  panel(12, 80, 88, 24, 6, 11);
  panel(150, 20, 0, 8, 100, 0.8, 0xe8dcc4); // low front fill, tinted by the room
  panel(200, 200, 0, -40, 0, 0.35, 0xb9bf9c); // the table, bounced up
  return room;
}

export function buildStage(renderer, { shadow = 0x2a1c0c } = {}) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.022).texture;
  scene.environmentIntensity = 1;
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0xa89a7c, 0.8));
  const key = new THREE.DirectionalLight(0xfff4e4, 1.9);
  key.position.set(-14, 34, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -32, right: 32, top: 26, bottom: -26, near: 4, far: 90 });
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfffe9, 0.5);
  fill.position.set(26, 8, 12);
  scene.add(fill);
  // Light for the faces that used to be out of sight: the back and the underside.
  const back = new THREE.DirectionalLight(0xfff0dc, 1.15);
  back.position.set(10, -1, -30);
  scene.add(back);
  const below = new THREE.DirectionalLight(0xfff0dc, 1.5);
  below.position.set(-8, -30, 8);
  scene.add(below);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ color: shadow, opacity: 0.36 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return { scene, key, floor };
}
