// Geometric mesh checks on the actual tooth outlines used by the 3D model.
// For every mesh of the going train, at many escape wheel angles (including
// runaway speeds), no tooth outline point of one gear may lie inside the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gearOutline } from '../src/geom/profiles.js';
import { MESHES, PLAN, trainPhases, TOTAL_RATIO } from '../src/sim/train.js';
import { Machine } from '../src/sim/machine.js';
import * as P from '../src/sim/params.js';

const D2R = Math.PI / 180;
const place = (pts, c, deg) => {
  const co = Math.cos(deg * D2R), si = Math.sin(deg * D2R);
  return pts.map(([x, y]) => [c.x + x * co - y * si, c.y + x * si + y * co]);
};
function inside(p, poly) {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}
const outlines = MESHES.map((m) => ({
  drv: gearOutline(m.driverTeeth, m.module), dvn: gearOutline(m.drivenTeeth, m.module),
}));

function overlaps(escDeg) {
  const a = trainPhases(escDeg);
  const hits = [];
  MESHES.forEach((m, i) => {
    const { drv, dvn } = outlines[i];
    const A = place(drv.pts, PLAN[m.driver], a[m.driver]);
    const B = place(dvn.pts, PLAN[m.driven], a[m.driven]);
    const cB = PLAN[m.driven], cA = PLAN[m.driver];
    // Only points that can reach the other gear matter.
    const nearB = A.filter(([x, y]) => Math.hypot(x - cB.x, y - cB.y) < dvn.ra);
    const nearA = B.filter(([x, y]) => Math.hypot(x - cA.x, y - cA.y) < drv.ra);
    const n = nearB.filter((p) => inside(p, B)).length + nearA.filter((p) => inside(p, A)).length;
    if (n) hits.push(`${m.driver}->${m.driven}:${n}`);
  });
  return hits;
}

test('centre distances equal pitch radius sums', () => {
  for (const m of MESHES) {
    const d = Math.hypot(PLAN[m.driven].x - PLAN[m.driver].x, PLAN[m.driven].y - PLAN[m.driver].y);
    assert.ok(Math.abs(d - m.module * (m.driverTeeth + m.drivenTeeth) / 2) < 1e-9, `${m.driver}->${m.driven} ${d}`);
  }
});

test('teeth never interpenetrate over two escape wheel turns', () => {
  const bad = [];
  for (let e = 0; e < 720; e += 0.73) {
    const h = overlaps(e);
    if (h.length) bad.push(`${e.toFixed(2)}: ${h.join(' ')}`);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('teeth never interpenetrate while the train runs away', () => {
  const m = new Machine();
  m.seek(3);
  m.setPart('pallet', false);
  const bad = [];
  for (let k = 0; k < 200; k++) {
    m.step(0.0137);
    const h = overlaps(m.state.escape);
    if (h.length) bad.push(h.join(' '));
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test('no slip: every arbor turns at its exact ratio', () => {
  const a0 = trainPhases(0), a1 = trainPhases(360);
  // Each mesh reverses direction, so neighbouring arbors alternate sign.
  // Per escape turn: fourth 1/12 (84/7), third 1/(12*7.5), centre 1/(12*7.5*8), barrel 1/5760.
  assert.ok(Math.abs((a1.fourth - a0.fourth) + 30) < 1e-9);
  assert.ok(Math.abs((a1.third - a0.third) - 4) < 1e-9);
  assert.ok(Math.abs((a1.centre - a0.centre) + 0.5) < 1e-9);
  assert.ok(Math.abs((a1.barrel - a0.barrel) - 0.0625) < 1e-9);
  assert.ok(Math.abs((a1.escape - a0.escape) - 360) < 1e-9);
  assert.ok(Math.abs(Math.abs(TOTAL_RATIO) - 8 * 8 * 7.5 * 12) < 1e-9);
  // Seconds hand on the fourth wheel: 60 s per turn at 6 beats of 12 degrees per second.
  const escPerSecond = P.BEATS_PER_SECOND * P.ESCAPE_STEP_DEG;
  assert.ok(Math.abs(escPerSecond * 60 / 12 - 360) < 1e-9);
});
