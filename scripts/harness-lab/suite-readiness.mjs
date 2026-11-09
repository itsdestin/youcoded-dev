#!/usr/bin/env node
// One offline inventory and matrix report. No credentials, provider calls or task execution.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {verifyEvaluationSet} from './evaluation-freeze.mjs';
import {cases} from './suite.mjs';
import {efficiencyCases} from './efficiency-cases.mjs';
import {comprehensiveCases} from './comprehensive-cases.mjs';
import {planComparisonTracks} from './experiment-plan.mjs';
import {heldoutCases} from './heldout-cases.mjs';
import {behaviorCases} from './behavior-cases.mjs';
import {buildRetentionProbe} from './retention-probes.mjs';
const read = name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
const panel=read('./model-panel.json');
const conversations=read('./conversation-cases.json');
const frozenDirectory=fileURLToPath(new URL('../../scratch/harness-lab/coverage-v3-heldout-frozen/',import.meta.url));
let evaluationFreeze={status:'not-created',matches:null,executionAuthorized:false};
if(fs.existsSync(frozenDirectory)){
 try{evaluationFreeze={status:'checked',...verifyEvaluationSet(frozenDirectory,heldoutCases)};}
 catch{evaluationFreeze={status:'unverifiable',matches:null,executionAuthorized:false};}
}
const describe=(c,split)=>({id:c.id,split,domain:c.domain??c.category,requiredCapabilities:c.requiredCapabilities??['single-turn','filesystem'],...(c.meta?.estimatedCumulativeInputTokensWithoutCompaction?{estimatedInputTokens:c.meta.estimatedCumulativeInputTokensWithoutCompaction}:{})});
const staticCases=[...cases,...efficiencyCases,...comprehensiveCases].map(c=>describe(c,'development'));
const evaluationCases=heldoutCases.map(c=>describe(c,'evaluation-only'));
const conversationCases=conversations.cases.map(c=>describe(c,'conversation-development'));
const retention=buildRetentionProbe();
const scenarioCases=[...behaviorCases.map(c=>describe(c,'behavior')),describe(retention,'retention')];
const adapters=['youcoded','claude-code','pi','hermes','opencode'].map(id=>({
  id,models:['claude-code','hermes'].includes(id)?['anthropic/claude-haiku-5.5']:['*'],
  capabilities:['single-turn','filesystem','same-session-followup','per-step-output','artifact-verifier','controller-external-change',...(id==='youcoded'?['explicit-compaction','compaction-observed']:[])],
  // Transport qualification does not imply task success: Gemini's follow-up file check failed.
  transportReadyModels:id==='youcoded'?panel.models.map(model=>model.id):id==='pi'?['qwen/qwen3.8-flash','anthropic/claude-haiku-5.5']:['anthropic/claude-haiku-5.5'],
}));
const matrix=planComparisonTracks({models:panel.models,tasks:[...staticCases,...evaluationCases,...conversationCases,...scenarioCases],adapters,
  repetitions:3,assumedInputTokens:50000,assumedOutputTokens:3000});
const result={...matrix,evaluationFreeze,modelPanel:panel.models,staticCases:staticCases.length,evaluationOnlyCandidates:evaluationCases.length,conversationCases:conversationCases.length,behaviorCases:behaviorCases.length,retentionProbe:{id:retention.id,...retention.meta},
  executionReadiness:{
    nativeSameSession:'implemented and scripted production-host tested; ConversationAgent delegates native scenario steps in one session',
    nativeManualCompaction:'manual and automatic paths exercised offline; one real-model controlled-200k automatic-compaction retention probe passed; general retention quality and competitor parity remain unmeasured',
    nativeSafetyScenarios:'Read→external mutation→Edit rejection tested offline; live first-party Haiku helper-report→parent continuation and explicit clarification-tool/oracle tasks passed with independent files and protocol evidence; no cross-client interface parity or spontaneous necessity claim',
    interactionMetrics:'native live events plus ATIF projection; explicit coverage and unknown opaque-operation counts',
    openRouterGateway:'USD15 estimate-based ledger with provider billing checks; five short text routes passed; all five clients passed the two-turn file canary (YouCoded/Pi on Qwen; OpenCode/Claude Code/Hermes on first-party Haiku); native Anthropic Messages and custom chat-completions routes verified; native panel tool routes qualified: Luna/DeepSeek passed files, Gemini completed requests but failed the follow-up file verifier; not a quality pass for Gemini',
    competitorConversationAdapters:'live native two-turn execution and final file verifiers passed for all five clients; models/settings differ across preflights, so this is not an efficiency ranking or full fault/long-context parity',
    statisticalIntervals:'paired task-cluster bootstrap helper; no automatic public-claim approval',
    scoring:'offline outcome/safety/supervision/recovery and success-within-budget axes implemented; missing evidence remains unknown',
    measurementAudit:'configuration mismatch checks, explicit rubric versions, grader/order/human agreement metrics implemented',
    workPatterns:'sequential-edit gaps and repeated-error signatures observed separately from mistake/waste judgments',
    behaviorOracles:'cited waiting/test-pass/stop claims require matching authoritative evidence; live cross-client snapshot collection remains a gate',
    heldOutTasks:'six independently authored, reviewed evaluation-only definitions with reference/counterexample controls; local freeze integrity is checked separately; no live results yet; development cases remain separate',
    betweenTurnExternalChanges:'all five clients passed one live first-party Haiku trial with controller-owned before/after receipts and independent final-file verification; evidence in state-check-v1/results.json; NOT an in-turn Read/Edit race or statistical safety ranking',
    realModelRetention:'one real-model native Haiku probe passed 15 turns and final-file checks with runtime-observed lab-controlled 200k window, peak gateway input 182920 and an automatic compact-summary event; evidence retention-live-v1/results.json; competitor context parity and general retention quality remain unverified',
    gradingAudience:'agent-facing structured results; deterministic outcomes and measured efficiency are primary; user delegated rubric choice rather than supplying a style rating',
    humanCalibration:'not established; personal style calibration is not required for objective reports per user clarification; subjective model grades stay provisional and human-comprehension claims remain unavailable',
  },
  uncovered:conversations.blockedCoverage,
  objectiveReportRequiresPersonalStyleRating:false,
  subjectiveScoresProvisional:true,
  nextFullEvaluationAllowed:false,
  reason:'Do not call a convenient subset comprehensive. Close requested coverage, transport and configuration gates; keep subjective scores provisional.'};
console.log(JSON.stringify(result,null,2));
