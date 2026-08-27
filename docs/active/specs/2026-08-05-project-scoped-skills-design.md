---
status: draft
---

# Project-scoped skills for native sessions — design

> ## Status 2026-08-26 — NOT BUILT; the ROADMAP's "never discovered" claim re-verified TRUE
>
> Verified against `youcoded` `origin/master` (`dbbb9139`) on 2026-08-26:
>
> - `git grep -n 'scanProjectSkills\|mergeProjectSkills' origin/master` → **no output**.
> - `git grep -n "\.claude/skills" origin/master -- desktop/src` returns only
>   `skill-scanner.ts:14`/`:148` (the `~/.claude/skills/` pass) and `symlink-cleanup.ts:30`
>   (`path.join(home, '.claude', 'skills')`). Every hit is home-rooted; none is cwd-rooted.
> - `scanSkills()` (`skill-scanner.ts:21`) still takes **no arguments**, and
>   `createSkillCatalog(entries: SkillEntry[] = scanSkills())` (`harness/skills/skill-catalog.ts:65`)
>   still has no cwd parameter — so `NativeSessionHost`'s catalog is home-scoped per process,
>   not per session cwd.
> - The precedent this design leans on is intact: `command-provider.ts:72` is
>   `const project = cwd ? scanCommandsFromDir(path.join(cwd, '.claude', 'commands')) : [];`
>   Commands scan the project layer; skills still do not.
> - No branch or worktree exists for this work (`git worktree list`, `git branch -a`).
>
> Last activity: 2026-08-06 (plan written, conversation `7e87` "Project Scoped Skills Plan").
> **Next step: build work only.** Design was settled with Destin 2026-08-05; the plan is
> written and re-anchored against `48202704`, so expect line-number drift (~20 days of master)
> but not symbol drift.

A skill committed into a project's `.claude/skills/` directory should work in a
YouCoded native session, the same way it already works in a Claude Code session.
Today it does not: skill discovery is entirely home-scoped, so a repo that ships
its own skills is invisible to the native harness and to the app's drawer.

---

## Problem

Claude Code discovers skills from three roots — `<cwd>/.claude/skills/`,
`~/.claude/skills/`, and registered plugins. The project root is pure filesystem
auto-discovery: drop the directory in, and the next session sees it. No
registration, no manifest. (This workspace relies on it — `/ui-mockup` and
`/audit` live in `youcoded-dev/.claude/skills/`.)

The native harness has one discovery function, `scanSkills()`
(`desktop/src/main/skill-scanner.ts:21`). It takes no arguments, and there is no
notion of a current project anywhere in it. Its three passes are all home-scoped:

1. `~/.claude/plugins/<slug>/skills/` — any dir with a `plugin.json` (lines 70–104)
2. every `installPath` in `installed_plugins.json` (lines 106–146)
3. `~/.claude/skills/<name>/SKILL.md` — user-authored, symlinks skipped (lines 148–194)

So a native session opened on a repo cannot use that repo's skills, and the
app's skill drawer under-reports what a *Claude Code* session in the same folder
can already run. The asymmetry is sharper than it looks: **commands are already
project-scoped in the native harness.** `command-provider.ts:71-72` scans
`<cwd>/.claude/commands/` alongside the user directory. Skills simply never got
the same pass.

Downstream of discovery, `skill-catalog.ts:65-95` is deliberately the only place
that knows the `<skillDir>/SKILL.md` layout (`native-runtime.md` states not to
add a second); the `Skill` tool snapshots the catalog once per session build
(`skill.ts:26-28`); and `/name` invocation flows through
`native-session-host.ts:580-620` → `frameSkillInvocation`.

## Goals

- A native session opened on a folder discovers and can run that folder's skills,
  via both the `Skill` tool and `/name`.
- Those skills are visible in the `/` drawer, attributed to the folder.
- Name collisions resolve predictably and visibly, never silently.
- `scanSkills()` stays home-scoped and cacheable.

## Non-goals

