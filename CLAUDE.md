# Apex Ring — brief for Claude Code

## What this is
A browser racing game. One file, `index.html`, using Three.js r128 from cdnjs. No build step.
Hosted on GitHub Pages straight from `main`, so every push goes live.
The player drives an original hypercar (the Vanta S1, with scissor doors) round a track.
The car always accelerates; the player only steers (left/right pads, arrow keys, or phone tilt).

## Rules
- Never use real car brands, logos or exact copies of real car designs.
- Only use 3D models, textures and sounds with a licence that allows reuse (CC0 or CC-BY). Record each one in `CREDITS.md`.
- Must run smoothly on a mid-range phone (aim for 60fps on a Pixel 7). Watch the polygon and draw-call counts.
- Keep it playable after every commit. If something breaks, revert it rather than piling fixes on top.

## How to check your work (do this before every commit)
1. Run `npm test`. It runs the Playwright tests in `tests/`.
2. Tests must load the page in headless Chromium and confirm:
   - no console errors
   - the Start button starts the countdown and the race
   - the car moves forward and steering changes its heading
   - a full lap is counted once the car goes all the way round
   - the HUD shows speed and lap time
3. Save screenshots of the menu and the race to `screenshots/`, then look at them and fix anything that looks wrong.
4. Commit with a clear message, then push.

## Feature list (work top to bottom, one feature per commit)
1. Split the code into files: `index.html`, `src/*.js`, `styles.css`. Add `package.json` with Playwright tests.
2. Better car model: load a licensed glTF hypercar model with GLTFLoader. Keep the current car as a fallback.
3. Three AI rival cars that follow a racing line, with a position counter (1st/2nd/3rd/4th).
4. Drifting: the car slides a bit at high speed, with tyre smoke and skid marks.
5. A second track: a figure-of-eight with a bridge.
6. A minimap in the corner.
7. A ghost car showing your best lap.
8. Sound: a sampled engine sound, tyre squeal, and the countdown beeps.

## Progress log
Add a dated line here after each session saying what you did and what you'd do next.
