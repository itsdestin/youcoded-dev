# VM Testing (Linux host) — installer, first-run, and sign-in flows

How to spin up clean Windows and Linux virtual machines on the current dev machine (CachyOS, Ryzen AI Max+ 395, 121 GB RAM) to test YouCoded's installers, prerequisite installer, setup wizard, and sign-in flows without ever touching the live app or the host's `~/.claude`.

> **History:** the archived `docs/archive/local-dev-vm.md` covered the same goal for a **Windows host** (VirtualBox + `docs/archive/setup-test-vm.ps1`, moved out of `scripts/` 2026-09-23 since this path was never used). That path was blocked by the Hyper-V conflict (`docs/archive/investigations/2026-04-29-vbox-hyperv-conflict.md`) and never used. None of that applies here — this host runs native KVM with no competing hypervisor, so installs run at full speed (~20–30 min for Windows, once, then snapshot-revert in seconds). The snapshot-revert methodology and "when to use this" list carry over.

## Quick loop — `scripts/vm/vm.sh` (start here)

Since 2026-10-01 this is how a session puts a build in front of Destin, or checks one itself, on
any of the three guests. Use it whenever a change touches what a new user sees **before the app's
own UI**: installer, signing (SmartScreen / Gatekeeper), first launch, prerequisite install,
sign-in, first chat. **After any signing change, run the first-run wall on Windows and Mac with a
build that carries it** — that is the only place the user-facing result is visible.

```bash
scripts/vm/vm.sh win start            # restore the saved "ready" desktop (~5 s) + open a window on Destin's screen
scripts/vm/vm.sh win load beta        # newest pre-release installer -> guest Downloads, marked as an internet download
scripts/vm/vm.sh win stop             # throw the session away; next start is pristine again
```

| Guest | Name | Restore | Window | Remote access |
|---|---|---|---|---|
| Windows 11 | `win` | ~5 s | SPICE viewer (`spicy`), close/reopen freely with `view` | QEMU agent (runs as SYSTEM) |
| Ubuntu 24.04 | `ubuntu` | ~3 s | SPICE viewer | SSH `youcoded-testin@127.0.0.1:22221`, passwordless sudo |
| macOS 26 Tahoe | `mac` (or `tahoe`) | — (no ready state yet) | QEMU's own GTK window (GL on); closing it stops the guest | SSH `yctesting@127.0.0.1:22223`, passwordless sudo. The only Mac since 2026-10-04 (the Sonoma VM was deleted to free disk): it has Liquid Glass and the icon looks (Default/Dark/Clear/Tinted). Leave **Reduce transparency off** — the glass is what it tests |

All SSH uses `~/vms/vm-key` (host-only keypair). `load` takes `release`, `beta`, a tag (`v1.3.0`),
`run:<CI run id>` (test-build artifacts) or a local file; Linux defaults to the AppImage
(`VM_LINUX_FMT='*.deb'` for the deb). `--headless` on `start` skips the window when a session only
needs `shot` / `exec`. Other verbs: `view`, `shot <name>`, `exec <cmd…>`, `save-ready`.

**How it works, and the traps it encodes** (each has a WHY comment in the script):
- **"ready" = a RAM snapshot** (`<vm>/ready.state`, 3–7 GB) paired with the disk snapshot `ready`.
  It only works with a migratable machine, so `vm.sh` launches its own copy of quickemu's
  generated `<vm>.sh` with: no `+invtsc` / `migratable=no` / `hv_passthrough` (explicit Hyper-V
  enlightenments instead), 8 GB RAM instead of 32, and the Mac's `virtio-sound` swapped for Intel
  HDA (macOS has no driver for it, so the Mac guest is silent). **The same edits must apply at save
  and restore** — if quickemu regenerates `<vm>.sh` with a different device list, re-run
  `save-ready` from a fresh boot.
- **The clock is reset after every restore** (the guest wakes believing it is still the save
  moment): Windows via `guest-set-time` *with an explicit time* (no-argument form re-reads the
  stale RTC), Ubuntu via `sudo date`. The Mac has no passwordless sudo, so its clock runs behind
  until macOS re-syncs on its own — harmless for install testing; give Destin's Mac password to a
  session and it can add a sudoers entry like Ubuntu's.
