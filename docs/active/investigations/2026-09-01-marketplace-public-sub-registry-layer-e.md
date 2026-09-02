---
date: 2026-09-01
status: active
type: investigation
topic: WeCoded as a public sub-registry others can read (Layer E) — pointers for when it is picked up
---

# WeCoded as a public sub-registry (Layer E)

Intended follow-up to the marketplace overhaul — not optional, sequenced after the trust
layer exists. Parked; this file keeps the pointers the roadmap entry cannot carry.

**Scope:**
- Implement the official MCP Registry sub-registry API (`/v0.1/servers`, our verdicts under
  `_meta["com.wecoded/…"]`). Its ToS §10–11 licenses the data CC0 and explicitly invites this.
- Serve `/.well-known/skills/index.json` for Hermes-style taps.
- Write installed skills to each agent's path (Claude Code, native harness, OpenClaw/Codex —
  the Codex half is specified in `docs/active/specs/2026-08-31-codex-session-provider-design.md`
  §4.6, with measured per-component portability counts).
- **Also owns *reading* the official MCP Registry** (25,291 servers), cut from the overhaul's
  first build on 2026-08-28. The Deferred section of
  `docs/archive/plans/2026-08-30-marketplace-overhaul-remaining-work.md` has the measured
  reasons and what it needs when it returns: a persistent star store, a real delta watermark,
  an install path for MCP servers, and paging on `/catalog`. Same doc, §4 Layer E + §6.

**Prerequisites:** catalog in D1 (done), scan verdicts (done), abuse handling — it is a public
commitment: uptime + reports. The Worker's route table today has no `/v0.1/` and no
`.well-known` handler.
<!-- claim: {"path": "wecoded-marketplace/worker/src/index.ts", "contains": "allowMethods: \\[\"GET\", \"POST\", \"PATCH\", \"PUT\", \"DELETE\"\\]"} -->

History: added 2026-08-27 (old ROADMAP L956).
