# Error-handling inventory 2: SETTINGS

Worktree: `worktrees/sessions/error-states-unit-b/youcoded/desktop/src` at `a89b2cd9`. Every row was checked against today's code and the backend handler it calls. Paths are relative to `src/`.

**Totals:** Severity 1: 2 · Severity 2: 15 · Severity 3: 31 · Intentional fallbacks (no severity): 16.

**Transport note, checked:** in preload, `unwrapInvokeError` (`main/preload.ts:457`) is used only by the four ChatGPT calls (`preload.ts:1497-1500`). The naming `unwrap` (`preload.ts:469`) is used only by `sessionNaming.set` and `sessionNaming.rename`. Every other `window.claude.*` rejection still reaches the screen as "Error invoking remote method '…': Error: …" unless it goes through `plainMessage()`. Those are the rows marked RAW.

## Severity 1

| file:line | What the user sees | Trigger | Kind | Defects | Fix |
|---|---|---|---|---|---|
| renderer/components/SyncPanel.tsx:653-662 | Warning card "Retry" button → the row reads **"Uploaded!"** | `sync.pushBackend` fails | uncertain-mutation | FALSE | Read `result.success` the same way `handlePushBackend` (l.605) does, and show `result.error` |
| renderer/components/SyncPanel.tsx:953-960 → SyncSetupWizard.tsx:330-337, 571-574 | **"You're all set!"** and "Your first backup is syncing now. Backups happen automatically every 15 minutes." | `sync.addBackend` throws, or `sync.force` returns `{success:false}` | uncertain-mutation | FALSE, SILENT | Let `onComplete` rethrow; check `force()`'s `success`; show the wizard's existing `error` Callout |

**Evidence, row 1.** Backend `main/sync-state.ts:670-690` never throws. It returns a failure object instead:
```ts
return { success: result.success, error: result.errors > 0 ? `Push to ${id} had errors` : '' };
} catch (e: any) { return { success: false, error: e.message || `Push to ${id} failed` }; }
```
The renderer ignores the result, so its `catch` never runs:
```ts
case 'retry': {
  setActionFeedback(prev => ({ ...prev, [action.payload.backendId]: 'uploading' }));
  try {
    await claude.sync.pushBackend(action.payload.backendId);
    setActionFeedback(prev => ({ ...prev, [action.payload.backendId]: 'uploaded' }));
```
Line 1346 then renders `'uploaded' ? 'Uploaded!'`. The other "uploaded" handler, `handlePushBackend` at l.605, does check: `result.success ? 'uploaded' : 'error'`. No other code sets "uploaded".

**Evidence, row 2.** The panel's handler swallows every failure:
```ts
onComplete={async (instance) => {
  try {
    await claude.sync.addBackend(instance);   // throws when atomicWrite fails (sync-state.ts:587)
    await claude.sync.force();                // returns {success:false,...} (sync-state.ts:646-667), unchecked
    await refreshStatus();
  } catch {}
}}
```
The wizard treats a resolved `onComplete` as success: `await onComplete({...}); ... setStep('done');` at SyncSetupWizard.tsx:330-337. The done step then says "You're all set!" (l.571).

## Severity 2

