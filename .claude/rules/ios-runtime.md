---
paths:
  - "**/ios/**"
  - "**/desktop/src/main/headless/ios-*.ts"
last_verified: 2026-11-25
verify:
  - path: youcoded/ios/YouCoded/BackendRunner.swift
    contains: "node_start"
  - path: youcoded/ios/runtime/build-backend.mjs
    contains: "__YC_UNICODE_TABLES__"
  - path: youcoded/desktop/src/main/headless/host-bridge.ts
    contains: "export function canRunPrograms"
  - path: youcoded/ios/YouCoded/HostJsBridge.swift
    contains: "static let types"
  - test: youcoded/desktop/tests/ios-shell.test.ts
  - test: youcoded/desktop/tests/ios-fetch.test.ts
---
# iPhone Runtime Rules

The iPhone runs the **desktop's own backend** in-process (nodejs-mobile, Node 18, no JIT, no ICU) and shows the
desktop's own page; Swift is a thin shell. Same design as Android — `android-runtime.md` applies too.
**Full context: `youcoded/docs/ios-runtime.md` — read before non-trivial changes.**

## Never port logic to Swift
- **A feature is built once, in the desktop backend.** Swift holds only what needs the phone itself: the window,
  starting Node, the page's phone-only calls (`HostJsBridge.swift`), the backend's calls to the phone
  (`HostSocketServer.swift` → `RootViewController.handleHostCall`). **Why:** the same reason as Kotlin.
- **A new phone-only page call** is a type in `invokeAndroidHost(...)` (shim), `HostJsBridge.kt` AND
  `HostJsBridge.swift` (`types` + its `case`). **Guard:** `desktop/tests/ios-shell.test.ts` (also pins the list
  equal to Android's, and every backend→phone method handled).

## An iPhone cannot start a program
- **"Does this need a separate program?" has ONE answer:** `canRunPrograms()` in the backend
  (`headless/host-bridge.ts`), `getCapabilities().programs` on the page. Never `process.platform === 'ios'`, never
  a new guess. A feature that needs a program is not offered there and says why (Claude Code: `not-possible` →
  "Needs a computer"). **Guard:** `ios-shell.test.ts` → "what an iPhone can do".
- **Never call `process.exit` or let an error go uncaught on a path the phone runs:** the backend shares the app's
  process. `installInProcessGuards` (ios-compat.ts) turns an exit into the "close and reopen" screen. **Guard:** none — candidate.

## The iPhone's Node is old and bare
- **No WebAssembly** (JIT off): never rely on the built-in `fetch` internals; `ios-fetch.ts` replaces `fetch`.
  A dependency that needs WebAssembly cannot run on the phone. **Guard:** `ios-fetch.test.ts`.
- **No ICU:** `Intl` does not exist and `\p{…}` in a regular expression is a syntax error. The build bakes in the
  tables for every `\p{Name}` the bundle names (`build-backend.mjs`); do not add `Intl.*` to backend code a phone
  runs. **Guard:** `ios-compat.test.ts`; the simulator job (a missing table stops the backend at launch).
- **Node 18 library gaps** are filled in `ios-compat.ts`, "only if missing". Using a newer Node API in backend code
  a phone runs means adding its fill there. **Guard:** the simulator job.
- **A new worker thread** (`new Worker(path.join(__dirname, …))`) is a `WORKER_ENTRIES` line in
  `build-backend.mjs`. **Guard:** `ios-shell.test.ts` → "builds every worker thread".

## Build
- **The Xcode project is generated** from `ios/project.yml` by `ios/build-resources.sh` (xcodegen); never commit a
  `.xcodeproj`. Node for iOS is downloaded by checksum (`ios/runtime/pins.env`); bumping it is a phone test.
- **Only a Mac builds the app.** Off a Mac, CI is the compiler: `ios-ci.yml` builds, runs `ios/YouCodedTests` and
  starts the app in a simulator, uploading screenshots and `backend.log`. The backend bundle itself runs on any
  Node 18 (`--jitless`) — recipe in the depth doc.
