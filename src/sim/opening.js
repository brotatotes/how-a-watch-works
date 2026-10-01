// Opening the watch: pure timing for the front (crystal, dial and hands as one rigid unit).
// p runs from 0 (closed) to 1 (open). Shared by the 3D figure and the node tests.
export const OPEN_SECONDS = 1.4;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const ease = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
// A gentle sine ease for the lift and the camera.
export const soft = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
// t20 review: a pure sine ease left the first and last frames nearly static. Blending in some linear
// motion keeps every frame moving while still starting and settling gently.
export const glide = (x) => 0.4 * clamp01(x) + 0.6 * soft(x);
// The slide starts at once and speeds up as the unit leaves the frame, so no time is spent on a
// front that is already out of sight.
export const slideCurve = (x) => { x = clamp01(x); return 0.45 * x + 0.55 * x * x; };

// t10 to t26 review history: fading or shrinking the dial and hands left ghosts and stubs, and a
// 180 degree hinge needed a frame twice the width of the case, so the lid floated, clipped and
// vanished. Now the front stays fully opaque and full size. It lifts a few millimetres off the case,
// tilts back a little and slides straight up off the top of the frame, uncovering the movement from
// the bottom up. It is hidden only once it is entirely off screen.
export const LIFT_MM = 3;
export const TILT_DEG = 22;
export function openPose(p) {
  p = clamp01(p);
  const lift = LIFT_MM * soft(p / 0.25);
  const tilt = TILT_DEG * glide(p);
  // Fraction of the off-screen travel distance, which the figure measures from the current view.
  const slide = slideCurve(p);
  const visible = p < 1;
  const unit = { lift, tilt, slide, fade: 1, visible };
  return {
    front: unit,
    lid: unit,
    hands: { fade: 1, scale: 1 },
    camera: glide(p),
    pull: 0,
    // The watch keeps the same orientation, crown at 3, while opening.
    turn: 0,
  };
}

// Advance the progress toward the goal (0 or 1). Reduced motion jumps straight there.
export function stepOpen(p, goal, dt, reduced = false) {
  if (reduced) return goal;
  const d = dt / OPEN_SECONDS;
  return goal > p ? Math.min(goal, p + d) : Math.max(goal, p - d);
}
