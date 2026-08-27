# D1/D2 review 3 — 10127ff6..a9e041d7

**Verdict: Approved.** No consent bypass and no grant leak found; every review-2 item is resolved (Minor 6 deliberately as a comment, per the brief). Three Minors below, none blocking.

### Spec Compliance
- ✅ `CROSS_PROJECT_SLUG = 'all projects'` and `isCrossProjectRule` exported from `desktop/src/shared/permission-types.ts:78,99-101`; predicate is exactly `tool === 'Task' && /^(read-only|read-write):file:/`. Structural reservation verified: `nativeStoreSlug` (`src/main/slug-encoding.ts:54-60`) replaces `\`, `:`, `/` and space with `-`, so no cwd can produce a key containing a space.
- ✅ `PermissionStore.rulesFor` unions bucket first, then project, both through `normalizeRule` (`permission-store.ts:68-71`). `remember` routes by `isCrossProjectRule(rule)` and writes `{ ...existing, rules }` with NO `cwd` for the bucket, `{ ...existing, cwd, rules }` otherwise (`:76-79, :110-111`). `list`/`remove`/`removeProject` untouched and slug-keyed (`:119-166`).
- ✅ `revokeRule`: `if (slug !== CROSS_PROJECT_SLUG && nativeStoreSlug(entry.cwd) !== slug) continue;` (`native-session-host.ts:2178`) — the bucket reaches every live session. `revokeProject`: bucket branch filters `!isCrossProjectRule(r)` per session and `continue`s before the whole-memory delete (`:2201-2206`). Doc comments updated (`:2151-2156, :2188-2191`). `rememberRule`/`buildDecide` unchanged.
- ✅ Settings: bucket ordered first (`PermissionsSection.tsx:371-374`), titled "All projects" (`:552`), explainer copy verbatim from the brief and in place of the never-recorded sentence (`:597-602`). Rows and "Revoke all" reuse the card verbatim with `project.slug`.
- ✅ `docs/native-runtime.md` sentence added naming `isCrossProjectRule`, `CROSS_PROJECT_SLUG`, the `rulesFor` union and "All projects".
- ✅ Tests requested by the brief all present: store (+7, +3 `isCrossProjectRule`), host (+3, real `buildDecide`), section (+3), catalog (+1 folder→scope), definition-files (+3; `rg "loadClaudeCodeDefinition\(" tests/specialist-definition-files.test.ts | rg -v "'user'|'project'|import"` → empty, so no two-arg call remains), describe-rule (+1), envelope (+4).
- ✅ Minor 3: `describe-rule.ts:130` hash part is `[^@]+$`; `task.ts:311-315` comment no longer claims Settings labels the case.
- ✅ Minor 4: `ToolCard.tsx:361-385` posix-segment resolver; `./`, `..`, `../other` pinned.
- ✅ Minor 5: `ToolCard.tsx:1257-1262` suppresses Always allow when `!tool.input?.work_dir`; pinned.
- ✅ Minor 6: comment on `registry.ts:41-43`; no rename. The implementer's correction is right — `GrantScope` lives in `src/shared/bash-grant-shapes.ts:12`, not `permission-types.ts`.
- ⚠️ Cannot verify from the diff: whether the Permissions (i) explainer (`SettingsExplainer`, not in this diff) still describes every card as a folder. Only the card copy was in scope; flagging as a copy-consistency follow-up, not a defect.

### Strengths
- **Named risk (1) — what can land in the bucket.** Only `rememberRule` writes rules, and the only Task rule shape it can receive is `rememberedRuleFor`'s `{ tool:'Task', pattern: subject, action:'allow', match:'exact' }` (`harness-session.ts:121-125`; Bash is the only tool that gets a wide/glob rule, and a subject-less Task returns `null`). Bash grants fail the `tool === 'Task'` test. A built-in subject is `${charter}:${absoluteWorkDir}` and a project subject `${charter}:${absoluteWorkDir}:file:…` — `resolveP` makes the work dir absolute (`/…` or `C:/…`), so `file:` can never follow the charter directly; the Windows case is pinned. A specialist-keyed grant is only stamped on the child-approval path (`native-session-host.ts:1488`), and children have no Task tool (`NATIVE_CHILD_TOOLS`, `definition-files.ts:18`), so no specialist-keyed Task rule exists to route. Nothing else qualifies.
- **Named risk (2) — scope filter.** `buildDecide` applies `inScope` AFTER the disk/memory union (`:2244-2247`), and `rulesFor` is the disk half, so bucket rules get the identical `r.specialist === undefined` (root) / `undefined || === scope` (child) filter as project rules. Even a hand-planted specialist-keyed bucket rule could not widen a root session.
- **Named risk (3) — other readers.** `rg "permissions\.json|StoredProject|permissions:list"` over `desktop/src` and `app/src`: `remote-shim.ts:1602-1604` and `preload.ts:1241-1243` only forward the channels; `remote-server.ts:1034-1057` calls `permissionStore.list()` and the host's `revokeRule`/`revokeProject` (never the store's remove — invariant held); `SessionService.kt:3773-3775` lists the channels as not-implemented; `useIpc.ts` types only. The Settings renderer is the sole consumer that interprets the key, and `folderNames` already skips cwd-less entries (`PermissionsSection.tsx:232`) so the bucket never participates in folder-name disambiguation. No mis-handling.
- The subject-as-discriminator design means a rule read back off disk cannot disagree with its bucket; `revokeProject`'s memory filter uses the same predicate the store used to file it, so disk and memory stay in lockstep.
- The host test "approved in one project, in force in another" drives the real `buildDecide` for a session that has no in-memory copy, and pairs it with the edited-fingerprint ASK — both halves of the card's promise in one test. `revokeProject(CROSS_PROJECT_SLUG)` leaving a same-session `Write` grant is pinned against the naive whole-memory delete.
- Under `revokeProject(slugA)` a session at A loses its memory copy of a bucket rule too, but `rulesFor` restores it from disk on the next decision — consistent with the disk being the record and the bucket card being untouched.

### Issues
#### Critical (Must Fix)
None found.

#### Important (Should Fix)
None. Prior Important 1 (bucket) and Important 2 (folder→scope pinning, two-arg loader calls) are both resolved as verified above.

#### Minor (Nice to Have)
1. **Pre-fix rows are not migrated** (`permission-store.ts:68-71`). A `read-*:file:` rule written by the previous commit of this branch sits under a project slug; `rulesFor` still reads it only there, and Settings shows it under that folder's card while `describeRule` reads "in every project". Fails in the under-granting direction and only dev-instance profiles from this unreleased branch can hold such rows, so no user impact — but a one-line note in the doc paragraph (or a read-side re-route in `list()`/`rulesFor`) would close the last case where the copy and the store disagree.
2. **No workbench fixture for the bucket** (`src/renderer/dev/workbench/fixtures/permissions.ts:15,28,41` are all folder slugs). The "All projects" card exists only in a unit test; add a `{ slug: CROSS_PROJECT_SLUG, rules: [...] }` entry so the card can be eyeballed in the workbench / `ui-review` sheet before Destin signs off the copy.
3. **Vacuous-pass shape in the fingerprint test** (`tests/specialist-definition-files.test.ts`, the "stable for the same bytes" case): `expect(first.ok && again.ok && fp).toBe(again.ok && fp)` passes as `false === false` if `again` fails to load. `first.ok` is independently proven by the `toMatch` on the line above; add `expect(again.ok).toBe(true)` (and the same for `ccUser`) so a loader regression cannot hide behind the guard.

Prior-review item status: Important 1 resolved; Important 2 resolved; Minor 3 resolved; Minor 4 resolved; Minor 5 resolved; Minor 6 resolved as a distinguishing comment (rename explicitly declined by the brief).

### Assessment
**Task quality:** Approved
**Reasoning:** The cross-project bucket is implemented exactly as designed, and the three named risks each check out by construction (the only Task rule shape that can reach `remember` is the fingerprinted exact subject; the scope filter runs after the union; no other reader interprets the key). Everything review-2 raised is now pinned by a test that reads the real store, host or card; the three Minors are polish, not permission behaviour.
