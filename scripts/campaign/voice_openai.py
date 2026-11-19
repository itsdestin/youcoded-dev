#!/usr/bin/env python3
"""Narration through OpenRouter (OpenAI gpt-audio), steered with a direction prompt.

    python3 voice_openai.py <voice> <out.wav> "<line>" ["<direction>"]

The key is read from ~/.config/youcoded-campaign/openrouter.key (never argv or env, never printed).
WHY streaming: OpenRouter returns audio output only as a stream of pcm16 chunks.
"""
import base64, json, os, sys, urllib.request, wave

KEY = open(os.path.expanduser("~/.config/youcoded-campaign/openrouter.key")).read().strip()
voice, out, line = sys.argv[1], sys.argv[2], sys.argv[3]
direction = sys.argv[4] if len(sys.argv) > 4 else (
    "You are the narrator of a classic British storybook: warm, wry, unhurried, quietly delighted. "
    "Received Pronunciation. Read the user's text exactly, word for word, and nothing else.")
body = {
    "model": "openai/gpt-audio", "modalities": ["text", "audio"], "stream": True,
    "audio": {"voice": voice, "format": "pcm16"},
    "messages": [{"role": "system", "content": direction},
                 {"role": "user", "content": f"Read this aloud exactly:\n\n{line}"}],
}
req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=json.dumps(body).encode(),
                             headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
                                      "X-Title": "campaign narration"})
pcm, text = b"", ""
with urllib.request.urlopen(req, timeout=180) as r:
    for raw in r:
        raw = raw.decode().strip()
        if not raw.startswith("data:") or raw == "data: [DONE]":
            continue
        ch = json.loads(raw[5:])
        for c in ch.get("choices", []):
            a = (c.get("delta") or {}).get("audio") or {}
            if a.get("data"):
                pcm += base64.b64decode(a["data"])
            if a.get("transcript"):
                text += a["transcript"]
        if ch.get("usage"):
            u = ch["usage"]
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
print(f"{out}: {len(pcm) / 48000:.2f} s | said: {text.strip()}")
