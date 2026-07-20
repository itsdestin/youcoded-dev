---
status: active
created: 2026-07-19
tags: [themes, a11y, contrast]
---

# Inventory — `fg-muted` / `fg-faint` text on raised surfaces

Companion to spec §12 (`docs/active/specs/2026-07-16-ui-consistency-design-spec.md:1006-1145`)
and ROADMAP.md:81-82. Scope: `youcoded/desktop/src/renderer`.

Surfaces were traced by reading each file's container chain, not by grepping the class alone.
A site is **raised** if it or an ancestor carries `.layer-surface`, `bg-panel`, `bg-inset`,
`bg-well`, an opacity variant of those, `.settings-drawer`, `.panel-glass`, or a chat bubble root.

**TEXT** = semantic content a user must read. **DEC** = decorative (separators, rules,
disabled glyphs, chevrons, icon strokes).

## Structural facts that drive the classification

- `components/overlays/Overlay.tsx:61-74` — `OverlayPanel` renders `className={\`layer-surface ${className}\`}`. **All 45 files importing it are raised by default.**
- `components/SettingsPanel.tsx:241` — `settings-drawer` wraps the whole settings tree, so `AccountSection`, `ProvidersSection`, `LocalModelsSection`, `EngineCard`, `ThemeScreen`, `SettingsRow`, `SettingsExplainer` all inherit drawer surface.
- `components/SessionDrawer.tsx:487-488` — root is `bg-inset`; all `artifact-views/*` render on inset.
- `components/AssistantTurnBubble.tsx:362` / `ChatView.tsx:715` — `bg-inset` bubble, so `ToolCard`, `ToolBody`, `SubagentTimeline`, `UsageCard`, `PromptCard`, `CopyPicker`, `CompactingCard`, `AttentionBanner` are bubble-surface.

## Grand totals

| Area | muted TEXT | muted DEC | faint TEXT | faint DEC | total |
|---|---|---|---|---|---|
| settings | 128 | 41 | 26 | 15 | 210 |
| chat / tool-views | 78 | 21 | 6 | 13 | 118 |
| other | 54 | 6 | 13 | 6 | 79 |
| sync | 33 | 5 | 26 | 1 | 65 |
| project-view | 24 | 4 | 6 | 6 | 40 |
| marketplace | 15 | 4 | 7 | 3 | 29 |
| game | 17 | 4 | 3 | 0 | 24 |
| ui-primitives | 8 | 3 | 6 | 2 | 19 |
| statusbar | 2 | 0 | 14 | 2 | 18 |
| **TOTAL** | **359** | **88** | **107** | **48** | **602** |

- `text-fg-muted` raised: **447** (359 TEXT / 88 DEC)
- `text-fg-faint` raised: **155** (107 TEXT / 48 DEC)
- 602 of 638 file hits are raised; **36 excluded as bare canvas** (listed at the end).
- **~136 sites carry a `hover:text-*` / `group-hover:text-*` override** — the hover target needs re-checking after any token swap, not just the base.

## The 107 `fg-faint` TEXT sites are the priority

`fg-faint` on `panel` fails in **11 of 11 shipped themes**; best ratio anywhere is 2.10,
worst 1.62. It does not clear 3.0 even on `canvas`. No palette change fixes this — lifting
it to a legible ratio makes it identical to `fg-muted`. These are call-site migrations.

Densest clusters:

| Location | faint TEXT | note |
|---|---|---|
| `SyncSetupWizard.tsx` | 19 | 733, 739, 754, 783, 790, 797 are a `space-y-1` block |
| `SettingsPanel.tsx` | 11 | incl. 1296, 1304, 1313 at `text-[9px]` |
| `ThemeScreen.tsx` | 9 | **incl. 257, 273 — the reported bug** |
| `SyncPanel.tsx` | 7 | |
| `ResumeBrowser.tsx` | 6 | |
| `StatusBar.tsx` | 14 | 883-971, the `In:`/`Out:`/`Cached:`/`Hit:`/`Active:`/`Speed:` labels |

---

# SETTINGS — 210 hits

### `SettingsPanel.tsx` — muted TEXT 33 / DEC 21 · faint TEXT 11 / DEC 4

