---
status: draft
date: 2026-09-07
branch: feat/assistant-settings
design: docs/active/specs/2026-09-07-assistant-settings-backend-technical-design.md
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
round: 2
previous: docs/active/reviews/2026-09-07-assistant-settings-design-review-1.md
reviewer: adversarial design review (round 2)
verified_against: /home/destin/youcoded-dev/worktrees/assistant-settings-ui @ 27edceaf
---

# Assistant settings — backend technical design, review round 2

Round 1's fifteen findings are not restated. Everything below was read against the branch at
`27edceaf` (the attention-dot fix, one commit past the branch round 1 read).

## Citations I checked and found correct — no finding

- `SessionStrip.tsx:378` (`useState<Runtime>(() => defaultRuntime())`), `:379`
  (`loadLastBinding()`), `:390` (`const modelChoice`), `:396` (`const applyModelChoice`),
  `:764` (post-create `setNewModel`), `:2420` (menu → New Session). All six land exactly on
  what the design says they land on.
- `App.tsx:478` (`sessionDefaults` object literal, inferred shape has no `startModel`) and
  `:3518` (welcome form open handler). Correct. The welcome form has exactly one opener
  (`setWelcomeFormOpen(true)` appears once, at `:3521`), so applying `startModel` in that
  handler really does cover the surface.
- `ipc-handlers.ts:1337-1370` — `defaults:get` at 1337, `defaults:set` ending at 1372;
  generic merges, `startModel` survives. `remote-server.ts:1942-1965` — same, exact.
- `main.ts:399` is the stale comment; `:1708` is `await remoteServer.start()`; `:1790` is
  `createWindow(...)`, which is where `registerIpcHandlers` (`:977`) is reached. The ordering
  claim holds.
- **T2's insertion point is genuinely available.** `app.whenReady()` opens at `main.ts:1498`
  and `remoteServer.start()` is at `:1708` inside that resolved block; `path`, `os` and `fs`
  are imported at `main.ts:2, 22, 23`, and the defaults path is a plain
  `path.join(os.homedir(), '.claude', 'youcoded-defaults.json')` (`ipc-handlers.ts:2161`), so
  main can build it itself without touching `registerIpcHandlers`. `remoteServer.start()` has
  exactly one call site. The design is right on this point.
- `SessionService.kt:1885-1890` (four named fields rebuilt) and `:1919-1921` (payload keys
  merged into the read file, unknown keys preserved). Correct.
- `runtime-default.test.tsx` test **(f)** exists at `:118-146` and does pin the two
  initialisers and forbid a literal setter near a close. See R2-2 for the two assertions the
  design's summary of it leaves out.
- **R1-5 is fixed correctly and is pinned.** `AssistantSettings.tsx:53` skips the probes
  entirely where `native.supported !== true`, and `:61` narrows the engine test to
  `state === 'error'`; `tests/assistant-settings-attention.test.tsx` (84 lines, added in
  `27edceaf`) guards both. Contract R2's dot is now honest.
- R1-9's correction is right: Android's `defaults:set` really does preserve unknown keys, and
  the deferral is filed at `docs/roadmap/android-only.md:6-11`.
- **Guard 1 of the three is synchronously answerable.** `isNativeSupported()`
  (`RuntimeBinding.tsx:102-104`) reads `isAndroid()`, `isRemoteMode()` and a plain boolean
  planted by preload at `preload.ts:1332` — no round trip. Guards 2 and 3 are the problem
  (R2-1).

---

## R2-1 — the "provider deleted" and "model gone from the catalog" guards cannot be evaluated where the design puts them: the data they need is only fetched AFTER the form has already switched to native

