---
status: active
created: 2026-09-05
area: dev-workspace
decided_by: docs/active/design/2026-09-05-dev-dashboard/dev-dashboard.questions.answers.json
---

# Dev dashboard — design

One browser page that lists every branch copy of YouCoded on this machine, launches a dev
instance from any of them, runs the check suites against them, and says which ones hold work
that exists nowhere else.

Destin answered seven questions on a deck before any of this was drawn
(`dev-dashboard.questions.answers.json`). Every decision below traces to an answer there or is
marked as a build call.

## Why it exists

Two open backlog items, both in `docs/roadmap/dev-workspace.md`:

- `run-dev.sh --list` lists *registered* worktrees, not what is actually running — no offset,
  profile or pid. (2026-07-28 retrospective, still open.)
- Work keeps existing on one disk only. On 2026-09-01 the `site-themes` worktree held 40
  uncommitted files on a branch with zero commits and no remote; nothing distinguished it from a
  finished one, and the session-start hook labelled that exact state "candidate for cleanup".

Both are answered by a single surface, so they are built once rather than twice.

## What Destin decided

| Question | Answer |
|---|---|
| `build-shape` | A real YouCoded screen from the start, served on its own address |
| `theme-source` | Follow the active theme fully — colours, shapes, wallpaper, blur |
| `launch-scope` | Launch **and track** — each row shows Running, with a Stop button |
| `launch-warning` | Click launches immediately; the window comes to the front |
| `suite-set` | All suites, the paid one marked and confirming the spend |
| `output-view` | A verdict line, full output behind a "show details" toggle |
| `extras` | Saved / pushed / merged / would-deleting-lose-work — **plus** multi-select and a "Request cleanup" button producing a copyable prompt |

Follow-up he added to `extras`, verbatim: *"for branches, i would like to be able to
multi-select and hit a 'request cleanup' button to start a new conversation with claude. fine if
it just provides a copyable prompt for now."* The copyable prompt is therefore the shipped
behaviour; actually opening a conversation is not in scope.

Explicitly out of scope, at his instruction: the Settings → Development button, and the
"offer to add youcoded-dev as a managed synced project when the folder is missing" flow. Both
become one roadmap item.

## Three pieces

**1. The screen** — `youcoded/desktop/src/renderer/dev/dashboard/`. A real renderer screen using
the app's own primitives, so moving it into Settings later is deleting the wrapper, not a rewrite.

**2. The wrapper** — a `?mode=dev-dashboard` branch in `youcoded/desktop/src/renderer/index.tsx`,
lazy-importing the dashboard root wrapped in `<ThemeProvider>` + `<ThemeBg>`. This is the exact
pattern the workbench's own dev surfaces already use (`ToolGallery`, `CompareView`,
`LiveCandidate` all mount that way). **No `vite.config.ts` change is needed** — Vite's dev server
serves the existing single `index.html`, and the fork is a URL query check that production builds
dead-code-eliminate.

**3. The helper** — `youcoded/desktop/dev-dashboard/server.mjs`. A Node HTTP server that does the
real work and stands in for `window.claude`. It lives beside `test-engine/`, which is the existing
precedent for dev-only Node tooling in this repo, and like `test-engine/` it is **not packaged**:
`electron-builder.yml` `files:` is an allowlist of `dist/ node_modules/ scripts/ hook-scripts/
assets/ package.json`.

The screen never talks to a shell. It asks the helper; the helper runs things.

## The theme path

`ThemeProvider` (`src/renderer/state/theme-context.tsx`) is sufficient on its own for colour
tokens, `--radius-*` shape values and the `--panels-blur` / `--panels-opacity` variables — it
writes them onto `document.documentElement`. `ThemeBg` adds the wallpaper and pattern layers.
`ThemeEffects` (ambient particles) is skipped: it is decorative and its chrome-avoidance geometry
assumes a real app window.

Getting the *active* theme rather than the four built-ins needs only five methods on the shim:
`claude.theme.list()`, `claude.theme.readFile(slug)`, `claude.theme.onReload(cb)`,
`claude.appearance.get()`, `claude.appearance.set(prefs)`. That is a five-method slice of a
54-namespace surface, and every call site is null-guarded, so a partial shim degrades to the
built-in themes rather than crashing.

**Wallpaper needs no renderer change.** Inside Electron, theme assets travel over a
`theme-asset://` custom protocol (`src/main/theme-protocol.ts`) that a browser cannot resolve.
But `theme-asset-resolver.ts` passes any value already starting with `http://` through untouched.
So the helper serves `/theme-asset/<slug>/<path>` out of `~/.claude/wecoded-themes/<slug>/` and
rewrites the manifest's asset paths to that address before handing it to `theme.readFile`. The
app's existing resolver then leaves them alone.

<!-- verify: {"path": "youcoded/desktop/src/renderer/themes/theme-asset-resolver.ts", "contains": "startsWith[(]'http://'[)]"} -->

`appearance.set` writes to `~/.claude/youcoded-appearance.json` — the same file the live app
reads. **The helper must never write it.** `appearance.set` is a no-op that logs; the dashboard
reads the active theme and never changes it. Writing that file would reach into Destin's running
app, which `.claude/rules/live-app-safety.md` forbids.

## Branch status — the four pills

Per checkout, four measurements against the repo's default branch:

| Measure | Command |
|---|---|
| uncommitted | `git status --porcelain` line count |
| ahead | `git rev-list --count origin/master..HEAD` |
| pushed | branch exists on `origin` **and** local tip == remote tip |
| merged | `git merge-base --is-ancestor HEAD origin/master` |

Resolved to one pill, most severe wins:

| Pill | Condition | Tone |
|---|---|---|
| **Unsaved work** | uncommitted > 0 | danger — deleting loses files git has never seen |
| **Unpushed work** | uncommitted = 0, ahead > 0, not pushed | warn — commits exist only on this disk |
| **Pushed** | pushed, not merged | ok |
| **Safe to delete** | merged, or ahead = 0, and clean | ok, dimmed |

The ordering is the point. The bug this replaces is that `ahead == 0` was read as "merged or
empty, candidate for cleanup" *before* the dirty count was consulted, so a branch with zero
commits and 40 uncommitted files — the most fragile state there is — was labelled safe. **Dirty
is checked first and outranks everything.**

Counting all checkouts costs one `git worktree list --porcelain` plus four cheap git calls each.
Measured on the existing session hook: ~0.14s for 14 worktrees, so ~0.25s for 24. It runs on load
and on Refresh, not on a timer.

## Launching and tracking

`scripts/run-dev.sh` ends in `npm run dev` in the **foreground** — it does not background itself.
So the helper spawns it as a child in its own process group and keeps the handle. That makes
tracking exact rather than inferred from ports:

- **Running** is "the helper still holds a live child for this checkout" — not a port probe.
- **Stop** kills that child's process group by the pid the helper already owns. It never matches
  on a command-line pattern and never reuses a pid remembered from an earlier listing; both have
  killed the wrong process on this machine before.
- Port offset and Electron profile are assigned per launch from a free-offset pool, so two
  instances cannot collide. A collision today SIGKILLs one of the windows silently.
- `--label` is set to the branch name so the window title matches the row that started it.
- State lives in the helper process. Reloading the page keeps every Running row; restarting the
  helper orphans the windows, which the page reports honestly rather than hiding.

## The suites

All five, with weight stated on the button rather than implied by position.

| Suite | Command | Weight |
|---|---|---|
| Safety check | `bash scripts/verify.sh <checkout>` | ~10s |
| Android tests | `./gradlew test -x bundleWebUi` with `JAVA_HOME`/`ANDROID_HOME` set | minutes |
| Workbench boot | `node scripts/workbench-boot-check.mjs` | seconds |
| Docs audit | `node scripts/audit-anchors.mjs` | seconds |
| UI sweep | `bash scripts/ui-review/run-review.sh <worktree>` | ~5 min, several browsers |
| Model evaluation | `test-engine/harness-eval.mjs --plan <p>` | **paid**, ~$0.25/cell |

`verify.sh` exits 0 for pass and 1 for fail and names each failed check, which maps directly onto
the verdict line. The others are read the same way: exit code for the verdict, captured output
behind the toggle.

**The paid one is gated three ways**: a distinct danger-tone button, a confirm dialog naming the
estimated dollar figure, and `--max-spend` passed on every invocation. It also refuses to run if
`OPENROUTER_API_KEY` is in the helper's environment — that is the CLI's own guard and the helper
must not defeat it by injecting the key.

## Request cleanup

Ticking rows reveals a bottom bar. The button copies a prompt naming each selected checkout, its
branch, its pill and the measurements behind it, and asks for a cleanup plan. It copies; it does
not delete, and it does not open anything.

Deletion stays a conversation. A "delete these worktrees" button one click from a red pill is the
single most dangerous control this page could carry, and nothing in the answers asked for it.

## Security

The helper runs commands, so the page that drives it is an attack surface.

- Binds `127.0.0.1` only.
- Rejects any request whose `Host` is not loopback, and any `Origin` that is not its own — a page
  on another origin could otherwise drive it. This is the guard `scripts/questions/serve.py`
  already runs, for the same reason.
- The checkout to act on is chosen by **id from the helper's own enumerated list**, never by a
  path from the request. No request body ever reaches a shell as a path or an argument.
- Every spawn is `execFile`-style with an argument array. No shell string interpolation anywhere.

## What is being built new, and why locally

The app has no shared primitive for a dense data row, a "show details" disclosure, or a
confirmation dialog. Existing code hand-rolls all three per feature (`<details>` in `SyncPanel`,
`CollapsibleBlock` in `ToolBody`, `DiscardConfirmDialog` wrapping the shared `Dialog`).

These are built **local to the dashboard**, not promoted to `components/ui/`. Inventing three
app-wide primitives to serve a dev tool sets a standard from one call site. If they prove out,
promotion is a later decision made on more than one example.

Reused as-is: `Button`, `Badge`, `StatusStrip`, `Checkbox`, `Dialog`, `LoadingState`,
`ErrorState`, `BrailleSpinner`, `Toast`.

## Known consequences

- **The screen ships to users before Settings uses it.** It compiles into `dist/`, unreferenced.
  `knip` (part of `verify.sh`) will flag it. Handled by registering it in the `?mode=` dispatcher,
  which is a real reference; if knip still objects, an explicit entry with a comment naming the
  Settings roadmap item.
- **A Launch click opens a real window and takes 10–20s.** Chosen deliberately
  (`launch-warning`); the row says "starting…" so it is not clicked twice.
- **The UI sweep slows the machine for ~5 minutes.** Labelled with its weight.
- **Orphaned dev servers hold ports.** The helper's Stop is the fix; CLAUDE.md's existing rule
  about shutting dev servers down after a merge still applies.

## Port

**5240** — clear of the app (5173), dev instances (5223), the workbench (5233), question decks
(5411) and live panes (5513).

## Deferred to roadmap

One item in `docs/roadmap/dev-workspace.md`: the Settings → Development entry point, and the
"offer to add youcoded-dev as a managed synced project when the folder is not on the device"
flow.
