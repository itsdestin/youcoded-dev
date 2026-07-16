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
| RAM / disk | 121 GB / ~425 GB free |
| Tooling | quickemu 4.9.9 + qemu-desktop 11.0.2 installed |
| Win11 guest | **provisioned + `clean` snapshot; revert→boot verified (~50 s to desktop)** |
| Ubuntu 24.04 guest | **provisioned + `clean` snapshot; revert→boot verified (~45 s to desktop)** |

Both guests are ready to test against right now — `~/vms/windows-11.conf`, `~/vms/ubuntu-24.04.conf`.

## One-time setup

Install quickemu **and `qemu-desktop`** (AUR + official repos):

```bash
paru -S quickemu qemu-desktop
```

`qemu-desktop` is not optional and quickemu will not pull it in: quickemu's `qemu` dependency
resolves to **`qemu-base`, which has zero display backends**, and the VM dies at launch with
`There is no option group 'spice'`. Verify before your first boot — the list must include `gtk`:

```bash
qemu-system-x86_64 -display help
```

If package downloads 404 with "failed retrieving file … from <mirror>", the pacman database is
stale (mirrors delete superseded packages). Sync first: `paru -Syu`.

Create a home for VM disks — **outside** the repos and **outside** any synced folder (`~/YouCoded/` syncs to GitHub; a 20 GB disk image must never land there):

```bash
mkdir -p ~/vms && cd ~/vms
```

quickemu creates VMs in the current directory — always run it from `~/vms`.

## Windows 11 VM

```bash
cd ~/vms
quickget windows 11        # generates the VM config, answer file + driver ISOs
quickemu --vm windows-11.conf
```

The install is **near-unattended** — quickemu injects an answer file that partitions, selects Pro via a
generic product key, bypasses the Microsoft-account OOBE + the TPM/SecureBoot/CPU/RAM requirement
checks, installs virtio/SPICE drivers, and creates a local account (**user `Quickemu`, password
`quickemu`**). Expect ~20–30 min at native KVM speed. An unactivated Win11 runs indefinitely for
testing (desktop watermark only).

