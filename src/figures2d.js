// Small 2D canvas figures for the essay. Each one teaches one idea and reuses the
// same parameters and kinematics as the 3D movement, so numbers always agree.
import * as P from './sim/params.js';
import { escapement, meshAngle, runawayEscape, runawaySpeed, hands } from './sim/kinematics.js';
import { PLAN, trainPhases } from './sim/train.js';
import { gearOutline, escapeOutline } from './geom/profiles.js';

const D2R = Math.PI / 180;
const INK = '#2a2520', MUTED = '#6d6256', BRASS = '#d4ad5a', BRASS_D = '#8a6424', STEEL = '#9aa1aa', STEEL_D = '#4d535b', RUBY = '#b01c34', AMBER = '#e39a2d';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Canvas with device-pixel sizing, a draw callback and visibility-gated animation.
function figure(fig, draw, { animate = true } = {}) {
  const c = fig.querySelector('canvas');
  const g = c.getContext('2d');
  const st = { visible: false, last: performance.now(), t: 0, playing: animate && !reduced, dirty: true };
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); st.dirty = true; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  };
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - st.last) / 1000));
    st.last = now;
    if (st.playing) { st.t += dt; st.dirty = true; }
    const [w, h] = size();
    if (st.dirty) { g.clearRect(0, 0, w, h); draw(g, w, h, st, dt); st.dirty = false; }
    if (st.visible) requestAnimationFrame(frame);
  };
  new IntersectionObserver((es) => {
    const v = es[0].isIntersecting;
    if (v && !st.visible) { st.visible = true; st.last = performance.now(); requestAnimationFrame(frame); }
    st.visible = v;
  }).observe(c);
  st.redraw = () => { st.dirty = true; if (!st.visible) { const [w, h] = size(); g.clearRect(0, 0, w, h); draw(g, w, h, st, 0); st.dirty = false; } };
  return st;
}

function path(g, pts, close = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
}

// Draw a gear outline centred at (x, y) in mm-space already scaled by the caller.
function gear(g, outline, x, y, deg, fill = BRASS, stroke = BRASS_D, mark = true) {
  g.save(); g.translate(x, y); g.rotate(-deg * D2R); // canvas y is down, so negate for CCW-positive
  g.scale(1, -1);
  path(g, outline.pts); g.fillStyle = fill; g.fill();
  const m = g.getTransform(); g.lineWidth = 1.2 / Math.hypot(m.a, m.b); g.strokeStyle = stroke; g.stroke();
  g.beginPath(); g.arc(0, 0, outline.rp ? outline.rp * 0.12 + 0.05 : 0.25, 0, Math.PI * 2); g.fillStyle = STEEL_D; g.fill();
  if (mark) { g.beginPath(); g.arc((outline.rp || outline.ra) * 0.78, 0, (outline.rp || outline.ra) * 0.07 + 0.03, 0, Math.PI * 2); g.fillStyle = RUBY; g.fill(); }
  g.restore();
}

