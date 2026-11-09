---
status: active
work_item: 148
---
# Bounded Harbor host verification

## V6 lifecycle fixture-mode correction — qualification only

Confirmed from preserved v5 release candidate vs its baseline: only protected
`TASK.md` and `comparison-loader.cjs` differ, both 0600 -> 0644 with identical
SHA256 bytes. Production upload already preserves source modes in USTAR, and
snapshot sidecar already distinguishes source permissions from physical 0400.
The actual defect was trusted lifecycle fixture preparation: two `copy` calls
normalized task/candidate files before upload. Both now explicitly preserve modes.
No protected-state/oracle relaxation. Diagnostics list at most 20 relative paths,
changed field names (`sha256` vs `mode`) and before/after modes, no file contents.
Lifecycle reward mismatch now names task/control/expected/actual and acceptance
path/reason/differences instead of incorrectly calling a failed reference forgery.

Focused actual 0600/0644 USTAR upload -> positive seal -> download inventory ->
0400 materialization/source-mode-sidecar test and real Harbor/bwrap lifecycle
with private protected modes returned `Ran 2 tests in 57.244s` / `OK`. Additional
engine/registry/private-umask security suite returned `Ran 34 tests in 49.218s` /
`OK`. No full seven-minute suite repeated for these two fixture copy flags.
Whitespace passed. Saved v5 cleanup result was empty per parent; no pending IDs
are targeted and this source unit performed no resource operation.

Fresh bound manifest `scratch/gateway-modes-v6/prepared/prepared-manifest.json`;
qualification-only one-shot script `scratch/gateway-modes-v6/batch.py` and
`review.json`. Prepared offline with existing image 662420b1...; NO cleanup,
rebuild/npm/install/provider key/paid path in script. Parent-reviewed command:
`timeout --signal=TERM --kill-after=30s 900s /tmp/yc-harbor-check-148/bin/python -B scratch/gateway-modes-v6/batch.py --run /var/run/docker.sock`.
Not executed here. Historical v5 evidence remains unchanged.


## V5 exact observed normalization fix — ready single batch

Read saved v4 pre/post field hashes directly: Config hashes identical; the ONLY
HostConfig field hash difference is `OomKillDisable` (false before start, null
poststart). Root cause now confirmed by receipts, unlike earlier mount/default
hypotheses. Gateway signature canonicalizes only null/false to false (OOM killing
enabled), rejects true/numeric 0/strings, and does not mutate input dictionaries.
Explicit pre/post host policy accepts only None/False. Every other full Config /
HostConfig field remains signed; prior mount-order-only canonicalization remains.
Primary lifecycle errors and safe pre/post/cleanup receipts remain preserved.

TDD actual-shape guard failed unequal false/null signatures before the fix.
Focused foreground command `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=scripts/harness-lab /tmp/yc-harbor-check-148/bin/python -m unittest test_lab_engine_registry test_lab_engine`
returned `Ran 32 tests in 11.848s` / `OK`. No full seven-minute suite repeated for
this single-field correction. `git diff --check` passed.

Ready fresh preparation `scratch/gateway-oom-v5/prepared/prepared-manifest.json`,
script `scratch/gateway-oom-v5/batch.py`, review `review.json`, ownership receipt
`saved-ownership.json`. All generated offline, existing image reused, no rebuild.
`test_offline.py` reports `PASS: OOM true/privileged/foreign labels rejected; all
3 prechecked before DELETE; 3 receipts; no socket`. Source/script/receipt hashes
and fresh manifest were rechecked; batch is not started.

One parent-reviewed separately approved foreground invocation:
`timeout --signal=TERM --kill-after=30s 900s /tmp/yc-harbor-check-148/bin/python -B scratch/gateway-oom-v5/batch.py --run /var/run/docker.sock`

Only known gateway `5c4b84686f72ae56c1bebf6aae19c960a8720596d6bf6f2063be0323976d2375`
and networks `c9e13ce69c0a6f4d924019f7c3bb4b5cdd5d94fcef644339b4ce14d1e8ff5b3c`
(outbound), `c768487a7a3f5ca75fcaad975f4550fb6fb072dce84761fee72c87bdaa91bc91`
(private) are eligible. ALL identities, names, labels, attachments, peers and
saved non-Env Config/HostConfig field hashes plus complete mount rows must pass
before any DELETE; only OOM false/null is equivalent. Networks rechecked empty
before deletion. Original Env values were never saved; they are not invented.
Then fresh no-provider qualification runs using image 662420b1... unchanged.
No discovery/unknown cleanup, npm/install/build, keys/paid calls or old paused
resources. Historical v4 journals remain intact; no resource operation performed
by this source unit and no runtime success claimed before the parent's batch.


## V4 bounded gateway checkpoint

