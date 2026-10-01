// Entry point. Stage 2: the whole-movement figure with orbit, explode and part toggles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMovement } from './three/movement.js';
import { Machine } from './sim/machine.js';
import { initFigures } from './figures2d.js';
import { createQuality, adaptQuality } from './quality.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function initMovementFigure(fig) {
  const canvas = fig.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  // Lighting diagnosis (evidence/movement/diag): a full-strength RoomEnvironment mirrored its
  // ceiling panels straight into the camera and washed the bridges out. A dim, tilted environment
  // plus a stronger key light keeps the metal readable.
  scene.environmentIntensity = 0.2;
  scene.environmentRotation.set(1.2, 0, 0);
  const key = new THREE.DirectionalLight(0xfff4e0, 3);
  key.position.set(-20, 30, 45);
  const rimL = new THREE.DirectionalLight(0xdfe8ff, 0.9);
  rimL.position.set(30, -25, 10);
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0x6a5a48, 0.1);
  // Low fill from the crown side so bridge undersides and pillar sides are not near-black
  // when the reader orbits to a side view (r17-side.png).
  const fill = new THREE.DirectionalLight(0xfff0dc, 0.8);
  fill.position.set(-35, -10, -6);
  scene.add(key, rimL, hemi, fill);

  const mv = buildMovement({ quality: 1 });
  scene.add(mv.root);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  // The parts sit in the upper-right two thirds of the plate, so frame their centroid.
  const narrow = fig.clientWidth < 600;
  // Centre on the plate plus the crown that sticks out to the left (polish review p1: the
  // old target left a wide empty band on the right).
  const target = new THREE.Vector3(narrow ? -1 : -1.5, -0.8, 1.5);
  const home = new THREE.Vector3(0.5, -23, 66);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.minDistance = 18;
  controls.maxDistance = 140;
  controls.enablePan = false;
  canvas.addEventListener('dblclick', () => { camera.position.copy(home); controls.target.copy(target); });

  const state = { t: 0, speed: 1, playing: !reduced, explode: 0 };
  const machine = new Machine();
  machine.seek(0.2);
  const explodeInput = fig.querySelector('[data-explode]');
  const explodeOut = fig.querySelector('[data-explode-out]');
  explodeInput.addEventListener('input', () => {
    // Raise the view with the stack so the lifted bridges stay in frame, and pull back a little.
    const dz = (+explodeInput.value - state.explode) * 18;
    state.explode = +explodeInput.value;
    explodeOut.textContent = state.explode < 0.01 ? 'closed' : `${Math.round(state.explode * 100)}% apart`;
    mv.setExplode(state.explode);
    const off = camera.position.clone().sub(controls.target);
    controls.target.z += dz;
    off.multiplyScalar(1 + dz / 90);
    camera.position.copy(controls.target).add(off);
    controls.update();
  });
  const speedInput = fig.querySelector('[data-speed]');
  const speedOut = fig.querySelector('[data-speed-out]');
  const setSpeed = () => {
    state.speed = Math.pow(10, -2 * +speedInput.value);
    speedOut.textContent = state.speed > 0.95 ? 'real time' : `1/${Math.round(1 / state.speed)}`;
  };
  speedInput.addEventListener('input', setSpeed);
  setSpeed();
  const playBtn = fig.querySelector('[data-play]');
  const syncPlay = () => { playBtn.textContent = state.playing ? 'Pause' : 'Play'; };
  playBtn.addEventListener('click', () => { state.playing = !state.playing; syncPlay(); });
  syncPlay();

  // Scrub: the slider spans a two-second window (twelve beats). Dragging pauses and seeks the
  // machine exactly; while playing the slider follows the clock through successive windows.
  const scrub = fig.querySelector('[data-scrub]');
  const timeOut = fig.querySelector('[data-time-out]');
  const WINDOW = +scrub.max;
  scrub.addEventListener('input', () => {
    if (state.playing) { state.playing = false; syncPlay(); }
    const base = Math.floor(machine.t / WINDOW) * WINDOW;
    machine.seek(base + +scrub.value);
  });
  const dial = makeDial(fig.querySelector('[data-dial]'));
  const statusEl = fig.querySelector('[data-status]');
  let lastStatus = '';

  const toggles = fig.querySelector('[data-toggles]');
  const partsBtn = fig.querySelector('[data-parts]');
  partsBtn.addEventListener('click', () => {
    const open = toggles.hidden;
    toggles.hidden = !open;
    partsBtn.setAttribute('aria-expanded', String(open));
    partsBtn.setAttribute('aria-pressed', String(open));
  });
  const names = ['keyless', 'stem', 'cock', 'trainBridge', 'barrelBridge', 'palletBridge', 'balance', 'hairspring', 'pallet', 'escape', 'fourth', 'third', 'centre', 'barrel', 'plate'];
  for (const n of names) {
    const lab = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = true; cb.dataset.part = n;
    cb.addEventListener('change', () => {
      mv.setVisible(n, cb.checked);
      // Parts that matter to the mechanism change its behaviour, not just its looks.
      if (n === 'barrel') machine.setPart('mainspring', cb.checked);
      if (n === 'pallet' || n === 'balance' || n === 'hairspring') machine.setPart(n, cb.checked);
    });
    lab.append(cb, ' ', mv.parts[n].label);
    toggles.append(lab);
  }

  // Optional synthesized tick, off until the reader asks for it. Each beat plays a short
  // filtered click when the escape tooth drops onto the next pallet stone.
  const soundBtn = fig.querySelector('[data-sound]');
  const sound = { on: false, ctx: null, lastBeat: null };
  const click = () => {
    const ctx = sound.ctx, t = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n / 6));
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 4;
    const gain = ctx.createGain(); gain.gain.value = Math.min(0.5, 0.18 / Math.sqrt(state.speed));
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(t);
  };
  soundBtn.addEventListener('click', () => {
    sound.on = !sound.on;
    if (sound.on && !sound.ctx) sound.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (sound.ctx) (sound.on ? sound.ctx.resume() : sound.ctx.suspend());
    soundBtn.textContent = sound.on ? 'Sound on' : 'Sound off';
    soundBtn.setAttribute('aria-pressed', String(sound.on));
  });

  // Automatic quality: if frames run slow for a couple of seconds, lower the pixel ratio
  // step by step (see quality.js). It never raises it again, so the picture does not flicker.
  const quality = createQuality(renderer.getPixelRatio());
  const adapt = (ms) => { if (adaptQuality(quality, ms)) renderer.setPixelRatio(quality.ratio); };
  // A hidden tab stops rAF entirely, so restart the clock when it comes back.
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  // Only animate while the figure is on screen.
  let onScreen = true;
  new IntersectionObserver((es) => {
    const v = es[0].isIntersecting;
    if (v && !onScreen) { onScreen = true; last = performance.now(); if (running) requestAnimationFrame(frame); }
    onScreen = v;
  }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Fit the whole plate plus the crown across narrow screens; 30 degrees is the desktop look.
      const a = w / h;
      const fitHalf = 21.5 / camera.position.distanceTo(controls.target) / a;
      camera.fov = 2 * Math.atan(Math.max(Math.tan(15 * Math.PI / 180), fitHalf)) * 180 / Math.PI;
      camera.updateProjectionMatrix();
    }
  }
  let last = performance.now();
  let running = true;
  const frameMs = [];
  function frame(now) {
    if (!running || !onScreen) return;
    const t0 = performance.now();
    const interval = now - last;
    const dt = Math.max(0, Math.min(0.1, interval / 1000)); // rAF time can precede `last` on the first frame
    last = now;
    // Judge quality by the real frame interval, which includes GPU time, not just our JS.
    if (!window.__watchNoAdapt) adapt(interval);
    if (state.playing) machine.step(dt * state.speed);
    state.t = machine.t;
    const e = machine.state;
    if (sound.on && e.mode === 'running' && state.playing && sound.lastBeat !== null && e.beat !== sound.lastBeat) click();
    sound.lastBeat = e.mode === 'running' ? e.beat : null;
    mv.update({ escapeDeg: e.escape, forkDeg: e.fork, balanceDeg: e.balance });
    dial(e.hands);
    if (document.activeElement !== scrub) scrub.value = machine.t - Math.floor(machine.t / WINDOW) * WINDOW;
    timeOut.textContent = `${machine.t.toFixed(3)} s`;
    const st = statusText(e);
    if (st !== lastStatus) { statusEl.innerHTML = st; lastStatus = st; }
    resize();
    controls.update();
    renderer.render(scene, camera);
    frameMs.push(performance.now() - t0);
    if (frameMs.length > 60) frameMs.shift();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Test hooks: stop the loop and render one still on demand.
  const renderStill = () => { resize(); controls.update(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); };
  window.__watch = { state, machine, mv, renderer, scene, lights: { key, rimL, hemi }, camera, controls, frameMs, quality, sound,
    stop() { running = false; }, start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }, renderStill };
}

