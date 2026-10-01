// Fit the tooth-side face of each 2D pallet stone so the tooth stays on it through impulse.
// Stone frame: l along the stone, v = w*sg (negative is the tooth side). The face runs from
// (-0.35, vA) to (0.35, vB); the far side stays at v = +0.1. Checks penetration, lock gap and
// impulse gap over a full balance period. Usage: node tools/stone_face_fit.mjs
import { escapement } from '../src/sim/kinematics.js';
import { PLAN, trainPhases } from '../src/sim/train.js';
import { escapeOutline } from '../src/geom/profiles.js';
import * as P from '../src/sim/params.js';
const D2R = Math.PI / 180, E = PLAN.escape, Pp = PLAN.pallet;
const toE = Math.atan2(E.y - Pp.y, E.x - Pp.x) / D2R;
const ST = { r: 1.4, off: 66, tilt: -7.5 };
const eo = escapeOutline(15, 2.5).pts;
function inside(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function edgeDist(poly, x, y) { let m = Infinity; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, ay] = poly[j], [bx, by] = poly[i]; const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1; const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)); m = Math.min(m, Math.hypot(x - ax - u * dx, y - ay - u * dy)); } return m; }
// Densify the stone edges so both directions of contact are caught.
function stonePoly(vA, vB) { const c = [[-0.35, vA], [0.35, vB], [0.35, 0.1], [-0.35, 0.1]]; const out = []; for (let i = 0; i < 4; i++) { const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4]; for (let k = 0; k < 10; k++) out.push([ax + (bx - ax) * k / 10, ay + (by - ay) * k / 10]); } return { corners: c, pts: out }; }
// Precompute tooth outline points in each stone's frame for every sample.
const T = 1 / P.BALANCE_HZ, N = +(process.argv[2] || 240);
const samples = [];
for (let i = 0; i < N; i++) {
  const t = (T * i) / N + 0.02, e = escapement(t);
  const esc = trainPhases(e.escape).escape * D2R, f = e.fork * D2R;
  const per = {};
  for (const sg of [1, -1]) {
    const a = (toE + ST.off * sg) * D2R, b = (toE + (ST.off + ST.tilt) * sg) * D2R;
    const cx = ST.r * Math.cos(a), cy = ST.r * Math.sin(a);
    const wheel = [], toStone = (x, y) => { const wx = E.x + x * Math.cos(esc) - y * Math.sin(esc), wy = E.y + x * Math.sin(esc) + y * Math.cos(esc); const rx = wx - Pp.x, ry = wy - Pp.y; const fx = rx * Math.cos(-f) - ry * Math.sin(-f) - cx, fy = rx * Math.sin(-f) + ry * Math.cos(-f) - cy; return [fx * Math.cos(b) + fy * Math.sin(b), (-fx * Math.sin(b) + fy * Math.cos(b)) * sg]; };
    for (const [x, y] of eo) wheel.push(toStone(x, y));
    per[sg] = wheel.filter(([l, v]) => Math.abs(l) < 1 && Math.abs(v) < 1);
    per[sg].full = wheel;
  }
  samples.push({ phase: e.phase, per });
}
function measure(faces) {
  let pen = 0, lockGap = 0, impGap = 0;
  for (const s of samples) {
    let best = Infinity;
    for (const sg of [1, -1]) {
      const { corners, pts } = stonePoly(...faces[sg]);
      for (const [l, v] of s.per[sg]) if (inside(corners, l, v)) pen = Math.max(pen, edgeDist(corners, l, v));
      for (const [l, v] of pts) { const d = edgeDist(s.per[sg].full, l, v); if (inside(s.per[sg].full, l, v)) pen = Math.max(pen, d); else best = Math.min(best, d); }
    }
    if (s.phase === 'lock') lockGap = Math.max(lockGap, best);
    if (s.phase === 'impulse') impGap = Math.max(impGap, best);
  }
  return { pen: +pen.toFixed(3), lockGap: +lockGap.toFixed(3), impGap: +impGap.toFixed(3) };
}
const cur = { 1: [-0.1, -0.1], [-1]: [-0.1, -0.1] };
console.log('current', JSON.stringify(measure(cur)));
const cands = [[-0.1,-0.1],[-0.3,-0.1],[-0.1,-0.3],[-0.25,-0.05],[-0.05,-0.25],[-0.2,-0.2]];
for (const a of cands) for (const b of cands) { const f = { 1: a, [-1]: b }; console.log(JSON.stringify(f), JSON.stringify(measure(f))); }
// Where does the current stone get penetrated?
{
  const f = cur, byPhase = {};
  for (const s of samples) for (const sg of [1, -1]) {
    const { corners } = stonePoly(...f[sg]);
    for (const [l, v] of s.per[sg]) if (inside(corners, l, v)) { const d = edgeDist(corners, l, v); byPhase[s.phase + sg] = Math.max(byPhase[s.phase + sg] || 0, +d.toFixed(3)); }
  }
  console.log('current pen by phase+stone', JSON.stringify(byPhase));
}
