---
status: active
date: 2026-09-11
feature: model-picker-tags (docs/active/design/2026-09-11-model-picker-tags/)
---

# Model-list tags — what the backend can build on

Read-only map taken while the round-1 mockups were with the UX tester. Paths are
relative to `youcoded/desktop/src/` unless prefixed. Input for the technical design;
not a design.

## Decided before this map (questions decks + chat, 2026-09-11)

Scores: Epoch AI Capabilities Index (CC BY 4.0) rescaled 0-100 (0 = index 100, 100 = top
model); hover adds DeepSWE, GPQA Diamond, SimpleQA Verified (all from Epoch's
`benchmark_data.zip`) and LMArena `text/instruction_following` rank (CC BY 4.0). Artificial
Analysis rejected: its Data Platform Terms v1.1 (2026-08-19) bar customer-facing embedding
and model-selection guidance without written consent. A scheduled job builds ONE small
JSON file a day; the app downloads and caches it; value is computed against catalog prices.

## Fetch pattern to copy

`main/models/curated-catalog.ts` is the closest existing feed: raw GitHub JSON, 24h TTL
(:12), 10s timeout, `schemaVersion` check and bad-row dropping (:17-28), order fresh cache →
network → last cache → built-in copy (:45-62), cache in userData (`model-manager.ts:77`).
Marketplace (`skill-provider.ts:83-96`, ETag + Worker first) and announcements
(`announcement-service.ts`, atomic write) are the other two shapes.

## Where the daily job can run

- **The marketplace Worker already has a daily cron** (`wecoded-marketplace/worker/wrangler.toml:15-16`,
  `"17 6 * * *"`) whose `scheduled()` only prunes today (`worker/src/index.ts:142-147`), plus
  KV `CATALOG_KV` (:70-73), D1, the `api.youcoded.ai` domain and an ETag-serving `/catalog`
  route to copy (`worker/src/catalog/routes.ts:347-356`). Deploys by CI on master.
- **GitHub scheduled workflows go silent after 60 days of repo inactivity** — the one existing
  schedule, `catalog-ingest.yml` (hourly, posts to the Worker), documents this (:35-41). A
  committed-JSON-by-cron design freezes without failing. Weigh this against the Worker cron.
- Stale doc found: `docs/registries.md:3` says neither registry rebuilds on a schedule;
  `catalog-ingest.yml` contradicts it.

## A new `models:facts` channel on every surface

Copy `models:memory-check`: `shared/types.ts:2120`, `main/preload.ts:437,1628`,
`main/ipc-handlers.ts:3514`, `renderer/remote-shim.ts:2307-2333`, `main/remote-server.ts:1950-1960`,
Android `SessionService.kt` not-implemented list (:4255, reply :4290-4292 — NOT the six-channel
"unsupported" arm, `ipc-channels.test.ts:1154-1200`). Then make `facts` non-optional in
`renderer/hooks/useIpc.ts` and delete the `models.facts` row from `dev/workbench/mock-only.ts`.
Guards: `ipc-channels.test.ts`, `shim-parity.test.ts`, `workbench-mock-contract.test.ts`,
`workbench-channels.test.ts`, `remote-shim-unsupported.test.ts`, `android-honest-build.test.ts`.
Android has no `provider:catalog` or any `models:*` channel today (`SessionService.kt:4178,4241-4256`),
so desktop + remote browser only, as decided (Q-10).

## Prices and matching

`main/providers/model-catalog.ts` caches raw OpenRouter + models.dev responses whole in
`provider-catalog-cache.json` (:127-133), so `hugging_face_id` / `canonical_slug` are readable in
main without a new fetch even though `CatalogModel` drops them (:148-209). Direct-key providers
price from models.dev (:22, :269-270). No price: ChatGPT plan (:284-287), local rows, custom
endpoints (:290).

## Gaps the design must close

1. **Claude plan alias → model.** Nothing maps `sonnet` to Claude Sonnet 5
   (`shared/model-ids.ts:53-77` goes id → alias only). Concrete ids appear only after a turn
   (transcript `message.model`). Options: the daily file carries the alias map, or the app
   remembers the last `message.model` per family.
2. **Per-model speed is never saved.** Measured per turn in `main/harness/harness-session.ts:2563,2630`
   (tokens/s) and engine-wide in memory (`engine/engine-manager.ts:534-543`). The only per-model
   store, `engine.models` in `~/.youcoded/config.json`, also drives preset sections
   (`engine/model-presets.ts:372`) — use a separate cache file instead. Tags show WORDS a second;
   convert once, in one place.
3. **Speed estimate inputs.** GPU (`models/gpu-detector.ts:356`), memory pool
   (`models/fit-estimator.ts:284,345`), file size; the GGUF header reader
   (`models/gguf-header.ts:158-227`) does NOT read expert count, parameter count or `general.name`.
   Active parameters exist only in names ("26B-A4B").
4. **Downloaded copy → original model.** The HF repo is recorded (`DownloadManifest.repo`,
   `models/download-manifest.ts:24-30`) but it is the quantizer's repo (`unsloth/…-GGUF`); nothing
   reads `base_model` (`hf-client.ts` calls search and file tree only). Local catalog rows don't
   carry `repo` (`engine-manager.ts:1400-1410`). Ollama / LM Studio models have no catalog.
