---
status: draft
date: 2026-09-07
branch: feat/assistant-settings
design: docs/active/specs/2026-09-07-assistant-settings-backend-technical-design.md
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
round: 1
reviewer: adversarial design review (context-free of the design session)
verified_against: /home/destin/youcoded-dev/worktrees/assistant-settings-ui @ a42980ef
---

# Assistant settings — backend technical design, review round 1

Every finding below was read against the branch, not inferred. Line numbers are from
`worktrees/assistant-settings-ui` at `a42980ef`.

## Verified correct — no finding

- **`defaults:set` in main is a generic merge and `startModel` persists.**
  `ipc-handlers.ts:1351-1370` spreads `updates` over the stored object; only
  `permissionOverrides` gets special deep-merge treatment. `defaults:get`
  (`ipc-handlers.ts:1337-1349`) spreads the parsed file over `DEFAULTS_INITIAL`, so an
  unknown key survives the round trip. Correct.
- **`remote-server.ts` is also a generic merge.** `remote-server.ts:1942-1965`: its
  `defaults:get` spreads `JSON.parse(raw)`, its `defaults:set` spreads `payload`.
  `startModel` survives on the remote path. Correct.
- **`defaults:get` pushes overrides into main's live permission cache.**
  `ipc-handlers.ts:1341-1344` → `syncPermissionOverrides` → `setPermissionOverrides`
  (`main.ts:400`). Correct, and the reason R17 needs a migration rather than just a UI
  deletion.
- **The Advanced overrides UI is gone.** `rg` for `approveAll|protectedConfigFiles|
  compoundCdGit` across `desktop/src/renderer` returns only the dead type alias in
  `assistant-settings/SkipPermissionsSection.tsx:27-31`. R16 is delivered.
- **Android's `defaults:get` drops unknown keys.** `SessionService.kt:1882-1902` rebuilds
  the reply from four named fields. `startModel` is erased on the way out. Correct — see
  R1-9 for the part of the same paragraph that is not.
- **Android already serves `folders:list` and `dialog:open-folder`.**
  `SessionService.kt:1391` (`dialog:open-folder`) and `:1407` (`folders:list`, including
  the `exists`/`description` annotations `FolderSwitcher` reads), plus `folders:add` at
  `:1433`, which is what the "Browse for folder…" path calls
  (`FolderSwitcher.tsx:331-333`). Correct.
- **R19/R18/R20 are already built.** `assistant-settings/SkipPermissionsSection.tsx:44-96`:
  the toggle opens a `layer={3} destructive` Dialog on the on-direction only, the confirm
  button is `disabled={!accepted}`, Cancel calls `close()` without writing. Making R19
  mechanical is a test-writing job, not a build job. Correct.
- **No new IPC channel is needed.** `preload.ts:863-867` forwards an arbitrary object to
  `IPC.DEFAULTS_SET`; `remote-shim.ts:1282-1285` forwards a `Record<string, any>`. Correct
  at runtime (see R1-13 for the stale type annotation).

---

## R1-1 — T1 misses the Welcome/empty-state new-session form, which is the first form a user hits after setting a default

**Severity:** blocker
**Triage:** accepted — the second form is the Welcome screen in App.tsx (runtime-default.test.tsx (f) names it and its setWelcomeRuntime setter); HeaderBar is a pass-through. The design named the wrong file.
**Verified against:** `desktop/src/renderer/App.tsx:423-424, 3491, 3516-3518`;
`desktop/src/renderer/components/HeaderBar.tsx:543`;
`desktop/src/renderer/components/SessionStrip.tsx:378-379`

The design says "`App.tsx` hands both new-session forms `defaultModel={sessionDefaults.model}`"
and that the change is to pass `defaultStartModel` "to `SessionStrip` and `HeaderBar`."

Both halves are wrong about the code. The two `defaultModel=` props in `App.tsx` go to
`HeaderBar` (`App.tsx:3109`) and to `ResumeBrowser` (`App.tsx:3602`). `HeaderBar` has no
form of its own — it is a pure pass-through to `SessionStrip` (`HeaderBar.tsx:543`; `rg -n
"setNewModel" HeaderBar.tsx` returns nothing). The **second** new-session form is the
app-open Welcome screen, which lives inside `App.tsx` and reads `sessionDefaults` directly
rather than through a prop: `setWelcomeModel(sessionDefaults.model || 'sonnet')` at
`App.tsx:3518`, with its runtime seeded by `defaultRuntime()` at `:423` and reset to
`defaultRuntime()` at `:3491`, and its binding seeded by `loadLastBinding()` at `:424`.

