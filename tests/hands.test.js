// Dial hand mapping: the 3D hands are driven from machine.state.hands through handmap.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Machine } from '../src/sim/machine.js';
import * as P from '../src/sim/params.js';
import { handAngles, dialAngles, crownDegFor, twelveDegFor } from '../src/sim/handmap.js';
import { PLAN } from '../src/sim/train.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('watch starts at 10:09', () => {
  const m = new Machine();
  const d = dialAngles(m.state.hands);
  assert.ok(near(d.hour, 304.5, 0.05), d.hour);
  assert.ok(near(d.minute, 54, 0.05), d.minute);
});

test('hour hand turns at 1/12 of the minute hand', () => {
  const m = new Machine();
  const a0 = handAngles(m.state.hands);
  m.seek(1800);
  const a1 = handAngles(m.state.hands);
  const dm = a1.minute - a0.minute, dh = a1.hour - a0.hour;
  assert.ok(near(dm, 180, 0.5), dm);
  assert.ok(near(dm / dh, P.MOTION_RATIO, 1e-6), dm / dh);
});

test('seconds hand steps once per beat, 6 degrees per second', () => {
  const m = new Machine();
  const step = 360 / (P.BEATS_PER_SECOND * 60);
  const seen = [];
  // Sample the middle of each lock phase across two seconds.
  for (let k = 1; k <= 12; k++) {
    m.seek(k / P.BEATS_PER_SECOND + 0.04);
    seen.push(handAngles(m.state.hands).second);
  }
  for (let i = 1; i < seen.length; i++) assert.ok(near(seen[i] - seen[i - 1], step, 0.05), `${i}: ${seen[i] - seen[i - 1]}`);
  // Between beats (while locked) the hand stands still.
  m.seek(1 / P.BEATS_PER_SECOND + 0.03); const a = handAngles(m.state.hands).second;
  m.seek(1 / P.BEATS_PER_SECOND + 0.05); const b = handAngles(m.state.hands).second;
  assert.ok(near(a, b, 0.2), `${a} vs ${b}`);
});

test('hands freeze without the mainspring and run away without the fork', () => {
  const m = new Machine();
  m.seek(5);
  m.setPart('mainspring', false);
  const a = handAngles(m.state.hands);
  m.seek(20);
  const b = handAngles(m.state.hands);
  assert.deepEqual(a, b);
  const r = new Machine();
  r.seek(5);
  r.setPart('pallet', false);
  const s0 = handAngles(r.state.hands).second;
  r.seek(6);
  assert.ok(handAngles(r.state.hands).second - s0 > 360, 'seconds hand should race when the fork is removed');
});

test('crown direction matches the stem and 12 is a quarter turn from it', () => {
  const c = crownDegFor(PLAN);
  assert.ok(near(c, 170.79, 0.05), c);
  assert.ok(near(twelveDegFor(PLAN) - c, 90));
});
