# android-only — the Android app
Filing test: is this about the Android app itself — its own code, its packaging, or the ways
the phone differs from desktop? Yes — here. Not here: shared code where the phone is just
where it shows — file that in the shared area with android as seen-on. Until the rebuild
lands, a new Android-only finding goes into the audit report's appendix, not a new item here.

- [ ] Rebuild the Android app into a premium, complete mobile equivalent of desktop: the same
      built-in assistant, local models marked "not available on this device", updates and
      notifications that arrive, sharing into the app, real file access, touch-first input, and a
      Google Play listing instead of sideloading. Design-first: a rethought phone default (quick
      dispatch and search) with the full desktop-narrow UI still reachable. Since 2026-10-14 a
      clean rebuild (P1–P6): the phone runs the desktop's own backend headless inside the app,
      the old Kotlin app is deleted rather than migrated, and the newest Claude Code replaces the
      frozen 2.1.112. A0 phone experiments passed inside a real app sandbox on 2026-10-14.
      Destin 2026-10-14: "nobody is using the app rn … i don't want to build any intermediate
      fixes that we know we will rebuild later." Next: P1, the headless backend (desktop code).
      `android` `in-flight` `P2` `checked 2026-10-14` → docs/active/plans/2026-10-14-android-clean-rebuild-plan.md
