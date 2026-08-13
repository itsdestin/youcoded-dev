---
status: shipped
created: 2026-08-11
type: spec
program: docs/active/plans/2026-08-11-native-sessions-remaining-work.md
milestone: M5 item 2a
---

# Permissions management UI (native remembered rules)

## Problem

A native session's "Always allow" writes a rule to `~/.youcoded/permissions.json` and
there is no way to take it back. `PermissionStore`
(`youcoded/desktop/src/main/harness/permission-store.ts`) has exactly two methods —
`rulesFor(cwd)` at `:32` and `remember(cwd, rule)` at `:41`. No list, no remove, no IPC,
no renderer reader. The file's own header documents unbounded growth "until the Phase 3
permission-management UI lets the user prune them."

The safety argument is not hypothetical. Remembered rules are the **last** layer in
`decidePermission` and outrank the destructive deny-list by design, so a grant made by
misreading a card is the single most consequential thing a user can do to their own
permission posture — and the 2026-08-10 dogfood found a consent bug on this exact
surface, where a card named one tool while its buttons approved another.

## Decisions taken

| Decision | Ruling | Rationale |
|---|---|---|
| Scope | Native rules only, but **CC-aware** | The app owns only the native store; Claude Code keeps separate allow/deny rules in `~/.claude/settings.json` that no code here reads (verified: zero hits for `permissions.allow`/`permissions.deny` across `src` and `app/src`). A screen labelled "Permissions" implies both, so it says plainly that CC sessions keep theirs elsewhere. |
| Revocation reach | **Immediate everywhere** — disk *and* every live session | The host caches grants in memory (below). A revoke that a running session ignores is not a revoke. |
| Screen purpose | Grants list **plus a posture explainer** | Remembered rules are one layer; mode and preset dominate "what can this do without asking me?". The explainer is static copy — no live session state. |
| External-path grants | **Stop recording them** | They provably never fire (below). Suppress the button, don't emit the rule. Grants nothing new. |
| Build order | **UI first, in the workbench**, backend second | Destin, 2026-08-11. The workbench exists for this; `MOCK_ONLY` is the handoff between the two phases. |

## Three findings that shape the design

**1. The stored data cannot reconstruct a project path.** The file is
`{ v: 1, projects: Record<slug, { rules }> }` and the slug comes from
`cwdToProjectSlug`, which collapses `:`, `\`, `/` **and spaces** all to `-`
(`transcript-watcher.ts:24`). `/home/d/my project` and `/home/d/my-project` produce the
same key, and nothing else is stored. A UI "grouped by project" therefore has no path to
show for anything already on disk.

*Consequence:* `remember()` starts recording the `cwd` on the project entry, and the
removal API keys by **slug, not cwd**. The program doc sketches `remove(cwd, rule)`;
that cannot work for existing entries, because there is no cwd to pass. The slug keying
is unchanged, so **no existing grant is orphaned** — which is also why `ctx.cwd` must
never be canonicalized (`.claude/rules/native-runtime.md`).

**2. Deleting from disk does not revoke for a live session.**
`NativeSessionHost.rememberedFor` (`native-session-host.ts:141`) is a per-session
in-memory copy, unioned into `decide()` on every call (`:278`), and it exists precisely
so a failed disk write cannot un-stick a grant. Revocation needs a host-side path, not
just a store method.

**3. "Always allow" on a path outside the project silently does nothing.** In
`harness-session.ts:1603`, an external path forces `{ action: 'ask' }` and **skips
`decide()` entirely**, so the rule the user's Always-allow writes can never be consulted
on any later call. The user is told they won't be asked again; they are asked every
time, and the store accumulates rules that cannot fire. Independent of the revocation
gap, but it lands in the same list.

Rules also carry no timestamp and no origin, so "when did I grant this?" is
unanswerable for anything already stored. New grants record `grantedAt`; existing ones
show no date. It heals forward rather than lying about the past.

---

## Where the design actually landed (added 2026-08-12, after implementation)

**Read this before the Phase 1 "Layout" section below** — the screen that shipped is not
the one that section describes. The layout was settled through **three rounds in the
workbench compare view** (surface `permissions-mode-control`, `dev/workbench/compare/`),
not written up front; the spec's layout is the starting point those rounds moved away
from. Everything else in this document — the store/host/IPC contracts, the five surfaces,
the conventions list, the testing plan — landed as written.

What the shipped `components/PermissionsSection.tsx` is, in body order:

1. **The three permission modes as REFERENCE CONTENT, not a control.** All three
   definitions print at once (a first-time reader is comparing them, which cannot be done
   one at a time). Three selector shapes were tried across the rounds — radio list,
   segmented control, "state first" plus a Change button — and every one read as a live
   setting. It is not: mode is per-conversation state owned by `NativeSessionHost` and set
   from the status-bar chip, and there is no app-wide default for this screen to write. A
   control that sets nothing is a lie in the shape of a control. `permissions-section.test.tsx`
   pins that this block contains no interactive element at all — that assertion is the
   invariant, not this paragraph.
2. **The always-asks list**, hanging off Full auto and nowhere else. Round 3 compared
   three containments (own card / no container / one shared card) and the shared card won:
   Full auto's definition ends by pointing at the list, so the list should read as part of
   the same statement rather than as a section one heading away. Both headings survive as
   band headers inside the one `bg-inset/50` card.
3. **The approvals themselves, as per-folder collapsible cards** — a folder header row
   carrying its count, always collapsed on arrival (no "open it if it's small" heuristic —
   that makes the screen look different every time), grouped by kind inside, with a
   per-folder bulk revoke at the bottom of the open card.

Two things the rounds deleted outright: the approvals summary line, and the Refresh
button (the screen remounts on open, so it re-reads anyway). The budget that bought back
was spent on longer mode definitions.

The "Open item for Phase 1 review" below was resolved as recommended: the section is
**not** gated on `window.claude.native.supported`.

---

## Phase 1 — UI in the workbench (do this first)

Built in `bash scripts/run-workbench.sh` (port 5233) against the fake `window.claude`,
**before any backend exists**. The three channels go in
`src/renderer/dev/workbench/mock-only.ts`, whose `MOCK_ONLY` list is empty today — this
feature is its first real user, and that list then *is* the Phase 2 to-do.

Destin reviews it in the workbench and signs off before Phase 2 starts. Per the
workspace rule, the interactive look-and-feel pass is his, not a scripted rig.

### Component

`src/renderer/components/PermissionsSection.tsx`, imported into `SettingsPanel.tsx`,
following `ProvidersSection.tsx` (493 lines) and `AccountSection.tsx`. It does **not**
go inline into `SettingsPanel.tsx`, which is already 2,647 lines.

### Layout

Grouped by project. Recorded path renders as basename-heading plus full path beneath;
a legacy entry with no recorded cwd renders the bare slug and says the path was not
recorded. Worktrees separate themselves for free — different cwd, different slug.

Each rule renders in plain language rather than as stored JSON:

| Stored | Rendered |
|---|---|
| `{ tool: 'Bash', pattern: 'git push origin main' }` | Run `git push origin main` |
| `{ tool: 'Edit', pattern: 'src/a.ts' }` | Edit `src/a.ts` |
| `{ tool: 'WebFetch', pattern: 'https://…' }` | Fetch `https://…` |
| `{ tool: 'mcp__github__create_issue' }` | Use the `create_issue` tool from the `github` connection |
| `{ tool: 'Write' }` *(no pattern)* | **Any** file this session writes — flagged as the broader grant it is |