**What goes wrong:** the Welcome screen is what you see when no session is open — i.e. the
very next thing after a fresh launch, and for many users the first form they use after
setting the default. A user who sets the default to GPT-5.6 in Assistant settings, quits,
relaunches and clicks "New Session" on the welcome screen gets a form opened on Claude
Code / Sonnet. The setting appears to have done nothing on the one screen most likely to
be looked at first. Contract R5 fails on that surface even if `SessionStrip` is fixed.

**Suggested fix:** name three initialisation sites, not two — `SessionStrip.tsx:2417-2420`
(menu → New Session), `SessionStrip.tsx:764-768` (post-create reset) and
`App.tsx:3516-3518` (welcome form open) — and treat `HeaderBar` as a prop conduit only.

---

## R1-2 — T1 changes only `setNewModel`, but runtime and binding are the state that actually decides which runtime the form opens on

**Severity:** blocker
**Triage:** accepted — routing through the existing applyModelChoice sets runtime AND binding; setNewModel alone is a no-op for a native default.
**Verified against:** `desktop/src/renderer/components/SessionStrip.tsx:378-379, 388-393,
764-769, 2417-2423`; `desktop/src/renderer/App.tsx:423-424, 3516-3518`

The design's change is scoped to "`setNewModel(defaultModel || 'sonnet')`, both call sites."
`newModel` is only the **Claude alias**. Which runtime the form opens on is `runtime`
(`SessionStrip.tsx:378`), and the native provider/model pair is `binding`
(`SessionStrip.tsx:379`), fed into `useNativeBinding`. `SessionStrip.tsx:388-393` shows the
`modelChoice` the picker renders is derived from `runtime` + `nb.effectiveBinding`, never
from `newModel` when `runtime === 'native'`.

Concretely: `SessionStrip.tsx:2417-2423` — the "+ New Session" button — sets `newCwd`,
`dangerous` and `newModel` and **does not touch `runtime` or `binding` at all**. Those two
were initialised once at mount by lazy initialisers (`:378-379`) that ran before
`defaults:get` resolved. The same is true of the welcome form (`App.tsx:423-424` vs
`:3516-3518`).

**What goes wrong:** implemented exactly as written, a native `startModel` changes nothing
visible. The form still opens on Claude Code with `newModel` set to whatever
`defaultModel` was, because nothing set `runtime = 'native'` or seeded the binding.
Destin sets his default to a local Qwen model, opens New Session, and sees Claude Code —
the exact symptom R5 exists to remove.

**Suggested fix:** the change must set the triple (`runtime`, `binding`, `newModel`) at
each of the three sites in R1-1, and must do it in the two form-open handlers, not only in
the lazy `useState` initialisers, because `sessionDefaults` arrives asynchronously
(`App.tsx:499-503`) and is `{model:'sonnet'}` at mount.

---

## R1-3 — T1 as written will fail the existing `runtime-default.test.tsx` source guard

**Severity:** blocker
**Triage:** accepted — verified directly: test (f) pins the useState<Runtime>(() => defaultRuntime()) initialiser in BOTH files and forbids a literal setter('claude') within 600 chars of every form close. T1 must layer on those, never replace them.
**Verified against:** `desktop/tests/runtime-default.test.tsx:118-152` (test `(f)`), read in
full; `SessionStrip.tsx:378, 768`; `App.tsx:423, 3491`

The design asserts "the source-scan test that pins that stays green." That is true of test
`(e)` (which counts files mentioning the `youcoded-runtime-default` string). It is **not**
true of test `(f)` in the same file, which the design does not mention. Test `(f)` asserts,
by regex, against `SessionStrip.tsx` and `App.tsx`:

- `useState<Runtime>(\s*\(\)\s*=>\s*defaultRuntime\(\)\s*\)` must be present verbatim;
- within 600 chars after every `setShowNewForm(false)` / `setWelcomeFormOpen(false)`, no
  `setRuntime('claude')` / `setWelcomeRuntime('claude')`;
- at least one such tail must contain `setRuntime(defaultRuntime())` /
  `setWelcomeRuntime(defaultRuntime())`.

