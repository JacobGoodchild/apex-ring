# Apex Ring — brief for Claude Code

## What this is
An arcade hypercar racing game for the browser. Plain ES modules, no build step:
`index.html`, `styles.css`, `src/*.js`, and Three.js vendored into `vendor/three/` (from npm, via `npm run vendor`).
An import map in `index.html` points `three` and `three/addons/` at the vendored copy, so nothing loads from a CDN.
GitHub Actions (`.github/workflows/deploy.yml`) runs the tests on every push to `main` and deploys to GitHub Pages only if they pass.

The player drives original hypercars (the Vanta S1 and friends) round spline-built tracks against rule-based rivals.
Casual mode: the car accelerates, brakes and drifts by itself; the player steers and boosts. Pro mode adds manual
throttle, brake and handbrake.

## Code map
- `src/main.js` — boot, fixed-step game loop (60 Hz), menus, race flow, test hook (`window.__apex` in test mode).
- `src/env.js` — URL options: `?test=1` (fixed seed, faster time, test save slot), `speed=`, `seed=`, `autopilot=1`, `laps=`, `quality=`.
- `src/track.js` — `TrackPath`: Catmull-Rom centre-line, projection, banking, racing line, speed profile, bridge detection.
- `src/trackmesh.js`, `src/scenery.js` — track meshes and themed scenery. `src/tracks.js` — track + theme data.
- `src/vehicle.js` — arcade physics shared by player and AI. `src/cars.js` — car stats and upgrades. `src/carmodel.js` — car meshes.
- `src/scene.js` — renderer, sky (with clouds), sky-based reflections, quality presets, bloom. `src/input.js`, `src/audio.js`, `src/save.js`, `src/rng.js`, `src/textures.js`.
- `src/photo.js` — CC0 photo textures from `assets/tex/` (+ shader helpers). `src/terrain.js` — heightfield landscape per track.
- `src/music.js` — procedural synthwave soundtrack. `src/ghostcode.js` — ghost laps as shareable text codes.
- `src/career.js` — career events, unlocks and judging. `src/race.js` — difficulty levels shared with `tests/sim.js`.

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
- 2026-10-09: Controls: optional 'screen halves' touch steering (Settings > Touch steering), control help on the pause screen, README.md for humans.
- 2026-10-09: CI: runs on main now queue instead of cancelling each other (a full run takes ~10 min), so every push gets tested and the latest green one deploys. Tried 2 Playwright workers: too slow under software WebGL, kept 1.
- 2026-10-09: Career flow: 'Next: <event>' button after a completed event, Try again / Replay labels, champion message after the final. Tried letting bold rivals drift into hairpins: slower and more wall hits in the headless race sim, so reverted it.
- 2026-10-09: Launch control: hold BOOST in the last moment before GO for a perfect start (+22 m/s); too early gives a short wheelspin bog.
- 2026-10-09: Garage tells you which career event wins a car for free.

### Session summary (2026-10-09, 09:35–13:00 UTC)
Built from the single-file oval prototype to a full game in ~30 tested commits, each pushed to `main` and deployed by CI:
- **Tech:** ES modules, vendored Three.js r186, no CDN or external requests at runtime, Playwright suite (27 tests: menus,
  racing, steering, laps/finish, saves, shop, career, ghost, settings, every track, PWA/offline) plus phone screenshots,
  GitHub Actions test-then-deploy, installable offline PWA.
- **Driving:** arcade grip/slip model, auto-brake assist, drift (tap-to-hold on phone), boost with flames/speed lines/FOV kick,
  perfect starts, slipstream, chase + bonnet cams tuned for portrait and landscape, adaptive resolution.
- **Content:** 7 tracks (oval + 6 spline circuits with a flyover, tunnel, big elevation, 6 themes), 7 original procedural cars
  with 4 door styles, paints/rims/decals, 7 rule-based rivals with personalities, career of 12 events, coins/gems/upgrades/shop.