| line | className | surface | class |
|---|---|---|---|
| 166 | `text-fg-muted hover:text-fg transition-colors` | glass | DEC (✕) · hover |
| 252 | `text-fg-muted hover:text-fg-2 text-lg leading-none w-8 h-8 …` | panel | DEC (✕) · hover |
| 423 | `text-[10px] text-fg-muted mb-2` | panel | TEXT |
| 508, 688, 1418, 1765, 2074, 2097, 2152, 2394, 2416, 2429, 2483 | `w-4 h-4 text-fg-muted` (2074/2394 `w-6 h-4`) | panel | DEC ×11 (icon stroke) |
| 547, 772, 912, 1122, 1446, 1597, 1798 | `text-fg-muted hover:text-fg-2 text-lg leading-none` | glass | DEC ×7 (✕) · hover |
| 554, 1012, 1093, 1145, 1453, 1849 | `text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3` | glass | TEXT ×6 |
| 557 | `text-fg-muted hover:text-fg shrink-0` | glass | DEC · hover |
| 582 | `text-[10px] text-fg-muted w-8 text-right` | glass | TEXT |
| 779, 781 | `text-[10px] text-fg-muted mt-2` | glass | TEXT ×2 |
| 920 | `flex items-center justify-center py-8 text-fg-muted text-sm` | glass | TEXT |
| 939, 955 | `text-[10px] text-fg-muted` | glass | TEXT ×2 |
| 941, 1132 | `text-[10px] text-fg-muted mb-2` | glass | TEXT ×2 |
| 945, 1136 | `text-[10px] text-fg-muted mt-2 text-center font-mono` | glass | TEXT ×2 |
| 976, 981 | `text-[10px] text-fg-faint mt-1` | glass | **faint TEXT ×2** |
| 1100 | `text-[10px] text-fg-faint ml-2` | inset-50 | **faint TEXT** (timestamp) |
| 1104, 1863 | `text-fg-faint hover:text-red-400 text-sm leading-none px-1` | inset-50 | faint DEC ×2 · hover |
| 1130 | `text-[10px] text-fg-muted` | inset-50 | TEXT |
| 1158 | `text-[10px] text-fg-muted` | glass | TEXT |
| 1174 | `text-xs text-fg-muted mb-2` | glass | TEXT |
| 1260, 1500 | `text-[10px] font-medium text-fg-muted tracking-wider uppercase` | panel | TEXT ×2 |
| 1261, 1501 | `text-[10px] text-fg-faint mt-0.5` | panel | **faint TEXT ×2** |
| 1280 | `w-3 h-3 text-fg-faint transition-transform` | panel | faint DEC (chevron) |
| 1287 | `text-[10px] text-fg-faint group-hover:text-fg-muted transition-colors` | panel | **faint TEXT** · group-hover |
| 1296, 1304, 1313 | `text-[9px] text-fg-faint` | panel | **faint TEXT ×3** |
| 1343 | `text-[10px] text-fg-muted space-y-1 ml-3 list-disc` | glass L2 | TEXT |
| 1477, 1883 | `text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-2` | glass | TEXT ×2 |
| 1487 | `text-[10px] text-fg-faint hover:text-fg-muted mt-1` | glass | **faint TEXT** · hover |
| 1612 | `text-sm shrink-0 mt-0.5 ${isActive ? 'text-accent' : 'text-fg-faint'}` | glass | faint DEC |
| 1620 | `text-[10px] text-fg-muted mt-0.5` | glass | TEXT |
| 1859 | `text-[10px] text-fg-muted font-mono block` | inset-50 | TEXT |
| 1904, 1915, 1926, 1937 | `text-[10px] text-fg-muted uppercase tracking-wider block mb-1` | inset-50 | TEXT ×4 |
| 1963 | `text-[10px] text-fg-faint` | glass | **faint TEXT** |
| 2037 | `flex-1 flex items-center justify-center text-fg-muted text-sm` | panel | TEXT |
| 2114, 2446 | `text-xs text-fg-muted mb-1` | glass | TEXT ×2 |

### `ThemeScreen.tsx` — muted TEXT 2 / DEC 1 · faint TEXT 9 / DEC 2

Rendered at `SettingsPanel.tsx:667`, inside `.settings-drawer`.