**What goes wrong:** any implementation of R1-2 that replaces the runtime initialiser or
the post-create reset with a `startModel`-aware resolver turns `bash scripts/verify.sh`
red, and the failure reads as "you broke the ChatGPT-only install default" rather than
"the guard needs updating." A build subagent that sees this failure will most likely
revert the correct change.

**Suggested fix:** state in the design that `runtime-default.test.tsx` test `(f)` is being
amended, and say how the two defaults compose — the cleanest shape that keeps the guard
meaningful is to leave `defaultRuntime()` as the initialiser and layer `startModel` on in
the form-open handlers, so the regexes still match.

---

## R1-4 — T2's chosen migration point does not exist, and the natural place for it is AFTER the remote server starts listening — the race the design says it removes

**Severity:** blocker
**Triage:** accepted — there is no startup load; the migration needs an explicit call early in main, before remoteServer.start(), not a lazy one inside a handler.
**Verified against:** `desktop/src/main/main.ts:396-402, 977-981, 1708, 1790`;
`desktop/src/main/ipc-handlers.ts:1330-1334, 1344, 1368, 2161`

The design says the migration "runs at startup, where the defaults are first loaded for
the hook cache." **There is no such load.** `rg -n "setPermissionOverrides|
syncPermissionOverrides"` across `desktop/src` returns exactly four sites: the definition
(`main.ts:400`), the import and helper (`ipc-handlers.ts:16, 1330-1334`), and the two calls
**inside the `defaults:get` / `defaults:set` handlers** (`:1344`, `:1368`). The comment at
`main.ts:399` ("Called by ipc-handlers.ts on startup") is stale — the cache is populated
lazily, the first time a renderer asks. So the migration's stated home has to be created,
not found.

Worse, the obvious place to create it — inside `registerIpcHandlers` — is reached at
`main.ts:977`, which is inside `createWindow`, called at `main.ts:1790`. `await
remoteServer.start()` is at `main.ts:1708`, i.e. **82 lines and several awaits earlier**.

**What goes wrong:** a remote client (phone or browser) connected across an app restart
reconnects while the desktop is still booting and can be answered by
`remote-server.ts:1942` before the migration runs — the design's own failure case. And
because the migration is a read-modify-write on a file a second writer can touch, a remote
`defaults:set` (`remote-server.ts:1953-1965`) landing between the migration's read and its
write is **silently lost**: the user's project folder or skip-permissions change is
overwritten by the migration's stale copy.

**Suggested fix:** name the exact insertion point — before `await remoteServer.start()` at
`main.ts:1708` — and make the migration a self-contained read/write of `defaultsPrefPath`
that does not depend on `registerIpcHandlers` (note `ipc-handlers.ts:2161` declares
`defaultsPrefPath` *below* the handlers that close over it, so a synchronous migration
placed near line 1337 would throw a TDZ `ReferenceError`).

---

## R1-5 — the red "provider needs attention" dot is permanently on for every Android install

**Severity:** serious
**Triage:** accepted — live defect on the branch, not just a design gap. Fixed in this round rather than deferred: useAttention now treats only a real engine error state as attention, and never runs on Android.
**Verified against:** `desktop/src/renderer/components/assistant-settings/AssistantSettings.tsx:44-56,
139`; `desktop/src/renderer/remote-shim.ts:1920-1921`;
`app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:4283, 4339-4342`

`useAttention` does:

```
engine?.status?.().then((s) => { if (s?.state === 'error' || s?.error) next.add('local'); })
```

On Android, `window.claude.engine.status()` resolves (it is not rejected) with the honest
mobile stub: `SessionService.kt:4339-4342` responds
`{"ok": false, "error": "not-implemented-on-mobile"}` for every type in the
not-implemented list, and `engine:status` is in that list (`:4283`). `s.error` is a
non-empty string, so `next.add('local')` always fires, and
`AssistantSettings.tsx:139` renders the `AttentionDot`.

**What goes wrong:** every Android user sees a permanent red dot on the Assistant settings
row labelled "A provider needs attention", pointing at a **Local models page that Android
never shows** (`AssistantSettings.tsx:84-87` filters to `general` only on Android). There
is nothing to click and nothing to fix. Contract R2 says the dot means a provider is
broken; the comment at `AssistantSettings.tsx:36-40` says "a dot for anything less is the
one way this row loses trust." This is on the branch today and the design's "everything not
listed here is already real" sentence covers it.

