# The first-shot test (toolkit-plan section f)

**Goal: judge the toolkit, not one score.** Six briefs nobody has composed for are each scored once
by a fresh composer, with no fixing, and the owner rates the results blind. The scores go in
`ratings.md`, dated, so every later change to the songbook can be checked against them.

Prepared 2026-11-25; **not run yet**. Nothing in the songbook's gauges is calibrated until it is
(`tilt`, `presence`, `roughness`, `gap-fill`, `novelty-peaks` wait on the ratings below).

## Running it

1. **The composer sees only** `SONGBOOK.md`, `src/recipes.py`, `src/demos.py` (the worked examples)
   and ONE brief from `briefs.md`, pasted into its task. It must not read this folder (the other
   briefs, earlier ratings). A new agent per brief.
2. **One attempt per brief.** The composer follows The procedure and stops at the first render
   that passes the hard checks. No revision after hearing or after reading the dashboard beyond
   explaining its gauges. Record in `ratings.md`: hard-check failures before the pass, minutes
   taken, the change plan, the [OWNER] switches in force (all defaults unless the owner says).
3. **Render** with `SONGBOOK_NO_COPY=1 render.sh <key>`; collect `out/films/<name>.wav` (or
   `out/<name>.wav`) and the no-melody `-bed.wav`.
4. **Blind rating.** Shuffle the six files, rename them `A`-`F`, and give the owner only the files
   (and the films' picture where one exists). He rates each 1-5 on:
   - would use as is;
   - steady (not choppy);
   - not busy or harsh;
   - interesting;
   - sounds like us;
   plus one free comment. The menu loop (brief 6) is played **three times in a row**: "still
   pleasant on the third pass?" (yes/no).
5. **Pass bar:** at least 4 of 6 rated 4 or more on "use as is", and none rated 2 or less on steady
   or on not busy/harsh.
6. **Calibrate.** His harsh/fine answers set the `tilt`, `presence` and `roughness` ranges; his
   choppy/fine answers set `gap-fill` and `novelty-peaks` (dashboard.py). Note the change in
   SONGBOOK.md "What is still weak".
7. **Regression.** After each toolkit change, re-run the same six briefs with new seeds, add a dated
   block to `ratings.md`, and fix or retire the recipe behind the lowest score.

Before the full run, the single-switch A/B pairs (each ~20 s, `render.sh --sketch <key> <switch>`)
are the cheaper first step: `pad_level=-4` (the default B), `pad_level=0`, `sustain=held`,
`sustain=ring`, `fig_order=cell`, `pulse=chord`, `chords=plain`, `air=legacy`, `piano=salamander`,
`pad_timbre=triangle`; narrated: `SONGBOOK_OWNER=narrator_tempo=stress`, `voice_busy=5`.
