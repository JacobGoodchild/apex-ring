# Apex Ring — brief for Claude Code

## What this is
An arcade hypercar racing game for the browser. Plain ES modules, no build step:
`index.html`, `styles.css`, `src/*.js`, and Three.js vendored into `vendor/three/` (from npm, via `npm run vendor`).
An import map in `index.html` points `three` and `three/addons/` at the vendored copy, so nothing loads from a CDN.
GitHub Actions (`.github/workflows/deploy.yml`) runs the tests on every push to `main` and deploys to GitHub Pages only if they pass.

The player drives original hypercars (the Vanta S1 and friends) round spline-built tracks against rule-based rivals.
The car accelerates by itself; the player steers, and has boost and drift/brake buttons.

## Code map
- `src/main.js` — boot, fixed-step game loop (60 Hz), menus, race flow, test hook (`window.__apex` in test mode).
- `src/env.js` — URL options: `?test=1` (fixed seed, faster time, test save slot), `speed=`, `seed=`, `autopilot=1`, `laps=`, `quality=`.
- `src/track.js` — `TrackPath`: Catmull-Rom centre-line, projection, banking, racing line, speed profile, bridge detection.
- `src/trackmesh.js`, `src/scenery.js` — track meshes and themed scenery. `src/tracks.js` — track + theme data.
- `src/vehicle.js` — arcade physics shared by player and AI. `src/cars.js` — car stats and upgrades. `src/carmodel.js` — car meshes.
- `src/scene.js` — renderer, sky, lights, quality presets, bloom. `src/input.js`, `src/audio.js`, `src/save.js`, `src/rng.js`, `src/textures.js`.

## Rules
- Never use real car brands, logos or exact copies of real car designs.
- Only use 3D models, textures and sounds with a licence that allows reuse (CC0 or CC-BY). Record each one in `CREDITS.md`.
- Must run smoothly on a mid-range phone (aim for 60fps on a Pixel 7). Watch polygon and draw-call counts; instance repeated things.
- No external network requests at runtime (only files in this repo), no tracking, no eval, no remote code, no secrets, no cookies. Only localStorage (always in try/catch).
- Only well-known npm dependencies (three, @playwright/test).
- Keep it playable after every commit. If something breaks, revert it rather than piling fixes on top.

## How to check your work (do this before every commit)
1. Run `npm test` (Playwright, headless Chromium). Tests cover: no console errors, menu, countdown and race start,
   car moves and steers, laps count, race finishes, saving and loading.
2. Screenshots land in `screenshots/` at phone portrait (412x915) and landscape (915x412). Look at them and fix anything ugly.
3. Commit with a clear message (one feature per commit), then push.

## Feature list (work top to bottom)
1. [x] Setup: CI + Pages deploy, ES modules, vendored Three.js, Playwright tests with test mode.
2. [x] Driving feel: acceleration, auto-brake into tight corners, grip, weight transfer, body roll, drift button. Chase cam tuned for portrait and landscape, optional bonnet cam.
3. [x] First real track built from a spline: hairpins, chicanes, sweepers, elevation, banking, a bridge. Minimap.
4. [x] Rivals: 5–7 rule-based AI drivers with personalities, mistakes, braking points, overtaking, slipstream, subtle rubber-banding. Position counter and results screen.
5. [x] Boost + drift: boost meter and button, exhaust flames, speed lines, FOV kick; drifting fills boost, tyre smoke, skid marks.
6. [x] Better car model: smooth lofted bodywork, wheel arches, detailed wheels, glossy paint with reflections, glowing lights.
7. [x] Garage / lobby: 3D showroom, rotating car, doors opening, paint colours.
8. [x] Coins + gems, upgrades (engine, tyres, handling, boost, weight) with stat bars, shop, cosmetics (paints, rims).
9. [x] More cars: at least 6 with different stats and door styles.
10. [x] More tracks: coastal city at night, mountain pass, desert canyon, neon city, forest circuit. Track previews.
11. [x] Career mode: races, time trials, drift challenges, elimination, head-to-head; unlocks. Quick race + time trial.
12. [x] Sound polish: engine with gears, tyre squeal, boost whoosh, countdown beeps, menu clicks, mute.
13. [x] Visual polish: bloom, shadows, transitions, results podium, graphics quality settings with auto default.
14. [x] Installable web app: manifest + service worker, works offline.
15. Keep improving cars, tracks and features.

## Progress log
- 2026-10-09: Setup. Split into ES modules with vendored Three.js r186, spline-based track engine (the oval is now a spline),
  shared arcade vehicle physics, Playwright tests with a test mode (fixed seed, 4x time, autopilot), GitHub Actions test + Pages deploy.
  Dropped Google Fonts (external request). Next: driving feel + chase cam.
