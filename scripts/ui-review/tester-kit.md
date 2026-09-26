# Tester kit — how to drive the app when you know nothing else

You are testing **YouCoded**, a desktop AI-assistant app. This file is everything you need to
open it, click around, type, take screenshots, and read errors. It is deliberately the only
project document you get: you are meant to see the app the way a new user does.

## What you are looking at

- **A page in a browser.** The app's real screens run inside a normal web page, either
  against a **simulated backend** (the "practice app" — the assistant, files and other people
  are fakes that answer instantly and always the same way) or against a **development copy**
  of the real app. Your briefing says which. In the practice app, fake-looking data (the same
  reply every time, a friend who is always online) is *by design* — do not report it.
  Anything else is fair game.

## The one tool: `explore`

`explore` opens the app and keeps it open. You act on it one step at a time, like a person.
Every step answers with the same three things:

1. **Two pictures**: the screen, and the same screen with a yellow number on everything you
   can click. Look at them (open the path) — the reviewer reading your report will too.
2. **The numbered list** of what you can click, type in or drag right now: its kind
   (`button`, `textbox`, `menuitem`, `switch`…), its label, its state (`disabled`, `on`,
   `open`, `holds "…"`, `tooltip "…"`) and where it is. When a menu or dialog is open, its
   controls come first, under its name; controls hidden behind it are left out (you could not
   reach them) and counted.
3. **The layers**: what is open on top of what — `menu "Rename… / Move…" › over dialog
   "Settings" › over the app` — and what has keyboard focus.

It also says `NOTHING ON SCREEN CHANGED after this step.` when a click did nothing visible,
and lists any error the page logged.

```bash
node scripts/shoot/explore.mjs start                     # the app, as a new user first sees it
node scripts/shoot/explore.mjs click 7                   # click control 7 from the last list
node scripts/shoot/explore.mjs type 12 "hello"           # click control 12, then type
node scripts/shoot/explore.mjs key Escape                # also: Enter, Tab, Ctrl+K, ArrowDown…
node scripts/shoot/explore.mjs stop                      # when you are done
```

| Command | What it does |
|---|---|
| `start [--scenario X] [--width 390] [--theme light]` | Opens a fresh app. Your briefing names the scenario. `--width 390` is phone width. |
| `look [--all]` | The pictures and list again, without doing anything. `--all` also lists controls scrolled out of view. |
| `click N` · `double-click N` · `right-click N` · `hover N` | A real mouse, at control N's middle. Hover shows tooltips and hover styles. |
| `type "text"` · `type N "text"` | Types into whatever has focus, or clicks N first. |
| `key K` | One key or combination: `Escape`, `Enter`, `Tab`, `Backspace`, `ArrowDown`, `Ctrl+K`, `Shift+Tab`… |
| `drag N to M` | Presses on N, moves to M with hover on the way, lets go. |
| `scroll down [N]` · `scroll up [N]` | The mouse wheel, over control N or the middle of the window. |
| `back` | Undoes your last step (the app starts over and replays the others). |
| `stack` | Just the layers and focus, no pictures. |
| `errors` | Every error the page logged this session. |
| `screens` · `open <name>` | The app's named screens, and a jump straight to one — only when your briefing tells you to use it; a new user gets there by clicking. |

Numbers change after every step: always use the list from your **latest** step. If a number
no longer matches, the tool says what *is* on screen instead of clicking the wrong thing.

The session stops itself after 10 minutes of nothing; `start` again opens a fresh one.

**If your briefing says you are testing the development copy**, start with
`node scripts/shoot/explore.mjs start --dev`. It connects to the window already running; there
is no `back` (it is a real app — undo by hand), and `--scenario`/`--width` do not apply.

Two things this tool cannot do, so do not claim to have tested them: touch input, and a
high-density screen (the app's owner runs at 1.5× scale with a touchscreen). Say so in your
report if a finding might depend on either.

## What to report, and how

Write your findings to the file named in your briefing, **one finding per line**, in this
exact shape, numbered from `U1`:

```
- U1 — <what you expected> / <what happened instead> — <screen> — <picture path>
```

**A step that failed is not evidence.** If the tool could not do what you asked, say "could
not open X" rather than describing what you did not see.

Report, in order of how much they would bother a first-time user:

1. **Errors and dead ends** — anything that fails, hangs, or leaves you with no way forward.
   A key that should close something and does not (Escape on a dialog) counts.
2. **Expected-one-thing, got-another** — a button that does not do what its label says
   (`NOTHING ON SCREEN CHANGED` is often this), a setting that does not stick, a flow that
   needs more steps than it should.
3. **Wording** — every label, button, hint and error you read. If it uses more words than the
   idea needs, quote it and propose the shorter version on the same line. Words a college
   student would not know are a finding by themselves. A control listed with `(no label)` is
   one a screen reader cannot name — a finding too.
4. **Visual inconsistencies** — alignment, spacing, colours or sizes that differ between
   screens for no reason; anything clipped or overlapping; anything unreadable in a theme.

Do not report the fake data or how the code works. You never read code. If you ran out of
budget before finishing the task in your briefing, say exactly where you stopped.
