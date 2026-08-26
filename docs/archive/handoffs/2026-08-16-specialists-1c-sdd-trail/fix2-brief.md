# Brief: review-2 findings on D1/D2 — cross-project grants must actually work, plus coverage and polish

Worktree: /home/destin/youcoded-dev/worktrees/specialists-1c (branch feat/specialists-1c-ui, HEAD 10127ff6).
Read `.superpowers/sdd/d1d2-brief.md` (the spec) and `.superpowers/sdd/d1d2-review-2.md` (the
review) first. This brief is the fix design. Follow it; if a test proves it wrong, report,
don't redesign silently.

## Important 1 — the "every project" grant is stored and read per project only

Facts (verified): `PermissionStore.rulesFor(cwd)` reads only `projects[nativeStoreSlug(cwd)]`;
`remember(cwd, rule)` writes only there; the host's `buildDecide` unions `rulesFor(cwd)` with
per-session memory on EVERY decision; `revokeRule/revokeProject` match live sessions by slug.
So a `user`-scoped Task grant made in project A is never read in project B — the card,
`describeRule`, and `docs/native-runtime.md` all promise "every project" falsely.

### Design (no new file format version; still `v: 2`)
1. `src/shared/permission-types.ts` — add and export:
   ```ts
   // The one bucket in permissions.json that is NOT a project. Its key contains a
   // space, which nativeStoreSlug ALWAYS collapses to '-', so no real cwd can ever
   // slug to it — the reservation is structural, not a convention.
   export const CROSS_PROJECT_SLUG = 'all projects';
   // A remembered rule that applies in every project. The Task hire subject IS
   // the grant width (tools/task.ts): a `user`-scoped file-defined specialist's
   // subject is `${charter}:file:${id}@${fp}` — no work dir at all — and that
   // shape, and only that shape, lives in the cross-project bucket.
   export function isCrossProjectRule(rule: Pick<PermissionRule, 'tool' | 'pattern'>): boolean
   ```
   → `rule.tool === 'Task' && /^(read-only|read-write):file:/.test(rule.pattern ?? '')`.
   (A project-scoped subject is `${charter}:${workDir}:file:…` — the `file:` is NOT right
   after the charter, so it does not match. Pin that in a test.)
2. `permission-store.ts`:
   - `rulesFor(cwd)` → `[...bucket.rules, ...project.rules].map(normalizeRule)` where
     bucket = `projects[CROSS_PROJECT_SLUG]`. Order: bucket first (both are allow rules,
     tie harmless — same reasoning as the existing disk/memory union comment).
   - `remember(cwd, rule)` → `const slug = isCrossProjectRule(rule) ? CROSS_PROJECT_SLUG : nativeStoreSlug(cwd)`;
     for the bucket NEVER write a `cwd` (spread the existing entry, set only `rules`).
     Keep every existing dedupe/spread/v2 behaviour.
   - `list()`, `remove()`, `removeProject()` — unchanged; they already work on any slug.
3. `native-session-host.ts`:
   - `revokeRule(slug, rule)`: when `slug === CROSS_PROJECT_SLUG`, filter the rule out of
     EVERY live session's `rememberedFor`, ignoring cwd.
   - `revokeProject(slug)`: when `slug === CROSS_PROJECT_SLUG`, for EVERY live session
     keep only `!isCrossProjectRule(r)` (do NOT delete the whole memory — the session's
     own project grants must survive).
   - `rememberRule` and `buildDecide`: unchanged (the store now routes; the union now
     includes the bucket).
   - Update the revokeRule/revokeProject doc comments to say why the bucket is special.
4. `PermissionsSection.tsx`: the bucket arrives from `permissions:list` as a
   `StoredProject` with `slug === CROSS_PROJECT_SLUG` and no `cwd`. Render it as the FIRST
   card, titled **"All projects"** (never the raw slug), with a one-line explainer under
   the title: "Your own specialists you chose to always allow. These apply in every
   folder." Do NOT show the "path was never recorded" wording for it. Its per-rule rows and
   its "remove all" control work as for any folder (they route through the same
   `revokeRule`/`revokeProject`). Match the existing card anatomy exactly — no new styles.
5. `docs/native-runtime.md` — in the "Hire grants for file-defined specialists (D1/D2)"
   paragraph, add one sentence: the `user` subject is routed by `isCrossProjectRule` into
   the `CROSS_PROJECT_SLUG` bucket of `permissions.json`, which `rulesFor` unions into every
   project's rules and Settings lists first as "All projects".

