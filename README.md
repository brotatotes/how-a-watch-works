# How a Watch Works

An interactive visual essay about the mechanical watch. It starts with a coiled spring and adds one part per section, the gear train, the escape wheel, the pallet fork, the balance and hairspring, then the hands, until a whole movement is ticking on the page. The main figure starts as a closed watch with a steel case, a cream dial and real hands that keep the movement's time, and it opens to show the movement inside. You can spin the 3D model, slow time down to a hundredth of real speed, scrub through a single beat and pull parts out to see what breaks.

Read it here: https://brotatotes.github.io/how-a-watch-works/

## How it is built

The movement is modelled procedurally with Three.js. The balance wheel's oscillation drives the simulation, and everything else, the escapement's lock, unlock, impulse and drop, the gear train and the hands, is derived from it through real tooth counts and ratios. The movement beats at 21,600 vibrations per hour.

- `src/` holds the essay text, figures, simulation and 3D geometry.
- `tests/` holds Node tests for the ratios, beat rate, hand rates and escapement phase. Run them with `npm test`.
- `npm run build` bundles everything into one self-contained `dist/index.html`. The published `index.html` is a copy of that file and makes no network requests.

## Third-party notices

- Three.js is used under the MIT licence. See `vendor/three/LICENSE`.
- EB Garamond is used under the SIL Open Font License 1.1. See `vendor/eb-garamond/OFL.txt`.