| file:line | What the user sees | Trigger | Kind | Defects | Fix |
|---|---|---|---|---|---|
| SyncPanel.tsx:280-286, 522-533, 1564-1568 | Settings row: "Not configured". Popup: "No Sync Data / Sync hasn't run yet. Configure a backup destination to get started." | `sync.getStatus` rejects (`catch {}`) | transient-read | EMPTY-AS-NONE | Keep a `loadError` state; show `<ErrorState>` with Retry |
| SyncPanel.tsx:683-685 (row: 349-353) | Header: "Backup & sync is off", with the toggle off | `syncSpaces.status` rejects (`catch {}`) | transient-read | EMPTY-AS-NONE | Show "Couldn't load sync status" + Retry instead of the off state |
| SyncPanel.tsx:581-590 | "Back up all now" → "Backing up…" → back to "Back up all now". Nothing else | `sync.force` returns `{success:false,error}` (sync-state.ts:652-666), never read, and `catch {}` | uncertain-mutation | SILENT | Check `success` and show `error` next to the link |
| SyncPanel.tsx:616-621 | "Pause/Resume auto-backup" menu item: nothing changes | `sync.updateBackend` throws (config write); `catch {}` | uncertain-mutation | SILENT | Per-row FieldError via `plainMessage` |
| SyncPanel.tsx:623-629 (dialog 1592) | "Remove backup?" → Remove → the dialog closes and the backup is still listed | `sync.removeBackend` throws; `catch {}` | uncertain-mutation | SILENT | Keep the dialog open with a FieldError, or show a row note |
| SyncPanel.tsx:968-975 | Edit → Save → back to the main list; the name is unchanged; nothing says so | `sync.updateBackend` throws; `catch {}` then `setView('main')` | uncertain-mutation | SILENT | Stay on the form and show a FieldError |
| SyncPanel.tsx:873-889 | "Additional backups" master toggle doesn't move; some backups may already be paused/resumed | `updateBackend` rejects mid-loop; no try at all (unhandled rejection) | uncertain-mutation | SILENT | try/catch; refresh status; show which backups didn't change |
| SyncSetupWizard.tsx:610-628, 665-677 | "Checking Setup": every row shows ✗ (e.g. "Cloud sync tool ✗"). No Install button (`needsRclone` needs non-null prereqs), no message; only Back | `sync.setup.checkPrereqs` rejects (`catch {}`) | transient-read | EMPTY-AS-NONE, DEADEND | Keep an error state: "Couldn't check what's installed" + Retry |
| PreferencesPopup.tsx:98-113 | The toggle/select shows the new value as saved | `settings:set` returns `false` (`main/ipc-handlers.ts:1307-1314`: `} catch { return false; }`); renderer does `api.set(...).catch(() => {})` | uncertain-mutation | SILENT | Check the boolean; revert and show a FieldError |
| UpdatePanel.tsx:177-180, 290-298 | Download fails → the button reads **"Launch failed"**, disabled; "Open in browser instead" | `update.download` rejects | uncertain-mutation | FALSE, DEADEND (Retry removed) | Parse the code with `plainMessage(e)` first, or return `{error:code}` from main |
| SettingsPanel.tsx:2788-2800 | Remote access password "Set" → "..." → "Set" again; the typed password stays; no message | `remote.setPassword` throws (`ipc-handlers.ts:1786-1790` has no catch); renderer `catch { setPasswordStatus('idle') }` | uncertain-mutation | SILENT | FieldError with `plainMessage(e)` |
| SettingsPanel.tsx:2765-2783 | Remote Access panel shows the first-time setup banner and an off server toggle, as if never configured | Any of `getConfig`, `detectTailscale`, `devices.list`, `getStatus` rejects; `.catch(() => setLoading(false))` | transient-read | EMPTY-AS-NONE | `<ErrorState>` with Retry when the load fails |
| LocalModelsSection.tsx:111-114 | The "Installed" group disappears; downloaded models look gone | `models.installed` rejects → `setInstalled([])` | transient-read | EMPTY-AS-NONE | Keep null + error line with Retry |
| ModelProvidersPopup.tsx:397-404, 407, 475 | OpenRouter: "Not connected" + "Connect to OpenRouter". The button does nothing (`connectOpen && openrouter`, and openrouter is null) | `providers.list` rejects → `setOpenrouter(null)` | transient-read | EMPTY-AS-NONE, DEADEND | Separate "couldn't check" state with Retry |
| RuntimeBinding.tsx:199-205, 300 | New-session form: "Create Session" stays disabled with no reason | `providers.list` / `providers.catalog` reject → `.catch(() => [])` → `readyProviders.length === 0` → `nativeCreateBlocked` | transient-read | EMPTY-AS-NONE | Track the load failure; show "Couldn't load your models" + Retry |

**Evidence for the UpdatePanel row.** `UpdateInstallError` sets `super(detail ? \`${code}: ${detail}\` : code)` (`main/update-installer.ts:35`). `update.download` is a bare `ipcRenderer.invoke` (`preload.ts:878`), not unwrapped, so on desktop the message starts with "Error invoking remote method 'update:download': …". The renderer does:
```ts
const code = typeof e?.message === 'string' ? (e.message.split(':')[0] || 'network-failed') : 'network-failed';
```
That yields `"Error invoking remote method 'update"`. `isRetriableErrorCode` then returns false, which renders `'Launch failed'` with the button disabled (l.281).

## Severity 3