function label(g, text, x, y, { size = 15, color = MUTED, align = 'left', weight = '' } = {}) {
  g.font = `${weight} ${size}px 'EB Garamond', Garamond, serif`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

// --- 1. Mainspring and barrel ---
function torqueAt(w) { // normalised torque against state of wind 0..1, steep at both ends
  return 0.42 + 0.16 * w + 0.4 * Math.pow(w, 10) - 0.35 * Math.pow(1 - w, 8);
}
function initSpring(fig) {
  const wind = fig.querySelector('[data-wind]'), out = fig.querySelector('[data-wind-out]');
  const st = figure(fig, (g, w, h) => {
    const wv = +wind.value;
    const narrow = w < 520;
    const R = Math.min(narrow ? w * 0.34 : w * 0.22, h * 0.4);
    const cx = narrow ? w / 2 : w * 0.27, cy = narrow ? h * 0.32 : h / 2;
    // Barrel drum with teeth.
    const bo = gearOutline(96, 1, { segs: 3, rootSegs: 2 });
    g.save(); g.translate(cx, cy); const s = R / bo.ra; g.scale(s, s);
    gear(g, bo, 0, 0, wv * 40, BRASS, BRASS_D, false);
    g.beginPath(); g.arc(0, 0, bo.rr * 0.93, 0, Math.PI * 2); g.fillStyle = '#efe4cc'; g.fill();
    // Spiral: wound spring packs toward the arbor, let-down spring lies against the wall.
    const turns = 12, rA = bo.rr * 0.18, rW = bo.rr * 0.9;
    const inner = rA * 1.05 + (rW * 0.58 - rA * 1.05) * Math.pow(1 - wv, 1.5);
    const pack = rW * 0.5 + rW * 0.47 * Math.pow(1 - wv, 1.5);
    g.beginPath();
    for (let k = 0; k <= turns * 90; k++) {
      const u = k / (turns * 90);
      const r = inner + (pack - inner) * u;
      const a = u * turns * Math.PI * 2 + wv * 9;
      k ? g.lineTo(r * Math.cos(a), r * Math.sin(a)) : g.moveTo(r * Math.cos(a), r * Math.sin(a));
    }
    if (rW - pack > rW * 0.05) { // outer end runs out to its hook on the barrel wall
      const a0 = turns * Math.PI * 2 + wv * 9;
      for (let q = 1; q <= 20; q++) { const r = pack + (rW - pack) * q / 20, a = a0 + q * 0.03; g.lineTo(r * Math.cos(a), r * Math.sin(a)); }
    }
    g.strokeStyle = STEEL_D; g.lineWidth = 0.9 / s * 1.4; g.stroke();
    g.beginPath(); g.arc(0, 0, rA, 0, Math.PI * 2); g.fillStyle = STEEL; g.fill();
    g.restore();
    label(g, 'Barrel and mainspring', cx, cy + R + 18, { align: 'center' });
    // Torque graph.
    const gx = narrow ? w * 0.12 : w * 0.55, gw = narrow ? w * 0.8 : w * 0.38;
    const gy = narrow ? h * 0.93 : h * 0.78, gh = narrow ? h * 0.18 : h * 0.55;
    g.fillStyle = 'rgba(227,154,45,0.16)'; g.fillRect(gx + gw * 0.15, gy - gh, gw * 0.7, gh);
    g.strokeStyle = MUTED; g.lineWidth = 1;
    g.beginPath(); g.moveTo(gx, gy - gh); g.lineTo(gx, gy); g.lineTo(gx + gw, gy); g.stroke();
    g.beginPath();
    for (let k = 0; k <= 100; k++) { const u = k / 100; const y = gy - gh * torqueAt(u) / 1.15; k ? g.lineTo(gx + gw * u, y) : g.moveTo(gx + gw * u, y); }
    g.strokeStyle = BRASS_D; g.lineWidth = 2; g.stroke();
    const my = gy - gh * torqueAt(wv) / 1.15;
    g.beginPath(); g.arc(gx + gw * wv, my, 5, 0, Math.PI * 2); g.fillStyle = RUBY; g.fill();
    label(g, 'let down', gx, gy + 16, { size: 15 });
    label(g, 'fully wound', gx + gw, gy + 16, { size: 15, align: 'right' });
    label(g, 'turning force on the train', gx + 6, gy - gh - 12, { size: 15 });
    label(g, 'most even push', gx + gw * 0.5, gy - gh + 14, { size: 15, align: 'center', color: BRASS_D });
  }, { animate: false });
  const sync = () => {
    const used = Math.max(0, Math.min(1, (+wind.value - 0.15) / 0.7));
    out.textContent = `${(used * P.POWER_RESERVE_H).toFixed(0)} h left`;
    st.redraw();
  };
  wind.addEventListener('input', sync); sync();
  return st;
}

// --- 2. Two meshing gears ---
function initGears(fig) {
  const wIn = fig.querySelector('[data-wheel]'), pIn = fig.querySelector('[data-pinion]');
  const wOut = fig.querySelector('[data-wheel-out]'), pOut = fig.querySelector('[data-pinion-out]');
  let wo, po;
  const rebuild = () => { wo = gearOutline(+wIn.value, 1); po = gearOutline(+pIn.value, 1); wOut.textContent = wIn.value; pOut.textContent = pIn.value; st.redraw(); };
  const st = figure(fig, (g, w, h, s) => {
    const N = +wIn.value, n = +pIn.value, ratio = N / n;
    const cd = (N + n) / 2;
    const span = wo.ra * 2 + po.ra + cd - wo.ra + po.ra;
    const k = Math.min((w * 0.62) / span, (h * 0.78) / (wo.ra * 2));
    const cx = w * 0.36 - (span / 2 - wo.ra) * k, cy = h * 0.46;
    const a = s.t * 360 / 20; // wheel: one turn per 20 s
    g.save(); g.translate(cx, cy); g.scale(k, k);
    gear(g, wo, 0, 0, a);
    gear(g, po, cd, 0, meshAngle(a, N, n, 0), '#e2c071');
    g.restore();
    // Magnifier on the mesh point, so small pinions can still be read.
    const ir = Math.min(h * 0.26, w * 0.16), ix = w - ir - 14, iy = ir + 14, z = Math.max(4, ir / (k * 5));
    g.save(); g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.fillStyle = '#fbf7ef'; g.fill(); g.clip();
    g.translate(ix, iy); g.scale(k * z, k * z); g.translate(-N / 2, 0);
    gear(g, wo, 0, 0, a); gear(g, po, cd, 0, meshAngle(a, N, n, 0), '#e2c071');
    g.restore();
    g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.strokeStyle = MUTED; g.lineWidth = 1.5; g.stroke();
    label(g, `where they mesh, ×${Math.round(z)}`, ix, iy + ir + 12, { size: 13, align: 'center' });
    label(g, `${N} ÷ ${n} = ${+ratio.toFixed(2)}`, 16, 20, { size: 18, color: INK });
    label(g, `The pinion turns ${+ratio.toFixed(2)} times for each turn of the wheel.`, 16, h - 18, { size: w < 520 ? 13 : 15, color: INK });
  });
  wIn.addEventListener('input', rebuild); pIn.addEventListener('input', rebuild);
  rebuild();
  return st;
}

// The real going train in plan, positioned from PLAN and phased by trainPhases.
const TRAIN_DRAW = [
  ['barrel', 96, 0.12], ['centre', 80, 0.10], ['third', 75, 0.09], ['fourth', 84, 0.075],
];
const PINIONS = [['centre', 12, 0.12], ['third', 10, 0.10], ['fourth', 10, 0.09], ['escape', 7, 0.075]];
let trainOutlines;
function drawTrain(g, cx, cy, k, escDeg) {
  trainOutlines ||= {
    wheels: TRAIN_DRAW.map(([n, t, m]) => [n, gearOutline(t, m, { segs: 3, rootSegs: 2 })]),
    pinions: PINIONS.map(([n, t, m]) => [n, gearOutline(t, m)]),
    escape: escapeOutline(15, 2.5),
  };
  const ph = trainPhases(escDeg);
  g.save(); g.translate(cx, cy); g.scale(k, -k); g.rotate(0);
  // Canvas y is flipped here, so angles are CCW-positive as in the model.
  const put = (o, name, deg, fill, stroke, mark) => {
    g.save(); g.translate(PLAN[name].x, PLAN[name].y); g.rotate(deg * D2R);
    path(g, o.pts); g.fillStyle = fill; g.fill(); g.lineWidth = 1.2 / k; g.strokeStyle = stroke; g.stroke();
    if (mark) { g.beginPath(); g.arc((o.rp || o.ra) * 0.8, 0, 0.18, 0, Math.PI * 2); g.fillStyle = RUBY; g.fill(); }
    g.restore();
  };
  // Wheels sit at different heights, so in plan they overlap. Draw them translucent to show the layers.
  // Each wheel casts a soft shadow onto the ones below it, so the stacking order reads at a glance.
  g.globalAlpha = 0.78;
  g.shadowColor = 'rgba(70,45,10,0.35)'; g.shadowBlur = 7; g.shadowOffsetX = 2; g.shadowOffsetY = 3;
  for (const [n, o] of trainOutlines.wheels) put(o, n, ph[n], BRASS, BRASS_D, true);
  g.globalAlpha = 1;
  g.shadowColor = 'rgba(0,0,0,0)';
  for (const [n, o] of trainOutlines.pinions) put(o, n, ph[n], STEEL, STEEL_D, false);
  put(trainOutlines.escape, 'escape', ph.escape, '#c8ccd2', STEEL_D, true);
  g.restore();
}

// --- 3. Runaway train ---
function initRunaway(fig) {
  let t0 = null;
  const st = figure(fig, (g, w, h, s) => {
    const esc = t0 === null ? 0 : runawayEscape(s.t, t0, 0);
    const k = Math.min(w / 24, (h - 60) / 21);
    drawTrain(g, w * 0.5 + 0.25 * k, 28 + h / 2 + 0.85 * k, k, esc);
    const spd = t0 === null ? 0 : runawaySpeed(s.t, t0);
    const barrelTurns = esc / 360 / 5760;
    const left = Math.max(0, 1 - barrelTurns / P.BARREL_TURNS);
    g.fillStyle = 'rgba(251,247,239,0.92)'; g.fillRect(0, 0, w, 50);
    const hh = hands(esc);
    const empty = spd > 0 ? (left * P.BARREL_TURNS * 5760) / spd : Infinity; // seconds until let down
    const nw = w < 520, emptyTxt = empty < 120 ? empty.toFixed(0) + ' s' : (empty / 60).toFixed(0) + ' min';
    label(g, t0 === null ? (nw ? 'Pallet fork removed. Press Release.' : 'Pallet fork removed. Press Release to let the train go.') : (nw ? `Escape wheel ${spd.toFixed(0)} turns/s` : `Escape wheel ${spd.toFixed(0)} turns a second. Seconds hand has gone round ${(hh.seconds / 360).toFixed(0)} times.`), 12, 16, { size: nw ? 14 : 15, color: INK });
    label(g, t0 === null ? 'Normally this spring lasts 44 hours.' : (nw ? `Spring empty in ${emptyTxt}, not 44 h` : `At this rate the spring is empty in ${empty < 120 ? empty.toFixed(0) + ' seconds' : (empty / 60).toFixed(0) + ' minutes'}, not 44 hours.`), 12, 36, { size: nw ? 14 : 15, color: t0 === null ? MUTED : RUBY });
  });
  st.playing = true;
  fig.querySelector('[data-release]').addEventListener('click', () => { t0 = st.t; st.redraw(); });
  fig.querySelector('[data-reset]').addEventListener('click', () => { t0 = null; st.t = 0; st.redraw(); });
  return st;
}

// --- 4. Escapement close-up through one beat ---
// Pallet stone placement found by tools/pallet_fit.mjs: no penetration into the escape wheel
// over a full balance period, and the stone rests on the tooth (gap under 0.01 mm) while locked.
const ST = { r: 1.4, off: 66, tilt: -7.5 };
// Shortest distance from (x, y) to a closed polygon's edges.
function segDist(poly, x, y) {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    m = Math.min(m, Math.hypot(x - ax - u * dx, y - ay - u * dy));
  }
  return m;
}
function insidePoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function initEscapement(fig) {
  const scrub = fig.querySelector('[data-scrub]'), out = fig.querySelector('[data-phase-out]'), play = fig.querySelector('[data-play]');
  const eo = escapeOutline(15, 2.5);
  const T = 1 / (2 * P.BEATS_PER_SECOND) * 2; // one beat window (1/6 s)
  const NAMES = { lock: 'locked', unlock: 'unlocking', impulse: 'impulse', drop: 'drop' };
  const st = figure(fig, (g, w, h, s) => {
    if (s.playing) scrub.value = ((s.t * 0.05) / T) % 1;
    const t = +scrub.value * T;
    const e = escapement(t);
    out.textContent = NAMES[e.phase];
    const E = PLAN.escape, Pp = PLAN.pallet, B = PLAN.balance;
    const toE = Math.atan2(E.y - Pp.y, E.x - Pp.x) / D2R, toB = Math.atan2(B.y - Pp.y, B.x - Pp.x) / D2R;
    const pol = (d, a) => [d * Math.cos(a * D2R), d * Math.sin(a * D2R)];
    const ph = trainPhases(e.escape);
    // While locked or giving impulse, the mainspring presses the wheel against a stone, so the
    // wheel sits exactly where its tooth touches the stone. Solve that small correction here
    // because the 2D stone outline is simpler than the 3D one the train model was fitted to.
    const stonePts = (fa) => {
      const out = [];
      for (const sg of [1, -1]) {
        const c = pol(ST.r, toE + ST.off * sg), b = (toE + (ST.off + ST.tilt) * sg) * D2R;
        for (const [l, wd] of [[-0.35, -0.1], [0.35, -0.1], [0.24, 0.1], [-0.35, 0.1]].flatMap(([l, v], i, a) => { const [l2, v2] = a[(i + 1) % 4]; return [0, 0.25, 0.5, 0.75].map((u) => [l + (l2 - l) * u, (v + (v2 - v) * u) * sg]); })) {
          const px = c[0] + l * Math.cos(b) - wd * Math.sin(b), py = c[1] + l * Math.sin(b) + wd * Math.cos(b);
          out.push([Pp.x + px * Math.cos(fa) - py * Math.sin(fa), Pp.y + px * Math.sin(fa) + py * Math.cos(fa)]);
        }
      }
      return out;
    };
    const SP = stonePts(e.fork * D2R);
    const clear = (deg) => {
      const a = -deg * D2R; let m = Infinity;
      for (const [wx, wy] of SP) {
        const rx = wx - E.x, ry = wy - E.y, x = rx * Math.cos(a) - ry * Math.sin(a), y = rx * Math.sin(a) + ry * Math.cos(a);
        if (Math.hypot(x, y) > 2.7) continue;
        if (insidePoly(eo.pts, x, y)) return -1;
        m = Math.min(m, segDist(eo.pts, x, y));
      }
      return m;
    };
    if (e.phase === 'lock' || e.phase === 'impulse') {
      let best = 0, bd = Infinity;
      for (let d = -4; d <= 4.0001; d += 0.05) {
        const c = clear(ph.escape + d);
        if (c >= 0 && c < 0.012 && Math.abs(d) < bd) { bd = Math.abs(d); best = d; }
      }
      ph.escape += best; fig.dataset.contactFix = best.toFixed(2);
    }
    // Draw the whole escapement in model millimetres. The caller sets the view transform.
    const mech = (k) => {
      g.save(); g.translate(E.x, E.y); g.rotate(ph.escape * D2R);
      path(g, eo.pts); g.fillStyle = '#c8ccd2'; g.fill(); g.lineWidth = 1.2 / k; g.strokeStyle = STEEL_D; g.stroke();
      g.restore();
      g.save(); g.translate(Pp.x, Pp.y); g.rotate(e.fork * D2R);
      const SC = (sg) => pol(ST.r, toE + ST.off * sg), SX = (sg) => pol(1, toE + (ST.off + ST.tilt) * sg);
      // Arms stop at the inner end of each stone, so the fork never draws over the teeth.
      const A1 = [SC(1)[0] - 0.4 * SX(1)[0], SC(1)[1] - 0.4 * SX(1)[1]], A2 = [SC(-1)[0] - 0.4 * SX(-1)[0], SC(-1)[1] - 0.4 * SX(-1)[1]], L = pol(2.45, toB);
      g.strokeStyle = e.phase === 'impulse' || e.phase === 'unlock' ? AMBER : '#b9bfc7'; g.lineCap = 'round';
      g.lineWidth = 0.26; g.beginPath(); g.moveTo(...A1); g.lineTo(0, 0); g.lineTo(...A2); g.stroke();
      g.lineWidth = 0.3; g.beginPath(); g.moveTo(0, 0); g.lineTo(...L); g.stroke();
      for (const s2 of [-1, 1]) { g.beginPath(); g.moveTo(...L); g.lineTo(L[0] + pol(0.55, toB + 55 * s2)[0], L[1] + pol(0.55, toB + 55 * s2)[1]); g.lineWidth = 0.2; g.stroke(); }
      for (const sg of [1, -1]) {
        const c = SC(sg), a = toE + (ST.off + ST.tilt) * sg;
        g.save(); g.translate(c[0], c[1]); g.rotate(a * D2R);
        // The working end is bevelled: the locking corner stays square and the slope behind it
        // is the impulse face that the tooth slides along.
        path(g, [[-0.35, -0.1 * sg], [0.35, -0.1 * sg], [0.24, 0.1 * sg], [-0.35, 0.1 * sg]]);
        g.fillStyle = RUBY; g.fill(); g.lineWidth = 0.6 / k; g.strokeStyle = '#6e0f1f'; g.stroke(); g.restore();
      }
      g.beginPath(); g.arc(0, 0, 0.15, 0, Math.PI * 2); g.fillStyle = STEEL_D; g.fill();
      g.restore();
      for (const s2 of [-1, 1]) { const [x, y] = pol(1.55, toB + 17 * s2); g.beginPath(); g.arc(Pp.x + x, Pp.y + y, 0.12, 0, Math.PI * 2); g.fillStyle = BRASS_D; g.fill(); }
      g.save(); g.translate(B.x, B.y); g.rotate(e.theta * D2R);
      g.beginPath(); g.arc(0, 0, 0.7, 0, Math.PI * 2); g.fillStyle = STEEL; g.fill();
      const jd = Math.atan2(Pp.y - B.y, Pp.x - B.x);
      g.beginPath(); g.arc(0.6 * Math.cos(jd), 0.6 * Math.sin(jd), 0.12, 0, Math.PI * 2); g.fillStyle = RUBY; g.fill();
      g.restore();
    };
    // The working corner of each pallet stone, in model millimetres. The one nearest the
    // escape wheel's tip circle is where tooth and stone meet, so the magnifier follows it.
    // Follow the contact: sample both stones, find the point closest to the escape wheel's
    // outline (in the wheel's frame), and centre the magnifier there.
    const ea = ph.escape * D2R, fa = e.fork * D2R;
    let C = null, bestD = Infinity;
    for (const sg of [1, -1]) {
      const c = pol(ST.r, toE + ST.off * sg), b = (toE + (ST.off + ST.tilt) * sg) * D2R;
      for (let i = 0; i <= 12; i++) for (const wd of [-0.1, 0.1]) {
        const l = -0.35 + (0.7 * i) / 12;
        const px = c[0] + l * Math.cos(b) - wd * Math.sin(b), py = c[1] + l * Math.sin(b) + wd * Math.cos(b);
        const wx = Pp.x + px * Math.cos(fa) - py * Math.sin(fa), wy = Pp.y + px * Math.sin(fa) + py * Math.cos(fa);
        const rx = wx - E.x, ry = wy - E.y;
        const d = segDist(eo.pts, rx * Math.cos(-ea) - ry * Math.sin(-ea), rx * Math.sin(-ea) + ry * Math.cos(-ea));
        if (d < bestD) { bestD = d; C = [wx, wy]; }
      }
    }
    const narrow = w < 520;
    const midx = 7.9, midy = -4.7; // frames the escape wheel, fork and roller only
    const ow = narrow ? w : w * 0.56;
    const k = Math.min(ow / 9.5, (h - 56) / 9);
    const ox = narrow ? w / 2 : ow / 2 + 8, oy = 40 + (h - 40) / 2;
    g.save(); g.translate(ox, oy); g.scale(k, -k); g.translate(-midx, -midy); mech(k); g.restore();
    // Magnifier on the tooth and pallet contact.
    const zr = narrow ? Math.min(w * 0.2, (h - 40) * 0.3) : Math.min(w * 0.19, (h - 60) * 0.42);
    const zx = narrow ? zr + 12 : w * 0.78, zy = narrow ? 52 + zr : 40 + (h - 40) / 2; // phone: the empty top-left corner
    // 3x rather than 5x. The 2D stone outline is schematic, and at 5x its small mismatch with the
    // tooth during impulse (about 0.1 mm, tools/stone_face_fit.mjs) reads as a visible gap.
    const zk = k * 3;
    const sx = ox + (C[0] - midx) * k, sy = oy - (C[1] - midy) * k;
    g.strokeStyle = 'rgba(138,100,36,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.arc(sx, sy, zr * k / zk, 0, Math.PI * 2); g.stroke();
    const ang = Math.atan2(zy - sy, zx - sx);
    g.beginPath(); g.moveTo(sx + Math.cos(ang) * zr * k / zk, sy + Math.sin(ang) * zr * k / zk); g.lineTo(zx - Math.cos(ang) * zr, zy - Math.sin(ang) * zr); g.stroke();
    g.save(); g.beginPath(); g.arc(zx, zy, zr, 0, Math.PI * 2); g.fillStyle = '#fffcf5'; g.fill(); g.clip();
    g.translate(zx, zy); g.scale(zk, -zk); g.translate(-C[0], -C[1]); mech(zk); g.restore();
    g.beginPath(); g.arc(zx, zy, zr, 0, Math.PI * 2); g.strokeStyle = BRASS_D; g.lineWidth = 2; g.stroke();
    const ZNOTE = { lock: 'tooth resting on the locking face', unlock: 'stone sliding off the tooth', impulse: 'tooth sliding along the impulse face', drop: 'tooth falling free' };
    if (!narrow) { label(g, `${Math.round(zk / k)}× closer`, zx, zy - zr - 14, { size: 14, align: 'center' }); label(g, ZNOTE[e.phase], zx, zy + zr + 16, { size: 14, align: 'center', color: INK }); }
    const midxL = midx, midyL = midy;
    g.fillStyle = 'rgba(251,247,239,0.92)'; g.fillRect(0, 0, w, 40);
    label(g, NAMES[e.phase], 16, 20, { size: 18, color: INK });
    label(g, narrow ? `fork ${e.fork.toFixed(1)}° · wheel ${(e.escape % 360).toFixed(1)}°` : `balance ${e.theta.toFixed(0)}° · fork ${e.fork.toFixed(1)}° · escape wheel ${(e.escape % 360).toFixed(1)}°`, w - 16, 20, { align: 'right', size: narrow ? 13 : 15, color: MUTED });
    const lab = (t, x, y) => label(g, t, ox + (x - midxL) * k, oy - (y - midyL) * k, { size: 14, align: 'center' });
    lab('escape wheel', E.x, E.y - 2.9); lab('pallet fork', Pp.x + 1.9, Pp.y - 0.6); lab('balance roller', B.x - 0.3, B.y + 1.05);
  }, { animate: false });
  scrub.addEventListener('input', () => { st.playing = false; play.textContent = 'Play'; st.redraw(); });
  play.addEventListener('click', () => { st.playing = !st.playing; play.textContent = st.playing ? 'Pause' : 'Play'; st.t = (+scrub.value * T) / 0.05; st.redraw(); });
  return st;
}

