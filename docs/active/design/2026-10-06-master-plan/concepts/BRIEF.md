# Command center concept pages — builder brief

You are building ONE visual concept of the YouCoded **command center**: a generated page the
app's owner opens every morning to see the state of the app's development. It has three
parts, all on one page: **Today** (a briefing), **Map** (the app's systems and the seams
between them, drawn from the real code), **Screens** (a gallery of every screen, with what
changed each one). The reader is not a programmer. His test, verbatim:

> "a normie should be able to glance at this and go 'ahh, gotcha'. also should adopt some
> youcoded styling."

What he rejected last time, verbatim, and what you must fix:

1. A dense grid of 124 little boxes with coloured lines: "looks really really bad… not
   visually attractive or intuitive". → **Open with eight big boxes**, one per system, each
   with its name, a one-line purpose and a plain state. Detail only on click or hover.
2. "still kinda hard to tell ui work from backend work" → every part and every effort shows
   whether it is **What you see** (screens) or **Behind the scenes** (backend, shared, phone).
   Use `.side.screens` / `.side.behind` from cc.css, and say the words, never just an icon.
3. "tags aren't completely clear… should probably have hover tooltips that elaborate" →
   **every tag, pill, count and line has a hover tooltip in plain words** (`.tip` +
   `data-tip`). No abbreviations anywhere on screen. No jargon: never "IPC", "cochange",
   "import", "branch", "PR", "worktree", "backend" as a bare word (say "behind the scenes").
   A git branch is "an effort"; a pull request is "a change waiting to merge".
4. "confused. dont really understand [the problem signals]" → **no red badges on the map.**
   The only state a system box carries is: steady, or "N efforts in flight". Trouble (parts
   with no tests, things edited together with no code link) goes in ONE plain-words list on
   the Today side, each line with a button, or is left out of this concept entirely.
5. "why can we not tag as relevant to both?" → a part may belong to two systems. `data.json`
   marks `alsoServes` on two parts; draw them in both places with a small "also serves …"
   tag, tooltip explaining why.

His kill list (what makes him stop opening the page): anything that drifts or he must
maintain; the same fact stated twice in one view; housekeeping offers that should just
happen; an issue without its context; jargon; anything non-actionable — "everything you
bring to my attention should also have a button."

## Files

- `data.json` (beside this file) — REAL data as of 2026-10-08. Load it with `fetch('data.json')`
  (the page is opened by path and served by a local server, so fetch works; also fine to
  inline it with a `<script>` tag during the build). Shape:
  - `systems[]`: `{id, name, purpose, files, screensFiles, behindFiles, parts[]}`; each part
    `{id, layer, side: "screens"|"behind", phone, files, lines, purpose, alsoServes?}`.
  - `seams[]`: pairs of systems `{a, b, strength, byType, mostly, words}` — `words` is the
    plain-English meaning of the main kind of connection. Draw at most the top 6–8; the
    first (chat-agents↔foundations) is 4× the next, cap line thickness.
  - `efforts[]`: in-flight work `{branch, title, purpose?, commits, lastTouched, daysAgo,
    active (≤7 days), uiFiles, behindFiles, kind: "screens"|"behind"|"both", systems[], parts[],
    pr?: {number, state, note}}`. Show the `active` ones prominently; the idle ones folded.
  - `briefing`: `date, release, prerelease, mergedSinceRelease, mergedToday[], mergedYesterday[],
    mergeable[] (changes reviewed and ready to merge), cleanup {…}, bugs[], recommendation
    {effort, why, links, seams}`. This is his morning list, in HIS order: 1 ready to merge,
    2 cleanup, 3 major bugs, 4 changed since release, 5 active work with last-touched,
    6 recommendation, 7 how it links / seams / what must be configurable.
  - `gallery`: `total: 216` screens exist; `shown[]` are the 8 we have pictures of, files at
    `gallery/<name>-<theme>.webp` (themes creme and midnight); `changedBy[name]` lists the
    merged changes that touched each screen.
  - `counts`.
- `cc.css` — link it. It carries the app's real theme palettes, radii, type scale, buttons,
  pill tabs, chips, status pills, the two `.side` markers, rows, and `.tip` tooltips. Read it
  fully first. The page switches theme by `<html data-theme="…">`; honour `?theme=creme`
  etc. from the URL on load (default `creme`, which is the owner's current theme).
- `gallery/` — the screen stills.
- The app's design guide, read §1–§4.6: `docs/active/design/2026-08-25-ui-design-guide.md`
  (workspace root). Its laws apply: tokens only (no raw hex, no palette colours outside the
  semantic set already in cc.css), four radii by role, one primary button per view, text
  never below 11px for information, eyebrows as the only section header, counts as
  "Label 9" never "(9)" or "9 files" in a tab, hover + press + focus on every clickable thing,
  an empty state names what's missing and offers a way out.

## Rules for the page

- One self-contained `.html` file at the path your task names, plain HTML + CSS + vanilla
  JS. It may add its own `<style>` for layout, painting only with cc.css variables.
- The **opening view at 1440×900 must be understood with no scrolling and no clicking**:
  that is the picture the owner will judge. Everything below the fold or behind a click is
  a bonus.
- Progressive disclosure: clicking a system box unfolds its parts (name, purpose, side
  marker, file count, "also serves" tag), each with a tooltip; clicking again folds. Keyboard
  reachable (`button` or `tabindex` + Enter).
- Hover a seam line or a seam count → tooltip with the plain-words meaning and the number.
- Every effort shows: title, how long since last touched, which side(s) of the app it is on
  (`.side` markers with counts, e.g. "What you see 33 · Behind the scenes 8"), which systems
  it touches, and one button that fits (Open, Merge, Resume, Clean up…). Buttons do nothing
  yet; they are the promise.
- Theme: looks right in both `creme` and `midnight` — check both.
- Verify: `node scripts/ui-probe.mjs 'file:///…/your.html?theme=creme' --size 1440x900
  --shot /tmp/…png --fail-on-error --settle 800` from the workspace root; look at the PNG
  yourself (use the Read tool on it), fix anything clipped, wrapped, overlapping, unreadable
  or ugly, repeat for `?theme=midnight`. Also shoot a tall `--size 1440x2400` to see the
  whole page. No console errors.
- Do not touch any file outside the `concepts/` folder. Do not commit.

When you finish, reply with: the file path, the two screenshot paths, three sentences on
what the opening view shows, and anything in data.json you could not show honestly.