| file:line | What the user sees | Trigger | Kind | Defects | Fix |
|---|---|---|---|---|---|
| SyncPanel.tsx:601-611, 1345-1347 | "Error" under the row for 2 seconds | `pushBackend` `{success:false,error}` | uncertain-mutation | VAGUE, HANDROLLED | Show `result.error` in a FieldError that stays |
| SyncPanel.tsx:592-598 | Warning "Dismiss" does nothing | `sync.dismissWarning` throws; `catch {}` | uncertain-mutation | SILENT | FieldError on the card |
| SyncPanel.tsx:1510-1515, 1552, 1527 | "No sync log entries yet." | `sync.getLog` rejects; `catch {}` | transient-read | EMPTY-AS-NONE | "Couldn't load the log" + Refresh |
| SyncPanel.tsx:784-797, 1711 | "No devices yet — they appear here once sync has run." | `listDevices` rejects → `[]` | transient-read | EMPTY-AS-NONE | Error line + Retry |
| SyncPanel.tsx:798-803 | Rename a device → the old name comes back; no message | `renameDevice` returns `{ ok: false }` (`ipc-handlers.ts:4218-4223`), not read; `catch {}` | uncertain-mutation | SILENT | Read `ok`; reuse the `removeNote` FieldError |
| SyncPanel.tsx:814-816 | Remove-device note shows the raw invoke text | `removeDevice` rejects; `e instanceof Error ? e.message` | uncertain-mutation | RAW | `plainMessage(e, 'Could not remove this device.')` |
| SyncPanel.tsx:836-850, 1218 | "0 Conversations" / "No conversations yet." (only when there is no cache) | `session.browse` rejects | transient-read | EMPTY-AS-NONE | Hide the count or say it couldn't load |
| SyncSetupWizard.tsx:933-956, 1010-1015 | "Looks like the sign-in didn't complete. No worries — try again when you're ready." | `authGdrive` / `authGithub` `{success:false,error}` (e.g. "Sign-in seemed to work but the connection was not saved", `sync-setup-handlers.ts:256`) | uncertain-mutation | FALSE (asserts the sign-in didn't complete), VAGUE (`error` is stored but never rendered) | Render `error` |
| SyncSetupWizard.tsx:311-313, 497; 642-644, 719-720 | Callout with the command's raw stderr (`gh repo create`, `winget` / `brew` / `curl \| sudo bash`) | `createGithubRepo` / `installRclone` return `result.stderr` (`sync-setup-handlers.ts:190, 331`) | user-resolvable | RAW | Summarize; put stderr behind "Show details" |
| SyncSetupWizard.tsx:339, 646, 819 | `e.message` (raw invoke text) | IPC rejection | app-side/unknown | RAW | `plainMessage(e)` |
| ConnectGithubModal.tsx:89-95, 115-118, 20-26 | "Couldn't reach GitHub — check your connection." | Any rejection of `github.status` or `connectStart` (e.g. remote `remote-unsupported: …`, a non-network throw) maps to `'network'` | app-side/unknown | FALSE (asserts a network cause) | Only the literal `'network'` code gets that copy; otherwise a general ErrorState |
| ConnectGithubModal.tsx:176-177, 252-254 | Raw invoke text in `<div role="alert" className="text-xs text-destructive-fg">` | `github.installGh` rejects | app-side/unknown | RAW, HANDROLLED | `plainMessage` + FieldError |
| ConnectedAccounts.tsx:50-51 | Raw invoke text under Disconnect | `github.disconnect` rejects (the handler always returns `{ok:true}`, `main/github-connect.ts:259-268`) | uncertain-mutation | RAW | `plainMessage(e)` |
| AccountSection.tsx:339-343, 417 | "Blocked users" section doesn't appear | `social.listBlocks` `{ok:false}` → `setBlocks(null)` | transient-read | EMPTY-AS-NONE | Show "Couldn't load blocked users" + Retry |
| state/account-context.tsx:161-162, 180-181, 200 → AccountSection.tsx:275 | "sign-in start failed: fetch failed" (or other network text) | `account.start` / `account.poll` `{ok:false,message}`; a network error message is raw (`main/handler-utils.ts:22-23`) | transient-read | RAW | Plain sentence; keep the raw text in logs |
| SettingsPanel.tsx:2893-2895 → 1464-1465 | Setup ErrorState: "Error: Error invoking remote method 'remote:…': …" | `detectTailscale` / `installTailscale` / `authTailscale` rejects; `setSetupError(String(err))` | app-side/unknown | RAW | `plainMessage(err)` |
| SettingsPanel.tsx:2802-2815 | Server toggle doesn't move; no message | `remote.setConfig` rejects (no try) | uncertain-mutation | SILENT | try/catch into `enableError` |
| SettingsPanel.tsx:2546-2570 (Android) | Tier/defaults show their starting values; a changed tier or default isn't saved, silently | `getTier` / `defaults.get` reject (`.catch(() => setLoading(false))`); `setTier` / `defaults.set` have no catch | uncertain-mutation | SILENT | Error line + revert |
| SettingsPanel.tsx:2216-2219, 2296-2300 (Android) | "Not configured" | `android.getPairedDevices` rejects | transient-read | EMPTY-AS-NONE | "Couldn't load saved devices" |
| ProvidersSection.tsx:399-403 | Note in hand-rolled `<p … text-red-500>` | test/save/remove failure | — | HANDROLLED | FieldError |
| ModelProvidersPopup.tsx:416, 517, 703, 716 | Raw invoke text | `providers.test` / `providers.setKey` / `search.setKey` / `search.removeKey` reject (not unwrapped) | uncertain-mutation | RAW | `plainMessage(e, …)` |
| ModelProvidersPopup.tsx:564, 807 | Hand-rolled `text-red-500` notes | same | — | HANDROLLED | FieldError |
| ModelProvidersPopup.tsx:670-671 | Web search: the Tavily/Exa rows vanish; only "works for free" text remains | `search.list` rejects → `setRows([])` | transient-read | EMPTY-AS-NONE | Error line + Retry |
| LocalModelsSection.tsx:119 | "Recommended" group disappears | `models.curated` rejects → `[]` | transient-read | EMPTY-AS-NONE | Error line + Retry |
| LocalModelsSection.tsx:1326-1330, 1367 | "No other local model apps found running." | `models.detectEndpoints` rejects → `[]` | transient-read | EMPTY-AS-NONE | "Couldn't check" + Detect again |
| SpecialistsSection.tsx:134, 150; specialists/SpecialistActions.tsx:40, 48; hooks/useSpecialists.ts:295 | Raw invoke text in ErrorState/FieldError (only on transport rejection; `{ok:false,error}` paths are clean) | IPC rejection | app-side/unknown | RAW | `plainMessage(e)` |
| ThemeShareSheet.tsx:72-73, 153-154 | Raw invoke text, e.g. "Error invoking remote method '…': Error: Theme not found on disk", in `<p className="text-xs text-destructive-fg">` | `theme.marketplace.publish` throws (`main/theme-marketplace-provider.ts:319-332`) | uncertain-mutation | RAW, HANDROLLED | `plainMessage` + ErrorState with Retry |
| ThemeScreen.tsx:260 (+ state/marketplace-context.tsx:370-375) | Star doesn't fill; no message | `appearance.favoriteTheme` rejects; `.catch(() => {})` | uncertain-mutation | SILENT | Toast |
| state/theme-context.tsx:153-154 | Theme/appearance choice applies now, then comes back on next launch | `appearance.set` promise is never awaited, so its failure (`ipc-handlers.ts:1327-1337` catch branch) is unobserved; the try/catch cannot catch it | uncertain-mutation | SILENT | Await/`.then` the result; toast on false |
| PerformancePopup.tsx:76-82 (hooks/usePerformanceConfig.ts:45-50) | The power-saving toggle flips back; no message | `performance.set` rejects | uncertain-mutation | SILENT | FieldError (the comment admits "no error-toast surface yet") |
| AboutPopup.tsx:60-73 | "Share anonymous usage stats" row never appears (the getter has no catch, so the state stays null); a failed flip snaps back silently | `analytics.getOptIn` / `setOptIn` reject | uncertain-mutation | SILENT | Catch the getter; FieldError on the flip |
| UpdatePanel.tsx:202-208 | "Couldn't load changelog. Open on GitHub" | changelog `{error:true}` (`main/changelog-service.ts:110`) | transient-read | HANDROLLED | `<ErrorState>` with Retry + link |

## Intentional fallbacks (no defect)

- SyncPanel.tsx:694-698 — GitHub status unknown → null, so the "Connect GitHub" button isn't offered.
- SyncPanel.tsx:717 — `syncNow` after a reconnect; failures arrive as sync events.
- SyncPanel.tsx:736 — preflight `github.status` → null skips the preflight.
- AccountSection.tsx:152-156 — the "Connected accounts" row is hidden where `github:*` doesn't exist.
- account-context.tsx:225-231 — sign-out clears local state even if the server call fails (documented).
- account-context.tsx:296 — periodic profile refresh while offline.
- usePerformanceConfig.ts:32-35 — load failure hides the section.
- use-provider-type.ts:56-57 — status-bar chip lookup.
- ThemeShareSheet.tsx:37-40 — preview → swatch fallback.
- ThemeShareSheet.tsx:52-54 — publish state → unknown.
- theme-context.tsx — localStorage try/catches; per-theme load `console.warn`.
- HelpPopup.tsx:33-49 — tips switch in localStorage.
- SettingsPanel.tsx:490 (dialog cancel), 891/904 (buddy status), 977 (throwing bridge), 1027/1068 (these still show honest messages), 2292 (bad QR URL).
- EngineCard.tsx:208 — clipboard.
- LocalModelsSection.tsx:735 — cancel before delete.
- UpdatePanel.tsx:118 — cached-download probe. AssistantSettings.tsx:100-104 — attention dots. RuntimeBinding.tsx:259-261 — memory check. ConnectGithubModal.tsx:146, 155-158, 245, 313 — cancel/clipboard.

## (a) In scope, checked, no defects

- PermissionsSection.tsx — ErrorState general on load; honest notes on remove.
- EngineCard.tsx — `plainMessage` everywhere; FieldError / ErrorState.
- HandlePrompt.tsx — server's own message via FieldError.
- assistant-settings/pages.tsx — step guard: FieldError + Retry.
- assistant-settings/SessionNaming.tsx — `set`/`rename` go through preload `unwrap`, so `e.message` is clean.
- assistant-settings/AssistantSettings.tsx, assistant-settings/naming-api.ts.
- HelpPopup.tsx.
- The ChatGPT card in ModelProvidersPopup.tsx:258-304 — its four calls go through `unwrapInvokeError`.
- ProvidersSection load/save/remove logic (only the HANDROLLED note row above).
- AccountSection name/handle/delete/export/unblock — messages come from the server via `ApiResult`.
- LocalModelsSection row actions (download/resume/delete/add vision), the settings dialog, and the Hugging Face search/quants copy, which matches `main/models/hf-client.ts:68-100`.
- Files with no catch and no bridge calls: SettingsExplainer.tsx, ModelLoadingBar.tsx, PerformanceButton.tsx, UsageCard.tsx, DonateConfirm.tsx, FirstTimeWarning.tsx, StatsWithHealthBridge.tsx, permissions/deny-list-copy.ts, permissions/permissions-explainer.ts, permissions/describe-rule.ts ("catch" appears only in comments), remote/preview-types.ts, specialists/RunStatusLine.tsx, specialists/SpecialistAskBlock.tsx, assistant-settings/SkipPermissionsSection.tsx, assistant-settings/use-renamed-sessions.ts.

## (b) Files containing `catch` in scope, and what was not inspected

`rg -c 'catch'` over the scoped components listed 27 files. All 27 were inspected at every catch site: PermissionsSection, ConnectGithubModal, ConnectedAccounts, RuntimeBinding, EngineCard, AccountSection, ThemeShareSheet, HelpPopup, ThemeScreen, ModelProvidersPopup, AboutPopup, ProvidersSection, LocalModelsSection, PerformancePopup, UpdatePanel, PreferencesPopup, SyncSetupWizard, SettingsPanel, SpecialistsSection, SyncPanel, HandlePrompt, specialists/SpecialistActions, assistant-settings/SessionNaming, assistant-settings/pages, permissions/describe-rule, assistant-settings/AssistantSettings, assistant-settings/naming-api.

In `rg -l 'catch'` over the feeding hooks/state, 5 files matched: hooks/useSpecialists.ts, state/account-context.tsx, hooks/usePerformanceConfig.ts, state/theme-context.tsx, hooks/use-provider-type.ts. All were inspected. worker-health-context.tsx and sync-display-state.ts have no catch.

Not inspected, or only partly:
- **hooks/useSpecialists.ts:436, `useDelegatedModels`** ("leave null — the UI says 'not set'"). Its only consumer is `SpecialistEnvelope.tsx:68`, a chat surface outside SETTINGS.
- **state/marketplace-context.tsx** — only `favoriteTheme` was read; its install/uninstall catches belong to the marketplace scope.
- **SettingsPanel.tsx:2241-2242, 2277-2278 (Android "Connect to desktop")** — shows `err.message` from `remote-shim.ts connectToHost`, which rethrows whatever `connect()` rejected with (`remote-shim.ts:1084`). The possible messages inside `connect()` were not traced, so no verdict.
- **SyncSetupWizard.tsx:420-530** — scanned with rg for error handling only; no catch there.
- **UpdatePanel on remote/Android shims** — only the desktop preload path was traced for the download-code row.
