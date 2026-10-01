import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/sim/params.js';
import * as K from '../src/sim/kinematics.js';

test('beat rate is 21,600 vph', () => {
  assert.equal(P.VPH, 21600);
  assert.equal(P.BEATS_PER_SECOND, 6);
  assert.equal(P.ESCAPE_STEP_DEG, 12);
});

test('train ratios', () => {
  assert.equal(P.stageRatio(1), 8);
  assert.equal(P.stageRatio(2) * P.stageRatio(3), 60);
  assert.equal(P.stageRatio(4), 12);
  assert.equal(P.MOTION_RATIO, 12);
  assert.equal(P.POWER_RESERVE_H, 44);
});

test('escape wheel turns once per 5 s', () => {
  const a = K.escapement(5 + 1e-3).escape - K.escapement(1e-3).escape;
  assert.ok(Math.abs(a - 360) < 1e-9, String(a));
});

test('hands over one hour', () => {
  const e = K.escapement(3600 + 1e-3).escape - K.escapement(1e-3).escape;
  const h = K.hands(e);
  assert.ok(Math.abs(h.seconds / 360 - 60) < 1e-9);
  assert.ok(Math.abs(h.minutes / 360 - 1) < 1e-9);
  assert.ok(Math.abs(h.hours / 360 - 1 / 12) < 1e-9);
});

test('escapement phases in order with drop 1-2 degrees', () => {
  for (let k = 0; k < 12; k++) {
    const tc = K.beatCentre(k), h = K.liftHalfTime();
    const seq = [];
    let prev = K.escapement(tc - h - 0.01).escape;
    let minE = prev;
    for (let t = tc - h - 0.01; t < tc + h + 0.02; t += 1e-4) {
      const s = K.escapement(t);
      if (seq[seq.length - 1] !== s.phase) seq.push(s.phase);
      minE = Math.min(minE, s.escape);
    }
    assert.deepEqual(seq, ['lock', 'unlock', 'impulse', 'drop', 'lock'], `beat ${k}`);
    assert.ok(minE < prev, 'recoil during unlock');
    const afterImpulse = K.escapement(tc + h).escape;
    const afterDrop = K.escapement(tc + h + 0.01).escape;
    const drop = afterDrop - afterImpulse;
    assert.ok(drop >= 1 && drop <= 2, `drop ${drop}`);
  }
});

test('fork rests on banking outside lift zone', () => {
  for (let t = 0; t < 2; t += 0.0013) {
    const s = K.escapement(t);
    if (Math.abs(s.theta) > P.LIFT_ANGLE / 2 + 1e-9) assert.equal(Math.abs(s.fork), P.LEVER_TOTAL / 2);
    assert.ok(Math.abs(s.fork) <= P.LEVER_TOTAL / 2 + 1e-9);
  }
});

test('seconds hand steps 6 times per second and is still while locked', () => {
  let steps = 0;
  let last = K.escapement(0).escape;
  let lockedMoved = false;
  for (let t = 0; t < 1; t += 1e-4) {
    const s = K.escapement(t);
    if (s.phase !== 'lock') continue;
    if (s.escape !== last) {
      if (Math.abs(s.escape - last - 12) < 1e-9) steps++; else lockedMoved = true;
      last = s.escape;
    }
  }
  assert.equal(steps, 6);
  assert.equal(lockedMoved, false);
});

test('meshing gears keep teeth in gaps', () => {
  const beta = 37;
  for (let d = 0; d < 720; d += 3.7) {
    const driven = K.meshAngle(d, 80, 10, beta);
    // A driver tooth on the line of centres corresponds to a driven gap there.
    const pd = K.toothPhase(d, 80, beta);
    const pn = K.toothPhase(driven, 10, beta + 180);
    const sum = (pd + pn) % 1;
    assert.ok(Math.abs(sum - 0.5) < 1e-6 || Math.abs(sum + 0.5 - 1) < 1e-6, `d=${d} sum=${sum}`);
  }
});

test('runaway without pallet fork', () => {
  assert.ok(K.runawaySpeed(2, 0) > 10);
});

test('balance decays without impulse', () => {
  const a0 = Math.abs(K.decayingBalance(0, 0));
  const a1 = Math.abs(K.decayingBalance(30, 0));
  assert.ok(a1 < a0 * 0.4);
});
