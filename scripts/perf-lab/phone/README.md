# Phone speed lab

Measures the Android app on a real phone, one step at a time: opening and closing the keyboard, the ☰ menu, Settings
and its popups, the skills drawer (opening and dragging its handle), Projects. Card #96; built 2026-11-02 because the
keyboard, Settings and drawer lag on a Galaxy Z Flip7 were being fixed by guesswork.

```bash
node scripts/perf-lab/phone/run.mjs --list                  # the steps
node scripts/perf-lab/phone/run.mjs --fresh                 # every step, 3× each, from a freshly started app
node scripts/perf-lab/phone/run.mjs keyboard-open --repeat 5
node scripts/perf-lab/phone/run.mjs skills-drawer-resize --page-js "<expression>"   # an experiment, recorded as one
node scripts/perf-lab/phone/run.mjs --compare perf-reports/phone/<a>.json perf-reports/phone/<b>.json
```

Needs: the phone on USB with debugging allowed, the **YouCoded Dev** copy (`com.youcoded.app.dev`, a debug build —
its page is inspectable) installed and in front, unlocked. Reports: `perf-reports/phone/<date>-<label>.{json,md}`.

## What each number is

| Number | Where it comes from |
|---|---|
| Shown late (Android) | `dumpsys gfxinfo` reset before the step: the frames Android itself counted janky, out of all it drew — includes what the page cannot see (the app's outer layer, the system putting the page on screen) |
| Slow / dropped frames, worst frame | the page's own frame clock (`requestAnimationFrame`), against the screen's measured rate (120 Hz on the Flip7) |
| Long frames | the browser's report of frames over 50 ms, with how much was script and how much style + layout |
| Tap response | Event Timing: finger to the next painted frame |
| Shows | finger to the first frame showing what the step waits for; **first time** is reported apart (screens that load their code on demand pay it then) |
| Page / graphics busy | a timeline recording (Chrome tracing): busy time of the page thread and the graphics thread — the recording itself adds some cost; `--no-trace` skips it |
| App CPU, memory | `/proc/<pid>/stat` (% of one core over the step) and `dumpsys meminfo` (PSS) |

## Rules it keeps

- **Never takes a picture.** It reads layout only to find what to tap.
- **Stops if the dev copy is not in front** (locked phone, notification shade, another app) — checked before every step.
- **Only the dev copy.** It is the only test copy and the inspectable one; Destin's own app is never touched.
- **No messages, no conversations.** The only chat it uses is an empty "New session".
- A step that could not be done (nothing to tap) is reported as **failed**, never as a fast result; `check` expressions
  confirm the step really happened (the keyboard really opened).

## Findings so far (2026-11-02, Z Flip7, Android 17, WebView 156)

- One full style check of the page costs 6–7 ms on a calm page — most of a 120 Hz frame — so anything that changes a
  variable on `<html>` every frame stutters. The keyboard glide now moves only what is visible and settles once.
- Dragging the skills drawer re-rendered and redrew the whole drawer per finger movement: 25 slow / 66 missed frames,
  ~1 s of graphics work. Sliding it instead: 6 slow / 11 missed. The first drag still costs one ~370 ms frame.
- Settings opens in ~50 ms warm and ~90 ms the first time (its code loads on demand).