**Severity:** blocker
**Triage:** accepted — the guard is circular as placed. Fixed by validating where the data can be fetched: the provider/catalog fetch condition gains "or a native startModel needs checking", so the form can know before it switches.
**Verified against:** `desktop/src/renderer/components/RuntimeBinding.tsx:190-202` (the fetch
effect), `:204-207` and `:217-220` (the silent substitution), `:224-226, 278`;
`desktop/src/renderer/components/SessionStrip.tsx:390-395, 2323-2330, 2397`;
`desktop/src/renderer/App.tsx:425, 436-440, 3493`;
`desktop/src/renderer/components/model/ModelPicker.tsx:298-317`

The design says the three guards "decide whether the choice is good" before
`applyModelChoice` is trusted with it, and places that decision at readers 1–3 — the three
form-open handlers. Two of the three cannot be decided there.

The only provider/catalog data either form has comes from `useNativeBinding`, and its fetch
effect begins:

```
if (!nativeSupported || runtime !== 'native' || !active) return;
```

(`RuntimeBinding.tsx:191`). So the list is loaded **only once the form is already on the
native runtime**. That is circular: to learn whether the stored provider still exists you
must first switch the form to native, which is precisely the switch the guard exists to
veto. And the fetch is a `Promise.all` over two IPC invokes (`:193-200`) — it cannot be
awaited inside a click handler without the form visibly waiting.

Three concrete consequences, all user-visible:

1. **The substitution the guard was written to prevent still happens.** Apply the stored
   native choice, and while the fetch is in flight `readyProviders` is `[]`, so
   `selectedProviderId` is `''` (`:205-207`), `effectiveBinding` is `null` (`:224-226`) and
   `nativeCreateBlocked` is true (`:278`). The picker renders "Choose a model…" and the
   Create button is disabled (`SessionStrip.tsx:2397`, `App.tsx:3493`). When the data lands
   and the stored provider is gone, `:205-207` picks the **first ready provider** and
   `:217-220` picks **its first catalog model** — a different model, presented as your
   default, silently. That is R1-7 unchanged.
2. **A "flip back to Claude when the data arrives" implementation is a visible flash** —
   the form opens on a native model that is not there, then jumps to Claude Sonnet a
   fraction of a second later.
3. `ModelPicker` does load providers on mount even while closed
   (`ModelPicker.tsx:298-317`), but that state is private to the picker and the picker is
   only mounted inside the open form. Nothing at App level holds a provider list the open
   handler could consult.

**What goes wrong:** implemented as written, the two catalog guards are unimplementable, and
whoever builds it will either drop them (shipping R1-7) or bolt on an after-the-fact flip
(shipping a flash and a moment of dead Create). The design's claim that "a form must never
open on a runtime that cannot create a session" is not achievable from the place it puts the
check.

**Suggested fix:** name where the guard's data comes from and accept that it is
asynchronous — either hoist one `providers.list()` / `providers.catalog()` fetch to `App`
(next to the `sessionDefaults` load at `App.tsx:498-503`) so both forms can resolve
`startModel` synchronously against a list that is already in memory, or state that the form
stays on the Claude alias until the fetch resolves and only then moves to native, and that
`useNativeBinding`'s substitution at `:205-207`/`:217-220` must be suppressed for a
`startModel`-seeded binding so a stale one falls back rather than being swapped.

---

## R2-2 — the design's summary of `runtime-default.test.tsx` test (f) omits two of its four assertions, and one of them collides head-on with the post-create-reset change

**Severity:** serious
**Triage:** accepted — the whole-file cap on the literal and the required setter(defaultRuntime()) in a close tail both constrain the change; the design now states all of test (f), not half of it.
**Verified against:** `desktop/tests/runtime-default.test.tsx:118-146`, read in full;
`desktop/src/renderer/components/SessionStrip.tsx:399, 761-768`;
`desktop/src/renderer/App.tsx:444, 3487-3491`

The design says test (f) "pins … the initialiser in both files … and forbids a literal
`setRuntime('claude')` / `setWelcomeRuntime('claude')` within 600 chars of every form close",
then concludes the fallback is safe as long as it is "never a literal `setRuntime('claude')`
**near a close block**". Test (f) makes two further assertions the design never mentions:

- `:141-144` — at least one close tail **must contain** `setter(defaultRuntime())`.
- `:145-146` — `const literals = src.split("${setter}('claude')").length - 1;
  expect(literals).toBeLessThanOrEqual(1)`. That is a **whole-file** cap, not a proximity
  rule. Both budgets are already spent: `grep -c "setRuntime('claude')" SessionStrip.tsx`
  returns 1 (line 399, inside `applyModelChoice`) and
  `grep -c "setWelcomeRuntime('claude')" App.tsx` returns 1 (line 444, inside
  `applyWelcomeModelChoice`).

**What goes wrong:** two separate ways to turn `bash scripts/verify.sh` red on a change the
design authorised. (a) "near a close block" tells a builder a literal is fine elsewhere in
the file; the second literal anywhere fails `:146`. (b) R1-10 asks the post-create reset to
"re-apply the stored default rather than dropping to the remembered runtime", which reads as
an instruction to replace `setRuntime(defaultRuntime())` at `SessionStrip.tsx:768` /
`setWelcomeRuntime(defaultRuntime())` at `App.tsx:3491` — and removing it fails `:141-144`.
Both failures print as "you broke the ChatGPT-only install default", which is the exact
misreading R1-3 predicted would get the correct change reverted.

**Suggested fix:** restate test (f) as all four assertions, and say explicitly that the
post-create reset **keeps** its `setter(defaultRuntime())` line and applies `startModel`
after it in the same handler, so the last write wins without deleting the pinned line.

---

## R2-3 — R1-7 was accepted in two halves and only one was built: the Settings row and the picker still show a raw model id as "the current default"

**Severity:** serious
**Triage:** accepted — a live defect on an approved surface (contract R2), not a design gap. Fixed in this round: the chosen model's label is stored when it is picked, so the row never renders a raw id.
**Verified against:**
`desktop/src/renderer/components/assistant-settings/AssistantSettings.tsx:129`
(`const rowSummary = startSummary(defaults);` — no second argument);
`desktop/src/renderer/components/assistant-settings/pages.tsx:94-99` (`startSummary`'s
`labels?` parameter, `return known ? … : c.modelId`);
`desktop/src/renderer/components/model/ModelPicker.tsx:441-448` (`currentLabel` falls back to
`value.modelId`)

Round 1's R1-7 triage reads: "accepted — a stale or deleted provider must fall back to
Claude, **and the drawer row must not render a raw model id as the summary**." The rewrite
carries the first clause (as one of the three guards) and drops the second entirely: it is
not in T1's change list, not in the test list, and not in "Filed, not built here". The code
is unchanged — `startSummary` is still called with no `labels` map, so its lookup is dead for
every caller, and `ModelPicker`'s closed-button label falls through to `value.modelId` when no
catalog row matches.

**What goes wrong:** any native default at all — not just a stale one — makes the Settings
drawer row read `qwen3-coder-30b-a3b-instruct-q4_k_m` instead of "Local · Qwen3 Coder 30B",
and the same string sits in the Assistant settings picker's closed control before its catalog
resolves. Contract R2 says the row "shows the current default"; a filename is not a model
name, and this is the surface Destin will look at first when answering R2 on the acceptance
deck. It is also the one place a *deleted* provider is still visible after T1's guard has
pushed the forms back to Claude — the row keeps advertising a model nothing will start.

**Suggested fix:** add one line to T1: either pass a resolved `labels` map into
`startSummary` at `AssistantSettings.tsx:129` (the panel already fetches providers and
catalog for its own picker) or delete the parameter and say the row falls back to
"Claude Code · Sonnet" for an unresolvable default.

---

## R2-4 — the T2 migration cannot be unit-tested where the design puts it, and "gated to a packaged non-dev run" makes contract R17 unverifiable in every environment Destin can test in

