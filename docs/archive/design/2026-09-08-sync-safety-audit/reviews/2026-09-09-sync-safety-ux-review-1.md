# Sync safety — first-time UX review 1

Simulated-backend workbench, Midnight, 1440×900. Stopped at the requester's early-return instruction after opening Settings → Backup & Sync. Info popup and narrow width were not yet tested; no claims about either. No implementation read or product edits. Touch and high-density display not tested.

- U1 accepted — Broader conflict-detail design must show concrete affected copies using verified event data. Do not invent an originating device or edit/deletion outcome unavailable in current events. Open-copy action needs guarded backend capability and visual approval; remains open in this session's UI batch, not claimed solved by wording correction. Expected to learn which file changed, which device kept my copy, and where to inspect it / The warning only says “The device resolving the conflict saves its local version as a \"(from …)\" copy. The original filename follows the other device’s edit or deletion.” I cannot identify the affected file, the resolving device, whether this was an edit or deletion, or the copy to inspect from this screen. Show the actual outcome and filenames, with an “Open saved copy” action; for example, when accurate: “Both devices changed [file]. Your [device] version is saved as [copy name]. [file] now contains [other device]’s version.” Use a separate deletion-specific sentence when applicable. — Backup & Sync, conflict explanation — scratch/sync-ux-first/opened/midnight/backup-sync.png
- U2 accepted — Include conflict awareness in forthcoming truthful-status design; the copy-only slice does not solve it. Expected the headline to acknowledge a conflict and distinguish successful syncing from a saved copy that needs inspection / A green “All synced” headline appears above an orange conflict explanation, leaving me unsure whether anything needs my attention. Prefer “Synced · conflict copy saved” when that is the actual outcome, followed by “Review the saved copy.” — Backup & Sync, status header and conflict explanation — scratch/sync-ux-first/opened/midnight/backup-sync.png
- U3 accepted — Prioritize actionable state in the existing Settings row during truthful-status design, preserving compact layout and testing truncation. Expected the Settings summary to expose the important sync event / The subtitle is truncated to “Last synced 1m ago · 1 sync…” even at 1440px window width, hiding what the event is, while its indicator remains green. Put the actionable event first (“1 conflict copy saved · synced 1m ago”) or give it a second line. — Settings, Backup & Sync row — scratch/sync-ux-first/settings/midnight/settings.png

## Evidence and execution

Viewed both referenced screenshots. Successful command:

`node scripts/ui-review/shot.mjs scratch/sync-ux-first/settings.json scratch/sync-ux-first/opened`

Actual output:

```text
ok   midnight/settings (7 contrast fails)
ok   midnight/backup-sync (7 contrast fails)

2/2 shots verified. Manifest: scratch/sync-ux-first/opened/manifest-settings-midnight-s0of1-1788943908207.json
```

An earlier exact-text automation click missed the combined-text Settings row; this was corrected using its discovered button text. That unverified shot is not evidence of a product failure. Automated contrast counts were not triaged and are not reported as findings.
