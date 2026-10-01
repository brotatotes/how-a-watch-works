// For each impulse sample, find the smallest escape-angle nudge that brings a tooth into
// contact with a pallet stone (gap under 0.01 mm) without penetration.
// Usage: node tools/impulse_nudge.mjs
import { escapement } from '../src/sim/kinematics.js';
import { PLAN, trainPhases } from '../src/sim/train.js';
import { escapeOutline } from '../src/geom/profiles.js';
import { stonePts } from './pallet_fit.mjs';
import * as P from '../src/sim/params.js';
const D2R = Math.PI / 180, E = PLAN.escape, Pp = PLAN.pallet;
const eo = escapeOutline(15, 2.5).pts;
const ST = { r: 1.4, off: 66, tilt: -7.5 };
function inside(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function edgeDist(poly, x, y) { let m = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, ay] = poly[j], [bx, by] = poly[i]; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); m = Math.min(m, Math.hypot(x - ax - u * dx, y - ay - u * dy)); } return m; }
export function gapAt(escDeg, forkDeg) {
  const esc = escDeg * D2R, f = forkDeg * D2R; let gap = Infinity, pen = 0;
  for (const sgn of [1, -1]) for (const [px, py] of stonePts(ST, sgn, 12)) {
    const wx = Pp.x + px * Math.cos(f) - py * Math.sin(f), wy = Pp.y + px * Math.sin(f) + py * Math.cos(f);
    const rx = wx - E.x, ry = wy - E.y;
    const qx = rx * Math.cos(-esc) - ry * Math.sin(-esc), qy = rx * Math.sin(-esc) + ry * Math.cos(-esc);
    const d = edgeDist(eo, qx, qy);
    if (inside(eo, qx, qy)) pen = Math.max(pen, d); else gap = Math.min(gap, d);
  }
  return { gap, pen };
}
const T = 1 / P.BALANCE_HZ;
for (let i = 0; i < 400; i++) {
  const t = (T * i) / 400 + 0.02, e = escapement(t);
  if (e.phase !== 'impulse' && e.phase !== 'unlock') continue;
  const base = trainPhases(e.escape).escape;
  const g0 = gapAt(base, e.fork);
  let best = null;
  for (let d = -1.5; d <= 1.5001; d += 0.05) { const g = gapAt(base + d, e.fork); if (g.pen === 0 && (!best || g.gap < best.g.gap - 1e-4 || (Math.abs(g.gap - best.g.gap) < 1e-4 && Math.abs(d) < Math.abs(best.d)))) best = { d: +d.toFixed(2), g }; }
  console.log(e.phase, 's', e.s.toFixed(3), 'gap', g0.gap.toFixed(3), 'pen', g0.pen.toFixed(3), '-> nudge', best.d, 'gap', best.g.gap.toFixed(3));
}
