---
status: active
created: 2026-08-10
related:
  - docs/active/specs/2026-08-05-chat-search-design.md
  - docs/active/specs/2026-08-10-chatsearch-session-references-design.md
  - docs/archive/plans/2026-08-05-chatsearch-phase1-plan.md
---

# Chat Search — state of play

Pick-up notes for a later session. What is shipped, what is specced, and the
one thing that has never been done.

## Shipped

**Phase 1 — index + read-only CLI.** On `youcoded` master:
`youcoded#282` (feature) and `youcoded#283` (transcript-resolution fix);
`wecoded-marketplace#65` (index regeneration) and `#66` (the plugin).

Index on this device: ~1,697 Claude + ~69 native conversations, ~13.5k indexed
user turns, at `~/.youcoded/chatsearch/`.

The `youcoded-chatsearch` plugin is installed, enabled, and registered in all
four Claude Code registries.

## The gap: nobody has actually used it

**Phase 1 has never been exercised by a human.** It has been verified by tests
and by reading the index off disk, but the questions that decide whether it is
worth building on are untested:

1. **Recall quality.** Search 3–4 things you genuinely remember. The failure
   that matters is *you know it happened and it is not in the results* — that
   is the shape of the bug `#283` fixed, and there is no test for it.
2. **Cross-device rows.** Search for work done on the Mac or Galaxy Book. Those
   are the records `#283` was about; before it, 1,532 of them were falsely
   tombstoned.
3. **Tombstone honesty.** A `†` row must still show a real title and date. The
   conversation happened; only its bytes are gone.
4. **Drill-down cost.** Does `show` alone usually answer the question? If every
   lookup needs `turns`/`tail`, the metadata tier is not earning its place.
5. **Does the model reach for it unprompted?** Ask something half-remembered
   *without* mentioning search. If it says it cannot recall past conversations,
   or opens a transcript directly, the skill description is not doing its job.
   No test can answer this one.
6. **Index freshness.** Phase 1 refreshes on app launch and at session end, not
   continuously. Confirm the turn count does *not* move mid-session — that is
   phase 2's job, and it is worth knowing what you actually have.

Run these before building more. The session-references design assumes the
results are worth surfacing; if recall is poor, that work builds a better frame
around the wrong picture.

Requires `bash scripts/run-dev.sh --label "Chat Search"` — never the installed
app.

## Specced, not built

**Session references** —
`docs/active/specs/2026-08-10-chatsearch-session-references-design.md`
(`status: draft`, reviewed and revised once).

Preview and Resume from a search hit. Six phases; 0, 1 and 2 are parallel:

| Phase | Scope |
|---|---|
| 0 | CLI machine-readable block + SKILL.md "run `show` when naming a conversation" — **separate repo, separate cadence** |
| 1 | Path-based transcript reader + IPC (both lanes, bounded, contained, subagent-refusing) |
| 2 | Extract the conversation renderer out of `ConversationPreview`, markdown on |
| 3 | `find` / `show` cards + the `session-card` turn segment |
| 4 | Drawer references + `activePaneItem` consolidation |
| 5 | Resume wiring, native via the model picker |

No implementation plan written yet.

**Unsettled inside that spec:** whether tool activity belongs in v1's preview.
It got heavier once `show` became the main way a conversation is revisited —
`HistoryMessage[]` has no representation for tool calls, so the preview shows
none, and a marker has to make the omission visible.

## Not started

**Phases 2 and 3** of the original design — the write outbox, then digests.
ROADMAP owns the detail. Phase 3 unblocks two things phase 1 ships deliberately
inert: the `○` open marker and `--state open`.

## Traps worth knowing before you touch this

- **A newly bundled plugin will not install for up to 24h.** The marketplace
  index is cached with a 24h TTL at
  `~/.claude/youcoded-marketplace-cache/index.json`. Until it expires, the
  bundled installer looks the plugin up in a stale snapshot and silently does
  nothing. Symptom: the plugin is in `BUNDLED_PLUGIN_IDS` and merged to the
  registry, but absent from `installed_plugins.json`. Fix is to delete that one
  file and relaunch. **The local marketplace clone under
  `~/.claude/plugins/marketplaces/youcoded/` is a red herring** — it is the
  install *destination*, not the source, and it is app-managed (the app rewrites
  its `marketplace.json`), so do not `git pull` it.
- **Subagent transcripts are excluded only by accident.** They live at
  `<slug>/<parent-id>/subagents/agent-<hash>.jsonl` and are missed purely
  because both enumerators do a flat `readdir` filtered on `.jsonl`. Nothing in
  the store, mirror, or reconciler mentions them. The session-references spec
  makes the exclusion explicit and adds the pinning test; until that lands, the
  protection is depth alone.
- **`~/.youcoded/` is shared** by the live app and every dev instance —
  `run-dev.sh` isolates only `userData` and ports. Index writes must stay
  atomic.
- Dev launches may need `node node_modules/electron/install.js` first; see the
  `allowScripts` ROADMAP entry.
