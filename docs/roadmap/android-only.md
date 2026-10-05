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
      11 from other areas) was folded into the report's appendix on 2026-09-10, and on 2026-09-16
      the "phone is a shrunk desktop" ask joined it: a rethought default for the phone built
      around quick dispatch and search — quick chips, session switching, resume/history — with
      the full desktop-narrow UI still reachable rather than removed, design-first (its own
      workbench mockup round before any build). Destin decided
      the same day (report §8): built-in assistant first, Play prioritized, the full desktop
      file view, remove the old restore wizard, harness before phone basics. Step 2 (honest
      builds: versions, notification permission, clean refusals) and the restore-wizard deletion
      merged 2026-09-10 (youcoded#468); next is step 4, the harness runtime on the phone —
      start at docs/active/handoffs/2026-09-10-android-rebuild-START-HERE.md. The ~3,150 lines
      of Kotlin that re-implement desktop logic (the 2026-09-16 simplification audit's D9:
      transcript watcher, skill provider, plugin installer, config store, session browser) fold
      into this rebuild, and simplification phase 4 (one channel table for the desktop window
      and the phone) goes before it, not inside it — decided 2026-09-18. Google Play's
      downloaded-code rule must shape the rebuild's design: the setup step that downloads
      Termux programs would likely be refused, so plan to ship them inside the app (report
      appendix, "Found after the consolidation", 2026-09-23)
      `android` `in-flight` `checked 2026-09-23` → docs/active/investigations/2026-09-10-android-parity-audit.md