**Severity:** serious
**Triage:** accepted — the migration becomes a pure function taking the file path, so it is testable without importing main.ts, and the dev gate is the defaults path itself rather than an unnamed "packaged" test. That also makes R17 verifiable in a dev instance, which the previous gate prevented.
**Verified against:** `rg -l "src/main/main'" desktop/tests/` returns **nothing** — no test in
the 622-file suite imports `main.ts`, and it cannot: `main.ts:1498` calls
`void app.whenReady().then(…)` at module scope. `app.isPackaged` is the only dev/packaged
discriminator in the file (`main.ts:772, 798, 1480`). `ipc-handlers.ts:2161` resolves the
defaults file from `os.homedir()`; `docs/local-dev.md:87, 95-97` confirms `--profile` does not
isolate `~/.claude`.

Three problems, all downstream of "an explicit migration call in main … gated to a packaged
non-dev run":

1. **The test list is unwritable as placed.** "The migration zeroes every override and writes
   the marker; a second run changes nothing; a dev run does nothing at all" needs to import
   the migration. A function defined inside `main.ts` cannot be imported by vitest. Round 1's
   R1-8 suggested fix — "make the migration take its path as a parameter … so the R17 test
   runs against a temp dir", with `openDevSessionIn`/`dev-tools.ts` as the working precedent —
   was accepted, and the rewrite kept the gating half and dropped the parameterisation half.
2. **The gate is never named.** "Packaged non-dev run" is a description, not a mechanism. The
   only candidate in this codebase is `app.isPackaged`, which is false under
   `scripts/run-dev.sh` (it launches Electron over source). That works for the dev-instance
   hazard R1-8 raised — but it is worth saying out loud, because a builder who reaches for
   `process.env.NODE_ENV` instead gets a gate that is false in a packaged build too, and the
   migration then never runs for anyone.
3. **R17 becomes unanswerable before release.** R17 is `checkedBy: "human"` — the design
   itself insists on that (R1-12). With the migration a no-op in every dev launch, the only
   run in which Destin can observe "my overrides got turned off" is his own packaged install
   *after* the release ships, at which point the one-shot marker is already written and the
   before-state is gone. Worse, `app.isPackaged` is true for **any** test installer built from
   this branch, and the defaults path is `os.homedir()`-based regardless of Electron profile —
   so a packaged verification build would perform the real migration on his live
   `~/.claude/youcoded-defaults.json` and set the marker, and his real app would then find
   nothing to do. That is R1-8's failure moved one step, not removed.

**Suggested fix:** put the migration in its own module taking `(defaultsPath)` and export it,
call it from `main.ts` before `:1708` with the real path behind an `app.isPackaged` check, and
say in the design how R17 gets human-verified — e.g. Destin confirms against a copy of his
real defaults file run through the exported function, since the packaged run is unobservable
until it has already happened.

---

## R2-5 — R17's Android half is deferred in one sentence and filed nowhere, and Android really does keep and enforce the old overrides

**Severity:** serious
**Triage:** accepted — Android really does keep enforcing the old overrides. Filed explicitly rather than implied by T3.
**Verified against:**
`app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:1890` (`defaults:get` returns
the stored `permissionOverrides`), `:1901` and `:1930` (`syncPermissionOverridesToSessions`),
`:830`; `app/src/main/kotlin/com/youcoded/app/runtime/ManagedSession.kt:81, 235` (the cache is
consulted when a session asks); `docs/roadmap/android-only.md` (whole file read — the only
Assistant-settings entry is the `startModel` one at `:6-11`)

The design's T2 ends: "Android has its own copy of the file and its own override sync; that
half is deferred with T3 below." T3 then says the deferral is "**only** carrying `startModel`
through Android's `defaults:get`", and the roadmap item that was actually filed is only about
`startModel`. So the Android override reset is deferred by a sentence that points at a
deferral that does not include it, and nothing is filed.

The overrides are real on the phone: `.claude-mobile/youcoded-defaults.json` keeps them,
`defaults:get` reads them back, and `syncPermissionOverridesToSessions` pushes them into every
live session's `permissionOverridesCache`, which `ManagedSession.kt:235` consults. The
Advanced switches that set them lived in the shared React renderer, which Android runs — so an
Android user could have turned them on and, after this ships, has no UI to see or undo them.

