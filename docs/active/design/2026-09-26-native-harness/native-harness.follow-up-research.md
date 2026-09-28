---
status: active
---

# Native harness — answers to the four follow-ups

Research for the submitted questions deck, 26 September 2026. No implementation or live-app testing. The original answers remain authoritative in `native-harness.questions.answers.json`.

## 1. Why does a queued message sometimes wait so long?

**YouCoded native currently waits for the whole turn, not the next action.** A turn may contain many cycles of model response → tool actions → another model response. A message queued near the beginning can wait through all of them. Waiting for permission also keeps the turn open. Native chat's queued-message strip has Edit and Cancel, not Send now. Stop interrupts the current turn but leaves queued messages to run afterward.

This differs from the stranded-message bug already approved in Q-2: that bug can leave a message waiting even after the current work finishes. Fixing it does not by itself introduce mid-turn steering.

| Harness | Ordinary message while busy | Faster/manual behavior |
|---|---|---|
| YouCoded native now | FIFO follow-up after the entire turn settles. | Stop ends the current turn; queued messages survive. No main-chat Send now. Existing specialist steering reaches the child's next model-step boundary. |
| Claude Code, current docs | Messages queued during tools are delivered after those tool calls finish, within the same turn. Commands/shell commands wait until turn end. | Ctrl+Enter or Ctrl+X Ctrl+S sends now. In v2.1.281+, eligible shell/subagent work moves to background and the same turn continues; otherwise the turn is interrupted and the message goes next. |
| Pi | Enter steers after the current response and its tool calls finish. | Alt+Enter waits until the task finishes. Escape aborts and returns pending messages to the editor. |
| OpenClaw | Documents steer as the default; checks before sequential tools and the next model decision. A tool already running is not interrupted by ordinary steering. | Separate followup and interrupt modes. |

**“Mid-turn” is not “rewrite the words already streaming.”** The model needs a new request to read new input. A safe boundary can occur before its next decision, rather than waiting for the whole task. A twenty-minute foreground command can still delay that boundary unless it is moved to background or explicitly stopped.

Suggested behavior for discussion: ordinary Enter steers at the next safe boundary, with an explicit way to request an after-task follow-up. An optional Send now should distinguish backgrounding eligible work from canceling it. Neither should run two simultaneous turns against one conversation, grant permission by implication, or replay completed actions. Specialist targeting and permission-wait handling need explicit treatment in the implementation contract; this research does not claim the existing child-steer method already supplies a complete parent-chat implementation.

