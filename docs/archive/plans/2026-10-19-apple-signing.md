---
status: merged
work_item: 28
app_pr: https://github.com/itsdestin/youcoded/pull/655
app_commit: 7c0a46e1c7929c88c3d17abef4c0c1c841042a9f
---
# Apple signing implementation plan

**Goal:** Prepare Developer ID signing and notarization for YouCoded's Intel and Apple Silicon installers without publishing a release.

**Approved scope:** Destin approved protected GitHub credentials, build changes, and stronger verification on 2026-10-19, then explicitly approved committing/pushing the candidate, temporarily granting only its exact branch signing access, and running a signed test build. Destin subsequently explicitly authorized merge/close. Release tags and public release publication remain unauthorized.

**Architecture:** Keep the default packaging path ad-hoc for credential-free development. A macOS-only overlay replaces the ad-hoc identity with Developer ID signing and notarization. Both existing packaging workflows select that overlay only on trusted refs. A post-build step notarizes/staples final DMGs before upload or update-manifest hashing. Verification rejects missing tickets, invalid signatures and the wrong team; the existing seal checks remain for development builds.

**Alternatives:** Putting credentials in repository-wide secrets exposes them to more workflows; enabling signing in the base config breaks credential-free development. A protected environment and overlay matches the established Windows approach and avoids both problems.

**Tech stack:** Existing electron-builder, GitHub Actions environments, Apple notarytool/stapler/codesign/spctl, Vitest with command stand-ins on Linux.

## Security and interfaces

