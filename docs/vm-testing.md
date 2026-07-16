# VM Testing (Linux host) — installer, first-run, and sign-in flows

How to spin up clean Windows and Linux virtual machines on the current dev machine (CachyOS, Ryzen AI Max+ 395, 121 GB RAM) to test YouCoded's installers, prerequisite installer, setup wizard, and sign-in flows without ever touching the live app or the host's `~/.claude`.

> **History:** the archived `docs/archive/local-dev-vm.md` covered the same goal for a **Windows host** (VirtualBox + `scripts/setup-test-vm.ps1`). That path was blocked by the Hyper-V conflict (`docs/archive/investigations/2026-04-29-vbox-hyperv-conflict.md`) and never used. None of that applies here — this host runs native KVM with no competing hypervisor, so installs run at full speed (~20–30 min for Windows, once, then snapshot-revert in seconds). The snapshot-revert methodology and "when to use this" list carry over.

## Why VMs

- **Clean-machine fidelity.** The failure modes that matter — `spawn EINVAL`, missing winget, no Node/Git, fresh-PATH propagation, AppImage-without-libfuse2 — only exist on a machine that has never seen a dev tool. The host masks all of them.
- **Live-app safety.** Sign-in and sync flows mutate `~/.claude`, `~/.youcoded/`, and OS keychains. A VM fully isolates them from Destin's working environment (see `.claude/rules/live-app-safety.md`).
- **Deterministic reset.** Snapshot once after a clean install; revert between test runs in seconds.

## Host status (verified 2026-07-16)

| Check | Result |
|---|---|
| CPU virtualization | AMD-V, `kvm_amd` module loaded |
| `/dev/kvm` | present, world-rw — **no libvirt daemon or group setup needed** |
| RAM / disk | 121 GB / ~447 GB free |
| Tooling | nothing installed yet; `paru` available for AUR |

## One-time setup

Install quickemu (AUR; pulls `qemu`, `swtpm`, `edk2-ovmf`, `spice-gtk` from official repos):

```bash
paru -S quickemu
```

Create a home for VM disks — **outside** the repos and **outside** any synced folder (`~/YouCoded/` syncs to GitHub; a 20 GB disk image must never land there):

```bash
mkdir -p ~/vms && cd ~/vms
```

quickemu creates VMs in the current directory — always run it from `~/vms`.

## Windows 11 VM

```bash
cd ~/vms
quickget windows 11        # downloads the Win11 ISO via Microsoft's API + virtio drivers (~7 GB)
quickemu --vm windows-11.conf
```

The Windows install is **fully unattended** — quickemu injects an answer file that partitions, bypasses the Microsoft-account OOBE, installs virtio/SPICE drivers, and creates a local account (**user `Quickemu`, password `quickemu`**). Expect ~20–30 min at native KVM speed; a window shows progress. TPM 2.0 + Secure Boot are configured automatically. An unactivated Win11 runs indefinitely for testing (desktop watermark only).

When the desktop appears, **power the VM off** (shut down inside Windows), then take the baseline:

```bash
quickemu --vm windows-11.conf --snapshot create clean
```

Test cycle:

```bash
quickemu --vm windows-11.conf --snapshot apply clean   # revert (VM must be powered off)
quickemu --vm windows-11.conf                          # boot
```

**Snapshots only while powered off.** `--snapshot` wraps `qemu-img` internal snapshots; snapshotting or reverting a running VM corrupts the disk.

## Linux VMs

One VM per package format we ship (`youcoded/desktop/electron-builder.yml`: AppImage, deb, rpm, pacman):

```bash
cd ~/vms
quickget ubuntu 24.04      # deb + AppImage testing (the mainstream case)
quickget fedora 42         # rpm (optional)
quickget archlinux latest  # pacman artifact (optional — never test it on the host)
quickemu --vm ubuntu-24.04.conf
```