- **Android.** Deferred wholesale (Destin, 2026-08-05). Android has no native
  harness until M8, and its CC sessions already get project skills from CC
  itself. Two pre-existing Android gaps are captured in `ROADMAP.md` rather than
  fixed here: `SkillScanner.kt` has no project pass, and it has no
  `~/.claude/skills/` pass at all (it stops after the two plugin passes — it does
  **not** mirror the desktop scanner, contrary to how it is sometimes described).
- Publishing or sharing project skills through the marketplace. A project skill
  is a property of a folder, not an installable artifact; it does not belong on
  the marketplace screen, in favorites, or in chips.
- A trust gate before project skills load (see Decisions).

---

## Decisions

**Visibility: session + drawer.** Project skills appear in the `/` drawer with a
"from this folder" badge, not only inside the running session. A skill that works
when typed but is invisible when browsing reads as a bug; the drawer is *the*
discovery surface for a non-technical user.

**Precedence: plugin > project > user.** This matches what the command side
already does — `command-provider.ts:74` builds `[...user, ...project, ...plugin]`
and `mergeCommandSources` applies `byName.set` in array order, so later sources
overwrite earlier ones. Skills and commands land in the same drawer and already
dedupe against each other (`mergeCommandSources` drops any command colliding with
a skill name), so two different precedence orders in one list would be
undebuggable. Rejected: namespaced ids (`project:ui-mockup`) — they break the one
thing a project skill is for, which is that the repo's README says `/ui-mockup`
and it works.

**Shadowing is annotated, never silent.** Whichever entry wins carries a note
naming what it displaced. Silent shadowing is the failure mode that produces
"why doesn't my skill work" reports.

**Auto-load, no trust gate, with attribution.** Claude Code auto-discovers
project skills with no prompt, and matching that is the right default. The
exposure is real — a skill's description rides in the `Skill` tool schema every
turn and its body becomes a tool result the model is told to follow — but the
permission engine is the actual boundary and it does not move: the `Skill` tool
is deliberately *not* `interactive` (`skill.ts:8-11`), so everything a skill
drives still goes through `decide()`. A trust prompt would mostly train users to
click through prompts, devaluing the ones that matter. Mitigation is attribution,
not a gate.

---

## Design

### 1. Discovery — `scanProjectSkills(projectDir)`

A new function in its own module, **not** a fourth pass inside `scanSkills()`.

```ts
export function scanProjectSkills(projectDir: string): SkillEntry[]
```

Reads `<projectDir>/.claude/skills/<name>/SKILL.md`, reusing the existing
frontmatter reader. Each entry gets `source: 'project'`, `visibility: 'private'`,
`type: 'plugin'`, `prompt: '/<name>'`, and `skillDir` set to the directory that
holds the `SKILL.md`.

**Why a separate function.** `LocalSkillProvider.getInstalled()` memoizes
`scanSkills()` into `installedCache` (`skill-provider.ts:148-189`) and
invalidates it only on install/uninstall. A cwd-dependent `scanSkills()` poisons
that cache as soon as two sessions sit in different folders. Keeping it
home-scoped and pure preserves the memo, and the project layer — one `readdir`
plus a few small frontmatter reads — is cheap enough to apply on top per request.

**A directory with no readable `SKILL.md` is skipped, not listed.** Pass 2's
"record it anyway, the catalog will report it as installed-but-unreadable"
behavior (`skill-scanner.ts:137-141`) is right for a plugin, which genuinely *is*
installed. It is wrong here: a directory under `.claude/skills/` with no
`SKILL.md` is not a skill, and listing it puts an entry in the drawer that fails
on click.

**Symlinked directories are accepted**, unlike Pass 3. Pass 3 skips symlinks
solely to avoid double-counting toolkit-managed mirrors in `~/.claude/skills`
(`skill-scanner.ts:165`, and `symlink-cleanup.ts` actively removes them) — a
legacy concern with no analogue in a project folder, where monorepos legitimately
symlink shared skills. This divergence carries a WHY comment so it is not later
"fixed" into false consistency.

