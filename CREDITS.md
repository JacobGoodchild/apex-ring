# Credits

Apex Ring ships no third-party art or audio. Everything below is made in code in this repo.

| Asset | Source | Licence |
|---|---|---|
| Cars (Vanta S1, Kestrel GT, Nimbus R, Solace V12, Razor LM, Aurora E, Tempest X) | Procedural, `src/carmodel.js`. Original designs, no real brands. | Part of this project |
| Tracks and scenery | Procedural, `src/track.js`, `src/trackmesh.js`, `src/scenery.js` | Part of this project |
| Textures (asphalt, kerbs, barriers, windows, crowds, smoke) | Drawn on canvas at runtime, `src/textures.js` and friends | Part of this project |
| Sound (engine, tyres, boost, beeps, clicks, fanfare) | Synthesised with Web Audio, `src/audio.js` | Part of this project |
| App icon | `icons/icon.svg`, rendered to PNG by `scripts/icons.mjs` | Part of this project |
| Three.js r186 | https://threejs.org, vendored in `vendor/three/` | MIT (see `vendor/three/LICENSE`) |

No downloaded 3D models are used: the cloud build environment has no reliable access to model libraries,
so the cars are built procedurally instead.