- **Files arrive over HTTP from `~/vms/serve`** (host `127.0.0.1:8010`, guest `10.0.2.2:8010`) and
  get the browser's mark: Windows `Zone.Identifier` (ZoneId=3), Mac `com.apple.quarantine`. Without
  it SmartScreen and Gatekeeper never assess the file, which is the whole point.
- **Each guest has a fixed SSH forward** (22220 Windows, 22221 Ubuntu, 22223 Mac); quickemu gave
  Windows and Mac the same port, so the second to start died.
- **Without a ready state, `start` boots the disk as it is** (setup mode) — it never reverts to
  `clean`, because that erased a half-finished Mac setup once.

Re-creating a ready state: `start` (boots the current disk), get the desktop how you want it,
then `save-ready` (stops the guest, ~1 min). Older disk snapshots (`clean`, Mac's
`beta8-signed-in-2026-07-20`) are untouched and still usable with `qemu-img snapshot -a`.

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

**Snapshots only while powered off.** `--snapshot` wraps `qemu-img` internal snapshots. Shut a guest
down from the monitor rather than killing it — `( echo "system_powerdown"; sleep 2 ) | socat -
unix-connect:<vm>/<vm>-monitor.socket` sends ACPI and both guests power off cleanly in seconds.
Confirm with `qemu-img snapshot -l <vm>/disk.qcow2`; quickemu's own `--snapshot info` prints image
info, not the snapshot table.

