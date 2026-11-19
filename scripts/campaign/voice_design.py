#!/usr/bin/env python3
"""Design new narrator voices from a description (ElevenLabs voice design, v3) and save each preview.

    python3 voice_design.py <name> "<description>"

Each call returns a few different voices reading the full script; all are saved as
~/Videos/youcoded-campaign/voice/eleven/design-<name>-<n>.mp3 (+ .id with the generated voice id).
"""
import base64, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
KEY = open(os.path.expanduser("~/.config/youcoded-campaign/elevenlabs.key")).read().strip()
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice_eleven.py")).read()
SCRIPT = src.split('SCRIPT = """')[1].split('"""')[0]
name, desc = sys.argv[1], sys.argv[2]
body = {"voice_description": desc, "model_id": "eleven_ttv_v3", "text": SCRIPT, "auto_generate_text": False}
req = urllib.request.Request("https://api.elevenlabs.io/v1/text-to-voice/design", data=json.dumps(body).encode(),
                             headers={"xi-api-key": KEY, "Content-Type": "application/json"})
try:
    r = json.load(urllib.request.urlopen(req, timeout=400))
except urllib.error.HTTPError as e:
    sys.exit(f"{name}: HTTP {e.code} {e.read().decode()[:400]}")
for i, p in enumerate(r.get("previews", [])):
    base = os.path.expanduser(f"~/Videos/youcoded-campaign/voice/eleven/design-{name}-{i + 1}")
    open(base + ".mp3", "wb").write(base64.b64decode(p["audio_base_64"]))
    open(base + ".id", "w").write(p["generated_voice_id"])
    print(base + ".mp3", round(p.get("duration_secs", 0), 1), "s")
