// Checks that each wheel/pinion pair meshes without interpenetration over one
// pinion pitch of rotation, and writes an SVG preview of the profiles.
// Usage: node tools/profile_check.mjs [svgOut]
import { writeFileSync } from 'node:fs';
import { gearOutline, escapeOutline, crossingHoles } from '../src/geom/profiles.js';
import { TRAIN } from '../src/sim/params.js';

function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const rot = (pts, a, dx = 0) => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a) + dx, x * Math.sin(a) + y * Math.cos(a)]);

// Pinion phase so that a pinion gap faces the wheel tooth at angle 0.
export function pinionPhase(np) { return Math.PI - Math.PI / np; }

let fail = 0;
const results = [];
for (let i = 1; i < TRAIN.length; i++) {
  const drv = TRAIN[i - 1], dn = TRAIN[i];
  const m = drv.module;
  const W = gearOutline(drv.wheel, m);
  const Pn = gearOutline(dn.pinion, m);
  const d = W.rp + Pn.rp;
  const ratio = drv.wheel / dn.pinion;
  let hits = 0, minGap = Infinity;
  const steps = 240;
  for (let s = 0; s <= steps; s++) {
    const a = (s / steps) * (2 * Math.PI / drv.wheel);
    const wp = rot(W.pts, a);
    const pp = rot(Pn.pts, -a * ratio + pinionPhase(dn.pinion), d);
    for (const p of pp) if (inside(p, wp)) hits++;
    for (const p of wp) if (inside(p, pp)) hits++;
    // Minimum distance between pinion points near the mesh and wheel points.
    for (const p of pp) {
      if (p[0] > W.ra + 0.02) continue;
      for (const q of wp) {
        if (q[0] < d - Pn.ra - 0.02) continue;
        const g = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (g < minGap) minGap = g;
      }
    }
  }
  const overlapTips = W.ra + Pn.rr < d && Pn.ra + W.rr < d;
  const depthOk = W.ra > d - Pn.ra; // teeth actually engage
  const ok = hits === 0 && overlapTips && depthOk;
  if (!ok) fail++;
  results.push(`${drv.name} ${drv.wheel} -> ${dn.name} pinion ${dn.pinion}: centre ${d.toFixed(4)} mm, interpenetrating samples ${hits}, min gap ${minGap.toFixed(4)} mm, tips clear roots ${overlapTips}, teeth engage ${depthOk} => ${ok ? 'PASS' : 'FAIL'}`);
}
console.log(results.join('\n'));

// SVG preview: centre/third pair and the escape wheel.
const out = process.argv[2];
if (out) {
  const W = gearOutline(80, 0.1), Pn = gearOutline(10, 0.1), E = escapeOutline(15, 2.5);
  const d = W.rp + Pn.rp;
  const path = (pts, dx = 0, dy = 0) => 'M' + pts.map(([x, y]) => `${(x + dx).toFixed(4)},${(-y + dy).toFixed(4)}`).join('L') + 'Z';
  const pp = rot(Pn.pts, pinionPhase(10));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1 -2.8 12.5 5.6" width="1500" height="672" style="background:#f5efe3">
<g transform="translate(-${d - 1.5},0)"><path d="${path(W.pts)}" fill="#c9a24a" stroke="#5a4520" stroke-width="0.01"/>
<path d="${path(pp, d)}" fill="#9aa3ad" stroke="#333" stroke-width="0.01"/></g>
<path fill-rule="evenodd" d="${path(E.pts, 10.5, 0)} ${crossingHoles(1.62, 0.38, 5, 0.2).map((h) => path(h, 10.5, 0)).join(' ')}" fill="#c9a24a" stroke="#5a4520" stroke-width="0.01"/>
</svg>`;
  writeFileSync(out, svg);
}
process.exit(fail ? 1 : 0);