Read `/tmp/148-gateway-v3-sanitized-inspect.json`: actual HostConfig.Mounts
request order and resolved Mounts have 9/9 identical (source,target,readonly)
entries, with different order (resolved destinations lexicographic). This proves
presentation-order sensitivity in the old signature, NOT that this alone changed
between the missing prestart record and actual poststart record. Actual default
MemorySwap is 1073741824 for Memory 536870912; original create omitted swap.

Minimal correction: gateway signature sorts ONLY the two mount arrays, preserving
every field/value and refusing duplicate targets/destinations. No HostConfig or
Config fields are dropped or normalized. New create explicitly pins Runtime=runc
and MemorySwap=Memory=536870912; both phases positively validate them. Thus unknown
changes still fail, while mount presentation order cannot cause false drift.
Pre/post/cleanup private diagnostics and primary lifecycle error preservation
remain active. No exact sole old changed field is claimed without prestart data.

Verification: initial mount-order guard failed unequal signatures; actual-shape
scratch test now reports `PASS: actual 9/9 mount set equal/order different;
signature order-independent; cleanup security tampering refused; no socket`.
`python -m unittest test_lab_engine_registry test_lab_engine test_lab_qualification.AuthorityTests.test_lifecycle_retains_primary_error_even_when_gateway_cleanup_fails`
with pinned interpreter/PYTHONPATH returned `Ran 32 tests in 15.698s` / `OK`.
Actual fake-Unix Engine + Harbor/bwrap complete lifecycle/admission guard returned
`Ran 1 test in 58.611s` / `OK` (log `/tmp/148-gateway-v4-lifecycle-offline.log`).
Whitespace passed; no new full-suite run at this focused correction checkpoint.

Fresh source-bound preparation:
`scratch/gateway-final-v4/prepared/prepared-manifest.json`.
Parent review script `scratch/gateway-final-v4/batch.py`; review bindings
`review.json`, copied sanitized receipt `sanitized-inspect.json`; offline test
`test_offline.py`. No old preparation/journal was changed. The single separately
reviewed parent elevation command is:

`timeout --signal=TERM --kill-after=30s 900s /tmp/yc-harbor-check-148/bin/python -B scratch/gateway-final-v4/batch.py --run /var/run/docker.sock`

NOT run here. Script prechecks exact new known gateway ID/image/name/labels,
complete mount metadata, selected host security/resource/runtime fields, exact
attachments and BOTH known networks/internal flags/controller labels/single peer
before any DELETE. It uses these positively checked ownership fields, not the
unstable historical signature, for this explicit cleanup only. Then it deletes
only the 3 recorded IDs, verifies each network empty, persists acknowledgements,
and runs fresh no-provider qualification using the existing built image. New
lifecycle itself provides pre/post diagnostics with no extra probe container.
No discovery, arbitrary unknown cleanup, rebuild/npm/install/provider key/paid
call or old paused-resource action. Remaining risk is actual Engine lifecycle
qualification; source checkpoint is ready for parent review, not self-qualified.


Sanitized v3 inspect follow-up: actual resolved mount entries are sorted by
Destination whereas requested HostConfig.Mounts remain in module/request order.
Canonicalize only mount-list ordering in gateway signature (all entries/fields
retained); pin tampered source/RW/propagation refusal. Explicitly request bounded
MemorySwap=Memory and Runtime=runc, validating both pre/post start; do not silently
normalize unknown HostConfig differences. The old prestart record is absent, so
neither mount ordering nor default swap is claimed as the proven sole changed
field. Existing pre/post diagnostic receipts remain the evidence mechanism for
any residual mismatch. No daemon access or deletion in this source correction.

## V3 lifecycle failure: diagnostic checkpoint, no speculative signature waiver

Saved v3 evidence shows both native arms and all three v2 task checks qualified;
parent confirms all four prior exact-ID DELETE acknowledgements. New lifecycle
journal records gateway `b49d2928d3d6125ff595e87790c5cbe69912b5c0c4f836e0906f976bfa378eac`
and networks `460008d7f3d899dadfb342b10253fd98577fbfb9c70eddedf4f3120db8a61662`
(outbound), `ea4cfacc279a3b76156dd428ac3e976c6d01a1827d6a04416e2b1f2b00d09f9a`
(private). It contains no actual Config/HostConfig/Mounts inspect snapshots,
only expected identity and cleanup refusal. `cleanup-result.json` previously
replaced the primary lifecycle failure with cleanup errors. Therefore a specific
post-start normalization cause is NOT proven from existing evidence.

Correction: lifecycle writes private `primary-error.json` immediately on failure
and carries that primary error in both cleanup-result JSON and raised error.
Gateway records private allowlisted prestart/poststart/cleanup inspection metadata
plus per-field hashes (Env entirely omitted) before signature comparisons. No
full raw inspect, arbitrary argv, environment values or key contents are saved.
The existing full signature is unchanged; a fake start mutation still refuses.
No legitimate normalization is accepted without actual changed-field evidence.

