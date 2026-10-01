// Turns 2D tooth outlines into extruded Three.js meshes. Units are mm.
import * as THREE from 'three';
import { gearOutline, escapeOutline, crossingHoles } from '../geom/profiles.js';

const cache = new Map();

function shapeFrom(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}

function extrude(shape, thick, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick, curveSegments: 12, steps: 1,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 1,
  });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return g;
}

// A wheel blank with teeth, four crossings and a hub hole for the arbor.
// quality: 1 full, 0 reduced tessellation.
export function wheelGeometry(teeth, m, thick, { spokes = 4, arbor = 0.12, quality = 1 } = {}) {
  const key = `w${teeth}:${m}:${thick}:${spokes}:${quality}`;
  if (cache.has(key)) return cache.get(key);
  const o = gearOutline(teeth, m, { segs: quality ? 8 : 4, rootSegs: quality ? 6 : 3 });
  const rim = o.rr * 0.82;
  const holes = spokes ? crossingHoles(rim, Math.max(arbor * 2.6, o.rr * 0.18), spokes, Math.max(0.18, o.rr * 0.09)) : [];
  holes.push(circle(arbor, 16));
  const g = extrude(shapeFrom(o.pts, holes), thick, Math.min(0.012, thick * 0.1));
  cache.set(key, g);
  return g;
}

// A pinion: leaves cut on a short cylinder, drilled for its arbor.
export function pinionGeometry(leaves, m, length, quality = 1) {
  const key = `p${leaves}:${m}:${length}:${quality}`;
  if (cache.has(key)) return cache.get(key);
  const o = gearOutline(leaves, m, { segs: quality ? 8 : 4, rootSegs: quality ? 4 : 2 });
  const g = extrude(shapeFrom(o.pts), length, 0);
  cache.set(key, g);
  return g;
}

export function escapeWheelGeometry(thick = 0.15, quality = 1) {
  const key = `e${thick}:${quality}`;
  if (cache.has(key)) return cache.get(key);
  const o = escapeOutline(15, 2.5);
  const holes = crossingHoles(2.5 * 0.65, 0.38, 5, 0.2);
  holes.push(circle(0.08, 16));
  const g = extrude(shapeFrom(o.pts, holes), thick, 0.01);
  cache.set(key, g);
  return g;
}

export function circle(r, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  return pts;
}
