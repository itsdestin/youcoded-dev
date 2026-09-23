---
status: active
---

# Handoff — finish the "Morning Rounds" theme pack

Written 2026-09-20 at the end of a session that reached Kit approval but never ran
Phase 2. The theme is for Destin's girlfriend and friends at Cornell vet school.
Destin is a non-developer; do the technical work rather than handing him commands.

> **Status 2026-09-22: the pack is built and its PR is open — see the four decisions
> below, which supersede several claims further down this document.**
>
> Destin answered a review deck (`docs/active/design/2026-09-21-morning-rounds-mascot/`):
>
> | Question | Answer |
> |---|---|
> | A-1 keep the vet-dog mascot? | **Yes** |
> | D-1 which palette ships? | **Rounds Cream** (`wp-cream`) |
> | C-1 which scrubs on the buddy? | **Clinic blue** `#3A6FA8`, with the note "remove the tail" |
> | D-3 should the dog hold something? | **Add the clipboard** |
>
> **Three claims in this document are now wrong; the deck and the code supersede them:**
>
> 1. *"Destin's final call for now: bare — no hat, no scrubs."* — no longer true. The
>    mascot now carries cream-lined dog ears in the hat slot and the wallpaper cat's
>    orange clipboard in the item slot; the tail was REMOVED at his request.
> 2. **Gotcha 7 ("cream rim `#FFF3E4`") is not this theme's treatment, and the reasoning
>    in it is unsound.** The rim strokes the eye ellipse AND every filled mouth, so on a
>    mid-tone body it paints a halo round each eye that reads as a sticker border. Read
>    off all seven shipped rigs: the five with a light or mid body (golden-sunbreak,
>    cotton-candy-sky, meadow-mist, kuromi-dreamer, strawberry-kitty) all set a dark
>    `fill` and NO `rim`. The only themes setting one are halftone-dimension (rim
>    `#00b8ff` on a near-black `#191327` body, where it is the only thing separating eye
>    from head) and devils-garden (whose rim is a warm spark, not the face colour). The
>    theme originally shipped with `rim: CREAM` and that was the defect Destin was seeing.
> 3. **Gotcha 6's "lowest facial element is y=13.6" is the shocked mouth's centre.** The
>    true lowest element is the happy grin at **y=14.5**.
>
> Also note gotcha 7's implied remedy — a light rim on a dark body — is real
> `reference/mascots.md` rule 3, but it applies to a body the eye cannot separate from.
> Clinic blue `#3A6FA8` is mid-tone: its eye measures 3.22:1 against the body, so no rim
> is needed and the rim is what made it read badly.

## The one-line state

Kit is **approved and live**; the pack is **not built**. "Build theme pack" is not a
build — it emits a `kit-build` event for *you* to process, and the event that fired at
23:45 was never processed, so no pack folder exists.

## Where everything is

| Thing | Path / value |
|---|---|
| Kit page (live) | **http://localhost:57186** — server pid **610795**, still running |
| Kit session dir | `~/.claude/wecoded-themes/.superpowers/brainstorm/610786-1789972849/` |
| Build state | `…/content/kit-state.json` (also one `kit-build` line in `…/state/server.log`) |
| Scratch / assets | `~/.claude/wecoded-themes/_preview/` |
| Theme name | **Morning Rounds** — `_kit.finalSlug` = `morning-rounds` |
| Target folder | `~/.claude/wecoded-themes/morning-rounds/` — **does not exist yet** |

`_preview/` currently holds: `assets/` (9 files), `manifest.json`, `mascot-config.json`,
`decorate-mascot.cjs`. Destin's app is **untouched** — the Kit's apply toggle reads
"not applied to your app", which is correct and deliberate.

## What is done

- **Concept chosen** (concept B), four palettes defined, all 8 Kit columns reviewed:
  palette / window / bubbles / typography / effects / wallpaper / mascots / icons.
- **Wallpaper**: `wallpaper-b.jpg` — the illustrated dog-and-cat-in-scrubs plate.
- **Mascot** rebuilt and verified. Destin's final call for now: **bare — no hat, no
  scrubs.** He will refine it in a later session. The 5 assets in `_preview/assets/`
  are already correct and reproducible via `node _preview/decorate-mascot.cjs`.
- **Two bugs found and worked around** (see Gotchas) — neither is fixed upstream.

## What is left

Phase 2, per the skill's `reference/phase2-finalize.md` — read it before starting; the
steps below are a map, not a replacement.

