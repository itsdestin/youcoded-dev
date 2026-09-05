---
status: active
created: 2026-09-05
feature: voice prompting — docs/active/design/2026-09-05-voice-prompting/
answers: Q-1 of voice-prompting.questions.json ("how good are these local speech models actually tho?")
---

# Local speech-to-text engines, tested on this machine

Destin's Q-1 answer on the voice questions deck was: *how good are these local speech models
actually, what hardware do they need, who are the competitors, which are best and worst for us?*
This is the answer. Everything measured here ran on the Z13 (16-core Ryzen AI Max, 128 GB),
**on the CPU only**, with the thread count capped to imitate cheaper laptops. The hands-on
half is `docs/active/prototypes/voice-stt-bench/` — a page with a mic where every engine below
hears the same recording of your voice.

## The short version

- **Whisper, the famous one, is the wrong pick for dictation on a CPU.** Its accurate model
  (large-v3-turbo) took 25 s to hear a 33 s message at 4 threads. Its small "about 150 MB"
  model is fast but makes the most mistakes of the field. Whisper only makes sense with a
  graphics chip doing the work, which a student laptop may not have.
- **NVIDIA's Parakeet TDT 0.6B v3 is the best fit.** Punctuates and capitalises by itself,
  25 European languages, hears a 33 s message in 0.8 s at 4 threads (1.2 s at 2), published
  accuracy better than any Whisper, free licence. Cost: a 464 MB download, not 150.
- **Moonshine v2 is the small alternative.** 106 MB, English (other languages as separate
  packs), fastest of all, but it can only hear about 8 s at a time, so the recording has to be
  cut at pauses first, and its punctuation and capitals wobble at the cuts.
- **Live words while you talk (Q-2) is cheap either way.** Parakeet re-hears everything since
  the last pause in about 70 ms per pass, so a pass every half second costs little. A true
  streaming model (NVIDIA FastConformer, 101 MB) shows words the instant they are said and
  never rewrites them, but needs a small extra punctuation model and is English-only.
- **One runtime ships all of them, on every platform.** Every non-Whisper engine above runs
  in sherpa-onnx, which has ready-made packages for Node (Windows, Mac, Linux) and Android
  (Kotlin). Whisper needs whisper.cpp, which has no prebuilt Linux or Mac binaries — we would
  build and ship them ourselves. sherpa-onnx can also run Whisper models, so choosing it does
  not close that door.

## What was measured

Same 33 s clip through every engine, three CPU budgets. "Took" is the wait after you stop
talking; "× realtime" is took ÷ clip length, so 0.025× means a 10 s message appears in a
quarter of a second.

| Engine | Download | Languages | Punctuation | 2 threads (weak laptop) | 4 threads (typical) | 16 threads (this machine) |
|---|---|---|---|---|---|---|
| Whisper base | 141 MB | 99 | yes | 2.8 s · 0.086× | 1.4 s · 0.041× | 0.6 s · 0.019× |
| Whisper small | 465 MB | 99 | yes | 8.9 s · 0.27× | 4.4 s · 0.13× | 2.2 s · 0.066× |
| Whisper large-v3-turbo (q5) | 547 MB | 99 | yes | 45 s · 1.4× | 25 s · 0.76× | 10 s · 0.31× |
| **Parakeet TDT 0.6B v3** | 464 MB | 25 | yes, built in | 1.2 s · 0.037× | 0.8 s · 0.025× | 0.9 s · 0.028× |
| Moonshine base v2 | 106 MB | English (+ packs) | mostly | 0.5 s · 0.016× | 0.3 s · 0.010× | 0.5 s · 0.016× |
| Moonshine base v1 | 239 MB | English | **none** | 0.9 s · 0.026× | 0.7 s · 0.022× | 0.9 s · 0.026× |
| Qwen3-ASR 0.6B | 837 MB | 52 | yes | 4.0 s · 0.12× | 3.1 s · 0.094× | 4.6 s · 0.14× |

Two things the table shows that a spec sheet does not. Parakeet and Moonshine do not get
faster with more cores, so a weak laptop is nearly as good as this one; Whisper does scale,
which is why it is fine on big machines and painful on small ones. And Qwen3-ASR is a small
language model that listens: on the repeated clip it quietly dropped a repeated sentence,
which is exactly the kind of "helpful" rewriting dictation must never do.

Live mode, measured on the same clip fed in 300 ms pieces at 4 threads:

