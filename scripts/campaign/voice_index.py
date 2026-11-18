#!/usr/bin/env python3
"""Index every generated narration take: film/src/voices.json = {"<engine>/<voice>": {"<line id>": seconds}}.
The film reads it to duck the music under each line and to list the voices it can render."""
import json, os, subprocess
root = os.path.expanduser("~/Videos/youcoded-campaign/voice")
out = {}
for eng in sorted(os.listdir(root)):
    for v in sorted(os.listdir(os.path.join(root, eng))):
        d = os.path.join(root, eng, v)
        if not os.path.isdir(d):
            continue
        ent = {}
        for f in sorted(os.listdir(d)):
            if f.endswith(".wav"):
                r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0",
                                    os.path.join(d, f)], capture_output=True, text=True)
                ent[f[:-4]] = round(float(r.stdout.strip()), 3)
        if ent:
            out[f"{eng}/{v}"] = ent
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "film/src/voices.json"), "w"), indent=1)
print(list(out))
