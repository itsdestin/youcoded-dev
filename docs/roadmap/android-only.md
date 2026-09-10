# android-only — the Android app
Filing test: is this about the Android app itself — its own code, its packaging, or the ways
the phone differs from desktop? Yes — here. Not here: shared code where the phone is just
where it shows — file that in the shared area with android as seen-on. Until the rebuild
lands, a new Android-only finding goes into the audit report's appendix, not a new item here.

- [ ] Rebuild the Android app into a premium, complete mobile equivalent of desktop: the same
      built-in assistant (ChatGPT, OpenRouter), local models cleanly marked "not available on this
      device", Claude Code unfrozen or scoped as legacy, updates and notifications that actually
      arrive, sharing into the app, real file access, touch-first input, modern Android polish,
      and a Google Play listing instead of sideloading. Every earlier Android item (19 here plus
      11 from other areas) was folded into the report's appendix on 2026-09-10. Destin decided
      the same day (report §8): built-in assistant first, Play prioritized, the full desktop
      file view, remove the old restore wizard, harness before phone basics. Step 2 (honest
      builds: versions, notification permission, clean refusals) and the restore-wizard deletion
      merged 2026-09-10 (youcoded#468); next is step 4, the harness runtime on the phone —
      start at docs/active/handoffs/2026-09-10-android-rebuild-START-HERE.md
      `android` `in-flight` `checked 2026-09-10` → docs/active/investigations/2026-09-10-android-parity-audit.md
