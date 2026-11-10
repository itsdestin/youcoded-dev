---
status: active
---
# Android matched-runner trial

User authorized needed candidate speed experiments targeting near five minutes, no merges, releases/signing, protection edits or paid runners. Freeze production at green Android source44da85498 (PR641); no original source/workflow/lock changes in this trial.

Prior complete factorial trial39194710443 passed all JVM/APK equivalence, but baseline283.7s landed onEPYC9V45 while common-native388.3s onEPYC7763 and combined297s onotherCPU. FanoutR8325.2s onolderCPU likewise confounded. Do not choose by these wall times alone.

Run two independent normal-runner jobs: baseline→combined and combined→baseline, same2GiBheap. Within each runner retain identical downloaded dependency/native input cache but force fresh app/backend/native/web outputs and stop Gradle daemons between modes. Explicitly record reset overhead, hardware, mode order and complete harness spans. Across both pairs compare all108JVMcases and full debug/R8native/web/backend/legal payloads/signatures/packageIDs with existing strict comparator. All generated producer/default preservation gates remain.

The reset helper must refuse tracked source directories, symlink escapes and unexpected roots. Only known generated app/build, build and app/src/main/assets/web are removed in hosted disposable checkouts; no node_modules deletion, gitclean/reset or shared checkout writes. Relocate native download cache OUTSIDE the cleared build folder before the first reset; later runs reuse the same exact recorded input lock. Missing outputs force regeneration rather than skip flags. Both orders mitigate warm-input bias; two samples are not a statistical guarantee.

New PR-only named-head Android paired workflow, readonly/no secrets/one-day diagnostic evidence, noAPKuploads, exactsuccess gates. Originalfactorialworkflowheadguard skips this leaf; ordinaryCI remains same-source control. First paired comparison batch can exceed5min; it measures causal changes before a winner-only selection. TDD fixtures for reset containment/order/case-payload failures and parsedworkflow; actual builds hosted only after independent review. Record every measured limit honestly.
