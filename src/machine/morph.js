// The transformation. Everything here is a pure function of one number, m, from 0 (mechanical) to 1 (scientific),
// so it can run forwards, run backwards, be reversed halfway, or be jumped for reduced motion.
//
// The machine's own parts become the new one: the cover's planks lock together as the body, the brass key plate
// stretches into the faceplate, the keys scatter and re-form, the rails become side trim, the carriage flips into
// a crown on top, the base shrinks to a plinth, and the crank folds down into a stand.
import * as THREE from "three";

export const SCI = { WIDTH: 17, HEIGHT: 31, THICK: 2.6, LEAN: 0.2, BOTTOM: new THREE.Vector3(0, 1.3, 3) };

const QX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const QZ = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);

export const FACE = (() => {
  const body = QX(-SCI.LEAN);
  const centre = SCI.BOTTOM.clone().add(new THREE.Vector3(0, SCI.HEIGHT / 2, 0).applyQuaternion(body));
  const onBody = (x, y, z) => centre.clone().add(new THREE.Vector3(x, y, z).applyQuaternion(body));
  return { body, deck: body.clone().multiply(QX(Math.PI / 2)), centre, onBody };
})();

// Where each key ends up, in the deck's own flat coordinates: x across, z down the face.
const ROW_TOP = [-6.2, -3.85, -1.5, 0.85];
const ROW_LOW = [4.0, 6.85, 9.7, 12.55];
const top = (col, row) => ({ x: -6.5 + 2.6 * col, z: ROW_TOP[row], s: 0.95 });
const low = (col, row) => ({ x: -6.2 + 3.1 * col, z: ROW_LOW[row], s: 1.18 });
export const LAYOUT = {
  "2nd": top(0, 0), drg: top(1, 0), mc: top(2, 0), mr: top(3, 0), "m+": top(4, 0), "m-": top(5, 0),
  sin: top(0, 1), cos: top(1, 1), tan: top(2, 1), ln: top(3, 1), log: top(4, 1), pow: top(5, 1),
  sqrt: top(0, 2), sq: top(1, 2), inv: top(2, 2), fact: top(3, 2), pi: top(4, 2), e: top(5, 2),
  "shift-left": top(0, 3), "shift-right": top(1, 3), "turn-": top(2, 3), "turn+": top(3, 3), C: top(4, 3), AC: top(5, 3),
  7: low(0, 0), 8: low(1, 0), 9: low(2, 0), "/": low(3, 0), "%": low(4, 0),
  4: low(0, 1), 5: low(1, 1), 6: low(2, 1), "*": low(3, 1), cube: low(4, 1),
  1: low(0, 2), 2: low(1, 2), 3: low(2, 2), "-": low(3, 2),
  0: low(0, 3), ".": low(1, 3), "+/-": low(2, 3), "+": low(3, 3),
  "=": { x: -6.2 + 3.1 * 4, z: (ROW_LOW[2] + ROW_LOW[3]) / 2, s: 1.5 },
};

const ramp = (m, a, b) => Math.min(1, Math.max(0, (m - a) / (b - a)));
// Starts and stops with no velocity and no acceleration, so nothing ever jerks into motion.
const glide = (u) => u * u * u * (u * (u * 6 - 15) + 10);
// A damped spring: leaves from rest, arrives, slightly overruns and settles, the way a heavy part seats itself.
const seat = (() => {
  const zeta = 0.74, w = 7.5;
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const raw = (u) => 1 - Math.exp(-zeta * w * u) * (Math.cos(wd * u) + ((zeta * w) / wd) * Math.sin(wd * u));
  const end = raw(1);
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    return raw(u ** 1.5) + (1 - end) * u; // the power eases the very first moment, the last term lands it exactly
  };
})();

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GONE = V(0.001, 0.001, 0.001);

