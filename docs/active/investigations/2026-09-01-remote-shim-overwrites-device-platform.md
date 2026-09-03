---
date: 2026-09-01
status: active
type: investigation
topic: a phone on remote access reports the HOST's platform, so touch adaptations are off
---

# `isTouchDevice()` is false on remote browsers, including phones

**Symptom.** A phone browser connected to a desktop over remote access behaves like a
desktop in the terminal view — touch adaptations off, wrong terminal byte path — so the
soft keyboard and scrolling misbehave.

**Mechanism.** `youcoded/desktop/src/main/remote-server.ts` answers auth with
`{ type: 'auth:ok', token, platform: 'desktop' }` (two send sites). The shim
(`youcoded/desktop/src/renderer/remote-shim.ts`, `auth:ok` branch) copies that value
into `window.__PLATFORM__` unless `preservePlatform` is set — a flag that exists only for
the Android-app-connecting-to-desktop case.
<!-- claim: {"path": "youcoded/desktop/src/renderer/remote-shim.ts", "contains": "\\(window as any\\)\\.__PLATFORM__ = platform;"} -->

So a phone browser reports `'desktop'` — a value not even in the `Platform` union
(`platform.ts`: `'electron' | 'android' | 'browser'`) — and `isTouchDevice()`
(`'android' || 'browser'`) is false. Call sites today (2026-09-01): two in
`TerminalView.tsx` (~123 and ~532), the second being `useRawBytes`, which selects the
terminal byte path.

**Root cause in one line:** the shim overwrites a **device** fact with a **host** fact.

**Fix shape.** Never let `auth:ok` set `__PLATFORM__` on a plain browser client — keep
the shim's own `'browser'` default (the `preservePlatform` mechanism already shows the
shape), or feature-detect `(pointer: coarse)` as the idle-blur fix in `2f8132cf` had to.

**History.** Added 2026-07-20 (found fixing soft-keyboard behaviour on Chrome/Android).
Re-checked against `master` 2026-09-01: unchanged.
