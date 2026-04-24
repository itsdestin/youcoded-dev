# ADR 003: Multi-Backend Sync (Drive + GitHub + iCloud)

**Status:** Accepted (owner moved to the app in 2026-04)
**Date:** Pre-2026
**Update:** The decision still stands — YouCoded supports Drive + GitHub + iCloud concurrently. What changed is *where* the logic lives. Originally implemented as a `sync` skill inside `youcoded-core`, the sync engine moved into the app (`youcoded/desktop/src/main/sync-service.ts` + Android `SyncService.kt`) and the plugin-level skill was retired alongside Phase 3's flatten. The backend choice and `config.json` / `config.local.json` split described below are unchanged.

## Context

The app must sync personal data (journal, encyclopedia, config, skills) across the user's devices. Users have different trust models, existing tool investments, and technical comfort levels. Enforcing a single backend would alienate large segments.

## Decision

Support three sync backends simultaneously:
- **Google Drive** — human-browsable cloud archive, no Git knowledge required
- **GitHub** — version-controlled, ideal for power users who want history/diffs
- **iCloud** — Mac users who don't want to set up Drive/GitHub

Users can run one or more backends concurrently. Config is split into portable (`config.json`, synced) and machine-specific (`config.local.json`, never synced).

## Alternatives Considered

- **Single backend (GitHub only)** — excludes users who don't know Git. Destin's target audience is non-developers.
- **Single backend (Drive only)** — no version history, weaker for debugging conflicts
- **Custom sync server** — unreasonable operational burden for a non-developer maintainer

## Consequences

**Good:**
- Users pick the backend they already trust
- Redundancy — running multiple backends protects against single-backend failures
- GitHub users get implicit version history for free
- No centralized server costs

**Bad:**
- Sync code paths multiply — every sync operation must handle all three backends
- Reconciling conflicts across backends is complex (mitigated by rarely editing the same data on multiple devices simultaneously)
- Setup flow must detect which backends are available and guide users through each

Historical note: the original implementation in `session-start.sh` grew to ~44KB partly because of backend handling. The app-side rewrite (`sync-service.ts` + Kotlin `SyncService.kt`) is where that logic lives now.
