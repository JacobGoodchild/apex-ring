// Race setup shared by the game and the tests: difficulty levels, grid slots and rival car tuning.

// pace: share of the ideal corner speed rivals carry; brake: how late they brake (lower = earlier);
// mistakes: how often they slip up; boost: how well they use boost; catchUp: rivals ease off when you fall behind.
export const LEVELS = {
  easy: { pace: 0.69, brake: 0.92, mistakes: 2.5, boost: 0.25, catchUp: 1 },
  normal: { pace: 0.735, brake: 0.96, mistakes: 1.3, boost: 0.7, catchUp: 0.3 },
  hard: { pace: 1.0, brake: 1.03, mistakes: 0.6, boost: 1, catchUp: 0 },
};
export const levelOf = (name) => LEVELS[name] || LEVELS.easy;

// Grid slots: two columns, staggered. The player starts near the back so there's a field to race through.
export function slot(k) { const row = Math.floor(k / 2), col = k % 2; return [-7 - row * 9 - col * 4.5, col ? -3.6 : 3.6]; }

// Rivals drive their own cars, tuned halfway toward the player's so upgrades help without breaking races.
export function rivalSpec(base, player) {
  return Object.fromEntries(Object.keys(base).map((k) => [k, base[k] * 0.45 + player[k] * 0.55]));
}

// Corner-speed margin for the player's auto-brake by level: Easy brakes earliest.
export const AUTO_BRAKE = { easy: 0.9, normal: 1.0, hard: 1.06 };

// Steering-assist strength when the setting is Auto: full on Easy, a bit lighter on Medium, off on Hard.
export const AUTO_ASSIST = { easy: 0.55, normal: 0.45, hard: 0 };
