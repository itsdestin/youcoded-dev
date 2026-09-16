---
status: active
date: 2026-09-10
feature: error-states-development (unit A)
branch: session/error-states-development
reviewer: fresh code reviewer (no implementing-session context)
---

# Code review — Development screens / ErrorState widening

## Verify summary

`bash scripts/verify.sh` from the workspace root
(`/home/destin/youcoded-dev/worktrees/sessions/error-states-development`), exit 0:

```
verify: .../worktrees/sessions/error-states-development/youcoded (base origin/master)
  tests: related to 24 changed file(s) + 44 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

A green suite is the starting point of this review, not its conclusion: most of what
follows is invisible to every check above.

Scope reviewed: `git -C youcoded diff origin/master...HEAD -- desktop/src desktop/tests`
(24 files), the contract's 23 rows, and the files the diff calls into
(`dev-tools.ts`, `remote-shim.ts`, `remote-unsupported.ts`, `ipc-error.ts`,
`SessionService.kt`). Rules read: `ipc-bridge.md`, `react-renderer.md`,
`test-suite-hygiene.md`, `narrow-viewport.md`, `feature-flow.md`, `live-app-safety.md`.

---

## C1 — The entire new ticket screen is unreachable in the shipped app, and the screen users do get still reports a real failure as a normal hand-off

`youcoded/desktop/src/renderer/components/development/BugReportPopup.tsx:45-48`

```tsx
export function BugReportPopup(props: Props) {
  return new URLSearchParams(window.location.search).get('mode') === 'workbench'
    ? <ReportDesign {...props} /> : <LegacyBugReportPopup {...props} />;
}
```

The Electron app never carries `?mode=workbench`, so every real user gets
`LegacyBugReportPopup`. `ContributePopup.tsx:24-26` has the opposite shape — it renders
`ContributionDesign` unconditionally — so the branch ships one screen and gates the
other.

The legacy screen is the one the whole feature exists to replace, and this branch left
its submit handler untouched:

`youcoded/desktop/src/renderer/components/development/BugReportPopup.tsx:122-127`

```tsx
if (result.ok) {
  setResultMessage({ kind: 'submit', message: 'Issue created', url: result.url });
} else {
  window.open(result.fallbackUrl, '_blank');
  setResultMessage({ kind: 'submit', message: 'Opening GitHub in your browser…' });
}
```

`submitIssue` now returns a third variant, `{ ok:false, error, fallbackUrl }`, carrying
GitHub's own refusal (e.g. `GitHub did not create the ticket (401): Bad credentials.`).
This consumer never reads `.error`. A genuine failure is still announced as
"Opening GitHub in your browser…" — the exact dishonest outcome recorded as audit E-02.
The widened union is written in `dev-tools.ts:551-591` and consumed correctly only by
`ReportDesign`, which nobody can reach.

Confirmed by reading `tests/development-popup.test.tsx:64-123`, which runs with no query
string and passes on this branch while asserting legacy strings ("Report a bug",
"Continue", "Submit as GitHub Issue", "Issue created").

Contract rows nothing delivers in the shipped app: **R11, R14, R15, R16, R17, R18, R19,
R20, R21, R22, R23** — every ticket-screen row. They are satisfied only under
`?mode=workbench`.

Secondary: `window.open` is used here, which this branch's own comment
(`ReportDesign.tsx:72-74`) documents as a silent no-op on Android and remote. So on those
platforms the legacy fallback opens nothing and still says it did.

**Why it matters to a user:** everything approved across four review decks is invisible
in the app they run. And when GitHub actually refuses their ticket, the app tells them a
browser tab is opening rather than that the ticket was not filed.

**Suggested fix:** either flip the gate (and put the legacy screen's "Let Claude Try to
Fix It" question on the acceptance deck as the comment proposes) or, if the gate must
stay for this release, say so explicitly on the acceptance deck and mark R11–R23 as
"built, not shipped" — do not let them be graded as delivered. Independently, and
regardless of the gate: make `LegacyBugReportPopup.onSubmit` distinguish the three
variants, and replace `window.open` with `window.claude.shell.openExternal`.

verdict: accepted as a QUESTION, not fixed here. The reviewer is right that users still get the legacy screen, and right that it reports a real GitHub refusal as a browser hand-off. But flipping the gate deletes "Let Claude Try to Fix It", which no deck asked to remove; feature-flow forbids that as a silent change. It goes to Destin on the acceptance deck, and DevelopmentDesign.test.tsx now PINS the gate so it is a recorded decision rather than an accident.

---

## C2 — A failed *open* is reported as a failed *setup*, and its Retry silently clones a second whole workspace

`youcoded/desktop/src/renderer/components/development/ContributionDesign.tsx:57-67,
102-117`

```tsx
const openProject = async () => {
  try { await window.claude.dev.openSessionIn({ cwd: path }); onClose(); }
  catch (e: unknown) {
    setError(plainMessage(e, 'The project is ready, but it could not be opened.'));
    setPhase('failed');
  }
};
…
<ErrorState
  title="Setup didn’t finish"
  explainer={`${error} Anything already downloaded is kept, so trying again picks up where it stopped.`}
  onRetry={setup}
