// Movement parameters. Every number here is used by the simulation and the essay.
export const BALANCE_HZ = 3;                 // full oscillations per second
export const BEATS_PER_SECOND = 2 * BALANCE_HZ; // 6
export const VPH = BEATS_PER_SECOND * 3600;  // 21,600 vibrations per hour
export const ESCAPE_TEETH = 15;
export const ESCAPE_STEP_DEG = 360 / ESCAPE_TEETH / 2; // 12 degrees per beat

// Going train: [driver wheel teeth, driven pinion leaves, module mm]
export const TRAIN = [
  { name: 'barrel', wheel: 96, pinion: null, module: 0.12 },
  { name: 'centre', wheel: 80, pinion: 12, module: 0.10 },
  { name: 'third', wheel: 75, pinion: 10, module: 0.09 },
  { name: 'fourth', wheel: 84, pinion: 10, module: 0.075 },
  { name: 'escape', wheel: ESCAPE_TEETH, pinion: 7, module: null },
];

// Ratio of the stage that drives TRAIN[i] (driver wheel / this pinion).
export function stageRatio(i) {
  return TRAIN[i - 1].wheel / TRAIN[i].pinion;
}

// Turns of TRAIN[i] per turn of the escape wheel (always <= 1).
export function turnsPerEscapeTurn(i) {
  let r = 1;
  for (let j = TRAIN.length - 1; j > i; j--) r /= stageRatio(j);
  return r;
}

// Motion works
export const CANNON_PINION = 12;
export const MINUTE_WHEEL = 36;
export const MINUTE_PINION = 10;
export const HOUR_WHEEL = 40;
export const MOTION_RATIO = (MINUTE_WHEEL / CANNON_PINION) * (HOUR_WHEEL / MINUTE_PINION); // 12

// Lever escapement geometry (degrees)
export const LIFT_ANGLE = 52;        // balance angle over which the roller jewel is in the fork
export const LEVER_TOTAL = 10.5;     // fork swing between banking pins
export const LEVER_LOCK = 2;         // part of the swing spent unlocking
export const DROP_DEG = 1.5;         // escape wheel free rotation after impulse
export const RECOIL_DEG = 0.6;       // escape wheel draw/recoil during unlocking
export const DROP_TIME = 0.004;      // seconds of simulated time for the drop

export const AMPLITUDE_FULL = 270;   // degrees, fully wound
export const AMPLITUDE_LOW = 180;    // degrees, near let-down
export const BALANCE_TAU = 25;       // free decay time constant, seconds

export const BARREL_TURNS = 5.5;     // usable mainspring turns
export const POWER_RESERVE_H = BARREL_TURNS * (TRAIN[0].wheel / TRAIN[1].pinion); // 44 h
