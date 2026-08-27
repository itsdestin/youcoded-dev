# Fix pass 2 — report (review-2 on D1/D2)

Branch `feat/specialists-1c-ui`, worktree `worktrees/specialists-1c`. Commit `a9e041d7`, on top of
`10127ff6`. Every item in `fix2-brief.md` is implemented; nothing was redesigned.

## Important 1 — the "every project" grant now really is one grant

**`src/shared/permission-types.ts`** — added and exported:
- `CROSS_PROJECT_SLUG = 'all projects'`. The space is the point: `nativeStoreSlug` collapses
  `:`/`\`/`/`/space to `-`, so no real cwd can ever slug to this key. The reservation is
  structural.
- `isCrossProjectRule(rule)` → `rule.tool === 'Task' && /^(read-only|read-write):file:/.test(rule.pattern ?? '')`.
  Reads the SUBJECT, because for a hire the subject *is* the grant width (`tools/task.ts`).
  A project-scoped subject (`${charter}:${workDir}:file:…`) does not match — pinned.

**`permission-store.ts`**
- `rulesFor(cwd)` returns `[...bucket.rules, ...project.rules].map(normalizeRule)`. Bucket
  first; both sides are allow rules for different subjects so a last-match tie is harmless
  (same reasoning as the existing disk/memory union comment).
- `remember(cwd, rule)` routes by `isCrossProjectRule(rule)`. The bucket entry never records a
  `cwd` (spread the existing entry, set only `rules`) — writing whichever folder happened to be
  open would print a path under a card that applies everywhere.
- `list()` / `remove()` / `removeProject()` untouched: they already key by slug.
- No file-format change. Still `v: 2`; a v1 file with no bucket reads exactly as before (pinned).

**`native-session-host.ts`**
- `revokeRule(slug, rule)`: when `slug === CROSS_PROJECT_SLUG`, the cwd-slug guard is skipped, so
  the rule is filtered out of EVERY live session's `rememberedFor`. Without this the branch
  cleared it from nobody (no cwd slugs to a key with a space in it).
- `revokeProject(slug)`: for the bucket, each live session keeps only `!isCrossProjectRule(r)` —
  it does NOT delete the session's whole memory, which would silently take that session's own
  project grants (a different card in Settings) with it.
- `rememberRule` / `buildDecide` unchanged: the store routes, and the union now includes the bucket.
- Both doc comments say why the bucket is special.

**`PermissionsSection.tsx`** — the bucket arrives from `permissions:list` as a `StoredProject`
with the reserved slug and no `cwd`. It renders as the FIRST card, titled **"All projects"**
(never the raw key), with the one-line explainer *"Your own specialists you chose to always
allow. These apply in every folder."* under the title instead of the never-recorded sentence.
Rows, per-rule revoke and "Revoke all" are the existing card anatomy verbatim — no new styles,
both controls already route through `revokeRule`/`revokeProject` with `project.slug`.

**`docs/native-runtime.md`** — one added sentence in the D1/D2 paragraph naming
`isCrossProjectRule`, `CROSS_PROJECT_SLUG`, the `rulesFor` union, the revoke behaviour and the
"All projects" heading; plus the no-`work_dir` suppression and an updated Guards list.

## Important 2 — folder → grantScope is now pinned

- `tests/specialist-definition-files.test.ts`: all **23** two-argument
  `loadClaudeCodeDefinition(path, raw)` calls now pass `'user'` (the fixture paths are the
  user-folder shape). Verified none remain:
  `rg -n "loadClaudeCodeDefinition\(" … | rg -v "'user'"` → only the import and the `describe`.
  Added: personal loader stamps `grantScope: 'user'`; the CC loader stamps whatever the catalog
  passed (`'user'` vs `'project'`); the fingerprint is 12 hex, identical for identical bytes,
  different for different bytes, and independent of the path.
- `tests/specialist-catalog.test.ts`: new "the FOLDER a file came from decides its grantScope" —
  personal + `claudeUserDir` → `'user'`, `<cwd>/.claude/agents` → `'project'`, built-in →
  `'builtin'`, and only the file-defined ones carry a fingerprint.
  **Swap-check performed:** swapping the two literals at `catalog.ts:293/307` fails this test
  (verified, then restored — `git diff --stat catalog.ts` clean).

## Minors

3. `describe-rule.ts` `filed` regex hash part widened `[0-9a-f]+` → `[^@]+`, so a
   `@unverified` subject reads as words instead of falling through to a "directory named
   `file:docs-writer@unverified`". Test added (both widths) and the leak-check loop extended.
   `task.ts:311-313` comment softened — it no longer claims Settings labels the odd case.
4. `ToolCard.tsx` `grantFolderName` now resolves like `tools/task.ts` does: a hand-rolled
   posix-segment resolver (no Node `path` in the renderer) that drops `''`/`.`, pops on `..`,
   and starts from `sessionCwd` for a relative path. `./` → the session folder, `..` → its
   parent, `../other` → the sibling. Falls back to "this project" when nothing resolves.
5. `ToolCard.tsx` `suppressAlwaysAllow` hire branch also suppresses when `!tool.input?.work_dir`
   — such a hire has no subject at all, so the note promised a grant nothing could keep.
   Three existing envelope fixtures gained `work_dir: '.'` (they were testing the note, not the
   absent-work_dir case) and a new test pins the suppression.
6. `registry.ts` — one comment on `SpecialistDefinition.grantScope` distinguishing it from the
   Bash-grant WIDTH type `GrantScope`. NOTE: that type lives in `shared/bash-grant-shapes.ts`,
   not `shared/permission-types.ts` as the brief said; the comment names the real file. No rename.

## Tests added (all TDD-verified against the un-fixed code)

- `permission-store.test.ts` +7: bucket routing with no cwd, cross-project read-back, the union
  (and that they stay two slices on disk), project-scoped stays put, `remove`/`removeProject` on
  the reserved slug, v1 file. Plus a new `isCrossProjectRule` describe (+3) covering the three
  subject shapes, a Windows work dir, and a non-Task rule.
- `native-session-host.test.ts` +3 (real `buildDecide`, real store / memory-only store):
  approved at cwd A → allow at cwd B, and an EDITED fingerprint still asks; the bucket revoke
  clears a live session whose cwd is a real folder; clearing the bucket leaves that session's own
  project grant.
- `permissions-section.test.tsx` +3: bucket reads first even though it arrives second, titled
  "All projects", with the explainer, without the never-recorded copy and without the raw key;
  per-rule remove and "Revoke all" both route with the reserved slug.
- `describe-rule.test.ts` +1; `specialist-catalog.test.ts` +1;
  `specialist-definition-files.test.ts` +3; `specialist-envelope.test.tsx` +4.

**Failure proof (each new behaviour was shown to fail without its fix, then restored):**
- store routing neutered → 4 store tests fail + the host's cross-project decide test fails.
- `revokeRule` cwd guard restored / `revokeProject` bucket branch deleted → the two revoke tests fail.
- `revokeProject` bucket branch replaced with the naive `rememberedFor.delete(sessionId)` → the
  "leaves project grants alone" test fails.
- `catalog.ts` literals swapped → the new catalog test fails.

## Commands

```
$ npx tsc --noEmit
(no output)