- **Not done / next:** real playtesting on a Pixel 7 to tune handling and AI pace (I could only test headless with
  software WebGL, so feel is tuned by numbers, not by hand); rivals drifting (tried, reverted); more distinct car silhouettes
  (they share one body generator); terrain that follows the elevated tracks instead of embankments; tunnel interiors;
  per-car engine sounds; a proper settings toggle for tilt-by-default; CI is ~10 min a run, could be split into a fast
  smoke job + full job.

## Playtest fixes (2026-10-09, second session)
Feedback from a real Pixel 7: looks great, too hard. Five fixes, one commit each.
- Fix 1 — tracks: every track redesigned with `rounded()` in src/tracks.js (corner points + radius → exact straights and
  circular arcs), 1.5–1.9x wider (26 m Easy / 22 m Medium / 20 m Hard, run-off 9/8/7 m). Difficulty rating per track
  (Easy: Dusk Oval, Apex Ring GP, Greenwood; Medium: Red Canyon, Harbour Lights; Hard: Neon District, Alpine Pass).
  Hairpins and the chicane only on Hard tracks; Easy tracks have no corner under ~110 m radius. Career reordered Easy → Hard;
  the three Easy tracks are open from the start. Chevron boards before corners tighter than ~90 m (1–3 boards by
  sharpness), racing-line stripe on the road (turns amber/red in braking zones), walls now glance the car off
  (lose only the speed going into the wall, ~10% scrub at most) and run-off is grippy. Steering assist (src/assist.js):
  nudges toward the racing line and steers away from a barrier it predicts you'll hit in ~0.7 s. Settings: Steering
  assist and Racing line each Auto/On/Off, where Auto = on when rivals are Easy (new default difficulty: Easy).
  Choice: old saves keep their career progress; trial targets and some events changed to suit the new tracks.