A rule with no pattern is a tool-wide grant and must read as visibly broader than a
specific one. `action: 'deny'` is renderable defensively (the type permits it) but
nothing creates one today and the UI offers no way to.

Per-rule remove, plus a per-project clear.

### Conventions this UI must obey

These are inherited, not chosen. Each has a guard or a shipped regression behind it.

- **Every control goes through a `components/ui` primitive.** Hand-rolling
  `bg-accent text-on-accent` fails `primitive-adoption.test.ts`.
- **Removal is an inline consequence-gated confirm, not a modal** — the
  `ProvidersSection.tsx:307-360` pattern: a `danger-outline` "Remove" swaps in place for
  a plain-language consequence plus a `secondary` Cancel / `danger` Remove pair. The
  consequence line here is that the next time this comes up, you get asked.
- **No `.layer-surface` on the repeated rule rows.** Under a wallpaper the theme engine
  gives every such element its own `backdrop-filter`; inside an `overflow-hidden`
  transform-animating parent, Windows Electron drops paint per card. Shipped and
  reverted twice (`516411a5`, `1f68a7f0`); pinned by `drawer-card-glass.test.ts`. Rows
  sit flat on the panel.
- **The remove control is never hover-revealed.** `opacity-0 group-hover:` has no touch
  path, and this screen is reachable from a phone over remote access.
- **No status glyphs (`●◐○`)** — plain-language state words, per the standing rule
  visible in `ProvidersSection.stateWord`.
- **Narrow viewport is 640px via `useNarrowViewport()`**, and the narrow accommodation
  must never be "hide the control" (`.claude/rules/narrow-viewport.md`).

### The explainer

Not inline prose. It uses the established mechanism: a `SettingsExplainer`
`{ intro, sections }` payload rendered inside the same `<Dialog>` frame, toggled by a
`showInfo` boolean, with `InfoIconButton` in the header and `onBack` passed to the
Dialog — the same shape Remote Access, Backup & Sync, Appearance and Context use.

Content, in layman's terms per the component's own header: what Ask / Auto-edit / Full
Auto each mean, what the Assistant and Coder presets change, and the note that Claude
Code sessions keep their approvals separately.

### Fixtures

Add permissions fixtures to the existing workbench scenarios so the states are
reviewable without a backend: **empty** (no rules — the common first-run state),
**default** (two projects, a mix of specific and tool-wide grants), and **stress** (many
rules, a very long Bash command, an MCP grant, and a legacy entry with no recorded cwd).
Review at non-zero fake IPC latency and in the narrow viewport.

### Open item for Phase 1 review