| line | className | surface | class |
|---|---|---|---|
| 157, 445, 493 | `text-[9px] text-fg-faint uppercase tracking-wider mb-2` | panel | **faint TEXT ×3** |
| **257, 273** | `text-[10px] text-fg-faint` | **panel** | **faint TEXT ×2 — the reported bug** |
| 366 | `text-fg-muted hover:text-fg-2 text-sm leading-none w-6 h-6 …` | panel | DEC (✕) · hover |
| 383, 447, 495, 500 | `text-[10px] text-fg-faint bg-inset border border-edge-dim rounded-md px-2.5 py-1.5 leading-relaxed` | inset | **faint TEXT ×4** |
| 402 | `text-[10px] text-fg-muted font-mono` | panel | TEXT |
| 408, 415 | `text-[10px] text-fg-faint` (`□`, `◯`) | panel | faint DEC ×2 |
| 577 | `text-[10px] text-fg-muted w-9 text-right` | panel | TEXT |

### `AccountSection.tsx` — muted TEXT 11 / DEC 3
33 `w-4 h-4 text-fg-muted` DEC · 97 `text-fg-muted hover:text-fg …` DEC hover · 295 `text-[11px] text-fg-muted truncate` TEXT · 311, 500 `text-[10px] font-medium text-fg-muted uppercase tracking-wider` TEXT ×2 · 317 `text-[11px] text-fg-muted truncate` TEXT · 377 `text-[10px] text-fg-muted leading-relaxed` TEXT · 380 `text-[10px] text-fg-muted` TEXT · 508, 537 heading idiom TEXT ×2 · 532, 606 `text-[10px] text-fg-muted` TEXT ×2 · 546 `pl-3 text-xs text-fg-muted select-none` DEC (`@` affix) · 633 `block text-[10px] text-fg-muted` TEXT

### `ProvidersSection.tsx` — muted TEXT 9
154, 159, 276, 377, 426, 433, 444, 457, 470

### `LocalModelsSection.tsx` — muted TEXT 17 / DEC 2
76, 120, 224, 230, 249, 272, 273, 276, 294, 374, 376, 403, 454, 570, 611, 685, 699 TEXT · 214 (hover), 369 (chevron) DEC

### `EngineCard.tsx` — muted TEXT 2 — 92, 171

### `SettingsRow.tsx` — muted TEXT 1 / DEC 1
Own root is `bg-inset/50` (line 27) so **always raised regardless of caller**.
34 `text-[10px] truncate ${subtitleClassName ?? 'text-fg-muted'}` TEXT · 37 chevron DEC.
Callers: `SettingsPanel.tsx:506,639,750,875,1416,1567,1762,2070,2095,2150,2390,2414,2427,2481`, `AccountSection.tsx:51`, `SyncPanel.tsx:353`, `ModelProvidersPopup.tsx:61`, `PerformanceButton.tsx:31`.

### `SettingsExplainer.tsx` — muted TEXT 1 / DEC 2 · faint DEC 1 — 56, 76, 85, 109
### `PreferencesPopup.tsx` — muted TEXT 10 — 137, 144, 159, 168, 190, 203, 230, 243, 259, 277
### `ModelProvidersPopup.tsx` — muted TEXT 6 / DEC 1 — 64 DEC · 224, 227, 308, 591, 605, 662
### `ModelPickerPopup.tsx` — muted TEXT 12 · faint DEC 1 — 106, 335, 337, 341, 392, 397, 418, 443, 455, 492, 505, 510 · 434 disabled label
### `PerformancePopup.tsx` — muted TEXT 3 · faint DEC 1 — 134, 161, 173 · 182 bullet
### `PerformanceButton.tsx` — muted DEC 1 — 35
### `AboutPopup.tsx` — muted TEXT 4 · faint TEXT 2 — 110, 121, 143, 210 · **75, 234**
### `development/DevelopmentPopup.tsx` — muted TEXT 2 / DEC 4 — 36, 72 · 74, 86, 106, 117
### `development/BugReportPopup.tsx` — muted TEXT 3 — 225, 265 (hover), 285
### `development/ContributePopup.tsx` — muted TEXT 1 — 93
### `ContextPopup.tsx` — muted TEXT 3 — 139, 153, 255
### `RuntimeBinding.tsx` — muted TEXT 7 · faint TEXT 1 — 227, 253, 270, 301, 312, 336, 341 · **249**
### `FolderSwitcher.tsx` — muted DEC 2 · faint TEXT 2 / DEC 2 — 178, 237 DEC · **189, 246** TEXT · 182, 233 DEC
### `InfoPopover.tsx` — muted DEC 1 — 65 (hover)

---

# STATUSBAR — 18 hits

