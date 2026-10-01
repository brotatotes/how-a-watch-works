// Procedural watch case, dial and hands that close over the movement. Units are mm and the
// frame matches movement.js: the movement plane is XY, the plate top is z = 0 and the dial is
// read from +Z. 12 o'clock sits a quarter turn counter-clockwise from the winding stem.
import * as THREE from 'three';
import { PLAN } from '../sim/train.js';
import { crownDegFor, twelveDegFor } from '../sim/handmap.js';

const D2R = Math.PI / 180;
export const CASE = { innerR: 17.0, outerR: 18.6, bezelR: 16.3, backZ: -3.2, dialZ: 6.1, topZ: 7.3, stemZ: 0.35 };

function caseMaterials() {
  return {
    steel: new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.14, envMapIntensity: 2.6, clearcoat: 0.4, clearcoatRoughness: 0.12 }),
    brushed: new THREE.MeshPhysicalMaterial({ color: 0xc9ced4, metalness: 1, roughness: 0.34, envMapIntensity: 2.2 }),
    hand: new THREE.MeshPhysicalMaterial({ color: 0x1d2a4a, metalness: 0.9, roughness: 0.22, envMapIntensity: 1.6, clearcoat: 0.8 }),
    secHand: new THREE.MeshPhysicalMaterial({ color: 0x8a3a18, metalness: 0.6, roughness: 0.3, envMapIntensity: 1.2 }),
    crystal: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.06, envMapIntensity: 1.4, clearcoat: 1, depthWrite: false }),
  };
}

// Dial artwork drawn with 12 o'clock at the top of the canvas. `sub` is the small seconds
// centre in dial millimetres (x right, y up when 12 is up).
function dialTexture(R, sub, subR) {
  const N = 1024, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const s = N / (2 * R), C = N / 2;
  const px = (x) => C + x * s, py = (y) => C - y * s;
  const grad = g.createRadialGradient(C, C * 0.8, N * 0.05, C, C, N * 0.52);
  grad.addColorStop(0, '#fbf5e6'); grad.addColorStop(1, '#ece2c9');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  // Minute track: a thin ring with sixty ticks.
  g.strokeStyle = '#3b332a';
  g.lineWidth = 0.08 * s;
  for (const r of [R - 0.9, R - 2.0]) { g.beginPath(); g.arc(C, C, r * s, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 60; i++) {
    const a = i * 6 * D2R;
    g.lineWidth = (i % 5 ? 0.07 : 0.16) * s;
    const r0 = R - 2.0, r1 = R - 0.9;
    g.beginPath(); g.moveTo(px(Math.sin(a) * r0), py(Math.cos(a) * r0)); g.lineTo(px(Math.sin(a) * r1), py(Math.cos(a) * r1)); g.stroke();
  }
  // Serif numerals, skipping any that would touch the small seconds.
  g.fillStyle = '#1c1712';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const rn = R - 4.1;
  for (let h = 1; h <= 12; h++) {
    const a = h * 30 * D2R, x = Math.sin(a) * rn, y = Math.cos(a) * rn;
    if (Math.hypot(x - sub.x, y - sub.y) < subR + 2.6) continue;
    g.font = `600 ${(h % 3 ? 2.3 : 2.6) * s}px "EB Garamond", "Cormorant Garamond", Georgia, "Times New Roman", serif`;
    g.fillText(String(h), px(x), py(y) + 0.1 * s);
  }
  // Small seconds: a recessed ring with sixty ticks and numbers every 15.
  const sx = px(sub.x), sy = py(sub.y);
  const sg = g.createRadialGradient(sx, sy, 0, sx, sy, subR * s);
  sg.addColorStop(0, '#efe6cf'); sg.addColorStop(0.92, '#e6dabd'); sg.addColorStop(1, '#d6c8a6');
  g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, subR * s, 0, Math.PI * 2); g.fill();
  g.lineWidth = 0.06 * s; g.strokeStyle = '#3b332a';
  g.beginPath(); g.arc(sx, sy, subR * s, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i * 6 * D2R, r0 = subR * (i % 5 ? 0.86 : 0.76), r1 = subR * 0.96;
    g.lineWidth = (i % 5 ? 0.04 : 0.09) * s;
    g.beginPath(); g.moveTo(sx + Math.sin(a) * r0 * s, sy - Math.cos(a) * r0 * s); g.lineTo(sx + Math.sin(a) * r1 * s, sy - Math.cos(a) * r1 * s); g.stroke();
  }
  g.font = `${0.95 * s}px "EB Garamond", Georgia, "Times New Roman", serif`;
  for (const [v, a] of [['60', 0], ['15', 90], ['30', 180], ['45', 270]]) {
    const r = subR * 0.55;
    g.fillText(v, sx + Math.sin(a * D2R) * r * s, sy - Math.cos(a * D2R) * r * s);
  }
  // Maker's line under 12, in small capitals.
  g.font = `${1.05 * s}px "EB Garamond", Georgia, "Times New Roman", serif`;
  g.fillStyle = '#4a3f33';
  g.fillText('M E C H A N I C A L', C, py(sub.y > 0 ? -R * 0.4 : R * 0.4));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A flat hand pointing along +y from its pivot, with a slight bevel so it catches light.
function handMesh(len, wTip, wBase, tail, mat, thick = 0.12) {
  const sh = new THREE.Shape();
  sh.moveTo(-wBase / 2, -tail);
  sh.lineTo(wBase / 2, -tail);
  sh.lineTo(wBase / 2 * 0.9, 0);
  sh.lineTo(wTip / 2, len * 0.92);
  sh.lineTo(0, len);
  sh.lineTo(-wTip / 2, len * 0.92);
  sh.lineTo(-wBase / 2 * 0.9, 0);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  return new THREE.Mesh(geo, mat);
}

function hub(r, h, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat);
  m.rotation.x = Math.PI / 2;
  return m;
}

