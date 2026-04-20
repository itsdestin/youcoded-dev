# WeCoded Marketplace Publisher — Design Spec

**Date:** 2026-04-20
**Status:** Design approved, pending implementation plan
**Target repo:** `wecoded-marketplace/wecoded-marketplace-publisher/`

## Overview

WeCoded Marketplace Publisher is a Claude Code plugin that helps users publish the plugins they've built (skills, commands, hooks, MCP configs, agents, or any combination) to the WeCoded marketplace. It is designed explicitly for non-technical users — the kind of user who built something via conversation with Claude and doesn't necessarily know what a "plugin" is, where their files live on disk, or what components their own creation depends on.

The skill offers two publish paths, both of which first create a public GitHub repo under the user's own account:

- **Community path** — marketplace lists the plugin with a `"community"` badge; the user keeps full control and maintains it.
- **Adoption request path** — same community listing goes live, and an additional adoption-request PR is opened against `wecoded-marketplace`. If WeCoded accepts, the plugin is copied into the marketplace's own repo and the marketplace entry flips from `sourceMarketplace: "community"` to `sourceMarketplace: "youcoded"`; the user loses control over the adopted version (their own repo remains theirs, but is delisted in favor of the adopted copy). If declined, the community listing remains unchanged.

The skill is invoked via a single slash command and runs a conversational flow end-to-end in one session. The path choice is asked late — after the plugin has been discovered, rebuilt, reviewed, and sanitized — so the user is deciding with the finished artifact in front of them, not an abstraction.

## Goals and non-goals

