#!/usr/bin/env python3
"""Narration with ElevenLabs v3 (performance cues in [brackets] are acted, not spoken).

    python3 voice_eleven.py <voice_id> <name> [stability]

Key: ~/.config/youcoded-campaign/elevenlabs.key (never argv/env, never printed).
Output: ~/Videos/youcoded-campaign/voice/eleven/<name>.mp3
"""
import json, os, sys, urllib.request

KEY = open(os.path.expanduser("~/.config/youcoded-campaign/elevenlabs.key")).read().strip()
voice_id, name = sys.argv[1], sys.argv[2]
stability = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0  # v3: 0 = most expressive ("creative")

# (mp3_44100_128: higher bitrates need the Creator plan.)
# WHY cues: one flat read was the problem with every earlier voice. The cues ask for a different
# energy per beat of the story (sly, hushed, delighted, rousing).
SCRIPT = """[mischievously] Once upon a time... a few companies built all the world's software.
[dryly] They decided what it did. What it cost. And who kept your data.
[conspiratorial] And everyone else? [short pause] Simply paid the rent.

[whispers] And then... [warmly, with wonder] something wonderful happened.
[delighted] Anyone could build software. Just by asking.

[excited, picking up pace] A home that runs the way you live. Tools made for your work. A computer that, at last, feels like yours.
And whatever you make, everyone can use, and make better.
[proudly] Not one company's app. Everyone's.
[brightly] On your devices. With any AI you like. Free, and open.

[slowly, rousing] It's time to free ourselves from the tech monopolies of the past.
[triumphant] It's time, at last... to open source everything."""

body = {"text": SCRIPT, "model_id": "eleven_v3", "voice_settings": {"stability": stability}}
req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
                             data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
try:
    audio = urllib.request.urlopen(req, timeout=300).read()
except urllib.error.HTTPError as e:
    sys.exit(f"{name}: HTTP {e.code} {e.read().decode()[:300]}")
out = os.path.expanduser(f"~/Videos/youcoded-campaign/voice/eleven/{name}.mp3")
open(out, "wb").write(audio)
print(out)
