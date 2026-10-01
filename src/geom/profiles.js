// 2D tooth profiles for watch gears, as arrays of [x, y] points (mm).
// Watch trains use cycloidal-style teeth: straight flanks below the pitch
// circle and a rounded (ogival) addendum above it. Wheels get a taller
// addendum than pinions, as in horological practice. Dedendum flanks are
// radial on both, as the cycloidal system requires, and pinion leaves are
// about a third of the pitch thick so wheel tips clear them.

// Returns a closed outline for a gear with `teeth` teeth of module `m`.
// opts.addendum, opts.dedendum in modules; opts.toothFrac = tooth width as a
// fraction of the circular pitch, measured at the pitch circle.
export function gearOutline(teeth, m, opts = {}) {
  const pinion = teeth < 20;
  const add = (opts.addendum ?? (pinion ? 0.72 : 1.3)) * m;
  const ded = (opts.dedendum ?? 1.55) * m;
  const frac = opts.toothFrac ?? (pinion ? 0.4 : 0.5);
  const tipSegs = opts.segs ?? 8;
  const rootSegs = opts.rootSegs ?? 6;
  const rp = (teeth * m) / 2;
  const ra = rp + add;
  const rr = Math.max(rp - ded, rp * 0.4);
  const pitch = (Math.PI * 2) / teeth;
  const halfW = (frac * pitch) / 2;           // half tooth angle at pitch circle
  const hw = rp * Math.sin(halfW);             // half tooth width (linear) at pitch circle
  const pts = [];
  // Point in the tooth's local frame (x along the tooth's centreline, y across).
  const L = (c, x, y) => pts.push([x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)]);
  // Half-width of the flank at radius-ish x: radial for wheels, parallel for pinions.
  const flankY = (x) => hw * (x / (rp * Math.cos(halfW)));
  const xp = rp * Math.cos(halfW);
  const xr = Math.sqrt(Math.max(rr * rr - flankY(rr) ** 2, 0));
  for (let i = 0; i < teeth; i++) {
    const c = i * pitch;
    // Root arc across the gap before this tooth, from the previous tooth's
    // trailing flank to this tooth's leading flank root.
    const aPrev = c - pitch + Math.atan2(flankY(rr), xr);
    const aThis = c - Math.atan2(flankY(rr), xr);
    for (let k = 1; k < rootSegs; k++) {
      const a = aPrev + ((aThis - aPrev) * k) / rootSegs;
      // Slightly rounded root: dip a touch deeper in the middle of the gap.
      const r = rr - 0.12 * m * Math.sin((Math.PI * k) / rootSegs);
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    // Flank from the root up to the pitch circle.
    L(c, xr, -flankY(rr));
    L(c, (xr + xp) / 2, -flankY((xr + xp) / 2));
    L(c, xp, -flankY(xp));
    // Ogival addendum: a semi-ellipse on the pitch-circle chord.
    for (let k = 1; k < tipSegs; k++) {
      const ph = Math.PI * (k / tipSegs);
      const y = -hw * Math.cos(ph);
      const x = xp + add * (1 - Math.pow(Math.abs(Math.cos(ph)), 1.7));
      L(c, x, y);
    }
    L(c, xp, flankY(xp));
    L(c, (xr + xp) / 2, flankY((xr + xp) / 2));
    L(c, xr, flankY(rr));
  }
  return { pts, rp, ra, rr };
}

// Swiss lever escape wheel with club teeth. The wheel turns counter-clockwise
// (increasing angle). Each tooth has a locking face leaning forward of radial,
// a short inclined impulse face (the club) behind the locking corner, and a
// concave back running down to the rim.
export function escapeOutline(teeth = 15, rOuter = 2.5, opts = {}) {
  const R = rOuter;
  const rRoot = R * (opts.root ?? 0.74);
  const lean = ((opts.leanDeg ?? 24) * Math.PI) / 180;
  const pitch = (Math.PI * 2) / teeth;
  const clubAng = opts.clubAng ?? 0.15;       // radians of impulse face behind the corner
  const heelR = R * 0.925;
  const backAng = opts.backAng ?? 0.36;       // radians behind the corner where the back meets the rim
  // Locking face root: walk inward from the corner along the leaning face.
  const dir = [-Math.cos(lean), -Math.sin(lean)];
  // Solve |(R,0) + s*dir| = rRoot for s > 0.
  const b = 2 * R * dir[0];
  const cc = R * R - rRoot * rRoot;
  const s = (-b - Math.sqrt(b * b - 4 * cc)) / 2;
  const lockRoot = [R + s * dir[0], s * dir[1]];
  const lockRootAng = Math.atan2(lockRoot[1], lockRoot[0]);
  const pts = [];
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  const rotp = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  for (let i = 0; i < teeth; i++) {
    const c = i * pitch;
    const P = (p) => pts.push(rotp(p, c));
    // Rim arc from the previous tooth's locking root back to this tooth's back.
    const a0 = lockRootAng - pitch, a1 = -backAng;
    for (let k = 1; k < 5; k++) P(polar(rRoot, a0 + ((a1 - a0) * k) / 5));
    // Concave back: quadratic Bezier from the rim up to the heel of the club.
    const B = polar(rRoot, -backAng), H = polar(heelR, -clubAng), C = polar(R * 0.86, -0.27);
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      P([(1 - u) ** 2 * B[0] + 2 * (1 - u) * u * C[0] + u * u * H[0], (1 - u) ** 2 * B[1] + 2 * (1 - u) * u * C[1] + u * u * H[1]]);
    }
    // Impulse face, slightly convex, up to the locking corner.
    P(polar(R * 0.968, -clubAng * 0.5));
    P(polar(R, 0));
    // Locking face down to the rim.
    P([R + 0.5 * s * dir[0], 0.5 * s * dir[1]]);
    P(lockRoot);
  }
  return { pts, ra: R, rr: rRoot };
}

// Windows between the spokes ("crossings") of a wheel, as closed outlines to
// cut out of the blank. rIn = inner edge of the rim, rHub = outer edge of the
// hub, n spokes of linear width w.
export function crossingHoles(rIn, rHub, n = 4, w = 0.3, phase = 0) {
  const holes = [];
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const c = phase + i * step + step / 2;
    const pts = [];
    const aIn = (step / 2) - Math.asin(Math.min(0.99, w / 2 / rIn));
    const aHub = (step / 2) - Math.asin(Math.min(0.99, w / 2 / rHub));
    const seg = 14;
    for (let k = 0; k <= seg; k++) { const a = c - aIn + (2 * aIn * k) / seg; pts.push([rIn * Math.cos(a), rIn * Math.sin(a)]); }
    for (let k = 0; k <= seg; k++) { const a = c + aHub - (2 * aHub * k) / seg; pts.push([rHub * Math.cos(a), rHub * Math.sin(a)]); }
    holes.push(pts);
  }
  return holes;
}