Tests: `python -m unittest test_lab_engine_registry test_lab_engine` through the
pinned interpreter returned `Ran 30 tests in 11.815s` / `OK`. A separate lifecycle
finally test using fake acquisition/cleanup returned `Ran 1 test in 8.354s` / `OK`.
TDD initial drift test failed because there were zero diagnostic snapshots;
corrected test verifies all three phases and secret Env omission. Whitespace
check passed. This checkpoint did not rerun the entire suite or touch any daemon.

Minimal missing metadata for parent-authorized exact-ID inspection: current
container ID/image/name/labels and Config/HostConfig/Mounts structure, omitting
Env values, for the one gateway above; immutable image Config (Env omitted) for
`sha256:662420b1bc0753ea61975ccded7e040e3bd4efbcbf1867ba96bb5beae47449a4`.
The old prestart full record was never saved and cannot be reconstructed from its
hash. Do not invent it or delete these resources by guessing. Source is stopped
at this diagnostic checkpoint pending that one narrow evidence response.


V3 lifecycle diagnostic correction: saved evidence confirms arms/tasks pass but
contains no actual pre/post-start gateway inspect snapshots. Preserve primary
lifecycle failure alongside cleanup errors; record allowlisted security-relevant
Config/HostConfig/mount identity metadata before/after start and on cleanup
mismatch, omitting environment values entirely. Do not relax the full signature
until actual changed fields are known. Parent may inspect only exact new gateway
ID for missing metadata; no daemon access/cleanup or rebuild in this source unit.

## Confirmed inherited-label correction and one-shot follow-up

Parent's authorized read-only inspection confirms both previously refused gateway
containers use the expected exact image/IDs/names/session/nonce/role, plus two
immutable image labels: cohort `session148-basic-deps-v2`, lock
`8c53569be8e12cb7a1831fd5b90d5a7e8d86e3dec1086934e88e5188e8e91976`.
Networks have only expected controller labels and the single respective gateway
peer. The container equality check omitted inherited image labels; this cause is
now confirmed, not inferred. Runtime labels are now compared to the EXACT merged
image-inspect label map plus explicit controller ownership overrides. No subset
matching or arbitrary-extra exemption. Policy binds trial and gateway image-label
maps; creation, start inspection, pause, normal/crash cleanup and qualification
all use those same exact expectations. Networks still compare controller-only
labels. Unknown extras, altered inherited lock, foreign nonce/role/image refuse.

TDD reproduced the old `gateway identity mismatch` plus cleanup refusals using
the supplied real label shape. Focused tests returned `Ran 29 tests in 11.501s` /
`OK`; final complete offline discovery returned `Ran 246 tests in 510.935s` / `OK`
(`/tmp/148-inherited-labels-full.log`). No failed evidence/journal was edited and
no live resource was touched. The two recorded gateway containers remain
unresolved by this unit; the parent reported them running after read-only checks.

Fresh preparation was created OFFLINE at
`scratch/image-label-fix-v3/prepared/prepared-manifest.json`, with reviewed source
hashes and existing image pin, without a build/install/Engine call. Parent review
entry is `scratch/image-label-fix-v3/batch.py`; `review.json` binds its bytes and
current controller source. In-memory test `test_batch_offline.py` passed exact-ID
prechecks-before-any-delete, foreign-role refusal, four delete acknowledgements,
and opened no socket. One separately authorized invocation only:

`timeout --signal=TERM --kill-after=30s 900s /tmp/yc-harbor-check-148/bin/python -B scratch/image-label-fix-v3/batch.py --run /var/run/docker.sock`

This has NOT been run here. It prechecks image labels plus BOTH known container
IDs/images/names/session/nonce/role/maps/mounts/attachments and BOTH known network
IDs/names/internal/labels/exact peers before any deletion; removes only those IDs,
rechecks each network empty before deletion, records acknowledgement receipts,
then qualifies the fresh manifest with the already-built image. No discovery,
unknown-ID deletion, old paused-resource handling, npm/rebuild or paid run. All
v1/v2 historical receipts remain unchanged. Parent handles one elevation/approval
operation after review; this unit has no new runtime qualification claim.


Confirmed follow-up from parent's exact-ID read-only inspection: v2 image labels
`io.youcoded.cohort=session148-basic-deps-v2` and lock
`8c53569be8e12cb7a1831fd5b90d5a7e8d86e3dec1086934e88e5188e8e91976`
are inherited by both gateway containers, alongside correct controller ownership
labels. Correct the expected exact label dictionary by binding immutable-image
Config.Labels into policy and explicitly overriding reserved session/nonce/role
at creation; unknown or changed extras must still refuse. Apply all create,
inspect and cleanup paths; pin actual shape and tamper negatives offline. Preserve
old journals. Parent alone may execute one reviewed known-ID cleanup plus fresh
qualification using the existing built image; no daemon operation occurs here.

