# Credits

Almost everything is made in code in this repo. The only third-party art is a set of CC0 photo textures.

| Asset | Source | Licence |
|---|---|---|
| Cars (Vanta S1, Kestrel GT, Nimbus R, Solace V12, Razor LM, Aurora E, Tempest X) | Procedural, `src/carmodel.js`. Original designs, no real brands. | Part of this project |
| Tracks and scenery | Procedural, `src/track.js`, `src/trackmesh.js`, `src/scenery.js` | Part of this project |
| Textures (road markings, kerbs, windows, crowds, smoke, signs) | Drawn on canvas at runtime, `src/textures.js` and friends | Part of this project |
| Photo textures in `assets/tex/` (resized to 512 px): asphalt_02, sparse_grass, leafy_grass, gravel, coast_sand_01, rock_face, dark_rock, snow_02, concrete | [Poly Haven](https://polyhaven.com) | CC0 (public domain) |
| Sound (engine, tyres, boost, beeps, clicks, fanfare) | Synthesised with Web Audio, `src/audio.js` | Part of this project |
| App icon | `icons/icon.svg`, rendered to PNG by `scripts/icons.mjs` | Part of this project |
| Three.js r186 | https://threejs.org, vendored in `vendor/three/` | MIT (see `vendor/three/LICENSE`) |

No downloaded 3D models are used: the cloud build environment has no reliable access to model libraries,
so the cars are built procedurally instead.
