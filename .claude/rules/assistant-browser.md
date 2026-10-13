---
paths:
  - "**/desktop/src/main/assistant-browser/**"
  - "**/desktop/src/main/harness/tools/browser.ts"
  - "**/desktop/src/main/ipc/browser.ts"
  - "**/desktop/src/renderer/components/browser/**"
  - "**/desktop/src/renderer/state/browser-store.ts"
  - "**/desktop/src/shared/browser-types.ts"
last_verified: 2026-10-13
verify:
  - path: youcoded/desktop/src/main/assistant-browser/browser-tool-runners.ts
    contains: "export async function runBrowserTool"
  - path: youcoded/desktop/src/main/assistant-browser/browser-host.ts
    contains: "export function createBrowserHost"
  - path: youcoded/desktop/src/main/assistant-browser/claude-code-browser-mcp.ts
    contains: "BROWSER_RELAY_JS"
  - test: youcoded/desktop/tests/assistant-browser.test.ts
  - test: youcoded/desktop/tests/assistant-browser-live.test.ts
  - test: youcoded/desktop/tests/claude-code-browser-mcp.test.ts
---
# The Browser (the assistant's own web browser)

Spec: `docs/active/specs/2026-10-13-assistant-browser-design.md` (archive on merge).

## One owner, one set of tools, both session kinds
**Invariant:** the tools are defined ONCE (`browser-tool-specs.ts`: name, zod schema,
description) and run ONCE (`browser-tool-runners.ts`, inside the worker). Native adapters
(`harness/tools/browser.ts`) and the Claude Code relay (`claude-code-browser-mcp.ts`) only
transport. Never add behaviour to an adapter.
**Why:** Destin's requirement is identical behaviour in Claude Code and native sessions; two
implementations drift. **Guard:** `assistant-browser.test.ts` ("one set of tools for both
session kinds"), `claude-code-browser-mcp.test.ts`.

## The engine never runs on the main thread
**Invariant:** playwright-core lives in the utilityProcess (`browser-host.ts`, forked by
`browser-electron.ts`); main holds only `BrowserClient`. Pictures stream only while a panel
watches, ack-paced; an unchanged picture is acknowledged at once (it fires no load event).
**Why:** CDP traffic and page outlines are real CPU (performance rule 1); a still page stalled
the stream once. **Guard:** `assistant-browser-host.test.ts`, `BrowserPanel.test.tsx`.

## The Browser asks, never the session's permission system
**Invariant:** every Browser tool is in every mode's always-allowed set
(`permission-types.ts`) and pre-approved for Claude Code (`--allowedTools`); the runners ask
through the Browser's own card (site once per chat, final steps every time, home addresses
per host:port, metadata never). Every ask and every call returns within `CALL_DEADLINE_MS`.
**Why:** one policy for both kinds; Claude Code auto-backgrounds a tool call after 120 s
(`youcoded/docs/cc-dependencies.md`). **Guard:** `assistant-browser-live.test.ts`,
`assistant-browser-native.test.ts`, `assistant-browser.test.ts`.

## Page text is untrusted and cannot close its frame
**Invariant:** results go through `wrapUntrusted()` (`harness/tools/untrusted.ts`), which
neutralises look-alike tags; the same function frames WebFetch. **Guard:**
`assistant-browser.test.ts` ("page text is framed as untrusted"), the live `/inject` case.

## Desktop only
**Invariant:** every `browser:*` channel is `desktopOnly`; screens gate on
`capabilities.assistantBrowser` (false on phones and Android). **Guard:** `ipc-channels.test.ts`
("browser:* channel parity").