## Image-v2 failed qualification: offline correction checkpoint

Actual saved attempt: `scratch/image-build-basic-v2/`; all failed records and its
prepared bundle remain untouched. Approved built image ID is
`sha256:662420b1bc0753ea61975ccded7e040e3bd4efbcbf1867ba96bb5beae47449a4`.
No rebuild/install/daemon operation was performed during these corrections.

**Confirmed task failure:** reproducing reset/reference from the preserved
`prepared/repo-snapshot` with umask 077 yields protected `TASK.md` and
`comparison-loader.cjs` mode 0600; verifier staging previously rewrote them 0644
with identical SHA256 bytes. Fix: mode-preserving bounded copy is explicit at
external-v2 ingestion, while executor/private-copy defaults retain their existing
normalization. Sealed snapshots remain physically 0400; the controller keeps
validated TAR source permission bits separately and supplies them to external-v2
staging, never substitutes baseline permissions for submitted permissions.
Unauthorized protected-file chmod still fails before any executor invocation.

**Confirmed diagnostic failure:** cleanup exceptions replaced the original
qualification operation exception. The qualifier now fsyncs the primary exception
(type/detail) and reports it alongside cleanup failures. Cleanup-error records
also retain bounded inspected identity fields (ID/image/labels/name/internal/peer
IDs), allowing the exact mismatch to be diagnosed without another blind rerun.
A fake Unix test injects start HTTP 500 plus foreign labels and nonempty network;
its primary failure and actual mismatched labels now survive cleanup.

**Not yet established:** why the real gateway identity differed. Existing v2
journals save expected creation metadata but contain NO actual inspected identity
response; naming inherited labels or another cause as proven would be guessing.
Identity checks have NOT been weakened. One authorized consolidated read-only
inspection is needed, via parent, of the following exact recorded IDs plus image
Config.Labels; no label discovery or cleanup is authorized here:

- nonce `5b8400bae0ab40977d7ae6a42979a2a6`, session
  `qualify-5b8400bae0ab40977d7ae6a42979a2a6`:
  container `440833c4e1d50bc8c68237c6e68fcba04be2cea0ee3c8dee14de561f3f62789c`,
  network `24085fcecdb1dc58e738ad7a7341c9d6325ec9b4a8a58ec796b9693d4f1a43fb`.
- nonce `c9f85fd49488a241cebd4c5a29ba2f7b`, session
  `qualify-c9f85fd49488a241cebd4c5a29ba2f7b`:
  container `7c3012015b6f0935b511f79747aba860ce57323dc690e2ff9b326908fd424800`,
  network `66661852056dd123a0803359d8a7a778e62d4b4130d1d690a9e473473ac06581`.

Both containers' expected image is the ID above and expected role is `gateway`.
Their exact expected labels/names and unresolved cleanup records are retained in
`prepared/qualification-owned-<nonce>.jsonl`. No cleanup is confirmed by those
records; they explicitly record refusal. No resources were touched here.

TDD pins first failed on the real mode rewrite and missing primary failure. Final
complete offline suite command:
`PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'`
returned `Ran 245 tests in 467.926s` / `OK`, full log
`/tmp/148-image-v2-offline-fixes-final.log`. An earlier full run exposed the
read-only snapshot mode distinction; keeping validated source modes separate
fixed it without making private snapshots writable or weakening protected checks.

All three references from actual preserved v2 source also passed host bwrap under
umask 077; both negatives failed for each: release 38 invocations, migration 30,
research 26. Log `/tmp/148-image-v2-offline-acceptance.log` records these offline
checks, not Engine qualification. Corrected Engine qualification still needs a
fresh current-source preparation reusing the built image. Inspect the exact
identity mismatch before authorizing known-ID cleanup/requalification; do not
repeat dependency builds or overwrite v1/v2 failed evidence.


Post-image-v2 failure correction plan: reproduce private-umask protected-state
mode drift from preserved source, preserve validated permission bits in staged
copies, and pin the real bwrap reference/negative checks. Preserve primary Engine
operation errors alongside cleanup failures and record exact inspected identity
fields; do not relax identity checks based on an unconfirmed cause. Existing
failed preparations/journals and known resource IDs remain untouched. If actual
inspect fields are absent, request one consolidated read-only inspection through
the parent, never access the daemon here. Requalification needs fresh source
preparation and reuses the already built image, not another dependency rebuild.

Final bounded P1 correction: journal a durable create intent (operation ID, type,
name, scope/nonce and trusted metadata) before every Engine create request.
Registering a valid exact returned ID resolves that intent in the same fsync'd
record; lost/truncated/timed-out/invalid responses preserve uncertainty. Cleanup
may remove known IDs only; unresolved intents survive restart and block reuse.
TDD with owned fake Unix HTTP server, then relevant/full offline Python tests.
No daemon access, discovery, unknown-ID deletion or other scope expansion.