**What goes wrong:** contract R17 is unqualified — "Any protection override someone had
switched on is turned off when this ships." On Android it is not, and after the merge (when
this spec is archived) there is no record that it was not. R17 is a `human` row; Destin will
be asked to sign it while it is half-true.

**Suggested fix:** either say plainly in T2 that R17 is delivered on desktop only and file the
Android half in `docs/roadmap/android-only.md` with its own entry, or add the four-line Kotlin
equivalent to T2's scope.

---

## R2-6 — "Filed, not built here" files nothing: none of the three items appears in any roadmap file, and "the five questions no deck has asked" points at no artifact

**Severity:** serious
**Triage:** accepted — "filed" meant nothing. The three items are now actually in roadmap files, and the five unasked questions are a real artifact.
**Verified against:** `rg -n -i 'second window|remote access|defaults:set|enforcement cache'
docs/roadmap/*.md` and a full read of `docs/roadmap/remote-access.md:36-42` and
`docs/roadmap/user-interface.md:160-180` — the nearest entries are the pre-existing
2026-07-10 "settings read over remote access can disagree" item and two 2026-09-05 tester
items; none of them is R1-6, R1-11 or R1-15. `rg -n 'five questions|no deck has asked'
docs/active` matches only the design file itself
(`2026-09-07-assistant-settings-backend-technical-design.md:157`).

The design's closing section is titled "Filed, not built here" and lists three items. They are
written down in this spec and nowhere else. Per CLAUDE.md, when the feature merges its
lifecycle docs move to `docs/archive/` and searches for live guidance exclude that directory —
so all three vanish at merge. The dangling reference to "the five questions no deck has asked"
confirms it: there is no such deck or file.

The costliest of the three is R1-6, because it is the one that leaves a **signed contract row
failing on a shipping surface**: over remote access the Assistant settings picker offers native
models (`pages.tsx:155-166`, `includeNative` defaulting true), the choice is stored and
displayed, and T1's own guard then refuses it in the remote client's new-session form because
`isNativeSupported()` is false. Contract R5 — "Any connected model … can be set as the
default" — is set-but-ignored there, permanently, by design, with the mitigation living only
in a doc that is about to be archived.

**What goes wrong:** three known defects (one of them a contract-row failure) are believed to
be captured and are not. The next session finds none of them.

**Suggested fix:** file all three as dated entries in `docs/roadmap/remote-access.md` (R1-6,
R1-15) and `docs/roadmap/user-interface.md` (R1-11) in Destin's words, per `ROADMAP.md`'s
filing grammar, and replace the design's list with links to them. Drop or replace the
"five questions" reference.

---

## R2-7 — the stated reason for excluding `openDevSessionIn` is factually wrong: it has no fixed model, it reads the user's stored default

**Severity:** minor
**Triage:** accepted — openDevSessionIn reads the stored default; the design said it has a fixed model. Corrected, and it stays out of scope on the honest grounds.
**Verified against:** `desktop/src/main/dev-tools.ts:684-712` — `DEV_SESSION_DEFAULTS =
{ skipPermissions: false, model: 'sonnet' }` is the **fallback for an unreadable file**; the
function reads `deps.defaultsPrefPath`, merges, and passes `merged.model` into
`createSession`. Its own docblock says "inheriting skipPermissions and model from the user's
saved defaults file." Wired at `ipc-handlers.ts:4054`.

The design's reader 4 says `openDevSessionIn` is "a developer entry point with its own fixed
model". It is not fixed; it is the user's saved `model` alias, with `'sonnet'` only as a
fallback.

**What goes wrong:** no user-visible defect today — excluding it is the right call, because a
diagnostic session should be Claude Code. But the reason given is false, so a later reader who
changes the defaults schema will believe this path does not read the file and will not check
it, and the pinning test at `dev-ipc-handlers.test.ts:374` (which asserts `model: 'opus'` read
*from the file*) will look inexplicable.

