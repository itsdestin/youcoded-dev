#!/usr/bin/env python3
"""Record a narration with ElevenLabs v3 and save WHEN each word is spoken.

    python3 narrate.py <script.md> <voice_id> <name> [speed]

WHY the word times: the film puts each picture on the word it belongs to (Destin: the earlier
voice was "completely offbeat"), so the cut is built from <name>.words.json, never by ear.
Key: ~/.config/youcoded-campaign/elevenlabs.key (never argv/env, never printed).
Output: ~/Videos/youcoded-campaign/voice/round2/<name>.mp3 + <name>.words.json
"""
import base64, json, os, re, sys, urllib.request, urllib.error

KEY = open(os.path.expanduser("~/.config/youcoded-campaign/elevenlabs.key")).read().strip()
script, voice_id, name = sys.argv[1], sys.argv[2], sys.argv[3]
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
text = open(script).read().split("\n---\n", 1)[1].strip()
out = os.path.expanduser("~/Videos/youcoded-campaign/voice/round2")
os.makedirs(out, exist_ok=True)
body = {"text": text, "model_id": "eleven_v3", "voice_settings": {"stability": 0.0, "speed": speed}}
req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
                             data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=400))
except urllib.error.HTTPError as e:
    sys.exit(f"{name}: HTTP {e.code} {e.read().decode()[:400]}")
open(f"{out}/{name}.mp3", "wb").write(base64.b64decode(r["audio_base64"]))
al = r.get("alignment") or r.get("normalized_alignment")
chars, starts, ends = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
# Letters -> words, dropping the [acting cues], which are performed and never spoken.
words, cur, depth = [], None, 0
for c, s, e in zip(chars, starts, ends):
    if c == "[": depth += 1
    if depth == 0 and not c.isspace():
        cur = cur or {"w": "", "start": s}
        cur["w"] += c; cur["end"] = e
    elif cur:
        words.append(cur); cur = None
    if c == "]": depth = max(0, depth - 1)
if cur: words.append(cur)
json.dump(words, open(f"{out}/{name}.words.json", "w"), indent=0)
print(f"{out}/{name}.mp3", round(ends[-1], 1), "s,", len(words), "words")
