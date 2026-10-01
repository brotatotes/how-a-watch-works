# How a Watch Works — design

One long page. It starts with a coiled spring and adds one part per section until a whole mechanical watch is ticking in front of the reader. Every section has one live figure that teaches exactly one idea. Readers can spin the 3D figures, slow time down to 1/100, scrub through a single beat, pull parts out and watch what goes wrong.

## The movement we model

A plain, hand-wound "small seconds" movement in the spirit of the Unitas/ETA 6497-2 (21,600 vph, small seconds). It is simplified but every number below is a real, self-consistent value, and the simulation uses these numbers directly.

### Beat rate

- Balance frequency f = 3 Hz, so one full oscillation (there and back) takes 1/3 s.
- Each oscillation contains two beats (vibrations), so 6 beats per second and 6 × 3600 = **21,600 vibrations per hour (vph)**.
- The escape wheel has 15 teeth, so its pitch is 360° / 15 = 24°. It advances half a pitch, 12°, per beat, and one full tooth per oscillation.
- Escape wheel speed = 3 teeth/s ÷ 15 teeth = 0.2 rev/s, one turn every **5 seconds**.

### Going train (tooth counts and ratios)

Wheel teeth drive pinion leaves. The ratio of a stage is wheel teeth ÷ pinion leaves.

| Stage | Driver | Driven | Ratio |
|---|---|---|---|
| 1 | Barrel, 96 teeth | Centre pinion, 12 leaves | 8 |
| 2 | Centre wheel, 80 teeth | Third pinion, 10 leaves | 8 |
| 3 | Third wheel, 75 teeth | Fourth pinion, 10 leaves | 7.5 |
| 4 | Fourth wheel, 84 teeth | Escape pinion, 7 leaves | 12 |

- Centre wheel → fourth wheel: 8 × 7.5 = **60**. The centre wheel turns once an hour, so the fourth wheel turns once a minute and carries the seconds hand.
- Fourth wheel → escape wheel: 12. Escape wheel turns once every 60 / 12 = 5 s, which matches the escapement value above. The train and the oscillator agree, so the seconds hand is right.
- Barrel → centre wheel: 8. The barrel turns once every 8 hours. With about 5.5 usable turns of mainspring, the power reserve is about 44 hours.
- Barrel → escape wheel overall: 8 × 8 × 7.5 × 12 = **5,760**. That is why a tiny push on the escape wheel costs so little spring and why letting the train run free empties the spring in minutes rather than days.

### Motion works (hands)

- Cannon pinion (12 leaves) rides friction-tight on the centre arbor and carries the minute hand: 1 rev/h.
- Minute wheel 36 teeth: 36 / 12 = 3. Minute pinion 10 leaves drives the hour wheel 40 teeth: 40 / 10 = 4.
- 3 × 4 = **12**, so the hour hand turns once every 12 hours.

### Tooth geometry

Watch trains traditionally use cycloidal (ogival) profiles rather than the involute teeth common in machinery, because they work better with small pinions and dry, low-friction contact. We model an approximation: an epicycloid-like rounded addendum and straight radial flanks below the pitch circle, with realistic modules.

| Stage | Module (mm) | Wheel pitch Ø | Pinion pitch Ø | Centre distance |
|---|---|---|---|---|
| Barrel / centre pinion | 0.12 | 11.52 | 1.44 | 6.48 |
| Centre / third pinion | 0.10 | 8.00 | 1.00 | 4.50 |
| Third / fourth pinion | 0.09 | 6.75 | 0.90 | 3.825 |
| Fourth / escape pinion | 0.075 | 6.30 | 0.525 | 3.4125 |

Meshing is exact. A driven gear's angle is derived from its driver's angle times the ratio, with a phase offset so teeth sit in each other's gaps at t = 0. No slip is possible by construction, and a test checks the gap alignment.

### Swiss lever escapement geometry

- Escape wheel: 15 club teeth, outer Ø 5.0 mm.
- Pallet fork spans about three teeth. Entry and exit pallet stones are synthetic ruby.
- Lever total angle between banking pins: 10.5°. Lock 2°, impulse 8.5°.
- Balance lift angle 52°. The roller jewel is inside the fork slot only while |θ| < 26°.
- Escape wheel per beat: 12° total, made of a tiny recoil during unlocking (draw), about 10.5° of impulse rotation, then about 1.5° of free drop onto the other pallet's locking face.
- Balance: Ø 10 mm, amplitude about 270° when fully wound, falling towards about 180° as the spring runs down. Free-decay time constant about 25 s (balance Q about 240).

