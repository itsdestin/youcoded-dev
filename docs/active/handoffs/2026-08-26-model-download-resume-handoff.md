---
status: active
created: 2026-08-26
kind: implementation-handoff
spec: docs/active/specs/2026-08-26-model-download-resume-design.md
plan: docs/active/plans/2026-08-26-model-download-resume.md
---

# Handoff: interrupted model downloads — implement the plan

For the session that builds this. Read in this order, then start at the plan's Task 0:

1. `docs/active/specs/2026-08-26-model-download-resume-design.md` — what and why (10 min).
2. `docs/active/plans/2026-08-26-model-download-resume.md` — every step, every test, every command. It is the deliverable's contract; this handoff is the context the plan deliberately leaves out.
3. This file — the traps, the history, and the one place the plan needs a tool it doesn't name.

The plan is executed with `superpowers:subagent-driven-development` (or `executing-plans`), one task at a time, in a worktree. **Task 2 ends at a human gate. Nothing after it starts until Destin has approved the sheets.**

---

## 1. Where things stand (verified 2026-08-26)

- `youcoded` `origin/master` is `62c1f182`. No branch, worktree, or code exists for this work yet — Task 0 creates them.
- Spec and plan are **modified and uncommitted** in `youcoded-dev` (`git status` shows both). Commit them in `youcoded-dev` as your first act, alone — the tree also holds unrelated uncommitted changes (`.claude/rules/artifacts.md`, `.claude/rules/ipc-bridge.md`, a conversation-preview spec, stray `*.html` files, a `statusbar-relevance.json` rig plan) that belong to other sessions. Don't sweep them up.
- The `youcoded` **main checkout** also has unrelated uncommitted work (`Dialog.tsx`, `WorkbenchToolbar.tsx`, `AssistantSettings*.tsx`, `zz-repro.test.ts`, …). Not yours; this is why you work in a worktree.
- 15 worktrees are registered (`bash scripts/run-dev.sh --list`). When you launch a dev instance, pass a distinct `--offset` **and** `--profile` — a collision kills the other window.
- The ROADMAP entry exists: `ROADMAP.md:103`. The MAP row exists: "Local engine & models". Both get updated after merge (plan Task 10 Step 6).

## 2. What the plan's first draft got wrong — so you don't reintroduce it

The plan was reviewed once against the code and rewritten. These were real errors, each verified with a command; the current plan has them fixed. If you find yourself "simplifying" back toward one of these, stop.

| First draft | Why it was wrong | Where the fix lives |
|---|---|---|
| Cancel tests used a fetch that never resolves (`new Promise(() => {})`) | The downloader only notices a cancel while bytes flow; the test hangs to timeout. `tests/model-downloader.test.ts:89-92` already warns about this. | Task 4 uses the abort-honoring drip fake. |
| Tests asserted "79.7 GB of 121.3 GB" | `gb()` at `LocalModelsSection.tsx:24` divides by 1024³ → 74.2 / 113.0. | Global constraint + every fixture. |
| Row test imported `@testing-library/user-event` and had no jsdom header | Package isn't installed (`node_modules/@testing-library/` = dom, jest-dom, react). `vitest.config.ts:43` requires `// @vitest-environment jsdom` on line 1 of `.tsx` tests. | Task 9 uses `fireEvent` + `act`. |
| The new row only showed errors thrown by the button click | `resume()` returns the moment the download *starts*; HTTP/integrity failures arrive later as an `error` progress event. Today's `PartialRow` (`:588`) shows that message; the draft dropped it. | Task 2's row reads `progress.state === 'error'`; Task 9 pins it. |
| A comment claimed "the unified scan subtracts live downloads" | It doesn't (and needn't — live downloads are rows with progress attached). `activePartialNames` lost its only caller. | Task 8 deletes it. |
| Downloads that failed before their first byte had no row and left an orphan manifest | The scan only created rows from `.gguf`/`.partial`. | "A manifest alone is a row" — Task 5/6. This also removed a whole fallback list from the renderer. |
| Live progress matched rows on the *filename-parsed* quant | HF's quant string is what progress events carry. | `installedModels()` takes `quant` from the manifest when present. |
| Dev-instance check downloaded a model without saying where it lands | `NativeHome` uses `os.homedir()` (`native-home.ts:31`), so the dev window reads/writes Destin's **real** model folder. | Task 10 says so and hands the download step to Destin. |

## 3. Traps in the code you'll be editing

