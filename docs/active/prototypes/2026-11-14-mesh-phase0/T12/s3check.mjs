import { FIXED } from './profiles.mjs';
import { runScenario } from './scenarios.mjs';
for (const [label, rules] of [['FIXED', FIXED], ['FIXED but seenMaximal (literal "seen = later" reading)', { ...FIXED, seenMaximal: true }]]) {
  const r = runScenario('S3-split-forgotten', rules, true); console.log(label, JSON.stringify(r.out.versions));
}
