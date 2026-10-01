# Acceptance checks

## Numbers (node tests)
- Beat rate is 21,600 vph: 3 Hz balance, 6 beats/s.
- Escape wheel advances 12° per beat and turns once per 5 s.
- Centre → fourth ratio is exactly 60, fourth → escape exactly 12, barrel → centre exactly 8, motion works exactly 12.
- Over 1 hour of simulated time the seconds hand turns 60 times, the minute hand once, the hour hand 1/12 turn, within 1e-9 of a turn.
- Seconds hand moves in discrete steps, 6 per second, and is stationary while locked.
- Escapement phases occur in order within every beat: lock → unlock (tiny recoil) → impulse → drop → lock. Drop is between 1° and 2° of escape wheel rotation.
- The fork only moves while |θ| < 26° and rests on a banking pin otherwise.
- Every meshing pair has constant angular ratio and a tooth-gap phase alignment at every sampled time.
- Failures: without the fork the escape wheel exceeds 10 rev/s within 2 s; without the mainspring the train does not move and balance amplitude decays; without the balance the train does not move.

## Browser (Playwright, file://)
- Page loads with zero page errors and zero network requests other than the file itself.
- Every figure canvas renders non-blank pixels and responds to its controls (pixel change after input).
- Speed slider reaches 1/100; scrub slider moves the mechanism to the requested time.
- Part toggles change what is drawn and the failure label appears.
- Desktop 1440×900, phone 390×844 portrait and 844×390 landscape have no horizontal overflow and no overlapping controls.
- Reduced motion starts figures paused.
- Sound stays off until the reader enables it.

## Visual
- Screenshots at desktop and phone inspected with vision; parts are recognisable, teeth read as teeth, materials look like brass, steel and ruby.

## Package
- Single self-contained dist/index.html. Three.js MIT notice present. No private paths or secrets in the output or repo.
