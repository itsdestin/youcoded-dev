---
date: 2026-09-03
status: active
type: investigation
topic: macOS 1.3.0-beta.72 is unopenable (unsigned bundle, no Gatekeeper override) — plus verification of an external postmortem's three findings, one of which is a false positive
---

# macOS beta.72: what a tester's postmortem got right, and what it got wrong

A Mac tester (macOS 26.5.2, Apple Silicon) could not launch `1.3.0-beta.72`, and their
Claude session produced two reports: a Gatekeeper diagnosis and a fuller postmortem of a
force-quit. This document records which claims survived verification **against the exact
shipped artifact**, which did not, and why.

Method: `gh release download 1.3.0-beta.72 --pattern '*arm64.dmg'`, extracted with `7z`,
inspected on Linux. Every hash below was recomputed here, not taken from the report.

## Confirmed, but it is a REGRESSION, not a standing gap

The shipped `1.3.0-beta.72` bundle has **no `Contents/_CodeSignature` directory**, and the
signature on its main binary is the stock prebuilt Electron one, untouched:

| Build | Signing identifier | Flags | Resource seal |
|---|---|---|---|
| `v1.2.4` (May 2026, last stable) | `com.youcoded.desktop` | `adhoc`, `runtime` | **present** |
| `1.3.0-beta.72` (Sept 2026) | `Electron` | `adhoc`, `linker-signed` | **absent** |

Read off both dmgs by parsing `LC_CODE_SIGNATURE` → `CodeDirectory` directly; the CMS blob
in v1.2.4 is 8 bytes, i.e. an empty certificate chain, so v1.2.4 is **ad-hoc, not
Developer ID**. That is the correct reading of "unverified but intact": it is what puts the
**Open Anyway** button in System Settings. beta.72 is not signed at all, which macOS reads
as a *broken* bundle — and there is no override UI for that.

**Nothing in our config changed.** `git log -S` across all branches shows signing config
(`CSC_LINK`, `notarize`, `afterSign`, `hardenedRuntime`, `entitlements`) has **never**
existed in this repo, and the only signing secrets on it are the Android keystore. The
release and beta workflows both just run `npm run build`.

**The cause is a dependency bump.** electron-builder ≤ 26.8.1 fell back to an ad-hoc
signature when it found no certificate:

    else if (noIdentity && fallBackToAdhoc) {
      log.warn(null, "falling back to ad-hoc signature for macOS application code signing")
      identity = new Identity("-", undefined)
    }

26.15.3 deleted that branch — `if (!identity) { return false }` — and now skips signing in
silence. Dependabot moved us 26.8.1 → 26.15.3 in `c2dac26b`, **2026-07-23**, inside the
`desktop-minor-patch` group. So every macOS build cut after 2026-07-23 shipped unopenable,
and no check anywhere went red.

This is precisely the hazard `CLAUDE.md` already names for this dependency family — *"green
tests don't prove a packaged build works"* — which is why `electron`, `koffi` and
`@vscode/ripgrep` **majors** are pinned in the Dependabot config. electron-builder minors
were not, and this is what came through the gap.

**Fix merged 2026-09-04** (`youcoded` 2c369762, branch `fix/mac-adhoc-signing`): `identity: '-'`
in `electron-builder.yml`'s `mac:` block, which 26.15.3 still honours (`MacTargetHelper.js`
special-cases the string), restoring exactly the v1.2.4 state. Review before the merge kept
the fix and hardened the guard around it: one shared `desktop/scripts/verify-mac-signature.sh`
in **both** mac-producing workflows asks `codesign --verify --deep --strict` for a verdict
(the original draft only checked that a `_CodeSignature` directory existed, which a stale
seal passes) and compares the signing identifier to the bundle's own `CFBundleIdentifier`;
`mac.forceCodeSigning: true` makes electron-builder itself fail when it cannot sign, so a
local Mac build stops too; the entitlements the ad-hoc launch depends on
(`disable-library-validation`) are now owned in `desktop/assets/` instead of borrowed from
electron-builder's template; and Dependabot no longer auto-bumps electron-builder minors.
The check whose absence let this ship for six weeks is pinned by
`desktop/tests/verify-mac-signature.test.ts`.

**Still open:** ad-hoc is not Developer ID. Users will still meet the "Apple cannot verify
this" wall — they will simply have a button to get past it again. Notarization remains the
real fix. electron-builder 26.15.3 warns that ad-hoc + hardened runtime can need the
`com.apple.security.cs.disable-library-validation` entitlement; v1.2.4 shipped in exactly
that combination without one, so the restored config is known-good, but the test build is
what proves it.

**The download page was not wrong when it was written.** Its "Open Anyway" walkthrough
matched v1.2.4's behaviour. It became wrong on 2026-07-23 without anyone touching it.
<!-- claim: {"path": "youcoded/docs/index.html", "contains": "Open Anyway"} -->

## False positive — the ASAR integrity hash is correct

The report claimed `Info.plist`'s `ElectronAsarIntegrity` does not match the shipped
`app.asar`, and warned that signing the build would therefore abort every launch for every
user. **That is wrong, and the warning is void.**

electron-builder stores the SHA-256 of the ASAR **header**, not of the file:
`app-builder-lib/out/asar/integrity.js` → `hashHeader()` reads the header via
`readAsarHeader` and hashes only that. The report compared it against
`shasum -a 256 app.asar`, a whole-file hash. The two are not the same quantity and would
never match on any correct build.

