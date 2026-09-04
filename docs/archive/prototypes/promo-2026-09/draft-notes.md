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

## Round 3 — 2026-09-03

Two scenes were re-filmed between rounds (`promo-flappy` with an in-page pilot,
`promo-theme` and `promo-idle-golden` with longer final holds), so this round is
mostly about spending that footage and removing the workarounds the short takes
forced. Evidence: `out/review-3/` — a 69-tile contact sheet, the three flip
frames with their mean frame colour, beat 4 sampled every 15 frames with the
in-game PIPES counter cropped out at 4x, the bar-10 cut frame by frame, and the
last frames of beats 7 and 8.

**1. Beat 4 no longer has a hand-measured constant.** `FLIGHT_FRAMES = 107` was
the frame the old autopilot crashed on — the one thing the plan forbids. It is
gone with the footage that needed it. Both shots are now marks: the menu from
the `games` mark, the flight from the `fly` mark, and `FLIGHT` is a plain design
number saying how much of the 248-frame beat the flight gets.

**2. Beat 4's menu shot showed no menu.** Found on the first round-3 render, not
predicted: anchoring shot A to `markFrame('games', 'start', -6)` gave 2.8 s of
an empty chat. The `games` mark records when the click FIRES (13.57 s), and the
Games panel is still loading two seconds later — it only paints its four cards
(Flappy / 2048 / Connect 4 / Chess) at about 16 s.
*Fix:* anchor shot A to the mark's **end** edge instead of its start. The shot
now opens on "Loading games…" and holds the four cards. No offset, no measured
frame — the other edge of the same mark.

**3. Beat 4 cleared three pipes, and the checklist asks for four.** Also found
on the first round-3 render. The re-filmed pilot clears seven pipes in 9.5 s,
but not evenly: measured off the in-game counter, it reads 0 at the launch, 1 at
~100 frames, 3 at 165 and 4 from ~184 frames on. The 165-frame flight the round
opened with therefore ended on 3 — the re-film's whole point, missed by 19
frames.
*Fix:* `FLIGHT = 200`. The counter reads 4 from composition frame 845 and holds
it through the beat's last frame, and the menu still gets 48 frames (1.6 s),
which is a readable shot. **Checklist item 6 now passes for the first time.**
*Honest caveat:* "4" is only on screen for the last 0.3 s of the beat. The bird
visibly passes four pipes across the 6.7 s shot, which is what the item asks,
but the counter itself is not a lingering read. Buying more would cost the menu
shot; this beat cannot hold both.

**4. Beats 7 and 8 run on real footage end to end.** The re-filmed holds are
12.4 s and 11.4 s, so `assertClipCovers` passes with a plain `<Footage>` and the
`FootageWithStillTail` loop is deleted — nothing else used it, so the component
is gone from `Footage.tsx` too. Round 2's measured seam (0.12 % of beat 8's
pixels moving at each loop point) is moot: there are no seams. Last frames
checked at 1760/1766/1768 and 2060/2070/2074 — live picture, no freeze, no
black.
*Watch this:* beat 7 now covers its 492 frames with **one frame to spare**. Any
future change to `CUT`, to `PAINT_LAG`, or to where bar 23 falls will fail the
assert. That is the assert doing its job, but it means `promo-theme` has no
headroom left.

**5. The theme flip's paint lag moved with the re-film.** `PAINT_LAG` was 5 for
the old take. Re-measured on the new one: the frame's mean colour is
0.071/0.091/0.117 through clip frame 345 and 0.364/0.398/0.425 at 346, and
`markFrame` rounds the 11.342 s mark to 340 — so the lag is **6**. Verified on
the render: composition frames 1401 and 1402 are dark, 1403 is gold, and the
app, the backdrop and the host all turn on that one frame. **Checklist item 2
still holds.**

