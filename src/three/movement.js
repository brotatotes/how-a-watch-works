// Procedural model of the whole movement. Units are mm. The movement plane is
// XY, the plate top is z = 0 and the reader looks down +Z at the train side.
import * as THREE from 'three';
import { TRAIN } from '../sim/params.js';
import { PLAN, trainPhases } from '../sim/train.js';
import { wheelGeometry, pinionGeometry, escapeWheelGeometry, circle } from './gears.js';

const D2R = Math.PI / 180;

// Layout. Centre distances are pitch radius sums from DESIGN.md.
const polar = (o, d, a) => new THREE.Vector2(o.x + d * Math.cos(a * D2R), o.y + d * Math.sin(a * D2R));
export const LAYOUT = Object.fromEntries(Object.entries(PLAN).map(([k, v]) => [k, typeof v === 'number' ? v : new THREE.Vector2(v.x, v.y)]));

// Directions from each driver to its driven arbor, for tooth phasing.
const dirDeg = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) / D2R;

export function makeMaterials() {
  return {
    brass: new THREE.MeshPhysicalMaterial({ color: 0xd9ad55, metalness: 1, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.3 }),
    gilt: new THREE.MeshPhysicalMaterial({ color: 0xe6bd6a, metalness: 1, roughness: 0.2 }),
    plate: new THREE.MeshPhysicalMaterial({ color: 0x77716a, metalness: 0.7, roughness: 0.45, envMapIntensity: 0.3 }),
    bridge: new THREE.MeshPhysicalMaterial({ color: 0xa9a59d, metalness: 0.85, roughness: 0.32, envMapIntensity: 0.35 }),
    steel: new THREE.MeshPhysicalMaterial({ color: 0xb9c0c8, metalness: 1, roughness: 0.18 }),
    blued: new THREE.MeshPhysicalMaterial({ color: 0x2b4aa0, metalness: 0.9, roughness: 0.25, clearcoat: 0.6 }),
    ruby: new THREE.MeshPhysicalMaterial({ color: 0xb0102c, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x3a0008, sheen: 0.4, sheenColor: 0xff6070 }),
    spring: new THREE.MeshPhysicalMaterial({ color: 0x9aa4b0, metalness: 1, roughness: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.0, depthWrite: false }),
  };
}

function cyl(r, h, mat, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.rotation.x = Math.PI / 2;
  return m;
}
function at(obj, x, y, z) { obj.position.set(x, y, z); return obj; }

// A jewel bearing: a ruby ring with a dark oil sink, set flush into a bridge.
function jewel(mats, r = 0.42) {
  const g = new THREE.Group();
  // Domed ruby with a polished oil sink, so it catches a highlight.
  const stone = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), mats.ruby);
  stone.rotation.x = Math.PI / 2;
  stone.position.z = -r * Math.cos(Math.PI * 0.32) + 0.04;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.22, 16), new THREE.MeshStandardMaterial({ color: 0x2a0508, roughness: 0.3 }));
  hole.position.z = 0.05;
  g.add(hole);
  const chaton = new THREE.Mesh(new THREE.TorusGeometry(r + 0.06, 0.06, 8, 32), mats.gilt);
  g.add(stone, chaton);
  return g;
}

// A rounded bar (two circles joined by tangents) as a shape.
function capsuleShape(a, b, r) {
  const s = new THREE.Shape();
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  s.absarc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2, false);
  s.absarc(a.x, a.y, r, ang + Math.PI / 2, ang + Math.PI * 1.5, false);
  return s;
}
// One smooth bridge outline: the convex hull of circles around each bearing.
function hullShape(circles) {
  const pts = [];
  for (const [c, r] of circles) for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const h = lo.slice(0, -1).concat(up.slice(0, -1));
  const s = new THREE.Shape();
  h.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}