**You must click Next through two screens first** ("Select language settings", "Select keyboard
settings"). This is not a bug: quickemu's answer file defines no `Microsoft-Windows-International-
Core-WinPE` component, so Setup prompts for them. Everything after "We're getting a few things
ready" is automatic. Drive them from the monitor if you're scripting: `sendkey ret`, wait, repeat.

Two things `quickget windows 11` gets wrong on this host — check both before booting:

1. **The ISO download is blocked.** Microsoft 404s/blocks quickget's automated request by IP
   (`WARNING! Microsoft blocked the automated download request based on your IP address`).
   quickget continues anyway and leaves **no `windows-11.iso`**. Download the ISO manually in a
   browser from <https://www.microsoft.com/en-us/software-download/windows11> and drop it at
   `~/vms/windows-11/windows-11.iso`. Any multi-edition x64 ISO works — the answer file selects
   Pro via a generic product key and sets no locale, so an EN-US ISO is fine (verified with
   `Win11_25H2_English_x64_v2.iso`, 8.5 GB).
2. **`virtio-win.iso` may land as a ~4 KB stub** when its download fails the same way. Check with
   `file windows-11/virtio-win.iso` — it must say `ISO 9660 … 'virtio-win-<version>'`, not
   `ASCII text`. Re-fetch:
   ```bash
   curl -Lo ~/vms/windows-11/virtio-win.iso \
     https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso
   ```

### The "Press any key to boot from CD or DVD" trap

The Windows ISO shows this prompt **~3–5 s after launch** and waits ~5 s. Miss it and UEFI falls
through to PXE and parks there forever — the screen reads `failed to start Boot0002 "UEFI QEMU
DVD-ROM" … : Time out` then `>>Start PXE over IPv4`. That is the failure, not a hang.

quickemu sends its own `sendkey ret` burst at launch, but **it fires before the prompt appears and
the keypress is lost.** Either press a key in the VM window yourself within the first ~5 s, or
drive the monitor socket on the timing below (verified working):

```bash
cd ~/vms && quickemu --vm windows-11.conf --display spice > boot.log 2>&1 &
until [ -S windows-11/windows-11-monitor.socket ]; do sleep 0.2; done
sleep 2.5                                   # prompt lands ~t=3s
( for i in $(seq 1 30); do echo "sendkey ret"; sleep 0.2; done ) \
  | socat - unix-connect:windows-11/windows-11-monitor.socket
```

This is a **one-time** cost: once the `clean` snapshot exists, reverts boot from disk with no prompt.

When the desktop appears, **power the VM off** (shut down inside Windows), then take the baseline:

```bash
quickemu --vm windows-11.conf --snapshot create clean
```

Test cycle (verified on both guests — revert is instant, boot ~45–50 s to desktop):

```bash
quickemu --vm windows-11.conf --snapshot apply clean   # revert (VM must be powered off)
quickemu --vm windows-11.conf --display gtk            # boot from disk; no ISO, no key-press trap
```

**Snapshots only while powered off.** `--snapshot` wraps `qemu-img` internal snapshots; snapshotting
or reverting a running VM corrupts the disk. Shut a guest down from the monitor rather than killing
it — `( echo "system_powerdown"; sleep 2 ) | socat - unix-connect:<vm>/<vm>-monitor.socket` sends
ACPI and both guests power off cleanly in a few seconds. Confirm with `qemu-img snapshot -l
<vm>/disk.qcow2`; quickemu's own `--snapshot info` prints image info, not the snapshot table.

### Set `gl="off"` — this is mandatory, on every guest

**The single highest-value line in this doc.** With GL on, quickemu selects `-display egl-headless`,
which on this host's Radeon 8060S renders **a permanently black screen** the moment the guest leaves
text mode — in the viewer window *and* in `screendump`, so you cannot see what's wrong. The VM is
alive at high CPU and looks exactly like a hang. Cost us an hour before we spotted it.

```bash
printf 'gl="off"\n' >> ~/vms/<vm>.conf     # do this for every VM you create
```

The **display backend is not the problem** — `spice` renders fine once GL is off (`qxl-vga, GL (off)`),
and **`--display spice` is the better choice**: it adds clipboard sharing (spice-vdagent), WebDAV, and
the `spicy` viewer's `--spice-shared-dir`, none of which `gtk` gives you. `screendump` works under both.

## Linux VMs

One VM per package format we ship (`youcoded/desktop/electron-builder.yml`: AppImage, deb, rpm, pacman):

```bash
cd ~/vms
quickget ubuntu 24.04      # deb + AppImage testing (the mainstream case)
quickget fedora 42         # rpm (optional)
quickget archlinux latest  # pacman artifact (optional — never test it on the host)
printf 'gl="off"\n' >> ubuntu-24.04.conf
quickemu --vm ubuntu-24.04.conf --display gtk
```

Unlike Windows there's no ISO-download block and no "press any key" trap — GRUB boots straight to
`Try or Install Ubuntu` and the live desktop comes up in <1 min. But the install is **not**
unattended: click through Ubuntu's installer once (~10 min), power off, snapshot `clean` as above.

Wizard answers that keep the guest a realistic clean user machine: **leave both "Install recommended
proprietary software" boxes unchecked** (irrelevant under virtio-vga, and stock is what we're
testing against), *Interactive installation* → *Default selection*, and **"Erase disk and install
Ubuntu"** — safe, it only ever sees the blank virtual disk, never the host's drives.

## macOS

**Licensing:** Apple's macOS license permits running it only on Apple-branded hardware, so a VM here
is outside that term. It's a civil license matter; Destin made an informed call that testing his own
app is a reasonable use. Noted once, here, so it doesn't get re-litigated every session.

