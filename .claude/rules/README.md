# Rules conventions

Every rule file: YAML frontmatter + terse body (≤600 words). Overflow migrates to the
lazy doc the rule points to, or becomes a pinning test.

    ---
    paths:                       # REQUIRED — omitting it makes the rule EAGER (never do this
      - "**/desktop/src/main/sync-spaces/**"   #  except live-app-safety.md). Start the glob at
                                 #  "**/" not "youcoded/": rules are matched from the PROJECT
                                 #  root, so a "youcoded/..." glob never fires on the same file
                                 #  inside worktrees/<name>/ — which is where CLAUDE.md sends
                                 #  all non-trivial work. Guarded by audit-anchors.mjs; if a
                                 #  glob genuinely must keep its repo prefix, a trailing
                                 #  "# repo-pinned" comment exempts it (no rule needs this today).
    last_verified: YYYY-MM-DD
    verify:                      # machine-checkable anchors — harvested by /audit (Phase 3)
      - path: youcoded/desktop/src/main/sync-spaces/engine.ts          # file exists
      - path: youcoded/desktop/src/main/sync-spaces/git-transport.ts
        contains: "GIT_DIR"                                            # regex present in file
      - test: youcoded/desktop/tests/sync-transport-contract.ts        # test file exists; full audit runs it
    ---

**`verify:` paths keep their repo prefix** — the auditor resolves them from the workspace
root, where `youcoded/...` is correct. Only `paths:` globs get the `**/`.

**Never put a backslash in a double-quoted frontmatter value.** A `contains:` regex like
`"specialist\?: string"` is not legal YAML (only a fixed escape set is allowed inside
`"..."`), so the WHOLE frontmatter fails to parse, the rule loses its `paths:`, and Claude
Code loads it EAGERLY on every session. Two rules did this for months, unnoticed, costing
~1,400 words a session — measured 2026-08-31. Write the regex with character classes
instead: `"specialist[?]: string"`, `"sameRule[(]r, rule[)]"`. Guarded by
`yamlUnsafeFrontmatter` in `scripts/audit-anchors.mjs`.

Body format per invariant: **invariant (1–2 sentences) · why (1 sentence or link) · guard
(the pinning test, or "none — candidate")**. End the body with a pointer to the lazy doc
for depth.

## Doc anchors (depth docs)

Depth docs may pin an individual claim with a trailing HTML comment on the line after it:

    The transport sets GIT_DIR explicitly.
    <!-- verify: {"path": "youcoded/desktop/src/main/sync-spaces/git-transport.ts", "contains": "GIT_DIR"} -->

JSON body: `path` (+ optional `contains` regex) or `test`. Harvested and checked by
`scripts/audit-anchors.mjs` (the /audit mechanical pass) from `docs/`, `youcoded/docs/`,
and `wecoded-marketplace/docs/` — `docs/archive/` is never scanned. Use sparingly: anchor
the claims whose silent drift would mislead a session, not every sentence.
