// Entry point: the main watch figure, closed with real hands, opening onto the movement with orbit, explode and part toggles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMovement } from './three/movement.js';
import { buildCase, CASE } from './three/case.js';
import { dialAngles } from './sim/handmap.js';
import { openPose, stepOpen } from './sim/opening.js';
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
  // The closed watch: case, dial and real hands driven by the same simulation as the movement.
  // Movement and case share one group. In the model the crown points left of the screen, so the
  // closed watch is turned half a turn to read like a wristwatch, 12 at the top and the crown at 3.
  const wc = buildCase({ quality: 1 });
  const watch = new THREE.Group();
  watch.add(mv.root, wc.root);
  watch.rotation.z = Math.PI;
  scene.add(watch);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  // The parts sit in the upper-right two thirds of the plate, so frame their centroid.
  const narrow = fig.clientWidth < 600;
  // Centre on the plate plus the crown that sticks out to the left (polish review p1: the
  // old target left a wide empty band on the right).
  // Two framings: the closed watch face-on with its lugs in view, and the movement view used once
  // the watch is opened. `fit` is the half width in millimetres kept on screen on narrow canvases.
  const VIEWS = {
    closed: { target: new THREE.Vector3(0, -0.5, 3), home: new THREE.Vector3(0.5, -30, 96), fit: 27 },
    // The watch stays turned crown-right when open, so the movement view's target is mirrored to match.
    // Pulled back and lowered after frame review found the bottom lugs clipped in the open view.
    open: { target: new THREE.Vector3(narrow ? 1 : 1.5, -0.7, 1.5), home: new THREE.Vector3(-1.8, -36.3, 96.9), fit: 29 },
  };
  let view = VIEWS.closed;
  let fit = view.fit;
  const target = view.target.clone();
  const home = view.home.clone();
  camera.position.copy(home);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.minDistance = 18;
  controls.maxDistance = 140;
  controls.enablePan = false;
  canvas.addEventListener('dblclick', () => { camera.position.copy(home); controls.target.copy(target); });

  const state = { t: 0, speed: 1, playing: !reduced, explode: 0, open: 0, openGoal: 0 };
  const machine = new Machine();
  machine.seek(0.2);
  const explodeInput = fig.querySelector('[data-explode]');
  const explodeOut = fig.querySelector('[data-explode-out]');
  explodeInput.addEventListener('input', () => {
    // The layers can only come apart once the dial is off, so exploding a closed watch opens it.
    if (state.openGoal === 0 && +explodeInput.value > 0) setOpen(true);
    // Raise the view with the stack so the lifted bridges stay in frame, and pull back a little.
    const dz = (+explodeInput.value - state.explode) * 18;
    state.explode = +explodeInput.value;
    explodeOut.textContent = state.explode < 0.01 ? 'together' : `${Math.round(state.explode * 100)}% apart`;
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
  const statusEl = fig.querySelector('[data-status]');
  let lastStatus = '';

  const toggles = fig.querySelector('[data-toggles]');
  const partsBtn = fig.querySelector('[data-parts]');
  partsBtn.addEventListener('click', () => {
    const open = toggles.hidden;
    // The part switches are for the movement, so showing them opens the watch.
    if (open && state.openGoal === 0) setOpen(true);
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

  // Open and close. The crystal, dial and hands lift, tilt and slide off the top as one unit, while
  // the camera eases from the face-on view to the movement view. Reduced motion jumps.
  const openBtn = fig.querySelector('[data-open]');
  const anim = { from: null, to: null };
  function setOpen(on) {
    state.openGoal = on ? 1 : 0;
    if (!on) {
      // Close the parts list and bring the layers back together before the dial returns.
      toggles.hidden = true;
      partsBtn.setAttribute('aria-expanded', 'false'); partsBtn.setAttribute('aria-pressed', 'false');
      if (state.explode > 0) { explodeInput.value = 0; explodeInput.dispatchEvent(new Event('input')); }
    }
    const dest = on ? VIEWS.open : VIEWS.closed;
    anim.from = { pos: camera.position.clone(), target: controls.target.clone(), fit, p: state.open };
    anim.to = dest;
    view = dest; target.copy(dest.target); home.copy(dest.home);
    openBtn.textContent = on ? 'Close the watch' : 'Open the watch';
    openBtn.setAttribute('aria-pressed', String(on));
    // With the figure scrolled away the frame loop is paused, so settle at once rather than
    // leaving a half-open watch for the reader to find later.
    measureSlide();
    if (!onScreen) applyOpen(10);
  }
  openBtn.addEventListener('click', () => setOpen(state.openGoal === 0));
  // The front (crystal, dial and hands) slides off as one rigid unit along the open view's screen-up
  // direction. Its travel is measured once per opening so it ends just past the top of the frame.
  const slideDir = new THREE.Vector3(), tiltAxis = new THREE.Vector3(), tiltQ = new THREE.Quaternion();
  const pivot = new THREE.Vector3(0, 0, CASE.dialZ), tmpV = new THREE.Vector3(), rootQ = new THREE.Quaternion();
  const slide = { dist: 80 };
  // Bounding-box corners of the front in wc.root's frame, measured at rest.
  const frontCorners = (() => {
    const b = new THREE.Box3();
    for (const g of [wc.front, wc.lid]) { g.updateMatrixWorld(true); b.expandByObject(g); }
    const inv = new THREE.Matrix4().copy(wc.root.matrixWorld).invert();
    const out = [];
    for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(inv));
    return out;
  })();
  function measureSlide() {
    // A camera standing where the open view will put it.
    const cam = camera.clone();
    const v = VIEWS.open, dz = state.explode * 18;
    const t = v.target.clone(); t.z += dz;
    cam.position.copy(v.home).sub(v.target).multiplyScalar(1 + dz / 90).add(t);
    cam.lookAt(t);
    const fitHalf = v.fit / cam.position.distanceTo(t) / cam.aspect;
    cam.fov = 2 * Math.atan(Math.max(Math.tan(15 * Math.PI / 180), fitHalf)) * 180 / Math.PI;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    wc.root.updateMatrixWorld(true);
    wc.root.getWorldQuaternion(rootQ);
    slideDir.setFromMatrixColumn(cam.matrixWorld, 1).applyQuaternion(rootQ.clone().invert()).normalize();
    // Tilt about the screen-x axis so the 6 o'clock edge rises toward the reader as the front lifts.
    tiltAxis.set(0, 0, 1).cross(slideDir).normalize();
    const pose = openPose(1);
    for (let d = 10; d <= 200; d += 2) {
      let minY = Infinity;
      tiltQ.setFromAxisAngle(tiltAxis, pose.front.tilt * Math.PI / 180);
      for (const c of frontCorners) {
        tmpV.copy(c).sub(pivot).applyQuaternion(tiltQ).add(pivot).addScaledVector(slideDir, d);
        tmpV.z += pose.front.lift;
        tmpV.applyMatrix4(wc.root.matrixWorld).project(cam);
        minY = Math.min(minY, tmpV.y);
      }
      if (minY > 1.08) { slide.dist = d; return; }
    }
    slide.dist = 200;
  }
  function applyOpen(dt) {
    const before = state.open;
    state.open = stepOpen(state.open, state.openGoal, dt, reduced);
    const pose = openPose(state.open);
    // The closed watch is turned half a turn to read 12 at the top. Opening turns it back so the
    // end state is the original movement view. Offsets are kept in screen terms while it turns.
    const th = Math.PI * (1 - pose.turn);
    watch.rotation.z = th;
    // The front lifts, tilts back a little and slides off the top of the frame, fully opaque and full size.
    tiltQ.setFromAxisAngle(tiltAxis, pose.front.tilt * Math.PI / 180);
    tmpV.copy(pivot).sub(pivot.clone().applyQuaternion(tiltQ)).addScaledVector(slideDir, slide.dist * pose.front.slide);
    tmpV.z += pose.front.lift;
    for (const g of [wc.lid, wc.front]) { g.quaternion.copy(tiltQ); g.position.copy(tmpV); g.visible = pose.front.visible; }
    wc.hands.visible = pose.front.visible;
    if (!wc.hands.userData.ordered) { wc.hands.traverse((o) => { o.renderOrder = 5; }); wc.hands.userData.ordered = true; }
    // Nothing of the movement shows through a closed dial, so skip drawing it.
    mv.root.visible = state.open > 0;
    if (anim.to && (before !== state.open || reduced)) {
      const f = anim.from, span = state.openGoal - f.p;
      const u = span === 0 ? 1 : openPose((state.open - f.p) / span).camera;
      // Keep any explode lift (see the explode slider) in the destination framing.
      const dz = state.explode * 18;
      const toT = anim.to.target.clone(); toT.z += dz;
      const toP = anim.to.home.clone().sub(anim.to.target).multiplyScalar(1 + dz / 90).add(toT);
      controls.target.lerpVectors(f.target, toT, u);
      camera.position.lerpVectors(f.pos, toP, u);
      fit = f.fit + (anim.to.fit - f.fit) * u;
      fitFov();
      if (state.open === state.openGoal) anim.to = null;
    }
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
      fitFov();
    }
  }
  // Fit the whole watch (or plate plus crown) across narrow screens; 30 degrees is the desktop look.
  function fitFov() {
    const fitHalf = fit / camera.position.distanceTo(controls.target) / camera.aspect;
    camera.fov = 2 * Math.atan(Math.max(Math.tan(15 * Math.PI / 180), fitHalf)) * 180 / Math.PI;
    camera.updateProjectionMatrix();
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
    wc.setHands(dialAngles(e.hands));
    if (document.activeElement !== scrub) scrub.value = machine.t - Math.floor(machine.t / WINDOW) * WINDOW;
    timeOut.textContent = `${machine.t.toFixed(3)} s`;
    const st = statusText(e);
    if (st !== lastStatus) { statusEl.innerHTML = st; lastStatus = st; }
    applyOpen(dt);
    resize();
    controls.update();
    renderer.render(scene, camera);
    frameMs.push(performance.now() - t0);
    if (frameMs.length > 60) frameMs.shift();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Test hooks: stop the loop and render one still on demand.
  applyOpen(0);
  const renderStill = () => { resize(); controls.update(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); };
  window.__watch = { state, setOpen, applyOpen, machine, mv, wc, watch, VIEWS, renderer, scene, lights: { key, rimL, hemi }, camera, controls, frameMs, quality, sound,
    stop() { running = false; }, start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }, renderStill };
}

const PHASE_TEXT = { lock: 'locked', unlock: 'unlocking', impulse: 'impulse', drop: 'drop' };
function statusText(e) {
  if (e.mode === 'runaway') return '<b>Pallet fork removed.</b> Nothing holds the escape wheel, so the train spins free.';
  if (e.mode === 'unpowered') return '<b>No mainspring.</b> The train stands still and the balance slowly rings down.';
  if (e.mode === 'jammed') return '<b>No balance.</b> The fork falls to one side and the escape wheel stays locked.';
  return `Beat ${(e.beat % 6) + 1} of 6 &middot; <b>${PHASE_TEXT[e.phase] || e.phase}</b>`;
}

document.querySelectorAll('[data-figure="movement"]').forEach(initMovementFigure);
initFigures();