- Fix 2 — difficulty: src/race.js holds the levels (pace, braking point, mistakes, boost skill, catch-up), grid slots and
  rival car tuning, shared by the game and the tests. tests/sim.js is a headless race with a "beginner bot" (on/off
  steering, 0.2 s late, lazy dead zone, looks away now and then, never boosts). Finding: on/off steering with any
  reaction delay made the car weave wall to wall, which is likely what made it feel too hard on the phone. Fixes:
  progressive touch steering (lock builds up over ~0.3 s at speed, releases fast), a heading limiter in the assist
  (the nose can't swing much past ~15-20 degrees off the track direction), assist resists steering that fights the line,
  and the auto-brake lifts if you're about to hit a barrier you can't turn away from. Auto assist = full on Easy,
  a bit lighter on Medium, off on Hard. Easy rivals: 74% pace, early braking, 2.5x mistakes, poor boost, catch-up when
  you're behind. Medium: 78.5%. Hard: unchanged. tests/difficulty.spec.js: beginner top 3 on every Easy track (4 seeds),
  mid-pack (avg 3-6) on Medium across all tracks, ~last on Hard.
- Fix 3 — controls: BOOST/DRIFT/arrow buttons removed. The whole left/right halves of the screen are the steering
  areas (faint ◀ ▶ hints). Drifting is automatic: steering hard into a real bend at over half top speed slides the car
  (quick ~0.3 rad slide, held there, never spins, tyres keep full grip so the line doesn't run wide, little speed lost);
  still makes smoke/skids and fills boost. Braking is automatic (auto-brake margin by level, earliest on Easy).
  Boost = two quick "both thumbs" taps (both halves touched together twice within 0.45 s) or Space/↑ on keyboard; it
  fires a burst of up to 2.5 s while the meter has charge, with a blue edge flash and whoosh; first-time hint when the
  meter first charges; "Boost is empty" note if tapped with no charge. Perfect start = boost tap in the last moment
  before GO. Auto-drift helped rivals too, so Easy/Medium pace retuned to 0.69/0.735 (tests still pass).
- Fix 4 — tilt: Settings > Controls: Touch / Tilt. src/tilt.js turns deviceorientation beta/gamma into the device's
  "up" vector, rotates it by screen.orientation.angle into screen coordinates and reads the steering-wheel roll, so
  portrait and both landscape directions work (unit-tested with synthetic sensor readings). Calibrate button (also a
  "Centre" pill in the race HUD while on Tilt) stores the current roll as straight ahead; sensitivity slider
  (full lock at 28°/sensitivity); 3° dead zone. Permission is requested where the browser needs it (iOS), and re-asked
  on the first tap after reopening the app. No sensor / refused / no readings in 1.2 s → clear message, back to Touch.
  Double two-thumb tap still boosts in Tilt mode. Settings/race/career cards now have a solid panel behind them.
- Fix 5 — updates: the service worker no longer takes over silently. A new version installs in the background and
  waits; if it arrives while you're in the app, a "Update ready — tap to reload" banner appears; if a waiting update
  is found within ~8 s of opening the app it's applied straight away (one quick reload before you play), so updates
  land on the next launch. The app re-checks for updates when it comes back to the foreground and every 30 minutes.
  Version: package.json is 1.4.0; scripts/version.mjs stamps src/version.js with the version plus commit date and
  short hash during the deploy job (the copy in git says "dev"); Settings shows it. CI test timeout raised to 35 min
  (the suite is ~11 min now). tests/pwa.spec.js covers the banner, the next-launch update and the version line.
- Fix 6 — no self-steering (from the phone playtest: the car followed the track by itself). The assist used to pull
  toward the racing line when you weren't steering; now it only shapes steering you're already doing (light line
  pull, heading limiter, wall guard). With no input the car goes dead straight (unit test). The auto-brake can still
  slow you for a corner or a wall, but never steers. Rival pace retuned for the beginner bot: Easy 0.66, Medium 0.71.
- 2026-10-09: Per-car engine sounds: V10 (Vanta, Razor), V8 (Kestrel), flat-6 (Nimbus), V12 (Solace, Tempest) and an electric whine with no gear changes (Aurora); each has its own pitch, harmonics, brightness and number of gears.
- 2026-10-09: More distinct car silhouettes: new shape controls (fender bulge, waist pinch between the wheels, section roundness, cabin tumblehome) — Solace V12 is a long-nose front-engine GT, Nimbus R / Razor LM / Tempest X are prototype-style with big fenders and narrow waists, Aurora E is a smooth rounded bubble. Dev line-up view: dev/lineup.html + scripts/dev/lineup.mjs.
- 2026-10-09: Showroom glare: bloom is off in the lobby/garage (it washed out the car on High) and the studio lights are dimmer.
- 2026-10-09: Jumps: the car now has real vertical physics (gravity, leaves the ground over crests, lands with a thud and a small shake) instead of easing toward the road height, which is what made it look like it sank into the grass on slopes. Tracks can have ramps (striped wedges, `ramps` in src/tracks.js) and a height profile with cliff drops (`heights`: two entries at the same fraction). Small side ramps on Dusk Oval, Apex Ring GP, Greenwood, Red Canyon and Harbour Lights. New Medium track "Xtreme" (sunset quarry): two big ramps, two cliff drops (22 m and 14 m), 2 laps; career event "Xtreme Jump" unlocks it after Harbour Lights. No acceleration or grip in the air.
- 2026-10-09: Big Air: a flight longer than 0.7 s pops "BIG AIR 1.2s", plays a chime and tops up the boost meter (up to +30%). The body squashes down on its suspension after a hard landing and springs back.
- 2026-10-09: Sinking patches, for real this time: on banked bends the low edge of the road dipped up to 1.8 m below the ground plane, so the grass showed through and cars looked half-buried. TrackPath now lifts banked sections so the road and run-off always stay above the grass (unit test checks every track). Dev probe: __apex.roadCover() + scripts/dev/roadcover.mjs.
- 2026-10-09: Less glare: everything toned down from the theme values (exposure x0.88, sun x0.8, sky light x0.85, reflections x0.6, bloom half strength with a higher threshold), softer headlights, glass and paint gloss, sun/moon halo, lamp heads and lit windows, fainter racing-line stripe; snow caps no longer flicker (they were exactly on the mountain surface). scripts/dev/raceshots.mjs takes in-race High-quality shots.
- 2026-10-09: Readability: results, pause, garage, career, settings and race cards all sit on a solid dark panel. Results: estimated times for cars still racing use their average speed and stay in finishing order.

## Overnight release push (2026-10-09 19:05 UTC → 2026-10-10 05:40 UTC = 06:40 UK)
The user asked for a full-release push overnight: work flat out until 05:40 UTC, one tested feature per commit, push to
`claude/bold-cray-7rck1e` and `main`. Plan, in order (tick as done, note choices in the progress log):
- [x] R1 Realism pass (top priority, see user's reference screenshot of a rainy coastal road): CC0 photo textures
      (Poly Haven / ambientCG, small jpgs, credited) for asphalt, grass, rock, sand; clouds in the sky; atmospheric haze;
      terrain around the track instead of a flat plane; road markings; better trees/rocks; colour grading; keep 60fps on a phone.
- [x] R2 Fixed-timestep determinism: physics at a fixed 60 Hz tick independent of refresh rate, render interpolation for
      120 Hz screens, input sampled per tick, determinism test (same seed + inputs at 30/60/144 fps → identical result).
- [x] R3 Audio: RPM engine (exists, refine), spatial sound for passing rivals (panner, nearest 2-3), squeal from drift angle,
      procedural synthwave soundtrack (Web Audio sequencer, no files) with music volume + on/off.
- [x] R4 Pro controls toggle: manual throttle, brake, handbrake drift (keyboard + on-screen pedals); casual stays default.
- [x] R5 Slipstream meter (visible draft bar, fills behind a rival, gives a tow/boost); drift multiplier chain (x2..x5 for
      continuous/linked drifts, lost on wall hit).
- [x] R6 AI: blocker personality (defends the line), apex-hunter, settings sliders for rubber-banding and AI skill.
- [x] R7 Car classes (Compact, Muscle, Supercar, Prototype) with Top Speed / Accel / Drift Grip / Boost Duration; new
      compact + muscle cars; paint finishes (gloss, matte, metallic, pearl, neon glow); boost trail colours; parts shop
      lines Engine, Tyres, ECU, Turbo (map old upgrade saves).
- [x] R8 Tracks: Reverse and Mirror variants for every circuit (not reverse on Xtreme); Coastal Highway track (like the
      reference: sea, cliffs, rain/wet road); hazards: oil slicks, wet patches (less grip); a split-path shortcut if time.
- [x] R9 Career node map; Drift Attack (timed score); timed elimination (every 15 s); Rival boss 1v1 that unlocks their car.
- [x] R10 Ghosts/leaderboards without servers: local weekly/monthly bests per track, ghost export/import as a file/code.
      Online leaderboards, global ghosts and online multiplayer need a server + accounts, which the safety rules forbid
      (no external requests, no accounts) — left for the user to decide. Local 2-player split-screen (keyboard) if time.

### Overnight progress log
- Realism: CC0 Poly Haven photo textures in assets/tex (asphalt with cracks + normal map, grass, gravel, sand, rock,
  dark rock, snow, concrete; 512 px jpgs, ~0.7 MB), loaded by src/photo.js. Road = photo asphalt with the painted
  markings from a canvas overlaid in the shader. src/terrain.js: one heightfield per track (4x4 culled tiles, denser
  near the track) that sits under the road, rolls into hills/mountains, rock on steep slopes, snow up high, colour
  variation baked per vertex (one texture lookup for grass: the first version with 6 lookups cost ~40 ms/frame in
  software GL). Replaces the flat ground and embankments on non-city tracks. Layered pines + round broadleaf trees,
  procedural clouds in the sky shader, concrete barriers with a painted band, sky-based environment map (cars and wet
  roads reflect the real sky). Racing line now only shows (amber/red) in braking zones; it used to compare against a
  500 km/h profile cap, which made a pale stripe on every straight.
- Physics/timing: fixed 1/60 s tick (already), now with render interpolation for 90/120 Hz screens; test-mode `fps=`
  and `stopTick=` options; tests/determinism.spec.js proves the race state is bit-identical at 20 fps and full rate.
- Audio: src/music.js procedural synthwave (4 songs: pads, driving bass, arps with echo, drums, seeded lead in the
  chorus; calmer menu version), Music volume slider; 3 pooled rival engine voices panned left/right with Doppler;
  tyre squeal scales with drift angle and speed.
- Pro driving (Settings > Driving): manual throttle/brake/handbrake (↑/W, ↓/S, Space; Shift boosts), on-screen
  pedals + steer buttons on touch, no auto-brake or auto-drift, assist off by default; standing still isn't "stuck".
- Slipstream meter (fills behind a rival, full = free 1.3 s slingshot that doesn't spend boost); drift combo
  multiplier x2..x5 for drifts linked within 1.5 s, a wall hit mid-drift loses it.
- AI: blocker (Dev Okoro) and apex hunter (Kenji Arata) personalities; Settings > Rival catch-up Off/Low/Normal/High.
- Cars: classes Compact / Muscle / Supercar / Prototype; new Pico RS (compact, i4 engine sound) and Ironhide 427
  (muscle); new stats Drift grip + Boost duration; upgrades renamed Engine / Tyres / ECU / Turbo / Weight reduction
  (same save keys); paint finishes (gloss, matte, metallic, pearl, neon glow) and boost flame colours per car. New cars
  sit at the end of CARS so rivals (CARS[(k+1)%7]) and old saves are unchanged; the garage sorts by class.
- Tracks: Reverse and Mirror layouts for every circuit (ids like "gp:r", "gp:m"; Xtreme can't be reversed), layout
  tabs in race setup, records/ghosts per layout. Oil slicks (grip x0.35, tail wriggle, AI steers round) and wet patches
  (x0.72). New Medium track Coastal Highway: rain, wet reflective road (grip x0.86), double yellow line, telephone
  poles and wires, sea + beach on one side, cliffs and mountains on the other, tyre spray.
- Career: 20 events on a node map in chapters (Easy / Medium / Hard / Final), tap a node for details then Start.
  New types: Drift Attack (timed score), Knockout (last car out every 15 s), Boss battles (1v1 vs a legend in their
  own tuned car, a level above your difficulty; winning gives you the car: Ironhide 427, Razor LM, Tempest X).
  Inserting events never locks old progress (an event you already finished stays open).
- Local leaderboard per track layout (Week / Month / All, every finished lap logged in save.laps) and ghost codes:
  "Share my ghost" turns your best time-trial lap into a text code (delta-encoded, deflated, base64, ~2-4 KB);
  "Race a friend's ghost" loads one, and it races as an orange ghost next to yours. No server involved.
- Part 2: soft contact shadows under every car (stay on the ground and fade during jumps), rippling sea (wave normal
  map drawn once, scrolled), CSS vignette, gamepad support (stick/d-pad steer, A boost, triggers = pedals in Pro,
  pad 2 drives player 2), local 2-player split-screen for quick races (P1 A/D + W, P2 arrows + Up; side by side in
  landscape, stacked in portrait; P2 + 5 rivals; renderSplit draws the scene once per half, bloom off), Weather
  Dry/Rain for every track (rainy(theme) greys the sky/fog, wet shiny road, grip x0.86, rain streaks; the Coastal
  Highway is always wet; career events are dry unless they say so), brake lights flare when a car slows hard,
  cheaper far trees (one cone), open-ended trunks, lighter terrain grid (medium ~170-200k tris, ~220 draw calls).
- Part 3: rubber marks laid down in the braking zones, lap replay ("Watch best lap" puppets your car along the saved
  ghost with the chase cam; tap to exit), spoke blur discs on the wheels at speed, rival personality labels in the
  results, livery colour for decals, menu music starts on the first tap, rear number plates (made-up "APX 123 AB"),
  a real spotlight headlight for the player on night tracks (rivals keep the cheap fake beams).
- Part 4: Daily Challenge (career.js dailyEvent: seeded by the date, so everyone gets the same one with no server;
  race / drift attack / knockout on a random track, layout and weather; 900 coins + a gem once a day), Photo mode
  (pause > Photo mode: HUD hidden, drag/pinch/scroll to orbit, Save photo downloads a PNG from the canvas), Trophies
  (src/trophies.js, 14 (now 17) one-off achievements worth 300 coins each, listed at the bottom of the career map), near trees
  cast shadows on High quality.
- Part 5: Day/Night for every track (nightly(theme): dark sky with stars, cool moonlight, the player's spotlight
  headlight; combines with Rain as "Night rain"; career and cup races use their own time of day), Cup mode in race
  setup (Sunset Cup / Rough Roads Cup / Apex Masters: 3-4 races, points 10-8-6-5-4-3-2-1, prize in full for a win and
  half for a podium, best finish saved, "Silverware" trophy for a cup win).
- Part 6: rev counter arc + gear number over the speed (audio.js gearbox() shared with the engine sound), How to play
  screen from the menu, lifetime stats on the career map (races, wins, podiums, km, top speed, best drift), Settings >
  Camera shake and speed lines On/Off (Off by default with prefers-reduced-motion), Rockfall on mountain and canyon
  tracks (boulders drop ~200 m ahead with a warning every 22-36 s, seeded so physics stays deterministic; a hit costs
  45% of your speed; AI steers round them), boss intro message, slimmer/fainter braking-zone stripe.
- Part 7 (v2.0.0): garage shows top speed and 0-100 km/h (integrated from the physics' accel/drag formula), Share
  result button (Web Share sheet or clipboard; the game itself sends nothing), Low chase camera (Cam 1/2/3 = chase,
  low, bonnet), wet-look streets on Neon District, compact race options grid, version 2.0.0 and a one-time
  "What's new in 2.0" card (hidden in test mode).
- Review pass (a subagent read the whole overnight diff): fixed the Music slider (its listener had been pasted inside
  the mute handler), Day/Night listeners piling up on every track load, split-screen / P2 / boss cars leaking into
  replays and later races (cleared in toMenu), arrow keys staying with P2 after leaving split mode, 2-player offered on
  phones without two gamepads, solo runs counting as wins for trophies/stats, gamepad Start couldn't unpause, Reset
  progress leaving Pro keys and camera behind, silent replay engine, leftover rock hazards after a race, and "What's
  new" showing to brand-new players. Test added: an old 1.4-era save loads, keeps progress and races.
- Tests run on a frozen copy (scratchpad snaptest.sh, PW_PORT=4175) so edits during a 15-min run don't leak in.
  Don't run other heavy Playwright tests at the same time: CPU contention made a countdown time out once.
- Part 8: Frostbite Ridge (id frost, Medium, 2.9 km): winter valley theme with snow terrain, pines, falling snow
  (Rain with snow=true), three ice patches (grip x0.45, AI steers round), career event c15 "Frostbite" unlocked by Storm Run.
  Split-path road: hazards of type "split" (an island down the middle with chevron walls and a keep-left/right
  sign; tapered noses, TrackPath.islandHalf). Cars glance off it like a wall (Vehicle.hitWall), rivals pick a lane
  before the nose and keep it, the line steer and assist keep you in your lane, respawn never lands on it.
  First one on Red Canyon round the 60 m bend at 0.625.
- Part 9: time-trial medals (src/medals.js): gold = the flying lap of a tidy autopilot in the stock Vanta S1 with no
  boost (scripts/dev/medals.mjs, table per layout, a test checks it still matches the tracks), silver +8%, bronze +18%;
  150/300/600 coins the first time you reach each one (save.medals), medal times on the trial setup screen, medal card
  on the results. More split-path islands (Frostbite Ridge, Xtreme). Billboards were facing away from the road (you
  read them mirrored through the double-sided plane); they now face the road with a plain back panel.
- Part 10: snow actually shows now: rain/snow are placed after the camera moves each frame (they were a frame behind,
  which on a slow frame left the whole box behind the car), and flakes are one instanced mesh of tiny specks. Rival name tags no longer sit on top of each other (nearest first, others lifted above).
- Part 11: Settings > Speed mph / km/h (defaults to mph for en-GB / en-US browsers, km/h elsewhere and in test mode;
  speedo, split-screen boxes, garage top speed with 0-60 mph, stats), lap-by-lap times on the results with the best
  one in green.
- Part 12: weather sound (audio.js setWeatherSound: rain hiss + spray that grows with speed, spray only on wet-look
  roads, a low wind in the snow), career event a3 "Black Ice" (drift attack on Frostbite Ridge, 22 events now),
  How to play covers ice, splits, ramps, rocks and medals.
- Part 13 (second review pass, a subagent read parts 8-12): islands were also drawn as huge "wet" puddle blobs, the
  island's top faced down (invisible), and the tidy autopilot / rivals scraped along islands on bends. Fixes: skip
  split hazards in the puddle loop, flip the top's winding, TrackPath.islandNear/laneEdge (lane edge includes the
  chord's cut across the bend), a shorter aim near islands, and the auto-brake / AI take ~14% off near an island
  (a lane is tighter than the racing line). scripts/dev/islandhits.mjs counts island contacts: the autopilot is clean on
  every layout; rivals only brush it (<5 m/s) when side by side. Medal table regenerated.
- Settings > Show FPS: a small readout at the bottom (fps over half a second, render resolution %, draw calls)
  for checking performance on a real phone.
- Part 14: tenth car, Stormcrow 350 (Muscle, V8, scissor doors, 3,800 coins): a lighter, cheaper fastback that holds
  a slide better than the Ironhide. Appended to CARS so rival slots and old saves are unchanged.
- Part 15: wetter-looking wet roads: soaked asphalt is darker (x0.75 by day, x0.9 at night so neon and headlights
  still glow on it), smoother (roughness 0.14 by day) with flatter normals, and reflects the sky more (envMap x2).
  rainy() marks night rain with `dark` so it gets the night values.
- Part 16: the time-trial track picker shows the medal you've won on that layout next to its name.
- Part 17: the race screen opens on the mode you used last (Quick race / Time trial / Cup; save.settings.raceMode).
  Day/Night and Dry/Rain are hidden in Cup mode (cups always race by day, dry; the buttons did nothing there).

### Overnight summary (2026-10-09 19:05 → 2026-10-10 ~04:00 UTC), v2.0
16 tested parts, each pushed to `main` and deployed by CI. Every item on the R1–R10 plan is done.
- **Content:** 10 tracks, each with Normal / Reverse / Mirror layouts, Day/Night and Dry/Rain. New this night:
  Coastal Highway (always raining) and Frostbite Ridge (snow, ice). 10 cars in 4 classes; 22 career events; 3 cups;
  a daily challenge; 17 trophies; time-trial medals.
- **Feel:**
  - photo textures and terrain;
  - wet roads, rain, snow and weather sound;
  - procedural synthwave;
  - a Pro driving mode, gamepads and 2-player split-screen;
  - slipstream, a drift combo, hazards (oil, ice, puddles, rockfall, ramps, road splits);
  - mph / km/h; Show FPS.
- **Not done, and why:**
  - **Online leaderboards, global ghosts and online multiplayer** need a server and accounts, which the safety rules
    forbid. Instead there are local week/month/all-time boards, ghosts shared as text codes, and local split-screen.
  - **Real-device tuning:** handling, AI pace and frame rate are tuned headless. The FPS readout (Settings) exists so a
    real Pixel 7 run can confirm 60 fps. Medium is ~220-265 draw calls / 145-195k triangles on every track.
- **Ideas next:**
  - more split-path islands (they work on any layout via `hazards`);
  - a second Compact car;
  - a 2-worker CI if the runner gets faster (the suite is ~19 min on one worker).
