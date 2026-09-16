---
status: active
date: 2026-09-10
reviews: docs/active/plans/2026-09-10-error-states-unit-a-technical-design.md
contract: docs/active/design/2026-09-08-error-states-development/error-states.contract.json
round: 1
---

# Unit A technical design — adversarial review, round 1

Every file:line the design cites was opened in this worktree
(`worktrees/sessions/error-states-development`). Findings are ordered: factual errors about the
code, then the ErrorState widening, then omissions, then contract coverage, then scope.

Leave the `verdict:` line under each finding for triage (`accepted` / `rejected` /
`already handled`).

---

## Part 1 — where the design is factually wrong about the code

### F1 — `dev.environment()` is not needed for R22: the renderer already has the app version

The design says a new IPC is required because "Today only the main process knows it — `submitIssue`
composes the Environment line internally, so the renderer has no way to display what it is about to
send."

Evidence — `youcoded/desktop/src/renderer/components/SettingsPanel.tsx:1` and `:36`:

```ts
declare const __APP_VERSION__: string;
...
const desktopVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
```

`youcoded/desktop/vite.config.ts:36`:

```ts
__APP_VERSION__: JSON.stringify(pkg.version),
```

It is a Vite `define`, a module-scope constant in the renderer, already used at
`SettingsPanel.tsx:2509` to draw the version line on the About row. `__BUILD_CHANNEL__` is defined
the same way. R22's statement is only *"Error details shows your real app version rather than a line
saying nothing was collected."*

Why it matters: `dev:environment` is the single most expensive item in the design. A new `dev:*`
channel costs edits in seven places (see F10), including Kotlin, and drags Android into a unit the
design declares Android-free. R22 can be satisfied with an import.

Suggested change: drop `dev.environment()`. Render the version from `__APP_VERSION__` (hoisted into a
tiny shared module so `SettingsPanel` and `ReportDesign` do not each re-declare the ambient). If
platform/arch/electron are genuinely wanted on the review step, say which contract row asks for them —
none does — or take them from `navigator.platform` and accept they are cosmetic. Keep
`submitIssue`'s main-process `app.getVersion()` as the value actually sent; note in a WHY comment
that the two can differ in a `run-dev.sh` instance.

verdict: accepted — verified: `__APP_VERSION__` is a Vite define (vite.config.ts:36) read at SettingsPanel.tsx:1,36. `dev.environment()` is dropped from the design; R22 renders the existing constant. Platform/arch/electron are dropped entirely — no row asks for them.

---

### F2 — A5's diagnosis is wrong twice: it is not a silent hang, and remote already names the feature

The design: "the shim rejects (`:265–269`) into a report that never catches it. Either serve the
channels remotely or refuse them with an honest message — **not a silent hang, which is what happens
today.**"

Evidence — `youcoded/desktop/src/renderer/remote-shim.ts:242–250`:

```ts
function noteUnsupported(channel: string): void {
  const feature = remoteFeatureName(channel);
  if (announced.has(feature)) return;
  announced.add(feature);
  console.warn(`[remote-shim] not available over remote access: ${channel}`);
  window.dispatchEvent(new CustomEvent(REMOTE_UNSUPPORTED_EVENT, {
    detail: { channel, feature, message: remoteUnsupportedMessage(channel) },
  }));
}
```

`youcoded/desktop/src/renderer/remote-unsupported.ts:28` already maps the namespace:

```ts
['dev:', 'Developer tools'],
```

and `RemoteUnsupportedNotice.tsx:29` listens for that event. So a remote user already sees
*"Developer tools isn't available via remote access yet."*

The residual defect is different and smaller: `LegacyBugReportPopup.onContinue`
(`BugReportPopup.tsx:64–89`) is `try { … } finally { setBusy(false); }`, so the rejection becomes an
unhandled promise rejection, the button flips back from "Summarizing…" to "Continue", and the screen
does not advance. A dead button next to a correct global notice — not a hang, and not silence.

Why it matters: "serve the channels remotely" is a whole remote-server feature nobody asked for, and
it is justified in the design by a symptom that does not exist. No contract row mentions remote
access at all.

Suggested change: rewrite A5 to one sentence — the report screens must `catch` and render the
rejection, which the existing notice already names. Delete "either serve the channels remotely."

verdict: accepted — the honest-refusal half already exists. A5 shrinks to: add the missing catch so a rejection cannot fall through the report flow.

---

### F3 — A4 reuses the legacy installer, which the build plan forbids and an existing test pins red

The design: "`installWorkspace()` (`dev-tools.ts:588–616`) already clones and runs the workspace's own
`setup.sh` (`:614`). Two changes, no new subsystem: 1. Target a managed project path rather than the
fixed `~/youcoded-dev` (`:589`)…"

Evidence — the signed-off predecessor plan,
`docs/active/plans/2026-09-09-error-states-development-build.md:107–110`:

> Build managed setup as a **new path** under the sync-spaces rules; **leave the legacy installer
> where it is.** … Keep the guard that exists: the design must never reach the legacy installer
> (`DevelopmentDesign.test.tsx` → "never connects managed setup to the old installer").

That guard is real — `youcoded/desktop/src/renderer/components/development/DevelopmentDesign.test.tsx:115–125`:

```ts
it('never connects managed setup to the old installer', () => {
  const installWorkspace = vi.fn();
  Object.assign(window, { claude: { dev: { installWorkspace } } });
  render(<ContributePopup open onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Set up development workspace' }));
  ...
  expect(installWorkspace).not.toHaveBeenCalled();
});
```

Wiring the approved button to a retargeted `installWorkspace` turns this test red on the first task
of A4. The design does not mention the test.

Also: the cited line numbers are off. `installWorkspace` is `dev-tools.ts:580–622`; the fixed path is
`:588`; `setup.sh` runs at `:616`, not `:614`.

Why it matters: this is the difference between "change one argument" and "write a second installer."
It changes A4's size estimate and it decides whether an existing guard survives.

Suggested change: state explicitly which it is. If A4 reuses `installWorkspace`, say that the guard
is being replaced and by what (e.g. "managed setup never writes outside
`~/YouCoded/Projects/<name>`"), and get that replacement agreed before the task starts. If it builds
a new path, say the legacy installer and its guard are untouched and that the legacy Contribute
screen is deleted whole.

verdict: accepted — A4 must not route through installWorkspace(); the guard in DevelopmentDesign.test.tsx stays green.

---

### F4 — R13 is mapped onto the wrong code path: `fallbackUrl` is the no-credential fallback, not the attachment hand-off

The design: "**R13** — the user prepares and reviews in YouCoded, then finishes attaching in GitHub.
The browser hand-off is `submitIssue`'s `fallbackUrl` path."

Evidence — `youcoded/desktop/src/main/dev-tools.ts:525–546`:

```ts
const { getGithubClient } = await import('./github-client');
const client = getGithubClient();
const token = client ? await client.getToken().catch(() => null) : null;
if (!client || !token) return { ok: false, fallbackUrl };
...
if (res.status === 201 && res.json?.html_url) {
  return { ok: true, url: String(res.json.html_url) };
}
```

`fallbackUrl` is returned only when there is **no GitHub credential**, or when the REST create fails.
A signed-in user who ticks "Screenshots or files" gets `{ ok: true, url }` — the issue is created via
the API and the browser is never opened, so they never reach the page where GitHub accepts an
attachment. The approved screen already knows this: `ReportDesign.tsx:64` switches the primary button
to **"Continue in GitHub"** when `attachments` is checked. That is a *different* submission route,
not the credential fallback.

The predecessor plan says the same thing the design contradicts
(`2026-09-09-error-states-development-build.md:96–97`): "Keep the existing `dev:submit-issue` text
path **separate** from browser-finished attachments."

Why it matters: as designed, the user who wants to attach a screenshot ends up with a created issue
and nowhere to put the file — R13 fails for exactly the users it exists for.

Suggested change: when `attachments` is true, skip the API create entirely and open
`buildPrefillUrl(...)` in the browser (that helper is already exported and pure). Keep the local
draft. `submitIssue` needs a `preferBrowser` argument or a sibling `dev:prefill-issue-url` call.

verdict: accepted — R13 needs a submit path that reaches GitHub for a signed-in user, not the no-credential fallback. Redesigned in A3.

---

### F5 — "14 existing call sites in 7 files" counts a comment; there are 13, and one is already actionless

Evidence — `rg -n '<ErrorState' youcoded/desktop/src` returns 14 lines, but one is prose,
`youcoded/desktop/src/renderer/components/EngineCard.tsx:125`:

```ts
  // every other <ErrorState mode="general"> in the app uses.
```

Real call sites, 13 across 7 files: `EngineCard.tsx:497`, `PermissionsSection.tsx:489`,
`SettingsPanel.tsx:1394,1401`, `SessionPreviewPane.tsx:149,151,168,170`,
`SpecialistsSection.tsx:205,266,306`, `MarketplaceScreen.tsx:305`, `ActiveArtifactView.tsx:508`.
(Three more render in `desktop/tests/ui-primitives.test.tsx:628,638,648`.)

Worse for the design's own argument, `ActiveArtifactView.tsx:508` already defeats the invariant A6
says the type protects:

```tsx
<ErrorState message={readState.message} onRetry={onRetryRead ?? (() => {})} />
```

A no-op arrow satisfies `onRetry: () => void`. The user gets a Retry button that does nothing. No
type can see that.

Why it matters: "keep all 14 compiling" is the acceptance test the design sets itself, and the count
is wrong, so a build agent will chase a fourteenth site that is a comment. And the claim that the old
union "enforced structurally" that an error always has an action is not true in practice today.

Suggested change: correct the count to 13 in 7 files. Add one line to A6: `ActiveArtifactView.tsx:508`
passes a no-op Retry and must either get a real retry or move to a general-mode error — otherwise the
widening ships on top of a site that already contradicts its premise.

verdict: accepted — 13 call sites, not 14. The no-op Retry at ActiveArtifactView.tsx:508 is a real defect but belongs to unit B, not A6; filed there rather than fixed in passing.

---

### F6 — the design's `dev` API table is drawn from a range that does not contain half of it

The design: "`window.claude.dev`, from the legacy flow (`BugReportPopup.tsx:66–110`)" and then lists
seven calls including `installWorkspace`, `onInstallProgress` and `openSessionIn`.

Evidence: within `BugReportPopup.tsx`, `diagnostics()`/`logTail()` are at `:77–78`, `summarizeIssue`
at `:83`, `submitIssue` at `:98`; `onInstallProgress` is at `:122`, `installWorkspace` at `:126`,
`openSessionIn` at `:133`. The cited `66–110` contains four of the seven.

Additionally, the renderer's declared type is looser than the table says —
`youcoded/desktop/src/renderer/hooks/useIpc.ts:265`:

```ts
submitIssue: (args: {...}) => Promise<{ ok: boolean; url?: string; fallbackUrl?: string }>;
```

That is **not** a discriminated union in the renderer (it is one only inside `dev-tools.ts`), so
`result.url` is `string | undefined` after `if (result.ok)`. Any A3 code written against the design's
table will need a non-null assertion or a narrowing helper.

Suggested change: cite `BugReportPopup.tsx:64–141`, and note that `useIpc.ts:258–269` is the type the
renderer actually sees — tightening it to the union is a two-line change worth doing while A3 is open.

verdict: accepted — the call table is rebuilt from preload.ts rather than from one function body.

---

### F7 — line-number drift across the document

Not individually serious, but a build agent will `sed -n` these ranges and find the wrong code.

| Design says | Actually |
|---|---|
| `BugReportPopup.tsx:12–15` props | `:13–16` |
| `BugReportPopup.tsx:30–38` "starts from an empty description" | the gate + function signature; `description` is `useState('')` at `:41` |
| `BugReportPopup.tsx:80` summarizeIssue call | `:83` |
| `onContinue (:66–88)` | `:64–89` |
| `onSubmit (:89–110)` | `:91–116` |
| `DevelopmentPopup.tsx:47` `onOpenBug` | `:45` (`:47` is the Contribute row) |
| `dev-tools.ts:588–616` installWorkspace | `:580–622` |
| `dev-tools.ts:614` setup.sh | `:616` |
| `dev-tools.ts:589` fixed path | `:588` |
| `service.ts:588–612` registerProject | `:586–592` (`:606–612` is `backfillRegistry`) |
| `ContributePopup.tsx:91–98` "offers Done on failure" | `:99–107`; Done is `:105` |

`ui/states.tsx:90–108`, `dev-tools.ts:51–60`, `dev-tools.ts:133–168`, `preload.ts:953–956`,
`remote-server.ts:2725–2728` and `remote-shim.ts:265–269` all check out.

Suggested change: fix the table above, or drop line numbers in favour of symbol names, which do not
rot.

verdict: accepted — line numbers replaced with symbol names throughout. They rot; symbols do not.

---

### F8 — `registerProject` is not a callable API

The design lists it beside preload IPC: "`createProject` / `importProject` (`preload.ts:953–956`),
`registerProject` (`service.ts:588–612`)".

Evidence — `youcoded/desktop/src/main/sync-spaces/service.ts:586`:

```ts
function registerProject(name: string, root: string): void {
```

No `export`. Same for `backfillRegistry` at `:606`. Both are internal to `service.ts` and are already
called by `syncSpacesCreateProject` (`:616`) and by `startEngine` (`:363`). There is nothing for A4 to
call and nothing to add.

Suggested change: delete `registerProject` and `backfillRegistry` from the "what we can call" list.
The only public entry point is `window.claude.syncSpaces.createProject(name)`, and registration is its
side effect.

verdict: accepted — registerProject/backfillRegistry are module-private. Removed from the design.

---

## Part 2 — the ErrorState widening

### F9 — the widening can be enforced at the TYPE level; a test alone is strictly weaker

The design leaves it open: "Keep it enforced at the type level, or pin it with a test that fails on an
actionless `<ErrorState>` — decide when writing it."

A runtime test is weaker than the design implies. If the type permits an actionless error, a test only
catches the one actionless render it happens to write; a new call site that omits every action still
compiles and still ships. The type is the only thing that fires on code nobody wrote a test for.

Concrete type that (a) accepts all 13 existing call sites unchanged, (b) allows retry + report +
diagnose in any combination, (c) refuses zero actions, and (d) refuses an error with no text:

```ts
type ErrorStateCommon = {
  /** Layout hint, no longer a discriminant: 'general' stacks, 'recoverable' is a row. */
  mode?: 'recoverable' | 'general';
  variant?: StateVariant;
  className?: string;
  onRetry?: () => void;
  onReportBug?: () => void;
  onDiagnose?: () => void;
};

// Text: a specific message, OR a general title + explainer. Never both, never neither.
type ErrorStateText =
  | { message: React.ReactNode; title?: never; explainer?: never }
  | { title: React.ReactNode; explainer: React.ReactNode; message?: never };

// At least one action. An object carrying none of the three matches no member.
type ErrorStateAction =
  | { onRetry: () => void }
  | { onReportBug: () => void }
  | { onDiagnose: () => void };

export type ErrorStateProps = ErrorStateCommon & ErrorStateText & ErrorStateAction;
```

Checks against the real sites:

- `<ErrorState message onRetry />` (`ActiveArtifactView.tsx:508`) — `message` branch + `onRetry`
  member. Compiles, `mode` still optional.
- `<ErrorState mode="recoverable" message onRetry variant="inline" />`
  (`SpecialistsSection.tsx:205,266,306`, `SessionPreviewPane.tsx:168`) — compiles; `variant` moves to
  the common bag, which also *widens* general mode to accept `variant` (it could not before).
- `<ErrorState mode="general" title explainer onReportBug onDiagnose />` (five sites) — `title`
  branch + `onReportBug` member, `onDiagnose` supplied from the common bag. Compiles.
- `<ErrorState message="x" />` — matches no `ErrorStateAction` member. **Refused.**
- `<ErrorState onRetry={fn} />` — matches no `ErrorStateText` member. **Refused.**
- `<ErrorState message="x" title="y" onRetry={fn} />` — `title?: never` refuses it. **Refused.**

Two consequences to write down rather than discover:

1. `mode` stops narrowing inside the component. The body must branch on what is present
   (`'title' in props`, and which callbacks exist) rather than on `props.mode === 'general'`.
   Keeping `mode` as an explicit layout override is fine; defaulting it from `'title' in props` keeps
   every current site rendering exactly as it does now.
2. The `general` layout currently hard-codes the two buttons in a fixed order
   (`states.tsx:132–139`). With independent actions it must render only the callbacks it was given,
   in a stated order. Pick one — Retry primary, Report bug and Diagnose secondary — and pin it, or
   three-button errors will look different on every screen.

Pin the refusals so the type cannot silently loosen. `tsc --noEmit` already runs over the test tree
(`desktop/tsconfig.tests.json`, per `scripts/verify.sh`), so `@ts-expect-error` lines are a real
guard, not decoration:

```tsx
// @ts-expect-error an error with no action is a dead end (docs/error-message-standards.md)
render(<ErrorState message="Fetch failed" />);
// @ts-expect-error an error with no text says nothing
render(<ErrorState onRetry={() => {}} />);
```

`@ts-expect-error` is already used in this repo (`tests/game-reducer.test.ts`,
`tests/mcp-startup-wiring.test.ts`), so the pattern is established.

Suggested change: adopt the type above plus the two `@ts-expect-error` pins, and say so in A6 instead
of deferring the decision to the build agent. Do both, not either.

verdict: accepted — do both. The type is the guard that fires on code nobody wrote a test for; the test pins the rendered behaviour. Using the proposed type plus the two @ts-expect-error pins.

---

## Part 3 — what the design does not say that will bite

### F10 — "the screens already exist" is false for every screen that shows an outcome

This is the design's load-bearing claim: "**So 'make the screens real' is not a rewrite.** It is:
give the design components their backend."

Evidence — the approved components have no outcome states at all.
`ContributionDesign.tsx` is 18 lines: one sentence, the walkthrough, and one button with **no
`onClick`** (`:15`). There is no installing state, no progress, no success, no failure, no "open the
project" action. The legacy screen it replaces has all four
(`ContributePopup.tsx:94–118`).

`ReportDesign.tsx` is draft → review and stops. `:64` is:

```tsx
<Button className="w-full py-2.5">{attachments ? 'Continue in GitHub' : 'Submit public ticket'}</Button>
```

No handler, no submitting state, no result screen, no failure state, no AI-help result. The legacy
flow has a third `ResultScreen` (`BugReportPopup.tsx:282–305`).

Why it matters: three contract rows describe outcomes that have no approved surface —
**R10** ("setup finishes and the project opens"), **R13** (finishing in GitHub) and **R23** (failure
keeps the draft and offers retry). A backend cannot be attached to a screen that does not exist. Per
`.claude/rules/feature-flow.md` → "Reopen only through a deck", inventing those screens during the
build is exactly the thing the rule forbids.

Suggested change: say plainly which new surfaces A3 and A4 must draw (submitting, submitted, failed,
setting-up, set-up, setup-failed), and route them through a one-step deck **before** the build tasks
start, not after. That is one deck, and it is cheaper than discovering it at acceptance.

verdict: accepted — this is the finding that changes the plan. The approved screens genuinely stop at draft/review and at one handler-less button; three contract rows describe outcomes with no surface. The missing states get built in the workbench and go to Destin on one deck BEFORE the backend tasks, per feature-flow.

---

### F11 — moving `summarizeIssue` behind the review disclosure breaks "Diagnose with Claude" at five sites

The design, A2: "`summarizeIssue` is called from that disclosure's button and from nowhere else. The
legacy `onContinue` call … does not survive."

Evidence — `SettingsPanel.tsx:1223–1230` is explicit about what the app promises today:

```ts
/**
 * Opens the app's existing bug-report surface (BugReportPopup, which wraps
 * dev:summarize-issue + dev:submit-issue). Both actions on a general
 * ErrorState land here: "Report bug" files it, "Diagnose with Claude" is the
 * same popup's summarize path, which collects the logs. One destination, no
 * invented flow.
 */
onReportIssue: () => void;
```

Five general-mode errors route `onDiagnose` into this popup: `SettingsPanel.tsx:1401`,
`SessionPreviewPane.tsx:151` and `:170`, `PermissionsSection.tsx:489`, `EngineCard.tsx:497`. Once the
summarize call moves behind a disclosure the user has to open on the review step, "Diagnose with
Claude" opens a blank ticket form and diagnoses nothing.

`docs/error-message-standards.md` defines that action as "hand the real error context to Claude for
investigation." Silently making it a no-op is a regression against the standard this whole feature
exists to serve.

Suggested change: A2 must say what "Diagnose with Claude" does after the change — either it opens the
ticket with the AI disclosure already expanded and the log already selected, or those five sites need
a different destination. Add a guard test that clicking Diagnose reaches the AI disclosure.

verdict: accepted — a straight regression the design would have caused. Diagnose with Claude must still reach the AI path; specified in A2 and pinned by a test.

---

### F12 — the gate is in THREE files, not two, and removing it ships an unreviewed row and a size change

The design: "gated behind `?mode=workbench` by a one-line check in each legacy popup
(`BugReportPopup.tsx:32–34`, and the same idiom in `ContributePopup.tsx`)."

Evidence — there is a third, and it is not a wrapper swap.
`DevelopmentPopup.tsx:28`:

```ts
const design = new URLSearchParams(window.location.search).get('mode') === 'workbench';
```

It drives four things (`:33`, `:39`, `:44`, `:50`, `:55`, `:60`):

- dialog `size={design ? 'panel' : 'prompt'}` — a visible size change to the Development menu;
- an intro paragraph that only exists in design mode;
- three different row descriptions and a retitled "Known issues";
- **an entire extra row, "Roadmap"**, linking to `youcoded-dev/blob/master/ROADMAP.md`.

No contract row covers a Roadmap row or the Development menu's size. Removing the gate ships both.

Why it matters: Destin sees a Development menu that changed size and grew a row he never approved,
in a change he was told was about two other screens. That is exactly the "unexpected change I can't
trace back to this work" failure.

Also affected: `DevelopmentDesign.test.tsx:9` does `window.history.replaceState({}, '', '/?mode=workbench')`
in `beforeEach` and `:16` clicks the design-only Roadmap row. After gate removal the file's premise is
vestigial and several of its tests render `ReportDesign` with **no `window.claude` stub at all**
(`:55`, `:78`, `:92`, `:99`, `:111`) — the moment the real component reads anything off
`window.claude.dev`, those five tests throw.

Suggested change: list all three gates. Decide the Roadmap row and the dialog size on a one-step deck
(they are one slide together). Add to the "remove the gate" task: rewrite `DevelopmentDesign.test.tsx`
without the URL stanza, and give every test a `window.claude.dev` stub.

verdict: accepted — three files, plus the unapproved Roadmap row and the dialog size change. The gate comes out as its own task with those consequences listed, not as a one-line cleanup.

---

### F13 — Android is not unchanged, and the surfaces list is incomplete

The design: "Android is unchanged by unit A."

Evidence — `youcoded/desktop/tests/ipc-channels.test.ts:135–163` holds `dev:*` to three-platform
parity:

```ts
it('all dev:* types are handled by SessionService.kt (Android)', () => {
  ...
  for (const t of NEW_TYPES) expect(src).toContain(`"${t}"`);
});
```

and Android does implement them —
`youcoded/app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:3224, 3233, 3257, 3286, 3362, 3454, 3461`.
Adding `dev:environment` means either a Kotlin handler (Android change) or leaving it out of
`NEW_TYPES`, which means the new channel is the only unguarded one.

The full set of surfaces a new `dev:*` channel touches, none of which the design names:
`desktop/src/shared/types.ts:1828+` (IPC map), `desktop/src/main/preload.ts:324+` (second IPC map)
and `:899` (impl), `desktop/src/main/ipc-handlers.ts:4028+` (handler),
`desktop/src/renderer/remote-shim.ts:1584` (shim), `desktop/src/renderer/hooks/useIpc.ts:258`
(the `Window.claude` type — a fourth copy), `SessionService.kt`, and `tests/ipc-channels.test.ts`.

Separately: the design says Android "has an SDK on this machine," which is true
(`/home/destin/.android-sdk` exists) but **contradicts this worktree's own `CLAUDE.md`** → Local build
& test, which states at length that no SDK is installed. One of them is stale guidance a later session
will trust.

Suggested change: if F1 is accepted, `dev.environment()` disappears and so does most of this. If it is
not, enumerate the seven surfaces as a task, and fix or flag the stale `CLAUDE.md` paragraph.

verdict: accepted — any new dev:* channel drags in Kotlin parity. Since F1 and F2 remove the new channels, unit A adds none; that claim is now true rather than assumed.

---

### F14 — A1 threads the error through five mount points, not "one callback"

The design: "The renderer's existing chain is `Settings → DevelopmentPopup.onOpenBug()`
(`DevelopmentPopup.tsx:47`), which today takes no arguments; widen that one callback."

Evidence — `<BugReportPopup>` is mounted in five places, each with its own `showBugReport` boolean:

```
EngineCard.tsx:507         <BugReportPopup open={showBugReport} onClose={...} />
PermissionsSection.tsx:529 <BugReportPopup open={showBugReport} onClose={...} />
SessionPreviewPane.tsx:186 <BugReportPopup open={showBugReport} onClose={...} />
SettingsPanel.tsx:2168     <BugReportPopup open={showBugReport} onClose={...} />
SettingsPanel.tsx:2469     <BugReportPopup open={showBugReport} onClose={...} />
```

`SettingsPanel` carries the whole block twice — `:2165–2169` (Android settings) and `:2466–2470`
(desktop) — so every edit lands twice. Four of the five sites are the general-mode errors from F11,
which are precisely the callers that have an originating error to pass.

Widening `DevelopmentPopup.onOpenBug` changes only the Settings-menu entry, where there is no
originating error at all.

Suggested change: A1's unit of work is `BugReportPopup`'s own props (`context?: ReportContext`) plus
five call sites, not one callback. Say so, and say whether the five booleans become
`useState<ReportContext | null>` (they should — the boolean and the context must not drift apart).

verdict: accepted — five mount points, not one callback. A1 threads the error through all of them or none.

---

### F15 — a managed dev workspace becomes a synced space, and the contract forbids telling the user

A4 says: "Target a managed project path … and register it as a space."

Evidence — a managed project is a sync space, and the transport commits the whole tree.
`youcoded/desktop/src/main/sync-spaces/git-transport.ts:350` and `:456`:

```ts
const add = await this.git(space, ['add', '-A']);
```

`managed-roots.ts:47–52` makes every project directory a space. The thing being registered is a
YouCoded dev workspace: `setup.sh:36` clones the sub-repos, and this checkout's `youcoded/` alone is
**969 MB**. It contains five nested `.git` directories, and `setup.sh` runs npm work.

So enabling this quietly means: nested repositories inside a `git add -A` superproject, and a
multi-gigabyte tree pushed to the user's backup remote. The only backstop is
`git-transport.ts:426–448`, which unstages files over a size cap one at a time — a per-file guard, not
a per-tree one.

And R10's answer (questions-2, 2026-09-10) says **"Nothing on this screen mentions backup or sync in
any case."** So the user is never told.

Why it matters: the user clicks "Set up development workspace" and, with no mention anywhere, starts
uploading a gigabyte of source to their backup. That is the kind of surprise that costs trust in the
next proposal, and on a metered connection it costs money.

Suggested change: decide and write down whether the new project is a **synced** space or a local
managed folder. If R9/R10 only need "a folder the app knows about," register it as a saved folder
(`ipc-handlers.ts:4064–4075` already does exactly that for the legacy install) and do **not** add it
to sync-spaces. If it must sync, the "no mention of backup" decision has to be re-asked on a deck,
because silence is no longer honest.

verdict: accepted — verified independently: youcoded/ is 969 MB, git-transport.ts:350,456 stage with `git add -A`, and the tree holds nested .git directories. The new project is registered as a saved folder, NOT a sync space. Nothing is uploaded, so "the screen never mentions backup" stays honest instead of becoming concealment. Destin is told this directly.

---

### F16 — A4's create path has an unguarded null, no repeat-run behaviour, and no name

Evidence — `youcoded/desktop/src/main/sync-spaces/service.ts:614–615`:

```ts
export async function syncSpacesCreateProject(name: string) {
  const result = roots!.createProject(name);
```

`roots!` is a non-null assertion. Every sibling in the file guards properly, e.g. `:515`:

```ts
if (!roots) return { ok: false as const, error: 'Sync is still starting up — try again in a moment' };
```

`roots` is only set in `startSyncSpaces` (`:225`), so a setup click before/despite that throws a raw
`TypeError` into the IPC layer — a general error with no cause, from a screen whose whole point is
good error states.

And `managed-roots.ts:37–44`:

```ts
createProject(name: string): CreateResult {
  const err = validateSyncName(name);
  if (err) return { ok: false, error: err };
  const dir = path.join(this.projectsRoot, name);
  if (fs.existsSync(dir)) return { ok: false, error: 'A project with that name already exists' };
```

A second click on "Set up development workspace" — very likely, since the first run clones five repos
and takes minutes with no progress UI (F10) — fails with *"A project with that name already exists"*
and no way forward. The design does not name the project either, so `validateSyncName` acceptance is
unknown.

Suggested change: A4 must state (a) the project name, (b) what happens on a second run — the correct
answer is almost certainly "open the existing one," which is also R9's "existing folder untouched" —
and (c) that `syncSpacesCreateProject`'s `roots!` gets the same guard its siblings have.

verdict: accepted — moot for the sync path (F15), but the repeat-run hole is real: a second Set up click must be a defined outcome, not an error. Specified in A4.

---

### F17 — the AI help path fails silently by design

A2 wires "Improve wording with AI" (`ReportDesign.tsx:58`) to `summarizeIssue`. That function cannot
report failure — `dev-tools.ts:411–435`:

```ts
} catch {
  return fallbackSummary(args.description);
}
```

and `:475–481` returns the user's own description back as `title`/`summary`. So if `claude` is not
installed, not signed in, times out at 30s, or returns unparseable text, the button spins and hands
back the text the user already wrote, with no indication anything failed.

`docs/error-message-standards.md` forbids exactly this shape of silence: a failure is specific and
accurate, or general and non-committal with the two actions. It is not "pretend it worked."

Suggested change: A2 must give `summarizeIssue` a failure channel (`{ ok: false, error }`) or the
renderer must detect the identity case, and the disclosure must render an `ErrorState`. This is one of
the few places in unit A where the feature's own subject matter applies to itself.

verdict: accepted — an AI button that silently returns your own text is exactly the dishonest-error class this feature exists to remove. summarizeIssue must report that it did nothing.

---

### F18 — R23 has no trigger: `submitIssue` never rejects on desktop

The design: "`onSubmit` … is a `try/finally` with **no `catch`**, so a rejection today shows nothing at
all."

The `no catch` observation is right (`BugReportPopup.tsx:91–116`), but the conclusion does not follow.
`submitIssue` (`dev-tools.ts:512–547`) catches everything and always returns a value; the renderer
then does `window.open(result.fallbackUrl)` (`BugReportPopup.tsx:109`). On desktop the only way to get
a rejection is an IPC-layer failure or the remote shim (F2).

So today a failed submit does not "show nothing" — it silently downgrades to a browser tab and reports
"Opening GitHub in your browser…", i.e. a failure dressed as a normal outcome. R23's promise ("your
title, description and chosen details stay in the draft and you can retry") has no code path that can
fire.

Additionally, `window.open` is a dead call on Android and remote — the repo already documents this at
`tests/ipc-channels.test.ts:171–176`: "React runs under `file://` there, so the shim's `window.open`
fallback silently does nothing and the tile would be a dead button." The fallback path uses
`shell:open-external` elsewhere for this reason.

Suggested change: A3 must define what counts as a failure the user is told about (non-201 REST, no
credential when the user did not ask for the browser route, IPC rejection), give `submitIssue` a
distinguishable failed result, and route the browser hand-off through `shell:open-external` rather
than `window.open`.

verdict: accepted — R23 had no trigger. submitIssue gets a distinguishable failed result, and the browser hand-off goes through shell:open-external so it is not dead on Android and remote.

---

## Part 4 — contract rows the design does not deliver

Row-by-row, restricted to what the design is responsible for. Rows R1–R8, R15, R16, R18, R19, R20, R21
are already satisfied by the approved components and are not repeated here.

### F19 — rows with nothing in the design that satisfies them

- **R10** — *"You can start working in the new project on this device even when its backup has not
  connected."* The design argues local-only is a normal outcome, which is correct, but the threshold
  is *"setup finishes and the project opens"* and `ContributionDesign.tsx` has **no open action**
  (F10). The legacy screen's "Open in New Session" (`ContributePopup.tsx:115`) has no replacement.
  Nothing in the design creates one.
- **R13** — mis-mapped onto the credential fallback (F4); as designed, a signed-in user never reaches
  GitHub to attach anything.
- **R23** — no failure surface exists on the approved screen (F10) and no code path can produce a
  reportable failure (F18). The design names the row and the defect but delivers neither the trigger
  nor the screen.
- **R11** — half delivered. `context` defaults true in `ReportDesign.tsx:13` and the version line is
  reachable (F1), but the *error* half has nowhere to render: `:41–44` shows only a version string.
  A1 says the context is "shown in the ticket, editable or at minimum removable" — that is new UI on
  an approved screen (F20).
- **R3** — *"Nothing becomes a public proposal until you approve it at the last step."* Today this is
  copy in a walkthrough (`ContributionWalkthrough.tsx:16`). Once A4 is real it becomes a claim about
  behaviour, and the design proposes no mechanism and no guard.

verdict: accepted — R10, R13 and R23 are covered by the new outcome screens (F10); R11 and R3 are tightened in A1 and A2.

---

### F20 — A1 changes approved UI without a deck

`.claude/rules/feature-flow.md` → "Reopen only through a deck": "when implementation contradicts
approved UI, serve a one-step QUESTION deck … and wait; the answer amends the row's `source`."

A1 requires the originating error to be visible and removable on a screen whose approved form has no
such element, and F10 requires four to six new outcome screens. The design decides all of this in
prose.

Suggested change: fold F10's and F20's new surfaces into a single one-step deck served before the
build tasks start. One deck, one wait — versus discovering at acceptance that half the screens were
never approved.

verdict: accepted — the new outcome states are new UI and go on a deck before they are wired. One deck, one round.

---

### F21 — upgrading `human` rows to `mechanical` silently removes Destin's yes/no

The design: "Eight contract rows are `human` today and are behaviour a test can settle — R12, R20,
R22, R23 in particular. **Each gets a real guard during the build, and the row is upgraded to
`mechanical`.**"

Evidence — `scripts/ui-review/deck/contract.py:197` and `:220–227`:

```py
GRADED = ('mechanical', 'deck')
...
human = [... for r in st['rows'] if r.get('checkedBy') in ('human', 'live-app')]
```

The acceptance deck asks Destin one yes/no per `human` and `live-app` row. A row promoted to
`mechanical` is graded by a fresh grader against the test file and **disappears from the questions he
is asked**. R20 ("stays inactive until you have typed a title and description") and R23 ("your draft
stays and you can retry") are exactly the rows where a passing test and a good experience are
different things. Nothing in the tooling re-validates the signature after rows are edited, so this
change to a signed contract is silent.

Suggested change: add the guards without changing `checkedBy`. A `human` row can carry a `guard`
path and still be asked. If a promotion is genuinely wanted, propose the specific rows on the
acceptance deck rather than editing the signed contract mid-build. R12 and R22 are the only two
defensible promotions; R20 and R23 should stay human.

verdict: accepted, and this corrects an instruction I wrote. Promoting a row to mechanical removes it from what Destin is asked at acceptance (deck/contract.py:197,220-227). R20 and R23 stay human and get tests anyway — the test is the engineering guard, the row is his question. The design said to upgrade rows; that was wrong and is removed.

---

## Part 5 — more work than the contract requires

### F22 — scope creep, ranked

1. **`dev.environment()` and the seven-surface IPC** — zero contract rows require it (F1, F13).
   Removing it deletes an Android task from a unit declared Android-free.
2. **"Either serve the channels remotely"** (A5) — no contract row mentions remote access, and the
   symptom that motivates it does not exist (F2). The honest version is a `catch`.
3. **A6 delivers no contract row.** Nothing in R1–R23 mentions the error primitive; it is unit B's
   hinge, carried in unit A by the build plan. That is fine, but the design should say it outright so
   the grader is not looking for a row it satisfies, and so A6 stays a widening — not a migration, not
   a redesign of the general-mode layout beyond what F9's independent actions force.
4. **`{version, platform, arch, electron}`** — R22 asks for the version. Platform, arch and Electron
   are the mockup's placeholder string (`ReportDesign.tsx:43`), not a promise.

Given Destin's stated view that too much time has gone into these two screens, items 1 and 2 are the
two largest removable pieces of unit A and neither is owed to him.

verdict: accepted — F1 and F2 remove most of it. A6 stays despite satisfying no row: it is the prerequisite for unit B, which is goal 1 and the larger half of the work.

---

## Cross-check: what the design gets right

Stated so triage does not re-litigate it: the `states.tsx:90–108` union description, the `redactLog`
scope claim (`dev-tools.ts:51–61` — home path plus two token regexes, nothing else) and the refusal to
call it sanitization, `buildPrefillUrl`'s truncation (`:133–169`), `importProject` MOVING a folder
(`preload.ts:955`, and `import-project.ts` confirms it) and being the wrong call for R9, the ordering
argument for A6 before A1, and "the gate comes out LAST" are all correct and well judged.
