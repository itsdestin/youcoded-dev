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
printf 'gl="on"\n'  >> ~/vms/macos-sonoma.conf     # gtk + GL: accelerated
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
| ubuntu-24.04 | `youcoded-testin` | `youcodedtesting` |

The Ubuntu username really is `youcoded-testin` — read from `getent passwd 1000`, not from memory
(Ubuntu's installer truncated what was typed). Password is the full `youcodedtesting`.

## Testing a beta / dev build — the loop

Verified end-to-end 2026-07-16 with the real `YouCoded.Setup.1.2.4.exe` (111 MB).

**1. Get a build.** CI has a manual beta job — `youcoded/.github/workflows/desktop-test-build.yml`
(`workflow_dispatch`; builds `.exe` / `.dmg` / `.AppImage`, stamps `YOUCODED_BUILD_CHANNEL=BETA` so
Settings → About reads `YouCoded v1.3.0-beta (BETA)`):

```bash
cd youcoded
gh workflow run desktop-test-build.yml -f version=1.3.0-beta      # see the version caveat below
gh run watch "$(gh run list -w desktop-test-build.yml -L1 --json databaseId -q '.[0].databaseId')"
gh run download "$(gh run list -w desktop-test-build.yml -L1 --json databaseId -q '.[0].databaseId')" -D ~/vms/share
# or take shipped artifacts straight from a release:
gh release download v1.2.4 -p 'YouCoded.Setup.*.exe' -D ~/vms/share
```

The `version` input **must sort above the latest release** — `compareVersions` parses naively, so
`1.2.4-beta` → `[1,2,0]`, which is *lower* than `1.2.4` and the build offers to "update" itself back
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

## Driving guests from a session: the QEMU guest agent

**The most useful thing here.** quickemu's Windows answer file installs `qemu-ga` (plus spice-vdagent,
spice-webdavd and the virtio GPU driver) from the virtio ISO, and exposes it at
`<vm>/<vm>-agent.sock`. That makes the guest scriptable — no SSH, no `sendkey` roulette.

**Linux guests need the agent installed once, by hand.** quickemu wires the host-side channel for
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

**The `winget absent` row is a feature, not a defect.** `prerequisite-installer.ts` branches on
`detectWinget`, and a fresh offline Win11 genuinely has no winget until the Store provisions App
Installer — so this baseline exercises the **native `claude.ai/install.ps1` fallback path** for real.
A `clean-winget` second snapshot (boot, let the Store provision App Installer, re-snapshot) would
cover the other branch. Two snapshots, two code paths — worth doing before trusting either.

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
Tracked in ROADMAP.

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