### 2. Merge — `mergeProjectSkills(home, project)`

One function, mirroring `mergeCommandSources`, implementing plugin > project >
user. A single new optional field on `SkillEntry` carries both shadow directions:

```ts
/** The source of the same-named entry this one displaced, when it displaced one. */
shadows?: SkillEntry['source'];
```

- Project beats a user skill → the **project** entry survives with
  `shadows: 'self'`. Drawer: *from this folder · replaces your personal skill*.
- A plugin beats a project skill → the **plugin** entry survives with
  `shadows: 'project'`. Drawer: *this folder has a skill with the same name that
  isn't being used*.

One entry per id in both directions, so `skill-catalog.ts`'s `byId` map, its
bare-name resolution, and its `SkillAmbiguous` rules are untouched.

`SkillEntry.source` gains `'project'` — the union is currently
`'youcoded-core' | 'self' | 'plugin' | 'marketplace'` (`src/shared/types.ts:331`).
`SourceTag` in `SkillCard.tsx:58-68` is the render site for the badge.

**Project skills cannot be favorited or pinned as chips.** Favorites and chips
are stored by bare id in `~/.claude/youcoded-skills.json` (`SkillConfigStore`),
which is global — favoriting a project skill would pin it into every session,
including the ones opened on folders where it does not exist and cannot run. The
affordance is hidden for `source: 'project'` rather than left to fail silently.
This is the same reasoning as the marketplace exclusion in Non-goals: a project
skill is a property of a folder, and the global stores have no place to say so.

### 3. Surfacing — the cwd comes from the renderer

`skills:list` gains an optional `cwd` argument across all four surfaces
(`preload.ts`, `ipc-handlers.ts`, `remote-shim.ts:846`, `SessionService.kt`).
The renderer passes the active session's cwd; main merges the project layer onto
the memoized home layer for that request.

**`commands:list` is fixed the same way in this work** (Destin, 2026-08-05),
because the existing project-cwd accessor is wrong. `main.ts:194-197` resolves it
as:

```ts
const sessions = sessionManager.listSessions();
return sessions[0]?.cwd ?? null;
```

That is the *first* session in the list, not the active one — so with two
sessions open on different folders, project commands already come from the wrong
folder today. Main has no notion of an active session at all; `session-browser.ts`
only ever takes an `activeSessionIds` **set** (`:306, :318, :359, :437, :499`).
The renderer is the only place that knows, so it must say. Leaving commands on
the broken accessor while skills use the correct one would scope the two halves
of one drawer list to two different folders — worse than either bug alone,
especially since `mergeCommandSources` drops commands that collide with skill
names.

The `getProjectCwd` constructor parameter on `CommandProvider` becomes dead once
the cwd arrives per call; it is removed rather than left as a second, wrong
source of truth.

### 4. Native sessions — a catalog per session, not per host

`NativeSessionHost` holds one optional `skillCatalog` (`:155`) and hands the same
instance to every session (`:289`). Because each session has its own cwd, this
becomes a private `catalogFor(cwd)` with a small per-cwd memo, used by both
`toolWiring()` — which already receives `cwd` (`:277`) — and the `/name` path at
`:589`.

The constructor's test seam changes from a built `SkillCatalog` to
`SkillEntry[]`, since layering needs entries rather than a finished catalog. That
touches `native-skill-invoke.test.ts` and `skill-tool-gating.test.ts`.

`createSkillTool` snapshotting `catalog.list()` once at construction
(`skill.ts:26-28`) is left exactly as-is. Per-session catalog construction
already yields Claude Code's behavior — a new session picks up a newly added
project skill — with no extra invalidation path.

Capability gating is unchanged: the `Skill` tool remains conditional on
`profile.exposeSkillCatalog` and is still absent from `NATIVE_TOOL_NAMES`
(`harness-session.ts:405-425`). Project skills are subject to the same per-preset
allowlist (`opts.harness.skills`) as every other skill.

### 5. Attribution

