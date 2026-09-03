---
status: draft
created: 2026-09-03
type: spec
topic: A ~70-second promo video of YouCoded for Reddit — the running app, filmed by the demo-clip rig, hosted by the mascot, assembled with free tools.
measured_at:
  youcoded-dev: 9b9fa65
  youcoded: 4224fb85
---

# YouCoded promo video — design

## What it is

One 16:9 video, about 70 seconds, that a Reddit viewer can watch **muted** and still
understand what YouCoded is. It shows the app doing eight things, one after another,
with the assistant mascot as the through-line: it peeks in at the start, flies in the
game, changes costume with the theme, and waves out at the end.

Tone: whimsical (the mascot, the game, the theme transformation) over a badass spine
(fast cuts, the app doing several things at once, one-line captions, no narration).

Not a landing-page replacement. The landing page's loops stay as they are; this borrows
the same rig and the same fixtures.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Footage | The real renderer in the UI Workbench (fake backend), filmed by `scripts/ui-review/record.mjs` | It is how every landing-page loop is made; nothing touches Destin's live app |
| Assembly | **Remotion** (React-in-video, free for individuals) in a new `scripts/promo/` folder | Frame-accurate transitions, captions, overlays and music in code; ffmpeg alone looks basic, and a hand-rolled frame stepper would be a worse Remotion |
| Output | 1920×1080, 30 fps, H.264 MP4, stereo AAC (silent track if no music) | What Reddit accepts and autoplays; the rig's screencast is ~24 fps so 30 is honest |
| Sound | Captions carry the video. Music is optional: a free track Destin drops in as `scripts/promo/assets/music.mp3` (Pixabay or YouTube Audio Library) | Reddit autoplays muted |
| Spreadsheet beat | **Assistant-only.** The user asks; the panel shows the sheet change | In-grid editing does not exist (roadmap: `docs/roadmap/files.md`, filed 2026-09-03). Not faked |
| Theme beat | **One-shot.** The theme applies the moment the assistant finishes | Promo fudge Destin approved; the real flow goes through the marketplace card |
| Takeover beat | The real "This session is active on {device} — take over here?" dialog, triggered by a workbench fake | The dialog and copy are real; only the trigger is faked |
| Mascot | The theme mascot art the app ships (`welcome-mascot.svg` and the per-theme `mascot-*.svg` sets), animated by Remotion with spring motion | No rig-runtime coupling; every pose we need exists as a still |
| Copy | Short captions, plain words; the landing page's banned list applies (no "real app", "real files", "actually", "does real work", "self-improving") | `.claude/rules/landing-page.md` |

## Storyboard

Times are targets, not contracts. Every beat is one recorded scene plus Remotion overlays.
"Caption" is the one line on screen; the mascot column says what the host does.

| # | Time | On screen | Caption | Mascot |
|---|---|---|---|---|
| 1 | 0–4 s | Dark backdrop. The app window rises into frame. Wordmark. | **YouCoded** — Useful. Fun. Yours. | Peeks up over the bottom edge (peek pose), looks around (curious), hops onto the window's title bar |
| 2 | 4–12 s | Empty new session (midnight). Cursor taps the **Briefing** quick chip, the prompt fills, Enter, tool cards tick past. | Start with one click. | Sits on the title bar, watching |
| 3 | 12–22 s | Attach `Q3-sales.xlsx`, type "sort by amount and add a totals row", the Session Files panel opens and shows the changed sheet. | Your files, right beside the chat. | Leans in (inquisitive) as the panel opens |
| 4 | 22–30 s | Type a bigger task, open **Games → Flappy**, the mascot-bird flaps through pipes while the chat keeps working behind it. | Play while it works. | *Is* the bird (in the footage). The host copy on the title bar is hidden for this beat so there is one mascot on screen |
| 5 | 30–36 s | Session strip. A pill is dragged two places left; the others step aside. | Drag your conversations into order. | Watches the pill go by, head turns |
| 6 | 36–50 s | Settings → Remote Access popup (QR + link). Cut: a phone frame slides in, the same conversation continues there. Cut back: the laptop shows the takeover dialog "This session is active on Pixel 9 — take over here?", cursor hits **Take over**, the chat catches up. | Start on your laptop. Finish on your phone. | Hops from the laptop frame onto the phone frame and back |
| 7 | 50–62 s | Type "build me a theme with the vibe of outdoor anime art". The reply lands and the whole app becomes Golden Sunbreak in one cut. | Describe a look. It's yours. | Changes costume to the Golden Sunbreak mascot on the same cut (shocked pose, then welcome) |
| 8 | 62–70 s | The window settles, backdrop tints to the theme. Wordmark, platforms, link. | Free. Open source. Windows · Mac · Linux · Android. github.com/itsdestin/youcoded | Waves (welcome pose), then hops out of frame |

