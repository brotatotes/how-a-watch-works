// Measure how the 2D pallet stones in the escapement figure meet the escape wheel.
// For each stone placement it samples one full beat pair and reports the worst
// penetration into the wheel outline and the lock gap (0 means touching at lock).
// Usage: node tools/pallet_fit.mjs [search]
import { escapement } from '../src/sim/kinematics.js';
import { PLAN, trainPhases } from '../src/sim/train.js';
import { escapeOutline } from '../src/geom/profiles.js';
import * as P from '../src/sim/params.js';

const D2R = Math.PI / 180;
const E = PLAN.escape, Pp = PLAN.pallet, B = PLAN.balance;
const toE = Math.atan2(E.y - Pp.y, E.x - Pp.x) / D2R;
const eo = escapeOutline(15, 2.5).pts;

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDist(poly, x, y) {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    m = Math.min(m, Math.hypot(x - ax - u * dx, y - ay - u * dy));
  }
  return m;
}
// Stone sample points in pallet-fork frame: centre at radius r, angle toE+off, long axis at toE+off+tilt.
export function stonePts(st, sgn, n = 7) {
  const a = (toE + sgn * st.off) * D2R, b = (toE + sgn * (st.off + st.tilt)) * D2R;
  const cx = st.r * Math.cos(a), cy = st.r * Math.sin(a);
  const pts = [];
  for (let i = 0; i <= n; i++) for (const w of [-0.1, 0, 0.1]) {
    const l = -0.35 + (0.7 * i) / n;
    pts.push([cx + l * Math.cos(b) - w * Math.sin(b), cy + l * Math.sin(b) + w * Math.cos(b)]);
  }
  return pts;
}
export function measure(st, N = 240) {
  let pen = 0, lockGap = 0, locks = 0, impGap = 0, imps = 0;
  const T = 1 / P.BALANCE_HZ;
  for (let i = 0; i < N; i++) {
    const t = (T * i) / N + 0.02;
    const e = escapement(t);
    const esc = trainPhases(e.escape).escape * D2R;
    const f = e.fork * D2R;
    let best = Infinity;
    for (const sgn of [1, -1]) {
      for (const [px, py] of stonePts(st, sgn)) {
        // fork frame -> world -> escape wheel frame
        const wx = Pp.x + px * Math.cos(f) - py * Math.sin(f), wy = Pp.y + px * Math.sin(f) + py * Math.cos(f);
        const rx = wx - E.x, ry = wy - E.y;
        const qx = rx * Math.cos(-esc) - ry * Math.sin(-esc), qy = rx * Math.sin(-esc) + ry * Math.cos(-esc);
        const d = edgeDist(eo, qx, qy);
        if (inside(eo, qx, qy)) pen = Math.max(pen, d); else best = Math.min(best, d);
      }
    }
    if (e.phase === 'lock') { lockGap = Math.max(lockGap, best); locks++; }
    if (e.phase === 'impulse') { impGap = Math.max(impGap, best); imps++; }
  }
  return { pen: +pen.toFixed(3), lockGap: +lockGap.toFixed(3), locks, impGap: +impGap.toFixed(3), imps };
}

const CURRENT = { r: 1.4, off: 66, tilt: -7.5 }; // must match ST in src/figures2d.js
console.log('current', JSON.stringify(CURRENT), JSON.stringify(measure(CURRENT)));
if (process.argv[2] === 'search') {
  // Coarse pass with 40 time samples, then refine the best few at full resolution.
  const cand = [];
  for (let r = 1.3; r <= 2.3; r += 0.1) for (let off = 30; off <= 72; off += 3) for (let tilt = -60; tilt <= 60; tilt += 10) {
    const st = { r: +r.toFixed(2), off, tilt };
    const m = measure(st, 40);
    cand.push({ st, m, score: m.pen * 10 + m.lockGap + m.impGap });
  }
  cand.sort((a, b) => a.score - b.score);
  let best = null;
  for (const c of cand.slice(0, 6)) {
    for (let dr = -0.05; dr <= 0.051; dr += 0.025) for (let dof = -1.5; dof <= 1.51; dof += 0.75) for (let dt = -5; dt <= 5; dt += 2.5) {
      const st = { r: +(c.st.r + dr).toFixed(3), off: c.st.off + dof, tilt: c.st.tilt + dt };
      const m = measure(st, 120);
      const score = m.pen * 10 + m.lockGap + m.impGap;
      if (!best || score < best.score) best = { st, m, score };
    }
  }
  console.log('coarse top', JSON.stringify(cand.slice(0, 6)));
  console.log('best', JSON.stringify(best), 'full', JSON.stringify(measure(best.st)));
}