function hullBridge(circles, z, thick, mats, screws = []) {
  const g = new THREE.Group();
  const m = slab(hullShape(circles), thick, mats.bridge);
  m.position.z = z;
  g.add(m);
  for (const s of screws) g.add(screw(mats, s, z + thick + 0.06));
  return g;
}
function slab(shape, thick, mat, holes = []) {
  for (const h of holes) shape.holes.push(h);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, curveSegments: 24, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  return new THREE.Mesh(g, mat);
}
function holePath(c, r) {
  const p = new THREE.Path();
  p.absarc(c.x, c.y, r, 0, Math.PI * 2, true);
  return p;
}
// Bridge made of capsules joining a list of points, plus screws.
function bridge(points, r, z, thick, mats, screws = []) {
  const g = new THREE.Group();
  for (let i = 0; i < points.length - 1; i++) {
    const m = slab(capsuleShape(points[i], points[i + 1], r), thick, mats.bridge);
    m.position.z = z;
    g.add(m);
  }
  for (const s of screws) g.add(screw(mats, s, z + thick + 0.06));
  return g;
}
function screw(mats, p, z) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.22, 24), mats.blued);
  head.rotation.x = Math.PI / 2;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.09, 0.1), new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.6 }));
  slot.position.z = 0.1;
  slot.rotation.z = (p.x * 7 + p.y * 3) % Math.PI;
  g.add(head, slot);
  g.position.set(p.x, p.y, z + 0.11);
  return g;
}

// A ratchet or crown wheel outline: sawtooth teeth with a centre hole.
function ratchetShape(n, rOut, rRoot, hole) {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.85) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const pts = [[rRoot, a0], [rOut, a1], [rRoot, a2]];
    pts.forEach(([r, a], j) => { if (i === 0 && j === 0) s.moveTo(r * Math.cos(a), r * Math.sin(a)); else s.lineTo(r * Math.cos(a), r * Math.sin(a)); });
  }
  s.holes.push(holePath(new THREE.Vector2(0, 0), hole));
  return s;
}

// Archimedean hairspring as a thin flat tube.
function hairspringGeometry(rIn = 0.55, rOut = 2.6, turns = 11, segs = 900) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const a = u * turns * Math.PI * 2;
    const r = rIn + (rOut - rIn) * u;
    pts.push(new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, 0.035, 5, false);
}

