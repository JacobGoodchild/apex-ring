# Apex Ring

An arcade hypercar racing game that runs in the browser, on phones and desktops. No accounts, no ads, no purchases.

**Play:** the `main` branch deploys to GitHub Pages after the tests pass. On a phone, open it and use
"Add to Home screen" to install it; it then works offline.

## How to play
- The car accelerates on its own and lifts for tight corners. You steer.
- **Steer:** the ◀ ▶ pads (or touch either half of the screen, see Settings), phone tilt, or ← → / A D.
- **Drift:** tap DRIFT while steering (Space on a keyboard). Drifting fills the blue boost bar.
- **Brake:** hold DRIFT without steering, or ↓.
- **Boost:** BOOST or ↑ when the bar has charge.
- **Other keys:** C camera, P pause, R back on track, M mute.

## Modes
Quick race (8 cars), time trial (with a ghost of your best lap), and a 12-event career with races,
time trials, drift challenges, elimination and head-to-heads. Coins and gems buy cars, upgrades, rims and decals.

## Run it locally
```
npm ci
npm run serve        # http://localhost:4173
npm test             # Playwright tests in headless Chromium, screenshots in screenshots/
```
After changing any shipped file, run `npm run sw` so the offline cache list stays current (CI checks this).

See `CLAUDE.md` for the code map and progress log, and `CREDITS.md` for asset sources.
