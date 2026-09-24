---
status: active
date: 2026-09-24
related: docs/active/plans/2026-09-21-ui-ux-consistency-audit.md
---

# UI element review — Destin's decisions

The new design guide is written from this file. Each row is one submitted answer; the
source is `<deck key>#<step id>`. Research behind each question: `inventory/`.

| Topic | Decision | Open follow-up | Source |
|---|---|---|---|
| Full-screen titles | Every full screen names itself in the window's top strip, **centered, small, with the screen's icon** (Pages style). Marketplace and Library move to it. | — | `ui-element-review-headers#H-1` |
| Popup and side-panel titles | Every popup and side panel uses the **shared popup title** (16px semibold, one line, tapered line under it, close button right). Settings, Resume, Session Files, Add a project and Games conform. | — | `ui-element-review-headers#H-2` |
| Section labels | Undecided. Destin: simplify to a **standard large / medium / small (1st–2nd–3rd level) heading ladder**; could not judge six real styles in the abstract. | Show a proposed three-level ladder applied to real screens. | `ui-element-review-headers#H-3` (other) |
| Counts beside a label or tab | **Faint smaller number after the word** (Files 17, All 42 — one style). **Bold number, grey word** (17 files) stays for stat lines. Brackets and number chips are not standard. | Number chip on the header Session Files button: decide with status/badges. | `ui-element-review-headers#H-4` |
| Way back to chat | **Filled button** on every full screen, reading **"Esc · Back to chat"** (key on the left). | — | `ui-element-review-headers#H-5` |