`ProvidersSection` gates itself entirely on `window.claude.native.supported`, which
`remote-shim.ts` hardcodes to `false`, so it renders nothing over remote access.
**Recommendation: do not copy that gate here.** Copying it would make the WebSocket
route added in Phase 2 dead on the only transport that would use it, would prevent
revoking a grant from a phone, and conflicts with the program's rule that each milestone
is exercised on both clients. The section is simply empty when there are no rules.
Flagged because it is a deliberate divergence from the neighbouring section.

---

## Phase 2 — Backend

`MOCK_ONLY` is the to-do list; each entry is deleted as its channel becomes real.

### Store — `permission-store.ts`

```ts
type StoredRule    = PermissionRule & { grantedAt?: string };
type StoredProject = { slug: string; cwd?: string; rules: StoredRule[] };

list(): Promise<StoredProject[]>
remove(slug: string, rule: PermissionRule): Promise<boolean>   // matched on (tool, pattern, action)
removeProject(slug: string): Promise<boolean>
```

No rule id is needed: `remember()` already dedupes exact repeats, so
`(tool, pattern, action)` is unique within a project. `remove` returns whether anything
matched, so the UI cannot report success against a stale list.

`remember()` additionally records `cwd` on the project entry and `grantedAt` on the
rule. Both optional; the file **stays `v: 1`** because the reader is already tolerant of
missing keys, and a version bump would demand a migration for a purely additive change.

**Trap:** `remember()` currently rebuilds the entry as `{ rules }` (`:54`), which would
drop a recorded `cwd` on the very next write. It must spread the existing entry.

All writes continue to go through `NativeHome.mutateJson` — the mkdir-based file lock is
mandatory for `~/.youcoded/` JSON, because the dev instance and the built app share the
home directory.

### Live-session revocation — `native-session-host.ts`

`revokeRule(slug, rule)` is the **single** entry point: it awaits `store.remove()`, then
filters `rememberedFor` for every live session whose `cwdToProjectSlug(entry.cwd)`
equals that slug — slug comparison, not path equality, because two paths that collapse
to one slug genuinely share the disk rules.

One orchestrator rather than the IPC handler calling store-then-host, so there is one
error path. A disk removal that succeeds while the memory drop fails would leave a
running session still granting exactly what the user just revoked.

`RememberedRuleStore` (the structural type declared at `:45-51`, deliberately structural
so tests can inject a fake) gains `remove`. `list` never touches the host.

### IPC — `permissions:list`, `permissions:remove`, `permissions:remove-project`

**Five surfaces, not four:**

1. `src/main/ipc-handlers.ts` — handlers
2. `src/main/preload.ts` — `window.claude.permissions`
3. `src/renderer/remote-shim.ts` — same shape over WebSocket
4. `src/main/remote-server.ts` — an explicit WS `case` per channel (`search:list` at
   `:918` is the pattern; there is no generic passthrough)
5. `app/src/main/kotlin/.../runtime/SessionService.kt` — three strings appended to the
   existing `not-implemented-on-mobile` list, so the shared React UI degrades to a
   desktop-only state instead of timing out

Follow the `search:*` payload convention exactly — preload passes positionally,
remote-shim wraps as an object, the WS case unwraps. That family already has a working
route; `provider:*` has a documented latent mismatch and is the wrong model to copy.

Parity is pinned by `tests/ipc-channels.test.ts`, which checks per-prefix — a
`permissions:*` block must be added there or a missing surface passes silently.

## Phase 3 — External-path honesty fix

Two parts:

- `harness-session.ts` stops emitting `remember-rule` when `externalAsk` forced the ask.
- The ask carries an `external` flag so `ToolCard` suppresses the Always-allow button —
  the same suppression budget gates already get at `ToolCard.tsx:826`. The flag rides
  the route `denyListed` already takes from the broker through the reducer, so no new
  plumbing.

Separable from Phases 1–2 and can land on its own.

---

## Testing

**Store:** round-trip list/remove; the `cwd`-preservation trap; a legacy entry with no
`cwd`; a removal matching nothing returns `false`; a hand-corrupted file shape.

**Host (the one that matters):** a live session stops granting after `revokeRule` —
including the two-cwds-one-slug case, and including a session whose cwd differs in
spelling from the one the UI passed.

**Parity:** the new `permissions:*` block in `ipc-channels.test.ts`.

**Harness:** an external-forced ask emits no `remember-rule`.

**Workbench:** `node scripts/workbench-boot-check.mjs` after any mock-shim change — the
unit suite stayed green through three consecutive boot crashes.

`bash scripts/verify.sh` covers `youcoded/desktop` on **Linux only**. It cannot see the
Windows/macOS break class that left master red for two days; the three-platform CI
matrix on the PR is the real gate.

## Out of scope

- **2b Full Auto prompt coherence** — the next item, not this one.
- **2c Bash always-allow rule shape** — strictly after this. It *widens* grants, and
  their accidental narrowness is currently the only thing limiting blast radius.
- **Claude Code's own permissions** — named on screen, not managed. Roadmap item.
- **Android implementation** — honest refusal only; M5's Android parity is M8's.
- **youcoded #278** — a permissions PR on the *Claude Code* hook-relay path, stale since
  2026-07-31. Unrelated; judge separately.