**Suggested fix:** treat only an explicit `state === 'error'` as attention, or skip the
attention probes entirely when `platform === 'android'` / `native.supported !== true`. Add
it to the task list.

---

## R1-6 — over remote access the settings picker offers native models the user's own new-session form will silently refuse

**Severity:** serious
**Triage:** accepted, split — the T1 fallback stops the dead Create button. What the picker OFFERS over remote is a change to an approved surface, so it goes to Destin as a question rather than being changed silently; filed.
**Verified against:** `desktop/src/main/remote-server.ts:1050-1052, 1095-1105`;
`desktop/src/renderer/components/assistant-settings/pages.tsx:155-166`;
`desktop/src/renderer/components/model/ModelPicker.tsx:386-400`;
`desktop/src/renderer/components/RuntimeBinding.tsx:100-104`

The General page renders `<ModelPicker value={startChoice(defaults)} …>` with
`includeNative` left at its default `true` (`pages.tsx:158`). ModelPicker fills its list
from `providers.list()` / `providers.catalog()` (`ModelPicker.tsx:386-400`). Over remote
access those calls are answered by `remote-server.ts:1050` and `:1095`, which return the
**desktop's real provider registry and model catalog**. So a browser client sees, and can
select, GPT-5.6 or a local Qwen.

Selecting one writes `startModel: {runtime:'native', …}` and deliberately does **not**
update `model` (`pages.tsx:159-164`). But `isNativeSupported()` is false over remote
(`RuntimeBinding.tsx:100-104`), so T1's own guard makes the remote client's new-session
form fall back to the `model` alias.

**What goes wrong:** a remote user sets the default to GPT-5.6, the settings row keeps
saying GPT-5.6 forever, and every new conversation they start opens on Claude Sonnet with
no explanation. A preference that is stored, displayed, and ignored — the exact
silent-failure shape. Contract R5 says "any connected model … can be set as the default";
on this surface it can be set but not honoured.

**Suggested fix:** pass `includeNative={nativeSupported}` on the settings General page so a
surface that cannot run a native model cannot set one as the default, and say so in T1.

---

## R1-7 — nothing in the design covers a stored `startModel` whose provider or model no longer exists

**Severity:** serious
**Triage:** accepted — a stale or deleted provider must fall back to Claude, and the drawer row must not render a raw model id as the summary.
**Verified against:** `desktop/src/renderer/components/RuntimeBinding.tsx:204-226`;
`desktop/src/renderer/components/model/ModelPicker.tsx:441-448`;
`desktop/src/renderer/components/assistant-settings/pages.tsx:81-99`;
`desktop/src/renderer/components/assistant-settings/AssistantSettings.tsx:120`

The design's four rules for `startModel` cover present/absent and supported/unsupported,
but not stale. Two different things happen today, neither of them stated:

1. **The new-session form silently substitutes.** `useNativeBinding` falls back to the
   first ready provider when the stored `providerId` is gone
   (`RuntimeBinding.tsx:205-207`) and to that provider's first catalog model when the
   stored `modelId` is gone (`:217-220`). So deleting the OpenRouter provider makes the
   form open on, say, the local engine's first model — a *different* model, presented as
   the default, with no notice.
2. **The settings picker and the drawer row show a raw id.** `ModelPicker.tsx:441-448`
   falls back to `value.modelId` when no catalog row matches, so the closed control reads
   `qwen3-coder-30b-a3b-instruct-q4_k_m` with no provider name. `startSummary`
   (`pages.tsx:94-99`) accepts an optional `labels` map, but **the only caller passes
   nothing** (`AssistantSettings.tsx:120`), so the Settings drawer row shows the same raw
   id for *every* native default, stale or not.

**What goes wrong:** for a stale default the user is told the default is one thing and gets
another; for any native default the drawer row reads like a filename instead of
"ChatGPT · GPT-5.6", which is what contract R2 promises ("shows the current default"). The
`labels` parameter is dead code that looks like the feature is done.

**Suggested fix:** add a fifth rule — a `startModel` that does not resolve against the live
provider list falls back to the Claude alias exactly like the unsupported case, and the
picker shows it as unavailable rather than as the current value — and either wire the
`labels` map into `AssistantSettings.tsx:120` or delete the parameter.

---

## R1-8 — the T2 migration silently rewrites Destin's live `~/.claude/youcoded-defaults.json` the first time any dev build launches

