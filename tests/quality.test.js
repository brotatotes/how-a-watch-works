import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuality, adaptQuality } from '../src/quality.js';

const run = (q, ms, seconds) => { let changes = 0; for (let t = 0; t < seconds * 1000; t += ms) if (adaptQuality(q, ms)) changes++; return changes; };

test('a steady 60 fps device keeps full quality', () => {
  const q = createQuality(2);
  run(q, 16.7, 30);
  assert.equal(q.level, 0);
  assert.equal(q.ratio, 2);
});

test('a 20 fps phone steps down within a few seconds and stops at 0.75', () => {
  const q = createQuality(2);
  run(q, 50, 2.5);
  assert.equal(q.level, 1);
  assert.equal(q.ratio, 1.5);
  run(q, 50, 60);
  assert.equal(q.ratio, 0.75);
  assert.equal(q.level, 4);
});

test('a 3 fps device (the headless software renderer case) also steps down', () => {
  const q = createQuality(1);
  run(q, 330, 3);
  assert.equal(q.level, 1);
  assert.equal(q.ratio, 0.75);
});

test('occasional hitches and long pauses do not trigger a drop', () => {
  const q = createQuality(2);
  for (let i = 0; i < 600; i++) adaptQuality(q, i % 20 === 0 ? 60 : 16.7);
  for (let i = 0; i < 10; i++) adaptQuality(q, 6000);
  assert.equal(q.level, 0);
});

test('a software renderer at under 1 fps still steps down', () => {
  const q = createQuality(2);
  run(q, 1300, 3);
  assert.equal(q.level, 1);
});
