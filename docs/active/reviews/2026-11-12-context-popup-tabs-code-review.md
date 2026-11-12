# Code review: "What the assistant was given" three tabs (#251)

Branch `session/251-context-popup-three-tabs`, diff `origin/master...HEAD` (app repo) plus `scripts/shoot/shoot.mjs` (`lookalikes`).

## Verify summary

`verify.sh` NOT run (machine load average was 22 a minute earlier; the brief allows direct runs). Ran instead:
- `npx vitest run tests/session-context-panel.test.tsx tests/session-context.test.ts tests/claude-code-context.test.ts` : 3 files, 36 tests passed.
- `npm run typecheck` (generate-preload-channels check + tsgo for src and tests): clean, no output errors.
- Not run: knip, lint, ast-grep, full suite, Android.

## Findings (most severe first)

- F1 accepted — scope pinned in claude-code-context.test.ts and skill-catalog.test.ts — youcoded/desktop/tests/session-context.test.ts, tests/claude-code-context.test.ts (whole files) — nothing pins that the two engines supply `scope`. If either `claude-code-context.ts:61` or `native-session-host.ts:3526`/`harness-session.ts:1542` stops sending it, the popup silently files every skill under Global, and all 36 tests still pass. Statement 4's "both engines supply scope" is unguarded — confirmed with `rg scope` / `rg scopeOf` over `desktop/tests`: zero hits in either main-side test; only the panel test feeds hand-written `scope` values.
- F2 accepted — test added in session-context-panel.test.tsx — youcoded/desktop/tests/session-context-panel.test.tsx — the `skillsOffered === false` warning ("The assistant wasn't told about these") is not tested on either tab. The branch moved it from one tab to two places (Global when it holds skills, Project when it holds skills) and the Overview row's jump target changed (`globalSkills.length > 0 ? 'global' : 'project'`). `rg "told about"` over the panel test: no hits. Code read: behaviour is correct (shown on each tab that has skills, absent on a tab with none; Overview row goes to the tab that has some), so this is a missing pin, not a bug.
- F3 rejected — an add-on id may not contain "__" (mcp/types.ts, sanitizeServerId) — SessionContextPopup.tsx:414-426 (`splitTools`) — an add-on whose own name contains a double underscore (`mcp__my__srv__tool`) is split as add-on "my", tool "srv__tool". Also `mcp__x__` yields an empty tool name. PLAUSIBLE: depends on whether the MCP layer lets server names contain `__`; I did not check the name sanitiser.
- F4 accepted — dead mcp branch of toolBlurb removed; the lost line carried no information — SessionContextPopup.tsx:119-126 (`toolBlurb`) — its `mcp__` branch ("Part of the X add-on…") is now unreachable: every `mcp__a__b` tool goes to an add-on row that prints the bare tool name, and the built-in fold only sees non-mcp names (a 2-part `mcp__x` would reach it and get the generic line). Dead code left behind; add-on tools lost their one-line blurb (consistent with statement 6, but it is a small loss against statement 9). Confirmed by reading `splitTools` and the render.
- F5 rejected — predates this branch; a duplicate id shows on both tabs, nothing breaks — claude-code-context.ts:147 and :55 (pre-existing, now more visible) — a project skill with the same id as an installed skill appears twice in a Claude Code chat (once Global, once Project; native de-duplicates with project winning). Its text lookup (`.find` over `[...scanSkills(), ...scanProjectSkills]`) returns the global file for both rows, so the Project row opens the wrong file. PLAUSIBLE: not run; read from the two code paths. Edge case only.
- F6 rejected — minor; nothing is lost — SessionContextPopup.tsx:370-383 (`CappedRows`) — "Show all N" resets when you switch tabs and back (tab content unmounts). Minor annoyance, not a loss of information; nothing is hidden for good.
- F7 already handled — deliberate (Destin, deck round 1, T-5) — SessionContextPopup.tsx:258-263 — the "Read in full" / "YouCoded didn't shorten it" lines are gone for an unshortened file; the line now only names when it is read. Intentional per the in-code WHY (deck T-5) and the test asserts their absence; listed only because it is the sole thing from the old pop-up that is no longer shown anywhere.

## Checked and fine

- Statement 1/2: three tabs only; Overview has Engine (Runs this chat / Model / Context window) and a Given group whose two rows `setTab`.
- Statement 3: Claude Code with `tools: null` / `systemPromptSections: null` shows "Chosen by Claude Code" / "Written by Claude Code" rows; window shows "Set by Claude Code" when null. Nothing shown as empty or invented.
- Statement 4: `scopeOf` exists on the real catalog; the discovery worker (`session-discovery-worker.ts:15`) keeps `source` on entries through structured clone, so the runtime path (`create-runtime.ts:442`) keeps scope; the `allow` wrapper in `harness-session.ts:1518` forwards `scopeOf`; child sessions' hand-built catalog has none, so scope is absent and the panel files under Global (as promised). `{...sk, scope: undefined}` is dropped by `native-session-host.ts:3526` spread guard.
- Statement 5: user rules only in Global; project files only in Project.
- Statement 7: every statement on Global/Project is inside `Group` -> `Note`/card/row; the skills warning is a Callout (a box). Overview's status box paragraph is inside a rounded box.
- Statement 8: shortened label correct, engine note not rendered (test line 62).
- Statement 9: old System tab -> Global "System instructions" (all sections + blob fallback); old Tools tab -> built-in fold (every tool with blurb) + add-on folds + "Not attached" callout kept; old Skills tab -> Global/Project skills with the same SkillCard; old Project tab -> Project rules (ancestor chain, notUsed, cut view) plus user rules on Global; old "What was left out" rows kept, targets retargeted; old Given row -> counts on the two Given rows. Only exceptions: F4, F7.
- Statement 10: `sessionContext` travels as an opaque object everywhere (`session-record.ts:200,683,782` typed `unknown`, `session-open.ts:147`, reducer `SESSION_CONTEXT` stores and JSON-compares it whole, `remote-shim` only forwards). No code strips or validates skill fields, so `scope` survives IPC, session record, remote and Android (Android runs the desktop backend; no Kotlin touches the context — `rg` over `app/src` found none). Old stored records without `scope` fall to Global (tested). Fixtures and mock shim updated to carry `scope`.
- Stale references: no tests, journeys, scenes, MAP.md or living docs name the removed System/Skills/Tools tabs. The `shoot` screen `chat/session-context#skill-open-hover` was updated to click "Global context". The compare registry (`dev/workbench/compare/registry.tsx:5853`) is an old visual mock-up with its own tabs, not live code. Removed copy ("Claude Code manages this chat…", "Written by you, and read…") appears only in archived/design deck files.
- `shoot.mjs` `lookalikes`: `root()` follows the `same` chain with a cycle guard; two screens with the same root are treated as expected twins. Logic is sound. Side effect: any two screens declared `sameAs` the same base now suppress a real accidental match between them — acceptable by design.
- Performance/render: popup returns null when closed (no hooks); skill rows are capped to 5 until "Show all", each skill fetch only fires when opened; no new subscriptions, effects, or main-process sync calls. The skill list is the user's own things but was previously drawn whole and the cap now improves it; no 1,000-item stress pin was added (the panel test uses 12), which `renderer-lists.md` asks for new lists, but this list is not new.

## Not covered

- `verify.sh` (knip, lint, ast-grep, shoot --check), the full suite, any Android build/test.
- No runtime look (dev server was off-limits); layout/narrow-viewport behaviour of the new rows read from code only.
- MCP server-name sanitiser (F3) and the Claude Code duplicate-id lookup (F5) not exercised.

Disagreement with approved design: none worth raising.
