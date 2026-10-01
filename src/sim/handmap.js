// Dial hand angles in degrees clockwise from 12, as seen from the dial.
// The simulation's hands start at zero, so the watch is set to 10:09 to frame the dial.
// Pure math shared by the node tests and the 3D case.
export const SET_TIME = { hours: 10, minutes: 9 };
export const HOUR_OFFSET = SET_TIME.hours * 30 + SET_TIME.minutes * 0.5; // 304.5
export const MINUTE_OFFSET = SET_TIME.minutes * 6; // 54

const wrap = (d) => ((d % 360) + 360) % 360;

// Unwrapped angles (useful for ratios) and the wrapped angles drawn on the dial.
export function handAngles(h) {
  return { hour: h.hours + HOUR_OFFSET, minute: h.minutes + MINUTE_OFFSET, second: h.seconds };
}
export function dialAngles(h) {
  const a = handAngles(h);
  return { hour: wrap(a.hour), minute: wrap(a.minute), second: wrap(a.second) };
}

// Direction of the winding stem in the movement plane (degrees, counter-clockwise from +x).
// The crown wheel sits 5.3 mm from the barrel arbor at 232 degrees (movement.js).
export function crownDegFor(plan) {
  const a = 232 * Math.PI / 180;
  const x = plan.barrel.x + 5.3 * Math.cos(a), y = plan.barrel.y + 5.3 * Math.sin(a);
  return Math.atan2(y, x) * 180 / Math.PI;
}

// The dial is read from the same side as the train in this model, so 3 o'clock points
// along the stem and 12 o'clock is a quarter turn counter-clockwise from it.
export function twelveDegFor(plan) { return crownDegFor(plan) + 90; }