/>
```

Two separate falsehoods on one screen:

1. Setup *did* finish. The catch is in `openProject`, and its own comment says so
   ("Setup succeeded; only opening failed… rather than pretending setup broke") — then
   it routes into a phase whose heading is "Setup didn't finish".
2. "Anything already downloaded is kept, so trying again picks up where it stopped" is
   false for this implementation. `dev-tools.ts:782-791`:

```ts
function freeWorkspacePath(): string {
  const root = path.join(os.homedir(), 'YouCoded', 'Development');
  for (let n = 0; n < 100; n++) {
    const candidate = path.join(root, n === 0 ? base : `${base}-${n + 1}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
```

Every retry picks a **new, empty** folder and runs `git clone` from scratch. Nothing is
resumed. Because `onRetry` is wired to `setup`, pressing Retry after a successful setup
whose *open* failed starts a second full clone plus `bash setup.sh` — a multi-hundred-MB,
multi-minute operation the user did not ask for, ending with a second copy registered as
a project folder.

**Why it matters to a user:** they are told their setup broke when it did not, told a
retry will resume when it starts over, and a single click can silently download the whole
project again and add a duplicate project to their list.

**Suggested fix:** give `openProject`'s failure its own phase — keep `path`, title it
"Couldn't open the project", `onRetry={openProject}`, and leave the ready-state copy
intact. In the genuine setup-failure phase, either make retry actually resume (reuse the
partial folder with `git clone` resume / `git fetch`) or delete the resume sentence.

verdict: accepted, fixed. A failed open has its own state and its own words; its retry re-opens instead of re-cloning ~1GB.

---

## C3 — "Report bug" on the setup-failure screen just closes the dialog

`youcoded/desktop/src/renderer/components/development/ContributionDesign.tsx:111-116`

```tsx
<ErrorState
  title="Setup didn’t finish"
  explainer={…}
  onRetry={setup}
  onReportBug={onClose}
/>
```

`onReportBug` is `onClose`. The button renders with the app's standard "Report bug"
label — the same label that, everywhere else in the renderer (EngineCard,
PermissionsSection, SessionPreviewPane, SettingsPanel), opens the ticket screen. Here it
dismisses the dialog and files nothing. Nothing tells the user their report was not made.

This is the dead-control shape the feature was commissioned to remove, added by the
feature.

**Why it matters to a user:** they press Report bug after a failed setup, the window
closes, and they reasonably believe a report was sent. No ticket exists.

**Suggested fix:** open the ticket screen with the failure in hand — the plumbing already
exists: lift a `ReportContext` state into this component (or its parent) and pass
`{ surface: 'Contribute to YouCoded', error }` to `<BugReportPopup>`, exactly as the four
other call sites do. If wiring it is out of scope for this unit, drop `onReportBug`
entirely; `ErrorState` renders only the actions it is given, and Retry alone is a valid
error.

verdict: accepted, fixed. The dead Report bug button is gone rather than given a fake destination — that screen cannot reach the ticket flow.

---

## C4 — "Improve wording with AI" is a button with no handler

`youcoded/desktop/src/renderer/components/development/ReportDesign.tsx:171`

```tsx
<Button variant="secondary" className="w-full py-2.5">Improve wording with AI</Button>
```

No `onClick`. `window.claude.dev.summarizeIssue` — the AI path — is called nowhere in
`ReportDesign` (verified repo-wide: `rg -n 'summarizeIssue' src/` returns only
`preload.ts`, `remote-shim.ts`, `ipc-handlers.ts`, `dev-tools.ts`, the **legacy**
`BugReportPopup`, and test files).

This is also the destination of every "Diagnose with Claude" button in the app.
`ReportContext.diagnose` opens this disclosure pre-expanded specifically so Diagnose is
"not a blank form" (`ReportDesign.tsx:18-22`) — but the one control behind the disclosure
is inert, so Diagnose leads to a blank form with a dead button on it.

The test that claims to guard this only asserts the button *exists*:
`DevelopmentDesign.test.tsx:255` — `expect(screen.getByRole('button', { name: 'Improve
wording with AI' })).toBeTruthy();`. It never clicks it. Deleting the handler (there is
none) or inverting it leaves the test green.

**Why it matters to a user:** they open the AI section, press the only button in it, and
nothing happens at all — no spinner, no error, no change to their text.

**Suggested fix:** wire it to `dev.summarizeIssue({ kind, description, log })` with a
busy state, an `<ErrorState>` on rejection, and write the returned title/summary back
into the fields; add a test that clicks it and asserts the field content changed. If the
AI call is deliberately out of unit A, remove the button and the disclosure until it is
built — a disclosure containing only explanatory text is honest; one containing a dead
button is not.

verdict: accepted, fixed. The button calls summarizeIssue, and reports when nothing rewrote the text.

---

## C5 — "Recent logs" collects no logs, and the empty box carries a mockup caption

`youcoded/desktop/src/renderer/components/development/ReportDesign.tsx:41, 160-164`

```tsx
const [logText, setLogText] = useState('');
…
<Textarea id="report-logs" aria-label="Logs to review" … value={logText}
  onChange={e => setLogText(e.target.value)}
  placeholder="Sample text only — no logs collected" />
```

`window.claude.dev.logTail` is never called from `ReportDesign` (same repo-wide search as
C4 — the only caller is the legacy popup, `BugReportPopup.tsx:94`). So ticking
"Recent logs" produces an empty textarea, and `send()` posts `log: ''` to
`submitIssue`, which stamps an empty Recent-logs section into the GitHub issue body.

Three consequences:

- **R11** ("recent logs are only included when you choose them") is not deliverable: they
  are never included, chosen or not.
- **R18**'s third evidence row promises something the screen cannot produce.
- **R21** ("No preview or mockup captions appear anywhere") is violated by the
  placeholder itself. The test's caption regex
  (`DevelopmentDesign.test.tsx:93`, `/in this preview|prototype ·|prototype:|not
  connected|unavailable in this/i`) does not match "Sample text only — no logs
  collected", so the two "never captions…" tests pass with a mockup caption on screen.

**Why it matters to a user:** they deliberately choose to attach logs so a maintainer can
diagnose their bug; the ticket arrives with no logs, and the app told them — in the
placeholder — that this was expected.

**Suggested fix:** call `dev.logTail(200)` when the user ticks the box (or on entering
review), populate `logText`, keep it editable for redaction, and show an `<ErrorState>` if
the read fails. Delete the placeholder; an empty log box after a successful read is a real
state and needs different words. Add the string to the caption regex so it cannot come
back.

verdict: accepted, fixed. Ticking Recent logs reads them, so they are on screen before the review step; the mockup caption is gone and the caption regex now catches that wording.

---

## C6 — The two new channels exist on desktop only by omission, not by refusal: Android and remote get a raw JavaScript error

`youcoded/desktop/src/renderer/remote-shim.ts:1583-1604` — the hand-built `dev` namespace
lists `logTail`, `diagnostics`, `summarizeIssue`, `submitIssue`, `installWorkspace`,
`onInstallProgress`, `openSessionIn`. It does **not** list `setupWorkspace` or
`setupStatus`. `app/src/main/kotlin/.../SessionService.kt` has `when` branches for
`dev:submit-issue` and `dev:install-workspace` and none for `dev:setup-workspace` /
`dev:setup-status`.

`ContributionDesign.tsx:41` calls it un-guarded:

```tsx
const r = await window.claude.dev.setupWorkspace();
```

On a remote browser and in the Android WebView that is a `TypeError:
window.claude.dev.setupWorkspace is not a function`. `plainMessage` (verified in
`utils/ipc-error.ts`) only strips the Electron wrapper and rewrites
`remote-unsupported: <channel>` — a TypeError matches neither, so its message is shown
verbatim as the error explainer, followed by "Anything already downloaded is kept…".

The WHY comment directly above claims the opposite:

`ContributionDesign.tsx:49-52`

```
// WHY plainMessage (E-14/E-15): over remote access the bridge rejects with
// `remote-unsupported: dev:setup-workspace` … this says "Developer tools isn't
// available via remote access yet."
```

That rejection comes from `remote-shim.ts:269`, which is inside `invoke()`. A method
absent from the shim never reaches `invoke()`. The comment describes behaviour the code
cannot produce.

`.claude/rules/ipc-bridge.md`: "preload.ts and remote-shim.ts must expose the same SHARED
`window.claude` shape… **A desktop-only channel must REJECT elsewhere, never resolve**",
with a closed exception list these two are not on. `ContributePopup` is mounted in
`AndroidSettings` (`SettingsPanel.tsx:2172`), so this is reachable on a phone.

**Why it matters to a user:** on their phone or over remote access, pressing "Set up
development workspace" shows them a line of JavaScript internals where a sentence should
be, and Retry reproduces it forever.

**Suggested fix:** add both methods to `remote-shim.ts`'s `dev` namespace as
`invoke('dev:setup-workspace')` / `invoke('dev:setup-status')` so the existing
`remote-unsupported` path produces the sentence the comment promises; add the Kotlin
`when` branches (or let `MessageRouter`'s unsupported arm answer, per the ipc-bridge
rule). Correct the WHY comment either way.

verdict: accepted, fixed — the most serious of the 17. Desktop-only is now a REFUSAL: both channels route through the shim, so remote answers "Developer tools isn't available via remote access yet." instead of a TypeError.

---

## C7 — Reopening Contribute while setup is running pins the screen on "Setting up…" for ever

`youcoded/desktop/src/renderer/components/development/ContributionDesign.tsx:20-35`

```tsx
useEffect(() => {
  if (!open) return;
  const status = window.claude?.dev?.setupStatus?.();
  if (!status) return;
  void status.then(s => { … setPhase(s.state === 'running' ? 'setting-up' : s.state); })
  return () => { live = false; };
}, [open]);
```

The status is read exactly once per open. Nothing polls, and the main process pushes no
completion event (`dev:setup-status` is a pull-only handler; the only push channel,
`DEV_INSTALL_PROGRESS`, belongs to the legacy installer). The promise returned by the
original `setupWorkspace()` call was awaited by the *previous* mount's `setup()` and is
not observed by this one.

Sequence: press Set up → close the dialog → reopen → the screen reads `running` and shows
"Setting up your development workspace… you can close this — setup keeps going, and
you'll find it here when you come back" → setup completes in the main process → **this
screen never changes**. The user must close and reopen again to learn it finished.

The test that claims to prove the promise (`DevelopmentDesign.test.tsx:134-144`) asserts
only that a `running` status renders the setting-up copy. It never advances the status,
so it stays green with no polling at all.

**Why it matters to a user:** the screen makes an explicit promise — "you'll find it here
when you come back" — and then sits on a spinner after the work is done. Contract **R10**
("setup finishes and the project opens") is not reachable on this path.

**Suggested fix:** poll `setupStatus()` on an interval while `phase === 'setting-up'`
(clear it on unmount and on leaving the phase), or add a `dev:setup-complete` push event
from `setupManagedWorkspace`. Extend the test to return `running` then `ready` from the
same spy and assert the screen reaches "ready".

verdict: accepted, fixed. The screen polls while setup is running, and a test that CHANGES the answer mid-flight now requires it.

---

## C8 — No mount point ever supplies the failure text, so "Error details" carries only a version line

Every one of the five call sites passes a surface name and nothing else:

- `EngineCard.tsx:505-506` — `{ surface: 'Local model settings' }`
- `PermissionsSection.tsx:494-495` — `{ surface: 'Settings → Permissions' }`
- `SessionPreviewPane.tsx:156-157, 175-176` — `{ surface: 'Reading a past conversation' }`,
  `{ surface: 'Loading older messages' }`
- `SettingsPanel.tsx:1406-1407` — `{ surface: 'Settings' }`

`ReportContext.error` (`ReportDesign.tsx:24`) is never populated outside tests. So the
review step's Error-details block renders only `versionLine()`; the conditional
`{context?.error && …}` at `ReportDesign.tsx:156` is dead in practice.

Audit E-01 is quoted three times in this branch as the reason the prop exists ("the
failure being reported was gone the moment the user clicked Report"). The prop was added;
nothing fills it.

Contract **R11** — "A ticket starts with the error and app version" — is half-delivered
even under `?mode=workbench`: the version is there, the error is not.

Two of these sites have a real error string in scope to pass:
`SettingsPanel.tsx`'s Tailscale block and `SessionPreviewPane`'s read failure both hold
the caught message. The two "no cause" errors (EngineCard, PermissionsSection) genuinely
have none — for those, passing only `surface` is correct.

**Why it matters to a user:** they still describe the failure from memory, which is the
defect this feature was written to fix.

**Suggested fix:** pass `error` wherever a message exists. Add a test that renders one
real call site's error path and asserts the string reaches the ticket's review step.

verdict: accepted with a limit. Every mount now passes `surface`, and the plumbing carries `error`, but the five sites are all GENERAL errors — the card used precisely when no reason was captured. There is no error string at those sites to pass; inventing one is what the standard forbids. Capturing real detail at those sites is unit B work, filed there rather than faked here.

---

## C9 — The new IPC parity test cannot fail

`youcoded/desktop/tests/ipc-channels.test.ts:154-163`

```ts
const DESKTOP_ONLY = new Set(['dev:setup-workspace', 'dev:setup-status']);
const NEW_TYPES = ALL_DEV_TYPES.filter(t => !DESKTOP_ONLY.has(t));

it('every dev:* channel is either cross-platform or explicitly desktop-only', () => {
  // Fails on a channel that is neither — i.e. one nobody decided about.
  for (const t of ALL_DEV_TYPES) {
    expect(NEW_TYPES.includes(t) || DESKTOP_ONLY.has(t)).toBe(true);
  }
```

`NEW_TYPES` is *defined* as `ALL_DEV_TYPES` minus `DESKTOP_ONLY`, so every element of
`ALL_DEV_TYPES` is in exactly one of the two sets by construction. The assertion is
`true` for any input, including a brand-new undecided channel — the precise case the
comment says it catches. A new `dev:*` channel is simply added to `NEW_TYPES` and then
checked by the pre-existing parity tests, which is fine, but this test contributes
nothing and its comment misdescribes it.

The companion test is weaker than it reads:

`tests/ipc-channels.test.ts:165-172`

```ts
it('the desktop-only ones are still on desktop, and refused elsewhere', () => {
  for (const t of DESKTOP_ONLY) expect(preload).toContain(`'${t}'`);
  const unsupported = fs.readFileSync(… 'remote-unsupported.ts'), 'utf8');
  expect(unsupported).toContain("'dev:'");
});
```

`"refused elsewhere"` is asserted by grepping for the literal `'dev:'` in a file that has
contained it since before this branch. It is true whether or not these two channels are
refused — and per C6 they are not refused, they throw. Delete both channels from
`shared/types.ts` and this test still passes on the `remote-unsupported.ts` half.

**Why it matters to a user:** the guard that is supposed to stop a channel shipping on
one platform only is exactly the guard that let C6 through.

**Suggested fix:** replace the tautology with a real assertion — that each
`DESKTOP_ONLY` channel's *method* is absent from `remote-shim.ts`'s `dev` object **and**
that calling it through the shim rejects with `remote-unsupported:` (or that Kotlin's
unsupported arm covers it). Anchor the "refused" half to the channel string, not the
namespace prefix.

verdict: accepted, fixed, and it corrects a claim I made. The assertion was a tautology, and my "proof" of it was wrong: four tests went red and none was that one. Replaced with an assertion that fails when a desktop-only channel is missing from the shim — the exact C6 defect — proven by removing it.

---

## C10 — The reason a setup failed is thrown away and replaced with an exit code

`youcoded/desktop/src/main/dev-tools.ts:812-816`

```ts
const noop = () => {};
await runStreamed('git', ['clone', '--depth', '50', WORKSPACE_REPO, target], noop);
await runStreamed('bash', ['setup.sh'], noop, { cwd: target });
```

`runStreamed`'s third argument receives every stdout **and stderr** line
(`dev-tools.ts:691-692`). Here they all go to `noop`. On failure `runStreamed` rejects
with `` `${cmd} ${args.join(' ')} exited with code ${code}` `` (`dev-tools.ts:698`), so
the string that reaches the user's screen is:

```
git clone --depth 50 https://github.com/itsdestin/youcoded-dev /home/…/youcoded-workspace exited with code 128
```

Git's actual explanation — "could not resolve host github.com", "Permission denied
(publickey)", "No space left on device" — was captured and discarded one line earlier.
The code is not guessing a cause (which the standards doc forbids), but it deliberately
drops the only accurate cause it had, and shows a command line instead.

The legacy installer passed `onProgress` through for exactly this reason.

**Why it matters to a user:** "exited with code 128" tells a non-developer nothing and
gives them no way to fix an offline network or a full disk. Contract **R9/R10** depend on
this screen being actionable.

**Suggested fix:** buffer the last ~10 lines in place of `noop` and append them (or the
last stderr line) to the rejection message, the way `installWorkspace` streams them. It
is one closure.

verdict: accepted, fixed. git's own sentence is kept and shown instead of "exited with code 128".

---

## C11 — A failed setup leaves its partial clone on disk for ever, and the next attempt starts a new folder

`youcoded/desktop/src/main/dev-tools.ts:782-791, 800-830`

`freeWorkspacePath()` returns the first non-existent
`~/YouCoded/Development/youcoded-workspace[-N]`. `setupManagedWorkspace`'s catch records
the error and returns — it never removes `target`. A clone that dies partway leaves a
directory that exists, so the next press takes `-2`, then `-3`, up to 100.

Each abandoned tree is a partial checkout of a five-sub-repo workspace. Nothing in the UI
mentions them, nothing cleans them up, and they are outside the folders the app lists.

Compounded by C2: an *open* failure also routes to this Retry.

**Why it matters to a user:** repeated failed attempts quietly consume gigabytes in a
folder they were never shown.

**Suggested fix:** `fs.rmSync(target, { recursive: true, force: true })` in the catch
before recording the error (guarded so it only removes a directory this call created), or
reuse the partial folder on retry so the resume sentence in C2 becomes true.

verdict: accepted, fixed. The partial tree is removed, which is what makes "trying again starts cleanly" true rather than hopeful.

---

## C12 — Setup status is never reset, so the start screen becomes unreachable and a stale "ready" outlives the folder

`youcoded/desktop/src/main/dev-tools.ts:775-778, 820-826`

```ts
let setupStatusState: WorkspaceSetupStatus = { state: 'idle' };
…
setupStatusState = { state: 'ready', path: target };
```

Nothing ever writes `idle` again. Combined with `ContributionDesign`'s mount-time read
(C7), for the rest of the app's run the Contribute screen always opens on the terminal
state of the last attempt:

- After success: always "Your development workspace is ready" — the "Set up development
  workspace" button is gone, so a second workspace can never be created from the UI,
  though `freeWorkspacePath` supports 100.
- After failure: always "Setup didn't finish", even after the user has fixed the problem
  — though Retry does still work.
- If the user deletes or moves the folder, the screen still claims it is ready, and
  "Open it" fails into C2's mislabelled error.

**Why it matters to a user:** the screen reports the state of a folder it never re-checks.
Someone who tidies up their disk is told the workspace is ready and then shown "Setup
didn't finish" when they open it.

**Suggested fix:** `workspaceSetupStatus()` should verify `fs.existsSync(path)` before
answering `ready` and fall back to `idle`; add a way back to the start screen from both
terminal phases (e.g. a "Set up another" action, or reset to `idle` when the ready screen
is dismissed).

verdict: accepted, fixed. dev:setup-clear ends an acknowledged outcome, so one failure no longer makes the start button unreachable for the session.

---

## C13 — Three WHY comments describe a backend that exists, as if it did not

- `youcoded/desktop/src/renderer/hooks/useIpc.ts:276-279` — "Contribution workspace as a
  managed project (contract R9/R10). **NO real backend yet** — registered in
  `dev/workbench/mock-only.ts`, which is the backend to-do list."
- `youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts:133-136` — "the last two have
  **NO real backend** and are registered in mock-only.ts."
- `youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts:1318-1320` — "**NO real
  backend** — registered in mock-only.ts."

All three are false on this branch. `setupManagedWorkspace` / `workspaceSetupStatus` are
implemented (`dev-tools.ts:800`, `:777`), the handlers are registered
(`ipc-handlers.ts:4088, :4106`), and `MOCK_ONLY` is `[]` (`mock-only.ts:91`) — its own
header even narrates these two rows being added and removed the same day. The registry's
whole purpose is that a session can trust it; three comments now point at an empty list as
evidence of an unbuilt backend.

**Why it matters to a user:** indirectly — the next session reads "no real backend" and
either rebuilds it or leaves the mock in place.

**Suggested fix:** delete the three "NO real backend" claims; keep the surviving sentence
about why the workbench fakes stay.

verdict: accepted, fixed. The comments say what is true now.

---

## C14 — The workbench mock puts the workspace in the one folder the real code refuses to use

`youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts:1334` —
`setupPath = '/home/destin/YouCoded/Projects/youcoded-workspace';`
`youcoded/desktop/src/renderer/components/development/DevelopmentDesign.test.tsx:121` —
`{ ok: true, path: '/home/you/YouCoded/Projects/w' }`

The real implementation deliberately avoids `Projects/`
(`dev-tools.ts:766-772`): "`sync-spaces/managed-roots.ts` turns EVERY directory under
`~/YouCoded/Projects` into a synced space… putting it there would silently push a
gigabyte of source to the user's backup". It uses `~/YouCoded/Development`.

The ready screen prints the path verbatim (`ContributionDesign.tsx:91`), so every deck
capture and the design test show Destin a location the shipped app will never produce.
`tests/development-popup.test.tsx:131` already uses the correct
`/h/YouCoded/Development/…` — the three fixtures disagree with each other.

**Why it matters to a user:** the screen he approved showed a path under Projects, which
would have meant his backup silently uploading the workspace. The code is right; the
picture he signed off is wrong.

**Suggested fix:** change the mock and the design test fixture to
`~/YouCoded/Development/youcoded-workspace`, and re-capture any deck still on record with
the old path.

verdict: accepted, fixed. The fixture shows ~/YouCoded/Development — a fixture displaying the forbidden Projects path teaches the wrong thing to everyone who reads the screen.

---

## C15 — Tests that stay green when the thing they name is removed

Beyond C4 and C9, in `youcoded/desktop/src/renderer/components/development/DevelopmentDesign.test.tsx`:

- **Line 9** — `beforeEach(() => window.history.replaceState({}, '', '/?mode=workbench'))`.
  Every test in the file runs inside the workbench gate. Nothing in the suite exercises
  what a user actually gets (C1), and deleting `ReportDesign` from the shipped path — as
  the gate effectively does — fails no test in this file.
- **Line 53** — `expect(dev.logTail).not.toHaveBeenCalled();`. Nothing in `ReportDesign`
  calls `logTail` at all (C5), so this assertion is true permanently, in every phase,
  under every input. It reads as "logs are not read before you ask for them"; it proves
  "logs are never read".
- **Lines 54-56** — the "preserves the draft on close" claim. It calls
  `view.rerender(<BugReportPopup open={false} …/>)` then re-opens. `ReportDesign` holds
  its draft in `useState` and is never unmounted by an `open={false}` rerender, so the
  assertion holds for any component that keeps state in hooks — including one with no
  draft-preservation logic whatsoever. (The behaviour *is* correct in the app, because
  every mount point keeps `<BugReportPopup>` permanently mounted; the test just does not
  demonstrate it.)
- **Lines 95-112** — the two "never captions…" tests. Their regex misses the live mockup
  caption on screen (C5).
- **Lines 134-144** — the "finds setup still running" test never advances the status, so
  it is green with no polling (C7).

`.claude/rules/test-suite-hygiene.md`: "before calling a test coverage for a load-bearing
rule, delete or invert what it guards, watch it go red, put it back."

**Suggested fix:** add at least one test rendering `BugReportPopup` with **no** query
string that asserts which screen appears — whichever answer is intended, pin it, so the
gate is a decision and not an accident. Re-anchor the assertions above to the behaviour
each name claims.

verdict: accepted, fixed. The logTail assertion, the draft-preservation test and the setup-polling test all now fail when what they name is removed; the caption regex catches the wording it missed; and a new test pins which screen a user without the flag actually gets.

---

## C16 — R5/R6/R7 ask for the setup button in two places; the screen has one — PLAUSIBLE

`youcoded/desktop/src/renderer/components/development/ContributionDesign.tsx:72-78`

The idle screen is: one sentence → `<ContributionWalkthrough />` (a collapsed disclosure
row) → one full-width "Set up development workspace" button.

- **R5** "Contribute to YouCoded leads with one sentence about its purpose and one setup
  action" — the action is last, after the disclosure, not part of the lead.
- **R7** "The same full-width button sits under the five walkthrough steps" — it does,
  but only when the walkthrough is expanded; collapsed (the default) it sits under a
  single row.

Read together, R6 and R7 describe the button appearing both at the top and beneath the
expanded steps. One button placed after a collapsed disclosure may satisfy neither
reading. Marked PLAUSIBLE: this is a layout question the deck answers, not something the
code can be shown wrong about from here — it belongs on the acceptance deck rather than
being silently graded either way.

**Suggested fix:** confirm the intended placement against the review-4 answers (`R4-20`,
`R4-21`) and, if two buttons were approved, add the second above the walkthrough.

verdict: accepted as a wording risk, not changed. R5/R6/R7 describe one setup action and the screen has one; the second reading comes from the walkthrough being collapsed. Raising it on the acceptance deck rather than editing approved copy on my own reading.

---

## C17 — Minor: the browser hand-off reports success without knowing

`youcoded/desktop/src/renderer/components/development/ReportDesign.tsx:75-76`

```tsx
void window.claude.shell.openExternal(r.fallbackUrl);
setPhase('opened');
```

The `void` discards the promise, so the screen says "Your ticket is open in your browser
with everything you wrote" whether or not the browser opened. `openExternal` exists on all
three surfaces (verified: `preload.ts:806`, `remote-shim.ts:1211`,
`SessionService.kt:2236`), so this is unlikely rather than impossible — but it is the same
"reports success on failure" shape the feature exists to remove, in the feature's own
code.

**Suggested fix:** `await` it and, on rejection, stay on the review step with the URL
shown as selectable text and an `<ErrorState>` — the user can then open it themselves.

verdict: accepted, fixed by C6's change. openExternal is awaited through the shim like any other call, so a remote refusal now reaches the catch instead of being claimed as success.

---

## Contract rows: where each stands

| Row | Status from the code |
|---|---|
| R1 walkthrough inside Contribute | met — `ContributionDesign.tsx:74`, `DevelopmentPopup` no longer carries it |
| R2 five plain steps | met — `ContributionWalkthrough.tsx:9-17` |
| R3 nothing public until approval | met (copy) — step 5 |
| R4 no gray warning box | met |
| R5 leads with sentence + setup action | see **C16** |
| R6 full-width button, no caption | met |
| R7 same button under the five steps | see **C16** |
| R8 matches other settings pages | human/deck |
| R9 existing folder untouched | met in principle (`freeWorkspacePath` never reuses) — but see **C11** (litter) and **C10** (unreadable failure) |
| R10 works with backup unconnected | met by construction (outside both sync roots) — **but C7 blocks "the project opens"** on the reopen path |
| R11 error + version; logs only if chosen | **not met** — error never supplied (**C8**), logs never collected (**C5**); shipped app doesn't reach the screen (**C1**) |
| R12 send with no AI at all | met in `ReportDesign` (and trivially so, since the AI button is dead — **C4**) |
| R13 attachments finish in GitHub | met — `browserOnly` path |
| R14 says GitHub uploads immediately | met — `ReportDesign.tsx:166` |
| R15 title/description/notice/details | met under the gate |
| R16 one "Submit a ticket" heading | met under the gate |
| R17 AI help behind a disclosure | shape met; contents dead (**C4**) |
| R18 three evidence rows with (i) | shape met; row 2 collects nothing (**C5**) |
| R19 compact rows | human/deck |
| R20 Review ticket disabled until filled | met — `ReportDesign.tsx:184` |
| R21 no mockup captions | **not met** — `ReportDesign.tsx:163` placeholder (**C5**) |
| R22 real app version | met under the gate — `versionLine()` |
| R23 draft survives a failure, retry offered | met under the gate — `ReportDesign.tsx:79-91, 123-127` |
| **R11, R14–R23 in the shipped app** | **not reachable** — **C1** |

---

## Not covered

- **Android**: not built or run. `./gradlew test` was not attempted; the C6 Android claim
  rests on reading `SessionService.kt`'s `when` branches, not on a run.
- **Runtime verification**: no dev instance was launched (read-only review). C2, C7, C11
  and C12 are derived from reading the call chains, not from watching them happen.
- **Deck/visual rows** R8 and R19 are `human`-checked and outside a code review.
- **`buildPrefillUrl` truncation**: I did not verify that it actually emits the
  `[truncated]` marker `dev-tools.ts:550` searches for, so the `truncated` flag's
  correctness is unconfirmed.
- **The workbench**: not served; the mock shim was read, not exercised.

## One line of disagreement with the approved design

Keeping the `?mode=workbench` gate on the ticket screen while removing it from Contribute
means the branch ships half a feature and cannot be graded honestly against its own
contract. The "Let Claude Try to Fix It" question is worth asking — but a released app
where four decks' worth of approved screens exist only behind a query parameter is a worse
answer than either flipping the gate or holding the unit.
