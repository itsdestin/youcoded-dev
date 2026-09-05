# Tester kit — how to drive the app when you know nothing else

You are testing **YouCoded**, a desktop AI-assistant app. This file is everything you need to
open it, click around, type, take screenshots, and read errors. It is deliberately the only
project document you get: you are meant to see the app the way a new user does.

The app is **already running** at the address in your briefing. You do not start or stop it.

## What you are looking at

- **A page in a browser.** The app's real screens run inside a normal web page, either
  against a **simulated backend** ("workbench" — the assistant, files and other people are
  fakes that answer instantly and always the same way) or against the **real app** (a
  development copy). Your briefing says which. On the workbench, fake-looking data
  (the same reply every time, a friend who is always online) is *by design* — do not report
  it. Anything else is fair game.
- On the workbench there is a **toolbar above the app** that is not part of the product: it
  switches the fake scenario (`default`, `empty`, `no-providers`, `refused`, `stress`), adds
  fake delay, and narrows the window. Use it; do not review it.

## The one tool: a scripted click-through with screenshots

`scripts/ui-review/shot.mjs` opens the app in its own headless Chrome, runs a list of actions
you write, checks the thing you said should appear, and saves a screenshot. Write a small
JSON plan and run it:

```bash
node scripts/ui-review/shot.mjs my-plan.json out-dir
```

```json
{ "base": "<the address from your briefing>", "boot": 3500, "width": 1440, "height": 900,
  "shots": [
    { "name": "open-settings",
      "actions": [ {"clickText": "Settings", "tag": "button", "settle": 600} ],
      "expect": "js:document.body.textContent.includes('Appearance')" },
    { "name": "what-can-i-click",
      "actions": [ {"dump": true} ],
      "sameAsBaseline": true, "expect": "body" }
  ] }
```

- Actions, in the order you list them: `{"click": "<css selector>"}` (a real mouse click at
  the element's centre), `{"clickText": "Exact label", "tag": "button"}`,
  `{"rightClick": …}`, `{"hover": …}`, `{"type": "text"}` (types at the focused field),
  `{"key": "Escape"}`, `{"wait": 500}`, `{"eval": "<javascript>"}`. Every action accepts
  `"settle": <ms>` to pause after it.
- `{"dump": true}` **lists every clickable control on the current screen** into the
  manifest file in `out-dir` — for each one its tag, `aria-label`, `title`, visible text and
  position. Start every new screen with a dump: it is how you learn what to click. Prefer an
  `aria-label` or `title` selector (`[aria-label='Send']`, `[title='Settings']`) over visible
  text; text changes.
- `expect` is required: a selector or `js:` expression that must be true after the actions.
  If it is not, the shot is filed under `out-dir/<theme>/_unverified/` and the run's summary
  says so. **A shot that failed to open is not evidence** — say "could not open X" rather
  than describing what you did not see. If you meant to screenshot the unchanged page, say
  `"sameAsBaseline": true`.
- Screenshots land in `out-dir/<theme>/<name>.png` — the default theme is `midnight`, so
  `out-dir/midnight/open-settings.png`. Look at them; the reviewer reading your report will too.
- To test at a phone-like width, add `"width": 390`. To test other themes, pass a comma list
  as the third argument, for example `light,halftone-dimension`.
- **If your briefing says you are testing the real development copy**, it also gives you a
  port number. Run the tool as `ATTACH_PORT=<that port> node scripts/ui-review/shot.mjs …`
  so it drives the running app instead of opening its own browser tab. Without that
  variable you would be looking at a bare page with no app behind it.

Two things this tool cannot yet do, so do not claim to have tested them: touch input, and
a high-density screen (the app's owner runs at 1.5× scale with a touchscreen). Say so in
your report if a finding might depend on either.

## One-off questions about the page

For a single quick check with no click sequence:

```bash
node scripts/ui-probe.mjs "<address>" --wait 'document.body.textContent.length > 0' \
  --eval "document.title" --shot /tmp/probe.png
```

It prints what the expression returned, saves the screenshot, and prints any errors the
page logged to its console. Add `--size 390x844` for a narrow view.

## What to report, and how

Write your findings to the file named in your briefing, **one finding per line**, in this
exact shape, numbered from `U1`:

```
- U1 — <what you expected> / <what happened instead> — <screen> — <screenshot path>
```

Report, in order of how much they would bother a first-time user:

1. **Errors and dead ends** — anything that fails, hangs, or leaves you with no way forward.
2. **Expected-one-thing, got-another** — a button that does not do what its label says, a
   setting that does not stick, a flow that needs more steps than it should.
3. **Wording** — every label, button, hint and error you read. If it uses more words than the
   idea needs, quote it and propose the shorter version on the same line. Words a college
   student would not know are a finding by themselves.
4. **Visual inconsistencies** — alignment, spacing, colours or sizes that differ between
   screens for no reason; anything clipped or overlapping; anything unreadable in a theme.

Do not report the fake data, the toolbar above the app, or how the code works. You never
read code. If you ran out of budget before finishing the task in your briefing, say exactly
where you stopped.