**Wait for the poweroff — don't time-box it.** ACPI shutdown can be *delayed by a modal dialog in the
guest* (Ubuntu's "System program problem detected" apport prompt held one up here). A wait loop with a
timeout will fall through and revert against a live VM:

```bash
# WRONG — falls through after 120s and reverts anyway
end=$(( $(date +%s) + 120 )); while [ $(date +%s) -lt $end ]; do pgrep -f ... || break; sleep 5; done
quickemu --vm x.conf --snapshot apply clean && echo "reverted"     # prints success even if it failed

# RIGHT — block until it's actually gone, then revert
until ! pgrep -f "[q]emu-system-x86_64.*<vm>" >/dev/null; do sleep 3; done
quickemu --vm x.conf --snapshot apply clean
```

qcow2 file locking means a revert against a running VM **errors rather than corrupts** (verified:
`corrupt: false` after this happened), but quickemu can still exit 0, so `&& echo "reverted"` lies.
**Verify the revert took** instead of trusting it — boot and check that whatever you installed is gone.

Cosmetic aftermath: crash-y testing leaves Ubuntu showing *"System program problem detected"* (apport
caught a killed/core-dumping process). It's test debris, not a guest fault, and reverting clears it.

### The black screen is `spice` + GL, NOT GL itself — don't over-correct like I did

**Symptom:** with quickemu's SPICE default, GL selects `-display egl-headless`, which on this host's
Radeon 8060S renders **a permanently black screen** the moment the guest leaves text mode — in the
viewer *and* in `screendump`, so you can't see what's wrong. The VM is alive at high CPU and looks
exactly like a hang. Cost an hour to spot.

**The fix is picking a working display path, not disabling GL globally:**

| display | GL | result |
|---|---|---|
| `spice` (egl-headless) | on | ❌ **black screen** |
| `spice` (qxl-vga) | **off** | ✅ works — plus clipboard, WebDAV, `--spice-shared-dir` |
| `gtk` | **off** | ✅ works, but **every frame is blitted on the CPU** |
| `gtk` | **on** | ✅ works, GPU-accelerated (verified on macOS 2026-07-16) |

Blanket `gl="off"` was the wrong lesson to draw from the black screen: `gtk,gl=on` renders fine and
lets the GPU do the blitting, while `gl=off` forces **software rendering of every frame** on a machine
with a perfectly good iGPU idle. That's a latency floor no amount of resolution reduction fixes —
proven the hard way: halving macOS's pixels (1920×1080 → 1280×800) changed the perceived lag **not at
all**, because the bottleneck was the CPU blit path, not fill rate.

```bash
printf 'gl="on"\n'  >> ~/vms/macos-tahoe.conf      # gtk + GL: accelerated
# For Windows/Ubuntu, gtk+gl=on is UNTESTED here — only spice+gl=on (black) and
# gtk/spice+gl=off (fine) were tried. Test before trusting it.
```

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

### Installing macOS: the OpenCore picker will loop you back into Recovery

The install is **multi-phase with reboots**, and quickemu's OpenCore picker defaults to the **first**
entry — `macOS Base System` (Recovery). So after the copy phase reboots the VM, it lands back in the
Recovery menu and looks like the install failed or reset. It didn't; you just booted the wrong entry.

After the first reboot the picker gains a second entry. **Pick `macOS Installer`, not `macOS Base
System`:**

```
[macOS Base System]  [macOS Installer]  [Recovery (dmg)]  [UEFI Shell]  [Reset NVRAM]
        ^ default — Recovery         ^ the one that continues the install
```

**The picker times out in a couple of seconds**, so a screenshot-then-react loop is always too late.
Poll for it and press the arrow the instant it appears — any keypress also *stops* the countdown, so
once one lands you can take your time. The picker screen fingerprints at `mean ≈ 930` (vs `≈ 6100`
for the Recovery menu, `≈ 170` for the Apple-logo boot):

```bash
( echo "system_reset"; sleep 1 ) | socat - unix-connect:<vm>/<vm>-monitor.socket
for i in $(seq 1 40); do
  ( echo "screendump /tmp/poll.ppm"; sleep 0.4 ) | socat - unix-connect:<vm>/<vm>-monitor.socket
  m=$(magick /tmp/poll.ppm -format "%[mean]" info: | cut -d. -f1)
  if [ "$m" -gt 800 ] && [ "$m" -lt 1100 ]; then       # picker is up
    ( echo "sendkey right"; sleep 0.6 ) | socat - unix-connect:<vm>/<vm>-monitor.socket
    break
  fi
  sleep 1
done
# confirm "macOS Installer" is highlighted, then: sendkey ret
```

**Tahoe boots to the OpenCore picker EVERY time, defaulting to `macOS Base System`** (Recovery),
not only during the install — so a restart lands on the four-option Recovery menu and looks like a
failed install. With five entries the picker fingerprints at `mean ≈ 935`, the figure above; a
three-entry picker (fresh disk) reads `≈ 550`, and a watcher tuned on that missed every restart
(2026-10-04, two "failed" installs that had in fact finished stage one). `bless --setBoot` is refused
(SIP). Until a `ready` state exists, catch the picker and pick the second entry. Setup Assistant can
also hang on "Update Mac Automatically" (spinner, grey Continue): a `system_reset` and resume skips it.

**In Disk Utility, erase the ~137 GB disk only** (View → Show All Devices). The ~25 MB one is
OpenCore, the boot loader: erasing it (2026-10-04, Tahoe) leaves every boot in the UEFI shell.
Recovery: stop the VM, put a fresh `OpenCore.qcow2` back from `https://github.com/kholia/OSX-KVM/raw/<OSX_KVM_COMMIT>/OpenCore/OpenCore.qcow2`
(the commit is in `/usr/bin/quickget`), start again.

**Don't panic when the disk shrinks.** It went 28 GB → 16 GB here at the hand-off into the real
install phase: that's APFS issuing TRIM as it prepares the target volume and qcow2 reclaiming the
freed blocks — not lost progress. It climbs again immediately.

### macOS performance: what's fixable and what isn't

macOS in QEMU is **sluggish, permanently**, and it's worth knowing why before burning an evening on it
(I burned one). There is **no GPU acceleration available at any price on this host**:

- **No paravirtualized path** — virgl/VirtIO-GPU 3D [only works with Linux guests](https://wiki.archlinux.org/title/QEMU/Guest_graphics_acceleration); macOS has no VirtIO-GPU driver.
- **No passthrough path** — Apple's AMD support [stops at RDNA 2](https://dortania.github.io/GPU-Buyers-Guide/modern-gpus/amd-gpu.html) (Navi 21/23). The Radeon 8060S is **RDNA 3.5**, a generation past unsupported, and since Apple ended Intel Macs *support will never be added*. Passing it through would also blind the host (it's the only GPU) and Strix Halo's iGPU has a once-per-boot reset bug.

So the levers are only: **let QEMU use the GPU to blit** (`gtk` + `gl="on"` — the big one; `gl="off"`
means CPU-blitting every frame), and **make macOS composite less** (System Settings → Accessibility →
Display → **Reduce transparency** + **Reduce motion**; the blur passes are expensive in software).
Bake those into the snapshot so reverts inherit them.

**Resolution is NOT a lever** — verified: 1920×1080 → 1280×800 halved the pixels and changed the
perceived lag not at all. Don't repeat that experiment. (Changing it means editing OpenCore's
`config.plist`, since it hard-codes `Resolution` = `1920x1080@32` and overrides the `OVMF_VARS-*.fd`
that quickemu picks — swapping in `OVMF_VARS-1024x768.fd` does nothing. The `@32` there is **bits per
pixel, not Hz**; there is no refresh rate to raise, because `vmware-svga` is a dumb framebuffer with no
scanout clock.)