The `Skill` tool result and `frameSkillInvocation` name the origin for
project-sourced skills, so the injected instructions say where they came from
instead of arriving as anonymous authority. Today `skill.ts:46` wraps the body as
`<skill-instructions name="...">`; project skills carry an origin attribute
alongside the name.

---

## Error handling

Per `docs/error-message-standards.md` — specific and accurate, never a guessed
cause:

- **Unreadable `SKILL.md` in a project skill dir** — the directory is skipped at
  discovery (§1), so no broken entry reaches the drawer or the catalog.
- **`.claude/skills/` absent, or the cwd unreadable** — an empty project layer.
  Not an error; the overwhelming majority of folders have no project skills.
- **No cwd at all** — an empty project layer, same as above. The new-session forms
  require a folder today, but folderless native sessions are planned (parity
  program §6 item 7), so `cwd` is typed as optional end to end and a missing one
  is never an error path.
- **A shadowed skill** — surfaced as drawer annotation (§2), not an error.
- **`catalog.load()` failures** — unchanged. `SkillNotFound`, `SkillAmbiguous`,
  and `SkillUnreadable` (`skill-catalog.ts:29-54`) already name the real path or
  the real alternatives, and are returned rather than thrown so `defineTool`'s
  catch does not bury the recovery information (`skill.ts:47-52`).

## Testing

- **`project-skills.test.ts`** (new) — discovery from a fixture project dir;
  precedence in both directions; both `shadows` annotations; symlinked skill dir
  accepted; directory without `SKILL.md` skipped; missing `.claude/skills/`
  yields `[]`.
- **A pinning test that `scanSkills()` stays home-scoped** — it takes no
  arguments and touches nothing under a cwd. This is the invariant that keeps
  `installedCache` correct (§1), and it is exactly the kind of thing that
  regresses silently.
- **`ipc-channels.test.ts`** — extended for the `skills:list` and `commands:list`
  argument across the four surfaces.
- **`command-provider.test.ts`** — updated for the cwd-per-call signature,
  including the multi-session case that the `sessions[0]` accessor got wrong.
- **`skill-catalog.test.ts` / `skill-tool-gating.test.ts` / `native-skill-invoke.test.ts`**
  — updated for the per-session catalog seam.

Verification for the whole change is `bash scripts/verify.sh` (tsc + affected
vitest + knip + ast-grep).

## Files

| File | Change |
|---|---|
| `desktop/src/main/project-skills.ts` | new — `scanProjectSkills`, `mergeProjectSkills` |
| `desktop/src/main/skill-scanner.ts` | one word: `readSkillMeta` becomes exported so the project pass reuses the frontmatter reader rather than duplicating it. No behavior change, and `scanSkills()` itself is untouched — see §1 |
| `desktop/src/shared/types.ts` | `SkillEntry.source` gains `'project'`; new `shadows?` field |
| `desktop/src/main/skill-provider.ts` | project layer applied per request over the memoized home layer |
| `desktop/src/main/command-provider.ts` | cwd per call; `getProjectCwd` constructor param removed |
| `desktop/src/main/main.ts` | drops the `sessions[0]?.cwd` accessor |
| `desktop/src/main/ipc-handlers.ts`, `preload.ts`, `src/renderer/remote-shim.ts` | `cwd` arg on `skills:list` + `commands:list` |
| `app/.../SessionService.kt` | expected: none. The shared renderer will send the extra `cwd` arg on both channels; confirm the Kotlin handlers tolerate it and ignore it. Android discovery stays home-scoped by decision |
| `desktop/src/main/harness/native-session-host.ts` | `catalogFor(cwd)`; entries-based test seam |
| `desktop/src/main/harness/tools/skill.ts`, `skills/skill-invocation.ts` | origin attribution |
| `desktop/src/renderer/components/SkillCard.tsx` | "from this folder" badge + shadow note |

## Open questions

None blocking. Deferred by decision: Android parity (both the project pass and
the missing user-skills pass), tracked in `ROADMAP.md`.