**Goals (v1):**
- Let a non-technical user publish a plugin they've built without knowing where their files live or what components it contains.
- Discover plugin pieces across known Claude Code locations based on the user's own description of what they made.
- Rebuild the discovered pieces into a correctly-structured wecoded plugin in a fresh working directory; never mutate the user's originals or their `settings.json`.
- Detect secrets in the plugin source and offer automated sanitization with transparent before/after review.
- Detect hidden cross-references (e.g., a skill that depends on an MCP the user didn't mention) and surface them for confirmation.
- Provide two publish paths with plain-language explanations of irreversible consequences before the user commits.
- Use `gh` CLI for all GitHub operations; fail fast with clear guidance if `gh` is missing or unauthed.
- Write a persistence ledger so v2 can add update-publish support without retroactive scanning.

**Non-goals (v1):**
- Updating an existing marketplace listing (first-publish only; ledger is written for v2).
- Any desktop-app UI integration.
- Bundling third-party MCP server source. MCPs are declared as dependencies; their config goes into `.mcp.json`. Only if the user confirms they built the MCP themselves is MCP source shipped.
- Auto-activating installed hooks. Hooks in a published plugin become desired-state entries in its own `hooks-manifest.json`; they activate only when someone installs the plugin via the standard plugin flow.
- Tracking PR status after publish (skill exits; GitHub notifies the user).
- Enabling publish without `gh` CLI (no REST API fallback, no browser-OAuth fallback in v1).

## Architecture & layout

**Plugin location:** `wecoded-marketplace/wecoded-marketplace-publisher/` (top-level inside `wecoded-marketplace`, matching the convention used by `civic-report/`).

**Directory layout:**

```
wecoded-marketplace-publisher/
├── plugin.json                    # Manifest for the plugin itself
├── README.md                      # User-facing overview
├── commands/
│   └── publish-to-marketplace.md  # Slash command → invokes the skill
├── skills/
│   └── marketplace-publisher/
│       └── SKILL.md               # Conversational logic
└── scripts/
    ├── inventory.js               # Scan disk → candidate plugin pieces
    ├── build-plugin.js            # Rebuild pieces into a proper plugin
    ├── preflight.js               # Local validation before publish
    └── publish.js                 # gh operations, PR creation, ledger writes
```

**Marketplace self-entry:** `wecoded-marketplace/marketplace.json` gains an entry with `id: "wecoded-marketplace-publisher"`, `sourceMarketplace: "youcoded"`, `source: { source: "local", path: "wecoded-marketplace-publisher" }`, `components: { commands: ["publish-to-marketplace"], skills: ["marketplace-publisher"] }`. Users install it from the marketplace like any other plugin.

**Persistence:** `~/.claude/wecoded-marketplace-publisher/published.json` — ledger mapping `pluginId → { repoUrl, version, publishedAt, communityPR, adoptionPR?, state }`. Written on each completed or partially-completed publish. Used for (a) forward compatibility with a v2 update flow and (b) idempotent recovery from interrupted publishes.

**Working directory:** `~/.claude/wecoded-marketplace-publisher/working/{pluginId}/` is where `build-plugin.js` assembles the plugin before push. Cleaned on success, preserved on error for debugging.

**Runtime:** Node.js helper scripts (Claude Code ships with Node; matches existing marketplace plugins like `civic-report`). Scripts accept JSON on stdin or as argv and write JSON to stdout. `SKILL.md` orchestrates them; Claude handles conversation, the scripts do deterministic work.

**Internal structure rationale (approach chosen):** one SKILL.md + helper scripts, rather than a single monolithic prompt or a set of decomposed sub-skills. The conversation (intake, discovery confirmation, metadata review, path choice) belongs in prompt form because it is genuinely a conversation. The mechanical work (file-system scanning, plugin assembly, preflight checks, `gh` orchestration, PR creation) is deterministic and must behave identically across runs — leaving it as prompt-driven "tell Claude what to do each time" produces the "sometimes the version field is missing" class of bug, which cannot be tolerated when the output is a public PR.

## User journey

A single run of `/publish-to-marketplace`, end to end:

1. **Preflight.** Skill runs `gh --version` and `gh auth status`. If either fails, the skill explains in plain language what's missing, points to the `gh` setup docs, and exits. No automatic install.

2. **Open-ended intake.** *"Tell me about what you made. What does it do, how do you use it?"* The user's own words seed the marketplace `description` field and a casual `displayName` candidate.

3. **Structured triage.** 3-5 yes/no questions: *"Do you trigger it with a slash command? Does it talk to external services? Does it run automatically at session start or when files change? Does it include a custom agent (a sub-Claude you can hand off work to)?"* Answers produce a `signals` object `{ hasCommand, hasMCP, hasHook, hasSkill, hasAgent }` that tells inventory where to look.

4. **Detective work (`inventory.js`).** Skill invokes the script with signals + keywords. Script scans:
   - `~/.claude/skills/*/SKILL.md` and `~/.claude/plugins/**/skills/*/SKILL.md`
   - `~/.claude/settings.json` → `hooks.*` block
   - `~/.claude.json` → `mcpServers` and any project-local `.mcp.json` in CWD ancestors
   - `~/.claude/commands/*.md` and CWD's `.claude/commands/*.md`

   Each candidate is scored by token-overlap between the user's intake and the artifact's name/description/content. Candidates include `references[]` — cross-references detected inside content (a skill that mentions an MCP tool name, for example).

5. **Findings & confirmation.** Skill describes candidates in plain language. Critical: cross-references are surfaced explicitly (*"This skill mentions a tool called `mcp__gmail__send_email` — looks like it needs the Gmail MCP. Should I list Gmail as a dependency?"*). User confirms, corrects, or adds.

6. **Rebuild (`build-plugin.js`).** Skill passes the confirmed manifest to the script. Script assembles a proper plugin at `~/.claude/wecoded-marketplace-publisher/working/{pluginId}/`:
   - `plugin.json` generated from metadata (author from `gh auth`, version defaults to `0.1.0`)
   - `skills/{name}/` copied
   - `commands/*.md` copied
   - `hooks/hooks-manifest.json` built from detected hooks in **desired-state format** (follows youcoded-core convention)
   - `.mcp.json` stub for declared MCP dependencies (config only; no MCP source unless user built it)
   - `README.md` templated if absent
   - User's originals are never touched.

7. **Secret scan during rebuild** (covered in detail below). If findings: warning with default-recommended sanitization. User reviews and approves. On approval, source files are rewritten to read from a config mechanism and a `SETUP.md` is added.

8. **Metadata.** Skill proposes `displayName`, `description`, `category`, `tags`, `lifeArea`, `audience`, seeded from the intake + detected components. User confirms or edits each.

9. **Preflight (`preflight.js`)** — see "Preflight checks" below. Fails block; warnings surface but can be acknowledged.

10. **Show finished plugin.** Skill presents a summary: name, description, contents by type, config values the installer will need to provide (from `SETUP.md`).

11. **Path choice.** Skill presents two option cards in plain language:
    - **Community plugin (you maintain it)** — plugin lives in the user's GitHub repo, they keep full control.
    - **Request WeCoded adoption (they may take over)** — community listing goes live immediately as a fallback; separately, WeCoded reviews and decides. If accepted, the user's community version is delisted and the adopted copy replaces it; user loses control over the adopted version. If declined, nothing changes.

    If adoption chosen, skill asks one follow-up: *"In a sentence or two, why would you like WeCoded to take this over?"* — captured for the adoption-request PR body.

12. **Publish (`publish.js`).** Branching described in "Publish path divergence" below. Ledger written. Working dir cleaned on success.

13. **Confirmation.** Skill displays user's repo URL, community PR URL, adoption PR URL (if opted in), and plain-language next steps. Skill exits; does not poll PR status.

## Components

### `inventory.js`

**Input:** `{ signals: { hasCommand, hasMCP, hasHook, hasSkill, hasAgent }, userDescription: string, userKeywords: string[] }` via argv or stdin.

**Scans (conditional on signals):**

| Location | Captured data |
|----------|---------------|
| `~/.claude/skills/*/SKILL.md` | Frontmatter (name, description), content for cross-ref detection |
| `~/.claude/plugins/**/skills/*/SKILL.md` | Same |
| `~/.claude/settings.json` → `hooks.*` | Hook script paths (referenced scripts inventoried as files) |
| `~/.claude.json` → `mcpServers` | MCP name + config |
| CWD ancestors' `.mcp.json` | Same |
| `~/.claude/commands/*.md`, CWD's `.claude/commands/*.md` | Slash command name + body |
| `~/.claude/agents/*.md` and CWD's `.claude/agents/*.md`, plus agent files inside existing plugin trees | Agent frontmatter (name, description) + body |

**Scoring:** token-overlap between `userDescription + userKeywords` and each artifact's metadata + content. High-match items float to top.

**Cross-reference detection:** regex-scan of content for tool-name patterns (`mcp__{server}__{tool}`) and explicit file/command references. Each reference is captured with its resolution target (if resolvable) in the candidate's `references[]`.

**Output:** `[{ path, type, name, description, references: [{ target, resolvedTo? }], matchReason, score }]` sorted desc by score.

### `build-plugin.js`

**Input:** confirmed manifest `{ pluginId, metadata, pieces: [{ type, sourcePath, targetPath, meta }] }`.

**Output:** fully-formed plugin at `~/.claude/wecoded-marketplace-publisher/working/{pluginId}/`:
- `plugin.json` generated from metadata
- Pieces copied to their `targetPath` inside the working dir
- `hooks/hooks-manifest.json` built in desired-state format if any hooks in `pieces`
- `.mcp.json` stub for declared MCP dependencies
- `README.md` templated if not provided by user
- Secret scan runs as part of build; findings produce a non-zero exit with structured stderr JSON that SKILL.md parses and surfaces to the user for review

**User originals untouched.** All operations are copy-from, write-to working dir.

### `preflight.js`

**Input:** path to assembled working dir.

**Checks:**

| Check | Severity | Action on fail |
|-------|----------|----------------|
| Secret re-scan on sanitized output (defense in depth) | Fail | Stop; surface remaining matches |
| Total size < 50MB (marketplace CI limit) | Fail | Show largest files; offer to exclude |
| Plugin ID not in live `marketplace.json` (fetched from raw.githubusercontent.com/itsdestin/wecoded-marketplace/main/marketplace.json) | Fail | Suggest alternatives seeded from `displayName` |
| Required fields present (`name`, `displayName`, `description`, `author`, ≥1 component) | Fail | Identify missing; jump back to metadata step |
| Enum validity (`category`, `lifeArea`, `audience`, `tags`) against marketplace's `scripts/schema.js` | Fail | Show valid options |
| No `.env`, `node_modules/`, `.git/` in tree | Fail | Offer to exclude |
| Unresolved cross-references (skill mentions an MCP tool but no MCP declared) | Warn | User confirms or jumps back |

**Output:** `{ pass: boolean, checks: [{ name, status: "pass"|"warn"|"fail", detail }] }`.

### `publish.js`

**Input:** `{ workingDir, metadata, path: "community" | "adoption", adoptionReason?: string }`.

**Common flow (A and B):**
1. `gh repo create {user}/{pluginId} --public --source=./working/{pluginId} --push` — creates user's public repo, pushes assembled plugin as initial commit.
2. **Community-listing PR** against `wecoded-marketplace`, branch `add-plugin/{pluginId}`: adds one entry to `marketplace.json` with `sourceMarketplace: "community"`, user's repo URL, and all confirmed metadata. PR body auto-generated, links user's repo.

   The exact `sourceType` / `sourceRef` / `source.*` shape for "community plugin in a user-owned repo" must match whatever `wecoded-marketplace`'s `validate-plugin-pr.yml` and `scripts/schema.js` accept. Implementation step: before writing `publish.js`, verify the canonical shape by examining an existing community entry (or add an explicit shape to the schema if none exists yet). Do not invent values.

**Adoption-only second step:**
3. **Adoption-request PR** against `wecoded-marketplace`, branch `adoption-request/{pluginId}`: adds a single file `adoption-requests/{pluginId}.md` from a template containing:
   - Plugin info (id, displayName, description, components)
   - User's `adoptionReason`
   - User's GitHub handle
   - Link to the community-listing PR
   - Acknowledgment block (consequences of acceptance, spelled out)

   PR labeled `adoption-request`. Merging = accept (request file stays as history; actual adoption work happens in a separate follow-up PR that moves source into `plugins/` and flips `sourceMarketplace`). Closing without merge = decline.

**Why PR-with-file rather than empty PR:** an empty PR has no diff, cannot be reviewed cleanly, and leaves no record after close. The `adoption-requests/` folder becomes a historical log either way, accepted or declined.

**Ledger writes:** `published.json` entry written after step 1 (state `"repo-created"`), after step 2 (state `"community-pr-open"`), after step 3 (state `"complete-with-adoption"`). Each state write is committed to disk before the next action, so any interruption leaves a recoverable state.

## Publish path divergence — UX detail

The path-choice prompt, as shown to the user at step 11:

```
Two options for publishing:

Option A: Community plugin (you maintain it)
  • Your plugin lives in your own GitHub repo
  • You can edit, update, or remove it any time
  • If people report bugs, you fix them
  • Marketplace shows a "Community" badge

Option B: Request WeCoded adoption (they may take over)
  • Your plugin still gets published to your GitHub repo and listed
    as Community — so no matter what, you end up with a working listing
  • Separately, WeCoded reviews and decides whether to adopt it

  If WeCoded accepts:
    • WeCoded copies your plugin into their own repo
    • Marketplace shows an "Official WeCoded" badge
    • Your community version is delisted (adopted copy replaces it)
    • You no longer control updates, bug fixes, or the plugin itself
    • You still have YOUR repo — it's just no longer what the
      marketplace lists

  If WeCoded declines:
    • Nothing changes — your community version stays listed
    • WeCoded gives you a reason

  Response usually takes 1-2 weeks.

Which would you like? [A/B]
```

If B: skill asks *"In a sentence or two, why would you like WeCoded to take this over?"* and proceeds.

## Secret handling

**Model:** warn, don't block. Default action is automated sanitization with full user visibility.

**Detection:** during `build-plugin.js`, every text file being copied is scanned against a small, high-signal pattern set: GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`), AWS access keys (`AKIA...`), OpenAI keys (`sk-...`), Anthropic keys (`sk-ant-...`), generic Bearer-format tokens, and high-entropy base64 strings with key-like context (assigned to a variable named `*key*`, `*token*`, `*secret*`, `*password*`). Matches are captured with `{ file, line, patternName, excerpt }`.

**Presentation:** skill surfaces findings in a review panel:

```
I found 2 things that look like secrets in your plugin:

  1. skills/summarize-emails/SKILL.md (line 42)
     Looks like a GitHub token (ghp_...)

  2. scripts/fetch.js (line 15)
     Looks like an Anthropic API key (sk-ant-...)

Recommended: I'll sanitize the published version so other people
who install your plugin configure their own values — not yours.

  • Remove the secret values from these files in the published copy
  • Rewrite the code to read each value from a config mechanism:
      - MCP-scoped secrets route through the MCP's .mcp.json config
      - Other secrets become process.env.{VAR} reads in scripts, or
        documented placeholders in markdown/SKILL.md instructions
  • Add a SETUP.md doc to the plugin that tells installers exactly
    what each value is, where to get it, and how to set it
  • Your local working copy is untouched — only the version that
    goes to GitHub/marketplace is sanitized

Proceed with sanitization? [Y/n]
```

**After sanitization:** skill shows a before/after summary per file (*"In scripts/fetch.js, I replaced `apiKey: 'sk-ant-...'` with `apiKey: process.env.ANTHROPIC_API_KEY` and added ANTHROPIC_API_KEY to SETUP.md"*) so the transformation is transparent.

**Opt-out available:** "Keep them in" is a supported choice (some tokens are deliberately demo-scoped and the user has rotated them), but it is opt-in with the consequence spelled out (*"Anyone who installs this plugin can see and use these values. Not recommended."*). Not the default.

**Runtime-missing behavior in sanitized plugins:** when a required env var is unset, the plugin code throws a clear error pointing to the setup doc — *"GITHUB_TOKEN is not set — see SETUP.md"*. The "reference to a configuration doc" is concrete: missing config → explicit pointer.

**`SETUP.md` structure:** auto-generated at plugin root. For each required config value: what it's for (plain language), where to obtain it (with a link when well-known like github.com/settings/tokens), exact syntax to set it.

## Error handling & recovery

**Principle: idempotent recovery via the ledger.** Every visible or destructive action (repo create, PR open) updates `published.json` before the skill considers it complete. On next run, the skill checks the ledger; if a prior run was interrupted, it offers to resume from the last successful step rather than starting over.

**Failure modes:**

| Stage | Failure | Recovery |
|-------|---------|----------|
| Preflight | `gh` missing or not authed | Stop early, plain-language guidance, exit clean |
| Intake | User description too vague to guide discovery | Targeted follow-up questions |
| Inventory | No candidate matches | Escape hatch: ask user to point at a path manually |
| Build | Cross-reference unresolvable | Ask user: use anyway, skip that tool, or cancel |
| Preflight | Fails uniqueness | Suggest alternatives seeded from displayName |
| Preflight | Fails size or hygiene | Show offenders, offer to exclude |
| Publish | `gh repo create` fails (name taken, offline, rate-limited) | Suggest alternative name; retry; or abort. Working dir preserved |
| Publish | PR creation fails after repo is live | Ledger: `state: "repo-created-no-pr"`. Skill surfaces exact recovery command and resumes on next run |
| Publish (adoption only) | Adoption PR fails after community PR succeeds | Ledger: `communityPR: OK, adoptionPR: failed`. Community listing is live; skill surfaces retry path |

**User-facing framing:** no dead-ends. Every error produces an explanation in plain language and an explicit next step.

## Ledger format

`~/.claude/wecoded-marketplace-publisher/published.json`:

```json
{
  "version": 1,
  "entries": [
    {
      "pluginId": "summarize-emails",
      "repoUrl": "https://github.com/alice/summarize-emails",
      "version": "0.1.0",
      "publishedAt": "2026-04-20T14:03:22Z",
      "communityPR": "https://github.com/itsdestin/wecoded-marketplace/pull/142",
      "adoptionPR": "https://github.com/itsdestin/wecoded-marketplace/pull/143",
      "state": "complete-with-adoption"
    }
  ]
}
```

`state` enum: `"repo-created"`, `"community-pr-open"`, `"complete"`, `"complete-with-adoption"`, plus failure-state variants `"repo-created-no-pr"`, `"community-ok-adoption-failed"`.

Read on skill startup to detect in-flight work. Used by the future v2 update flow to look up the user's repo for a given `pluginId`.

## Testing

Four layers:

1. **Script unit tests** — `scripts/__tests__/` via `node --test`. `inventory.js`, `build-plugin.js`, `preflight.js` are pure enough to fixture-test. Fake `~/.claude/` trees and fake `marketplace.json` asserted against expected output.

2. **Preflight golden fixtures** — `__tests__/fixtures/` with known-good and known-bad plugin trees; each has recorded expected preflight output. Catches validation-rule regressions.

3. **Dry-run mode** — `/publish-to-marketplace --dry-run` (or `DRY_RUN=1` env var) runs the full conversational flow but stops before `gh repo create`. Prints `would create: X, would push: Y, would open PRs: Z` for manual validation.

4. **Manual integration test** — one maintained fixture plugin in a sandbox GitHub account; the publisher publishes it end-to-end against a fork of `wecoded-marketplace` before each publisher release.

**Anti-pattern avoided:** do NOT mock `gh` in unit tests and trust that mocks match real behavior. `gh`'s output format and auth state are external; real validation requires the sandbox run.

## Open questions & future work

- **v2 update flow** — first-publish only in v1. The ledger lets v2 detect "this plugin is already published; opening an update PR to bump the version and sync changes." Needs: diff detection between working dir and user's repo, semver or calendar versioning choice, detection of adopted plugins (original user can't update them), and update-PR UX.
- **Multi-component plugin naming** — if a plugin bundles a skill + a command + a hook, what name does the user pick? Likely: ask the user for a "what do you call this thing?" name and disambiguate from component names programmatically. Covered inline in the metadata step, but if the pattern breaks down in practice (user can't come up with a name), a small naming helper may be warranted.
- **Marketplace submission pipeline changes** — if `wecoded-marketplace` CI workflows add new required fields or validation rules, the publisher's `preflight.js` must track them. Source of truth is `wecoded-marketplace/scripts/schema.js`; publisher should fetch-and-cache the schema at preflight time rather than vendor it, to avoid drift.
- **Rate-limit handling** — `gh` can rate-limit for unauthenticated or high-frequency requests. For non-technical users, a rate-limit error is opaque. v1 surfaces the raw `gh` error; a v1.1 could retry with backoff and produce plain-language guidance.
- **Analytics on adoption decisions** — for WeCoded maintainers to measure acceptance rates, reasons, and patterns. Non-goal for v1.