// --- 5. Balance and hairspring: period depends on inertia and stiffness, not amplitude ---
function initBalance(fig) {
  const I = fig.querySelector('[data-inertia]'), K = fig.querySelector('[data-stiff]'), A = fig.querySelector('[data-amp]');
  const Io = fig.querySelector('[data-inertia-out]'), Ko = fig.querySelector('[data-stiff-out]'), Ao = fig.querySelector('[data-amp-out]');
  const SLOW = 1 / 12; // show 3 Hz at a readable pace
  const st = figure(fig, (g, w, h, s) => {
    const f = P.BALANCE_HZ * Math.sqrt(+K.value / +I.value);
    const amp = +A.value;
    const th = (t) => amp * Math.cos(2 * Math.PI * f * t);
    const t = s.t * SLOW;
    const narrow = w < 520;
    const R = Math.min(narrow ? w * 0.28 : w * 0.16, h * 0.32);
    const cx = narrow ? w / 2 : w * 0.2, cy = narrow ? h * 0.3 : h * 0.5;
    // Hairspring: spiral whose coils open and close with the angle.
    g.save(); g.translate(cx, cy);
    g.beginPath();
    const turns = 9, r0 = R * 0.12, r1 = R * 0.62, tw = th(t) * D2R;
    for (let k = 0; k <= 400; k++) { const u = k / 400; const r = r0 + (r1 - r0) * u; const a = u * turns * Math.PI * 2 + tw * (1 - u); k ? g.lineTo(r * Math.cos(a), r * Math.sin(a)) : g.moveTo(r * Math.cos(a), r * Math.sin(a)); }
    g.strokeStyle = '#3d5a8a'; g.lineWidth = 1; g.stroke();
    g.rotate(tw);
    const rim = R * (0.85 + 0.12 * (+I.value - 1));
    g.beginPath(); g.arc(0, 0, rim, 0, Math.PI * 2); g.lineWidth = R * 0.1; g.strokeStyle = BRASS; g.stroke();
    g.lineWidth = R * 0.06; g.beginPath(); g.moveTo(-rim, 0); g.lineTo(rim, 0); g.moveTo(0, -rim); g.lineTo(0, rim); g.stroke();
    g.beginPath(); g.arc(rim, 0, R * 0.07, 0, Math.PI * 2); g.fillStyle = RUBY; g.fill();
    g.restore();
    // Trace of angle against time, this balance and the reference.
    const gx = narrow ? w * 0.16 : w * 0.46, gw = narrow ? w * 0.78 : w * 0.49;
    const gy = narrow ? h * 0.78 : h * 0.52, gh = narrow ? h * 0.14 : h * 0.32;
    const span = 1; // seconds of watch time shown
    g.strokeStyle = '#d9cdb8'; g.lineWidth = 1; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + gw, gy); g.stroke();
    for (let q = 0; q <= 6; q++) { const x = gx + gw * q / 6; g.beginPath(); g.moveTo(x, gy - 4); g.lineTo(x, gy + 4); g.stroke(); }
    const trace = (fn, col, lw) => { g.beginPath(); for (let k = 0; k <= 300; k++) { const tt = span * k / 300; const y = gy - gh * fn(tt) / 330; k ? g.lineTo(gx + gw * k / 300, y) : g.moveTo(gx + gw * k / 300, y); } g.strokeStyle = col; g.lineWidth = lw; g.stroke(); };
    trace((tt) => P.AMPLITUDE_FULL * Math.cos(2 * Math.PI * P.BALANCE_HZ * tt), 'rgba(109,98,86,0.35)', 1.2);
    trace(th, BRASS_D, 2);
    const cur = (t % span) / span;
    g.beginPath(); g.arc(gx + gw * cur, gy - gh * th(t % span) / 330, 4, 0, Math.PI * 2); g.fillStyle = RUBY; g.fill();
    for (const v of [-270, 0, 270]) { const y = gy - gh * v / 330; g.strokeStyle = '#e6dac4'; g.beginPath(); g.moveTo(gx, y); g.lineTo(gx + gw, y); g.stroke(); label(g, `${v > 0 ? '+' : ''}${v}°`, gx - 6, y, { size: 13, align: 'right' }); }
    label(g, '0 s', gx, gy + gh + 16, { size: 13, align: 'center' }); label(g, '1 s', gx + gw, gy + gh + 16, { size: 13, align: 'center' });
    label(g, 'faint line: the watch as designed', gx + gw, narrow ? gy - gh - 34 : gy + gh + 34, { size: 13, align: 'right' });
    label(g, `${f.toFixed(2)} swings per second · ${Math.round(f * 2 * 3600).toLocaleString('en-US')} vph`, gx, gy - gh - 14, { size: 15, color: INK });
  });
  const sync = () => { Io.textContent = `×${(+I.value).toFixed(2)}`; Ko.textContent = `×${(+K.value).toFixed(2)}`; Ao.textContent = `${A.value}°`; st.redraw(); };
  for (const el of [I, K, A]) el.addEventListener('input', sync);
  sync();
  return st;
}

