"""Makes the wing-deploy voice line: espeak-ng speech run through a robot effect, saved as assets/sfx/<name>.mp3.

Usage: python3 -I scripts/dev/robotvoice.py   (needs espeak-ng and ffmpeg; the output is shipped, the tools are not)
Effect chain: deep, slow, monotone speech -> a second voice an octave down (layered) -> ring modulation for the metallic
buzz -> a short comb filter (resonant "helmet") -> band-pass like a radio -> gentle bit-crush -> limiter.
"""
import subprocess, os, tempfile, wave
import numpy as np

LINES = {"wings": "Welcome aboard, Captain. All systems online.", "wings_off": "Landing gear engaged."}
SR = 22050


def speak(text, pitch):
    f = tempfile.mktemp(suffix=".wav")
    subprocess.run(["espeak-ng", "-v", "en-gb-x-rp", "-s", "128", "-p", str(pitch), "-a", "180", "-g", "4", "-w", f, text], check=True)
    with wave.open(f) as w:
        sr, x = w.getframerate(), np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    os.remove(f)
    if sr != SR:
        t = np.arange(int(len(x) * SR / sr)) * sr / SR
        x = np.interp(t, np.arange(len(x)), x)
    return x


def robot(text):
    a, b = speak(text, 22), speak(text, 0)
    n = max(len(a), len(b)); a = np.pad(a, (0, n - len(a))); b = np.pad(b, (0, n - len(b)))
    x = a * 0.7 + b * 0.55
    t = np.arange(n) / SR
    x = x * (0.55 + 0.45 * np.sin(2 * np.pi * 61 * t))  # ring mod
    d = int(SR * 0.0045)  # comb: metallic resonance
    y = x.copy()
    for k in range(1, 5): y[d * k:] += x[:-d * k] * (0.55 ** k)
    # band-pass 280 Hz - 3.4 kHz (FFT mask, soft edges)
    F = np.fft.rfft(y); f = np.fft.rfftfreq(len(y), 1 / SR)
    F *= np.clip((f - 180) / 100, 0, 1) * np.clip((3800 - f) / 600, 0, 1)
    y = np.fft.irfft(F, len(y))
    y = np.round(y * 48) / 48  # bit-crush
    y = np.tanh(y / (np.abs(y).max() + 1e-6) * 1.8) * 0.85
    tail = np.zeros(int(SR * 0.35)); return np.concatenate([np.zeros(int(SR * 0.05)), y, tail])


os.makedirs("assets/sfx", exist_ok=True)
for name, text in LINES.items():
    y = robot(text)
    tmp = tempfile.mktemp(suffix=".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-b:a", "48k", f"assets/sfx/{name}.mp3"], check=True)
    os.remove(tmp)
    print(name, f"{len(y) / SR:.1f}s", os.path.getsize(f"assets/sfx/{name}.mp3") // 1024, "KB")
