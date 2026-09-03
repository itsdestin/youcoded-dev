---
date: 2026-09-01
status: active
type: investigation
topic: Misleading error messages — the app-wide audit, and the two known cases waiting on it
---

# Misleading error messages — audit + replacement

The standard is `docs/error-message-standards.md`: every user-facing error is either
*specific and accurate* (the real detail — stderr, caught exception, path/port) or *general
and non-committal* paired with **Report bug** and **Diagnose with Claude**. `<ErrorState>`
(`youcoded/desktop/src/renderer/components/ui/states.tsx`) renders both shapes
(`mode="recoverable"` / `mode="general"`).

## What is done, what is open

- The component exists and is adopted where an error surface was rebuilt anyway — 2026-09-01
  count: 10 `<ErrorState` call sites across MarketplaceScreen, SpecialistsSection,
  PermissionsSection, SessionPreviewPane and SettingsPanel (2 on 2026-08-12).
- The sync/GitHub family was done ahead of the audit (youcoded #201–#203, 2026-07-22).
- **Open:** the audit itself — every user-facing throw/toast/banner/IPC error string on
  desktop, Android and the Worker, deciding recoverable-vs-general **per site** as you go. That
  per-site decision is the audit's core call and is why UI-consistency change 33 was held rather
  than shipped as a blanket choice.

## Two known instances waiting on the audit (from the youcoded #297 review)

1. **Offline is unreachable on desktop.** Both `RatingSubmitModal` handlers branch on a
   `TypeError` to say "offline", but the main-process `wrap()` helper converts network failures
   into an `{ ok: false, status: 0 }` result instead of throwing — so a real offline install
   surfaces as the fabricated "Install this plugin first to rate it."
   <!-- claim: {"path": "youcoded/desktop/src/main/handler-utils.ts", "contains": "return \\{ ok: false, status: 0, message \\}"} -->
2. **Electron's prefix leaks.** `Error invoking remote method '…':` is passed through into
   every model-row inline error app-wide (no site strips it — `rg` finds no handling of that
   string in `desktop/src` on 2026-09-01).

## History
Filed 2026-07-15 (v1.3.1 followup, from knowledge-debt 2026-07-14). Instances 1–2 merged in
from the 2026-07-19 "five latent bugs" item (its #297 review findings, 2026-08-12).