**Severity:** serious
**Triage:** accepted — a dev build must never perform the real migration on Destin's live ~/.claude defaults file. The migration is gated so only a packaged, non-dev run can do it.
**Verified against:** `desktop/src/main/ipc-handlers.ts:2161`
(`path.join(os.homedir(), '.claude', 'youcoded-defaults.json')`);
`docs/local-dev.md:87` ("Dev and built both read and write `~/.claude/`") and `:95-97`
("`--profile` gives no isolation for any of" the `~/.claude` state)

`--profile` splits Electron `userData`; it does **not** split `~/.claude`. The defaults
file is resolved straight from `os.homedir()`.

**What goes wrong:** the moment anyone runs `bash scripts/run-dev.sh` on this branch, the
migration fires against Destin's real defaults file, zeroes his stored overrides and writes
the `permissionOverridesClearedAt` marker. His built app then never runs the migration —
it is already marked done. That is a write into shared live-app state from a dev instance,
and it also destroys the "before" state, so the migration cannot be re-verified without
hand-editing the file back. It is not forbidden by `live-app-safety.md` (the file is not
held open by Electron the way `settings.json` is), but it is a one-way change to his
working environment that nobody asked for.

**Suggested fix:** make the migration take its path as a parameter (as `openDevSessionIn`
already does — see `dev-tools.ts:692` and `dev-ipc-handlers.test.ts:338`) so the R17 test
runs against a temp dir, and warn in the design that a dev launch performs the real
migration once.

---

## R1-9 — T3's stated reason is wrong: this file is not synced, and Android's `defaults:set` already preserves `startModel`

**Severity:** serious
**Triage:** accepted, already handled — corrected in the design before this review landed (T3 deferred, the sync claim withdrawn).
**Verified against:** `app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:1904-1932`;
`desktop/src/main/sync-spaces/managed-roots.ts:15-25, 46-51`;
`desktop/src/renderer/components/SettingsPanel.tsx:2105-2109, 2374-2378`

Two factual errors in one paragraph:

1. **Android's `defaults:set` does not drop `startModel`.** `SessionService.kt:1918-1922`
   iterates `msg.payload.keys()` and `current.put(key, …)` for every key that is not
   `permissionOverrides`, then writes `current` back and responds with it. It is a generic
   merge, exactly like desktop's. Only `defaults:get` (`:1882-1902`) strips unknown keys.
   The design asks to "carry `startModel` through `defaults:get` **and** `defaults:set`";
   only the first is needed.
2. **Nothing syncs this file.** The sync roots are `~/YouCoded/Personal` and
   `~/YouCoded/Projects` (`managed-roots.ts:20, 46-51`); `rg -n "youcoded-defaults"` across
   the repo finds it only in `ipc-handlers.ts`, `remote-server.ts`, `SessionService.kt` and
   one test. Desktop uses `~/.claude/youcoded-defaults.json`; standalone Android uses
   `.claude-mobile/youcoded-defaults.json` — two unrelated files. So "erased for every
   other device that syncs the file" describes a mechanism that does not exist. (A phone in
   *remote* mode never reaches `SessionService`'s handlers at all — `remote-shim.ts:1282`
   sends `defaults:get` over the WebSocket to the desktop.)

**What goes wrong:** the real Android bug is smaller and different, and stating it wrongly
risks the fix being scoped to the wrong half. The actual symptom: on a standalone Android
phone, set the Default model in Assistant settings, close the app, reopen it — the picker
has reverted to the Claude alias, because `defaults:get` did not return what
`defaults:set` wrote. Also note `SettingsPanel.tsx:2105-2109` sends only the delta, so no
value is erased by a write; only reads lose it.

**Suggested fix:** rewrite T3 as "Android's `defaults:get` must stop rebuilding the reply
field-by-field, so a value it wrote survives its own restart"; drop the sync rationale and
the `defaults:set` half.

---

## R1-10 — a native default lasts one session unless the post-create reset is changed too

**Severity:** serious
**Triage:** accepted — the post-create reset must re-apply the stored default, or a native default lasts exactly one session.
**Verified against:** `desktop/src/renderer/components/SessionStrip.tsx:760-769`;
`desktop/src/renderer/App.tsx:3487-3491`;
`desktop/src/renderer/components/RuntimeBinding.tsx:112-131`