const PHASE_TEXT = { lock: 'locked', unlock: 'unlocking', impulse: 'impulse', drop: 'drop' };
function statusText(e) {
  if (e.mode === 'runaway') return '<b>Pallet fork removed.</b> Nothing holds the escape wheel, so the train spins free.';
  if (e.mode === 'unpowered') return '<b>No mainspring.</b> The train stands still and the balance slowly rings down.';
  if (e.mode === 'jammed') return '<b>No balance.</b> The fork falls to one side and the escape wheel stays locked.';
  return `Beat ${(e.beat % 6) + 1} of 6 &middot; <b>${PHASE_TEXT[e.phase] || e.phase}</b>`;
}

// A small dial with hour, minute and seconds hands driven by the train. The watch starts at 10:09.
function makeDial(c) {
  const g = c.getContext('2d');
  const W = c.width, R = W / 2;
  const hand = (deg, len, w, col) => {
    const a = (deg - 90) * Math.PI / 180;
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(R - Math.cos(a) * len * 0.18, R - Math.sin(a) * len * 0.18);
    g.lineTo(R + Math.cos(a) * len, R + Math.sin(a) * len); g.stroke();
  };
  return (h) => {
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#fbf6ea'; g.strokeStyle = '#b9a88c'; g.lineWidth = 2;
    g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#6d6256';
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, r0 = i % 5 ? R - 7 : R - 12;
      g.lineWidth = i % 5 ? 1 : 2;
      g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.lineTo(R + Math.cos(a) * (R - 4), R + Math.sin(a) * (R - 4)); g.stroke();
    }
    hand(h.hours + 304.5, R * 0.5, 5, '#2a2520');
    hand(h.minutes + 54, R * 0.74, 3.5, '#2a2520');
    hand(h.seconds, R * 0.82, 1.5, '#9a5b1e');
    g.fillStyle = '#9a5b1e'; g.beginPath(); g.arc(R, R, 3.5, 0, Math.PI * 2); g.fill();
  };
}

document.querySelectorAll('[data-figure="movement"]').forEach(initMovementFigure);
initFigures();