Root `.status-bar` (`StatusBar.tsx:719`) sits on bare canvas → **excluded**. Chips at 813-1074 each carry `bg-panel`; widget popup (536) is `OverlayPanel`.

| line | className | surface | class |
|---|---|---|---|
| 559 | `text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-2` | glass | TEXT |
| 591 | `text-[9px] text-fg-faint` ("always on") | glass | **faint TEXT** |
| 604, 622 | `${isExpanded ? 'text-accent' : 'text-fg-faint hover:text-fg-muted'}` | glass | faint DEC ×2 · hover |
| 634 | `text-fg-faint leading-relaxed` | inset | **faint TEXT** |
| 635 | `font-medium text-fg-muted` ("Best for:") | inset | TEXT |
| 820, 833, 872 | `text-fg-faint hidden sm:inline` | panel | **faint TEXT ×3** |
| 883, 894, 905, 916, 934, 949 | `text-fg-faint` (`In:` `Out:` `Cached:` `Hit:` `Active:` `Speed:`) | panel | **faint TEXT ×6** |
| 920 | `text-fg-faint` ("N/A") | panel | **faint TEXT** |
| 968, 971 | `text-fg-faint` ("lines", "No changes") | panel | **faint TEXT ×2** |

---

# CHAT / TOOL-VIEWS — 118 hits

### `tool-views/ToolBody.tsx` — muted TEXT 24 / DEC 10 · faint TEXT 1 / DEC 3
TEXT: 59, 74, 169, 195, 215, 419, 444, 464, 473, 509, 519, 545, 650, 656, 664, 743, 912, 926, 931, 937, 942, 961, 969, 1045, 1051
DEC: 54, 393, 404, 539, 557, 604, 735, 865, 907 · faint 398 TEXT · 605, 614, 657 DEC

### `ToolCard.tsx` — muted TEXT 3 / DEC 1 · faint DEC 1 — 641, 669, 763 · 767 · 760
### `tool-views/SubagentTimeline.tsx` — muted TEXT 1 / DEC 1 · faint DEC 1 — 146 · 148 · 143
### `AssistantTurnBubble.tsx` — muted TEXT 6 / DEC 1 · faint DEC 1 — 56, 74, 93, 411, 449, 457 · 148 · 141
### `UsageCard.tsx` — muted TEXT 10 · faint TEXT 1 — 85, 93, 97, 108, 112, 116, 127, 142, 153, 166 · **86**
### `PromptCard.tsx` — faint DEC 2 — 37, 52
### `CopyPicker.tsx` — muted TEXT 2 / DEC 1 — 21, 41 · 26
### `CompactingCard.tsx` — muted TEXT 1 — 27
### `AttentionBanner.tsx` — muted TEXT 2 — 61, 109
### `SystemMarker.tsx` — faint TEXT 1 — 63 (inset-60); 23/45/46/53 excluded as canvas
### `ContentFindBar.tsx` — muted TEXT 1 — 132
### `ArtifactThumbnail.tsx` — muted DEC 1 — 179
### `ModelLoadingBar.tsx` — muted TEXT 1 · faint TEXT 1 — 155 · **131**
### `artifact-views/*` — muted TEXT 11
`ActiveArtifactView.tsx:184,188,198` · `BinaryContent.tsx:31` · `BinaryFallback.tsx:15` · `CodeView.tsx:6` · `CsvView.tsx:36` · `HtmlView.tsx:16` · `MarkdownView.tsx:16` · `ViewerErrorBoundary.tsx:32` · `XlsxView.tsx:277`
### `SessionDrawer.tsx` — muted TEXT 7 / DEC 1 · faint DEC 2 — 400, 516, 563, 638, 651, 660, 698 · 535 · 566, 568
### `SessionStrip.tsx` — muted TEXT 7 / DEC 1 · faint TEXT 2 / DEC 2 — 799, 865, 961, 997, 1020, 1041, 1065 · 829 · **917, 979** · 102, 927
### `CommandDrawer.tsx` — muted TEXT 2 / DEC 3 — 136, 352 · 215, 239, 250
### `SkillCard.tsx` — muted TEXT 2 / DEC 1 · faint TEXT 1 — 141, 205 · 172 · **150**
### `TerminalToolbar.tsx` — muted TEXT 1 — 71

---

# SYNC — 65 hits

