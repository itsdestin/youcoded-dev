---
date: 2026-09-01
status: active
type: investigation
topic: A corrupt sync repo that is also offline never self-heals, though the offline-capable repair tier exists
---

# A corrupt sync repo that is also offline never heals

**Symptom.** With a damaged sync repo (e.g. after a crash) and no network or signed-out GitHub, the Backup & Sync panel shows an auth/network error every cycle, and the repo is never repaired until the device reconnects — even though the Tier 2 repair (move aside + re-init) needs no network.

**Mechanism.** `hasRemote()` in `youcoded/desktop/src/main/sync-spaces/git-transport.ts` runs `git remote get-url origin` and returns `code === 0` with no corruption guard, so a repo damaged badly enough that git refuses to open it (zero-byte `HEAD`, truncated `config`) reads as "no remote". `engine.syncSpace` (`engine.ts`) then takes the `ensureProvisioned` branch **before** any `throwIfCorrupt`-guarded op runs. Online this is only wasted REST work — `setRemote` fails, `pull()`'s `add -A` throws `repo-corrupt`, and the heal proceeds. Offline or signed out, `ensureProvisioned` throws first ("Not connected to GitHub…"), corruption is never classified, and `repair()` never runs.

`hasRemote` still has no corruption check:
<!-- claim: {"path": "youcoded/desktop/src/main/sync-spaces/git-transport.ts", "contains": "hasRemote\\(space: SyncSpace\\): Promise<boolean> \\{\\n\\s+const r = await this\\.git\\(space, \\['remote', 'get-url', 'origin'\\]\\);\\n\\s+return r\\.code === 0;"} -->

**Fix shape.** `throwIfCorrupt` inside `hasRemote()`, or a corruption probe in `syncSpace` before the `ensureProvisioned` branch.

**History.** Added 2026-07-30 (PR #276 whole-branch review). Re-checked 2026-09-01: `hasRemote` unchanged, still open.
