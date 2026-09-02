---
date: 2026-09-01
status: active
type: investigation
topic: chat-data — the Resume Browser search box cannot search what was said; the full-text index exists but only the assistant can reach it
---

# Let a person search what was actually said, not just titles and tags

**History:** added 2026-08-31 (old ROADMAP.md L1285). Re-checked 2026-09-01: `youcoded/desktop/src/main/chatsearch-index/` (index-core, index-service, index-store, refs-service, outbox-*) is on master; the Resume Browser filter is unchanged.

## The gap

The expensive half is built and only the assistant can reach it. `youcoded/desktop/src/main/chatsearch-index/` holds a real full-text index over every turn of every Claude Code and native conversation, exposed as a model-invoked tool (the `youcoded-chatsearch` skill). The Resume Browser's own search box matches `name`, `projectPath`, `note` and applied-tag labels only — `applyFilters` in `youcoded/desktop/src/renderer/components/resume-browser-filters.ts`.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/resume-browser-filters.ts", "contains": "Search matches name, projectPath,"} -->

So a user who remembers a phrase but not a title has to *ask the assistant to search for them*.

## Competitive picture (verified 2026-08-31)

5 of 8 rivals let a person search transcript content directly (claude.ai, Codex on mobile, Pi, Hermes FTS5, OpenClaw). opencode's search is a SQL `LIKE` on the title column and Claude Code's CLI picker filters list rows — two of the strongest rivals are weak here, so closing it puts us ahead rather than merely level.

## Shape

Wire the existing index behind the box already in `ResumeBrowser`: title/tag matches first, transcript hits below with the matched line. Five-surface parity (the index lives in desktop main; remote and Android need a channel, Android at least an honest stub). Reuse the Preview/Resume-from-a-hit path that shipped in youcoded#343 (`3b759931`) rather than building a second one.
