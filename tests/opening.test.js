// Opening the watch: pure timing for the front (dial, hands and crystal as one rigid unit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPose, stepOpen, ease, OPEN_SECONDS, TILT_DEG, LIFT_MM } from '../src/sim/opening.js';

test('closed pose leaves the crystal, dial and hands in place', () => {
  const c = openPose(0);
  for (const k of ['lid', 'front']) {
    assert.equal(c[k].lift, 0, k); assert.equal(c[k].tilt, 0, k); assert.equal(c[k].slide, 0, k);
    assert.equal(c[k].visible, true); assert.equal(c[k].fade, 1);
  }
  assert.equal(c.camera, 0);
});

test('open pose has slid the front fully away and reached the movement camera', () => {
  const o = openPose(1);
  assert.equal(o.lid.visible, false); assert.equal(o.front.visible, false);
  assert.equal(o.front.slide, 1); assert.equal(o.front.lift, LIFT_MM); assert.equal(o.front.tilt, TILT_DEG);
  assert.ok(LIFT_MM >= 2 && LIFT_MM <= 4);
  assert.ok(TILT_DEG >= 15 && TILT_DEG <= 30);
  assert.equal(o.pull, 0); assert.equal(openPose(0).pull, 0);
  assert.equal(o.camera, 1);
});

test('motion is smooth and monotone: small steps of progress give small moves', () => {
  let prev = openPose(0);
  for (let i = 1; i <= 240; i++) {
    const cur = openPose(i / 240);
    const a = cur.front, b = prev.front;
    assert.ok(Math.abs(a.tilt - b.tilt) < 0.3, `tilt jump at ${i}`);
    assert.ok(Math.abs(a.lift - b.lift) < 0.1, `lift jump at ${i}`);
    assert.ok(Math.abs(a.slide - b.slide) < 0.02, `slide jump at ${i}`);
    assert.ok(a.tilt >= b.tilt && a.lift >= b.lift && a.slide > b.slide, `front moves back at ${i}`);
    assert.ok(cur.camera >= prev.camera);
    assert.equal(cur.pull, 0, 'camera only lerps between the two views');
    prev = cur;
  }
  assert.ok(ease(0) === 0 && ease(1) === 1 && Math.abs(ease(0.5) - 0.5) < 1e-9);
});

test('the front moves as one rigid opaque full-size unit: nothing fades or shrinks', () => {
  // t10 to t23: fading or shrinking the hands over a translucent dial left ghosts, stubs or a dial with no hands.
  for (let i = 0; i <= 200; i++) {
    const P = openPose(i / 200);
    assert.equal(P.hands.scale, 1, `hand scale at ${i}`);
    assert.equal(P.hands.fade, 1, `hand fade at ${i}`);
    assert.equal(P.front.fade, 1, `front fade at ${i}`);
    assert.deepEqual(P.lid, P.front, 'crystal rides with the dial');
    if (i < 200) assert.equal(P.front.visible, true, `front hidden early at ${i}`);
  }
});

test('opening takes between 1 and 1.5 seconds and closing reverses it', () => {
  assert.ok(OPEN_SECONDS >= 1 && OPEN_SECONDS <= 1.5);
  let p = 0, t = 0;
  while (p < 1) { p = stepOpen(p, 1, 1 / 60); t += 1 / 60; }
  assert.ok(Math.abs(t - OPEN_SECONDS) < 0.05, t);
  while (p > 0) p = stepOpen(p, 0, 1 / 60);
  assert.equal(p, 0);
});

test('reduced motion jumps straight to the end state', () => {
  assert.equal(stepOpen(0, 1, 1 / 60, true), 1);
  assert.equal(stepOpen(1, 0, 1 / 60, true), 0);
});

test('every frame of a nine-frame sequence moves, including the first and last', () => {
  const P = Array.from({ length: 9 }, (_, i) => openPose(i / 8));
  for (let i = 1; i < 9; i++) {
    assert.ok(P[i].front.slide - P[i - 1].front.slide > 0.05, `slide frame ${i}`);
    assert.ok(P[i].front.tilt - P[i - 1].front.tilt > 0.5, `tilt frame ${i}`);
    assert.ok(P[i].camera - P[i - 1].camera > 0.04, `camera frame ${i}`);
  }
});

test('the watch keeps the same orientation while opening, with no spin', () => {
  for (let i = 0; i <= 100; i++) assert.equal(openPose(i / 100).turn, 0);
});