### `SyncPanel.tsx` — muted TEXT 24 / DEC 2 · faint TEXT 7
TEXT: 995, 1023, 1067, 1073, 1082, 1090, 1095, 1113, 1115, 1148, 1150, 1290, 1304, 1316, 1351, 1374, 1411, 1424, 1566, 1627, 1630, 1639, 1763, 1780
DEC: 1221, 1718 · **faint TEXT: 1194, 1320, 1385, 1397, 1425, 1786**

### `SyncSetupWizard.tsx` — muted TEXT 3 / DEC 2 · **faint TEXT 19** / DEC 1
faint TEXT: 214, 367, 383, 416, 447, 479, 563, 689, 733, 739, 754, 760, 783, 790, 797, 805, 809, 825, 928 · 745 DEC ("or")
muted: 216, 353, 373 TEXT · 81, 224 DEC

### `ConnectGithubModal.tsx` — muted TEXT 6 / DEC 1 — 209, 226, 295, 317, 320, 339 · 201

---

# PROJECT-VIEW — 40 hits (22 excluded as canvas)

### `ProjectView.tsx` — muted TEXT 4 / DEC 1 — 613, 651, 669, 804 · 645
### `ProjectHero.tsx` — muted TEXT 4 / DEC 1 · faint TEXT 2 / DEC 1 — 163, 186, 207, 249 · 179 · **301, 322** · 191
### `tabs/FilesTab.tsx` — muted TEXT 2 / DEC 1 · faint DEC 2 — 311, 470 · 448 · 629, 634
### `tabs/ContextTab.tsx` — faint TEXT 1 — **145**
### `ContextIntroBanner.tsx` — muted TEXT 1 — 58
### `tabs/ConversationsTab.tsx` — faint TEXT 1 — **58**
### `ProjectSwitcher.tsx` — muted TEXT 5 / DEC 1 · faint TEXT 2 — 132, 141, 149, 190 + 119 DEC · **134, 205**
### `HowContextWorksPopup.tsx` — muted TEXT 5 · faint DEC 1 — 123, 150, 307, 327, 418 · 334
### `ProjectDetailOverlay.tsx` — muted TEXT 1 — 54
### `FileFilterPopover.tsx` — muted TEXT 1 — 55
### `ContextEditorOverlay.tsx` — muted TEXT 1 · faint DEC 2 — 248 · 209, 213

---

# MARKETPLACE — 29 hits

### `MarketplaceCard.tsx` — muted TEXT 1 / DEC 1 — 382 · 310
### `StarRating.tsx` — muted TEXT 1 · faint DEC 1 — 76 · 62. All callers raised.
### `ReviewList.tsx` — muted TEXT 2 · faint TEXT 2 — 143, 152 · **72, 148**
### `RatingSubmitModal.tsx` — muted TEXT 5 · faint TEXT 2 / DEC 1 — 254, 274, 284, 334, 352 · **286, 306** · 66
### `ReportReviewButton.tsx` — muted TEXT 3 · faint TEXT 2 / DEC 1 — 164, 179, 219 · **181, 201** · 315
### `SignInPromptModal.tsx` — muted TEXT 1 · faint TEXT 1 — 54 · **68**
### `FileViewerOverlay.tsx` — muted TEXT 2 — 105, 111
### `MarketplaceFilterBar.tsx` — muted DEC 1 — 74
### `LikeButton.tsx` — muted DEC 1 — 194

---

# GAME — 24 hits

### `GamePanel.tsx` — muted DEC 1 — 39
### `GameLobby.tsx` — muted TEXT 14 / DEC 3 · faint TEXT 2 — 71, 91, 342, 350, 372, 419, 426, 455, 490, 497, 517, 592, 616, 638 · 134, 441, 540 · **528, 555**
### `GameChat.tsx` — muted TEXT 1 · faint TEXT 1 — 47 · **53**
### `GameOverlay.tsx` — muted TEXT 1 — 44
### `ConnectFourBoard.tsx` — muted TEXT 1 — 78

---

# UI-PRIMITIVES — 19 hits

### `ui/field.ts:30` — **highest-leverage single line in the app**
```ts
export const FIELD_TEXT = 'text-fg placeholder:text-fg-faint';
```
Paired with `FIELD_SURFACE = 'bg-inset …'` (line 27), so **every field placeholder in the app is `fg-faint` on `inset`** — the worst pairing in the worst themes. One edit, app-wide reach.

