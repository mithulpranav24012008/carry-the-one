# Cuts the machine's sounds out of two archive recordings into one sheet.
# Usage: python3 sounds/build.py <brunsviga.wav> <keystrokes.wav>   (mono, 44.1 kHz, high-passed)
# Brunsviga Nova 13Z: Antti Makkonen, Antti Hannunen, Sounds of Changes, CC BY 3.0.
# Keystrokes in a vintage mechanical calculator: Subhashish Panigrahi, CC BY-SA 4.0.
import array, json, sys, wave

def load(path):
    w = wave.open(path)
    return array.array("h", w.readframes(w.getnframes())), w.getframerate()

b, sr = load(sys.argv[1])
k, _ = load(sys.argv[2])

# (name, source, start, end, peak): times in seconds, read from the waveform and the footage.
CUTS = [
    ("crank", b, 10.56, 11.72, 0.62), ("crank", b, 13.66, 14.72, 0.62), ("crank", b, 16.37, 17.30, 0.62),
    ("crank", b, 19.02, 20.00, 0.62), ("crank", b, 21.28, 22.42, 0.62),
    ("home", b, 9.17, 9.46, 0.42), ("home", b, 12.44, 12.66, 0.42), ("home", b, 15.40, 15.68, 0.42), ("home", b, 18.02, 18.22, 0.42),
    ("lever", b, 24.99, 25.32, 0.5), ("shift", b, 26.32, 26.82, 0.62), ("clear", b, 27.66, 28.26, 0.62),
    ("keydown", k, 9.31, 9.50, 0.8), ("keydown", k, 10.38, 10.58, 0.8), ("keydown", k, 11.45, 11.66, 0.8), ("keydown", k, 16.92, 17.12, 0.8),
    ("keyup", k, 9.60, 9.77, 0.5), ("keyup", k, 10.69, 10.89, 0.5), ("keyup", k, 11.77, 11.90, 0.5), ("keyup", k, 17.25, 17.37, 0.5),
]
GAP = int(sr * 0.02)
out = array.array("h")
table = {}
for name, source, start, end, peak in CUTS:
    part = source[int(start * sr):int(end * sr)]
    top = max(abs(x) for x in part) or 1
    gain = peak * 32767 / top
    n = len(part)
    fade_in, fade_out = int(sr * 0.004), int(sr * 0.03)
    at = len(out)
    for i, x in enumerate(part):
        env = min(1, i / fade_in, (n - i) / fade_out)
        out.append(max(-32767, min(32767, int(x * gain * env))))
    out.extend([0] * GAP)
    strike = max(range(n), key=lambda i: abs(part[i]))
    table.setdefault(name, []).append([round(at / sr, 4), round(n / sr, 4), round(strike / sr, 4)])

w = wave.open("public/sounds/machine.wav", "wb")
w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(out.tobytes()); w.close()
open("src/machine/sound-map.js", "w").write("// Written by sounds/build.py. Each entry is [offset, length, strike] in seconds.\nexport const SHEET = " + json.dumps(table) + ";\n")
print(round(len(out) / sr, 1), "s,", {k: len(v) for k, v in table.items()})
