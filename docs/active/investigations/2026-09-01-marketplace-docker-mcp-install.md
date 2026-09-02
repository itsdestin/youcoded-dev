---
date: 2026-09-01
status: active
type: investigation
topic: 314 Docker-packaged MCP listings are browsable but the installer cannot acquire them
---

# Docker MCP listings — the blocker is acquisition, not MCP support

**Correcting a claim made loosely in conversation:** YouCoded fully supports MCP servers —
client, manager, registry, per-tool permissions, `safeStorage` secrets and a synced
`mcp.json` (`youcoded/desktop/src/main/harness/mcp/`) — and installing a plugin that bundles
one wires it up automatically (`skill-provider.ts` calls `reconcileMcp()` after install).

The gap is narrower. `installPlugin` in `youcoded/desktop/src/main/plugin-installer.ts`
handles exactly three source types — `local`, `url`, `git-subdir` — all of which end in a git
clone. The 314 Docker MCP rows have no git repo: their payload is a container image
(`sourceRef: docker:mcp/brave-search@sha256:…`), so the switch falls through to its default
and the install fails; the detail page correctly shows "Open source" instead of "Get".
<!-- claim: {"path": "youcoded/desktop/src/main/plugin-installer.ts", "contains": "Unknown source type: \\$\\{sourceType\\}"} -->

The shape fits: a stored MCP server needs id + label + transport + secret refs; supported
transports are `stdio` (command + args) or `http`; `docker run -i mcp/<x>` is a valid stdio
command; and the catalog row already knows which key a server needs (the scanner derived
`BRAVE_API_KEY` for Brave Search).

The obstacles are practical, not architectural:
- **It needs Docker on the user's machine** — heavy for a non-technical audience, and the
  honest reason this was deferred.
- A first-run key prompt rather than a silent failure.
- The cards stay "Not checked" because we hold metadata only, never the image contents.

Depth and the Home Assistant analysis:
`docs/active/investigations/2026-08-31-marketplace-featuring-recommendations.md` §3.

History: added 2026-08-31 (old ROADMAP L124). Re-checked 2026-09-01: no commit to the
installer since; the three-type switch is unchanged.
