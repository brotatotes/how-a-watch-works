// Stateful movement: wraps the pure escapement kinematics and adds failure modes
// when parts are removed. Everything downstream (train, hands) is derived from the
// escape wheel angle, so a failure here propagates through the whole watch.
import * as P from './params.js';
import { escapement, runawayEscape, runawaySpeed, decayingBalance, hands } from './kinematics.js';

// Parts whose removal changes behaviour. Cosmetic parts (bridges, screws) do not.
export const ESSENTIAL = ['mainspring', 'pallet', 'balance', 'hairspring'];

export function modeFor(parts) {
  if (!parts.mainspring) return 'unpowered';   // no torque: balance rings down, train stands
  if (!parts.pallet) return 'runaway';         // nothing holds the escape wheel: train spins free
  if (!parts.balance || !parts.hairspring) return 'jammed'; // fork flips to a banking and locks
  return 'running';
}

export class Machine {
  constructor() {
    this.t = 0;
    this.parts = { mainspring: true, pallet: true, balance: true, hairspring: true };
    this.mode = 'running';
    this.t0 = 0;          // time the current failure began
    this.esc0 = 0;        // escape angle when it began
    this.bal0 = 0;        // balance angle when it began
    this.offset = 0;      // escape offset in whole beats, keeps angles continuous across modes
    this.state = this.compute();
  }

  // Remove or restore a part at the current time.
  setPart(name, present) {
    if (!(name in this.parts)) return;
    const before = this.state;
    this.parts[name] = !!present;
    const mode = modeFor(this.parts);
    if (mode === this.mode) return;
    this.mode = mode;
    this.t0 = this.t;
    this.esc0 = before.escape;
    this.bal0 = before.balance;
    if (mode === 'running') {
      // Resume ticking from the next locked tooth so the train never jumps backwards.
      const base = escapement(this.t).escape;
      this.offset = Math.ceil((before.escape - base) / P.ESCAPE_STEP_DEG - 1e-9) * P.ESCAPE_STEP_DEG;
    }
    this.state = this.compute();
  }

  // Advance by dt seconds of watch time (already scaled by the speed control).
  step(dt) { return this.seek(this.t + dt); }

  // Jump to any time. In running mode this is exact in both directions; in a failure mode
  // time cannot go before the failure began.
  seek(t) {
    this.t = this.mode === 'running' ? Math.max(0, t) : Math.max(this.t0, t);
    this.state = this.compute();
    return this.state;
  }

  compute() {
    const t = this.t;
    if (this.mode === 'running') {
      const e = escapement(t);
      const escape = e.escape + this.offset;
      return { mode: 'running', t, escape, fork: e.fork, balance: e.theta, phase: e.phase, beat: e.beat,
        escapeSpeed: null, hands: hands(escape) };
    }
    const dt = t - this.t0;
    const halfFork = P.LEVER_TOTAL / 2;
    if (this.mode === 'runaway') {
      const escape = runawayEscape(t, this.t0, this.esc0);
      // No impulse reaches the balance: it rings down from wherever it was.
      const balance = this.parts.balance ? freeRing(this.bal0, t, this.t0) : 0;
      return { mode: 'runaway', t, escape, fork: 0, balance, phase: 'free', beat: null,
        escapeSpeed: runawaySpeed(t, this.t0), hands: hands(escape) };
    }
    if (this.mode === 'unpowered') {
      // The pallet still locks the wheel. The balance swings on its hairspring and decays.
      const balance = this.parts.balance && this.parts.hairspring ? freeRing(this.bal0, t, this.t0) : 0;
      return { mode: 'unpowered', t, escape: this.esc0, fork: balance >= 0 ? halfFork : -halfFork, balance,
        phase: 'stopped', beat: null, escapeSpeed: 0, hands: hands(this.esc0) };
    }
    // jammed: with no oscillator to carry it back, the fork rests against a banking pin and
    // the next tooth stays locked on the pallet stone.
    void dt;
    return { mode: 'jammed', t, escape: this.esc0, fork: halfFork, balance: this.parts.balance ? this.bal0 : 0,
      phase: 'locked', beat: null, escapeSpeed: 0, hands: hands(this.esc0) };
  }
}

// Free, lightly damped oscillation continuing from angle a0 at t0 (released at rest if needed).
function freeRing(a0, t, t0) {
  const A = Math.max(Math.abs(a0), 60) * Math.sign(a0 || 1);
  return decayingBalance(t - t0, 0, A);
}
