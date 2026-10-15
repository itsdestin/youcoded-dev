---
paths:
  - "**/app/**"
  - "**/desktop/src/main/headless/**"
last_verified: 2026-10-14
verify:
  - path: youcoded/app/runtime/ycshim.c
    contains: "io_uring_setup"
  - path: youcoded/app/runtime/build-runtime.sh
  - path: youcoded/app/src/main/kotlin/com/youcoded/app/bridge/HostJsBridge.kt
    contains: "val TYPES"
  - test: youcoded/desktop/tests/android-host-channels.test.ts
---
# Android Runtime Rules

The phone runs the **desktop's own backend** headless (`desktop/src/main/headless/`) in a bundled Node; Kotlin is a
thin shell. **Full context: `youcoded/docs/android-runtime.md` — read before non-trivial changes.**

## Never port logic to Kotlin
- **A feature is built once, in the desktop backend.** The phone gets it automatically. Kotlin holds only what needs
  the phone itself: the window, the foreground service, the page's phone-only calls (`HostJsBridge.kt`), the backend's
  calls to the phone (`HostSocketServer.kt`). **Why:** the old app's 30k lines of Kotlin copies were where the
  phone bugs lived (deleted 2026-10-14).
- **A new phone-only page call** is a type in BOTH `invokeAndroidHost(...)` (shim) and `HostJsBridge.TYPES` + its
  `when` arm. **Guard:** `desktop/tests/android-host-channels.test.ts`.
- **`headless-boot.ts` mirrors `main.ts`'s backend half.** A service main.ts starts that a phone should have
  belongs in both. **Guard:** none — candidate.

## Bundled programs (`app/runtime/`)
- **Every executable ships as `jniLibs/arm64-v8a/lib<name>.so`** (Android executes nothing in the data folder). A new
  program is a `RUNTIME_EXECUTABLES` entry in `pins.env`; it gets the patched interpreter, RUNPATH and the shim.
- **Never drop `ycshim.c` from a program that spawns or runs Node:** without it libuv's io_uring probe is killed by
  seccomp and `#!` scripts / `/bin/sh` fail. Claude Code (Bun) is the one exception: interpreter only.
- **Name lookups need `YOUCODED_ETC`** (patched musl + shim); TLS needs `SSL_CERT_FILE` / `GIT_SSL_CAINFO`. The
  environment lives in `RuntimeInstaller.environment()`.
- **Bumping a pin is a phone test**, not a CI test: every pin in `pins.env` was run on a real phone.

## Build-type parity (R8) — guard: `./gradlew :app:assembleReleaseTest` (CI: `android-ci.yml`)
- **Release enables R8 minification; debug skips it.** `HostJsBridge`'s `@JavascriptInterface` method must keep its
  name (AGP keeps annotated members; don't add string-based reflection). Run `assembleReleaseTest` before tagging.
