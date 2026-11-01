import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, Composition, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Epilogue";
import * as THREE from "three";
import { Machine, reading, initialRegisters } from "../src/machine/model.js";
import { poseAt, poseOf, timeline } from "../src/machine/player.js";
import { buildMachine, buildStage } from "../src/machine/scene.js";

const { fontFamily, waitUntilDone } = loadFont("normal", { weights: ["500", "900"], subsets: ["latin"] });
const FPS = 30;
const GROUND = "#2d1f14";

// ---- the script: real key presses into the real model, laid out on a timeline ----
function script() {
  const m = new Machine();
  const entries = [];
  const presses = [];
  const marks = [];
  const type = (keys, pause = 0.2, after = 0.2) => {
    for (const key of keys) {
      const steps = m.press(key);
      entries.push({ steps, wait: pause, key, expr: m.status });
    }
    entries[entries.length - 1].wait = after;
  };
  entries.push({ steps: [], wait: 0.7 });
  type("1234", 0.22);
  type("*", 0.3, 0.45);
  type("56", 0.26, 0.3);
  marks.push(entries.length);
  type("=", 0, 1.6);
  marks.push(entries.length);
  type(["AC"], 0, 0.5);
  type("355", 0.2);
  type("/", 0.3, 0.4);
  type("113", 0.2, 0.3);
  type("=", 0, 2.2);
  const built = timeline(entries.map((e) => ({ steps: e.steps.length ? e.steps : [], wait: e.wait })));
  // Times of each key press, for its travel.
  let t = 0;
  const entryStart = [];
  let cursor = 0;
  entries.forEach((e) => {
    entryStart.push(t);
    const items = built.items.slice(cursor, cursor + e.steps.length);
    cursor += e.steps.length;
    t += items.reduce((sum, item) => sum + item.dur, 0) + e.wait;
    if (e.key) presses.push({ key: e.key, t: entryStart[entryStart.length - 1] });
  });
  return { built, presses, marks: marks.map((i) => entryStart[i]), total: t };
}

export const SCRIPT = script();
export const FILM_FRAMES = Math.ceil(SCRIPT.total * FPS);

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
function track(keys, t) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const e = ease((t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t));
      const out = {};
      for (const k of Object.keys(keys[i])) out[k] = lerp(keys[i - 1][k], keys[i][k], e);
      return out;
    }
  }
  return keys[keys.length - 1];
}

function camKeys() {
  const [mul, end] = SCRIPT.marks;
  return [
    { t: 0, az: -0.12, el: 0.86, dist: 58, x: -1, y: 3.4, z: 5.5, cover: 0 },
    { t: mul - 0.4, az: 0.1, el: 0.86, dist: 56, x: 0, y: 3.4, z: 5.2, cover: 0 },
    { t: mul + 1.1, az: 0.3, el: 0.74, dist: 84, x: 0, y: 3.2, z: 1, cover: 1 },
    { t: end - 0.3, az: 0.42, el: 0.7, dist: 82, x: 1, y: 3.2, z: 0.5, cover: 1 },
    { t: end + 1.4, az: 0.1, el: 0.72, dist: 78, x: 0, y: 5.4, z: -1, cover: 0 },
    { t: SCRIPT.total, az: -0.08, el: 0.72, dist: 76, x: 0, y: 5.4, z: -1, cover: 0 },
  ];
}

// Close views for the cards, all on the machine after 1,234 × 56.
const STILLS = {
  setting: { az: 0.14, el: 0.9, dist: 25, x: 1, y: 7.4, z: -0.5, cover: 0 },
  counter: { az: 0.08, el: 0.72, dist: 30, x: 1.2, y: 11.6, z: -7, cover: 0 },
  accumulator: { az: 0.06, el: 0.6, dist: 52, x: -5, y: 10.6, z: -5.6, cover: 0 },
  bell: { az: -0.32, el: 0.8, dist: 20, x: -11, y: 2.6, z: 5, cover: 1 },
};

