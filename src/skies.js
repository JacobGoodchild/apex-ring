// Photographic skies (Poly Haven 'pure sky' HDRIs, CC0), tone-mapped to assets/sky/<name>.jpg by scripts/dev/skies.py.
// For each: where the sun is in the photo, its colour, and the average horizon and zenith colours, so the game's sun light,
// fog and ambient light match the picture. keep = how much of the equirect image (from the top) the jpg holds.
export const SKY_KEEP = 0.56;
export const SKIES = {
  industrial_sunset_02: { sun: [0.587, 0.038, -0.809], sunColor: 0xff1e00, horizon: 0x94a0aa, zenith: 0x447dad, sunElev: 2.2 },
  kloofendal_38d_partly_cloudy: { sun: [0.463, 0.614, -0.639], sunColor: 0xfff3dc, horizon: 0xe2e5e6, zenith: 0x97aec9, sunElev: 37.9 },
  kloofendal_48d_partly_cloudy: { sun: [0.377, 0.742, -0.555], sunColor: 0xfdffe8, horizon: 0xcccfd8, zenith: 0xbac6d9, sunElev: 47.9 },
  kloofendal_misty_morning: { sun: [0.482, 0.699, -0.527], sunColor: 0xdae6ff, horizon: 0xaeaeb1, zenith: 0xbcc5d1, sunElev: 44.4 },
  kloofendal_overcast: { sun: [0.452, 0.393, -0.801], sunColor: 0xffe1be, horizon: 0xa7abb2, zenith: 0xbbc4d0, sunElev: 23.1 },
  qwantani_late_afternoon: { sun: [0.557, 0.327, -0.763], sunColor: 0xffcd92, horizon: 0xdedfdf, zenith: 0x85a1be, sunElev: 19.1 },
  qwantani_sunset: { sun: [0.584, 0.106, -0.805], sunColor: 0xff5806, horizon: 0xd0cabf, zenith: 0x53739b, sunElev: 6.1 },
  snow_field: { sun: [0.658, 0.286, -0.697], sunColor: 0xffb664, horizon: 0xaeaeac, zenith: 0xbababa, sunElev: 16.6 },
};