### Kinematic model (what the code computes)

Everything is a pure function of simulated time t, so scrubbing is exact and cheap.

1. Balance: θ(t) = A · sin(2πft), with A set by mainspring torque.
2. Fork: when |θ| < 26° the roller jewel drives the fork, φ = 5.25° · θ / 26°. Outside that zone the fork rests on the banking pin on the side the balance last went.
3. Escape wheel: beat index k counts completed passes through the lift zone. Within the current pass, progress s ∈ [0, 1] across the lift zone maps to unlock (s < 2/10.5, slight recoil), impulse (wheel follows the pallet), then a short drop over 4 ms of simulated time, then locked.
4. Train: each wheel's angle is the escape wheel angle divided by the cumulative ratio. Hands follow from the fourth wheel (seconds), cannon pinion (minutes) and hour wheel.
5. Failures:
   - Pallet fork removed: the escape wheel is never stopped. Its speed rises to a runaway limit set by air and pivot friction, the whole train whirls, and the barrel lets down in minutes rather than days. The balance is no longer impulsed and its swing decays.
   - Mainspring removed or let down: no torque reaches the escapement, so impulses stop, the balance decays to rest, and the train stays put.
   - Balance removed: nothing unlocks the fork. The draw pulls the fork against its banking pin, the escape wheel is locked, and the watch stops.
   - Escape wheel removed: the train spins free like the fork case, and the fork and balance are left alone.

## Essay outline and figures

0. **Opening.** Hero figure: the complete movement ticking at real speed, dial side and movement side, drag to orbit. One sentence promise: by the end you will know what every piece does.
1. **Storing energy.** Figure: the mainspring inside its barrel, cut away. A wind slider coils it; a small torque curve beside it shows why the first and last turns are not used.
2. **Gears trade speed for turns.** Figure: two gears meshing with a tooth counter. Changing tooth counts changes the ratio live. Then the full train: highlight the power path and see each wheel's speed.
3. **Why it needs a brake.** Figure: the train with nothing holding it. Release it and watch the spring empty in minutes rather than days. The problem is not power but pacing.
4. **The escape wheel and pallet fork.** Figure: a 2D close-up of the lever escapement, scrubbable through one beat, with the four phases labelled: lock, unlock, impulse, drop.
5. **The balance and hairspring.** Figure: an oscillator. Change inertia or spring stiffness and see the period change; change the amplitude and see it barely change (isochronism). A trace plots angle over time.
6. **Putting the escapement together.** Figure: 3D balance, fork and escape wheel together at 1/100 speed with the fork angle and balance angle traced.
7. **Jewels and shock protection.** Figure: a pivot in its jewel bearing and a cap stone, with a friction comparison.
8. **Hands and winding.** Figure: motion works with the 12:1 reduction and the keyless works (crown, winding pinion, crown wheel, ratchet and click).
9. **The whole watch.** Figure: the complete movement with explode, part toggles, power-path highlight, speed and scrub. Pull a part out and see what fails.

## Interaction model

- Every figure has a compact control strip: play/pause, speed (log slider from 1× to 1/100×), and where useful a scrub slider across one beat or a few seconds, plus figure-specific toggles.
- 3D figures: drag to orbit, pinch or wheel to zoom within limits, double-click to reset. Touch gestures do not hijack page scroll outside the canvas.
- Figures only animate while visible (IntersectionObserver). One shared WebGL renderer draws each visible 3D figure and copies to its canvas, avoiding context limits.
- Reduced motion: figures start paused and show a still frame; the reader can press play.
- Automatic quality: if frame time stays high, drop pixel ratio, then shadows, then tooth tessellation.
- Optional synthesized tick sound using WebAudio, off until the reader turns it on.

## Visual style

- Cream page (#f5efe3), dark ink text (#2a2520), EB Garamond throughout, generous measure (about 66 characters), figures wider than the text column.
- Materials: warm gilded brass for wheels and barrel, rhodium or blued-steel look for arbors, screws and hairspring, frosted nickel plate and bridges with perlage hinting, deep ruby jewels.
- Soft studio lighting: a large key light, a fill, a rim light and a neutral environment for reflections. Gentle contact shadow.
- Highlight colour for the power path: a warm amber glow. Failure states use a muted red label, never alarm noise.
