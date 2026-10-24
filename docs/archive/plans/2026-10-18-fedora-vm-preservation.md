# Preserve the Fedora KDE test VM

status: completed

## Approved outcome

Keep one reusable, resettable Fedora 44 KDE VM alongside this device's Windows 11, Ubuntu 24.04 and macOS Tahoe guests. Integrate it with the existing `scripts/vm/vm.sh` entry point and all current operational references. Remove only this task's disposable build roots, installer ISO and duplicate downloads, retaining release files, source and verification logs. Existing VMs and Destin's desktop/app must not change.

## Boundaries and interfaces

- Permanent guest folder: `~/vms/fedora-44-kde/`; alias `vm.sh fedora` (also `kde` / `fedora-kde`).
- Preserve dedicated SSH identity/known-host file and account `keyboardtest`; loopback SSH port 22227; never publish its private key/password. Current password file can remain mode 0600 only in the guest folder if required for explicit maintenance.
- Baseline `disk.qcow2` and `OVMF_VARS.4m.fd`; each ordinary test uses a disk-only copy-on-write `session.qcow2` plus session firmware variables. No multi-gigabyte RAM save image.
- `start [--headless]`, `stop`, `save-ready`, `exec <command...>`, `load <file|release|beta|tag|run:id>`, `shot <name>`, `view`, and `status` must have explicit behavior. Preserve existing Windows/Ubuntu/macOS dispatch and semantics unchanged.
- Normal start may open only the requested VM window. Headless start uses EGL/render-only access; screenshots come from Spectacle inside the guest, not QEMU GL screendump (which returns no surface). Fedora's limited headless `view` behavior must be accurate, not a fictitious live viewer.
- PID reuse must not authorize signalling another process. Never edit/convert/reset a disk while its guest is running. A clean stop discards only this guest's session overlay; save-ready intentionally promotes its stopped session into a new baseline.
- Ready baseline should contain current KDE/Qt, ordinary GUI login and VM access—not keyboard test recordings, package source/build roots, test daemons, caches or an installed swipe extension. Preserve evidence outside the guest before trimming.

## Execution

1. Inventory current references repo-wide and in the private system notebook. Exclude historical archives/incidents from present-tense inventory updates. Check incoming authoritative VM tool changes before editing (none were found).
2. Add a focused Fedora helper behind `vm.sh fedora`; write behavioral tests first using disposable HOME/VM_HOME and stand-in commands. Observe failures before implementation. Test private guest paths/SSH, startup mode, stopped-only baseline promotion, screenshot handling, and unchanged legacy guest dispatch.
3. Move only the known stopped Fedora VM disk/firmware/access files to the permanent guest folder on the same filesystem. Back up the launch/access metadata and retain evidence. Boot through the integrated helper; trim only identified in-guest build/test leftovers; guest fstrim, then clean shutdown and offline qcow2 compaction if disk headroom permits. Verify the original image until replacement passes `qemu-img check` and a real KDE/SSH boot.
4. Update `docs/vm-testing.md`, MAP and current operational references returned by the inventory. Private system notebook edits use a separate system-brain worktree, not its shared checkout. Do not restate every platform recipe in multiple docs; point to the canonical guide.
5. Only after a verified permanent guest boots without the ISO/cache paths, delete the allowlisted task-only installer/build roots/downloads. Keep `final-v1-output`, publication audit/results, screenshots/logs and the new permanent VM. Fail closed on unknown paths or permission constraints; do not change host privilege settings to bypass them.
6. Run helper tests, shell syntax, anchor audit, fresh review, actual headless start/exec/shot/reset/stop and disk-space measurements. Record exact retained guest location/access/reset semantics and the cleanup outcome on #82 and the wrap-up ledger. No commit/push/merge outside existing explicit authorization is implied by this maintenance plan.

## Verified outcome (2026-10-18)

- Permanent baseline compacted to about 10 GiB; `qemu-img check` and content comparison passed before replacement, then real KDE/SSH boot, inspected Spectacle PNG and disposable marker reset passed. Guest KWin/Plasma Keyboard 6.7.5 and Qt 6.11.2; no swipe extension or old build roots. Default-stop session is discarded; guest is left off.
- Actual native RPM HTTP load/hash/origin xattr passed. Stock KDE rejected the assumed GVfs metadata namespace; corrected to GIO `xattr::xdg.origin.url`, verified as `user.xdg.origin.url`. Final startup waits for actual SSH readiness, and guest fstrim passed with trim-enabled drive options.
- All 444 workspace/hook/VM regressions passed (including fifteen focused VM tests); shell syntax passed. Fresh reviewer findings (SSH readiness, fixture firmware isolation and failed-resume marker loss) were fixed with observed red/green regressions; bounded follow-up found no blocker. Workspace anchor audit passed.
- Existing VM idle policy retained; reviewed source installed atomically with prior copy backed up, exact-byte match and active service verified. No YouCoded process or other VM configuration/disk was changed.
- Allowlisted host build roots, source staging duplicates, OCI layers, installer ISO and replaced previous baseline/firmware removed only after retained releases/evidence and boot were verified. Rootless user-manager namespace handled subordinate-owned disposable files without changing host privilege policy. Retained task caches measure about 416 MiB packaging + 120 MiB publication, plus permanent guest/evidence. Global free space varies with independent concurrent VM work; do not treat logical deletions as an exact whole-session disk saving.
- Current guide/MAP/fact sheet and isolated private machine notebook now include Fedora. Historical measurements and platform-specific signing recipes remain historical/platform-specific. Destin approved committing/integrating the VM tooling and references on 2026-10-18; the broader #82 and first-run #16 remain open. The parallel keyboard-hardening work is excluded from this integration.

## Verification commands

- `node --test scripts/vm/*.test.mjs` for new focused helper tests (or the existing VM suite if inventory locates one).
- `bash -n scripts/vm/vm.sh scripts/vm/fedora.sh`.
- `node scripts/audit-anchors.mjs`.
- `bash scripts/vm/vm.sh fedora start --headless`; `exec` checks guest identity/KDE versions; `shot` must yield an inspected PNG; `stop` must leave baseline intact and no guest/server running.
- A second clean start must not retain a synthetic file written only in the prior disposable session. Baseline promotion is checked separately with a harmless marker and is not performed while running.
- Final `qemu-img info/check`, test listener/PID inspection and `df -h` establish the retained baseline and recovered disk space.