P1 verification complete: all gateway network/container, qualification
network/container and trial-container creates use the existing registry's
write-ahead `create` operation. One acquired record registers the exact returned
ID and resolves its matching intent together; warning responses still register
before rejection/known-ID cleanup. Close-before-response, truncated HTTP body,
timeout, invalid returned ID and failed registration preserve durable intents.
Reloading registry code from disk still blocks `ensure_clean`; cleanup records
unknown-intent errors and never discovers or deletes unknown IDs.

TDD red: registry-focused tests failed with
`AttributeError: module 'lab_engine_registry' has no attribute 'create'`.
Final focused command:
`PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_lab_engine*.py'`
returned `Ran 26 tests in 10.114s` / `OK`.
Final full command:
`PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'`
returned `Ran 228 tests in 301.908s` / `OK`; full log
`/tmp/148-create-intent-full-python.log`. The four new registry tests include
subcases for every create call path and failure mode. `test_lab_qualification.py`
was not edited. Runtime/paid qualification remains pending separate approval.

Implement repository-owned plugins through Harbor's `environment.import_path` and
`verifier.import_path`, without modifying Harbor or adding another runner.

1. Interpose every environment download (logs and artifacts included), discard all
   eager host mounts, and reject overlays. Seal all writers and positively confirm
   the seal before obtaining any bytes. A failed seal/transport permanently poisons
   the environment's acceptance capability.
2. Stream only bounded uncompressed USTAR into a controller-private spool. Validate
   all metadata before creating extracted files: names, duplicates, types, counts,
   depths, declared and aggregate sizes, framing and deadlines. Materialize with
   descriptor-relative no-follow exclusive creation, then freeze the private copy.
3. Return Harbor rewards directly from the existing external-v2 verifier and
   BwrapExecutor, using the private snapshot and controller-owned baseline/origin.
   Ignore submitted rewards. Exercise the actual Trial factory/run lifecycle with
   an injected offline backend and fake agent; execute submitted fixtures only in
   the existing unprivileged bwrap executor.
4. Version new exports/plans independently of frozen v1. Emit correct plugin
   configuration; keep new paid matrix admission blocked. Report offline plugin
   implementation separately from real-backend runtime qualification.

## Next implementation unit: Engine capability (offline only)

Implement a repository-owned, version-pinned Unix HTTP Engine controller, with
explicit controller-owned policy/identity registry (never submitted paths). TDD
against an unprivileged fake Unix HTTP server: identity and mount rejection,
positive pause inspection, exact private network peers, bounded/cancellable
archive transport, safe top-directory normalization, version/dependency refusal,
and direct-execution admission. Keep Harbor's existing host-agent lifecycle and
external-v2 verifier. Wire controller policy through runtime plugin configuration,
not through agent arguments. Run the complete harness-lab Python suite and mode
Node tests; document implementation separately from current runtime qualification.
No real daemon access, paid calls, installs, signals to existing resources, or
manual commits are authorized. Real Engine/adapter/native-dependency qualification
and fresh approved-scope authority remain prerequisites, not a blanket v1 proof refusal.

## Qualification completion follow-up: concrete acceptance plan

Replace obsolete v1 in-memory-observation admission with the external-v2 boundary:
controller-owned contracts/baselines, bounded sealed snapshots and read-only bwrap
execution with independently inspected output. Each selected external-v2 task runs
one reference and two negative controls; legacy tasks remain explicit unsupported
cells. Real Engine preflight must run actual Harbor Trial plugins with a scripted
no-provider qualification agent, verify reference and forged-reward controls,
journal trusted rewards and positively check owned cleanup. Networking probes use
a dedicated opaque token and local stub upstream only, never a provider key.
Admission verifies exact schema-2 prepared scope and an existing explicitly
approved receipt, binds its bytes plus controller/contract hashes into a private
host authority channel, and repeats current qualification before key/gateway use.
No boolean, old schema, cached receipt or caller-built proof bypasses those checks.
Offline tests must show reachable success and refusal of a missing second adapter,
changed scope/receipt/source and downgrade. Run the entire Python suite again.
No real daemon, privileged command, network/provider call or existing paused
resource may be touched during this implementation follow-up.

## Remaining runtime qualification (not authorized here)

A real Engine HTTP backend is implemented in source, but NO real-daemon runtime
qualification is claimed. Production start requires a private controller-issued
policy; there is no unconditional NotImplemented fallback and no socket discovery.
Actual ownership/seal/archive/network/cleanup checks and every selected adapter's
pinned dependencies/image still need current authorized runtime evidence. The
v2 boundary uses read-only bwrap, inspected persisted output and private approved
launch authority; the obsolete v1 in-memory proof is not its admission guard. No real
Docker/socket access, sudo, installs, provider calls, paused-resource signals or
historical-evidence rewrites are authorized in this unit.