export function buildCase({ quality = 1 } = {}) {
  const mats = caseMaterials();
  const K = CASE;
  const root = new THREE.Group();
  root.name = 'case';
  const crownDeg = crownDegFor(PLAN);
  const twelveDeg = twelveDegFor(PLAN);
  const seg = quality >= 1 ? 128 : 72;

  // Case middle and bezel as one lathe profile (r, z), revolved about Z.
  const prof = [
    [K.innerR, K.backZ + 0.6], [K.outerR - 0.5, K.backZ + 0.6], [K.outerR - 0.05, K.backZ + 1.2],
    [K.outerR, K.backZ + 2.2], [K.outerR, K.dialZ - 1.6], [K.outerR - 0.15, K.dialZ - 0.4],
    [K.outerR - 0.3, K.dialZ - 0.1], [K.innerR, K.dialZ - 0.1],
    // Close the profile with the inner wall so the open case reads as solid metal, not a hoop.
    [K.innerR, K.backZ + 0.6],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const lathe = new THREE.LatheGeometry(prof, seg);
  lathe.rotateX(Math.PI / 2); // Lathe revolves about Y; turn it to revolve about Z.
  const middle = new THREE.Mesh(lathe, mats.steel);
  // The snap-on bezel is a separate ring. t28 review: with the bezel left on the case, the lifting
  // dial slid over it and seemed to grow, so the bezel now leaves with the crystal and dial.
  const bezelProf = [
    [K.innerR - 0.2, K.dialZ - 0.1], [K.outerR - 0.3, K.dialZ - 0.1], [K.outerR - 0.6, K.dialZ + 0.5],
    [K.outerR - 1.3, K.topZ - 0.1], [K.bezelR + 0.3, K.topZ], [K.bezelR, K.topZ - 0.2],
    [K.bezelR - 0.1, K.dialZ + 0.25], [K.innerR - 0.2, K.dialZ + 0.25], [K.innerR - 0.2, K.dialZ - 0.1],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const bezelGeo = new THREE.LatheGeometry(bezelProf, seg);
  bezelGeo.rotateX(Math.PI / 2);
  const bezel = new THREE.Mesh(bezelGeo, mats.steel);
  const caseGroup = new THREE.Group();
  caseGroup.add(middle);

  // Lugs: four horns drawn in side profile (radial distance, height) so each one grows out of the
  // case flank and sweeps down towards the strap, then extruded across its width.
  const lugW = 2.4;
  const lugShape = new THREE.Shape();
  lugShape.moveTo(0, K.backZ + 2.0);
  lugShape.lineTo(2.4, K.backZ + 2.0);
  lugShape.quadraticCurveTo(5.2, K.backZ + 1.6, 6.6, K.backZ + 0.4);
  lugShape.lineTo(7.1, K.backZ + 1.1);
  lugShape.quadraticCurveTo(7.0, K.backZ + 2.4, 5.6, K.dialZ - 3.4);
  lugShape.quadraticCurveTo(3.6, K.dialZ - 1.2, 1.0, K.dialZ - 1.1);
  lugShape.lineTo(0, K.dialZ - 1.1);
  lugShape.closePath();
  const lugGeo = new THREE.ExtrudeGeometry(lugShape, { depth: lugW, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 3, curveSegments: 12 });
  lugGeo.rotateX(Math.PI / 2); // profile y becomes height; extrusion runs across the lug
  lugGeo.translate(0, lugW / 2, 0);
  for (const end of [0, 180]) {
    for (const side of [-1, 1]) {
      const a = (twelveDeg + end) * D2R;
      const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const lug = new THREE.Mesh(lugGeo, mats.steel);
      const off = 8.6 * side, start = Math.sqrt(K.outerR * K.outerR - off * off) - 0.7; // root stays outside the inner wall, so no notches show when open
      lug.position.set(ux * start + vx * off, uy * start + vy * off, 0);
      lug.rotation.z = a;
      caseGroup.add(lug);
    }
  }
  // Crown with a short tube, on the stem axis and enclosing the movement's own crown.
  const along = new THREE.Group();
  along.rotation.z = crownDeg * D2R;
  // The movement's own crown spans 18.8 to 20.4 mm with radius 1.62, so the case crown wraps it.
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.8, 32), mats.brushed);
  tube.rotation.z = -Math.PI / 2; tube.position.set(K.outerR + 0.2, 0, K.stemZ);
  const crownG = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.4, 48), mats.steel);
  crownG.rotation.z = -Math.PI / 2; crownG.position.set(K.outerR + 1.8, 0, K.stemZ);
  along.add(tube, crownG);
  const ridges = quality >= 1 ? 36 : 24;
  for (let i = 0; i < ridges; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.24), mats.brushed);
    const a = (i / ridges) * Math.PI * 2;
    r.position.set(K.outerR + 1.8, Math.cos(a) * 2.2, K.stemZ + Math.sin(a) * 2.2);
    r.rotation.x = a;
    along.add(r);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.05, 0.3, 48), mats.brushed);
  cap.rotation.z = -Math.PI / 2; cap.position.set(K.outerR + 3.1, 0, K.stemZ);
  along.add(cap);
  caseGroup.add(along);

  // Caseback: a shallow brushed dome closing the underside.
  const backProf = [[0, K.backZ - 0.5], [K.outerR - 3, K.backZ - 0.35], [K.outerR - 0.5, K.backZ + 0.6]].map(([r, z]) => new THREE.Vector2(r, z));
  const backGeo = new THREE.LatheGeometry(backProf, seg); backGeo.rotateX(Math.PI / 2);
  const caseback = new THREE.Group();
  caseback.add(new THREE.Mesh(backGeo, mats.brushed));

  // Dial with the small seconds over the fourth wheel arbor.
  // t27 review: a dial wider than the bezel opening grew visibly the moment it lifted clear, so it now
  // fits inside the opening and the bezel flange below it closes the gap to the case wall.
  const dialR = K.bezelR - 0.15;
  const subR = 2.9;
  const rot = (twelveDeg - 90) * D2R; // dial-local (12 up) to movement frame
  const toLocal = (p) => ({ x: p.x * Math.cos(-rot) - p.y * Math.sin(-rot), y: p.x * Math.sin(-rot) + p.y * Math.cos(-rot) });
  const subLocal = toLocal(PLAN.fourth);
  const dial = new THREE.Group();
  const dialTex = dialTexture(dialR, subLocal, subR);
  const face = new THREE.Mesh(new THREE.CircleGeometry(dialR, seg), new THREE.MeshPhysicalMaterial({ map: dialTex, emissive: 0xffffff, emissiveMap: dialTex, emissiveIntensity: 0.16, roughness: 0.55, metalness: 0, sheen: 0.3, sheenColor: 0xffffff, envMapIntensity: 0.6 }));
  face.position.z = K.dialZ;
  face.rotation.z = rot;
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(dialR, dialR, 0.2, seg, 1, true), new THREE.MeshStandardMaterial({ color: 0xd9ceb2, roughness: 0.6 }));
  edge.rotation.x = Math.PI / 2; edge.position.z = K.dialZ - 0.1;
  // The front opens like a hunter-case lid, so it needs a real back and real thickness. probe25 showed a
  // paper-thin disc with a flat brown back. The back is now brushed steel and a polished steel rim, hidden
  // under the bezel while closed, gives the swinging lid an edge.
  const back = new THREE.Mesh(new THREE.CircleGeometry(dialR, seg), mats.brushed);
  back.rotation.x = Math.PI; back.position.z = K.dialZ - 1.0;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(dialR, dialR, 0.8, seg, 1, true), mats.steel);
  rim.material = mats.steel; rim.rotation.x = Math.PI / 2; rim.position.z = K.dialZ - 0.6;
  dial.add(face, edge, back, rim);

  // Applied baton markers at each hour except where numerals stand (polished steel).
  // Kept small so the serif numerals remain the main reading.

  // Hands. Each group pivots at its arbor; local +y is the hand's pointing direction.
  const hands = new THREE.Group();
  const hourG = new THREE.Group(), minG = new THREE.Group(), secG = new THREE.Group();
  const hourHand = handMesh(9.6, 0.9, 1.25, 1.6, mats.hand); hourHand.position.z = K.dialZ + 0.35;
  const minHand = handMesh(14.0, 0.55, 0.95, 2.2, mats.hand); minHand.position.z = K.dialZ + 0.6;
  // Soft contact shadows: dark translucent copies just above the dial, offset away from the key light.
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x3a2a14, transparent: true, opacity: 0.18, depthWrite: false });
  shadowMat.userData.handShadow = true;
  const shade = (mesh, lift) => { const m = new THREE.Mesh(mesh.geometry, shadowMat); m.scale.z = 0.01; m.position.set(0.25 * lift, -0.3 * lift, K.dialZ + 0.02); return m; };
  hourG.add(hourHand, shade(hourHand, 1)); minG.add(minHand, shade(minHand, 1.6));
  const centreHub = hub(0.75, 0.55, mats.hand); centreHub.position.z = K.dialZ + 0.55;
  const centreCap = hub(0.45, 0.15, mats.steel); centreCap.position.z = K.dialZ + 0.82;
  const secHand = handMesh(subR * 0.95, 0.12, 0.32, 0.9, mats.secHand, 0.06); secHand.position.z = K.dialZ + 0.25;
  const secHub = hub(0.32, 0.3, mats.secHand); secHub.position.z = K.dialZ + 0.3;
  secG.add(secHand, secHub);
  secG.position.set(PLAN.fourth.x, PLAN.fourth.y, 0);
  hands.add(hourG, minG, secG, centreHub, centreCap);

  // Domed crystal: a shallow spherical cap, almost invisible except for its highlights.
  const capH = 1.1, capR = K.bezelR - 0.05;
  const sphR = (capR * capR + capH * capH) / (2 * capH);
  const crystalGeo = new THREE.SphereGeometry(sphR, seg, 16, 0, Math.PI * 2, 0, Math.asin(capR / sphR));
  crystalGeo.rotateX(Math.PI / 2);
  const crystal = new THREE.Mesh(crystalGeo, mats.crystal);
  crystal.position.z = K.topZ - 0.25 + capH - sphR;
  crystal.renderOrder = 10;

  // Groups the opening animation moves independently.
  const lid = new THREE.Group(); // crystal and bezel ride together
  lid.add(crystal, bezel);
  const front = new THREE.Group(); // dial and hands
  front.add(dial, hands);
  root.add(caseGroup, caseback, front, lid);

  function setHands(deg) {
    // deg are clockwise-from-12 angles; rotation.z is counter-clockwise from +y after `rot`.
    hourG.rotation.z = rot - deg.hour * D2R;
    minG.rotation.z = rot - deg.minute * D2R;
    secG.rotation.z = rot - deg.second * D2R;
  }
  setHands({ hour: 0, minute: 0, second: 0 });
  return { root, caseGroup, caseback, front, lid, dial, hands, crystal, bezel, mats, setHands, groups: { hourG, minG, secG, centreHub, centreCap }, twelveDeg, crownDeg };
}