### `ui/Select.tsx` — muted DEC 1 · faint DEC 1 — 197 · 193
### `ui/AnchorTip.tsx` — muted DEC 1 — 136
### `ui/ProgressBar.tsx` — muted TEXT 1 — 50
### `ui/states.tsx` — muted TEXT 3 — 32, 33, 65 (Card variant container is `bg-inset/50` at 112)
### `context-menu/ContextMenu.tsx` — muted TEXT 1 · faint TEXT 1 — 154 · **160**
### `tags/TagPicker.tsx` — muted TEXT 1 · faint TEXT 3 / DEC 1 — 106 · **61, 65, 85** · 87
### `tags/NoteEditor.tsx` — faint TEXT 1 — **48**
### `tags/SessionTagsChip.tsx` — muted TEXT 2 / DEC 2 — 49, 69 · 41, 64

---

# OTHER — 79 hits

### `App.tsx` — muted TEXT 3 — 2796, 2819, 2838 (inside `.layer-surface` at 2794)
### `ResumeBrowser.tsx` — muted TEXT 17 / DEC 1 · faint TEXT 6 / DEC 2
TEXT: 92, 490, 510, 533, 539, 562, 567, 589, 599, 650, 658, 684, 721, 790, 888, 890, 898 · 733 DEC
faint TEXT: **668, 673, 688, 695, 813, 845** · 770, 836 DEC
### `CloseSessionPrompt.tsx` — muted TEXT 6 · faint TEXT 1 — 129, 134, 137, 163, 169, 180 · **157**
### `QuickChips.tsx` — muted TEXT 4 / DEC 2 · faint TEXT 3 / DEC 1 — 335, 374, 388 + 91, 320 DEC · **310, 382, 400** · 23
### `ShareSheet.tsx` — muted TEXT 2 / DEC 1 — 100, 117 · 91
### `ThemeShareSheet.tsx` — muted TEXT 3 / DEC 1 · faint TEXT 3 / DEC 1 — 106, 142, 199 · 182 · **149, 231, 249**
### `SkillEditor.tsx` — muted TEXT 4 — 51, 101, 114, 132
### `OpenTasksPopup.tsx` — muted TEXT 8 — 60, 64, 66, 99, 149, 154, 183, 200
### `ImportProjectModal.tsx` — muted TEXT 1 — 132
### `HandlePrompt.tsx` — muted DEC 1 — 121
### `FirstRunView.tsx` — muted TEXT 6 · faint DEC 2 — 64, 112, 132, 163, 197, 317 · 22, 25

---

# Excluded — 36 bare-canvas hits

`StatusBar.tsx:719` · `ChatView.tsx:77,591` · `SystemMarker.tsx:23,45,46,53` ·
`ProjectView.tsx:585` · `FilesTab.tsx:330,339,343,354,362,376,381,485` ·
`ContextTab.tsx:79,88,102,105,108,118` · `ConversationsTab.tsx:35,37` ·
`ConversationPreview.tsx:108,110,120,122,128` · `App.tsx:2661,2786` ·
`HeaderBar.tsx:202,586` · `FirstRunView.tsx:365` · `ErrorBoundary.tsx:28,30` ·
`TrustGate.tsx:80` · `MovedGate.tsx:42`

---

# Migration leverage, ranked

1. **`ui/field.ts:30`** — one constant, every field placeholder, always on inset.
2. **`text-[10px] font-medium text-fg-muted tracking-wider uppercase`** — the settings section-heading idiom, 30+ literal copies across `SettingsPanel`, `ProvidersSection`, `LocalModelsSection`, `AccountSection`, `SyncPanel`, `AboutPopup`, `DevelopmentPopup`, `StatusBar`, `PerformancePopup`. Extract before migrating.
3. **`text-fg-muted hover:text-fg-2 text-lg leading-none`** — close-button literal, ~12 copies, all DEC, all on glass. Safe to batch.
4. **`w-4 h-4 text-fg-muted`** — icon-stroke literal, 20+ copies, all DEC.
5. **Generic components whose callers are all verified raised** (can migrate unconditionally): `SettingsRow`, `SettingsExplainer`, `ui/states.tsx`, `ui/ProgressBar`, `ui/Select`, `ui/AnchorTip`, `StarRating`, `TagPicker`, `NoteEditor`, `ArtifactThumbnail`, `InfoPopover`.
6. **~136 sites with `hover:`/`group-hover:` colour overrides** — re-check the hover target's contrast too, not just the base.