Both forms reset `runtime` to `defaultRuntime()` after every create
(`SessionStrip.tsx:768`, `App.tsx:3491`). The long comment at `RuntimeBinding.tsx:112-124`
records exactly why: review R2-3 found that resetting to the literal `'claude'` made a
ChatGPT install's default "last exactly ONE session." `defaultRuntime()` reads
`youcoded-runtime-default`, which the design correctly says only first-run writes.

For everyone whose install was set up with Claude (i.e. that key is unset),
`defaultRuntime()` returns `'claude'`. The design says `startModel` "wins when it is set"
but leaves the post-create reset out of its change list.

**What goes wrong:** exactly the R2-3 bug, reintroduced through a different door. User sets
GPT-5.6 as the default; the first New Session opens on GPT-5.6; they create it; the form
resets to `defaultRuntime()` = Claude; **every subsequent** New Session that session opens
on Claude Code. The setting appears to work once and then stop.

**Suggested fix:** say explicitly that the post-create reset resolves the same
`startModel` triple the form-open handler does, and reconcile that with
`runtime-default.test.tsx` test `(f)` (R1-3).

---

## R1-11 — a second window keeps the old default until its own Settings panel is opened and closed

**Severity:** minor
**Triage:** accepted — real but out of scope for this build; filed rather than fixed here.
**Verified against:** `desktop/src/renderer/App.tsx:498-503`; `desktop/src/main/main.ts:612,
883-884, 1234, 1242, 1289`

`sessionDefaults` refreshes on mount and on `settingsOpen` changing — per renderer.
`createAppWindow` (`main.ts:612`) is called for every torn-off/second window
(`:1234, :1242, :1289`), each with its own `App` instance and its own copy of
`sessionDefaults`. There is no broadcast of a defaults change.

**What goes wrong:** change the default model in window A; window B's New Session form
keeps offering the old one until you open and close Settings there (or restart). With a
Claude alias this was invisible; with a runtime switch it means the two windows open new
sessions on *different providers*. (`registerIpcHandlers` itself runs once —
`main.ts:977` inside `createWindow`, called only at `:1790` — so a main-process migration
is not double-run. The staleness is renderer-side only.)

**Suggested fix:** one line in T1 acknowledging it, or a `defaults:changed` push. Not a
blocker; worth a decision rather than a surprise.

---

## R1-12 — three of the four `human` contract rows become `mechanical`, which removes them from the acceptance deck Destin answers

**Severity:** minor
**Triage:** accepted — the signed rows stay `human`. Guards get added, but R5 and R17 still reach the acceptance deck for Destin to answer. A signed artifact is not edited to make a build look finished.
**Verified against:** `docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json:56-59,
146-151, 161-167`; `.claude/rules/feature-flow.md` → "Two reviewers, a stranger grades,
then the deck" ("the acceptance deck … asks one yes/no per `human` row")

The contract is signed with R5, R17, R19 and R24 as `checkedBy: "human"`. The design
converts three to `mechanical`.

**What goes wrong:** the acceptance deck asks Destin a yes/no only for `human` rows. Flip
R5 and he is never asked "does the model I chose actually start my conversation?" — which
is the whole feature — because a unit test said yes. R1-1, R1-2, R1-6, R1-7 and R1-10 are
all cases a narrow R5 test would pass while the user-visible promise fails. R17 has the
same shape: a test can prove the migration writes `false`, not that his machine ended up
with the switches off.

**Suggested fix:** add the mechanical guards, but leave R5 and R17 as `human` so they still
reach the acceptance deck; converting a signed row's `checkedBy` also needs saying out loud,
since it edits a signed artifact.

---

## R1-13 — `preload.ts`'s `defaults` signature does not know about `startModel`

**Severity:** minor
**Triage:** accepted — the preload signature and App.tsx's inferred state shape both need the field or the build will not compile.
**Verified against:** `desktop/src/main/preload.ts:863-867` vs
`desktop/src/renderer/hooks/useIpc.ts:241-249`;
`desktop/src/renderer/App.tsx:478`

`useIpc.ts:247-248` declares the `window.claude.defaults` global with `startModel`;
`preload.ts:864-866` still types both functions as
`{skipPermissions, model, projectFolder}`. Runtime is unaffected (`ipcRenderer.invoke`
forwards the object as-is), and `shim-parity.test.ts` only compares method *names*, so
nothing fails today.