Verified on the shipped artifact by running electron-builder's own `computeData()` against
the extracted `Resources/`:

| | |
|---|---|
| `Info.plist` declares | `f8ab9841061540145305eb41fec252c788759d8798c220992e18cb69fdd258fd` |
| electron-builder recomputes | `f8ab9841061540145305eb41fec252c788759d8798c220992e18cb69fdd258fd` — **exact match** |
| whole-file `sha256sum` (the report's number) | `8ce0ab1c3e81ae59d5f38450096db519cd63ebe05801ae3d3ed47c8882b1dc94` |

The header is not a weak seal, either: this archive's header carries per-file `integrity`
blocks (`algorithm`/`hash`/`blockSize`/`blocks`), so hashing the header transitively covers
every file's contents. `disableAsarIntegrity: true` appears only in `doUniversalPack`,
which this build does not use — we cut separate x64 and arm64 dmgs.

**There is no packaging landmine waiting for the signing work.**

## Half right — diagnostics

*Right:* `crashReporter` is **never started**. The string appears nowhere in
`youcoded/desktop/src/`, so there is no Crashpad directory and no crash dump is ever
written. When the app dies, nothing of the process's own is left behind.

*Wrong:* the report concluded "nothing writes a main-process log to disk" from the absence
of a `logs/` directory under `~/Library/Application Support/youcoded/`. There **is** a
main-process file log — `src/main/logger.ts` appends JSON lines to
**`~/.claude/desktop.log`**, with 192 call sites across 16 files in `src/main/`.
<!-- claim: {"path": "youcoded/desktop/src/main/logger.ts", "contains": "'.claude', 'desktop.log'"} -->

Two things follow. First, the tester can still go and read that file. Second — and this is
the durable finding — a competent investigator with full access to the machine looked for
YouCoded's logs and did not find them, because they are in Claude Code's directory rather
than the app's. That is a discoverability bug in its own right.

**It is less bad than it first looked, though**, and the correction matters: `dev-tools.ts`
already reads the log's tail through `readLogTail()`, redacts it, and folds it into the
Report-a-bug issue body (`buildIssueBody`). So the log is not lost — it reaches us whenever
a user reports a problem through the app. What was missing was not a channel but *content*:
the log recorded only what our own code chose to log, and nothing was logging crashes,
helper-process deaths, or a hung window. That is what `feat/crash-diagnostics` fixes, and it
is why the fix writes into this log rather than building a new surface.

Caveat on how much is left: `rotateLog()` (called once at startup, `main.ts:1326`) trims
the file to its last 500 lines whenever it exceeds 1000, so a busy session can roll the
relevant window out.

## Not established

The 20:17 force-quit itself. The report is explicit that the logs cannot distinguish a
hung main thread from a stuck UI, and nothing here changes that. With a crash reporter and
a findable log it would be answerable; today it is not.

## The same gap elsewhere: things we ship or fetch that nobody can verify

The macOS finding is one instance of a wider pattern. Checked here, on `master`:

**No checksum is published for anything.** The `1.3.0-beta.72` release carries eight
installers and nothing else — no `latest*.yml`, no `SHA256SUMS`. A user cannot tell a
truncated or tampered download from a good one, and neither can the app.

**The in-app updater trusts the transport, not the file.** `src/main/update-installer.ts`
is careful about *where* a file comes from — HTTPS only, host allowlist of `github.com` /
`objects.githubusercontent.com`, extension allowlist per platform, and each redirect hop
re-validated. It does **no verification of the file itself**, and it has nothing to verify
against (see above). It then launches it: `spawnDetached` of the `.exe` on Windows,
`open -W` on the `.dmg` on macOS.

**Consequence on macOS, today:** the updater hands the user a fresh `.dmg` of an unsigned
build, which arrives with a new quarantine flag. So the signing gap is not a first-install
hurdle — **the app's own update button walks a working Mac install back into the wall,
every time.**

**Where the same class is already handled well**, and worth copying:
`src/main/engine/engine-acquisition.ts` verifies the downloaded archive's SHA-256 against a
value pinned in `engine-pin.ts` and refuses on mismatch; `src/main/models/model-downloader.ts`
verifies per-file SHA-256 from HuggingFace's `lfs.oid` when it is available. The engine path
is the pattern the updater should follow.
<!-- claim: {"path": "youcoded/desktop/src/main/engine/engine-acquisition.ts", "contains": "hash !== asset.sha256"} -->

**Already filed separately:** the announcement banner is fetched unsigned and uncapped
(`docs/roadmap/other-features.md`).

## The other error class: a confident answer from a command that measured something else

Two of the external report's four conclusions were wrong, and both failed the same way —
a plausible command was run, its output was read as if it answered the question, and the
gap between the two was invisible.

1. **A whole-file checksum compared against a header checksum.** Both are 64 hex
   characters; nothing about the output says they are different quantities. This produced
   a confident "packaging bug" plus a prediction that signing would break every launch.
2. **A negative concluded from one obvious location.** No `logs/` under the app's userData
   became "nothing writes a log to disk" — while 192 call sites were writing to
   `~/.claude/desktop.log`.

Both are the failure mode `CLAUDE.md` names under *Investigation discipline*: a claim is
only as good as the search that backed it, and a surprising negative should raise the
evidence bar rather than lower it. Worth remembering that this report was otherwise
excellent and explicit about its own inferences — the two errors were not sloppiness, they
were two measurements that looked like they answered the question.
