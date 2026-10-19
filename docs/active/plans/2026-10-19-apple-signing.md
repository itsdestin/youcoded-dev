---
status: active
work_item: 28
---
# Apple signing implementation plan

**Goal:** Prepare Developer ID signing and notarization for YouCoded's Intel and Apple Silicon installers without publishing a release.

**Approved scope:** Destin approved protected GitHub credentials, build changes, and stronger verification on 2026-10-19, then explicitly approved committing/pushing the candidate, temporarily granting only its exact branch signing access, and running a signed test build. Merge, release tags and public release publication remain unauthorized.

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

A clean-guest quarantined installation and interactive first launch remain unverified; CI checks and launch smoke are not that user journey. App source is not merged to master and no public release was created. Do not close #28 or archive this active plan as shipped until separately authorized integration actually lands. No installed/live app, plugin or hook state was changed.
