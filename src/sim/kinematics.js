// Kinematics of the movement as pure functions of simulated time.
// Angles are in degrees unless noted. Positive escape wheel angle = forward.
import * as P from './params.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// Balance angle. t = 0 is at the extreme of a swing, so the first beat
// happens at t = 1/12 s (a quarter period).
export function balanceAngle(t, A = P.AMPLITUDE_FULL) {
  return A * Math.cos(TAU * P.BALANCE_HZ * t);
}

export function balanceVelocity(t, A = P.AMPLITUDE_FULL) {
  return -A * TAU * P.BALANCE_HZ * Math.sin(TAU * P.BALANCE_HZ * t);
}

// Time of the k-th zero crossing (k = 0, 1, 2 ...).
export function beatCentre(k) {
  return (2 * k + 1) / (4 * P.BALANCE_HZ);
}

// Half duration of one pass through the lift zone.
export function liftHalfTime(A = P.AMPLITUDE_FULL) {
  return Math.asin(Math.min(1, (P.LIFT_ANGLE / 2) / A)) / (TAU * P.BALANCE_HZ);
}

// Direction the balance is moving during beat k: -1 for even k, +1 for odd.
export function beatDirection(k) {
  return k % 2 === 0 ? -1 : 1;
}

const S_UNLOCK = P.LEVER_LOCK / P.LEVER_TOTAL;
const IMPULSE_DEG = P.ESCAPE_STEP_DEG - P.DROP_DEG; // 10.5

// Full state of the escapement at time t during normal running.
// Returns { theta, fork, escape, phase, beat, s }.
export function escapement(t, A = P.AMPLITUDE_FULL) {
  const theta = balanceAngle(t, A);
  const h = liftHalfTime(A);
  // Nearest beat centre.
  const kf = t * 2 * P.BALANCE_HZ - 0.5;
  let k = Math.round(kf);
  if (k < 0) k = 0;
  const tc = beatCentre(k);
  const dir = beatDirection(k);
  const start = tc - h;
  const end = tc + h;
  // Beats fully finished (including drop) before this one.
  let done = k;
  let phase, s = 0, escape, fork;
  const halfFork = P.LEVER_TOTAL / 2;
  if (t < start) {
    // Before this beat's lift: locked, fork resting on the previous side.
    phase = 'lock';
    fork = -dir * halfFork;
    escape = done * P.ESCAPE_STEP_DEG;
    if (k === 0) fork = -dir * halfFork;
  } else if (t <= end) {
    // The roller jewel moves the fork in proportion to the balance angle in the lift zone.
    const half = P.LIFT_ANGLE / 2;
    const th = Math.max(-half, Math.min(half, theta));
    s = (1 + dir * th / half) / 2;
    fork = halfFork * th / half;
    if (s < S_UNLOCK) {
      phase = 'unlock';
      escape = done * P.ESCAPE_STEP_DEG - P.RECOIL_DEG * Math.sin(Math.PI * s / S_UNLOCK);
    } else {
      phase = 'impulse';
      escape = done * P.ESCAPE_STEP_DEG + IMPULSE_DEG * (s - S_UNLOCK) / (1 - S_UNLOCK);
    }
  } else if (t <= end + P.DROP_TIME) {
    phase = 'drop';
    fork = dir * halfFork;
    const u = (t - end) / P.DROP_TIME;
    escape = done * P.ESCAPE_STEP_DEG + IMPULSE_DEG + P.DROP_DEG * u * u; // accelerating free fall
  } else {
    phase = 'lock';
    fork = dir * halfFork;
    done = k + 1;
    escape = done * P.ESCAPE_STEP_DEG;
  }
  return { theta, fork, escape, phase, beat: k, s };
}

// Angle of each train member (degrees, all forward-positive) from the escape wheel angle.
export function trainAngles(escapeDeg) {
  const out = {};
  for (let i = 0; i < P.TRAIN.length; i++) out[P.TRAIN[i].name] = escapeDeg * turnsPerEscape(i);
  return out;
}

function turnsPerEscape(i) {
  let r = 1;
  for (let j = P.TRAIN.length - 1; j > i; j--) r /= P.TRAIN[j - 1].wheel / P.TRAIN[j].pinion;
  return r;
}

// Hands in degrees clockwise from 12.
export function hands(escapeDeg, setMinutes = 0) {
  const a = trainAngles(escapeDeg);
  const seconds = a.fourth;
  const minutes = a.centre + setMinutes * 6;
  const hours = minutes / P.MOTION_RATIO;
  return { seconds, minutes, hours };
}

// Angle of a driven gear so that its teeth sit in the driver's gaps.
// driverDeg: driver rotation; beta: direction (deg) from driver centre to driven centre.
// Positive rotation is counter-clockwise for both gears in this function.
export function meshAngle(driverDeg, driverTeeth, drivenTeeth, beta) {
  const ratio = driverTeeth / drivenTeeth;
  return -ratio * (driverDeg - beta) + beta + 180 + 180 / drivenTeeth;
}

// Fraction of a pitch by which a tooth is offset from the line of centres.
export function toothPhase(angleDeg, teeth, lineDeg) {
  const f = ((angleDeg - lineDeg) * teeth / 360) % 1;
  return f < 0 ? f + 1 : f;
}

// --- Failure modes (analytic, still pure in time since the failure) ---

export const RUNAWAY_REV_S = 40;   // free-running escape wheel limit, rev/s
export const RUNAWAY_TAU = 0.35;   // seconds to approach the limit

// Pallet fork removed at t0: escape wheel spins up exponentially toward a limit.
export function runawayEscape(t, t0, startDeg) {
  const dt = Math.max(0, t - t0);
  const w = RUNAWAY_REV_S * 360;
  return startDeg + w * (dt - RUNAWAY_TAU * (1 - Math.exp(-dt / RUNAWAY_TAU)));
}

export function runawaySpeed(t, t0) {
  const dt = Math.max(0, t - t0);
  return RUNAWAY_REV_S * (1 - Math.exp(-dt / RUNAWAY_TAU));
}

// Free decay of the balance after impulses stop at t0.
export function decayingBalance(t, t0, A = P.AMPLITUDE_FULL) {
  const dt = Math.max(0, t - t0);
  return A * Math.exp(-dt / P.BALANCE_TAU) * Math.cos(TAU * P.BALANCE_HZ * t);
}

// Amplitude from state of wind, 0..1.
export function amplitudeForWind(w) {
  if (w <= 0) return 0;
  return P.AMPLITUDE_LOW + (P.AMPLITUDE_FULL - P.AMPLITUDE_LOW) * Math.min(1, w);
}

export { D2R, R2D };
