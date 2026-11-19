#!/usr/bin/env python3
"""Record the narration in sections, each with its own performance direction, then join them.

    python3 voice_sections.py <voice> [<voice> ...]

WHY sections: one direction for the whole script came out at one speed and one mood. Each part
of the story wants a different energy, so each is recorded separately and joined with set pauses
(which also controls the total length). Output: ~/Videos/youcoded-campaign/voice/openai3/<voice>.wav
"""
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.expanduser("~/Videos/youcoded-campaign/voice/openai3")
BASE = ("You are the narrator of a grand British fairytale film: a natural-born storyteller with real "
        "character, Received Pronunciation, performing rather than reading. Read the user's text exactly, "
        "word for word, and nothing else. For this passage: ")
SECTIONS = [
    ("Once upon a time... a few companies built all the world's software.\n"
     "They decided what it did. What it cost. And who kept your data.\n"
     "And everyone else? Simply paid the rent.",
     # WHY no quoted words here: two voices read a quoted cue aloud as part of the line.
     "sly and conspiratorial, a twinkle in the voice, like letting the audience in on an old scandal. "
     "Unhurried but never slow, with a dry beat of silence after the question mark."),
    ("And then... something wonderful happened.\nAnyone could build software. Just by asking.",
     "start hushed, almost a whisper of wonder on 'And then...', then brighten with genuine delight; "
     "'Just by asking' lands lightly, with a smile you can hear."),
    ("A home that runs the way you live. Tools made for your work. A computer that, at last, feels like yours.\n"
     "And whatever you make, everyone can use, and make better.\n"
     "Not one company's app. Everyone's.\n"
     "On your devices. With any AI you like. Free, and open.",
     "quick, bright and building, the pace picking up phrase by phrase with mounting excitement, "
     "a proud beat on 'Everyone's.', then crisp and buoyant through the last line."),
    ("It's time to free ourselves from the tech monopolies of the past.\n"
     "It's time, at last... to open source everything.",
     "slow down. Rousing and heroic, full voice, as if announcing the end of an age. Let 'at last...' hang, "
     "then deliver 'to open source everything' with triumphant conviction."),
]
GAPS = [0.7, 0.6, 0.8, 0.0]  # seconds of silence after each section


def rec(voice, i):
    raw = os.path.join(OUT, f".{voice}-{i}.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "voice_openai.py"), voice, raw, SECTIONS[i][0], BASE + SECTIONS[i][1]],
                   check=True, capture_output=True)
    # Light polish only (Destin: the hall sounded like an echo chamber): trim, clean low end, gentle level.
    fin = os.path.join(OUT, f".{voice}-{i}.f.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af",
                    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                    "highpass=f=70,equalizer=f=160:t=q:w=0.9:g=1.5,acompressor=threshold=-20dB:ratio=2.5:attack=10:release=150:makeup=2dB,"
                    "aresample=48000", "-ac", "1", fin], check=True)
    return fin


os.makedirs(OUT, exist_ok=True)
for voice in sys.argv[1:]:
    with ThreadPoolExecutor(4) as ex:
        parts = list(ex.map(lambda i: rec(voice, i), range(len(SECTIONS))))
    inputs, flt = [], []
    for i, p in enumerate(parts):
        inputs += ["-i", p]
        flt.append(f"[{i}:a]apad=pad_dur={GAPS[i]}[p{i}]")
    flt.append("".join(f"[p{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[o]")
    out = os.path.join(OUT, f"{voice}.wav")
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(flt), "-map", "[o]", "-c:a", "pcm_s24le", out], check=True)
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True).stdout.strip()
    print(voice, d, "s")