The supplied specialist audit path was absent at implementation start; installed
Harbor source and actual factory tests are the integration authority instead.

## Implemented and verified offline

`lab_harbor_transport.py` interposes Harbor downloads, strips every eager mount,
seals/confirms once, bounds raw archive spooling and aggregate extracted payload,
and validates all USTAR metadata before materializing files. Implicit parent
folders count toward the entry limit. Private files are read-only; host diagnostic
publication is exclusive and restricted to the trial's agent/artifact folders.
Only `/app`, `/logs/agent`, and `/logs/artifacts` directory streams are supported.
Final individual diagnostic downloads first seal/snapshot the whole fixed log
root, then publish exclusively to the matching trial log path. Identical repeat
publication is checked without replacing the host file; conflicts fail closed.
Individual `/app` downloads, filtered/excluded logs, sidecars and overlays refuse.

`lab_harbor_verifier.py` supplies direct Harbor rewards from external-v2/bwrap.
The actual `Trial.create`/`trial.run` test uses an injected fixture backend and
fake agent, publishes a bounded diagnostic, executes the submitted migration
fixture in bwrap, and passes the result through the parent journal/report code.
Forged rewards, failed seals, unsafe archives, and post-seal writer calls do not
produce passing acceptance. The production plugin is factory-tested to refuse
missing controller policy, rather than falling back to an unsafe backend.

New preparations use `lab_harbor_export.py`; v1 exports remain unchanged. New
mode task hashes bind external-v2; commands select both runtime plugins and omit
the rejected compose overlay. Exported environments explicitly have no network.
The Engine runtime implements an internal, exact-peer budget-gateway connection,
not a general network/overlay escape hatch. Its actual daemon/adapter qualification
remains outstanding.

Prior-unit verification commands (retained as historical offline evidence):

- `PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_lab_harbor_*.py'`:
  `Ran 9 tests in 9.919s` / `OK`.
- `PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'`:
  `Ran 193 tests in 148.348s` / `OK`.
- `node --test scripts/harness-lab/evaluation-modes.test.mjs`:
  `tests 6`, `pass 6`, `fail 0`, `skipped 0`.

These are offline implementation checks, not real-backend qualification or paid
performance evidence. At that prior revision whole-matrix admission was closed
by the synthetic-observation guard; the follow-up below replaces it for v2.
Historical reports and raw attempts were not rewritten.

## Engine backend unit: implemented, not runtime-qualified

- `lab_engine.py`: real Unix HTTP Engine operations allow only reviewed server
  versions **27.5.1** and **29.8.2**, Linux **amd64**. Both must advertise
  `MinAPIVersion <= 1.47 <= ApiVersion`; wire requests stay at **API 1.47**, not
  the server's maximum API. Missing/malformed/non-string bounds refuse (canonical
  decimal major.minor only, no leading zeroes; each component at most four digits).
  Installed Harbor **0.24.0** is checked by the controller-policy loader.
  Parent's authorized read-only preflight observed **29.8.2**, minimum **1.40**,
  maximum **1.56**, Linux amd64, and the existing immutable image
  `youcoded-harness-competitors@sha256:65cff6f1e1ed586ff9322c3b31405ecc44386d6db5af1e5b55b2e577dea34248`.
  This is supported-server metadata, NOT real-container/network qualification;
  fake-Engine tests cover both releases, range refusals and API-1.47 wire paths.
  Image IDs, exact labels/session nonce and container IDs are checked against the
  private registry before pause/archive/delete. All trial binds, image-declared
  volumes, shared writable volumes, sidecars and unsafe host modes are refused.
- Controller uploads use descriptor-validated private copies and bounded plain
  USTAR. The upload/exec writer lock drains host-side Engine uploads before pause;
  a failed writer operation poisons the capability. Freeze requires positive
  `State.Paused` and `State.Running` inspection, not a warning or status alone.
- Archive GET uses fixed roots and validates MIME and Docker stat context. HTTP
  content-length/chunked framing, total bytes, per-read bounds and absolute
  deadlines are enforced; cancellation closes the socket. Only private bounded
  spools are inventoried and materialized. The Engine top-directory prefix is
  removed component-wise after metadata validation. PAX/GNU/link/sparse extensions
  intentionally fail closed, including legitimate archives that use them.
- `lab_engine_gateway.py`: a new schema-2 serial acquisition path, separate from
  legacy compose networking. Trial has only an owned internal network containing
  itself and the owned gateway alias. Isolated bridge gateway modes omit the host
  bridge address; IPv6 is disabled and trial DNS forwarding is localhost-only.
  These options' actual daemon behavior/egress still requires qualification.
  Only the gateway has a second owned outbound bridge, with no published ports. The gateway's inspected configuration/mounts
  are fingerprinted at acquisition. Its source binds are the five gateway modules
  only, never the oracle/controller source directory. The real key is gateway-only;
  existing adapters receive opaque tokens. Mixed legacy-verifier matrices and
  concurrent peer trials refuse rather than silently changing the selected scope.
