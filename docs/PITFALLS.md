# Pitfalls & Architectural Invariants

Every item here is a lesson learned the hard way or a constraint that's invisible from reading code alone. Violating these silently breaks things.

## Releases

- **Bump `versionCode` AND `versionName` in `app/build.gradle.kts` BEFORE tagging.** Play Store requires `versionCode` to be monotonically increasing; CI cannot derive it from the tag.
- **Desktop version is from the git tag**, not `package.json`. CI patches `package.json` during build.
- **Auto-tag for `youcoded-core` triggers on `plugin.json` version changes** on master. Bump the plugin's `plugin.json` `version` and `.github/workflows/auto-tag.yml` creates a `vX.Y.Z` tag automatically. There is no separate layer-level `plugin.json` — the plugin has a single manifest.
- **Release skill (`youcoded-admin`) orchestrates multi-repo coordination** across the app, `youcoded-core`, and admin — see `youcoded-admin/skills/release/SKILL.md` for the current orchestration.
- **v2.3.0 lessons**: auto-tag was fragile, hooks were untested, spec gaps existed, protocol parity blind spots broke cross-platform features. See memory `project_release_lessons_2_3_0`.

## Documentation Drift

- **These pitfalls/invariants age with the code.** Code changes but docs don't always follow. Run `/audit` periodically (or before releases) to verify every claim against current source. The audit produces concrete fix instructions for each drift it finds.
- **Add entries to `docs/knowledge-debt.md`** when you notice drift mid-session but can't fix it immediately. The session-start hook surfaces a reminder when entries exist.
- **Update `last_verified` frontmatter** on rules and docs after confirming they still match code. Stale-detection uses this date.

## Working With Destin

- **"Merge" means merge AND push to origin.** Don't stop at a local merge.
- **Always sync before working.** `git fetch origin && git pull origin master` in every repo you'll touch. Prevents working against stale state.
- **Annotate non-trivial code edits with a WHY comment.** Destin is a non-developer and relies on comments to understand what code does and why it was changed. Example: `// Fix: prevent stale tool IDs from coloring the status dot`.
- **Verify fix consequences before shipping.** Batch fixes — especially network/permission changes — can silently break cross-cutting features. Check both platforms.