- 2026-10-09: Driving feel. Grip-limited yaw with slip (drift button, tap-to-hold slides), auto-brake assist from the track speed profile, body roll/pitch, suspension bob, new chase cam (lag, drift swing, portrait/landscape framing) and bonnet cam (C key / Cam button), boost + drift pads on phone. Next: first real spline track.
- 2026-10-09: First real track. 'Apex Ring GP' (2.3 km): long straight, flyover bridge (auto-detected crossing with deck + pillars), hairpin, chicane, sweepers, elevation with embankments, banking. Minimap, track picker with preview in the menu, compact HUD buttons. Dev helpers in scripts/dev (track plot, physics sim). Next: rivals.
- 2026-10-09: Rivals. 7 rule-based drivers (src/ai.js) with aggressive/careful/inconsistent personalities: racing line + bias, braking points from the speed profile, random lifts and wide moments, overtaking to the side with room, defending, following, slipstream (player too), boost on straights, subtle rubber-banding. Track-space car collisions. Position chip, results standings. Headless AI race in scripts/dev/race.mjs. Next: boost + drift effects.
- 2026-10-09: Boost + drift. Boost meter under the speedo, glowing boost pad when ready, exhaust flames, speed lines, FOV kick, whoosh; drifting fills boost, drift points pop-up, tyre smoke (pooled sprites) and skid marks (ring-buffer mesh), lock-up marks under hard braking. Next: better car model.
- 2026-10-09: Better car model. Procedural lofted bodywork (rounded cross-sections along the length) with wheel arches, canopy, roof spine, mirrors, splitter, diffuser, wing styles, light strips; wheels with rounded tyre walls, spoked rims, discs, calipers. Parts merged per material (~20 draw calls a car). Door styles: scissor, butterfly, gullwing, dihedral. No downloadable licensed models used (kept it all procedural, no network). Next: garage/lobby.
- 2026-10-09: Garage / lobby. Separate showroom scene (turntable, studio lights, glossy floor), drag to spin, doors cycle open in the lobby and stay open in the garage. Lobby screens: Race (quick race / time trial + track picker), Garage (car picker, stat bars, paint, rims), Settings (quality, camera, sound, reset progress). Fixed door hinge directions, mirrors, lights. Dev car viewer: dev/carview.html + scripts/dev/carshot.mjs. Next: coins, upgrades, shop.
- 2026-10-09: Coins, gems, upgrades and shop (src/economy.js). Race rewards by place, drift points, clean laps and records; gems for wins and records. Five upgrade lines with 5 levels each and stat bars (base vs upgraded), rims cost coins, cars bought with coins (Tempest X with gems). Rivals drive their own models tuned halfway toward the player's spec so races stay close. Note: the six new cars landed in this commit too because the shop needed them.
- 2026-10-09: Five more tracks with themes: Harbour Lights (coastal city at night, sea, lit tower blocks), Alpine Pass (32 m climb, switchbacks, tunnel, snow peaks), Red Canyon (mesas, cacti, rocks, flyover), Neon District (glowing blocks, neon barriers, figure-of-eight overpass), Greenwood Circuit (dense forest, rolling hills). Track previews show the theme. Fixed the grandstand facing the wrong way. tests/tracks.spec.js races and screenshots every track. Next: career mode.
- 2026-10-09: Career mode (src/career.js): 12 events across all tracks - races, time trials, drift challenges, elimination (last car out each lap), head to head - with 1-3 stars, one-off event rewards, and unlocks (tracks for quick race, free Kestrel GT and Nimbus R). Only Dusk Oval and Apex Ring GP are open in quick race at first. Event banner in the HUD and results. Next: sound, polish, installable app.
- 2026-10-09: Sound polish: upshift blips with an engine dip, lap chime, finish fanfare (bigger for a podium), audio suspends and the race pauses when the app goes to the background; settings test covers sound/quality saving and reset.
- 2026-10-09: Visual polish: results podium, loading screen, fade-in on race start, screen card transitions, WRONG WAY warning, far rivals drop small parts and only cast shadows from the body (about 210 draw calls / 140k triangles on medium with 8 cars). CREDITS.md added (everything is procedural, Three.js is MIT). scripts/dev/perf.mjs prints draw calls per track.
- 2026-10-09: Installable app: manifest.webmanifest, icons (icons/icon.svg rendered by npm run icons), cache-first service worker sw.js generated by npm run sw (hash-versioned list of every shipped file; CI fails if it's stale, so run npm run sw before committing). tests/pwa.spec.js checks manifest, icons, SW install and offline reload.
- 2026-10-09: Decals: twin stripes, centre stripe, side flash and race-number roundels on the doors (thin loft patches over the body, colour picked to contrast with the paint), 400 coins each per car, plus four more paints. Rivals now wear varied rims and liveries.
- 2026-10-09: Ghost car (src/ghost.js): time trials record your lap at 10 Hz and replay your best lap per track as a see-through car; recordings saved in localStorage (save.ghosts).
- 2026-10-09: Race extras: rival difficulty (easy/normal/hard) in settings, live gap to the car ahead (or lead over the car behind), respawn button for touch, soft fake headlight beams on night tracks.
- 2026-10-09: Car refinement: fixed inside-out loft winding (paint lighting and the glass canopy now render correctly), curved LED headlight strips (three styles), full-width curved tail-light bar, recessed side scoops, twin exhaust pipes.
- 2026-10-09: Track dressing and onboarding: billboards with made-up sponsors on the straights (one atlas texture, instanced), painted grid boxes, thinner tail-light bar, three timed tips on the very first race (steer, drift fills boost, use boost).
- 2026-10-09: Performance + awareness: adaptive resolution (drops render resolution in steps when frames take >21 ms, raises it back under 15 ms, floor 55%), name tags over up to three rivals just ahead.
