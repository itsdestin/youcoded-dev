---
status: draft
date: 2026-09-07
branch: feat/assistant-settings
design: docs/active/specs/2026-09-07-assistant-settings-backend-technical-design.md
contract: docs/active/design/2026-09-05-assistant-settings/assistant-settings.contract.json
round: 3
previous:
  - docs/active/reviews/2026-09-07-assistant-settings-design-review-1.md
  - docs/active/reviews/2026-09-07-assistant-settings-design-review-2.md
reviewer: adversarial design review (round 3 — build-readiness)
verified_against: /home/destin/youcoded-dev/worktrees/assistant-settings-ui @ 2ee9cc3d
---

# Assistant settings — backend technical design, review round 3

Rounds 1 and 2 are not restated. Everything below was read against the branch at `2ee9cc3d`
(one commit past round 2 — the R2-3 label fix). Two things were run rather than read:
`bash scripts/verify.sh` on the worktree (full suite: types, 622-file suite, knip, eslint,
ast-grep — **all green**), and a mutation run of the R1-5 attention-dot guard.

## Verified correct — no finding

- **The revised `useNativeBinding` fetch condition is implementable and breaks nothing.** I
  read `RuntimeBinding.tsx` end to end and traced every value the loosened condition would
  newly expose. With `runtime === 'claude'` and the lists loaded: `readyProviders` becomes
  non-empty, `selectedProviderId`/`selectedModelId` resolve to the first ready provider and
  its first model, and `effectiveBinding` (`:224-226`) becomes **non-null while the form is
  on Claude**. That is safe here, because *every* consumer is already gated on
  `runtime === 'native'` — I checked all of them: `modelChoice` (`SessionStrip.tsx:390`,
  `App.tsx:436`), `nativeCreateBlocked` (`:278`, itself gated), the Create handlers
  (`SessionStrip.tsx:747, 758`; `App.tsx:3473, 3484`), and `<NativeExtras>`
  (`SessionStrip.tsx:2335`, `App.tsx:3419`). Nothing reads `effectiveBinding` ungated.
- **`memVerdict` is unaffected.** `isLocalEngine` (`RuntimeBinding.tsx:232`) is
  `runtime === 'native' && selectedProviderId === 'local'`, so under Claude the effect at
  `:233-241` takes its `setMemVerdict(null)` branch. No memory check fires for a Claude form,
  and no loop: the extra render caused by `resolvedModelId` moving from `''` to a real id
  settles because both `setMemVerdict(null)` and `setMemDetailOpen(false)` are no-op writes.
- **No effect keyed off `runtime` misbehaves.** The only two are the fetch itself
  (`:190-202`) and the memory check (`:233-241`); both are covered above.
- **The fixed ordering does satisfy `runtime-default.test.tsx` test (f).** I re-ran the
  test's own extraction (`stripComments` + a 600-char slice after every close) over the real
  files. `SessionStrip.tsx`: three `setShowNewForm(false)` occurrences (lines 574, 740, 762);
  only the create tail at 762 contains `setRuntime(defaultRuntime())`, at **offset 310** of
  its 600-char window. `App.tsx`: two `setWelcomeFormOpen(false)` (3459, 3487); the create
  tail at 3487 has `setWelcomeRuntime(defaultRuntime())` at **offset 274**. Reset-first then
  apply leaves both pinned calls exactly where they are, so `:141-144` still passes; the
  whole-file literal cap (`:145-146`) stays at 1 in each file as long as the Claude fallback
  routes through `applyModelChoice` as the design says. The design's ordering is correct.
  (Trivial citation drift: the single literal is `SessionStrip.tsx:**398**`, not 399;
  `App.tsx:444` is right.)
