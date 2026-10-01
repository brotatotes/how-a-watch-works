// Tooth-tip path in each pallet stone's own frame during impulse. A rigid stone whose
// working end follows this path stays in contact through the whole impulse.
// Usage: node tools/impulse_locus.mjs
import { escapement } from '../src/sim/kinematics.js';
import { PLAN, trainPhases } from '../src/sim/train.js';
import { escapeOutline } from '../src/geom/profiles.js';
import * as P from '../src/sim/params.js';
const D2R = Math.PI / 180, E = PLAN.escape, Pp = PLAN.pallet;
const toE = Math.atan2(E.y - Pp.y, E.x - Pp.x) / D2R;
const ST = { r: 1.4, off: 66, tilt: -7.5 };
const pts = escapeOutline(15, 2.5).pts;
const rmax = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
const tips = pts.filter(([x, y]) => Math.hypot(x, y) > rmax - 0.02);
const T = 1 / P.BALANCE_HZ;
for (let i = 0; i < 400; i++) {
  const t = (T * i) / 400 + 0.02, e = escapement(t);
  if (e.phase !== 'impulse') continue;
  const esc = trainPhases(e.escape).escape * D2R, f = e.fork * D2R;
  const out = [];
  for (const sg of [1, -1]) {
    const a = (toE + ST.off * sg) * D2R, b = (toE + (ST.off + ST.tilt) * sg) * D2R;
    const cx = ST.r * Math.cos(a), cy = ST.r * Math.sin(a);
    let best = null;
    for (const [tx, ty] of tips) {
      const wx = E.x + tx * Math.cos(esc) - ty * Math.sin(esc), wy = E.y + tx * Math.sin(esc) + ty * Math.cos(esc);
      const rx = wx - Pp.x, ry = wy - Pp.y; // fork frame
      const fx = rx * Math.cos(-f) - ry * Math.sin(-f) - cx, fy = rx * Math.sin(-f) + ry * Math.cos(-f) - cy;
      const l = fx * Math.cos(b) + fy * Math.sin(b), w = -fx * Math.sin(b) + fy * Math.cos(b);
      if (!best || Math.hypot(l, w) < Math.hypot(best.l, best.w)) best = { l, w };
    }
    out.push(`sg${sg} l ${best.l.toFixed(3)} w*sg ${(best.w * sg).toFixed(3)}`);
  }
  console.log('beat', e.beat, 's', e.s.toFixed(3), out.join(' | '));
}