**The AMD problem mostly doesn't apply to VMs** — the single most misleading thing in the forums.
[AMD_Vanilla](https://github.com/AMD-OSX/AMD_Vanilla) kernel patches are for **bare-metal**
hackintosh, where macOS sees the real CPU. quickemu masks the CPU entirely on AMD hosts:

    -cpu Haswell-v2,vendor=GenuineIntel,-pdpe1gb,+avx,+sse,+sse2,+ssse3,vmware-cpuid-freq=on

The guest thinks it's an Intel Haswell, so Zen 5 novelty is largely irrelevant and no kernel patches
are needed. [OSX-KVM](https://github.com/kholia/OSX-KVM): *"modern AMD Ryzen processors work just
fine (even for macOS Sonoma)."*

**This host passes every gate quickemu enforces** (verified 2026-07-16 against `/proc/cpuinfo`):

| Gate | Requirement | Result |
|---|---|---|
| Ventura+ CPU | `sse4_2` + `avx2` — hard `exit 1` if absent | ✅ both |
| Metal | `fma` | ✅ |
| AMD-mobile freeze | clocksource must be `tsc` | ✅ `tsc` |

That last row nearly bit us: quickemu warns *"macOS may freeze on AMD Ryzen mobile CPUs"*
([#1273](https://github.com/quickemu-project/quickemu/issues/1273)) and the Ryzen AI Max **is**
mobile-lineage silicon — but the gate only fires when the clocksource isn't `tsc`. If a future kernel
demotes the clocksource (check `/sys/devices/system/clocksource/clocksource0/current_clocksource`),
add `tsc=reliable` to the cmdline via `/etc/default/limine`, or use Big Sur/Monterey.

**Prerequisite:** `ignore_msrs` must be `Y` or macOS won't boot. `quickemu --ignore-msrs-always`
writes `/etc/modprobe.d/kvm-quickemu.conf` for future boots, but **does not change the running
kernel** — `kvm` is already loaded, so modprobe.d won't re-apply. Set it live (root):

```bash
cat /sys/module/kvm/parameters/ignore_msrs          # must read Y
echo 1 | sudo tee /sys/module/kvm/parameters/ignore_msrs
```

### What a macOS VM can't tell you

- **x64 only — this is the real limitation, and it isn't AMD.** Apple Silicon cannot be virtualized
  on x86 hardware, so the VM exercises the **x64** `.dmg` while most Mac users today are arm64.
  First-run logic is largely arch-independent, so it's still real signal — just know the gap.
- **No GPU acceleration** — macOS has no virtio-gpu driver. Software rendering; Electron is sluggish
  but fine for click-through flow testing.
- **Apple ID sign-in won't work** (no valid serials). Irrelevant here — Claude sign-in is browser
  OAuth.
- **Gatekeeper will block the app — this is expected and already documented for users.**
  `youcoded/desktop/electron-builder.yml` sets no signing identity and no notarize config (an Apple
  Developer cert is $99/yr), so the `.dmg` is unsigned and macOS blocks it on first launch. That is a
  known, accepted trade-off, **not a bug**: the download page ships a full walkthrough for it —
  `youcoded/docs/index.html` → `dl-macos` install-tips modal (drag to Applications → *"Apple cannot
  check it for malicious software"* → System Settings → Privacy & Security → **Open Anyway**).
  **This is the single highest-value thing a macOS VM can verify.** That walkthrough is
  hand-tuned to a specific macOS release's gatekeeping behavior (the source comment says as much),
  and Apple reworks this flow regularly — a clean VM is the only way to confirm the steps we tell
  users still match what macOS actually shows. Same applies to the Windows SmartScreen copy.

CI already builds the `.dmg` on `macos-latest` runners
(`youcoded/.github/workflows/desktop-release.yml`) — real Apple hardware and the natural home for an
automated smoke test. For arm64 / high-signal interactive work, a rented cloud Mac (AWS EC2 Mac,
MacStadium, Scaleway) or a borrowed one beats the VM, because it's what users actually run.

## Guest credentials

Local-only throwaway VMs, never internet-facing. Documented so a future session can sign into the
snapshot it reverts to — the same reason the archived Windows-host script documented its password.

| Guest | User | Password |
|---|---|---|
| windows-11 | `Quickemu` | `quickemu` (quickemu's answer-file default) |
| ubuntu-24.04 | `youcodedtesting` | `youcodedtesting` |

## Testing a beta / dev build — the loop

Verified end-to-end 2026-07-16 with the real `YouCoded.Setup.1.2.4.exe` (111 MB).

**1. Get a build.** CI already has a manual beta job — `youcoded/.github/workflows/desktop-test-build.yml`
(`workflow_dispatch`, builds `.exe` / `.dmg` / `.AppImage`):

```bash
cd youcoded
gh workflow run desktop-test-build.yml && sleep 5
gh run download "$(gh run list -w desktop-test-build.yml -L1 --json databaseId -q '.[0].databaseId')" -D ~/vms/share
# or ship-shape artifacts straight from a release:
gh release download v1.2.4 -p 'YouCoded.Setup.*.exe' -D ~/vms/share
```

**2. Launch the VM with the share attached** (host dir → `\\10.0.2.4\qemu` in the guest):

```bash
cd ~/vms && quickemu --vm windows-11.conf --display spice --public-dir ~/vms/share
```

**3. ⚠️ Bust the stale share after adding files.** `smbd` caches the directory listing for the life of
its process: **files added after the VM booted are invisible in the guest** — not a Windows cache, and
`net use /delete` doesn't help. Killing smbd makes slirp respawn it on next access; the VM keeps
running:

```bash
pkill -f "[s]mbd -l /tmp/qemu-smb"      # then re-list in the guest; new files appear
```

**4. Install it — by double-clicking in the VM**, as a real user would. See the SYSTEM caveat below;
this is also the actual thing under test (Gatekeeper/SmartScreen prompts, first-run, sign-in).

**5. Verify + reset:** inspect with the agent (below), then `--snapshot apply clean` to reset in seconds.

Alternatives if SMB misbehaves: the host is always `http://10.0.2.2` from inside a guest
(`python3 -m http.server 8010 -d ~/vms/share`), or download the release in the guest browser — which
additionally exercises the real SmartScreen path.

## Driving guests from a session: the QEMU guest agent

**The most useful thing here.** quickemu's Windows answer file installs `qemu-ga` (plus spice-vdagent,
spice-webdavd and the virtio GPU driver) from the virtio ISO, and exposes it at
`<vm>/<vm>-agent.sock`. That makes the guest scriptable — no SSH, no `sendkey` roulette:

```bash
( echo '{"execute":"guest-ping"}'; sleep 2 ) | socat - unix-connect:~/vms/windows-11/windows-11-agent.sock
# -> {"return": {}}

# Wrapped up for daily use — prints exit code + stdout/stderr:
scripts/vm/vm-exec.sh ~/vms/windows-11 powershell.exe -Command "Get-Command node"
```

`guest-exec` + `guest-exec-status` run a command and return base64 stdout/stderr;
`scripts/vm/vm-exec.sh` wraps that handshake. This is how the baseline below was verified. (The virtio ISO must be the real image, not the 4 KB stub — see above —
or none of these tools get installed.)

**⚠️ `guest-exec` runs as `NT AUTHORITY\SYSTEM`**, because qemu-ga is a LocalSystem service.
`$env:LOCALAPPDATA` resolves to `C:\Windows\System32\config\systemprofile\...`, so **running
electron-builder's per-user NSIS installer through the agent installs into the system profile and
tests a path no real user ever takes** (it registers an uninstall entry pointing at a nonexistent
path). Use the agent to *inspect*, and the GUI to *install*. Attempts to work around it — `schtasks
/ru <user> /it`, and the `explorer.exe <path>` launch trick — both failed here; don't burn time on it,
double-clicking is the real test anyway.

## Verified Windows baseline (`clean` snapshot, 2026-07-16)

Checked via guest-exec, so this is measured, not assumed:

| Check | State |
|---|---|
| node / npm / git / claude | **all absent** — a true clean machine |
| **winget** | **absent** — `Microsoft.DesktopAppInstaller` is NOT provisioned |
| Internet | ✅ github 200 · npmjs 200 · **`claude.ai/install.ps1` 200** |
| qemu-ga / spice-agent | ✅ Running (spice-webdavd installed but Stopped) |
| Build / resolution | Windows 11 Pro 25H2 (26200) · 1024×768 |

**The `winget absent` row is a feature, not a defect.** `prerequisite-installer.ts` branches on
`detectWinget`, and a fresh offline Win11 genuinely has no winget until the Store provisions App
Installer — so this baseline exercises the **native `claude.ai/install.ps1` fallback path** for real.
A `clean-winget` second snapshot (boot, let the Store provision App Installer, re-snapshot) would
cover the other branch. Two snapshots, two code paths — worth doing before trusting either.

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

- **QEMU monitor socket** (quickemu creates `<vm>/<vm>-monitor.socket`): `screendump` writes a screenshot Claude can read; `sendkey` types keys. Enough for "boot → revert → launch installer → screenshot-verify" loops driven from a session. Verified working — `sendkey ret` drove Windows Setup's screens, and `screendump` + ImageMagick (`magick x.ppm -format "%[mean]" info:`) is a cheap "has the screen changed?" probe. Three traps, all hit for real:
  - **Never send `quit`** — it terminates the VM. (Killed a booted VM mid-session.)
  - **`echo cmd | socat -` loses the command**: socat closes on EOF before QEMU processes it. Keep the connection open: `( echo "cmd"; sleep 2 ) | socat - unix-connect:<sock>`.
  - **`pkill -f qemu-system-x86_64` kills the shell running it** — the pattern matches its own command line, so the rest of your script silently never runs (exit 144). Use the bracket trick: `pkill -f "[q]emu-system-x86_64"`. Same for `pgrep` — it self-matches and reports a dead VM as alive.
- **Guest SSH:** quickemu forwards guest port 22 to a host port (printed at boot). Enable OpenSSH Server in the Windows baseline before snapshotting `clean`, and command-level assertions (`Get-Command claude`, registry PATH checks) become scriptable.

Alternative zero-setup path: [dockur/windows](https://github.com/dockur/windows) runs Windows-in-KVM inside the already-installed Docker with a browser-based viewer (`-p 8006:8006`) — handy if quickemu ever misbehaves, but snapshots are manual file copies, so quickemu remains the primary recommendation.

Wrap this into `scripts/vm/` helpers only after the first real pass validates the commands above — the 2026-04-29 investigation's lesson is that untested provisioning scripts fail silently.

## Costs

Measured on the first real run: Win11 ISO 8.5 GB + **11 GB installed** (64 GB virtual disk, sparse
qcow2 — `du -h`, not `ls -l`, shows real usage); Ubuntu ISO 6.7 GB. Budget ~50 GB for the full
matrix; the host had ~425 GB free after both ISOs landed. Install wall-clock: **~15 min** for
Windows at native KVM speed (the `install.wim` extraction that took 1–3 hr under the old
Hyper-V-crippled VirtualBox rig ran at ~2.5 GB per 30 s here).