- **R1-5 (the attention dot) is fixed and its test is a real guard, not a vacuous one.** I
  copied `AssistantSettings.tsx` to a scratch file, reverted the two lines of the fix (the
  `native.supported` early return at `:53` and the narrowing to `state === 'error'` at `:61`),
  aliased the mutant in through a scratch vitest config, and ran the suite: **2 of the 7
  tests fail** — the Android case and the transport-failure case. The `waitFor`-then-assert
  shape I was suspicious of does flush the probe promises. Nothing in the repo was modified.
- **R2-3's code fix compiles everywhere and behaves.** Widening `onSelect` to
  `(choice, label?) => void` (`ModelPicker.tsx:189`) is a supertype of every existing
  one-argument handler, so all other call sites type-check unchanged — confirmed by a green
  `tsc --noEmit` and a green full suite. The three new `startSummary` unit tests are honest.
- **T2's anchors all still hold at `2ee9cc3d`:** `main.ts:1708` (`await remoteServer.start()`),
  `:1790` (`createWindow`), `:399` (the stale comment), `ipc-handlers.ts:2161`
  (`defaultsPrefPath` from `os.homedir()`), `:1337-1372` (the two generic-merge handlers).
  `PERMISSION_OVERRIDES_DEFAULT` (`shared/types.ts:22-28`) is an all-`false` constant in a
  module with no Electron import, so "write every override false" is well defined and the
  migration module can import it without dragging `main.ts` into vitest. T2 is buildable.
- **R2-6 is genuinely fixed.** The four roadmap entries exist
  (`docs/roadmap/remote-access.md:3-12`, `docs/roadmap/user-interface.md:5`,
  `docs/roadmap/android-only.md:5-16`) and `OPEN-QUESTIONS.md` is a real 38-line document.
- **R1-9, R2-7, R2-8, R2-9, R2-10, R2-11 are all carried into the design correctly.**

---

## R3-1 — T2's escape hatch for verifying R17 is the exact write into Destin's live `~/.claude` that R1-8's gate was built to prevent

**Severity:** serious

**Triage:** accepted — my own regression. The opt-in env var I added in the round-2 revision reopens R1-8: it points the real one-way migration at Destin's live ~/.claude file. The opt-in is removed; verification uses a copy at a path passed in, which is what R2-4 actually asked for.

**Verified against:** design lines 160-170; `ipc-handlers.ts:2161`
(`path.join(os.homedir(), '.claude', 'youcoded-defaults.json')`); `docs/local-dev.md:87, 95-97`
(`--profile` does not isolate `~/.claude`); round 2, R2-4 suggested fix

The design gates the migration on `app.isPackaged` "or when `YOUCODED_MIGRATE_DEFAULTS=1` is
set explicitly", and then names the verification route: R17 "is checked on a real install at
acceptance, **or in a dev instance launched deliberately with the opt-in**."

A dev instance resolves the defaults file from `os.homedir()` like every other build. So
following that sentence performs the real, one-way, marker-writing rewrite of Destin's live
`~/.claude/youcoded-defaults.json` — his overrides zeroed, `permissionOverridesClearedAt`
stamped — after which his actual shipping app finds the marker and does nothing. That is
R1-8 word for word, re-entering through the procedure the design recommends.

Round 2's R2-4 asked for two things: parameterise the path *and* say how R17 gets
human-verified — "e.g. Destin confirms against a **copy** of his real defaults file run
through the exported function". The design took the parameterisation and replaced the copy
with the dev opt-in. The parameter is what makes the safe version trivial: the opt-in should
carry the path (`YOUCODED_MIGRATE_DEFAULTS=/path/to/copy.json`), or the design should simply
say the human check is "run the exported function against a copy of the live file and show
Destin the before/after", which needs no env var and no dev launch at all.

**What goes wrong:** whoever runs acceptance follows the design, sets the flag, and silently
consumes the one-shot migration on Destin's working environment — and destroys the "before"
state that makes R17 checkable at all.

---

## R3-2 — "the form applies the stored choice once the lists have arrived" has no latch, and the values it would key on are new objects on every render, so as written it prevents the user from changing the model

