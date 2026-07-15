---
title: Android-Desktop Divergence Audit
date: 2026-04-27
status: shipped
---

# Executive Summary

Audit of Android app vs Desktop across ~140 IPC handlers, 4 concurrency models, 2 file-path hierarchies found 47 divergences, 14 high-risk. Top priorities: (1) Activity process-death loses sessions, (2) PTY 600ms timing fragile vs desktop echo-driven, (3) RemoteSnapshotExporter missing, (4) model preference path split, (5) plugin idempotency unverified on desktop.

# High-Risk Items (P0-P1, 8-12h each)

## A1: Process Death Hydration Gap
No recovery path when OS kills app. Sessions lost on memory reclaim. Fix: persist sessions, deserialize on onCreate, hydrate via chat:hydrate. Effort: 8-12h.

## B1: PTY Write 600ms Timing
Android hardcodes 600ms gap before Enter. If Claude slow (>600ms), input loses bytes. Desktop uses echo-driven path. Fix: port echo logic. Effort: 2-3h.

## J1: RemoteSnapshotExporter Missing
Remote browsers on Android start blank. Desktop exports ChatState on connect. Fix: implement SessionService ChatState serialization. Effort: 4-6h.

## F2: Permission Mode Regex
Parses Claude status bar. If Claude v2.2 changes format, breaks silently. Fix: test fixture + pre-release checklist. Effort: 1-2h.

## G1: Model Preference Path Divergence
Android: ~/.claude-mobile/model-preference.json. Desktop: ~/.claude/youcoded-config/model-preference.json. Each platform independent. Fix: unify or sync. Effort: 2-3h.

## I1: Plugin Dual-Path Check
Android checks both .claude-plugin/plugin.json and root plugin.json. Desktop unverified. May re-install on desktop. Fix: audit + dual-path. Effort: 1-2h.

# Medium-Risk Items (P1-P2, 1-3h each)

- A3: Activity reconnect race (WebSocket handshake)
- J2: Attention broadcast lag (event-driven + timer)
- D1: Permission mode update lag (event-driven broadcast)
- C2: Missing handlers matrix (IPC parity doc)
- Others: transcript regex versioning, session ownership audit, plugin list sync gate

# Parity Confirmed (Low-Risk)

Announcement fetching, model default, bundled plugins, session broadcasts, sync codes, theme reload, remote auth, clipboard shape, status timer, transcript fixtures, hook IPC.

# Recommendation

Start with Process Death (A1) and PTY Echo (B1) as P0 fixes—both are silent failures on common paths. RemoteSnapshotExporter (J1) is P1. Generate IPC parity matrix and cross-platform test suite as preventative measures.

