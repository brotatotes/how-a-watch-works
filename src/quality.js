// Automatic quality reduction. Feed it real frame intervals in milliseconds.
// Slow frames (over 34 ms, i.e. under ~30 fps) accumulate; fast frames pay the debt back.
// After about two seconds of net slowness the pixel ratio drops by a quarter, down to 0.75.
// Gaps over four seconds are ignored as pauses rather than rendering cost. Tab switches and
// scrolling the figure off screen also reset the clock in main.js.
export const SLOW_MS = 34;
export const BUDGET_MS = 2000;
export const MIN_RATIO = 0.75;

export function createQuality(ratio) {
  return { ratio, slow: 0, level: 0 };
}

// Returns true when the ratio changed and the renderer should be resized.
export function adaptQuality(q, ms) {
  if (!(ms > 0) || ms > 4000) return false;
  q.slow = ms > SLOW_MS ? q.slow + ms : Math.max(0, q.slow - ms);
  if (q.slow > BUDGET_MS && q.ratio > MIN_RATIO) {
    q.ratio = Math.max(MIN_RATIO, q.ratio * 0.75);
    q.level++;
    q.slow = 0;
    return true;
  }
  return false;
}