- GitHub environment `macos-signing`: custom deployment rules admit branch `master` and tags `v*` only.
- Secrets: `MAC_CSC_LINK` (base64 PKCS#12), `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64` (base64 PKCS#8).
- Environment variables `APPLE_TEAM_ID` (team `C2PSZTNNA4`), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are configured in the protected GitHub environment; read current IDs there rather than copying deployment values into public task records.
- Decode the API key only in the runner temp directory with restricted permissions; remove it in an always-run cleanup step. No private key/certificate/password contents in source, output, or public artifacts.
- Release workflow trusts master/v* refs; beta workflow trusts master only. Branch builds retain the existing ad-hoc path.
- Keep Windows, Linux, Android, bundle identity and installer names unchanged.

## Tasks

### 1. Protected credentials
- [x] Create the protected environment before storing secrets.
- [x] Upload three secrets through stdin and three nonsecret IDs as environment variables.
- [x] Read back environment branch rules and secret/variable names (not secret values).

### 2. Packaging and workflow wiring
Files: `youcoded/desktop/electron-builder.yml`, new `electron-builder.mac-sign.yml`, both `.github/workflows/desktop-{release,test-build}.yml`, new `desktop/tests/macos-signing-config.test.ts`.
- [x] Write and run cross-file configuration tests before implementation: overlay overrides `identity: '-'`; hardened runtime, notarization and force-signing enabled; environment/ref restrictions; secrets scoped to signing step; cleanup always runs; DMG completion precedes upload.
- [x] Implement the overlay using the locked electron-builder schema, without a dependency upgrade.
- [x] Add protected environment selection and SIGN_MACOS flags in both workflows. Keep existing Windows environment selection intact.
- [x] Supply signing credentials only to a dedicated Mac build step; decode API key into private runner temp storage, export APPLE_API_KEY as a path to the build and notary step, and remove it even after failure.

### 3. Notarization and verification
Files: `youcoded/desktop/scripts/verify-mac-signature.sh`, `desktop/tests/verify-mac-signature.test.ts`, new `desktop/scripts/notarize-mac-installers.mjs` and its tests.
- [x] Add failing tests for rejecting ad-hoc identity/wrong team, missing runtime/timestamp, invalid ticket, Gatekeeper failure, and missing DMGs; retain all existing seal and Office checks.
- [x] Add strict mode using SIGN_MACOS=true and APPLE_TEAM_ID, checking Developer ID identity/team, runtime, timestamp, staple and Gatekeeper acceptance.
- [x] Submit each final DMG using API credentials and `notarytool --wait --output-format json`; reject anything except Accepted. Staple and validate each DMG, assess its primary signature with Gatekeeper. Do not upload or hash final installers before completion.
- [x] Test subprocess orchestration with stubs on Linux. State explicitly that these tests do not prove Apple's acceptance of a real build.

### 4. Review and evidence
Files: workspace `docs/build-and-release.md`, work item #28 progress through cards CLI.
- [x] Update signing reference with exact secret names, expected publisher/team, expiration, trust boundaries, verification commands and pending activation state.
- [x] Run focused tests, shell syntax/schema/workflow checks and `bash scripts/verify.sh` in this session workspace.
- [x] Obtain a fresh read-only review and address findings.
- [x] Report prepared vs actually verified: credentials configured remotely; source remains local until publication is separately authorized; real macOS build/notarization and clean-guest first launch remain unverified until run.

## Verification record

- Apple API read-only authentication returned HTTP 200 with the supplied key/issuer IDs. Certificate public key matches the locally generated private key; PKCS#12 decrypt/structure checks passed.
- GitHub environment read-back confirms only master branch/v* tag deployment policies and the intended secret/variable names. No repository-wide Apple secrets added.
- Installed lockfile electron-builder 26.15.3 merged-overlay validation passed; both architecture targets and Office signIgnore inherited. Qualifier is prefix-free because v26 rejects `Developer ID Application:` before keychain lookup.
- Observed red/green: trusted app verification, configuration wiring/identity qualifier, final-image contained-app checks. Focused tests: 43 passed across four files.
- Final `scripts/verify.sh`: all seven gates passed; 2,317 related tests passed, 37 skipped (86 files passed, one skipped). Logs: `scratch/verify-20261019-075732-1627486/` in this session workspace. Existing design lint warnings remain within its ratchet; this is not a zero-warning whole-app claim.
- Both workflow YAML files parsed and every Bash run block passed `bash -n`; helper JavaScript and verifier shell syntax passed; git diff whitespace check passed.
- Fresh source reviewer reported no remaining actionable findings after qualifier correction and read-only final-DMG verification. No Mac build, Apple notarization submission, clean-guest launch, commit, branch push, merge or release occurred.
- The startup hardlink farm lacked 19 packages/typechecker. Installed lockfile dependencies in fresh `/tmp/youcoded-apple-deps.59c9uXbF` first, then swapped only this worktree's dependency directory. Shared dependencies were not modified. Installer audit reported 30 dependency vulnerabilities; no dependency upgrade was attempted in this signing task.

## Authorized candidate trial

- Production-path commit: `20216243e14fd71efad30dc20093e816e81beefc`.
- Temporary exact-branch workflow/test exception: `c9353848a39d86ec8f564299930b704337cab525`, pushed to app branch `session/28-apple-signing` after Gitleaks scanned both new commits with no leaks.
- Temporary GitHub deployment policy ID `63592571` admits only that branch; existing master/v* policies are unchanged.
- Dispatched `desktop-test-build.yml` run `39275523189` against exactly `c9353848a39d86ec8f564299930b704337cab525`. Version job succeeded; all three build legs started. No Windows-test opt-out used. Candidate Windows build remains unsigned; this trial is for Mac signing.
- Initial watcher exited on GitHub jobs API HTTP 502, NOT a CI failure. Its cleanup successfully removed policy `63592571` while the already-started job continues. Re-read confirmed only original master/v* policies remain; no credentials were re-enabled.
- Restored source master-only beta conditions and pushed cleanup commit `b28067ead`. `git diff 20216243e HEAD --exit-code` confirmed the published final source tree is identical to the reviewed production-path commit. Required verification passed again after restoration (`scratch/verify-20261019-082617-1842752/`), and all three candidate commits passed Gitleaks. Current run retains its immutable `c9353848a` SHA.
- Both GitHub check-runs API and the public Actions page still report the trial in progress, with zero uploaded artifacts. A retrying monitor distinguishes transport errors from actual completion; don't call a failed watch a failed build.
- Never broaden access to all branches, create a v* tag for testing (it triggers releases), or merge merely to obtain verification. No public app release is needed for this trial.

## First trial diagnosis and Mac-only retry

- Direct Mac job log (job `118138829378`) proves **20,595 tests passed, 90 skipped**, then packaging failed at `security import` with `SecKeychainItemImport: MAC verification failed during PKCS12 import (wrong password?)`. GitHub's step list still said Run tests, so the log—not that stale list—is authoritative. Signing/notarization never completed.
- Original locally decryptable PKCS#12 used OpenSSL 3 defaults (PBES2/AES-256-CBC, SHA-256 MAC). Kept that file; exported the same certificate/key/password into a separate container with `-keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1`. Verified the replacement decrypts and its public key still matches; updated only protected `MAC_CSC_LINK`. Native importer acceptance remains the hypothesis to test, not an observed success yet.
- GitHub rerun endpoint rejected the old run as still running, while cancel rejected it as completed. Both attempted retry policies (`63597580`, `63597710`) were removed after rejection. Did not repeatedly retry the contradictory endpoints or broaden access.
- Fresh owner-approved Mac-only dispatch: run `39283409289`, immutable candidate `66a613858f5849f258a82b4e14568fcb2297c24c`, temporary exact-branch policy `63599663`, Mac job `118162675163`. Full Mac tests remain enabled; Windows/Linux are omitted only in this temporary snapshot because their first-trial installers were already uploaded.
- Cleanup commit `b09d08201bc3642fbc61b84912d1e508062ad88a` restores the normal full matrix/master-only beta signing, was pushed and is tree-identical to production-path commit `20216243e`. Required verification passed (`scratch/verify-20261019-091151-2011353/`); all five new app commits passed Gitleaks.
- Retry watcher removes policy `63599663` as soon as its job is admitted (environment secrets are read at job start), or on monitoring exit. It monitors the Mac job directly, saves completed logs, and does not mistake a watcher transport error for a build verdict. At last observation Mac job is queued.

## Confirmed builder defect and corrected native trial

- Retry `39283409289` imported the replacement container, then failed at `security set-key-partition-list`: the pinned builder generated a random keychain password but passed the certificate password to this command. Local source inspection and upstream #10066/#10101 confirm the exact defect. No app notarization occurred; temporary policy `63599663` was removed.
- Permanent correction commit `d524a1e44e4d16198473a040ffb81ed878d33b59`: guarded three-line upstream patch, atomically replacing only this runner's dependency file. Unknown/partial source shapes fail; repeat application is idempotent. Native preflight now runs before the full suite and uses the same builder keychain implementation to find the expected identity, sign a disposable copy and verify private-key access. Complete/partial keychains and temp files are cleaned on failure. Tests run the actual installed module with native commands replaced, prove password separation and sibling-hardlink preservation, and use the real TmpDir to guard directory creation.
- Reviewer caught `getTempDir` returning an uncreated path; observed red ENOENT with real TmpDir, then fixed using createTempDir. Partial-import cleanup likewise observed red then fixed. Final fresh static review found no remaining actionable issue.
- Declared already-installed/locked `temp-file` 3.4.0 directly for build/preflight/tests (no library version upgrade). Final required verification ran the FULL suite: **20,620 passed, 79 skipped**, all seven gates passed; logs `scratch/verify-20261019-101728-2194208/`. Patch also applied twice to this worktree's isolated dependencies and focused tests passed against the already-patched state.
- Third native trial: run `39292665007`, immutable Mac-only candidate `e0a11c0c0d8a78db72f731f220d7f79360d6e08e`; temporary exact-branch policy `63607274`. Native signing is checked before full tests; tests remain fully enabled.
- Cleanup commit `3054069ecb90dfa67be7e5fde524a12d2764dc6b` is pushed, restores full matrix/master-only beta signing, and is tree-identical to permanent fix `d524a1e44`. All eight new app commits passed Gitleaks. Watcher removes policy at admission or exit and saves the completed Mac log. No merge or release authorized/performed.

## Successful signed candidate — observed 2026-10-19

Run `39292665007`, job `118197126481` completed **success**. Mac tests: **20,609 passed, 90 skipped**. Actual signed identity: `Developer ID Application: Destin's Adventures, LLC (C2PSZTNNA4)`, certificate fingerprint `106E9219430814E84FCBB72ECB1E2A8FAD8C1A63`.

Apple accepted all four submissions; downloaded each official notarization log through the Notary API and confirmed `statusSummary: Ready for distribution`, `issues: null`:

| Content | Apple submission ID |
|---|---|
| Intel app ZIP | `ebe427e5-d827-4e7b-879b-4cf9c39c83ec` |
| Apple Silicon app ZIP | `ab6e7d30-d3aa-4274-9775-0b9705bdcb8e` |
| arm64 final DMG | `678e83d4-1c23-4398-b6b1-eddfaf102a59` |
| x64 final DMG | `830c30ee-e695-4878-945b-2cd667dc5b87` |

- CI logs prove each final DMG notarized, stapled, signature/Gatekeeper assessed, mounted read-only and its contained app checked. Both unpacked bundles independently passed expected-team/runtime/timestamp/staple/Gatekeeper checks; both Office converters (x2t + 15 dylibs each) signed correctly and opened/saved/exported DOCX as PDF, Intel under Rosetta and native arm64. The arm64 packaged app launched without renderer crashes.
- API private-key cleanup step passed. Re-read GitHub deployment policies: **only master branch and v* tags**; no temporary access remains. Final app branch is clean/pushed at `3054069ec`, source-equivalent to reviewed fix `d524a1e44` except the transient trial snapshots preserved in history.
- Artifact `12221493810` contains both **1.3.2-beta.3** DMGs. Downloaded archive SHA-256 matches GitHub: `0a1bb7c7bda76c2801e373ec2a61f9b0fb65930589635f4990ca8a67e51e9393`. Extracted only the expected two files and removed the redundant ZIP. Saved permanently at `/home/destin/YouCoded-Test-Builds/apple-signing-1.3.2-beta.3.40xwAZR0/` with per-file hashes/byte sizes in `verification.json`; GitHub copy has seven-day retention.
- Final **stapled** arm64 DMG SHA-256: `26200952b8d4fefdbdf949ca7b8e80f37f69ea86a4e6a333e92a95da759d0e11` (297,051,130 bytes). x64: `f7b9688b91807f709263957a610dd386559bea306487bc86151b398f56c021f9` (308,967,074 bytes). Apple's submitted-DMG hashes differ because stapling happens afterward; compare final downloads to the final hashes/verified GitHub archive, not pre-staple submission hashes.
- Evidence: private full Mac log `/tmp/apple-keychain-trial-39292665007.log`; normalized log `/tmp/apple-keychain-trial-success-clean.log`; official Apple logs `/tmp/youcoded-apple-notary-logs-u95Cxk/`. Query the read-only Notary API directly when GitHub's combined step hides progress. Initial submission waited roughly three hours; later submissions cleared in minutes. No cause for the first delay was supplied by Apple.

## Remaining acceptance/publication boundary

Existing Intel macOS 26.7.1 VM verification passed: loaded the exact x64 installer over private HTTP, checked final SHA-256, and explicitly applied the internet quarantine attribute (this was NOT an actual Safari download). Gatekeeper remained enabled. Installed to /Applications preserving attributes after backing up guest app/profiles. macOS showed normal Open/Cancel with “Apple checked it for malicious software and none was detected”; clicked normal Open and visually verified the fresh YouCoded provider-selection screen. Native assessment returned `accepted`, `source=Notarized Developer ID`; quarantine remained present after launch. No Open Anyway, quarantine removal, spctl bypass or DevTools was used. This verifies quarantined Intel launch on an existing VM with backed-up user profiles, not a pristine OS, actual browser-download journey, Apple Silicon GUI install, account sign-in or model/chat functionality.

Restored original guest app 1.3.1-beta.107 and prior profiles, retained signed-test state under the guest's YouCoded-signing-test-backup-20261019-154633/signed-test-state, ejected the image and shut down the guest. SSH22223 and private HTTP8011 listeners confirmed gone; stopped only this session's download server. Host working app untouched. Screenshots preserved beside signed installers under `mac-vm-verification/` (gatekeeper-normal-open.png, youcoded-first-run.png).

The initial disposable-overlay/new-account attempt was unnecessary: it triggered macOS Setup Assistant and input-automation permission detours without launching the installer. Destin explicitly redirected to the existing VM; used that account and backed up its app state instead. The stopped disposable attempt was removed at close-out after confirming no process used it; the canonical VM and preserved final evidence were untouched. The reusable VM guide now says to use the existing account and back up only app state.

App PR #655 merged to remote master as `7c0a46e1c7929c88c3d17abef4c0c1c841042a9f` on 2026-10-20 UTC after explicit merge/close approval. Remote ancestry and exact tree equality with tested integration `0ed3515c736117f0b4b6aaf09626ce7eaed9ad41` confirmed. No release tag or public installer release was created; public1.3.1 remains unchanged.

## Download instruction refresh

Owner requested concise Windows/Mac/Android download-link copy before integration, with release deferred. Final owner-directed copy removes personal/company signing callouts, keeps three Windows/Mac install steps, and restores Android's original recognizable five-step warning/permission walkthrough with updated Samsung settings help. Android9+/ARM64/main-profile requirements remain; Play Protect scans are not bypassed as harmful-software warnings. Shared after-install steps are provider-first with optional GitHub. Removed the obsolete Android rebuild banner and 400–600MB Claude runtime/tier download claim (the runtime ships in the APK).

The public download is still v1.3.1: verified all four exe/arm64DMG/x64DMG/APK URLs return HTTP200. To avoid claiming the old public Mac installer is notarized when the website deploys ahead of app release, the selected stable installer filename controls a short note: older than1.3.2 gets conditional legacy Open Anyway guidance;1.3.2+ gets normal installation steps without signing callouts; unknown/prerelease URLs make no signing claim. Chip picker/download behavior and Linux/iOS instructions remain unchanged.

Behavioral regression tests run the actual modal script via JSDOM (initial6 failures before correction). Final22 site tests passed including7 instruction cases, existing analytics and theme tests. Fresh source review found no blocking issues; Android facts independently checked against runtime installer/build pins and provider setup. Inspected actual desktop1280×900/phone390×844 modals with both current1.3.1 and future signed-release fixtures: no horizontal overflow, downloads resolve to correct platform/architecture. The local-only preview used actual current release lookup and was stopped at close-out; capture fixtures never changed public download assets. Full desktop verification passed all seven gates,20,620 tests/79 skipped (`scratch/verify-20261019-163553-3542767/`; summary `/tmp/download-copy-verify.log`). Copy refinements through50df7e482 are included in the merged source. No public installer/version changed; website deployment updates instructions only.

## Final integration verification

- Integrated current app master, then the crash-recovery PR #654 that landed during CI. The moved dev-load rule initially failed locally; its already-in-flight workspace companion #281 subsequently merged and supplied the correct unchanged invariant target. Integrated that published companion instead of weakening or duplicating its rule.
- First exact integrationcd96688c5 passed PR39347454611 and full-platform39347453285. Final crash-inclusive head0ed3515c7 passed PR39349274133 and full-platform39349267916, including Linux/Windows/macOS shards, default Linux packaging, Android JVM/debug/releaseTest producers and required completion. Final local `scripts/verify.sh` passed all gates with matching workspace rules;22 website tests passed again. No known failing test is deferred.
- Fresh final reviewer found no actionable blockers in scoped signing/copy changes. Candidate-only history passed Gitleaks; no private key/password was committed. Signing environment still admits only master/v*.
- Final integration logs, tests and screenshots are retained outside the worktrees under `/home/destin/YouCoded-Test-Builds/apple-signing-1.3.2-beta.3.40xwAZR0/integration-evidence/`. Local preview and installer servers stopped; guest restored/stopped. Disposable VM detour removed; signed installers, official Apple logs and VM acceptance screenshots retained.
- User expressly deferred a public release. Source integration closes #28; future release coordination is separate and remains under the existing release work. Unrelated historical doc-sweep announcement/updater observations on #28 were not claimed as fixes by this signing task.
- Post-merge rerun39350353370 exposed a Node22 test-report framing failure in `scripts/ci-desktop.test.mjs`, before that Mac shard's Vitest tests. Raw builder-util stdout could coalesce with serialized node:test events. Reproduced the exact deserialization exception deterministically using actual builder writes, not a guessed nested-child cause. Follow-up app PR #656/commit051e1d57d redirects only that test-local logger to stderr and restores it afterward; no runtime/signing/workflow change. Regression validates every real child-V8 frame and retained diagnostics. Complete126-case semantic suite passed with zero skips on Node22 and26; parent independently reran Node22 and required applicable verification. Fresh read-only review found no blockers. Native follow-up verdicts are recorded on PR #656 runs39355379437/39355377574; no failing test was filed as deferred work. Red/green evidence is retained under the integration-evidence/reporter-fix directory.
