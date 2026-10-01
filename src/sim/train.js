// Plan layout of the going train and exact tooth phasing of every arbor.
// Pure math with plain {x, y} points so the 3D model and the node tests share it.
// Units are mm. Centre distances are pitch-radius sums from DESIGN.md.
import { TRAIN } from './params.js';
import { meshAngle } from './kinematics.js';

const D2R = Math.PI / 180;
export const polar = (o, d, a) => ({ x: o.x + d * Math.cos(a * D2R), y: o.y + d * Math.sin(a * D2R) });
export const dirDeg = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) / D2R;

export const PLAN = (() => {
  const centre = { x: 0, y: 0 };
  const barrel = polar(centre, 6.48, 125);
  const third = polar(centre, 4.5, -32);
  const fourth = polar(third, 3.825, -100);
  const escape = polar(fourth, 3.4125, 2);
  const pallet = polar(escape, 2.9, 48);
  const balance = polar(pallet, 3.4, 48);
  return { centre, barrel, third, fourth, escape, pallet, balance, plateR: 16.6 };
})();

// Each mesh: driver arbor, driven arbor, driver wheel teeth, driven pinion leaves, module.
export const MESHES = [1, 2, 3, 4].map((i) => ({
  driver: TRAIN[i - 1].name, driven: TRAIN[i].name,
  driverTeeth: TRAIN[i - 1].wheel, drivenTeeth: TRAIN[i].pinion,
  module: TRAIN[i - 1].module ?? TRAIN[i - 2].module,
  beta: dirDeg(PLAN[TRAIN[i - 1].name], PLAN[TRAIN[i].name]),
}));

// Angles of every arbor for a given barrel angle, each phased into its driver's gaps.
function forward(b) {
  const out = { barrel: b };
  let a = b;
  for (const m of MESHES) {
    a = meshAngle(a, m.driverTeeth, m.drivenTeeth, m.beta);
    out[m.driven] = a;
  }
  return out;
}

// Signed overall ratio, escape turns per barrel turn (every mesh reverses direction).
export const TOTAL_RATIO = MESHES.reduce((r, m) => -r * m.driverTeeth / m.drivenTeeth, 1);

// All arbor angles (degrees, counter-clockwise positive) that put the escape wheel at escDeg.
// Every map is linear, so solving for the barrel angle is exact.
const BASE = forward(0);
export function trainPhases(escDeg) {
  return forward((escDeg - BASE.escape) / TOTAL_RATIO);
}

// Tooth-centre points on the pitch circle of a gear with n teeth turned to angleDeg.
// Tooth k sits at angle angleDeg + k * 360 / n, matching gears.js.
export function toothPoints(centre, n, pitchR, angleDeg) {
  const pts = [];
  for (let k = 0; k < n; k++) pts.push(polar(centre, pitchR, angleDeg + k * 360 / n));
  return pts;
}