**Severity:** serious

**Triage:** accepted — the apply needs a once-per-open latch, the usePreset pattern in the same file. Without it the user's own pick re-triggers the apply and snaps back to the default, breaking the contract line "you may still switch models at any time".

**Verified against:** design lines 94-97; `RuntimeBinding.tsx:204` (`readyProviders` is a
bare `.filter()` in the hook body — a new array every render), `:224-226` (`effectiveBinding`
likewise), `:31-57` (`usePreset`'s existing latch, and the WHY comment recording the same
bug class); contract R5's note ("pre-filled in the model picker, **but you may still switch
models at any time**")

The design's application step is one sentence with no lifecycle: "The form then applies the
stored choice once the lists have arrived." The natural implementation is an effect keyed on
the arrival, i.e. on `nb.readyProviders` / `nb.modelCatalog`. `modelCatalog` is state and
stable; **`readyProviders` is rebuilt on every render** (`:204`), so such an effect re-runs on
*every render of the form* — including the render caused by the user's own pick. Without a
latch it re-applies the stored default on top of whatever the user just chose: the picker
snaps back to the default every time they try to switch, and contract R5's own promise ("you
may still switch models at any time") fails on the surface it is written about.

The same file already solves this exact problem two ways in `usePreset` (`:31-57`): a
`touched` ref for "the user has picked", plus a `prevActive` ref so the latch re-arms on the
closed→open edge — with a comment explaining that a previous per-form copy got it wrong.

**What goes wrong:** built literally, the model picker in both new-session forms becomes
unusable for anyone who has set a default. Built defensively, the builder invents a latch and
guesses whether a user pick should survive.

**Suggested fix:** state it: the stored default is applied **at most once per form open**,
and not at all once the user has touched the picker this open — the `usePreset` latch pattern,
reused.

---

## R3-3 — the fetch is still gated on `active`, so on the first open the validation data cannot arrive before the form is usable: Create is live on Claude while a catalog fetch that can take 15 seconds is in flight

**Severity:** serious

**Triage:** accepted — pre-warm when a native default is pending. Create is enabled on Claude while the catalog fetch runs, so a quick click starts the wrong model silently.