// --- 6. Motion works ---
function initMotion(fig) {
  const sp = fig.querySelector('[data-speed]'), so = fig.querySelector('[data-speed-out]');
  // Both stages share one centre distance, so the second stage needs a slightly smaller module:
  // 1 x (12 + 36) / 2 = 24 = 0.96 x (10 + 40) / 2.
  const M2 = (P.CANNON_PINION + P.MINUTE_WHEEL) / (P.MINUTE_PINION + P.HOUR_WHEEL);
  const cp = gearOutline(P.CANNON_PINION, 1), mw = gearOutline(P.MINUTE_WHEEL, 1), mp = gearOutline(P.MINUTE_PINION, M2), hw = gearOutline(P.HOUR_WHEEL, M2);
  let minutes = 0;
  const rate = () => Math.pow(10, 1 + 2 * +sp.value); // minutes of watch time per second
  const st = figure(fig, (g, w, h, s, dt) => {
    minutes += dt * rate();
    const narrow = w < 520;
    const k = Math.min(narrow ? w / 66 : w / 96, narrow ? h / 100 : h / 52);
    const mA = -minutes * 6; // cannon pinion: clockwise, 6 deg per minute
    const c1 = (P.CANNON_PINION + P.MINUTE_WHEEL) / 2;
    const ox = narrow ? w * 0.34 : w * 0.24, oy = narrow ? h * 0.3 : h * 0.47;
    g.save(); g.translate(ox, oy); g.scale(k, k);
    const mwA = meshAngle(mA, P.CANNON_PINION, P.MINUTE_WHEEL, 0);
    gear(g, mw, c1, 0, mwA);
    gear(g, mp, c1, 0, mwA, STEEL, STEEL_D, false);
    // The hour wheel rides on the cannon pinion's tube, one layer up, so in plan view it
    // overlaps the minute wheel without touching it. Draw it as a dashed outline so the
    // layer beneath stays readable, then the cannon pinion crisp on top.
    const hwA = meshAngle(mwA, P.MINUTE_PINION, P.HOUR_WHEEL, 180);
    g.save(); g.rotate(-hwA * D2R); g.scale(1, -1);
    path(g, hw.pts); g.fillStyle = 'rgba(226,192,113,0.16)'; g.fill();
    g.setLineDash([0.9, 0.6]); g.lineWidth = 2 / k; g.strokeStyle = '#7a4f14'; g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(hw.rp * 0.92, 0); g.lineWidth = 1.6 / k; g.stroke();
    g.restore();
    gear(g, cp, 0, 0, mA, STEEL, STEEL_D, true);
    g.restore();
    const L = (t, x, y) => label(g, t, ox + x * k, oy + y * k, { size: 13, align: 'center', color: INK });
    if (narrow) {
      label(g, `cannon pinion ${P.CANNON_PINION} drives minute wheel ${P.MINUTE_WHEEL}`, w / 2, oy + 23 * k, { size: 13, align: 'center', color: INK });
      label(g, `minute pinion ${P.MINUTE_PINION} drives hour wheel ${P.HOUR_WHEEL} (dashed)`, w / 2, oy + 23 * k + 17, { size: 13, align: 'center', color: INK });
    } else {
    L(`steel: cannon pinion ${P.CANNON_PINION}`, -6, 23.2); L(`dashed: hour wheel ${P.HOUR_WHEEL}`, -6, 26.6);
    L(`gold: minute wheel ${P.MINUTE_WHEEL}`, c1 + 6, 23.2); L(`steel: minute pinion ${P.MINUTE_PINION}`, c1 + 6, 26.6);
    }
    // Dial
    const dr = narrow ? w * 0.22 : Math.min(w * 0.13, h * 0.36);
    const dx = narrow ? w * 0.5 : w * 0.84, dy = narrow ? h * 0.76 : h * 0.46;
    g.beginPath(); g.arc(dx, dy, dr, 0, Math.PI * 2); g.fillStyle = '#fbf6ea'; g.fill(); g.strokeStyle = '#b9a88c'; g.lineWidth = 2; g.stroke();
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(dx + Math.cos(a) * dr * 0.84, dy + Math.sin(a) * dr * 0.84); g.lineTo(dx + Math.cos(a) * dr * 0.95, dy + Math.sin(a) * dr * 0.95); g.strokeStyle = MUTED; g.stroke(); }
    const hand = (deg, len, lw) => { const a = (deg - 90) * D2R; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + Math.cos(a) * len, dy + Math.sin(a) * len); g.lineWidth = lw; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke(); };
    const mins = minutes + 10 * 60 + 9;
    hand(mins / 2, dr * 0.5, 4); hand(mins * 6, dr * 0.78, 2.5);
    const hh = Math.floor(mins / 60) % 12 || 12, mm = Math.floor(mins % 60);
    label(g, `${hh}:${String(mm).padStart(2, '0')}`, dx, dy + dr + 18, { align: 'center', size: 16, color: INK });
  });
  const sync = () => { so.textContent = `1 s = ${Math.round(rate())} min`; };
  sp.addEventListener('input', sync); sync();
  return st;
}

export function initFigures() {
  const map = { spring: initSpring, gears: initGears, runaway: initRunaway, escapement: initEscapement, balance: initBalance, motion: initMotion };
  const out = {};
  for (const [k, fn] of Object.entries(map)) {
    const fig = document.querySelector(`[data-figure="${k}"]`);
    if (fig) out[k] = fn(fig);
  }
  window.__figures = out;
  return out;
}