- **Serena sees `master`, not your worktree.** Use it to orient (`find_symbol`, `find_referencing_symbols`) and never to check your own edits. Branch truth is `bash scripts/verify.sh <worktree>`.
- **`cp -al` for `node_modules`.** Never symlink. Never run Gradle or `build-web-ui.sh` in the worktree.
- **Line numbers in the plan are from `62c1f182`.** They're a map, not an address — if a file moved, search for the symbol.
- **`knip` runs `classMembers` as `warn`, not `error`.** A dead method won't fail `verify.sh`; Task 8 Step 6 asks you to read the output, not just the exit code.
- **`workbench-mock-contract.test.ts` only checks members listed in `HAND_WRITTEN`.** Forgetting to list a new mock member means the contract silently skips it (Task 2 Step 2).
- **`Ns<'models'>` is `Partial<…>` of the type in `useIpc.ts`.** Every mock member you add must exist in that typed contract or `tsc` fails — Task 2 Step 4 adds `resume` there before the mock can use it.
- **The rig's step schema** (`scripts/ui-review/shot.mjs:159-186`): `click` (selector or `js:` expr), `clickText` + optional `tag`, `scrollDialog`, `wait`, `settle`, and `expect` (selector or `js:`, must be truthy). Task 2 Step 11's JSON uses exactly these.
- **Manifest key = first file's basename.** `groupQuantOptions` sorts parts (`quant-parser.ts:77`), so `files[0]` is always part 1 and matches the row id the scan derives. If you ever see a manifest not being found, check that assumption first.
- **The two mocks the plan does not add** — `models.download`, `models.search`, `models.quants` — keep falling through to the shim's catch-all, as today. Don't add them unless a boot-check error names them.

## 4. The gate (Task 2, Step 13) — how to present it

Destin reviews UI as a **review deck** (v2 since 2026-08-27 — the format below is superseded): `python3 scripts/ui-review/review-cards.py serve <spec.json>` in the background; one point per step, Before | After with the changed region boxed by the rig, a headline and three cards (What changed / You'll notice / Risk), Yes / No / Other; answers reach Claude on Submit. Spec template: `docs/active/design/2026-08-25-ui-audit/phase-c-review-v2.json`; rules in `scripts/ui-review/README.md`. The v1 description that follows is kept for the record only — the old JSON shape no longer builds. He rejected both a gallery and a prose-first page on 2026-08-26 ("gotta read WAY too much text in different areas… images are poorly organized/annotated"). The plan says "present the sheets"; **this is the format**.

Cards to build, from the rig's shots in all six themes:

1. Rows at rest (`providers-local-scrolled`) — the three states side by side.
2. Discard confirmation (`local-models-discard-confirm`).
3. Delete confirmation (`local-models-delete-confirm`).
4. Mid-resume (`local-models-resuming`) — progress bar in place, Cancel.

Then the five decisions listed in the plan's Step 13, each as a Yes/No point on the relevant card: Discard-vs-Delete, Cancel-vs-Pause, the `66% — 74.2 of 113.0 GB` line (and that it will never match Hugging Face's decimal number), the untraceable explanation's placement, the unfinished-discard confirmation copy. Judge against `docs/active/design/2026-08-25-ui-design-guide.md` first and put your own measured findings on the cards too, separated from taste.

He usually answers in a sentence. Whatever he decides, change the copy in `LocalModelRow` **and** in Task 9's tests **and** in the rig's `expect` strings, re-capture, and only then continue to Task 3.

## 5. Things Destin decides, not you

- The five copy decisions above.
- Whether the test model from Task 10 Step 3 stays in his real model folder (tell him it will be there; he deletes it from his live app if he wants).
- Whether to merge. Report the PR and stop — don't prompt for merge or release.

## 6. Definition of done

- Every task's tests pass in the order the plan runs them (fail first, then pass).
- `bash scripts/verify.sh <worktree> --full` exit 0, output in the PR body.
- `rg -n 'orphaned-partials|ORPHANED_PARTIALS|orphanedPartials|OrphanedPartial|scanPartialFiles|activePartialNames' src tests ../app/src` → nothing.
- `node scripts/workbench-boot-check.mjs` passes after every mock-shim change.
- The four rig shots are `covered` in `coverage.md`.
- Destin's real `Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004` reads *untraceable* in the dev window and is absent from the conversation model picker (Task 10 Step 2 — read-only, you do this).
- PR opened with the five sections the plan specifies; dev-instance checks 3–5 recorded as Destin reported them, or "not run".
- After merge: spec + plan + this handoff to `docs/archive/`, `status: shipped`, ROADMAP `[x]` with the merge SHA, MAP row updated, worktree and branch removed both locally and on GitHub.

## 7. Out of scope — do not drift into

Auto-resume, auto-retry, guessing an untraceable download's source, changing the binary-GB convention, Android, reading GGUF headers, refactoring `RepoCard`/`QuantDownloadRow`, and the unrelated uncommitted work in either checkout.