- `run_objective_comparison.command_for` carries both runtime plugins and the
  controller job ID. The private policy channel stays in the host environment,
  never in agent options, uploads, mounts or exec environment. Existing native and
  installed host-agent exec APIs retain Bash, scoped environment and user behavior.
  Native's final log-file collection uses the sealed diagnostic snapshot, not a
  mutable file-read escape hatch.
- `lab_engine_qualification.py` is callable from `evaluation_workflow.py qualify`
  with an explicit trusted `--engine-socket`. It checks the current image and
  every selected adapter/version/native lock using fresh owned no-provider
  resources. Each arm also executes its actual existing Harbor adapter's setup
  in that same owned container, with only a dummy opaque token and no run/model
  request. The lifecycle probe then uses the actual production plugins in two
  Harbor Trials against an actual gateway with fixed local stub transports.
  Source uploads and an in-container source rewrite precede positive seal and
  bounded extraction, external-v2/bwrap acceptance, trusted VerifierResult,
  parent reward journal/report reconciliation and exact owned cleanup.
  Reference reward must be 1; an unchanged submission with a forged reward must
  receive 0. Positive owned-alias/stub requests, unknown-token refusal and an
  outside-interface negative probe exercise networking without any provider key.
  These real-runtime checks are implemented but have NOT run against a daemon here.

### Exact outstanding environment/qualification blockers

1. **Read-only metadata observed; runtime qualification still pending.** Parent
   observed the compatible server/API/architecture and image presence above.
   TAR compatibility, live endpoint semantics, packet isolation, cleanup and
   positive freeze behavior remain unverified. Reviewed server admission is NOT
   runtime qualification. Uncertain creation ownership or a foreign identity/peer
   is left for explicit inspection, never guessed or broadly removed.
2. **Hermes dependency environment:** retained
   `scratch/secure-mode-qualification-v1/thorough-qualification.json` reports
   `hermes: no dependency environment is committed for this install; run hermes pm repair`.
   This is historical evidence, not a new runtime probe; no repair was attempted.
3. **Native deps:** retained build fingerprint
   `a9e0ea93e99476556a74db349d045284a9d2f5935097e59e334635d345fbe1a8`,
   lock `8c53569be8e12cb7a1831fd5b90d5a7e8d86e3dec1086934e88e5188e8e91976`.
   The historical probe hit private-file EACCES, not proof of dependency absence.
   The current `competitors.Dockerfile` does not populate `/opt/youcoded-deps/<lock>/node_modules`.
   Actual image content and every selected lock still require the current probe;
   sharing the same image ID does not qualify any arm automatically.
4. **Full real Harbor/all-five-adapter gateway lifecycle** is still unqualified.
   HTTP tests and the actual offline Harbor factory/bwrap tests are implementation
   evidence, not a completed real-daemon trial. The image's old missing Docker CLI
   and cryptography probe is not repaired or repurposed as a success; this Engine
   transport has no in-container Docker-CLI dependency, and host verifier
   dependencies still need qualification in their actual controller environment.
5. **Legacy tasks remain explicitly unsupported:** their old in-container Python
   verifiers have not acquired an independent host-verifier route. Selected legacy
   cells are retained as unqualified; a thorough selection containing them cannot
   be admitted. This does not permanently block basic/compare selections using v2.
   The old `secure_evaluation.observation_boundary()` is still a true warning about
   v1 worker frames, but v2 no longer asks those frames to attest to side effects.

Current host metadata inspected without daemon access: Harbor 0.24.0, host
architecture x86_64, bwrap `/usr/bin/bwrap`. Current verification and independent
review results are recorded below; a later privileged batch needs a separate user
judgment after independent review. No such batch is issued by this unit.

### Prior Engine-unit offline verification (retained)

```sh
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'
```

Actual final output (`/tmp/148-engine-full-python-verified.log`):

```text
Ran 211 tests in 171.595s
OK
```

```sh
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_lab_engine.py'
node --test scripts/harness-lab/evaluation-modes.test.mjs
git diff --check
```

Actual output: `Ran 17 tests in 0.507s` / `OK`; Node `tests 6`, `pass 6`,
`fail 0`, `skipped 0`; whitespace check exit 0 with no output. The full Python
run includes the actual offline Harbor factory/bwrap cases and new final native
log-publication replay/conflict case, not merely the filtered Engine tests.
New HTTP tests use owned fake Unix sockets, not a daemon or provider.

