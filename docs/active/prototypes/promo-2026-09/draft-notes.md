---
status: active
---

# Promo video — draft review notes

What each review round of `scripts/promo/out/draft.mp4` found, and what was
changed because of it. Evidence per round: a one-frame-per-second contact sheet,
a before/after pair on every cut frame, and the three frames around the theme
flip (`/tmp/.../review.sh` regenerates them from the draft).

The checklist every round is judged against (from the build plan):

1. every cut lands on a downbeat
2. the theme flip lands on bar 23's first frame (composition frame 1403)
3. captions sit wholly inside the band and are readable at 960 px wide
4. the host never covers a tool card that is being read
5. the phone never covers the takeover dialog
6. the Flappy bird clears at least four pipes on screen
7. no clip runs out (a frozen last frame) before its beat ends

## Round 1 — 2026-09-03

Evidence: `out/review-1/contact.png` (70 tiles, one per second), the seven cut
pairs, the three flip frames, plus full-resolution frames pulled for each
suspicion. Five defects, all fixed; two of them are footage problems that the
edit can only mitigate.

**1. The cold open's peek was a smudge.** At the host's title-bar size of 120 px,
90 px of it showing over the bottom edge of an otherwise empty frame read as a
grey blob, not a character — and it sat in a large empty gap under the wordmark.
*Fix:* the peek comes up at 200 px and shrinks to 120 px on the hop onto the
title bar. The Mascot's cues already spring `size`, so this is three numbers, not
new code.

**2. Beat 4 ended on a dead game.** The Flappy trim ran 6 s past the point where
the recording's autopilot hits a pipe: the last two seconds of the beat were the
static "Press Space to fly" card. Measured: the game-over overlay replaces the
field at clip frame 815, 107 frames after the `fly` mark.
*Fix:* the flight shot is exactly those 107 live frames and the Games-menu shot
takes the other 143. *Not fixed, and not fixable here:* the run clears **one**
pipe before it crashes, and the checklist asks for four. The scene needs a
re-film with an autopilot that survives longer — filed in the task report.

**3. Beat 5 ended on an empty window.** 0.2 s after the dragged pill lands, the
recording switches to a blank new session; the old trim (drag start − 12) ran
into it, so the beat about which the caption says "Drag your conversations into
order" finished on an empty chat.
*Fix:* anchor the shot to the drag's RELEASE instead of its start — the beat now
ends on the frame the pill lands, which is also a better cut point.

**4. Beat 6 ended on a spinner.** Exactly what controller decision 3 warned
about, one cut point too early: at bar 3.5 the shot still ran 8 frames into
"Initializing session…". Measured: the dialog is replaced at clip frame 240,
eleven frames after the `takeover` mark ends.
*Fix:* cut at bar 3.75 (beat 4 of bar 19 — still on the grid) and derive the
trim backwards from frame 240, so the shot ends on the last frame before the
spinner. The dialog is up 0.43 s in, the click lands at 2.4 s, the cut is 0.37 s
after it.

**5. The theme flip was five frames early.** The backdrop and the host turned
gold on bar 23's first frame, but the app in the footage stayed dark for another
sixth of a second: the `flip` mark records when the scene FIRES the theme change,
and the app repaints after the eval's 200 ms settle. Measured: the window's
colour is identical through clip frame 347 and different at 348 — five frames
after the mark at 343.
*Fix:* a named `PAINT_LAG = 5` added to the mark before the trim is computed.

**Checked and correct in round 1** (no change): every beat starts on its
downbeat; the 6-frame slide begins on the downbeat and is complete six frames
later (verified frame by frame across the beat 3 → 4 cut); the phone never
overlaps the takeover dialog (phone x 1445–1780, dialog x 758–1174); captions sit
inside the band and are legible at 960 px; the host is never over a tool card;
the beat 7 and beat 8 still-tails loop with no visible seam.

## Round 2 — 2026-09-03

All five round-1 fixes verified on the re-rendered draft (`out/review-2/`):

- **Cold open** — the peek now reads as the character, hands gripping the bottom
  edge, and shrinks onto the title bar on the hop.
- **Beat 4** — the beat now opens on the Games menu (Flappy / 2048 / Connect 4 /
  Chess) and ends mid-flight with a pipe on screen and the game alive. The dead
  "Press Space to fly" card is gone.
- **Beat 5** — frame 975, the beat's last, shows the populated chat with the
  reordered session strip. The empty window is gone.
- **Beat 6** — frame 1280, the beat's last, shows the Resume Session list and
  "Reconnecting…" — the app responding to the click. "Initializing session…"
  never appears.
- **Beat 7 flip** — frames 1402 / 1403 / 1404: gold first appears on 1403, and
  the app, the backdrop and the host all turn on that one frame.

### Checklist status

| # | Item | Status |
|---|---|---|
| 1 | every cut on a downbeat | **holds** — verified against `startFrames`; the 6-frame slide begins on the downbeat and completes six frames later |
| 2 | the flip on bar 23's first frame | **holds** — frame 1403 |
| 3 | captions inside the band, readable at 960 px | **holds** |
| 4 | the host never covers a tool card | **holds** — the host is always on the title bar, outside the window's content area, including beat 3's lean to `perch(0.62)` |
| 5 | the phone never covers the takeover dialog | **holds** — phone x 1445–1780, dialog x 758–1174 |
| 6 | the Flappy bird clears at least four pipes | **FAILS — footage, not edit.** The recording's autopilot clears one pipe and hits the next at clip frame 815. The edit uses every live frame there is; the item needs a re-filmed `promo-flappy` whose autopilot survives longer |
| 7 | no clip runs out before its beat ends | **holds** — `assertClipCovers` throws at bundle time for beats 1–6, and beats 7/8 use `FootageWithStillTail` |

### One measured imperfection, left in

The beat 8 still-tail loop moves **0.12 %** of the frame's pixels at each seam
(603 of 518,400, max delta 177) — the golden theme's ambient dust sparkles
resetting every 2.3 s. Beat 7's seam moves 0.005 % (24 pixels, max delta 27) and
is not detectable. Both are below what reads as motion at 30 fps; the honest fix
is a longer `hold` on the last action of `promo-idle-golden`, not a longer loop.

### Not changed, and why

- **Beat 5 has no push-in**, per the plan ("the break is quiet so the motion
  reads"). The dragged pills are ~1.3 % of the frame's height, so the drag is
  small; a push-in ramps over 240 frames and this beat is 128, so it would reach
  1.6 % — imperceptible either way. Left as specified; flagging it as a judgment
  call for Destin rather than changing the plan's intent unasked.
- **Beat 7's first two bars show the reply streaming, not the typing.** The
  storyboard says the request is typed under bars 21–22, but the recording has
  7.5 s between the end of the typing and the flip, and the flip is nailed to bar
  23. Showing both at 1x is arithmetically impossible without a cut, and the spec
  requires beat 7 to be one continuous clip. The shot reads as the request sent
  and the assistant working, which is the same beat of the story.
