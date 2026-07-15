# Rules conventions

Every rule file: YAML frontmatter + terse body (≤600 words). Overflow migrates to the
lazy doc the rule points to, or becomes a pinning test.

    ---
    paths:                       # REQUIRED — omitting it makes the rule EAGER (never do this
      - "youcoded/desktop/src/main/sync-spaces/**"    #  except live-app-safety.md)
    last_verified: YYYY-MM-DD
    verify:                      # machine-checkable anchors — harvested by /audit (Phase 3)
      - path: youcoded/desktop/src/main/sync-spaces/engine.ts          # file exists
      - path: youcoded/desktop/src/main/sync-spaces/git-transport.ts
        contains: "GIT_DIR"                                            # regex present in file
      - test: youcoded/desktop/tests/sync-transport-contract.ts        # test file exists; full audit runs it
    ---

Body format per invariant: **invariant (1–2 sentences) · why (1 sentence or link) · guard
(the pinning test, or "none — candidate")**. End the body with a pointer to the lazy doc
for depth.
