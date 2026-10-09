# Apex Ring

An arcade hypercar racing game that runs in the browser, on phones and desktops. No accounts, no ads, no purchases,
no servers: everything (saves, leaderboards, ghosts) stays on your device.

**Play:** the `main` branch deploys to GitHub Pages after the tests pass. On a phone, open it and use
"Add to Home screen" to install it; it then works offline.

## How to play
**Casual driving** (default): the car speeds up, brakes and drifts by itself. You steer and boost.
- **Steer:** hold the left or right half of the screen, tilt the phone (Settings > Controls), or ← → / A D.
- **Drift:** steer hard into a fast bend and the car slides. Drifting fills the blue boost bar; linking drifts
  quickly builds a multiplier (up to x5).
- **Boost:** tap both sides of the screen together twice, or Space / ↑.
- **Slipstream:** sit right behind a rival to fill the draft bar; when it's full you get a free slingshot.

**Pro driving** (Settings > Driving > Pro): you work the pedals.
- ↑ / W accelerate, ↓ / S brake, Space handbrake (kicks the car into a drift), Shift boost.
- On a touch screen, steering buttons and GAS / BRAKE / HAND / BOOST pedals appear.

Other keys: C camera, P pause, R back on track, M mute. Gamepads work too (stick steers, A boosts, triggers are
the pedals in Pro mode).

**Two players:** pick "2 players" in race setup for split-screen on one keyboard (player 1: A/D + W,
player 2: ← → + ↑) or with two gamepads.

## Modes and content
- **Quick race** against 7 rule-based rivals with personalities (aggressive, careful, wild card, blocker, apex hunter),
  **time trial** with ghosts (your best lap, plus a friend's lap shared as a code), and a local leaderboard of your
  best laps this week / month / ever.
- **Career:** 20 events on a map: races, time trials, drift challenges, timed Drift Attacks, eliminations, timed
  Knockouts, head-to-heads and Boss battles that win you the boss's car.
- **Weather:** race any track Dry or in the Rain (wet, reflective road and less grip).
- **Replays:** watch your best time-trial lap back from the chase camera.
- **Daily Challenge** (a new event every day), **Trophies** to collect, and **Photo mode** in the pause menu.
- **9 tracks**, each also raceable Reversed or Mirrored: Dusk Oval, Apex Ring GP, Greenwood, Red Canyon,
  Harbour Lights, Neon District, Alpine Pass, Xtreme (cliffs and ramps) and Coastal Highway (rain, wet road).
- **9 cars** in four classes (Compact, Muscle, Supercar, Prototype), upgrades (Engine, Tyres, ECU, Turbo, Weight),
  paints, finishes (matte, metallic, pearl, neon), rims, decals with your choice of livery colour, and boost flame colours.
- Procedural synthwave soundtrack and engine sounds, all made in code.

## Run it locally
```
npm ci
npm run serve        # http://localhost:4173
npm test             # Playwright tests in headless Chromium, screenshots in screenshots/
```
After changing any shipped file, run `npm run sw` so the offline cache list stays current (CI checks this).

See `CLAUDE.md` for the code map and progress log, and `CREDITS.md` for asset sources.