// Builds the movement. Returns { root, parts, update(state), setExplode(e) }.
// parts: name -> { group, baseZ, explodeZ, label }.
export function buildMovement({ quality = 1 } = {}) {
  const mats = makeMaterials();
  const L = LAYOUT;
  const root = new THREE.Group();
  const parts = {};
  const add = (name, label, group, baseZ, explodeZ) => {
    group.position.z = baseZ;
    root.add(group);
    parts[name] = { group, baseZ, explodeZ, label, visible: true };
    return group;
  };

  // --- Main plate with perlage hint (concentric rings) and jewel sinks.
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, L.plateR, 0, Math.PI * 2, false);
  const plateG = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape, { depth: 1.2, curveSegments: 96, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 3 }), mats.plate);
  plate.position.z = -1.35;
  plateG.add(plate);
  // Perlage: overlapping circular-grain spots, painted once into a texture and laid on a disc
  // that stops short of the bevel, so the plate keeps a clean round edge. (The earlier
  // instanced discs read as a scalloped outline in the polish review, evidence/polish/p1.)
  const PT = quality === 0 ? 512 : 1024;
  const pc = document.createElement('canvas'); pc.width = pc.height = PT;
  const pg = pc.getContext('2d');
  pg.fillStyle = '#7f796f'; pg.fillRect(0, 0, PT, PT);
  const PERL_R = L.plateR - 2.35; // leave a smooth rim band for the engraving and screws
  const perlR = PT * 0.55 / (2 * PERL_R);
  const step = perlR * 1.45;
  let seed = 7;
  for (let row = 0, y = 0; y < PT + perlR; row++, y += step * 0.87) {
    for (let x = (row % 2) * step / 2; x < PT + perlR; x += step) {
      seed = (seed * 16807) % 2147483647;
      const cx = x + (seed % 5) - 2, cy = y + ((seed >> 4) % 5) - 2;
      const gr = pg.createRadialGradient(cx - perlR * 0.25, cy - perlR * 0.25, perlR * 0.05, cx, cy, perlR);
      gr.addColorStop(0, '#a29c91'); gr.addColorStop(0.55, '#8e887e'); gr.addColorStop(1, '#78726a');
      pg.fillStyle = gr; pg.beginPath(); pg.arc(cx, cy, perlR, 0, Math.PI * 2); pg.fill();
      pg.strokeStyle = 'rgba(255,255,255,0.07)'; pg.lineWidth = 1;
      for (let k = 0.25; k < 1; k += 0.18) { pg.beginPath(); pg.arc(cx, cy, perlR * k, 0, Math.PI * 2); pg.stroke(); }
    }
  }
  const perlTex = new THREE.CanvasTexture(pc);
  perlTex.colorSpace = THREE.SRGBColorSpace;
  perlTex.anisotropy = 4;
  const perl = new THREE.MeshPhysicalMaterial({ map: perlTex, metalness: 0.7, roughness: 0.42, envMapIntensity: 0.35 });
  const perlMesh = new THREE.Mesh(new THREE.CircleGeometry(PERL_R, 128), perl);
  perlMesh.position.z = 0.002;
  plateG.add(perlMesh);
  // Casing screws: half-head screws at the rim that clamp the movement into its case.
  for (const a of [135, 330, 35]) {
    const cp = polar(new THREE.Vector2(0, 0), L.plateR - 0.55, a);
    const cs = screw(mats, cp, 0.0);
    plateG.add(cs);
  }
  // Engraving along the lower rim, gilt-filled like the calibre markings on a real plate.
  if (typeof document !== 'undefined') {
    const N = quality === 0 ? 1024 : 2048;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const draw = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, N, N);
      const px = N / (2 * L.plateR);
      const r = (L.plateR - 1.35) * px;
      ctx.font = `${Math.round(0.85 * px)}px "EB Garamond", Garamond, serif`;
      ctx.fillStyle = '#f1d38c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = 'HOW  A  WATCH  WORKS   \u00b7   21 600 A/h   \u00b7   LEVER  ESCAPEMENT';
      const gap = 0.12 * px;
      const widths = [...text].map((ch) => ctx.measureText(ch).width + gap);
      const span = widths.reduce((a, b) => a + b, 0) / r;
      // Canvas angles run clockwise (y down). Centre the arc at lower left, clear of the train.
      let th = (100 * Math.PI) / 180 + span / 2;
      [...text].forEach((ch, i) => {
        const a = th - widths[i] / r / 2;
        ctx.save();
        ctx.translate(N / 2 + r * Math.cos(a), N / 2 + r * Math.sin(a));
        ctx.rotate(a - Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        th -= widths[i] / r;
      });
      tex.needsUpdate = true;
    };
    draw();
    if (document.fonts) document.fonts.load('40px "EB Garamond"').then(draw, () => {});
    const eng = new THREE.Mesh(new THREE.PlaneGeometry(2 * L.plateR, 2 * L.plateR),
      new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, metalness: 0.9, roughness: 0.3, depthWrite: false }));
    eng.position.z = 0.012;
    eng.renderOrder = 1;
    plateG.add(eng);
  }
  add('plate', 'Main plate', plateG, 0, 0);

  // --- Barrel: drum with 96 teeth, cover, arbor and ratchet wheel on top.
  const tr = TRAIN;
  const barrelG = new THREE.Group();
  const bWheel = new THREE.Mesh(wheelGeometry(tr[0].wheel, tr[0].module, 0.3, { spokes: 0, arbor: 0.5, quality }), mats.brass);
  bWheel.position.z = 0.35;
  const drumR = tr[0].wheel * tr[0].module / 2 - 0.3;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(drumR, drumR, 1.6, 96, 1, true), mats.brass);
  drum.rotation.x = Math.PI / 2; drum.position.z = 1.2;
  const cover = new THREE.Mesh(new THREE.CircleGeometry(drumR, 96), mats.gilt);
  cover.position.z = 2.0;
  const coverRing = new THREE.Mesh(new THREE.TorusGeometry(drumR - 0.25, 0.05, 8, 96), mats.brass);
  coverRing.position.z = 2.02;
  barrelG.add(bWheel, drum, cover, coverRing);
  // Mainspring visible through a cut-away window on the cover edge is left for the essay figure.
  const bSpin = new THREE.Group();
  bSpin.add(barrelG);
  bSpin.position.set(L.barrel.x, L.barrel.y, 0);
  add('barrel', 'Barrel and mainspring', bSpin, 0, 2.5);
  bSpin.add(at(cyl(0.5, 3.8, mats.steel), 0, 0, 1.9));

  // --- Going train: each arbor carries its pinion and wheel.
  const specs = [
    { name: 'centre', label: 'Centre wheel', pos: L.centre, wheelZ: 1.05, pinionZ: [0.2, 0.8], explode: 3 },
    { name: 'third', label: 'Third wheel', pos: L.third, wheelZ: 1.55, pinionZ: [0.8, 1.3], explode: 7 },
    { name: 'fourth', label: 'Fourth wheel (seconds)', pos: L.fourth, wheelZ: 1.05, pinionZ: [1.3, 1.9], explode: 11 },
    { name: 'escape', label: 'Escape wheel', pos: L.escape, wheelZ: 1.55, pinionZ: [0.8, 1.3], explode: 15 },
  ];
  const spinners = { barrel: barrelG };
  const spinnersExtra = {};
  specs.forEach((s, idx) => {
    const i = idx + 1;
    const g = new THREE.Group();
    const spin = new THREE.Group();
    let w;
    if (s.name === 'escape') w = new THREE.Mesh(escapeWheelGeometry(0.15, quality), mats.steel);
    else w = new THREE.Mesh(wheelGeometry(tr[i].wheel, tr[i].module, 0.16, { spokes: 4, arbor: 0.12, quality }), mats.brass);
    w.position.z = s.wheelZ;
    const pm = tr[i - 1].module;
    const pLen = s.pinionZ[1] - s.pinionZ[0];
    const p = new THREE.Mesh(pinionGeometry(tr[i].pinion, pm, pLen, quality), mats.steel);
    p.position.z = (s.pinionZ[0] + s.pinionZ[1]) / 2;
    const arbor = cyl(0.12, 3.6, mats.steel, 12);
    arbor.position.z = 1.35;
    const hub = cyl(Math.max(0.35, tr[i].pinion * pm * 0.35), 0.14, mats.gilt, 20);
    hub.position.z = s.wheelZ + 0.12;
    spin.add(w, p, arbor, hub);
    g.add(spin);
    g.position.set(s.pos.x, s.pos.y, 0);
    spinners[s.name] = spin;
    add(s.name, s.label, g, 0, s.explode);
  });

  // --- Pallet fork: body with two ruby pallet stones, lever and fork horns.
  const pf = new THREE.Group();
  const pSpin = new THREE.Group();
  const toE = dirDeg(L.pallet, L.escape);
  const toB = dirDeg(L.pallet, L.balance);
  const O = new THREE.Vector2(0, 0);
  const armA = polar(O, 1.55, toE + 38), armB = polar(O, 1.55, toE - 38);
  const lever = polar(O, 2.45, toB);
  const forkZ = 1.47;
  // Polished steel so the fork stands out against the grey plate.
  const forkMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.12, clearcoat: 0.5 });
  // Anchor-shaped body: a solid plate across both arms, tapering into the lever.
  const body = slab(hullShape([[O, 0.5], [armA, 0.3], [armB, 0.3]]), 0.2, forkMat);
  const stemShape = slab(hullShape([[O, 0.42], [lever, 0.2]]), 0.2, forkMat);
  for (const m of [body, stemShape]) { m.position.z = forkZ; pSpin.add(m); }
  // Lightening hole in the body, a dark disc that reads as a cut-out.
  const cut = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.9 }));
  const cutP = polar(O, 0.62, toE);
  cut.position.set(cutP.x, cutP.y, forkZ + 0.27);
  pSpin.add(cut);
  for (const s of [-1, 1]) {
    const horn = slab(capsuleShape(polar(lever, 0.12, toB + 90 * s), polar(lever, 0.55, toB + 55 * s), 0.12), 0.2, forkMat);
    horn.position.z = forkZ;
    pSpin.add(horn);
  }
  // Guard pin: a short post under the fork slot, just clear of the safety roller,
  // that keeps the fork from flipping when a shock arrives between impulses.
  const guard = polar(O, 2.6, toB);
  pSpin.add(at(cyl(0.05, 0.4, mats.gilt, 8), guard.x, guard.y, forkZ - 0.05));
  // Blued pallet-arbor cap so the pivot point is obvious from above.
  pSpin.add(at(cyl(0.22, 0.08, mats.blued, 20), 0, 0, forkZ + 0.26));
  // Pallet stones stand vertically on the arm tips, reaching into the escape wheel plane.
  for (const [arm, tilt] of [[armA, toE + 38], [armB, toE - 38]]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.5), mats.ruby);
    const tip = polar(arm, 0.25, tilt);
    st.position.set(tip.x, tip.y, 1.62);
    st.rotation.z = tilt * D2R;
    pSpin.add(st);
  }
  pSpin.add(at(cyl(0.1, 2.8, mats.steel, 12), 0, 0, 1.4));
  pf.add(pSpin);
  pf.position.set(L.pallet.x, L.pallet.y, 0);
  spinners.pallet = pSpin;
  add('pallet', 'Pallet fork', pf, 0, 19);
  // Banking pins.
  const bankG = new THREE.Group();
  for (const s of [-1, 1]) {
    const bp = polar(L.pallet, 1.55, toB + 17 * s);
    bankG.add(at(cyl(0.12, 1.2, mats.gilt, 12), bp.x, bp.y, 1.0));
  }
  parts.plate.group.add(bankG);

  // --- Balance wheel with hairspring, roller and roller jewel.
  const bal = new THREE.Group();
  const bSpinG = new THREE.Group();
  const rimProfile = [[4.35, -0.25], [4.85, -0.25], [4.85, 0.25], [4.35, 0.25], [4.35, -0.25]].map(([x, y]) => new THREE.Vector2(x, y));
  const rim = new THREE.Mesh(new THREE.LatheGeometry(rimProfile, 128), mats.gilt);
  rim.rotation.x = Math.PI / 2;
  bSpinG.add(rim);
  for (let k = 0; k < 2; k++) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.55, 0.2), mats.gilt);
    arm.rotation.z = k * Math.PI;
    if (k === 0) bSpinG.add(arm);
  }
  // Timing screws around the rim.
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.PI / 16;
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 16), k % 4 === 0 ? mats.gilt : mats.brass);
    sc.position.set(Math.cos(a) * 4.97, Math.sin(a) * 4.97, 0);
    sc.rotation.z = a - Math.PI / 2;
    bSpinG.add(sc);
  }
  bSpinG.add(at(cyl(0.14, 4.2, mats.steel, 12), 0, 0, -0.6));
  const roller = at(cyl(0.7, 0.14, mats.steel, 32), 0, 0, forkZ - 2.2 + 0.07);
  bSpinG.add(roller);
  const rj = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 12), mats.ruby);
  rj.rotation.x = Math.PI / 2;
  // Roller jewel points toward the pallet arbor when the balance is at rest.
  const rjDir = dirDeg(L.balance, L.pallet);
  rj.position.set(Math.cos(rjDir * D2R) * 0.6, Math.sin(rjDir * D2R) * 0.6, forkZ - 2.2 + 0.1);
  bSpinG.add(rj);
  bal.add(bSpinG);
  bal.position.set(L.balance.x, L.balance.y, 2.2);
  spinners.balance = bSpinG;
  add('balance', 'Balance wheel', bal, 2.2, 23);

  const hs = new THREE.Group();
  const hsSpin = new THREE.Group();
  hsSpin.add(new THREE.Mesh(hairspringGeometry(), mats.spring));
  hs.add(hsSpin);
  hs.position.set(L.balance.x, L.balance.y, 2.2 + 0.55);
  spinners.hairspring = hsSpin;
  add('hairspring', 'Hairspring', hs, 2.2 + 0.55, 23);

  // --- Bridges with jewels and blued screws.
  const bz = 2.7;

  // --- Keyless works: ratchet wheel on the barrel arbor, crown wheel, click and
  // the winding stem that leaves the plate at the left edge.
  const kz = bz + 0.7;
  const ratchetG = new THREE.Group();
  const ratchet = new THREE.Mesh(new THREE.ExtrudeGeometry(ratchetShape(40, 3.9, 3.62, 0.55), { depth: 0.35, curveSegments: 8, bevelEnabled: false }), mats.steel);
  ratchetG.add(ratchet);
  for (let k = 0; k < 3; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 + k * 0.85, 0.018, 4, 96), mats.spring);
    ring.position.z = 0.36;
    ratchetG.add(ring);
  }
  ratchetG.add(screw(mats, new THREE.Vector2(0, 0), 0.3));
  const ratchetSpin = new THREE.Group();
  ratchetSpin.add(ratchetG);
  ratchetSpin.position.set(L.barrel.x, L.barrel.y, kz);
  spinnersExtra.ratchet = ratchetG;
  // Crown wheel sits beside the ratchet, directly over the inner end of the stem, so the
  // winding path reads as crown, stem, winding pinion, crown wheel, ratchet, barrel.
  const crownPos = polar(L.barrel, 5.3, 232);
  const crownW = new THREE.Mesh(new THREE.ExtrudeGeometry(ratchetShape(24, 1.35, 1.18, 0.2), { depth: 0.3, bevelEnabled: false }), mats.steel);
  const crownSpin = new THREE.Group();
  crownSpin.add(crownW);
  crownSpin.add(screw(mats, new THREE.Vector2(0, 0), 0.24));
  crownSpin.position.set(crownPos.x, crownPos.y, kz);
  const click = slab(capsuleShape(polar(L.barrel, 5.0, 150), polar(L.barrel, 3.95, 118), 0.28), 0.3, mats.steel);
  click.position.z = kz;
  const keyless = new THREE.Group();
  keyless.add(ratchetSpin, crownSpin, click, screw(mats, polar(L.barrel, 5.0, 150), kz + 0.24));
  add('keyless', 'Ratchet and crown wheel', keyless, 0, 38);

  // Winding stem in a groove along the plate, with its crown outside the case line.
  // Stem-local frame: u runs outward along the stem, v at right angles toward the lower left.
  const stemDir = dirDeg(new THREE.Vector2(0, 0), crownPos);
  const rc = crownPos.length();
  const U = new THREE.Vector2(Math.cos(stemDir * D2R), Math.sin(stemDir * D2R));
  const V = new THREE.Vector2(Math.cos((stemDir + 90) * D2R), Math.sin((stemDir + 90) * D2R));
  const f = (u, v) => new THREE.Vector2(U.x * u + V.x * v, U.y * u + V.y * v);
  const sz = 0.35;
  const stemG = new THREE.Group();
  const along = new THREE.Group();
  along.rotation.z = stemDir * D2R;
  stemG.add(along);
  const stemIn = rc - 0.9, stemOut = L.plateR + 2.2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, stemOut - stemIn, 16), mats.steel);
  stem.rotation.z = -Math.PI / 2;
  stem.position.set((stemIn + stemOut) / 2, 0, sz);
  along.add(stem);
  // Winding pinion under the crown wheel's rim and the sliding pinion beside it.
  for (const [u, len] of [[rc + 0.9, 0.9], [rc + 2.3, 1.1]]) {
    const pin = new THREE.Mesh(pinionGeometry(14, 0.09, len, quality), mats.steel);
    pin.rotation.y = Math.PI / 2;
    pin.position.set(u, 0, sz);
    along.add(pin);
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 40), mats.brass);
  const crownKnurl = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 1.1, 40, 1, true), mats.gilt);
  for (const m of [crown, crownKnurl]) { m.rotation.z = -Math.PI / 2; m.position.set(L.plateR + 3.0, 0, sz); along.add(m); }
  // Setting lever (pivots on a screw, its pin rides in the stem groove) and the yoke
  // that shifts the sliding pinion, each a flat steel part with a blued screw.
  const setLever = new THREE.Group();
  const lz = 0.05;
  for (const [a, b, r] of [[f(rc + 5.2, 2.9), f(rc + 3.6, 0.45), 0.62], [f(rc + 5.2, 2.9), f(rc + 6.4, 1.2), 0.5]]) {
    const m = slab(capsuleShape(a, b, r), 0.22, mats.steel);
    m.position.z = lz;
    setLever.add(m);
  }
  setLever.add(screw(mats, f(rc + 5.2, 2.9), lz + 0.28));
  const yoke = new THREE.Group();
  for (const [a, b, r] of [[f(rc - 0.6, 3.6), f(rc + 2.3, 0.55), 0.55], [f(rc - 0.6, 3.6), f(rc + 3.0, 4.6), 0.48]]) {
    const m = slab(capsuleShape(a, b, r), 0.22, mats.steel);
    m.position.z = lz + 0.02;
    yoke.add(m);
  }
  yoke.add(screw(mats, f(rc - 0.6, 3.6), lz + 0.3));
  // Thin yoke spring, a steel bar pressing the yoke tail.
  const spr = slab(capsuleShape(f(rc + 3.0, 4.6), f(rc + 6.8, 5.2), 0.14), 0.12, mats.spring);
  spr.position.z = lz;
  yoke.add(spr, screw(mats, f(rc + 7.0, 5.3), lz + 0.2));
  stemG.add(setLever, yoke);
  add('stem', 'Stem and setting works', stemG, 0, 0);

  // Barrel bridge also carries the centre-wheel jewel, a common layout.
  const barrelBridge = hullBridge([[L.barrel, 4.15], [L.centre, 1.35]], bz, 0.7, mats, [polar(L.barrel, 4.0, 160), polar(L.barrel, 3.9, 60), polar(L.centre, 1.9, -150)]);
  barrelBridge.add(at(jewel(mats, 0.9), L.barrel.x, L.barrel.y, bz + 0.72));
  barrelBridge.add(at(jewel(mats), L.centre.x, L.centre.y, bz + 0.72));
  add('barrelBridge', 'Barrel bridge', barrelBridge, 0, 31);

  // One train bridge over third, fourth and escape wheels, kept narrow so the
  // teeth and the escape wheel stay visible.
  const trainBridge = hullBridge([[L.third, 1.1], [L.fourth, 1.1], [polar(L.third, 2.4, 160), 0.9]], bz, 0.7, mats, [polar(L.third, 2.4, 160), polar(L.fourth, 1.5, -150)]);
  for (const p of [L.third, L.fourth]) trainBridge.add(at(jewel(mats), p.x, p.y, bz + 0.72));
  // The escape wheel gets its own slim bar so its teeth and the pallets stay in view.
  trainBridge.add(bridge([polar(L.escape, 2.2, -70), L.escape], 0.55, bz, 0.5, mats, [polar(L.escape, 2.2, -70)]));
  trainBridge.add(at(jewel(mats, 0.32), L.escape.x, L.escape.y, bz + 0.52));
  add('trainBridge', 'Train bridge', trainBridge, 0, 30);

  const palletBridge = bridge([polar(L.pallet, 1.9, toE + 150), L.pallet], 0.5, bz, 0.5, mats, [polar(L.pallet, 2.0, toE + 150)]);
  palletBridge.add(at(jewel(mats, 0.3), L.pallet.x, L.pallet.y, bz + 0.52));
  add('palletBridge', 'Pallet bridge', palletBridge, 0, 29);

  // Foot sits outboard of the balance, away from the escapement, so the pallet fork shows.
  const cockFoot = polar(L.balance, 6.4, 105);
  const cock = hullBridge([[cockFoot, 1.6], [L.balance, 0.95]], 4.2, 0.6, mats, [cockFoot]);
  cock.add(at(jewel(mats, 0.5), L.balance.x, L.balance.y, 4.82));
  const post = at(cyl(1.6, 4.2, mats.bridge, 48), cockFoot.x, cockFoot.y, 2.1);
  cock.add(post);
  add('cock', 'Balance cock', cock, 0, 34);

  // Default rest state.
  const angleCache = {};
  function update({ escapeDeg = 0, forkDeg = 0, balanceDeg = 0 } = {}) {
    // Escape wheel turns counter-clockwise (increasing angle), matching its tooth profile.
    const esc = escapeDeg;
    // Back out the fourth, third, centre and barrel angles from the escape wheel
    // using exact mesh phasing (ratio and gap alignment on the line of centres).
    const out = trainPhases(esc);
    for (const n of ['barrel', 'centre', 'third', 'fourth', 'escape']) spinners[n].rotation.z = out[n] * D2R;
    spinners.pallet.rotation.z = forkDeg * D2R;
    spinners.balance.rotation.z = balanceDeg * D2R;
    // Hairspring breathes: inner end turns with the balance, outer end is fixed.
    spinners.hairspring.rotation.z = balanceDeg * D2R * 0.5;
    Object.assign(angleCache, out);
    return out;
  }
  function setExplode(e) {
    for (const p of Object.values(parts)) p.group.position.z = p.baseZ + e * p.explodeZ;
  }
  function setVisible(name, v) {
    if (!parts[name]) return;
    parts[name].visible = v;
    parts[name].group.visible = v;
  }
  update();
  return { root, parts, spinners, mats, update, setExplode, setVisible, layout: L };
}

export { circle };