TDD initial run failed with `ModuleNotFoundError: No module named 'lab_engine'`.
A separate negative control replaced the actual `Engine.preflight` method with a
no-op: `test_bad_version_preflight_has_no_mutation` failed with
`AssertionError: ValueError not raised`; after removing that process-local patch,
the final complete suite above passed. No mutation of historical evidence was used.

Independent read-only review is **pending the parent reviewer**, not claimed done.
The subsequent user decision on a bounded real-daemon batch remains a separate
authorization; neither the offline suite nor a generated receipt authorizes it.

## Stable qualification-completion checkpoint

Implemented, not a real-daemon qualification claim:

- Current external-v2/bwrap acceptance runs one reference and two negatives per
  selected v2 task; no obsolete v1 observation/Docker-verifier blanket guard.
  Unsupported legacy tasks remain explicit retained blockers.
- Every selected adapter/version/native lock executes its actual existing Harbor
  `setup` in the same owned probe container, without a model request or install.
- Lifecycle now runs two actual Harbor Trials with production plugins: reference
  and forged reward, source writer, positive pause, bounded archive, bwrap,
  VerifierResult, parent journal/report and owned cleanup. Real gateway handling
  uses fixed stub transports and an opaque token, no provider key. Runtime probes
  cover alias access, unknown-token refusal and an outside-interface negative.
  Fake Engine tests do not prove actual packet routing.
- Private approved launch authority binds exact schema-2 manifest, receipt bytes,
  budget/scope, current executable source/contract and socket. One fresh current
  qualification precedes key metadata/gateway; nested APIs share that live lease.
  Replays, changed receipt/source/scope, missing/closed authority and downgrade
  refuse. This is a submission boundary, not proof against the trusted operator.
- Durable ownership journals fsync exact returned IDs before awaits/warning
  refusal. Crash fallback uses the exact job registry, never Compose discovery.
  Pending starts can be safely cleaned without live endpoints; foreign identity
  still refuses. Cleanup attempts remaining safe resources after one failure,
  records unresolved IDs/errors, and known orphan journals block scope reuse.
  Unknown creations with no returned identity still require explicit inspection.

Final unfiltered command:

```sh
PYTHONDONTWRITEBYTECODE=1 /tmp/yc-harbor-check-148/bin/python -m unittest discover -s scripts/harness-lab -p 'test_*.py'
```

Actual output (`/tmp/148-current-pipeline-full-python-stable.log`):

```text
Ran 224 tests in 217.104s
OK
```

Includes actual Harbor/bwrap, admitted fake-Unix matrix exactly once, all-five
actual setup, gateway handler in memory (no listener/fetch), receipt/source and
downgrade negatives, pending/warning ownership, crash fallback, cleanup-error and
orphan-reuse pins. A prior full run exposed a public mode-entry regression; it
was fixed, not filtered away. Negative control restoring the prior `stop` in
process made the pending-create pin fail `ValueError: trial network mismatch`;
output ended `Prior-stop regression reproduced: True`. Removed before full suite.

### Minimal remaining environment qualification

After independent review and separate user authorization, use a fresh current-
source external-v2 basic/compare preparation, never modify frozen preparations.
Reviewed Engine 27.5.1 or observed 29.8.2 with an advertised range containing
wire API 1.47, Linux amd64, the selected immutable image, all selected adapters
and native lock trees, and host Harbor/Node/bwrap/cryptography must already exist.
Regenerate `plan` from the reviewed request after this source correction, then
`prepare --plan <fresh-plan>/plan.json --settings <reviewed-settings.json> --out
<fresh-current-preparation>`; a historical plan/preparation fails source hashes.
Set command-scoped `HOME=/home/destin` for the parent's next authorized batch
(the earlier elevated stdout inherited root HOME); do not change host config.
Historical Hermes/native dependency evidence is not repaired or relabeled ready.
The one finite batch, NOT executed here:

```sh
HOME=/home/destin timeout --signal=TERM --kill-after=30s 900s \
  /tmp/yc-harbor-check-148/bin/python -B scripts/harness-lab/evaluation_workflow.py qualify \
  --manifest <fresh-current-preparation>/prepared-manifest.json \
  --out <fresh-current-preparation>/current-qualification.json \
  --engine-socket <explicit-authorized-absolute-unix-socket>
```

Parent must select concrete fresh preparation/socket paths after authorization;
observed image presence does not establish adapter readiness. Finite count: two owned containers per arm
(inert peer plus setup), then one stub gateway plus two Harbor trial containers
only if image/arm/task prerequisites pass. No paid-cell/repetition loop; three
host bwrap controls per selected v2 task. No provider key/canary, pull/install,
old-resource cleanup, paused-resource operation or implementation commit.
Actual container/image execution, TAR/network/cleanup remain unverified, not missing code.
Legacy selections remain unsupported. Broader evaluator/measurement integration
remains parent-owned and is NOT declared complete. Stable source is ready for one
independent read-only review.
