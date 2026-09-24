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
| Heading ladder | Three levels. **Large:** 18px medium for big groups on full screens (Destin's picks, Favorites). **Popup/panel title:** the shared popup title (above). **Small section labels:** 12px medium grey, **normal case — no spaced-out capitals** (VOLUME → Volume). Marketplace's bigger caps and the 9/11px variants fold into it. | Destin: "maybe add underlines? for some headers, where it makes sense" (long-form sections such as About) — show an underlined variant before writing it into the guide. | `ui-element-review-headers#H-3`; `ui-element-review-labels#L-1…L-4` (all "No capitals"; note on `#L-2`) |
| Counts beside a label or tab | **Faint smaller number after the word** (Files 17, All 42 — one style). **Bold number, grey word** (17 files) stays for stat lines. Brackets and number chips are not standard. | Number chip on the header Session Files button: decide with status/badges. | `ui-element-review-headers#H-4` |
| Way back to chat | **Filled button** on every full screen, reading **"Esc · Back to chat"** (key on the left). | — | `ui-element-review-headers#H-5` |
| Closing popups and side panels | Every popup and side panel closes with the **drawn ✕ button** (28px, soft hover square), top right. Games' × letter and Marketplace's "Esc · Close" text conform. | — | `ui-element-review-buttons#B-1` |
| Control shape follows the theme | **Buttons, tabs, filters and search boxes take their corner roundness from the theme's shape setting and move with the rest of the app's roundness.** Nothing keeps a hard-coded pill. On Projects and Marketplace, pills looked best. | — | `ui-element-review-button-shapes#P-1/P-2` (pill), `#P-3` ("should adjust dynamically with the other app elements for roundness"), `#P-5` ("should take theme radius settings"), `#P-4/P-6/P-7` (same) |
| "Pick one" controls | Folded into the shape rule above; the earlier B-3 deck repeated one style. | Revisit only if a distinct style is still wanted after the roundness level is chosen. | `ui-element-review-buttons#B-3` (other) |
| Secondary buttons | Undecided; both comparison proposals showed Cancel outlined and nobody objected, but not yet asked directly. | Confirm with the heading/cards comparisons. | `ui-element-review-buttons#B-4` (other) |
| Default roundness level | Built-in themes use **Round**: buttons, tabs, filters and search boxes 14px; cards and popups 18–24px. Community themes set their own level through the theme's shape setting. | — | `ui-element-review-roundness#R-1` |
| Card look | **Raised everywhere**: panel color, thin border and a shadow, on Round corners, with a 12px gap between cards. The shadow sits **between today's heavy Marketplace shadow and the soft proposal** (Destin: "somewhere between today and raised" on Library, Marketplace, Project Files). | Tune the medium shadow once, shown in the final whole-guide review. | `ui-element-review-cards#K-4…K-7` (raised); `#K-1…K-3` (between today and raised) |
| Menu rows | **Plain rows** in menus (right-click and similar): no box, no line; hover highlights. | — | `ui-element-review-lists#R-2` |
| List rows by job | **Settings-style lists** (each row opens or changes a setting): **boxed rows** — each row its own soft tinted box with a small gap. **Pick-one menus and switchers** (session list, right-click menu): **plain rows** — no box, no line, hover highlights. Both match today, so this becomes the rule. | — | `ui-element-review-lists-2#R-5` (boxed), `#R-6` (plain); `ui-element-review-lists#R-2` (plain) |
| Status labels | A **small tinted pill in the label's color, normal case** ("Installed"). A live status (a session Working / Inactive) also carries its **colored dot inside the pill** — today's session-list look. No capitals, no bare grey words. | — | `ui-element-review-status#S-1` ("today for the session switcher… tinted pill looks good for installed") |
| Warnings and notices | **Tinted box** with a matching border — today's Callout. One style for every passive info, warning and danger notice. | — | `ui-element-review-status#W-1` |
