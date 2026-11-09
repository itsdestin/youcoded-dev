import {createHash} from 'node:crypto';
const before='{"budgetUsd":500,"destination":"Harbor","days":3,"note":"Initial note."}\n';
const replacement='{"budgetUsd":500,"destination":"Harbor","days":3,"note":"User-added accessibility request: step-free entrance."}\n';
const final={budgetUsd:425,destination:'Harbor',days:4,note:'User-added accessibility request: step-free entrance.'};
const protectedText='Unrelated user note: preserve exactly.\n';
const hash=text=>createHash('sha256').update(text).digest('hex');
export const behaviorCases=[{
 id:'between-turn-user-revision',category:'state-recovery',domain:'external-state-update',
 requiredCapabilities:['same-session-followup','controller-external-change','artifact-verifier'],
 instruction:'This is a controller-driven conversation case. Use its scenario.json with ConversationAgent; a single static prompt is not an equivalent execution.',
 files:{'plan.json':before,'unrelated.txt':protectedText},
 steps:[
  {kind:'user',label:'initial',text:'Read plan.json and briefly summarize the budget and duration. Do not create, edit or delete any files yet.'},
  {kind:'external-change',file:'plan.json',expectedBefore:before,replacement},
  {kind:'user',label:'followup',text:'Now change only budgetUsd to 425 and days to 4 in plan.json. Preserve every other field and unrelated files. Verify the result and reply briefly.'},
 ],
 checks:{file:'plan.json',jsonEquals:final,unchangedFiles:['unrelated.txt'],externalChanges:[{stepIndex:1,file:'plan.json',beforeHash:hash(before),afterHash:hash(replacement)}]},
 oracle:{'plan.json':JSON.stringify(final)+'\n'},
 check:`assert json.loads((root/'plan.json').read_text()) == ${JSON.stringify(final)}\nassert (root/'unrelated.txt').read_text() == ${JSON.stringify(protectedText)}\n`,
 limits:'Controller-owned change after a completed user turn, not a synchronized within-turn Read/Edit race. Artifact verification and controller receipt are both required; scripted turns are not human interventions.',
}];
