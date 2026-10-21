"""Turns Poly Haven 'pure sky' HDRIs (CC0) into the game's sky images and lighting data.

Usage: python3 -I scripts/dev/skies.py <folder with *.hdr> [out name=hdr name ...]
For each HDR it writes assets/sky/<name>.jpg (tone-mapped, the upper part of the equirectangular image only) and
prints a JS entry for src/skies.js: where the sun is, its colour, and the average horizon / zenith colours, so the
game's sun light, fog and ambient light match the photo.
Equirect convention (shared with the sky shader in src/scene.js): u = 0.5 + atan(d.x, -d.z) / 2pi, v = 0.5 - asin(d.y) / pi.
"""
import sys, os, math, json
import numpy as np
from PIL import Image

OUT_W, KEEP = 2560, 0.56
# per-sky exposure trim: low suns blow out to white at the median-based exposure, so sunsets get less light
EXPO = {"qwantani_sunset": 0.4, "industrial_sunset_02": 0.45, "qwantani_late_afternoon": 0.7, "snow_field": 0.85}  # width of the jpg, and how much of the image (from the top) to keep: sky plus a bit below the horizon


def read_hdr(path):
    with open(path, "rb") as f:
        data = f.read()
    i = 0
    while True:  # header lines up to an empty line
        j = data.index(b"\n", i)
        line = data[i:j]
        i = j + 1
        if line == b"":
            break
    j = data.index(b"\n", i)
    dims = data[i:j].split()
    i = j + 1
    h, w = int(dims[1]), int(dims[3])
    img = np.zeros((h, w, 4), np.uint8)
    buf = np.frombuffer(data, np.uint8)
    for y in range(h):
        if buf[i] == 2 and buf[i + 1] == 2:  # new-style RLE scanline
            i += 4
            for c in range(4):
                x = 0
                row = img[y, :, c]
                while x < w:
                    n = int(buf[i]); i += 1
                    if n > 128:
                        n -= 128
                        row[x:x + n] = buf[i]; i += 1
                    else:
                        row[x:x + n] = buf[i:i + n]; i += n
                    x += n
        else:  # flat
            img[y] = buf[i:i + w * 4].reshape(w, 4); i += w * 4
    e = img[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float32) * scale[..., None]


def aces(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def main():
    folder, names = sys.argv[1], sys.argv[2:]
    os.makedirs("assets/sky", exist_ok=True)
    out = {}
    for f in sorted(os.listdir(folder)):
        if not f.endswith(".hdr"):
            continue
        name = f[:-4].replace("_puresky", "")
        hdr = read_hdr(os.path.join(folder, f))
        h, w, _ = hdr.shape
        lum = hdr @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        # sun: the brightest spot in the upper half
        upper = lum[: h // 2]
        sy, sx = np.unravel_index(np.argmax(upper), upper.shape)
        u, v = (sx + 0.5) / w, (sy + 0.5) / h
        az, el = (u - 0.5) * 2 * math.pi, (0.5 - v) * math.pi
        sun = [math.sin(az) * math.cos(el), math.sin(el), -math.cos(az) * math.cos(el)]
        sun_rgb = hdr[max(0, sy - 3): sy + 4, max(0, sx - 3): sx + 4].reshape(-1, 3).mean(0)
        sun_rgb = sun_rgb / max(1e-6, sun_rgb.max())
        # exposure: put the median sky brightness at a comfortable mid grey
        sky_med = float(np.median(lum[: int(h * 0.45)]))
        expo = 0.42 / max(1e-4, sky_med) * EXPO.get(name, 1.0)
        ldr = srgb(aces(hdr * expo))
        keep = int(h * KEEP)
        im = Image.fromarray((ldr[:keep] * 255 + 0.5).astype(np.uint8))
        im = im.resize((OUT_W, int(keep * OUT_W / w)), Image.LANCZOS)
        im.save(f"assets/sky/{name}.jpg", quality=80, optimize=True, progressive=True)
        horizon = ldr[int(h * 0.47): int(h * 0.5)].reshape(-1, 3).mean(0)
        zenith = ldr[: int(h * 0.12)].reshape(-1, 3).mean(0)
        hx = lambda c: "0x%02x%02x%02x" % tuple(int(min(255, max(0, round(x * 255)))) for x in c)
        out[name] = {"sun": [round(x, 3) for x in sun], "sunColor": hx(sun_rgb), "horizon": hx(horizon), "zenith": hx(zenith),
                     "sunElev": round(math.degrees(el), 1), "kb": os.path.getsize(f"assets/sky/{name}.jpg") // 1024}
        print(name, out[name], file=sys.stderr)
    print(json.dumps(out, indent=1))


main()