Sources:
- YouCoded: `youcoded/desktop/src/main/harness/native-session-host.ts:3890–3982,4030–4069,4532–4575`; `src/main/harness/harness-session.ts:2715–2759,2961–3005,4141–4162`; `src/renderer/components/QueuedMessagesStrip.tsx:53–100` (the latter paths relative to `youcoded/desktop/`).
- [Claude Code queue and Send now](https://code.claude.com/docs/en/interactive-mode#queue-messages-while-claude-works) — public behavior, not inferred closed-source internals; independently fetched in this follow-up.
- [Pi usage](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/usage.md).
- [OpenClaw queue](https://docs.openclaw.ai/concepts/queue) and [steering](https://docs.openclaw.ai/concepts/queue-steering).

## 2. How do others inherit instruction files?

| Harness | What startup reads | Scope and qualifications |
|---|---|---|
| Hermes | Documents a merged Git-root-to-current-folder AGENTS chain; global identity is a separate SOUL.md. | Outside Git, only cwd. Its overall context-file type selection favors Hermes files and overrides before AGENTS/CLAUDE; it does not promise to merge every filename together. Nested hints load progressively after tool calls. |
| Pi | One personal agent-directory instruction file, then one instruction file per ancestor directory down to cwd. | Walks to filesystem root, not Git root. Per-folder priority: AGENTS.override.md, AGENTS.md/AGENTS.MD, CLAUDE.md/CLAUDE.MD. Includes a duplicate-copy exception for a linked worktree nested inside its main checkout. |
| Claude Code | Personal/managed instructions plus ancestor CLAUDE.md and CLAUDE.local.md, root-to-cwd; nested guidance loads on Read. | Does not stop at Git root. Current default AGENTS support uses AGENTS only when no qualifying ancestor/cwd CLAUDE file exists. Optional both-mode loads CLAUDE then AGENTS in each directory. Context order is not enforced conflict resolution. |
| OpenClaw embedded runtime | Explicit agent-workspace bootstrap, plus AGENTS.md from a separate execution folder. | Not documented as a general ancestor CLAUDE/AGENTS chain. Native Codex delegates part of discovery to Codex rather than injecting it twice. |

**Our original Q-6 was a proposed YouCoded policy, not a universal standard.** It selected one file per folder, preserving AGENTS.md as the preferred file with CLAUDE.md as fallback; it did not propose loading both. It would merge across directories inside the Git project, rather than selecting just the nearest file.

For this workspace the boundary matters: an app component worktree has its own Git root, while useful workspace instructions can live above it. Git-root-only loading avoids unrelated parent guidance but will not automatically solve that case. Pi/Claude Code's full ancestor walk reaches such guidance, at the cost of loading more potentially unrelated files.

Folder rules are a **separate decision**. Claude Code recursively discovers `.claude/rules`, loads unscoped rules at startup and path-scoped ones on matching reads; personal rules are separate. Ordinary Claude Code subagents inherit its main instruction hierarchy, with documented Explore/Plan/custom opt-out exceptions. Pi's context loader and Hermes's progressive hints do not establish equivalent Claude Code `paths:` rule compatibility. YouCoded currently starts its rule index at the narrowed session/child folder, losing outer applicable project rules.

The follow-up deck therefore separates instruction-file ancestry from ancestor folder-rule inheritance. Global personal loading, same-folder filename policy, imports and unscoped/eager-rule policy are not silently included in either proposal.

Sources:
- [Hermes context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files/).
- [Pi loader, pinned ddba59618794b870786210e14065a639656ea10e](https://github.com/earendil-works/pi/blob/ddba59618794b870786210e14065a639656ea10e/packages/coding-agent/src/core/resource-loader.ts), functions `loadContextFileFromDir`, `loadProjectContextFiles`, `findShadowedContextFile`. Independently inspected.
- [Pi configuration](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/configuration.md) and [security](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/security.md).
- [Claude Code memory and rules](https://code.claude.com/docs/en/memory) and [subagent startup](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup). AGENTS support is documented for v2.1.277 onward, with availability caveats; independently fetched.
- [OpenClaw system prompt](https://docs.openclaw.ai/concepts/system-prompt) and [workspace](https://docs.openclaw.ai/concepts/agent-workspace).

## 3. How do others stop a command and its subprocesses?

**A shell is not the whole command.** A shell can start a compiler/server/test runner and exit before that program does. Our reproduced defect is that delayed force-stop checks whether the original shell is alive rather than whether its owned process group is alive.

| Harness | Local process-stop implementation | What this proves |
|---|---|---|
| Pi | Unix: immediate SIGKILL to the group, with direct-PID fallback. Windows: taskkill /F /T. | There is no graceful-delay leader-exit race in that helper because it force-stops immediately; this does not prove cleanup of every detached descendant. |
| OpenClaw agent-core | POSIX group stop: SIGTERM, then normally 3 seconds before SIGKILL. Escalation checks group existence and keeps targeting that group after the leader exits. | Direct source precedent for correcting our exact group-versus-leader condition. It verifies ownership and avoids falling back to a possibly reused leader PID. Other backends/platform paths differ. |
| Hermes local terminal | Starts commands in new sessions, records group identity, and uses POSIX/Windows cleanup helpers. Foreground yield backgrounds work rather than killing it. | Group-aware design established. The researcher's retrieval of its graceful helper was incomplete, so the exact leader-exit escalation predicate was not verified. |

Recommendation: retain YouCoded's existing graceful-first approach and its current two-second grace, but check/stop the remaining **owned group** even when the shell exits first. Do not broadly search by process name. This is a correction to stopping work already targeted for termination, not a proposal to kill deliberately backgrounded work whenever you send a message or press ordinary Stop. Processes that deliberately detach into another group are outside this guarantee. Windows needs its own verification; OpenClaw's Windows path is not proof that our Linux condition carries over.

Sources:
- [OpenClaw exact group cleanup helper](https://raw.githubusercontent.com/openclaw/openclaw/main/packages/agent-core/src/harness/env/kill-tree.ts), independently fetched: `force` checks `isProcessAlive(-pid)` when using a group; `signalProcessTreeUnix` keeps the group target after leader exit.
- [OpenClaw background lifecycle](https://docs.openclaw.ai/gateway/background-process).
- [Pi tree helper](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/utils/shell.ts), independently fetched, and [Bash tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/bash.ts).
- [Hermes local environment](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/tools/environments/local.py) and [foreground lifecycle](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/tools/environments/base.py).

## 4. What did the web-cancellation question mean?

Before a webpage can download, the computer looks up the website's network address—like looking up its phone number. If that address lookup stalls, the current tool does not stop waiting just because the conversation was canceled. The audit reproduced that gap with a controlled lookup, not a real broken website.

The proposed fix is limited: **Stop ends the wait at this stage too, and the existing request timeout includes it.** A late answer is ignored; underlying work is canceled where the operating system supports it. No new site restrictions, permissions or automatic retries are part of this decision.

Source: `youcoded/desktop/src/main/harness/tools/net-guard.ts:72–79,130–159`; reproduced in `youcoded/desktop/tests/native-boundaries-audit-probe.test.ts`.

## Evidence boundaries

These peer comparisons are docs/source inspection, not live end-to-end tests. Pi's instruction-loader source is pinned; most other links track current upstream main/docs. No claim is made that all peers solve every lifecycle race, that instruction ordering enforces compliance, or that canceling a wait rolls back completed work.