**Also expect:** macOS ignores ACPI `system_powerdown` — shut it down from the Apple menu, by hand.
And a fresh install runs **Spotlight indexing at ~350% CPU** for a while; let it finish before
snapshotting so every revert boots settled instead of re-indexing.

Verdict: fine as a **functional** target (click through install/setup/sign-in once per release), never
pleasant to drive. For anything genuinely interactive, the `macos-latest` CI runner + a borrowed or
rented Mac beats it — and tests arm64, which this VM can't.

### What a macOS VM can't tell you

- **x64 only — this is the real limitation, and it isn't AMD.** Apple Silicon cannot be virtualized
  on x86 hardware, so the VM exercises the **x64** `.dmg` while most Mac users today are arm64.
  First-run logic is largely arch-independent, so it's still real signal — just know the gap.
- **No GPU acceleration** — macOS has no virtio-gpu driver. Software rendering; Electron is sluggish
  but fine for click-through flow testing.
- **Apple ID sign-in won't work** (no valid serials). Irrelevant here — Claude sign-in is browser
  OAuth.
- **Gatekeeper will block the app — this is expected and already documented for users.**
  The app is **self-signed** (`identity: '-'` in `youcoded/desktop/electron-builder.yml` — "ad-hoc",
  no Apple certificate, no notarization; a Developer ID is $99/yr), so macOS still blocks it on
  first launch as *unverified*. That part is a known, accepted trade-off, **not a bug**: the download
  page ships a full walkthrough for it —
  `youcoded/docs/index.html` → `dl-macos` install-tips modal (drag to Applications → *"Apple cannot
  check it for malicious software"* → System Settings → Privacy & Security → **Open Anyway**).
  What IS a bug: an app with **no** signature at all (no `Contents/_CodeSignature`), which macOS
  rejects as *broken* — no "Open Anyway" button. That shipped for six weeks in 2026 and is now
  caught by CI (`docs/build-and-release.md` → the dmg check).
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
| ubuntu-24.04 | `youcoded-testin` | `youcodedtesting` |
| macos-tahoe | `yctesting` (admin; vm-key installed; passwordless sudo) | `youcodedtesting` (vm.sh's default Mac user) |

The Ubuntu username really is `youcoded-testin` — read from `getent passwd 1000`, not from memory
(Ubuntu's installer truncated what was typed). Password is the full `youcodedtesting`.

## Testing a beta / dev build — the loop

> **Superseded for everyday use by the Quick loop above** (`vm.sh start` + `vm.sh load`), which
> avoids the stale-share and SYSTEM-copy traps below. Kept for the manual commands and history.

Verified end-to-end 2026-07-16 with the real `YouCoded.Setup.1.2.4.exe` (111 MB).

**1. Get a build.** CI has a manual beta job — `youcoded/.github/workflows/desktop-test-build.yml`
(`workflow_dispatch`; builds `.exe` / `.dmg` / `.AppImage`, stamps `YOUCODED_BUILD_CHANNEL=BETA` so
Settings → About reads `YouCoded v1.3.0-beta.71 (BETA)`):

```bash
cd youcoded
gh workflow run desktop-test-build.yml      # numbers itself: <base>.<run number>, e.g. 1.3.0-beta.71
gh run watch "$(gh run list -w desktop-test-build.yml -L1 --json databaseId -q '.[0].databaseId')"
gh run download "$(gh run list -w desktop-test-build.yml -L1 --json databaseId -q '.[0].databaseId')" -D ~/vms/share
# or take shipped artifacts straight from a release:
gh release download v1.2.4 -p 'YouCoded.Setup.*.exe' -D ~/vms/share
```

The build stamps `<base>.<GitHub run number>` automatically (2026-08-15), so there is no number to
type; the `base` prefix (default `1.3.0-beta`) **must sort above the latest release** — `compareVersions` orders
semver-style, so `1.2.4-beta.N` is *lower* than `1.2.4` and the build offers to "update" itself back
to the release. Bump the minor and suffix (`1.3.0-beta`), don't patch the current version.

**A VM is the right home for these builds.** Per `version-line.ts`, test builds install *over* a real
install and share its appId — on Destin's machine only the `(BETA)` line distinguishes them. A guest
has no real install to collide with, and `--snapshot apply clean` undoes the whole thing.

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

**Prefer HTTP for putting a file in the user's Downloads.** On 2026-09-10 (`clean` snapshot), copying
from `\\10.0.2.4\qemu` inside the logged-in session — Run box, `powershell -c "copy …"` — silently
copied nothing, twice; `powershell -c "iwr http://10.0.2.2:8010/<file> -OutFile $env:USERPROFILE\Downloads\<file>"`
worked first time. The cause was not traced. Also: a backslash before a closing quote in a Run-box
command (`…\Downloads\"`) swallows the quote and breaks the whole command.

**Driving the guest with no window on the host:** `scripts/vm/vmctl.sh` — `boot` (revert `clean`, start
`--display none` with a share dir), `keys` / `type` (monitor `sendkey`), `shot` (`screendump` → PNG),
`exec` (the agent), `off`. The Windows desktop still renders for `screendump`; the 2026-09-10 before/after
installer test ran entirely this way, with nothing painted on Destin's screen.

## Driving guests from a session: the QEMU guest agent

**The most useful thing here.** quickemu's Windows answer file installs `qemu-ga` (plus spice-vdagent,
spice-webdavd and the virtio GPU driver) from the virtio ISO, and exposes it at
`<vm>/<vm>-agent.sock`. That makes the guest scriptable — no SSH, no `sendkey` roulette.

**Linux guests: use SSH, not the agent.** Measured 2026-10-01: quickemu's generated
`ubuntu-24.04.sh` has no agent channel at all (no `<vm>-agent.sock` appears), so `vm.sh` reaches
Ubuntu over SSH instead. Earlier text, kept for history: quickemu wires the host-side channel for
every guest, but only Windows gets the software auto-installed — on Ubuntu nothing answers the socket
until you install it, and you can't do that *through* the agent. Run this once in the guest's own
terminal, then re-take the `clean` snapshot so every revert keeps it:

```bash
sudo apt install -y qemu-guest-agent spice-vdagent    # vdagent = clipboard + auto-resize
```

Everything else is already at parity — `gl="off"`, snapshot/revert, `screendump`/`sendkey`, and the
SMB share (GNOME Files browses `smb://10.0.2.4/qemu` natively via gvfs; no `cifs-utils` needed).

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

**The `winget absent` row is a feature, not a defect.** Setup no longer uses winget for Git or
Node (2026-10-02: portable Git and the Node zip into the user folder), so this baseline is the
case that used to dead-end and now must not. winget remains only for Tailscale, rclone and `gh`
(`detectWinget` callers); a `clean-winget` snapshot would cover those.

## Verified Ubuntu baseline (`clean` snapshot, 2026-07-16)

Snapshot **includes qemu-guest-agent + spice-vdagent** (installed by hand, then re-snapshotted), so
`vm-exec.sh` works on every revert. Verified via the agent:

| Check | State |
|---|---|
| node / npm / git / claude / **curl** | **all absent** (`wget`, `python3`, `gio` present) |
| **libfuse2** | **absent** — the AppImage FUSE failure reproduces exactly |
| qemu-guest-agent / spice-vdagent | ✅ enabled |
| Version | Ubuntu 24.04.4 LTS, kernel 7.0.0-28 |

**`guest-exec` runs as `root` here, not SYSTEM** — the opposite of the Windows caveat, and it means a
`.deb` install (`dpkg -i`, genuinely a root action) *is* scriptable through the agent. Launching the
app still needs a user session with `$DISPLAY`; headless it dies with `Missing X server or $DISPLAY`.

### What the Linux baseline proves (verified 2026-07-16)

Running the shipped `YouCoded-1.2.4.AppImage` on this pristine guest reproduces the real user
experience exactly:

```
dlopen(): error loading libfuse.so.2
AppImages require FUSE to run.
```

`apt install libfuse2t64` clears it (the app then reaches Electron). **The download page already
documents this correctly** — `youcoded/docs/index.html` → `dl-linux` tells users
`sudo apt install libfuse2`, and that command **was verified to work on a pristine 24.04**: `libfuse2`
no longer exists as a real package there (renamed `libfuse2t64` in the 64-bit `time_t` transition;
`apt-cache policy libfuse2` → `Candidate: (none)`), but apt resolves it via Provides and installs the
right thing. Don't "fix" the doc to say `libfuse2t64` — the current text is correct *and* portable
across Debian/Mint.

**Coming: deb/rpm/pacman are untested.** Those targets were added in youcoded#98 (2026-05-20), which
**postdates the v1.2.4 tag (2026-05-18)** — so no release has ever shipped them, and v1.2.4 offers
Linux users only the AppImage. When v1.3 ships they will be brand-new artifacts on their first
contact with real distros: install each in the matching guest (`dpkg -i` on Ubuntu, `rpm -i` on
Fedora, `pacman -U` on Arch), and check the `pacman.depends` override in `electron-builder.yml`
actually resolves — its WHY comment flags `libappindicator-gtk3` as AUR-only.

### The .deb removes the FUSE problem entirely (tested 2026-07-16)

Built locally (`npx electron-builder --linux deb`) and installed on the pristine guest. Measured, in
the VM, with real `dpkg`:

```
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils,
         libatspi2.0-0, libuuid1, libsecret-1-0
Recommends: libappindicator3-1          # fuse mentions: 0
```

**No FUSE anywhere.** `apt install ./youcoded_1.2.4_amd64.deb` resolves every dependency itself,
installs to `/opt/YouCoded/youcoded`, and registers `/usr/share/applications/youcoded.desktop` — a
real menu entry the AppImage never provides. The binary then starts with no FUSE error (headless it
stops at `Missing X server or $DISPLAY`, as expected).

So the answer to *"can we auto-install FUSE instead of telling users to run terminal commands?"* is:
**don't — ship the .deb and the need disappears.** It's already built (#98) and lands with v1.3.

**⚠️ The gap that will bite:** the download page hardcodes the AppImage for Linux —
`youcoded/docs/index.html` → `matchers`:

```js
'dl-linux':   function(n) { return /\.AppImage$/i.test(n); },
```

When v1.3 ships `.deb`/`.rpm`/`.pacman`, that matcher still hands **every** Linux user the AppImage
and its FUSE step. Offering deb → Debian/Ubuntu/Mint, rpm → Fedora, pacman → Arch, and AppImage only
as the any-distro fallback covers the large majority of Linux desktops with **zero terminal**.
Closed — see `docs/roadmap/shipped.md`.

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

## Claude-driven testing

Use `scripts/vm/vm.sh` (Quick loop above): `--headless` start, `shot`, `exec`, and for Ubuntu/Mac
SSH with `~/vms/vm-key`. Keys and typing without remote access: `scripts/vm/vmctl.sh keys|type`
(set `VMCTL_VM`). Two monitor-socket traps still apply when driving by hand: keep the socket open
for the reply (`( echo cmd; sleep 1 ) | socat - unix-connect:<sock>`), and `quit` ends the guest —
which is exactly what `vm.sh stop` uses it for. The whole-path automated test is a parked roadmap
idea (`docs/roadmap/dev-workspace.md`, "Nothing tests a new user's whole path").

## Costs

Measured on the first real run: Win11 ISO 8.5 GB + **11 GB installed** (64 GB virtual disk, sparse
qcow2 — `du -h`, not `ls -l`, shows real usage); Ubuntu ISO 6.7 GB. Budget ~50 GB for the full
matrix; the host had ~425 GB free after both ISOs landed. Install wall-clock: **~15 min** for
Windows at native KVM speed (the `install.wim` extraction that took 1–3 hr under the old
Hyper-V-crippled VirtualBox rig ran at ~2.5 GB per 30 s here).