Transitions: a fast slide or a hard cut between beats, never a crossfade longer than
250 ms. Each beat may hold a gentle push-in (2–4 %) on the region that changed.

## Footage: one scene file per beat

All under `scripts/ui-review/scenes/promo-*.json`, filmed at **1920×1200** (a 16:10 window
that sits inside the 16:9 frame with the backdrop showing around it) except the phone
scene at 390×844 with `platform=android`. `record.mjs` gets a `scale` field
(device scale factor 2) so Remotion can push in without softening.

| Beat | Scene | Needs |
|---|---|---|
| 2 | `promo-quick-chip` | `scenario=site&seed=none&reply=briefing` — a new reply fixture, 1 turn |
| 3 | `promo-sheet` | The spreadsheet fixture and writable-artifacts mock from `feat/landing-demo-clips` (`ef38bfc0`, worktree `grok-clip`) cherry-picked to master, plus a reply fixture whose tool card rewrites the sheet |
| 4 | `promo-flappy` | `record.mjs` learns `Space` as a key; the scene sends flaps on a rhythm. `reply=` any multi-tool fixture |
| 5 | `promo-strip` | `scenario=default`; the existing `drag` action |
| 6a | `promo-remote` | A workbench fake for `remote.*` (enabled, a link, one connected phone) so the popup renders |
| 6b | `promo-phone` | Same as `row5-phone` (`platform=android`, `autoplay=`) |
| 6c | `promo-takeover` | A workbench fake for `syncSpaces.leaseQuery/leaseTakeover` behind `?lease=held:Pixel%209`, so resuming the session raises the dialog |
| 7 | `promo-theme` | `reply=theme-builder` plus a one-shot apply: the scene's last action switches the theme through the workbench's appearance hook when the final turn lands |

Every workbench fake is dev-only code (the workbench never ships to users) and lands on
`youcoded` master through a normal PR. The rig changes (`Space`, `scale`) land in
`youcoded-dev`.

## Assembly: `scripts/promo/`

```
scripts/promo/
  package.json          remotion, @remotion/cli, @remotion/transitions, @remotion/google-fonts
  remotion.config.ts
  src/Root.tsx          registers the one composition: Promo, 1920×1080, 30 fps
  src/Promo.tsx         the timeline: eight <Sequence>s with transitions
  src/beats/*.tsx       one component per beat: footage in a window frame + caption + mascot cue
  src/Mascot.tsx        the host: a pose SVG, position, and spring motion per cue
  src/Caption.tsx       the one-line caption treatment
  src/frames/           the laptop-window and phone chrome the footage sits in
  assets/               mascot SVGs copied from the app, wordmark, optional music.mp3
  footage/              the recorded WebMs (gitignored)
  out/                  renders (gitignored)
```

Render: `npx remotion render Promo out/youcoded-promo.mp4`. A draft at half size
(`--scale 0.5`) renders in a couple of minutes for review; the final at full size.

Font: Inter via `@remotion/google-fonts` (fetched at render). Backdrop: a slow-moving
gradient in the active theme's colours, switching to Golden Sunbreak's at beat 7.

## Review

1. **Storyboard sign-off** — this document.
2. **Footage check** — each scene's poster and WebM in a folder; Destin eyeballs them
   (`docs/active/prototypes/promo-2026-09/footage-review.md` lists them with one line
   each). Anything that looks off is re-filmed before assembly starts.
3. **Draft render** at half size — Destin watches it. Notes come back as a list; a second
   draft follows.
4. **Final render.** Handed over as a path in chat. Two files: with music and without.

The storyboard order and captions are Destin's to change at any step. Timing is mine.

## Out of scope

- A vertical or square cut for mobile feeds (easy to add later as a second composition).
- Voice-over or narration.
- Changing the landing page or its loops.
- Any change to the shipped app. The only app-repo changes are workbench fakes and fixtures.

## Risks

- **The Flappy beat depends on keyboard timing** through CDP; if flaps land late the bird
  dies. The scene records several attempts and the best one is used.
- **A viewer tries to type into a spreadsheet** and cannot. The video never shows it, and
  the roadmap item exists.
- **The takeover dialog's device name** is whatever the fake says; "Pixel 9" is a
  placeholder, not a claim about supported phones.
- **Remotion's licence** is free for individuals and companies of up to three people. The
  workspace is one person.