// One part's moves, as a list of separate steps: slide, then turn, then lock. Machines read as machines
// when each motion finishes its job before the next begins, so a part never just floats to where it's going.
function chain(obj, steps) {
  const A = { p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() };
  const P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();
  return (m) => {
    P.copy(A.p); Q.copy(A.q); S.copy(A.s);
    for (const st of steps) {
      const e = (st.ease ?? glide)(ramp(m, st.t0, st.t1));
      if (e === 0) continue;
      if (st.p) P.lerp(st.p, e);
      if (st.q) Q.slerp(st.q, e);
      if (st.s) S.lerp(st.s, e);
    }
    obj.position.copy(P); obj.quaternion.copy(Q); obj.scale.copy(S);
  };
}

export function buildMorph(p) {
  const { WIDTH: W, HEIGHT: H, THICK: T } = SCI;
  const moves = [];
  const add = (obj, steps) => moves.push(chain(obj, steps));
  const shown = [];
  const showBetween = (obj, a, b) => shown.push({ obj, a, b });
  const deckAt = FACE.onBody(0, 0, T / 2 + 0.06);

  // ---- 1. Unlock. The crank hub folds away and the trim comes off while the keys ripple ----
  add(p.hub, [{ s: GONE, t0: 0.03, t1: 0.17 }]);
  showBetween(p.hub, -1, 0.17);
  for (const part of p.coverExtras) {
    add(part, [{ s: GONE, t0: 0.02, t1: 0.12 }]);
    showBetween(part, -1, 0.12);
  }
  for (const part of p.plateChildren) {
    add(part, [{ s: GONE, t0: 0.02, t1: 0.12 }]);
    showBetween(part, -1, 0.12);
  }

  // ---- 2. The cover opens: planks part, lift, swing upright and stand in a row behind the machine like a fence ----
  const n = p.slices.length;
  p.slices.forEach((slice, i) => {
    const order = Math.abs(i - (n - 1) / 2); // from the middle out
    const fromEdge = (n - 1) / 2 - order;
    const x = -W / 2 + ((i + 0.5) * W) / n;
    const c = slice.position;
    const fence = FACE.onBody(x * 1.42, -0.6, -T * 1.6);
    add(slice, [
      { p: V(c.x * 1.22, c.y + 5 + (i % 2) * 1.6, c.z - 1.5), t0: 0.07 + order * 0.025, t1: 0.2 + order * 0.025 },
      { p: fence, q: FACE.deck, s: V(1, 0.82, H / 25), t0: 0.2 + order * 0.022, t1: 0.42 + order * 0.022, ease: seat },
      // 4. The fence closes up from the outside in and locks as the body.
      {
        p: FACE.onBody(x * 0.97, 0, 0),
        // A little inside the finished body, so the body can rise through them without a visible swap.
        s: V((W * 0.97) / (p.sliceWidth * n), (T * 0.84) / 7.4, (H * 0.97) / 25),
        t0: 0.5 + fromEdge * 0.022,
        t1: 0.64 + fromEdge * 0.022,
        ease: seat,
      },
    ]);
  });
  for (const part of p.frames) {
    add(part, [{ s: V(1, 0.001, 1), t0: 0.2, t1: 0.36 }]);
    showBetween(part, -1, 0.36);
  }
  add(p.works, [{ p: V(0, 1.4, 2), s: GONE, t0: 0.2, t1: 0.42 }]);
  showBetween(p.works, -1, 0.42);

  // The carriage rises straight up, turns over in the air with its wheels running, then comes down as the crown.
  const crownScale = 0.66;
  const crown = FACE.body.clone().multiply(QX(Math.PI));
  const rig = p.carriageRig.position;
  add(p.carriageRig, [
    { p: V(rig.x, rig.y + 13, rig.z - 2), t0: 0.06, t1: 0.2 },
    { q: crown, t0: 0.2, t1: 0.42 },
    {
      p: FACE.onBody(-p.carriageMid * crownScale, H / 2 - 0.9, -T / 2 - 0.45),
      s: V(crownScale, crownScale, crownScale),
      t0: 0.44,
      t1: 0.66,
      ease: seat,
    },
  ]);

  // The rails draw out sideways, swing upright, then clamp onto the sides.
  p.rails.forEach((rail, i) => {
    const side = i ? 1 : -1;
    const upright = FACE.body.clone().multiply(QZ(Math.PI / 2));
    add(rail, [
      { p: V(side * 20, rail.position.y + 3, rail.position.z + 2), t0: 0.1 + i * 0.03, t1: 0.26 + i * 0.03 },
      { p: FACE.onBody(side * (W / 2 + 4.5), 0, 0), q: upright, s: V((H / 34.6) * 0.98, 0.8, 0.8), t0: 0.28 + i * 0.03, t1: 0.48 + i * 0.03 },
      { p: FACE.onBody(side * (W / 2 + 0.28), 0, 0), t0: 0.62 + i * 0.03, t1: 0.72 + i * 0.03, ease: seat },
    ]);
  });

  // The crank winds back behind the machine and folds down as the stand.
  const strut = V(0, -0.84, -0.54).normalize();
  add(p.crankRig, [
    { p: V(14, 11, -11), q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(0, 0, -1)), t0: 0.1, t1: 0.32 },
    {
      p: FACE.onBody(-3.2, -7, -T / 2 - 0.1),
      q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), strut),
      s: V(2.5, 2.5, 2.5),
      t0: 0.46,
      t1: 0.72,
      ease: seat,
    },
  ]);

  // ---- 3. It stands up: base draws in to a plinth, and the deck hinges upright to face you ----
  add(p.base, [{ p: V(0, 0, 0.2), s: V(0.7, 1, 0.45), t0: 0.28, t1: 0.54 }]);
  const halfway = new THREE.Quaternion().slerpQuaternions(p.deck.quaternion, FACE.deck, 0.3);
  const standing = [
    { p: p.deck.position.clone().add(V(0, 2.5, 2)), q: halfway, t0: 0.24, t1: 0.34 },
    { p: deckAt, q: FACE.deck, t0: 0.32, t1: 0.54, ease: seat },
  ];
  add(p.deck, standing);
  add(p.plate, [
    { p: p.plate.position.clone().add(V(0, 2.5, 2)), q: halfway, t0: 0.24, t1: 0.34 },
    { p: deckAt.clone().add(V(0, 0.02, 0).applyQuaternion(FACE.deck)), q: FACE.deck, t0: 0.32, t1: 0.54, ease: seat },
    // 5. Once upright, the plate narrows and telescopes to its full height.
    { s: V(15.9 / 26.6, 1, 30.2 / 11.1), t0: 0.52, t1: 0.68, ease: seat },
  ]);
  add(p.housing, [{ p: V(1, -3, -8), s: GONE, t0: 0.24, t1: 0.42 }]);
  showBetween(p.housing, -1, 0.42);

  // ---- 6. The keys deploy, row by row down the face ----
  // The machine keeps its spare keys inside the ones you can see: each new key starts sealed in an existing key's cap,
  // and slides out from under it when its row's turn comes. Nothing appears from nowhere.
  const names = Object.keys(p.keys);
  const OWN_KEYS = names.filter((name) => !p.keys[name].sciOnly);
  const PARENTS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "+/-", "C", "AC", "/", "*", "-", "+"];
  const spare = {};
  names.filter((name) => p.keys[name].sciOnly).forEach((name, i) => { spare[name] = PARENTS[i % PARENTS.length]; });
  const rowOf = (name) => {
    const rows = [...new Set(Object.values(LAYOUT).map((k) => k.z))].sort((a, b) => a - b);
    return rows.indexOf(LAYOUT[name].z);
  };
  const colOf = (name) => (LAYOUT[name].x + 8) / 16;
  const startOf = (name) => 0.47 + rowOf(name) * 0.024 + colOf(name) * 0.016;
  const state = {};
  const keyMove = (name, i) => {
    const k = p.keys[name];
    const to = LAYOUT[name];
    const barZ = k.isBar ? 0.58 : 1;
    const rippleAt = 0.01 + ((k.home.x + 12) / 24) * 0.09; // the ripple runs across the keyboard, left to right
    if (k.stem) showBetween(k.stem, -1, 0.05);
    if (k.spring.isMesh) showBetween(k.spring, -1, 0.05);
    const t0 = startOf(name);
    const t1 = t0 + 0.2;

    if (k.sciOnly) {
      const parent = spare[name];
      showBetween(k.group, t0, 2);
      return (m) => {
        const u = ramp(m, t0, t1);
        const e = seat(u);
        const from = state[parent];
        const x = from.x + (to.x - from.x) * e;
        const z = from.z + (to.z - from.z) * e;
        k.y = from.y - 0.05 + (k.home.y - from.y + 0.05) * e + Math.sin(Math.PI * glide(u)) * 1.1;
        k.group.position.set(x, k.y - (k.depth || 0) * 0.46, z);
        const s = from.s * 0.85 + (to.s - from.s * 0.85) * e;
        k.group.scale.set(s, s, s);
        // Its collar grows out of the plate as it arrives.
        const grow = glide(ramp(u, 0.55, 1));
        k.collar.visible = grow > 0.001;
        const cs = k.collarBase * to.s * grow;
        k.collar.position.set(x, 0.15, z);
        k.collar.scale.set(cs, cs, cs);
      };
    }

    const from = { x: k.home.x, y: k.home.y, z: k.home.z };
    state[name] = { x: from.x, y: from.y, z: from.z, s: 1 };
    const flipDir = i % 2 ? 1 : -1;
    return (m) => {
      const u = ramp(m, t0, t1);
      const e = seat(u);
      const hop = Math.sin(Math.PI * glide(u)) * 2.1;
      const stir = Math.sin(Math.PI * glide(ramp(m, rippleAt, rippleAt + 0.1))) * 0.8;
      const x = from.x + (to.x - from.x) * e;
      const z = from.z + (to.z - from.z) * e;
      k.y = from.y + hop + stir;
      k.group.position.set(x, k.y - (k.depth || 0) * 0.46, z);
      // A somersault on the way; its new legend is swapped while the face is turned away.
      const turn = glide(ramp(u, 0.1, 0.9));
      k.group.rotation.x = turn * Math.PI * 2 * flipDir;
      const map = turn >= 0.5 && k.sci ? k.sci : k.mech;
      if (k.top.material.map !== map) k.top.material.map = map;
      const s = 1 + (to.s - 1) * e;
      k.group.scale.set(s, s, s * (1 + (barZ - 1) * e));
      if (k.collar) {
        const cs = k.collarBase * s;
        k.collar.position.set(x, 0.15, z);
        k.collar.scale.set(cs, k.isBar ? 1 : cs, cs * (1 + (barZ - 1) * e));
      }
      const here = state[name];
      here.x = x; here.y = k.y; here.z = z; here.s = s;
    };
  };
  // A key's own move runs first, because its spares ride along with it until they leave.
  const keyMoves = [...OWN_KEYS, ...names.filter((name) => p.keys[name].sciOnly)].map((name, i) => keyMove(name, i));

  const crownEdge = -15.1;
  return (m) => {
    for (const move of moves) move(m);
    for (const move of keyMoves) move(m);
    p.coverMesh.visible = m <= 0.0005;
    // The clean body rises through the planks, so there is no moment where one is swapped for the other.
    const grow = glide(ramp(m, 0.7, 0.82));
    const planks = m > 0.0005 && m < 0.83;
    for (const s of p.slices) s.visible = planks;
    p.body.visible = grow > 0;
    p.body.scale.set(0.9 + 0.1 * grow, 0.6 + 0.4 * grow, 0.9 + 0.1 * grow);
    // 7. The display draws down out of the crown like a blind, and lights up as it lands.
    const blind = seat(ramp(m, 0.72, 0.9));
    p.sciFront.visible = blind > 0.001;
    p.sciFront.scale.z = Math.max(0.001, blind);
    p.sciFront.position.set(0, 0, crownEdge * (1 - blind));
    for (const s of shown) s.obj.visible = m >= s.a && m < s.b;
    p.sciBrightness(glide(ramp(m, 0.9, 0.99)));
    p.root.position.y = -0.3 * Math.sin(Math.PI * glide(ramp(m, 0.86, 0.98))) ** 2;
  };
}