let stage = null;
function makeStage(width, height) {
  if (stage) return stage;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setClearColor(new THREE.Color(GROUND), 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const { scene } = buildStage(renderer, { shadow: 0x0c0603 });
  const built = buildMachine();
  scene.add(built.root);
  const camera = new THREE.PerspectiveCamera(24, width / height, 1, 400);
  stage = { canvas, renderer, scene, built, camera };
  return stage;
}

function draw(target, width, height, pose, cam, presses, t) {
  const s = makeStage(width, height);
  s.built.pose.apply(pose);
  s.built.pose.setCover(cam.cover);
  for (const name of Object.keys(s.built.keys)) {
    let depth = 0;
    for (const p of presses) {
      const u = (t - p.t) / 0.22;
      if (p.key === name && u >= 0 && u <= 1) depth = Math.max(depth, u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7);
    }
    s.built.pose.setKey(name, depth);
  }
  const look = new THREE.Vector3(cam.x, cam.y, cam.z);
  s.camera.position.set(
    look.x + Math.sin(cam.az) * Math.cos(cam.el) * cam.dist,
    look.y + Math.sin(cam.el) * cam.dist,
    look.z + Math.cos(cam.az) * Math.cos(cam.el) * cam.dist,
  );
  s.camera.lookAt(look);
  s.renderer.render(s.scene, s.camera);
  const g = target.getContext("2d");
  g.drawImage(s.canvas, 0, 0, target.width, target.height);
}

function useReady() {
  const [handle] = useState(() => delayRender("fonts"));
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    Promise.all([waitUntilDone(), document.fonts.load(`900 64px ${fontFamily}`)]).catch(() => {}).then(() => {
      setReady(true);
      continueRender(handle);
    });
  }, [handle]);
  return ready;
}

const Film = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef(null);
  const ready = useReady();
  const resting = useMemo(() => poseOf(initialRegisters()), []);
  const keys = useMemo(camKeys, []);
  const t = frame / FPS;
  useLayoutEffect(() => {
    if (!ready) return;
    makeStage(width, height).built.redrawLabels();
    draw(ref.current, width, height, poseAt(SCRIPT.built, t, resting), track(keys, t), SCRIPT.presses, t);
  }, [ready, t, width, height, resting, keys]);
  let now = initialRegisters();
  for (const item of SCRIPT.built.items) { if (item.start <= t) now = item.step.after; else break; }
  const text = reading(now);
  return (
    <AbsoluteFill style={{ background: GROUND }}>
      <canvas ref={ref} width={width} height={height} style={{ width, height }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 142, background: GROUND, display: "flex", alignItems: "center", padding: "0 44px", color: "#e4e2da", fontFamily, fontWeight: 900, fontSize: Math.min(92, 1720 / text.length), letterSpacing: "-0.035em", lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{text}</div>
    </AbsoluteFill>
  );
};

const Still = ({ view }) => {
  const { width, height } = useVideoConfig();
  const ref = useRef(null);
  const ready = useReady();
  const pose = useMemo(() => {
    const m = new Machine();
    for (const k of "1234*56=") m.press(k);
    return poseOf(m.r);
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    makeStage(width, height).built.redrawLabels();
    draw(ref.current, width, height, pose, STILLS[view], [], 0);
  }, [ready, view, width, height, pose]);
  return <AbsoluteFill style={{ background: GROUND }}><canvas ref={ref} width={width} height={height} style={{ width, height }} /></AbsoluteFill>;
};

const Root = () => (
  <>
    <Composition id="Film" component={Film} durationInFrames={FILM_FRAMES} fps={FPS} width={1080} height={1080} />
    <Composition id="Still" component={Still} durationInFrames={1} fps={FPS} width={960} height={720} defaultProps={{ view: "setting" }} />
  </>
);
registerRoot(Root);
