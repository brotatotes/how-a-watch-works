import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/sim/params.js';
import { Machine } from '../src/sim/machine.js';

test('running machine keeps real time on the seconds hand', () => {
  const m = new Machine();
  m.seek(60);
  // After one minute the fourth wheel (seconds hand) has made one turn, within one beat.
  assert.ok(Math.abs(m.state.hands.seconds - 360) <= 360 / (P.BEATS_PER_SECOND * 60) + 1e-6, m.state.hands.seconds);
});

test('scrub is exact and reversible while running', () => {
  const m = new Machine();
  const a = m.seek(12.34).escape;
  m.seek(3);
  assert.equal(m.seek(12.34).escape, a);
});

test('removing the pallet fork lets the train run away', () => {
  const m = new Machine();
  m.seek(5);
  const e0 = m.state.escape;
  m.setPart('pallet', false);
  m.step(1);
  assert.equal(m.state.mode, 'runaway');
  // Normal running is 1 turn per 5 s; free running is far faster.
  assert.ok(m.state.escape - e0 > 360 * 5, m.state.escape - e0);
});

test('removing the mainspring stops the train and the balance rings down', () => {
  const m = new Machine();
  m.seek(5);
  m.setPart('mainspring', false);
  const e0 = m.state.escape;
  m.step(0.1);
  const early = Math.abs(m.state.balance);
  m.step(60);
  assert.equal(m.state.mode, 'unpowered');
  assert.equal(m.state.escape, e0);
  assert.ok(Math.abs(m.state.balance) < 270 * 0.2);
  void early;
});

test('removing the balance jams the fork against a banking', () => {
  const m = new Machine();
  m.seek(5);
  m.setPart('balance', false);
  const e0 = m.state.escape;
  m.step(10);
  assert.equal(m.state.mode, 'jammed');
  assert.equal(m.state.escape, e0);
  assert.equal(Math.abs(m.state.fork), P.LEVER_TOTAL / 2);
});

test('restoring a part resumes ticking without the train running backwards', () => {
  const m = new Machine();
  m.seek(5);
  m.setPart('pallet', false);
  m.step(0.5);
  const e1 = m.state.escape;
  m.setPart('pallet', true);
  assert.equal(m.state.mode, 'running');
  for (let i = 0; i < 50; i++) {
    const before = m.state.escape;
    m.step(0.02);
    assert.ok(m.state.escape >= before - P.RECOIL_DEG - 1e-9);
  }
  assert.ok(m.state.escape >= e1 - P.RECOIL_DEG);
});
