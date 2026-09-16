---
status: active
created: 2026-09-05
feature: voice prompting (docs/active/design/2026-09-05-voice-prompting/)
---

# Voice bench — try every candidate speech engine with your own voice

Destin's answer to the voice-prompting questions deck (Q-1, 2026-09-05) was "how good are these
local speech models actually tho? i kinda want to test before we commit". This is that test:
a page with a mic, every candidate engine behind it, on this machine, with a thread limiter to
imitate a slower laptop.

## Run

```bash
# one-time: a Python 3.12 venv (uv), the two runtimes, and the models (≈2.5 GB)
uv venv -p 3.12 <venv> && VIRTUAL_ENV=<venv> uv pip install sherpa-onnx pywhispercpp numpy soundfile
# models: see ENGINES in server.py — whisper.cpp ggml files from huggingface.co/ggerganov/whisper.cpp,
# sherpa-onnx folders from github.com/k2-fsa/sherpa-onnx/releases (asr-models, punctuation-models)

<venv>/bin/python docs/active/prototypes/voice-stt-bench/server.py --models <models dir>
# opens http://127.0.0.1:5240/  (loopback only; the browser allows the mic on localhost)
```

The session of 2026-09-05 kept both under its scratchpad (`stt-venv/`, `models/`); they are
disposable and are not committed.

## What the two modes tell you

- **Batch** answers Q-1 (which engine): every ticked engine hears the *same* recording, and
  the table shows its text, seconds taken, seconds-per-second-of-audio, and, if you read the
  sample paragraph, its word error rate against it.
- **Live** answers Q-2 (words while you talk) by showing the two ways to do it side by side:
  a true streaming engine (words land as you say them, plus a small punctuation model) versus
  a whole-message engine re-hearing the last stretch every second (the grey tail may shuffle).

## Findings

See `../../investigations/2026-09-05-local-speech-engines.md`.