| Live technique | Model | Words appear | Rewrite while talking? | Notes |
|---|---|---|---|---|
| True streaming | NVIDIA FastConformer 480 ms + punctuation model (101 + 29 MB) | ~0.5 s after you say them | never | English only; punctuation added by a second small model, read in the bench as correct |
| Re-hear chunks | Parakeet v3 | each pass ~70 ms | last few words may shuffle | one model does both jobs; the Q-2 "grey tail" experience |
| True streaming | Zipformer streaming (54 MB, 2025) | ~0.5 s | never | misheard "so" as "saw" on the first word; out |

## Accuracy

Published accuracy (Hugging Face Open ASR leaderboard, average word error rate across eight
English test sets, lower is better): Parakeet TDT 0.6B v3 **6.3 %**, Whisper large-v3
**7.4 %**, Whisper large-v3-turbo **7.75 %**. Whisper base and small are well behind those
(they are not on the leaderboard; expect roughly double the errors on real-world audio).
Moonshine claims to beat Whisper large-v3 with six times fewer parameters on standard
benchmarks. Qwen3-ASR 1.7B posts 5.76 %; the 0.6B tested here is not listed.

On the one real clip (Kennedy's "ask not…" line, 11 s): Parakeet, Whisper turbo and Qwen3
were word-perfect with correct punctuation; Whisper base and small were word-perfect;
Moonshine v2 was word-perfect but capitalised "What" mid-sentence where the bench had cut
the audio; Moonshine v1 gave the words with no punctuation at all. **Destin's own recordings
in the bench are the real accuracy test** — the sample paragraph there has a dollar amount, a
row number, a name and a time, which is what dictating to an assistant actually sounds like.

## The wider field, and why the rest are out

| Model | Why not (for a dictation box on a laptop) |
|---|---|
| Cohere Transcribe 2B (Mar 2026) | Top of the leaderboard at 5.42 %, 14 languages, free licence, but 1.6 GB and built for servers. |
| IBM Granite Speech 4.1 2B (May 2026) | 5.33 %, punctuates, but a 2B-parameter model needing a graphics chip to be quick. |
| NVIDIA Canary-Qwen 2.5B | 5.63 %, English only, graphics chip. |
| Mistral Voxtral Mini 4B Realtime (Feb 2026) | True streaming, 13 languages, free licence, but "a single 16 GB GPU". |
| Kyutai STT 1B / 2.6B | True streaming, but English/French only and built for GPU serving. |
| Meta Omnilingual ASR | 1,600 languages; the 300M version is 279 MB in sherpa-onnx. Worth a look only if the language list ever matters more than punctuation, which it does not produce. |
| Vosk, older Zipformer packs | 2023-era; no punctuation; measurably less accurate. |
| Picovoice Cheetah | On-device streaming with punctuation, but a commercial licence. |
| The phone's built-in recogniser | Not a laptop option; on Android it is the Q-6 pick. |
| Cloud (OpenRouter audio-capable models) | Q-1 option (b): Claude cannot hear audio, so Claude-only users would get no mic; voice leaves the machine; per-minute cost. |

## Hardware needs, in plain terms

- **Memory:** the model's download size plus about 200 MB while it works. Parakeet needs about
  700 MB of free memory; Moonshine v2 about 300 MB. Any laptop from the last eight years has it.
- **Processor:** Parakeet at 2 threads hears a 10 s message in 0.4 s. There is no laptop
  YouCoded runs on where that is a problem. The Whisper family is the only one where the
  processor matters, and its good model needs a graphics chip.
- **Graphics chip:** not needed for the recommendation. It would make Whisper turbo usable
  (whisper.cpp has Vulkan and CUDA builds), at the price of shipping and testing per-GPU
  binaries, which is what the local chat engine already costs us.
- **Disk:** 464 MB (Parakeet) or 106 MB (Moonshine v2), once. Language packs later if wanted.

## What this changes in the deck's framing

Q-1 option (a) said "about 150 MB". The 150 MB engine (Whisper base) is the weakest tested.
The engine worth shipping is 464 MB; the engine that fits the 150 MB promise is Moonshine v2
at 106 MB with the 8 s ceiling and English-only. Both are fine downloads next to a local
chat model, but the first-run card (Q-5) should say the real number.

## Recommendation

Ship **Parakeet TDT 0.6B v3 through sherpa-onnx**: one runtime for desktop (Node package)
and, if Q-6's built-in recogniser ever disappoints, Android (Kotlin package); punctuation and
capitals for free; live words by re-hearing every half second; no graphics chip needed. Offer
Moonshine v2 later as a "small download" option only if 464 MB draws complaints. Keep Whisper
out of the first version.

Destin decides after the bench: tap the mic, read the sample paragraph, compare the rows,
then try the Live tab to feel the two live techniques.
