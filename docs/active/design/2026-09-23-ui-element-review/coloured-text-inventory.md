---
status: active
date: 2026-10-13
related: small-fixes-3 (the sweep question), guide-draft.md principle 2, decisions "Small fixes" rows
---

# Status colours used as text — inventory (not fixed yet)

The guide: the fixed status hues (green, red, amber, blue) go in tints, never in text (principle 2).
Two spots were fixed already with the status-pill convention — Local models' fit labels (SF2-9) and
the model menu's memory warning (SF2-10). Everything below is **listed, not changed**: Destin asked
for the list and one question on small-fixes-3 ("sweep them all next, using the fit-pill
convention?"). Read-only sweep of `youcoded/desktop/src/renderer` (`*.test.*` and comments excluded),
2026-10-13. Paths are under `desktop/src/renderer/`.

**Totals:** 75 places colour **words or numbers** — 12 of them the permission/plan buttons' light
labels on solid status fills (a documented exception, spec §11 change 61), so **63** without them;
27 colour only an **icon, glyph or dot** (may be acceptable); 3 brand colours (not status); ~20 in
the dev-only workbench.

## Status bar (`components/StatusBar.tsx` and its chips)
| Where | Words / icon | What it shows |
|---|---|---|
| 86 → 1016 model chip, unknown | words, `#DD4444` | "Model unknown" |
| 162 permission chip, unknown | words, `#DD4444` | "PERMISSION UNKNOWN" / "UNKNOWN" |
| 258–261 → 322 usage chips | words, red/orange/green hex | "NN%" |
| 264–267 → 1135, 1181 context chip | words, same hexes | "Context: NN%" |
| 468–469 → 1525 sync pill | words on tint, red-400 / amber-700 | "Sync failing" / "Sync warning" |
| 1040 fast mode | icon, amber-700 | — |
| 1376 cached tokens | words, green-400 | token count |
| 1424 cache reuse | words, green/amber/red | "NN%" |
| 1488–1489 lines changed | words, green / red | "+N" / "-N" |
| 1501 git branch | words + icon, teal `#0D9488` | branch name |
| 1563 announcement | words + ★, orange `#EA580C` | the message |
| 1598 version chip | words, amber-700 | "vX.Y.Z — Update Available" |
| `OpenTasksChip.tsx:41`, `:47` | words + glyph, blue / amber hex | "N ◐", "N ○" |
| `SpecialistsChip.tsx:60` | words + icon on tint, amber hex | needs-you count |

## Context popup, Usage card, plan windows
| Where | Words / icon | What it shows |
|---|---|---|
| `ContextPopup.tsx:18–21 → 132` | words, red/orange/green hex | big "NN%" |
| `UsageCard.tsx:83–87 → 260` | words, hex | "NN%" |
| `UsageCard.tsx:302`, `:304` | words, green / red | "+N" / "−N" |
| `plan-windows.tsx:85–89 → 98` (Usage card, Model providers) | words, hex | "NN%" |

## Header bar (`components/HeaderBar.tsx`)
| 570 remote badge | words on tint, blue-400 | "REMOTE" |
|---|---|---|
| 634 Games button, challenge | icon, amber-700 | — |

## Chat: tool cards, specialists, assistant turn
| Where | Words / icon | What it shows |
|---|---|---|
| `ToolCard.tsx:1389` | words, amber-700 | "may be stuck" |
| `tool-views/ToolBody.tsx:214–216` chips | words on tint, green / red / amber | "New file", "Failed", "Replace all", "Replaced file" |
| `tool-views/ToolBody.tsx:250–251` error block | words, red | "Error" + the message |
| `specialists/RunStatusLine.tsx:29, 37, 40` | words, amber / destructive | "…may be stuck", "Failed after …" |
| `SpecialistsChip.tsx:125`, `:143` | words + icon on tint | "Needs you", "Failed" |
| `SpecialistEnvelope.tsx:154` | words, amber-700 | trust caveat line |
| `tool-views/ToolBody.tsx:464–465` todo marks | icon, green / blue | — |
| `diff/UnifiedDiff.tsx:199`, `:201` | glyph −/+, red / green | — |
| `AssistantTurnBubble.tsx:190`, `SpecialistReportCard.tsx:79`, `ModelPickerPopup.tsx:101` | icon | — |
| `SkipPermissionsInfoTooltip.tsx:61` | words, destructive | "What could go wrong" |

Tool cards are outside the guide until their own rework (guide "Not covered yet").

## Permission and approval buttons (documented exception)
`ToolCard.tsx:836, 843, 884, 902`; `permissions/FullAutoStops.tsx:8, 52, 88, 89`;
`permissions/AdminPasswordPrompt.tsx:133`; `PlanApprovalCard.tsx:41–43` — light green/red/blue
labels on solid status fills ("Yes", "No", "Always allow", "Confirm"). The permission row is kept
as it is (decisions "Permission row and tool cards").

## Folder switcher, Project view, Git review, Session drawer
| Where | Words / icon | What it shows |
|---|---|---|
| `FolderSwitcher.tsx:309` / `:334` | icon / words, red | missing folder / "missing" |
| `project-view/ProjectHero.tsx:259, 265` | words, green / red hex | "Synced", "Sync problem" |
| `project-view/ProjectHero.tsx:629` | words, red-400 | the menu's danger item |
| `project-view/ProjectSwitcher.tsx:273` | icon on hover | bin |
| `git/GitReviewView.tsx:229–230, 313–314` | words, green / red | "+N" / "−N" |
| `SessionDrawer.tsx:1434` | words, amber-700 | "Conflict" |
| `SessionDrawer.tsx:1441–1442` | words, green / red | "+N" / "−N" |
| `SessionStrip.tsx:2535, 2668` | icon on hover | × |

## Backup & sync and its add-a-backup wizard
| Where | Words / icon | What it shows |
|---|---|---|
| `SyncPanel.tsx:201`, `:208` | count on tint, red / amber | warning count |
| `SyncPanel.tsx:237–239`, `1618`, `1626` | glyph on tint | ☁ ⌂ ⬡ |
| `SyncPanel.tsx:1759–1760` sync log | words, red / amber | "[ERROR]" / "[WARN]" |
| `SyncPanel.tsx:2085` | words, red-400 | a danger menu item |
| `SyncSetupWizard.tsx:62–64, 72–78, 620` | glyphs | picker icons, ✓ ◰ ✗, done ✓ |
| `SyncSetupWizard.tsx:1089` | words + spinner, blue-400 | "Waiting for sign-in…" |

(The wizard's own spots are rebuilt on small-fixes-3; the rest of this table is unchanged.)

## Marketplace, theme share, Buddy, artifact editor, crash screen, shared button
| Where | Words / icon | What it shows |
|---|---|---|
| `marketplace/MarketplaceCard.tsx:72–74 → 300, 425` | words on tint, green/amber/red | integration status |
| `marketplace/TrustBadges.tsx:100` | icon, amber-400 | — |
| `ThemeShareSheet.tsx:217` | words on tint, green-400 | "✓ Published ↗" |
| `buddy/BuddyResumeList.tsx:281` | words, warning-fg | the warning text |
| `artifact-views/ActiveArtifactView.tsx:876`, `:899` | words, fixed amber / red on fixed light fills | disk-conflict and save-error banners |
| `RootErrorBoundary.tsx:30` | words, `#e55` (before any theme loads) | "YouCoded failed to start" |
| `ui/Button.tsx:78` `danger-outline` | words, destructive (app-wide) | every danger-outline label |

## Not counted
Brand colours: `StatusBar.tsx:83` (Fable chip), `first-run/SignInChoices.tsx:86` (Claude),
`DonateConfirm.tsx:39` (Buy Me a Coffee). Fill/dot-only colour (fine): `buddy/SessionPill.tsx`,
`buddy/CompactToolStrip.tsx`, `buddy/AttentionStrip.tsx`, `FolderSwitcher.tsx:53–54`, ProjectHero's
sync dots, the header's game dot. Dev-only workbench (~20): `dev/workbench/ToolGallery.tsx:98`,
`compare/CandidateBoundary.tsx:34`, `mockups/*`, `compare/registry.tsx`.
