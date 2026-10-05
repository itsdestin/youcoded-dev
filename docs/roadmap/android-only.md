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
      file view, remove the old restore wizard, harness before phone basics. Steps 2–3 (honest
      builds: versions, notification permission, clean refusals) and the restore-wizard deletion
      merged 2026-09-10 (youcoded#468). Since 2026-09-24 the rebuild runs as phases A0–A6: the
      phone runs the computer's own assistant core instead of about 10,000 lines of Kotlin
      copies, and every program ships inside the app because Google Play refuses apps that
      download programs after install (today's setup does). A0 (phone experiments) and A1 (Play
      packaging) can start now; the assistant on the phone (A2, the old "step 4") was waiting for the
      remote-access refactor to move every feature into one list; that refactor (R0–R6) is
      complete and ready to merge as feat/one-core (2026-10-04), so A2 is unblocked once it
      lands. Start at the one-core START-HERE
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#3): postponed — "1.3.2+. rebuild will be tied to google play/iphone listings."
      `android` `in-flight` `checked 2026-10-04` `v1.3.2` → docs/active/handoffs/2026-09-24-one-core-START-HERE.md

