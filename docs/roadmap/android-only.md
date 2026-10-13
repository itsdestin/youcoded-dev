# android-only — the Android app
Filing test: is this about the Android app itself — its own code, its packaging, or the ways
the phone differs from desktop? Yes — here. Not here: shared code where the phone is just
where it shows — file that in the shared area with android as seen-on. Until the rebuild
lands, a new Android-only finding goes into the audit report's appendix, not a new item here.

- [ ] Rebuild the Android app into a premium, complete mobile equivalent of desktop: the same
      built-in assistant, local models marked "not available on this device", updates and
      notifications that arrive, sharing into the app, real file access, touch-first input, and a
      Google Play listing instead of sideloading. Design-first: a rethought phone default (quick
      dispatch and search) with the full desktop-narrow UI still reachable. Runs as phases A0–A6
      since 2026-09-24: the phone runs the computer's own assistant core and every program ships
      inside the app (Google Play refuses downloads after install). Unblocked now: A0 (phone
      experiments) and A1 (Play packaging); A2 (the assistant on the phone) follows once the
      finished remote-access refactor, feat/one-core, lands. Start at the one-core START-HERE.
      Destin 2026-10-05 triage (roadmap-triage-2026-10-05#3): postponed — "1.3.2+. rebuild will be tied to google play/iphone listings."
      `android` `in-flight` `P2` `checked 2026-10-04` `v1.3.2` → docs/active/handoffs/2026-09-24-one-core-START-HERE.md