**Suggested fix:** change the reason to "it deliberately reads only the legacy `model` alias
so a diagnostic session is always Claude Code; `startModel` is not consulted."

---

## R2-8 — "the build will not compile" is true of `App.tsx:478` and not of `preload.ts`

**Severity:** minor
**Triage:** accepted — corrected: only App.tsx's inferred shape breaks the build.
**Verified against:** `desktop/src/main/preload.ts:863-867` (the `defaults` annotation, typed
`{skipPermissions, model, projectFolder}`) vs `desktop/src/renderer/hooks/useIpc.ts:241-249`
(the `window.claude.defaults` global, which **already** declares
`startModel?: ModelChoice` on both `get` and `set`); `desktop/src/renderer/App.tsx:478`

The design ends T1 with "`preload.ts`'s `defaults` signature and `App.tsx:478`'s inferred
`sessionDefaults` shape **both** need the `startModel` field or the build will not compile".
Only the second is true. `preload.ts`'s annotation is local to the object it hands to
`contextBridge`; nothing imports it, the renderer's types come from `useIpc.ts`, and round 1
said so itself ("Runtime is unaffected … nothing fails today").

**What goes wrong:** minor, but it is the kind of claim a build subagent verifies by breaking
something: it will "fix" a compile error that was never there, and if it does not find one it
may distrust the rest of the section. Keeping `preload.ts` in step is still worth doing — as
documentation parity, not as a build gate.

**Suggested fix:** "`App.tsx:478` must be widened to `AssistantDefaults` or `tsc --noEmit`
fails; `preload.ts:863-867` should be brought in line with `useIpc.ts` for parity, though
nothing enforces it."

---

## R2-9 — the design never says that a stored default now overrides the last-used-model memory on every form open

**Severity:** minor
**Triage:** accepted — stated plainly in the design, since it is a behaviour change a user can feel: a saved default now beats the last-used memory.
**Verified against:** `desktop/src/renderer/components/RuntimeBinding.tsx:84-98`
(`loadLastBinding` / `persistLastBinding`, backed by `localStorage['youcoded-last-binding']`);
`SessionStrip.tsx:379`, `App.tsx:424` (both forms seed `binding` from it)

Today the native binding a form opens on is whatever you used last. After T1, a user with a
`startModel` gets that model re-applied at every form open **and** at every post-create reset
(R1-10), so the last-used memory stops affecting them entirely — it only still governs installs
that never set a default.

