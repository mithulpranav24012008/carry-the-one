// Every part of both calculators: what it is, and where it floats when the machine comes apart.
// `at` is how far a part travels and `spread` how far its family fans out around its own middle. `order` is when it leaves, 0 first.
// The mechanical calculator's numbers are in world axes. The scientific one's are along its own face: x across, y up the face, z out of it.
import * as THREE from "three";
import { FACE } from "./morph.js";

const part = (name, group, note, mech, sci) => ({ name, group, note, mech, sci });
const place = (at, spread = [0, 0, 0], order = 0.5) => ({ at, spread, order });
const as = (name, group, note, at, spread, order) => ({ name, group, note, ...place(at, spread, order) });

export const CATALOG = {
  // ---- the outside ----
  cover: part("Walnut cover", "Case", "One long extrusion of oiled walnut. It keeps the dust out, and it is the first thing off.", place([0, 37, -3], undefined, 0)),
  "rear-plate": part("Rear data plate", "Case", "The name and serial number, on the back of the cover where a repairer looks first.", place([0, 37, -14], undefined, 0)),
  "rear-screw": part("Rear plate screw", "Case", "Holds the data plate to the cover.", place([0, 37, -17], [1.08, 1.08, 0], 0)),
  "rear-vent": part("Rear vent", "Case", "A slot that lets the case breathe, so the walnut moves less with the seasons.", place([0, 37, -12], undefined, 0)),
  trim: part("Brass foot trim", "Case", "Runs along the bottom edge of the cover, where hands would otherwise wear the wood.", place([0, 33, 12], undefined, 0.05)),
  ruler: part("Position ruler", "Case", "Numbered 0 to 9, so you can read how far the carriage has shifted.", place([0, 42, -4], undefined, 0.02)),
  plate: part("Brass key plate", "Case", "The deck you press the keys through. Brushed so that fingerprints don't show.", place([0, 21, 2], undefined, 0.1),
    as("Faceplate", "Front", "The same brass key plate, stretched to the calculator's full height. Lifting it uncovers the logic board.", [0, 0, 14], undefined, 0.2)),
  "plate-screw": part("Key plate screw", "Case", "One of four that hold the brass plate down.", place([0, 3, 0], [1.05, 0, 1.05], 0.12)),
  nameplate: part("Name plate", "Case", "Carry, Model 20: ten setting digits, ten counter digits and twenty in the answer.", place([0, 3.4, 0], undefined, 0.12)),

  // ---- the keys ----
  "key-cap": part("Key", "Keys", "The domed cap you press. Each one carries its own legend.", place([0, 30, 6], [0.12, 0, 0.12], 0.2),
    as("Key", "Keys", "The domed cap you press. Each one carries its own legend, and most have kept their place since the machine turned.", [0, 0, 26], undefined, 0.05)),
  "key-collar": part("Key collar", "Keys", "A brass ring that keeps the key straight in its hole.", place([0, 25, 6], [0.12, 0, 0.12], 0.25),
    as("Key collar", "Keys", "A brass ring that keeps the key straight in its hole.", [0, 0, 20], undefined, 0.1)),
  "key-stem": part("Key stem", "Keys", "Carries the press from the cap down to the levers.", place([0, 16, 6], [0.12, 0, 0.12], 0.3)),
  "key-spring": part("Key spring", "Keys", "Pushes the key back up. This is the snap you feel on release.", place([0, 11, 6], [0.12, 0, 0.12], 0.32)),

  // ---- the setting wheels ----
  "setting-plate": part("Setting window plate", "Setting", "Ten windows, one for each digit you have entered.", place([0, 25, -11], undefined, 0.3)),
  "setting-screw": part("Setting plate screw", "Setting", "Holds the window plate to its tray.", place([0, 27, -11], [1.08, 0, 1.3], 0.3)),
  "setting-mark": part("Setting decimal marker", "Setting", "A small red pointer that marks the decimal place in the setting.", place([0, 28, -11], undefined, 0.3)),
  "setting-wheel": part("Setting wheel", "Setting", "Shows the digit you keyed in, and moves its pinion along the drum to match.", place([0, 21, -11], [0.2, 0, 0], 0.32)),
  "setting-tray": part("Setting tray", "Setting", "The black box the setting wheels turn inside.", place([0, 17, -11], undefined, 0.34)),

  // ---- the carriage ----
  "carriage-body": part("Carriage body", "Carriage", "The walnut beam that carries both rows of wheels along the rails.", place([0, 13, -26], undefined, 0.28),
    as("Crown", "Crown", "The old carriage, turned over and scaled down to sit across the top of the calculator.", [0, 9, -6], undefined, 0.25)),
  "answer-plate": part("Answer window plate", "Carriage", "Twenty windows, tilted towards the operator.", place([0, 28, -24], undefined, 0.22),
    as("Answer window plate", "Crown", "Twenty windows, still on the crown after the change.", [0, 16.5, -3], undefined, 0.22)),
  "answer-wheel": part("Answer wheel", "Carriage", "One digit of the result. Twenty of these make the twenty-digit answer.", place([0, 25, -24], [0.16, 0, 0], 0.24),
    as("Answer wheel", "Crown", "One digit of the old answer row, retired to the crown.", [0, 14, -3], [0.2, 0, 0], 0.24)),
  "answer-tray": part("Answer tray", "Carriage", "The black box the answer wheels turn inside.", place([0, 21, -24], undefined, 0.26),
    as("Answer tray", "Crown", "The black box the answer wheels turn inside.", [0, 11.5, -3], undefined, 0.26)),
  "answer-mark": part("Answer decimal marker", "Carriage", "Marks the decimal place in the answer.", place([0, 30, -24], undefined, 0.22),
    as("Answer decimal marker", "Crown", "Marks the decimal place in the answer.", [0, 18, -3], undefined, 0.22)),
  "carry-pawl": part("Carry pawl", "Carriage", "When a wheel passes 9, this flicks the next wheel on by one. It is the machine's whole idea.", place([0, 31, -21], [0.16, 0, 0], 0.2),
    as("Carry pawl", "Crown", "The lever that once carried the one, kept on the crown.", [0, 18.5, -1], [0.2, 0, 0], 0.2)),
  "counter-plate": part("Counter window plate", "Carriage", "Ten windows for the counter, plus one for the sign flag.", place([0, 28, -34], undefined, 0.22),
    as("Counter window plate", "Crown", "The counter's windows, on the crown.", [0, 16.5, -10], undefined, 0.22)),
  "counter-wheel": part("Counter wheel", "Carriage", "Counts crank turns. Dark, so it can't be mistaken for the answer.", place([0, 25, -34], [0.16, 0, 0], 0.24),
    as("Counter wheel", "Crown", "One digit of the old counter row.", [0, 14, -10], [0.2, 0, 0], 0.24)),
  "counter-tray": part("Counter tray", "Carriage", "The black box the counter wheels turn inside.", place([0, 21, -34], undefined, 0.26),
    as("Counter tray", "Crown", "The black box the counter wheels turn inside.", [0, 11.5, -10], undefined, 0.26)),
  "counter-mark": part("Counter decimal marker", "Carriage", "Marks the decimal place in the counter.", place([0, 30, -34], undefined, 0.22),
    as("Counter decimal marker", "Crown", "Marks the decimal place in the counter.", [0, 18, -10], undefined, 0.22)),
  "sign-flag": part("Sign flag", "Carriage", "A red flag that rises in its window when the answer goes below zero.", place([6, 31, -34], undefined, 0.22),
    as("Sign flag", "Crown", "The old minus flag, kept on the crown.", [4, 18.5, -10], undefined, 0.22)),
  "row-plate": part("Counter label", "Carriage", "A small plate that names the back row.", place([-6, 31, -34], undefined, 0.22),
    as("Counter label", "Crown", "A small plate that names the back row.", [-4, 18.5, -10], undefined, 0.22)),
  bushing: part("Carriage bushing", "Carriage", "A steel sleeve that lets the carriage glide along the rails.", place([0, 8, -26], [1.12, 0, 1.3], 0.3),
    as("Crown bushing", "Crown", "Once slid on the rails. Now it locks the crown to the case.", [0, 6, -6], [1.12, 0, 1.3], 0.3)),
  "end-cap": part("Carriage end cap", "Carriage", "A walnut block that closes each end of the carriage.", place([0, 13, -26], [0.32, 0, 0], 0.26),
    as("Crown end cap", "Crown", "A walnut block that closes each end of the crown.", [0, 9, -6], [0.5, 0, 0], 0.26)),
  "shift-knob": part("Shift knob", "Carriage", "A knurled brass knob, for shifting the carriage by hand.", place([0, 14, -22], [0.55, 0, 0], 0.24),
    as("Crown knob", "Crown", "A knurled brass knob on each end of the crown.", [0, 9, -2], [0.9, 0, 0], 0.24)),
  "clear-lever": part("Clear lever", "Carriage", "Pull it and a row of wheels spins back to zero.", place([0, 20, -30], [0.55, 0, 0], 0.22),
    as("Crown lever", "Crown", "An old clear lever, kept on the crown.", [0, 13, -14], [0.9, 0, 0], 0.22)),

  // ---- the rails ----
  rail: part("Carriage rail", "Frame", "A polished rod. The carriage rides on two of these.", place([0, 5, -17], [0, 0, 1.2], 0.4),
    as("Side trim", "Frame", "The old carriage rails, stood upright and clamped along the case's sides.", [0, 0, 0], [0.5, 0, 0], 0.3)),
  "rail-bracket": part("Rail bracket", "Frame", "Holds a rail's end to the frame.", place([0, 8, -17], [0.08, 0, 1.2], 0.4),
    as("Trim clamp", "Frame", "Holds the end of a side trim to the case.", [0, 0, 2.5], [0.7, 0.1, 0], 0.3)),
  "rail-screw": part("Rail bracket screw", "Frame", "Fixes a bracket to the frame.", place([0, 11, -17], [0.08, 0, 1.2], 0.4),
    as("Trim clamp screw", "Frame", "Fixes a clamp to the case.", [0, 0, 4.5], [0.7, 0.1, 0], 0.3)),

  // ---- the crank ----
  "crank-grip": part("Crank handle", "Crank", "Turned hardwood, free to spin in your hand so it never twists your wrist.", place([25, 5, 0], undefined, 0.15),
    as("Stand foot", "Stand", "The old crank handle, now the foot the calculator leans on.", [0, -5, -22], undefined, 0.15)),
  "crank-pin": part("Crank pin", "Crank", "Joins the handle to the arm.", place([20, 5, 0], undefined, 0.17),
    as("Stand pin", "Stand", "Joins the foot to the strut.", [0, -3, -18], undefined, 0.17)),
  "crank-arm": part("Crank arm", "Crank", "Gives you the leverage. One full swing is one machine cycle.", place([15, 5, 0], undefined, 0.18),
    as("Stand strut", "Stand", "The old crank arm, folded down as a strut.", [0, 0, -14], undefined, 0.18)),
  "crank-collar": part("Crank collar", "Crank", "Locks the arm to the drive shaft.", place([11, 5, 0], undefined, 0.2),
    as("Stand hinge", "Stand", "The old crank collar, now the hinge the stand folds on.", [0, 0, -9], undefined, 0.2)),
  "crank-boss": part("Crank boss", "Crank", "The steel housing the drive passes through, with its flange.", place([7, 5, 0], undefined, 0.22)),
  "hub-bolt": part("Hub bolt", "Crank", "One of six that hold the flange to the side frame.", place([9, 5, 0], [0, 2, 2], 0.22)),

  // ---- the works ----
  drum: part("Stepped drum", "Works", "Nine teeth of nine lengths. Where the pinion sits decides how many teeth catch, and that is how a digit becomes a turn.", place([0, 1, 9], [0.42, 0, 0], 0.5)),
  "drum-bevel": part("Drum bevel gear", "Works", "Passes the turn from the cross shaft into its drum.", place([0, 1, 5], [0.42, 0, 0], 0.52)),
  pinion: part("Sliding pinion", "Works", "Slides along the drum to the digit you set, and counts its teeth into the answer.", place([0, 10, 3], [0.42, 0, 0], 0.46)),
  fork: part("Shift fork", "Works", "Pushes the pinion along its shaft when you set a digit.", place([0, 13.5, 3], [0.42, 0, 0], 0.44)),
  "square-shaft": part("Square shaft", "Works", "Square so the pinion can slide along it and still drive it.", place([0, 7, 3], [0.42, 0, 0], 0.48)),
  "cross-shaft": part("Cross shaft", "Works", "Carries the crank's turn across the whole machine to all ten drums.", place([0, -1.5, -9], undefined, 0.6)),
  "cross-gear": part("Cross shaft gear", "Works", "One of ten on the cross shaft, meshing with a drum's bevel.", place([0, 2, -9], [0.42, 0, 0], 0.58)),
  "big-gear": part("Main drive gear", "Works", "Thirty-six teeth. The big gear in the train from the crank.", place([11, 3, -10], undefined, 0.5)),
  "small-gear": part("Crank pinion", "Works", "Fourteen teeth, driven directly by the crank.", place([11, 3, -3], undefined, 0.5)),
  bearing: part("Bearing block", "Works", "Holds the shafts true. There are six of them, and every turn runs through them.", place([0, 0, 0], [0.4, 0, 1.75], 0.62)),
  "tie-bar": part("Tie bar", "Works", "Ties the front bearing blocks together so that they can't rack.", place([0, 2, 14], undefined, 0.64)),
  comb: part("Carry-lever comb", "Works", "A walnut rail that keeps the carry levers evenly spaced.", place([0, 1, -14], undefined, 0.64)),
  coil: part("Return coil", "Works", "A tension spring that brings the setting levers home.", place([0, 1, -13], [0.2, 0, 0], 0.66)),
  bell: part("Bell", "Works", "Rings when the machine reaches a limit. The one sound it makes on purpose.", place([-11, 10, 8], undefined, 0.4)),
  "bell-post": part("Bell post", "Works", "Holds the bell off the base so that it can ring.", place([-11, 5, 8], undefined, 0.42)),
  hammer: part("Bell hammer", "Works", "A steel ball on a thin arm, which strikes the bell.", place([-15, 8, 8], undefined, 0.4)),
  "hammer-spring": part("Hammer spring", "Works", "Sets the hammer back after it strikes.", place([-15, 3, 8], undefined, 0.42)),

  // ---- the frame and base ----
  "side-frame": part("Side frame", "Frame", "One of two steel plates that everything else hangs from.", place([0, 1, 0], [0.75, 0, 0], 0.7)),
  post: part("Frame post", "Frame", "Spaces the frame and carries the rails.", place([0, 2, -17], [0.55, 0, 0.6], 0.7)),
  "base-screw": part("Base screw", "Base", "Fixes the works to the base plate.", place([0, -2.5, 0], [0.2, 0, 0.3], 0.8)),
  "base-plate": part("Base plate", "Base", "A thick walnut plate that the whole machine stands on. It was never lacquered, because nobody sees it.", place([0, -6, 0], undefined, 0.85),
    as("Plinth", "Base", "The old base plate, drawn in to make the calculator's plinth.", [0, -8, 0], undefined, 0.7)),
  "under-plate": part("Underside plate", "Base", "A sheet of blackened steel that closes the bottom against dust.", place([0, -10, 0], undefined, 0.88),
    as("Plinth underside", "Base", "A sheet of blackened steel that closes the plinth's bottom.", [0, -11, 0], undefined, 0.74)),
  "under-screw": part("Underside screw", "Base", "Holds the underside plate on.", place([0, -13, 0], [1.08, 0, 1.08], 0.9),
    as("Plinth screw", "Base", "Holds the underside plate on.", [0, -13.5, 0], [1.25, 0, 1.25], 0.76)),
  hatch: part("Service hatch", "Base", "Comes off for oiling, without lifting the cover.", place([0, -13, 0], undefined, 0.9),
    as("Plinth hatch", "Base", "A small door in the plinth's underside.", [0, -13.5, 0], undefined, 0.76)),
  "hatch-screw": part("Hatch screw", "Base", "Thumb-sized, so that no tool is needed.", place([0, -15.5, 0], [1.2, 0, 1.2], 0.92),
    as("Hatch screw", "Base", "Thumb-sized, so that no tool is needed.", [0, -15.5, 0], [1.5, 0, 1.5], 0.78)),
  "under-label": part("Underside label", "Base", "Model and serial number, plus the one instruction that matters.", place([0, -12.5, 0], undefined, 0.9),
    as("Underside label", "Base", "Model and serial number, plus the one instruction that matters.", [0, -13.5, 0], undefined, 0.76)),
  vent: part("Underside vent", "Base", "One of a row of slots, so the case can breathe.", place([0, -12.5, 0], [0.14, 0, 0], 0.9),
    as("Underside vent", "Base", "One of a row of slots, so the case can breathe.", [0, -13.5, 0], [0.2, 0, 0], 0.76)),
  foot: part("Rubber foot", "Base", "Stops the machine walking across the desk while you crank it.", place([0, -18, 0], [0.12, 0, 0.12], 0.95),
    as("Rubber foot", "Base", "Stops the calculator sliding on the desk.", [0, -18, 0], [0.2, 0, 0.2], 0.8)),

  // ---- only on the scientific calculator ----
  body: part("Walnut body", "Case", "The cover's six planks, locked together as one piece.", null, place([0, 0, 0], undefined, 0.9)),
  "back-hatch": part("Rear service panel", "Case", "Brass, screwed to the back of the body. The electronics are reached from here.", null, place([0, 7, -9], undefined, 0.2)),
  "back-label": part("Rear data plate", "Case", "The model, serial number and a note on the angle modes.", null, place([0, -7, -8], undefined, 0.2)),
  "back-screw": part("Rear panel screw", "Case", "One of four that hold the service panel on.", null, place([0, 7, -12], [1.1, 1.1, 0], 0.15)),
  "back-vent": part("Rear vent", "Case", "A row of slots, so the display can shed its heat.", null, place([0, 7, -6], [0, 0.1, 0], 0.25)),
  "display-bezel": part("Display bezel", "Display", "The black frame the display sits in.", null, place([0, 0, 19], undefined, 0.15)),
  "display-screen": part("Display", "Display", "Amber on black, in the manner of a 1970s vacuum-fluorescent tube. It stays lit and live even out here.", null, place([0, 0, 24], undefined, 0.1)),
  crest: part("Maker's strip", "Display", "Carry, Model 20 Scientific.", null, place([0, 2, 19], undefined, 0.12)),
  "display-screw": part("Face screw", "Display", "One of four at the corners of the face.", null, place([0, 0, 17.5], [1.08, 1.04, 0], 0.1)),
  board: part("Logic board", "Logic board", "The green board under the keys. Its printed lines are wired from the real key layout.", null, place([0, 0, 7], undefined, 0.4)),
  "board-row": part("Row trace", "Logic board", "A copper line joining one row of keys to the scanner.", null, place([0, 0, 7], undefined, 0.4)),
  "board-column": part("Column trace", "Logic board", "A copper line joining one column of keys to the main chip.", null, place([0, 0, 7], undefined, 0.4)),
  "board-link": part("Scanner link", "Logic board", "Carries the key's address from the scanner to the chip.", null, place([0, 0, 7], undefined, 0.4)),
  "board-bus": part("Display bus", "Logic board", "Carries the answer from the chip, round the board's edge and up to the display.", null, place([0, 0, 7], undefined, 0.4)),
  "board-contact": part("Key contact", "Logic board", "A copper ring under one key. Press the key and it closes.", null, place([0, 0, 7], undefined, 0.4)),
  "scanner-chip": part("Scanner chip", "Logic board", "Checks every row in turn, to find which key is down.", null, place([0, 0, 10], undefined, 0.35)),
  "main-chip": part("Main chip", "Logic board", "Carry C-20. It does all the arithmetic that the drums and wheels used to do.", null, place([0, 0, 10], undefined, 0.35)),
  "pilot-lamp": part("Pilot lamp", "Logic board", "Blinks on the chip while it works.", null, place([0, 0, 12], undefined, 0.3)),
  "board-part": part("Capacitor", "Logic board", "Smooths the supply at the foot of the board.", null, place([0, 0, 10], undefined, 0.35)),
};

