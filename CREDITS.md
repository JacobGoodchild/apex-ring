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
| Fonts Barlow and Barlow Condensed (`assets/fonts/`, self-hosted woff2) | [Barlow by Jeremy Tribby](https://github.com/jpt/barlow) via Google Fonts | SIL Open Font License 1.1 (`assets/fonts/OFL.txt`) |
| Sky photos in `assets/sky/` (tone-mapped from HDRIs): qwantani_late_afternoon, qwantani_sunset, kloofendal_38d_partly_cloudy, kloofendal_48d_partly_cloudy, kloofendal_misty_morning, kloofendal_overcast, snow_field, industrial_sunset_02 | [Poly Haven](https://polyhaven.com/hdris) | CC0 |
| Tree pictures in `assets/trees/atlas.webp`, baked from the 3D models fir_tree_01, fir_sapling_medium, island_tree_01, island_tree_02, quiver_tree_01 | [Poly Haven](https://polyhaven.com/models) | CC0 |
| Robot voice lines `assets/sfx/*.mp3` | Spoken by espeak-ng and processed by `scripts/dev/robotvoice.py` | Part of this project |
| Track photos in `assets/previews/` | Rendered from the game itself by `scripts/dev/previews.mjs` | Part of this project |
| Three.js r186 | https://threejs.org, vendored in `vendor/three/` | MIT (see `vendor/three/LICENSE`) |

The cars are built procedurally; the only downloaded 3D models (trees) are baked into a picture atlas offline.