$ npx vitest run tests/permission-store.test.ts tests/native-session-host.test.ts \
    tests/permissions-section.test.tsx tests/specialist-catalog.test.ts \
    tests/specialist-definition-files.test.ts tests/describe-rule.test.ts \
    tests/specialist-envelope.test.tsx tests/task-tool.test.ts tests/permission-engine.test.ts
 Test Files  9 passed (9)
      Tests  402 passed (402)

$ bash /home/destin/youcoded-dev/scripts/verify.sh worktrees/specialists-1c
PASS  types (tsc --noEmit)
FAIL  tests (full suite)   <- see below
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)
 Test Files  1 failed | 475 passed | 1 skipped (477)
      Tests  1 failed | 6307 passed | 41 skipped (6349)
```

The single failure is `tests/harness-eval-orchestrator.test.ts` — one of the two known
pre-existing intermittent files the brief named. **Verified pre-existing, not mine:** stashed the
whole `desktop/` diff and ran that file on the clean tree — it still failed (1 failure). With the
diff applied it fails with 1 or 2 depending on the run, i.e. flaky, and it touches nothing this
change went near. Not touched.

## Surprises / notes

- `verify.sh` ran the FULL suite because the branch's diff-vs-master includes
  `desktop/vite.config.ts` from an earlier commit — nothing this pass changed.
- Minor 6's brief text mis-located `GrantScope`; the real file is
  `src/shared/bash-grant-shapes.ts` (`'exact' | 'wide'`). Comment written against the real one.
- The existing `revokeRule`/`revokeProject` slug-matching tests (spaced-vs-dashed cwd, unrelated
  project) still pass unchanged — the bucket branch is additive.