**What goes wrong:** it is almost certainly what contract R5 intends ("pre-filled in the model
picker, but you may still switch"), but it is a behaviour change nobody has been told about: a
user who switches to a big local model for one conversation and starts another will find the
form back on their default instead of where they left it. Unannounced behaviour changes are
exactly the kind of thing that "loses trust in the next proposal".

**Suggested fix:** one sentence in T1 saying `startModel` supersedes `loadLastBinding()` for
installs that have one, and that `persistLastBinding` continues to serve installs that do not.

---

## R2-10 — the change list stops at `App.tsx`, but the prop has to be threaded through `HeaderBar` to reach readers 1 and 2

**Severity:** minor
**Triage:** accepted — HeaderBar needs three edits to thread the prop; the design said none.
**Verified against:** `desktop/src/renderer/App.tsx:3109` (the only `defaultModel=` prop site
that leads to `SessionStrip`), `:3602` (the other one, which goes to `ResumeBrowser`);
`desktop/src/renderer/components/HeaderBar.tsx:221` (prop declaration), `:349` (destructure),
`:543` (forward to `SessionStrip`); `SessionStrip.tsx:141, 329`

T1 says "`App.tsx` passes `defaultStartModel={sessionDefaults.startModel}` alongside the
existing `defaultModel`", and separately that "`HeaderBar` only passes `defaultModel` through;
it has no form of its own." Read together those say HeaderBar needs nothing. It needs three
edits — the prop on its interface, the destructure, and the forward — or the value never
reaches readers 1 and 2 at all, since `App.tsx` has no direct `SessionStrip`.

**What goes wrong:** TypeScript catches it immediately, so this costs a build cycle rather
than a defect. Listing it avoids a subagent concluding the design is wrong about where the
form lives.

**Suggested fix:** "the prop is declared and forwarded in `HeaderBar.tsx:221/349/543`;
HeaderBar remains a conduit with no form of its own."

---

## R2-11 — the Android deferral is filed as a symptom no Android user can currently reach

**Severity:** minor
**Triage:** accepted — the Android roadmap entry is reworded to the symptom a phone user can actually reach.
**Verified against:** `docs/roadmap/android-only.md:6-11` (the filed item);
`app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt` — `rg -n 'providers'` over the
whole file returns one comment at `:4254` and **no** `"providers:list"` / `"providers:catalog"`
case, so both fall through to the `else ->` at `:4344`, which answers with an error object;
`desktop/src/renderer/components/model/ModelPicker.tsx:307-312` (`Array.isArray(list) ? list :
[]`) and `:388-396` (native entries come only from `providers.filter(x => x.ready)`)

The filed item reads "Assistant settings shows the old Claude-only default model instead of a
default picked from another provider". On a standalone phone, `providers:list` is unhandled, so
the picker's provider array is empty and the only entries it can offer are the Claude aliases —
and a Claude pick also writes `model` (`pages.tsx:159-164`), which Android's `defaults:get`
*does* return. So there is no way for a phone user to store a non-Claude `startModel` in the
first place.

**What goes wrong:** small, but a roadmap item whose symptom cannot be reproduced costs a
future session a verification pass and may get closed as "cannot reproduce" while the real
gap (Android's `defaults:get` rebuilding its reply field-by-field) stays open. I did not run an
Android build to confirm this; the claim rests on the absence of a `providers:*` case in
`SessionService.kt` and on `ModelPicker`'s guard.

**Suggested fix:** reword the item to the mechanical fact — "Android's settings reply is
rebuilt from four named fields, so any newer default it stores is dropped on read; today only
Claude picks are reachable on the phone, so nothing user-visible depends on it yet."

---

## Coverage note

Read in full or in the cited ranges on `27edceaf`: `RuntimeBinding.tsx` (whole file),
`SessionStrip.tsx` (state block, post-create reset, ModelPicker render, menu handler),
`App.tsx` (defaults load, welcome state + applyWelcomeModelChoice, welcome form handlers, prop
sites), `ModelPicker.tsx` (fetch, entries, currentLabel, currentBrand),
`assistant-settings/pages.tsx` (types, `startChoice`, `startSummary`, General page),
`assistant-settings/AssistantSettings.tsx` (whole top half incl. the new `useAttention`),
`ipc-handlers.ts` (defaults handlers, `defaultsPrefPath`, `openDevSessionIn` wiring),
`remote-server.ts` (defaults handlers), `main.ts` (imports, permission cache, whenReady
ordering, `isPackaged` sites), `preload.ts` (defaults, `native.supported`), `useIpc.ts`
(defaults global), `dev-tools.ts` (`openDevSessionIn`), `runtime-default.test.tsx` test (f),
`SessionService.kt` (defaults handlers, not-implemented list, `else` branch),
`ManagedSession.kt` (override cache), `docs/roadmap/android-only.md`,
`docs/roadmap/remote-access.md`, `docs/roadmap/user-interface.md`, `scripts/run-dev.sh`,
the contract JSON, and the round-1 review.

Not verified: R11/R12/R13/R14 and R21/R22 were spot-checked only (`My Account` at
`ModelProvidersPopup.tsx:76`, `Sign out` + its `size="prompt"` dialog at `:186, 200, 335`) —
they are deck-checked rows the design claims are already built, and I did not re-review the
rendered UI. No Android build was run. No dev instance was launched.