const glide = (u) => u * u * u * (u * (u * 6 - 15) + 10);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seen = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

export function buildExplode(root, tagged) {
  // Each part gets a holder of its own, so coming apart never disturbs the moves the machine makes itself: a wheel can still turn and a key still press.
  const parts = tagged.map(({ family, members, label }, order) => {
    const holder = new THREE.Group();
    members[0].parent.add(holder);
    for (const m of members) holder.add(m);
    const self = { family, label, holder, order, meshes: [], offset: new THREE.Vector3(), leave: 0.5 };
    // Parts inside parts were tagged first, so each mesh goes to the smallest part that holds it.
    holder.traverse((o) => {
      if (!o.isMesh || o.userData.part) return;
      o.userData.part = self;
      self.meshes.push(o);
    });
    return self;
  });

  const solid = (m) => m.material.visible !== false && seen(m);
  const boxOf = (p, box = new THREE.Box3()) => {
    box.makeEmpty();
    for (const m of p.meshes) if (solid(m)) box.expandByObject(m);
    return box;
  };

  let active = [];
  let bounds = null;
  let level = 0;
  const apply = (v) => {
    level = v;
    for (const p of active) {
      const e = glide(clamp01((v - p.leave * 0.4) / 0.6));
      p.holder.position.copy(p.offset).multiplyScalar(e);
    }
  };

  // Works out where everything goes for the calculator as it stands now. It is called with the machine closed.
  const prepare = (form) => {
    for (const p of parts) p.holder.position.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const frame = form === "sci" ? FACE.body : new THREE.Quaternion();
    const unframe = frame.clone().invert();
    active = parts.filter((p) => CATALOG[p.family]?.[form] && p.meshes.some(solid));
    const box = new THREE.Box3(), c = new THREE.Vector3();
    const middles = new Map();
    for (const p of active) {
      p.home = boxOf(p, box).getCenter(new THREE.Vector3());
      const m = middles.get(p.family) ?? { sum: new THREE.Vector3(), n: 0 };
      m.sum.add(p.home); m.n++;
      middles.set(p.family, m);
    }
    const toLocal = new THREE.Matrix3();
    for (const p of active) {
      const spec = CATALOG[p.family][form];
      const m = middles.get(p.family);
      c.copy(p.home).sub(m.sum.clone().divideScalar(m.n)).applyQuaternion(unframe);
      p.offset.set(spec.at[0] + spec.spread[0] * c.x, spec.at[1] + spec.spread[1] * c.y, spec.at[2] + spec.spread[2] * c.z).applyQuaternion(frame);
      p.leave = spec.order;
      p.holder.parent.updateWorldMatrix(true, false);
      // The holder's parent may be turned or stretched, so the move is carried into its own terms.
      p.offset.applyMatrix3(toLocal.setFromMatrix4(p.holder.parent.matrixWorld).invert());
    }
    apply(1);
    root.updateMatrixWorld(true);
    const all = new THREE.Box3();
    for (const p of active) all.union(boxOf(p, box));
    const centre = all.getCenter(new THREE.Vector3());
    bounds = { centre, radius: all.getSize(c).length() / 2 };
    const counts = new Map();
    const totals = new Map();
    for (const p of active) totals.set(p.family, (totals.get(p.family) ?? 0) + 1);
    const sequence = Object.keys(CATALOG);
    active.sort((a, b) => sequence.indexOf(a.family) - sequence.indexOf(b.family) || a.order - b.order);
    for (const p of active) {
      const spec = CATALOG[p.family];
      const own = spec[form];
      const n = (counts.get(p.family) ?? 0) + 1;
      counts.set(p.family, n);
      p.index = n;
      p.total = totals.get(p.family);
      p.name = own.name ?? spec.name;
      p.group = own.group ?? spec.group;
      p.note = own.note ?? spec.note;
      p.title = p.label ? `${p.name} ${p.label}` : p.total > 1 ? `${p.name} ${n}` : p.name;
      const size = boxOf(p, box).getSize(new THREE.Vector3());
      p.size = [size.x, size.y, size.z].map((v) => (v < 10 ? v.toFixed(1) : Math.round(v))).join(" × ");
      p.centre = box.getCenter(new THREE.Vector3());
      p.radius = size.length() / 2;
    }
    apply(0);
    return { parts: active, bounds };
  };

  // Hovering warms a part's colour. Each material gets one warmed twin, and key legends keep their own because their pictures change.
  const warmed = new Map();
  const warm = (mat) => {
    if (!warmed.has(mat)) {
      const twin = mat.clone();
      twin.emissive = new THREE.Color(0xffa63d);
      twin.emissiveIntensity = 0.28;
      warmed.set(mat, twin);
    }
    return warmed.get(mat);
  };
  let glowing = null;
  const glow = (p) => {
    if (p === glowing) return;
    for (const m of glowing?.meshes ?? []) if (m.userData.plain) { m.material = m.userData.plain; m.userData.plain = null; }
    glowing = p;
    for (const m of p?.meshes ?? []) {
      if (m.material.visible === false || m.userData.ownMaterial || !m.material.isMeshStandardMaterial) continue;
      m.userData.plain = m.material;
      m.material = warm(m.material);
    }
  };

  return {
    all: parts, prepare, apply, boxOf, glow,
    get active() { return active; },
    get bounds() { return bounds; },
    get level() { return level; },
    // Which part sits under a ray. Hidden hit areas and parts of the other calculator don't count.
    pick(ray, only) {
      const meshes = (only ?? active).flatMap((p) => p.meshes);
      for (const hit of ray.intersectObjects(meshes, false)) if (solid(hit.object)) return hit.object.userData.part;
      return null;
    },
  };
}