### Tests (real store over a real temp NativeHome / real host where the file's existing
tests do; follow each file's fixtures)
- `permission-store.test.ts`: remember(cwdA, userRule) lands in the bucket with NO cwd;
  `rulesFor(cwdB)` returns it; `rulesFor(cwdA)` returns bucket + A's own rules; a
  project-scoped `${charter}:${workDir}:file:…` rule lands under A's slug, not the bucket;
  `remove(CROSS_PROJECT_SLUG, rule)` works; `list()` exposes the bucket with no cwd;
  a v1 file with no bucket still reads fine.
- `native-session-host.test.ts`: (a) after "Always allow" of a user-scoped Task subject in
  a session at cwd A, a session at cwd B's decide (real `buildDecide`, via whatever the
  file's existing tests use to reach it) returns allow for that exact subject and still
  ASKS for a different fingerprint; (b) `revokeRule(CROSS_PROJECT_SLUG, rule)` clears it
  from a live session whose cwd is NOT the bucket; (c) `revokeProject(CROSS_PROJECT_SLUG)`
  leaves a same-session project grant in memory.
- `permissions-section.test.tsx`: bucket renders first, titled "All projects", with the
  explainer, without the never-recorded copy; its remove routes with the reserved slug.
- `permission-types` test (wherever `sameRule` is tested): `isCrossProjectRule` true/false
  for the three subject shapes and for a non-Task rule.

## Important 2 — folder → grantScope is unpinned; loader tests pass 2 args
- `tests/specialist-definition-files.test.ts`: 23 calls `loadClaudeCodeDefinition(path, raw)`
  → `tsc` does not cover `tests/` (tsconfig includes `src/**` only), so they run with
  `grantScope: undefined`. Update every call to pass `'user'` or `'project'` as the fixture
  implies; add: two different raws → different 12-hex fingerprints, same raw → same;
  personal loader stamps `grantScope: 'user'` + fingerprint.
- `tests/specialist-catalog.test.ts`: a file under `<cwd>/.claude/agents/` resolves with
  `grantScope: 'project'`; under the claude USER dir and under the personal folder →
  `'user'`; builtins → `'builtin'`. Swapping the literals at `catalog.ts:293/307` must fail
  a test.

## Minors (do all)
3. `describe-rule.ts` `filed` regex: accept `@[^@]+$` (so a hypothetical `@unverified`
   still reads in words) and add a test; soften the `task.ts:311-313` comment so it does
   not claim Settings labels that case.
4. `ToolCard.tsx` `grantFolderName`: treat `./` like `.`; resolve `..`/`../x` and any
   relative path against `sessionCwd` with a small posix-segment resolver (no Node `path`
   in the renderer) so the note never reads "in . only" / "in .. only". Test in
   `specialist-envelope.test.tsx`.
5. `ToolCard.tsx` `suppressAlwaysAllow` hire branch: also suppress when
   `!tool.input?.work_dir` (a hire with no work_dir has no subject; `rememberedRuleFor`
   returns null for it, and execute refuses it — the note must not promise a grant nothing
   can keep). Test.
6. Naming: do NOT rename `grantScope`. Add a one-line comment on the field in
   `registry.ts` distinguishing it from the width type `GrantScope`
   (`shared/permission-types.ts`).

## Rules
- TDD; WHY comments at every non-trivial edit; never a misleading user-facing string.
- Run: `npx tsc --noEmit`; the affected vitest files (permission-store, native-session-host,
  permissions-section, permission-types/sameRule, specialist-catalog,
  specialist-definition-files, describe-rule, specialist-envelope, task-tool,
  permission-engine); then `bash /home/destin/youcoded-dev/scripts/verify.sh worktrees/specialists-1c`
  from the workspace root (NOT --full). Known pre-existing intermittent timeouts in
  `mcp-startup-wiring` and `harness-eval-orchestrator` are NOT yours — if they appear,
  say so; do not touch them.
- Commit as ONE commit. Subject suggestion:
  `fix(permissions): an "every project" specialist grant now lives in one shared bucket, and the folder→scope stamping is pinned`.
- Do NOT touch ../../youcoded (main checkout); no live app; no dev servers.
- Report to `.superpowers/sdd/fix2-report.md` (tests added, commands + output tails, sha,
  surprises). Return only: status, sha, one-line test summary, concerns.