**Verified against:** the design's own snippet (`if (!nativeSupported || !active) return;`,
line 89) and lines 94-97 ("Until then the form stays exactly where it is today … so there is
no flash"); `RuntimeBinding.tsx:190-202`; `ipc-handlers.ts:3105`
(`modelCatalog.get(await providerRegistry.list())`); `main/providers/model-catalog.ts:90-104`
and `:14` (`FETCH_TIMEOUT_MS = 15_000` — two network fetches whenever the 24 h disk cache is
stale or absent); `SessionStrip.tsx:2397` / `App.tsx:3493` (Create is disabled only by
`nativeCreateBlocked`, which is false under Claude)

Keeping `!active` means the provider/catalog fetch **cannot start until the form is already
open**. So the sequence on the first open after a launch is: form opens on the remembered
runtime (Claude, for everyone but a ChatGPT install) → fetch starts → some time later the
default is applied and the form jumps to the native model. Two consequences the design does
not state:

1. **The default is silently ignored if the user is quicker than the fetch.** Create is
   enabled the whole time, on Claude Sonnet. `providers.catalog()` is cheap when the memo is
   warm and up to 15 s when it is not (cold cache, or >24 h since the last refresh — which is
   the *normal* state on a first open after a relaunch). A user who clicks New Session and
   then Create gets a Claude session despite having set GPT-5.6 as their default. That is
   contract R5 failing intermittently and invisibly — the shape rounds 1 and 2 kept rejecting.
2. **There is a flash, in the other direction.** The design says "there is no flash of a
   native form that then reverts". True — but it replaces it with a Claude form that jumps to
   native under the pointer, on the first open of each form. Combined with R3-2, a pick made
   during that window can be overwritten after the fact.

**Suggested fix:** drop `active` from the gate for the pending-default case only — both forms
are permanently mounted (`SessionStrip` in the header, `App` itself), so
`if (!nativeSupported) return; if (runtime !== 'native' && !pendingStartModel) return; if
(!active && !pendingStartModel) return;` pre-warms the lists at launch and makes the apply
synchronous from the user's point of view. That is what R2-1's "hoist the fetch" option
bought, at three lines instead of a new App-level fetch. If it is not done, the design must
say Create is live on the wrong model during the window and say what stops a create there.

---

## R3-4 — the three guards are all about native, so T1 gives a Claude default the power to open a ChatGPT-only install on a runtime it cannot start — the precise failure `defaultRuntime()` and test (f) exist to prevent

**Severity:** serious

**Triage:** accepted, and the best catch of the three rounds — a Claude startModel can now move the runtime, which the stored alias never could. A ChatGPT-only install could open every form on Claude Code with no Claude login. The guards must face BOTH runtimes, not just native.

**Verified against:** `ModelPicker.tsx:177` (`includeClaude = true` by default),
`:384-392` (the four Claude aliases are pushed unconditionally, with no check that Claude
Code is usable); `assistant-settings/pages.tsx:166-172` (the General page passes neither
`includeClaude` nor `includeNative`); `RuntimeBinding.tsx:106-132` (the WHY block: a ChatGPT
install "has no Claude login at all… their very next session would try to start Claude Code
and fail"); `SessionStrip.tsx:396-404` (`applyModelChoice`'s Claude branch sets
`runtime = 'claude'`)

Today the stored default **cannot move the runtime**: `defaultModel` only feeds `setNewModel`,
the Claude alias. That is the accidental protection that keeps a ChatGPT-only install on
native. T1 removes it — a stored `startModel` is applied through `applyModelChoice`, whose
Claude branch sets `runtime = 'claude'` — and the design's three guards cover only the native
direction ("native chosen, native not supported", "provider gone", "model gone").

Concretely: an install set up through ChatGPT (`youcoded-runtime-default = 'native'`, no
Claude login) opens Assistant settings, where the picker lists "Claude Code · Sonnet / Opus /
Haiku / Fable" unconditionally — and where `startChoice` already *shows* "Claude Code ·
Sonnet" as the current value. They pick Opus. From then on both new-session forms open on
Claude Code, with Create **enabled** (`nativeCreateBlocked` is false for the Claude runtime),
and every session they start fails to launch. The design's own principle — "a form must never
open on a runtime that cannot create a session" — is violated in the one direction it does
not check, and the source guard that was written for exactly this install type
(`runtime-default.test.tsx`, whole file) still passes because no literal was added.

**Suggested fix:** either add the fourth guard (a Claude `startModel` is applied as an alias
only — never as a runtime switch — which is today's behaviour and costs nothing, since
`defaultModel` already carries it), or decide out loud that an explicit Claude pick beats the
install default and say what the user sees when it fails. Not deciding is what ships the
broken install.

---

## R3-5 — `startModelLabel` is stored once and never rechecked, so after T1's guard pushes the forms back to Claude the Settings row goes on confidently naming a model nothing will start

**Severity:** serious

**Triage:** accepted — I introduced startModelLabel this round and did not say what happens when the choice behind it stops being valid. The panel revalidates on open and clears both fields, so the row cannot name a provider that is gone.

**Verified against:** `assistant-settings/pages.tsx:44` (the stored field), `:99-108`
(`startSummary` returns the stored words before any lookup), `:167-170` (written at pick
time); `AssistantSettings.tsx:129` (`startSummary(defaults)` — still no live check); design
lines 74-97 (guards 2 and 3 fall back to Claude silently); contract R2 ("The Assistant
settings row shows the current default")

The R2-3 code fix is correct for what it set out to do — the row now reads "ChatGPT · GPT-5.6"
instead of `gpt-5.6-2026-04-01`. But it stores a *snapshot of words* and nothing ever
re-validates them, while T1's guards 2 and 3 make the forms quietly stop honouring that same
default. The two halves now disagree permanently and in the most convincing way possible:

- Sign out of ChatGPT, or delete the OpenRouter provider, or let a model leave the catalog →
  every new-session form falls back to Claude (by design), and the Settings row still says
  "ChatGPT · GPT-5.6" with a friendly provider name. Before the fix the row at least showed a
  raw id, which reads as suspect; now it reads as verified.
- Rename an openai-compatible endpoint's label in Model Providers → the row keeps the old name
  forever.

Round 2's R2-3 named this half explicitly ("it is also the one place a *deleted* provider is
still visible after T1's guard has pushed the forms back to Claude — the row keeps advertising
a model nothing will start"), and the design never mentions `startModelLabel` at all — the
code fix landed without a corresponding line in T1, so a builder reading the design will not
know the field exists.

**Suggested fix:** the reason the label was stored was to avoid a catalog lookup on drawer
open. A *provider* check needs no catalog and no network: `providerRegistry.list()`
(`main/providers/provider-registry.ts:111-134`) is a local read, and the row already fires
probes of its own in `useAttention`. One `providers.list()` when the row renders is enough to
show the fallback the forms will actually use ("Claude Code · Sonnet") when the stored
provider is gone or not ready. At minimum, T1 must state the field, and state that the row
does not follow the guards.

---

## R3-6 — R2-3 is fixed only for catalog rows: a typed model id (Ollama, LM Studio, any openai-compatible endpoint) still stores no label, so the row still shows a bare id

**Severity:** minor

**Triage:** accepted — one line; the freeform "type a model name" path stores no label. Fixed in code in this round.

**Verified against:** `ModelPicker.tsx:487` (the catalog row passes
`{ provider: e.sourceLabel, model: e.label }`), `:627` (`pick({ runtime: 'native',
providerId: p.id, modelId: id2 })` — the freeform path, **no label**), `:331` (the `prefill`
path, also no label — unreachable from Settings, because `startChoice` never returns null, so
`!value` is always false there); `pages.tsx:170`
(`startModelLabel: choice.runtime === 'native' ? label : undefined`)

The freeform "Type a model name…" entry is reachable from the Assistant settings picker
(`freeformProviders` is built from ready openai-compatible providers with an empty catalog).
Picking one stores `startModelLabel: undefined`, so the row falls back to `c.modelId` — the
raw id with no provider name, e.g. `qwen2.5-coder:7b` under "Assistant settings". That is
exactly the defect R2-3 filed, surviving on one path.

One-line fix at `:627`: `pick({ … }, { provider: p.label, model: id2 })`.

Related, and worth one sentence in T1: over remote access this cannot self-correct. The
desktop clears a stale label because Electron's structured clone preserves an explicit
`undefined` and `JSON.stringify` then drops the key; `remote-shim.ts` sends the update as
JSON, which drops `startModelLabel: undefined` **before** it is sent, so the remote server's
`{...current, ...payload}` keeps the previous label. A native→freeform re-pick over remote
leaves the old provider/model words on the row.

---

## R3-7 — the design's fetch-condition snippet uses a `pendingStartModel` that does not exist in the hook, and does not say how it gets there or into the dependency array

**Severity:** minor

**Triage:** accepted — pendingStartModel is a name the design invented; the four real edits and the object-identity trap are spelled out.

**Verified against:** `RuntimeBinding.tsx:175-180` (the hook's four inputs:
`active, runtime, binding, setBinding`), `:190-202` (the effect and its
`[nativeSupported, runtime, active]` deps); `SessionStrip.tsx:380`, `App.tsx:425` (the two
call sites); `App.tsx:478` (`sessionDefaults` state — the stable reference the value must
come from)

The design presents the change as "the fetch condition changes, not the guard", and shows two
lines. Building it is four edits, none of which the design names: a fifth input on
`useNativeBinding`, the two call sites passing it, and the new value in the effect's
dependency array. The dependency is the part with a trap: `eslint` (`react-hooks/exhaustive-
deps`, part of `verify.sh`) will require it, and if the value is handed down as a freshly
built object each render rather than the stable `sessionDefaults.startModel` reference, the
effect re-fires on every render and each `setProvidersList` re-render re-fires it again — an
IPC loop, one of whose calls can hit the network.

Also worth pinning: `pendingStartModel` should be the **native** case only. As literally
written, an ordinary Claude-only user who has ever touched the Default model row triggers a
provider list + catalog fetch on every form open.

---

## R3-8 — test (f)'s 600-character window leaves 262 characters of headroom in `SessionStrip`'s create tail, and comments count toward it

**Severity:** minor

**Triage:** accepted — the 600-char window has 262 chars of headroom and comments count. Noted as a build constraint so a WHY comment does not turn the guard red with a misleading message.

**Verified against:** `tests/helpers/guard-scope.ts:79-83` (`stripComments` **blanks with
spaces, preserving offsets** — a comment still occupies its full length in the window);
`runtime-default.test.tsx:133-144`; measured offsets: `setRuntime(defaultRuntime())` ends at
offset 338 of the 600-char tail in `SessionStrip.tsx`, and
`setWelcomeRuntime(defaultRuntime())` at offset 304 in `App.tsx`

The design fixes the *order* (reset, then apply) and is right that this keeps the guard green.
What it does not say is that the window is nearly full. Anything inserted **between**
`setShowNewForm(false)` and the pinned `setRuntime(defaultRuntime())` — most plausibly the WHY
comment this workspace requires at every non-trivial edit, and the house style runs long — has
262 characters of room in `SessionStrip` and 296 in `App` before the pinned call falls out of
the window and test (f) goes red with the message "must reset to defaultRuntime() after a
create". That is the misreading R1-3 predicted would get the correct change reverted.

**Suggested fix:** one clause — new code and its comment go **after** the existing
`setter(defaultRuntime())` line, never above it.

---

## Coverage note

Read in full on `2ee9cc3d`: `RuntimeBinding.tsx`, `runtime-default.test.tsx`,
`assistant-settings-attention.test.tsx`, `assistant-settings/AssistantSettings.tsx` (top half),
`assistant-settings/pages.tsx` (types, `startChoice`, `startSummary`, General page),
`tests/helpers/guard-scope.ts`, `main/providers/model-catalog.ts` (`ensureFresh`),
`main/providers/provider-registry.ts` (`list`), the diff of `2ee9cc3d` and `27edceaf`, the
contract JSON (all 24 rows), `OPEN-QUESTIONS.md`, and the three roadmap files. Read in the
cited ranges: `SessionStrip.tsx` (state block, `applyModelChoice`, `handleCreate`, menu
handler, Create button), `App.tsx` (welcome state, `applyWelcomeModelChoice`, defaults load,
welcome open/create handlers), `ModelPicker.tsx` (props, fetch + prefill, `entries`,
`readyProviders`, `freeformProviders`, `pick`, freeform input), `ipc-handlers.ts` (defaults
handlers, provider handlers, `defaultsPrefPath`), `main.ts` (permission cache, `whenReady`
ordering), `SettingsPanel.tsx` (`handleDefaultsChange`, both mounts), `shared/types.ts`
(overrides).

Run: `bash scripts/verify.sh <worktree>` — full suite, all six checks green; and a mutation
run of the attention-dot guard through a scratch vitest config (no repo file was modified).

Not verified: no Android build was run; no dev instance was launched; the packaged-build
behaviour of `app.isPackaged` was taken from round 2's reading. R11–R14 and R21–R22 were not
re-reviewed (round 2 did not either).
