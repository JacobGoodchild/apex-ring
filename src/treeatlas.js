// Tree impostors baked by scripts/dev/impostors.mjs from Poly Haven CC0 models (see CREDITS.md).
// Cells of 256x512 (8 per row) in assets/trees/atlas.webp; base = where the ground sits (fraction up from the cell bottom);
// extent = how many metres tall the cell is, height = the tree's real height.
export const TREE_COLS = 8, TREE_ROWS = 2;
export const TREE_CELLS = [
  { key: "pine", cell: 0, base: 0.010, extent: 19.30, height: 18.93 },
  { key: "pine", cell: 1, base: 0.010, extent: 14.34, height: 14.06 },
  { key: "pine", cell: 2, base: 0.010, extent: 14.81, height: 14.52 },
  { key: "fir", cell: 3, base: 0.090, extent: 10.76, height: 8.83 },
  { key: "fir", cell: 4, base: 0.052, extent: 8.71, height: 7.80 },
  { key: "fir", cell: 5, base: 0.164, extent: 8.79, height: 5.91 },
  { key: "broad", cell: 6, base: 0.244, extent: 9.83, height: 5.03 },
  { key: "broad", cell: 7, base: 0.302, extent: 8.58, height: 3.41 },
  { key: "quiver", cell: 8, base: 0.010, extent: 2.77, height: 2.72 },
];