Linux installs are not unattended — click through the distro installer once (~10 min), power off, snapshot `clean` exactly as above.

## Getting an installer into a guest

Guests use QEMU user-mode networking: **the host is always `http://10.0.2.2` from inside the VM.**

- **Local build:** on the host, `cd youcoded/desktop && npm run build && npx electron-builder --win nsis` (or `--linux`), then serve it:
  ```bash
  python3 -m http.server 8010 -d ~/youcoded-dev/youcoded/desktop/release
  ```
  In the guest browser (Edge/Firefox): `http://10.0.2.2:8010` → download → run.
- **Release/CI build:** download straight from the GitHub Release inside the guest — this also exercises exactly what a real user does (SmartScreen prompt included).

## What to test where

| Flow | VM | Real code path exercised |
|---|---|---|
| NSIS install + first launch | Win11 | installer, first-run detection |
| Prerequisite installer: no Node, no Git, winget present/absent | Win11 | `prerequisite-installer.ts` (`detectWinget`, `runCommand` .cmd handling, native `claude.ai/install.ps1` bootstrap) |
| "Quit and reopen" PATH propagation | Win11 | post-install detection rule — verify restart actually fixes it |
| Claude Pro/Max sign-in + setup wizard | Win11 + Ubuntu | setup-wizard skill, OAuth in guest browser |
| Connect-GitHub modal (gh missing → winget install → device flow) | Win11 | `github-auth.ts` / `github-connect.ts` |
| Sync enable on a fresh account/device | any | sync-spaces provisioning, second-device convergence (use two VMs!) |
| deb install, menu entry, frameless caption buttons | Ubuntu | Linux `showCaptionButtons` pitfall — Linux must get window controls |
| AppImage on stock Ubuntu 24.04 | Ubuntu | libfuse2 is NOT preinstalled — confirm our AppImage story survives this |
| rpm / pacman artifacts | Fedora / Arch | dependency lists in `electron-builder.yml` (the AUR `libappindicator-gtk3` trap) |

Two-device sync testing is a standout use: two VMs (or VM + host dev instance) give a true second machine for lease/takeover and conversation-store convergence without borrowing hardware.

## Sign-in / signup flows

Do these interactively in the VM window with real credentials (Destin drives; the VM keeps tokens off the host). Notes:

- Reverting to `clean` discards guest-side tokens, but the server side may accumulate authorized devices/sessions. Occasionally prune at claude.ai settings and GitHub → Settings → Applications.
- Never copy `~/.claude/.credentials.json` from the host into a guest to "skip" sign-in — the whole point is exercising the real flow.

## Claude-driven testing (phase 2, unverified)

For automated smoke tests, two hooks exist without extra tooling:

- **QEMU monitor socket** (quickemu creates `<vm>/<vm>-monitor.socket`): `screendump` writes a screenshot Claude can read; `sendkey` types keys. Enough for "boot → revert → launch installer → screenshot-verify" loops driven from a session.
- **Guest SSH:** quickemu forwards guest port 22 to a host port (printed at boot). Enable OpenSSH Server in the Windows baseline before snapshotting `clean`, and command-level assertions (`Get-Command claude`, registry PATH checks) become scriptable.

Alternative zero-setup path: [dockur/windows](https://github.com/dockur/windows) runs Windows-in-KVM inside the already-installed Docker with a browser-based viewer (`-p 8006:8006`) — handy if quickemu ever misbehaves, but snapshots are manual file copies, so quickemu remains the primary recommendation.

Wrap this into `scripts/vm/` helpers only after the first real pass validates the commands above — the 2026-04-29 investigation's lesson is that untested provisioning scripts fail silently.

## Costs

~7 GB ISO + ~20 GB installed per Windows VM; ~5 GB per Linux VM (sparse qcow2 — `du -h`, not `ls -l`, shows real usage). Budget ~50 GB total for the full matrix; the host has ~447 GB free.
