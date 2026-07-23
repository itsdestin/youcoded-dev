---
status: shipped
date: 2026-07-22
shipped: 2026-07-23 (superseded by the spec; feature merged in youcoded PR #213)
owner: Destin (decisions) / Claude (execution)
subject: Seed a spec + plan for the in-app git surface + version tracking
type: handoff
kind: spec-seed
roadmap: "ROADMAP.md — 'Git surface in-app — diff vs HEAD, stage, commit, branch' (#git, added 2026-07-20)"
---

# Handoff — In-app git surface & version tracking

You are picking up **the highest-value developer feature on the artifact-pane roadmap and the real
differentiator** (Destin's framing). Your job this session is **not to implement it** — it is to
(1) verify what substrate now exists, (2) run the brainstorming skill to resolve the open design
questions with Destin, and (3) produce a spec + implementation plan. Start with brainstorming: there
are genuine unresolved decisions below (what "version tracking" means, git-shell vs library,
Android/remote story).

## Why this matters (the north star)

**Reviewing what the agent just did is the core anxiety of using an agent-first tool.** Right now
the only in-app view of a change is the per-tool-call diff inside a chat card (`ToolBody.tsx:318`).
There is no way to see the **cumulative working-tree diff**, no staging, no commit, no branch
awareness. Git appears in this codebase today **only as plumbing** — the sync transport
(`main/sync-spaces/git-transport.ts`) — and never as a user-facing surface.

**Positioning constraint (inherited from the Tier 1 code-editor work, do not drift from it):** the
framing is **NOT IDE parity** (unwinnable against Cursor on its own turf). It is *"I can trust and
steer what the agent did to my code"* — review, diff, stage, commit, navigate. This keeps the
non-developer audience intact (`docs/active/specs/2026-07-09-platform-vision-roadmap.md:139` — "the
open, personal Cowork"). Every feature you spec must justify against that framing; anything that only
serves IDE parity (real LSP, debugger) belongs in the separate `idea`-tagged ROADMAP entries, not
here.

## The substrate you get for free (verify each against master first)

The Tier 1 artifact code-editor workstream **shipped 2026-07-22** (youcoded PR #200 `1cf9cbf2`) plus
cross-file search (#205 `813a6c83`). That was deliberately sequenced ahead of this — it built most
of what a git surface needs:

- **CodeMirror 6 editor** in the artifact pane (replaced the markdown-fence CodeView).
- **`revealLine(n)` on `ActiveArtifactHandle`** (from search #205) — a reusable **open-file-at-line
  primitive**. The search work explicitly called this out as "the open-at-line primitive the future
  git surface needs." Diff rows → jump-to-line rides on this.
- **jsdiff (`diff@^9`) now imported in the renderer** — the hand-rolled LCS was replaced; ToolBody
  and the conflict view unified on one diff component. A working-tree diff view should build on the
  same component, not a fourth hand-rolled differ.
- **A `chokidar` project-directory watcher** (Tier 1 item 5) — external changes (a `git checkout`,
  a rebase, an edit in another editor) now broadcast `artifacts:changed`. A git surface needs to
  react to exactly these events; reuse the watcher, don't add a second one.
- **The D5 main-process path boundary** (`read-binary-access.ts` sensitive-path set; `.git/` is
  **never editable**, checked in MAIN against the resolved absolute path). A git surface that writes
  to the working tree (discard, checkout, stage) must respect this boundary — and note that `.git/`
  being read-only-to-the-editor does **not** mean git *operations* on it are blocked; that's a new
  policy decision.

## The one sequencing dependency — now mostly resolved (confirm)

The ROADMAP entry warned: settle the `gh` → GitHub REST removal first so this doesn't build on a
dependency being removed. **That has largely shipped since** — the sync-setup overhaul (youcoded
#201 `998d6fb0`, #202 `95895a6b`, #203 `647bd242`) introduced a shared **`github-client`** (token
custody in safeStorage/userData, REST repo provisioning, per-invocation inline credential.helper,
`github-fork-publish`) and made `gh` fully optional. **Verify the github-client's shape** and decide
whether any *remote* git operations (push, PR) in this surface go through it, versus local git
operations which are a different concern. Local diff/stage/commit/branch is **local git**, not
GitHub — keep those two axes separate in the spec.

## Open decisions to resolve with Destin (brainstorm these)

1. **What "version tracking" means here.** Two distinct systems could be meant, and the spec must
   say which (or how they relate):
   - **git history** — commits, `git log`, diff-against-a-past-commit. The developer-facing one.
   - **the artifact sidecar `versions[]` system** (`main/artifacts/artifact-store.ts`) — already
     records a per-file edit-event history in `.youcoded/artifacts.json`, independent of git. It has
     **two open bugs** (ROADMAP `#artifacts`): `versions[]` grows unbounded and rewrites the whole
     sidecar on every save; and concurrent sidecar *creation* can clobber a record (CAS off on the
     create path). If "version tracking" leans on this system, those bugs are in-scope prerequisites.
   Get Destin to say whether he wants git-history review, artifact-version review, or both unified.
2. **git-shell vs a JS git library.** `git-transport.ts` already shells to `git` with a controlled
   per-invocation env (`GIT_DIR`/`GIT_WORK_TREE`). Reusing that pattern is the low-risk path; a
   library (isomorphic-git) avoids a `git` binary dependency but reimplements status/diff. Decide
   explicitly — and check what `git-transport.ts` already gives you.
3. **3-surface parity story.** Local git needs a shell/filesystem the remote web client and Android
   WebView don't have. Follow the search precedent (#205): **desktop-first with an honest
   `remote-unsupported` notice + a Kotlin stub**, not a divergent reimplementation. Confirm this is
   acceptable rather than assuming it.
4. **Scope of the MVP.** The ROADMAP names diff-vs-HEAD, stage, commit, branch. Recommend speccing
   the diff/review half first (read-only trust-building — the core anxiety) and staging/commit second
   (mutating the tree — higher stakes, touches the write-guard question below).

## Constraints that must survive

- **write-guard interplay:** `artifacts:save` already bypasses write-guard in both directions
  (ROADMAP `#hooks` bug). A git surface that writes the working tree (discard/checkout/stage) adds
  more non-hooked write paths — factor the write-guard question in rather than discovering it later.
- **Live-app-safety:** dev-instance verification only; the final "does the review flow feel right"
  pass is Destin's eyeball, not a scripted CDP rig. DOM-level assertions (diff rows correct, jump-to-
  line lands, commit fires) should be unit-pinned — `build-menu.test.tsx` / the artifact-store tests
  are the precedent.
- **Error strings** follow `docs/error-message-standards.md` — a failed `git commit`/`git checkout`
  surfaces the real stderr, never a guessed cause.

## First actions this session

1. Read `main/sync-spaces/git-transport.ts` (the existing git-invocation pattern + env contract),
   `ToolBody.tsx:318` (how per-tool-call diffs render today), and the shipped `github-client` from
   the sync overhaul.
2. Read `main/artifacts/artifact-store.ts` to understand the sidecar `versions[]` system and its two
   open bugs — needed to answer open-decision #1.
3. Confirm the Tier 1 substrate above still matches master (`revealLine`, jsdiff import, the chokidar
   watcher, the D5 boundary).
4. Run the **brainstorming skill** with Destin on the four open decisions.

## Deliverables

1. A **spec** at `docs/active/specs/2026-07-22-git-surface.md` (`status: draft`) — the review/diff
   model, the mutating-operations model, the version-tracking decision, 3-surface story, and MVP cut.
2. An **implementation plan** (`docs/active/plans/…`, writing-plans granularity) once approved.

Recommended (Destin, 2026-07-20): **jump this ahead of editor-tabs and the file-tree** — those are
convenience; this is the differentiator. Tier 1 has now shipped, so the "once Tier 1 ships"
precondition is met.