Separately, `App.tsx:478` initialises `sessionDefaults` with an object literal, so
TypeScript infers `{skipPermissions: boolean; model: string; projectFolder: string}`.
The design's `defaultStartModel={sessionDefaults.startModel}` will not compile until that
state is typed (`tsc --noEmit` is part of `scripts/verify.sh`).

**What goes wrong:** no user-visible symptom; a build subagent hits a type error the design
did not predict and may "fix" it with an `any` cast that hides the next mistake.

**Suggested fix:** one line in T1 — widen `App.tsx:478` to the `AssistantDefaults` shape
already exported from `assistant-settings/pages.tsx:29-40`, and update `preload.ts`'s
signature to match `useIpc.ts`.

---

## R1-14 — `openDevSessionIn` is a fourth reader of the default model and will keep ignoring `startModel`

**Severity:** minor
**Triage:** accepted — openDevSessionIn is named explicitly in the design, either as in scope or as a deliberate exclusion.
**Verified against:** `desktop/src/main/ipc-handlers.ts:4054`;
`desktop/src/main/dev-tools.ts:692`; `desktop/tests/dev-ipc-handlers.test.ts:374-388`

`openDevSessionIn` reads `youcoded-defaults.json` in the main process and passes `model`
straight into `sessionManager.createSession`. It is the "Diagnose with Claude" / open-a-dev-
session path in Settings → Development.

**What goes wrong:** small and arguably correct (that flow wants Claude Code specifically),
but it is a place the stored default is read and the new field is not, and the existing
test at `dev-ipc-handlers.test.ts:374` pins `model: 'opus'` from the file. Worth one line
of "deliberately unchanged" so a later reader does not file it as a bug.

**Suggested fix:** add it to "Not in scope" with the reason.

---

## R1-15 — T2's stated race is the wrong one; the remote path's real gap is that its `defaults:set` neither deep-merges overrides nor refreshes the enforcement cache

**Severity:** minor
**Triage:** accepted — T2's justification is corrected; the remote handler's missing deep-merge and stale cache are latent, so they are filed rather than fixed inside this feature.
**Verified against:** `desktop/src/main/remote-server.ts:1942-1965` vs
`desktop/src/main/ipc-handlers.ts:1337-1370`

The design's justification is that a lazy migration "could be beaten to the file by a remote
client and serve the old values once." True but inconsequential: no remote surface renders
the overrides any more (R16), so serving them once shows nobody anything. The material
differences the design does not mention:

- `remote-server.ts:1944` and `:1956` define `DEFAULTS_INITIAL` **without**
  `permissionOverrides`, so the remote reply's shape differs from main's.
- `remote-server.ts:1959` does a flat `{...current, ...payload}` with **no** deep merge of
  `permissionOverrides` — a partial write from a remote client would replace the whole
  object.
- Neither remote handler calls `setPermissionOverrides`, so a write over remote leaves
  main's enforcement cache (`main.ts:397-402`) stale until a local `defaults:get`.

**What goes wrong:** none of this bites today, because nothing writes overrides any more —
but the migration is the moment to close it, and the design's stated reason will not
survive a reader checking it. Post-migration the marker also has to be written on the same
non-deep-merging path, so a remote write can carry it.

**Suggested fix:** replace the race sentence with the ordering fact from R1-4, and have the
migration also call `setPermissionOverrides` with the zeroed set so the cache and the file
agree from launch.

---

## Coverage note

Read in full or in the cited ranges: `ipc-handlers.ts` (defaults + dev-session regions),
`remote-server.ts` (defaults + provider + engine cases), `main.ts` (startup ordering,
permission cache), `preload.ts` (defaults), `App.tsx` (defaults load, welcome form, prop
sites), `SessionStrip.tsx`, `HeaderBar.tsx`, `RuntimeBinding.tsx`, `ModelPicker.tsx`,
`assistant-settings/*`, `SettingsPanel.tsx` (both mounts), `SessionDrawer.tsx`,
`SessionService.kt` (defaults, folders, not-implemented list), `runtime-default.test.tsx`,
`dev-ipc-handlers.test.ts`, `shim-parity.test.ts`, `managed-roots.ts`.

Not verified: whether Android's `dialog:open-folder` returns a path the runtime can
actually use as a cwd (the design only claims the handler exists, which it does); the
behaviour of the Android build's settings panel at runtime (no Android render available on
this machine, as the design itself notes for R24).