1. ~~**Decide the palette**~~ — **ANSWERED 2026-09-22: Rounds Cream (`wp-cream`)**, via the
   review deck. The paragraph below is kept because it records which four candidates
   existed and why the seeded manifest matched none of them.
   The original note follows:
   "The manifest carries exactly one palette in `tokens` (verified: no shipped theme has
   a `palettes` field; the template has no such key). The Kit defined **four**, so one
   must be picked. Worse, they disagree:

   | Source | canvas | panel | accent | fg |
   |---|---|---|---|---|
   | Kit `selected.palette` | — says **wp-cream** — | | | |
   | wp-cream "Rounds Cream" | `#FAF6F0` | `#F3EDE3` | `#B31B1B` | `#2A2320` |
   | wp-navy "Hospital Navy" | `#EEF1F3` | `#E5EAEE` | `#B31B1B` | `#1B2429` |
   | wp-dark "Night Shift" | `#150F0F` | `#1F1717` | `#C31230` | `#F6EDE7` |
   | wp-soft "Soft Paper" | `#F6F2EC` | `#EFEAE2` | `#9E2B2B` | `#35302B` |
   | **seeded `_preview/manifest.json`** | `#F6F2EC` | `#e9e4e8` | `#9E2B2B` | `#35302B` |

   The seeded manifest matches **no** palette exactly — it is closest to wp-soft but its
   `panel` differs, and the Kit says wp-cream. **Ask Destin which palette ships** rather
   than guessing; the other three are a natural follow-up theme-pack idea, not something
   the manifest can hold."

   **What actually shipped:** `wp-cream`'s tokens exactly, plus a `background.average-color`
   the Kit never wrote. That field is not cosmetic — a glass theme without it is audited
   against flat tokens, which understates the real ratios and only WARNS. With the
   wallpaper's true average (`#E3D6CC`) declared, `fg-dim` and `fg-faint` on `inset` fell
   below their HARD thresholds (3.98 and 1.99) and had to be darkened to `#6B5F56` and
   `#9A9184`. The theme-builder should write this field whenever it bakes a wallpaper.
2. Folder + hero wallpaper + terminal-bg bake (`prep-terminal-bg.cjs`).
3. Remaining SVGs (cursor, particle shape, scrollbar, icons) — most already exist.
4. Manifest from `scripts/manifest-template.jsonc`. **The slug transform is the trap
   that has burned this skill most**: `_preview` → `morning-rounds` in the manifest must
   move in lockstep with the folder rename, or the app silently renders the default.
5. Custom CSS from `scripts/custom-css-reference.md`.
6. `check-contrast.cjs` — fix any HARD/SURFACE failures.
7. `preview.png` via the `wecoded-themes` clone. Prerequisites already verified present:
   `/home/destin/youcoded-dev/wecoded-themes` on `main`, `node_modules` and `playwright`
   installed. Non-fatal if it fails.
8. Confirm to Destin, then `rm -rf ~/.claude/wecoded-themes/_preview`.

## Gotchas this session hit — save yourself the time

1. **The Kit's Mascots section is a stub.** `kit-page.js` ships `renderWallpaperReview()`
   but no `renderMascotReview()`, so `#k-mascot-preview` is empty until Claude fills it
   (the "needs Claude" chip is the tell). This session injected markup into
   `…/content/screen.html`. **If you restart the server you get a fresh session dir with
   an empty stub and a new port — restage the Kit and re-inject, or Destin sees a blank
   section.** A real fix belongs in the skill.
2. **The companion server dies with its owner shell.** `start-server.sh` records
   `BRAINSTORM_OWNER_PID` and the server exits with `"reason":"owner process exited"`.
   It must be launched as a long-lived background command, not a foreground one, and
   **the port changes on every restart** — never reuse a previously-sent URL.
3. **The Kit serves its own copies of the mascot SVGs** from
   `…/content/`, not from `_preview/assets/`. Rebuilding the assets does nothing to the
   Kit page until you copy them into the session's `content/` dir.
4. **Asset URLs need the `/files/` prefix**; bare filenames 404.
5. **`#slot-hat` stays self-closing** (`<g id="slot-hat"/>`) when undecorated — an
   assertion expecting `<g id="slot-hat"></g>` fails. Cost one build cycle here.
6. **The body is nearly all face.** The lowest facial element (the open mouth on
   `shocked`/`dizzy`) reaches **y=13.6** and the body ends at y=16 — a garment has 2.4
   units of room. This is why the collar was a thin band and why the stethoscope was
   dropped: at 48 px every placement read as a smudge beside the mouth. Details are in
   the comments of `decorate-mascot.cjs`; the measured collar geometry is preserved
   there, commented, if Destin ever wants it back.
7. **Mascot eyes**: the shipped shape is dark fill `#7A1220` + cream rim `#FFF3E4` +
   gold catchlight. A solid cream eye on the carnelian body is the "glowing hole" that
   `reference/mascots.md` rule 3 forbids. This was the bug Destin originally reported.

## Separate, already committed — not part of this theme

Two unpushed commits from the investigation that spun out of this session, both on
branch `theme-plugin-update`, awaiting Destin's call on merging. Do not fold them into
theme work:

- `youcoded` `5b8cb85fb` — bundled plugins now deliver skill content on app update.
- `youcoded-dev` `7bc65166` — roadmap entries for the version-bump enforcement gap.

## Suggested opening for the new session

> Build the Morning Rounds theme pack. Read
> `youcoded-dev/docs/active/handoffs/2026-09-20-morning-rounds-theme-handoff.md` first.
> The Kit is at http://localhost:57186 if it is still up; ask me which of the four
> palettes should ship before you write the manifest.