**6. Cuts were reading late; `CUT` is now 4 frames.** A 6-frame slide that
starts on the downbeat is only half done 100 ms after it, so the eye registered
the change after the beat rather than on it. At 4 frames (133 ms) the slide
still reads as a move rather than a jump cut. Verified frame by frame at bar 10:
608–610 are the outgoing shot, 611–613 slide, 614 is the incoming shot clean.
No lead-in offset was added, so beat 7's flip and beat 8's link are untouched,
and the whoosh stays at `barFrame(b) - 2`.

**7. Every beat's own length now derives from `CUT`.** Beats 2–7 each carried
their own `+ 6`, copied from the constant. Changing `CUT` would have left six
beats computing a length two frames too long — and `assertClipCovers` would have
been checking the wrong number. They now import `CUT`. This was latent, not
introduced by this round.

### Checklist status

| # | Item | Status |
|---|---|---|
| 1 | every cut on a downbeat | **holds** — `startFrames` is pinned by a test; verified frame by frame at bar 10 with the new 4-frame slide |
| 2 | the flip on bar 23's first frame | **holds** — dark at 1402, gold at 1403 |
| 3 | captions inside the band, readable at 960 px | **holds** |
| 4 | the host never covers a tool card | **holds** |
| 5 | the phone never covers the takeover dialog | **holds** |
| 6 | the Flappy bird clears at least four pipes | **holds — first time.** The counter reads 4 by the beat's last frame; see the caveat in item 3 above |
| 7 | no clip runs out before its beat ends | **holds** — all eight beats now assert with plain `<Footage>`; margins are 1 frame (beat 7), 36 (beat 8), 111 (beat 4's flight) |

### Nothing here needs a re-film

Every round-3 defect was an edit problem and every one is fixed in the edit. The
one thing a re-film would still buy is headroom on `promo-theme` (item 4) — not
a defect today, just no slack.

## Round 4 — 2026-09-03

All ten scenes were re-filmed before this round (fresh takes, fresh marks), and
the recorder now subtracts its own 100 ms capture lag inside every marks file.
`promo-theme` gained a `gold` mark: an in-page observer that resolves the moment
the app's own `data-theme` becomes `golden-sunbreak`. This round spends that
mark and fixes the one thing the whole draft still read as flat. Evidence:
`out/review-4/` — the flip neighbourhood measured frame by frame, beat 4 sampled
every 15 frames with the in-game PIPES counter cropped at 5x, beat 2's opening,
beat 6's last eleven frames, the last frames of beats 7 and 8, a rendered
before/after pair at frames 200 and 1200, and all eight cut frames.

**1. The theme flip trims to the paint mark, not to a hand-measured lag.**
`PAINT_LAG` is gone. The trim is now `markFrame('promo-theme', 'gold', 'end',
N) - FLIP`, and this round's job was to find N. The first render used N = 1, the
paint lag as it was measured off the raw takes — and it put the app's gold one
frame LATE. Measured on
that render, window-region mean RGB was 16.98/22.24/29.52 at composition frame
1403 (bar 23) and 90.64/99.21/107.35 at 1404 — the backdrop and the host turned
on 1403 while the app in the footage turned on 1404, exactly the two-event split
this whole item exists to prevent.
*Why:* `markFrame` ROUNDS the mark down. This take's `gold` mark ends at
11.481 s = clip frame **344.43**, which rounds to 344; the measured paint is
+1.4/+1.5 frames after the mark, i.e. clip frame 346. 344 + 1 is 345, one short.
*Fix:* the nudge is **2**. Re-rendered and re-measured: window mean RGB
16.86/22.21/29.57 at 1402 and 90.64/99.21/107.35 at 1403 — dark on 1402, gold on
1403, and the app, the backdrop and the host all turn on that one frame.
**Checklist item 2 holds.** The `flip` mark is no longer used for trimming.
*Headroom:* the trim also gained slack. `promo-theme` is 25.76 s (773 frames)
and the beat needs 492 from clip frame 224 — **57 frames spare**, where round 3
had one. Round 3's "no headroom left" warning is retired.

**2. The window now reads as a window on the dark beats.** The app's own chat is
almost exactly the old backdrop glow's colour, so beats 1–6 read as one flat
dark field with a rectangle faintly implied in it. Three numbers changed: the
midnight glow `#1f2a3a → #2a3a52`, its radial `60% 80% → 75% 90%`, and the
window's 1 px edge ring `rgba(255,255,255,.06) → .12`. The golden theme is
untouched — it separates on its own.
*Measured, by rendering the same two frames from `HEAD` and from the branch:*
the gap between the backdrop beside the window and the window's interior went
**10.3 → 21.7** levels on beat 2 (frame 200) and **3.0 → 13.0** on beat 6
(frame 1200); the edge ring against the same interior went 11.0 → 15.0 and
3.7 → 12.3. Beat 6 was the worst case — a 3-level difference is below what any
display shows as an edge, which is why that beat in particular looked like a
screenshot pasted onto black.

### Round-4 verification

| Check | Result |
|---|---|
| the flip's three frames | **pass** — 1402 dark, **1403 gold** (app + backdrop + host together), 1404 already gold. Note the frames: `barFrame(23)` is **1403**, not 1402 — 23 × 2.0339 s × 30 = 1403.4 → 1403, which is also what rounds 1–3 recorded |
| beat 4, frames 610–854 | **pass** — 610–613 are the outgoing cut; the Games panel holds 625–655; the bird flies from 670 to the end; the PIPES counter reads 0 (670–730), 1 (745–760), 2 (775–805), 3 (820–835), **4 (850, 854)**; frame 854 has four pipe columns on screen with the bird alive between them |
| beat 2, frames 122–140 | **pass** — the window is fully in at 126 and the chip's result is already on it: the composer reads "brief me on" and the Briefing chip is lit. The lead-in before the click release is 3 frames (0.1 s), not 0.4 |
| beat 6, frames 1270–1280 | **pass** — the takeover dialog ("This session is active on Pixel 9 — take over here?", Take over highlighted) holds to 1273, and 1274–1280 show the Resume Session list with **"Resuming…"**. "Initializing session…" never appears |
| beats 7 and 8 last frames | **pass** — 1768 (mean 62.90) and 2074 (mean 50.76) are live golden-theme picture, not black. Not frozen either: consecutive frames differ (1764→1768 and 2070→2074 each move pixels every frame, mean delta ≈ 0.02/255), which a repeated last frame could not do |
| window vs backdrop, full frames | **pass** — see item 2's measurements; the before/after pairs are `out/review-4/ab-200.png` and `ab-1200.png` |
| every cut, start+4 | **pass** — 0 (cold open, no cut); 122 in at 126; 366 in at 370; 610 in at 614; 854 in at 858; 976 in at 980; 1281 in at 1284; 1769 in at 1772. Every one is complete on or before start+4 |

### Checklist status

| # | Item | Status |
|---|---|---|
| 1 | every cut on a downbeat | **holds** — `startFrames` is pinned by a test; all eight verified frame by frame |
| 2 | the flip on bar 23's first frame | **holds** — dark at 1402, gold at 1403 |
| 3 | captions inside the band, readable at 960 px | **holds** |
| 4 | the host never covers a tool card | **holds** |
| 5 | the phone never covers the takeover dialog | **holds** |
| 6 | the Flappy bird clears at least four pipes | **holds** — the counter reads 4 from frame 850 and four pipe columns are on screen at 854 |
| 7 | no clip runs out before its beat ends | **holds** — every beat asserts with plain `<Footage>`, and beat 7's margin is now 57 frames instead of 1 |

### Still open

Nothing found this round needs a re-film. The one caveat carried from round 3
stands: the PIPES counter only reaches 4 in the last 0.3 s of beat 4, so the
count is a glance rather than a read — the bird visibly passing four pipes
across the 6.7 s shot is what carries the item.
