---
id: 247
title: Remove the ReleaseTest Android build from the automatic checks (the Dev copy is shrunk like the release now)
stage: explore
tags: dev-workspace, android
branch: 247-remove-the-releasetest-android-build
finish: One Android build type besides release in CI and Gradle, or a written reason to keep an exact-release compile check; docs and .claude/rules/android-runtime.md match.
created: 2026-11-10
why: Destin, 2026-11-10: 'two builds is weird and confusing', he wants a single way to test the app. Since card #213's branch the Dev copy (assembleDebug) runs R8 with the release rules and android-test-build.yml hands over only that file. android-ci.yml, scripts/ci-inputs.mjs, ci-gradle-outcomes.mjs, ci-android-producers.gradle, desktop/tests/desktop-ci.test.ts and app/build.gradle.kts still carry a releaseTest build type and scope (about 80 references), now a near-duplicate of debug. Overlaps the test-infrastructure rethink (docs/active/handoffs/2026-11-01-test-infrastructure-rethink.md): do it with or after that, and only once #213 has merged. Decide first whether one exact-release (non-debuggable) build should stay in CI as a compile check.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
