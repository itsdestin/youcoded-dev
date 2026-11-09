// WHY: actual definitions, including check/fixture/oracle bytes, bind new preparations;
// metadata-only legacy hashes did not identify the acceptance being executed.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {developmentTasks} from './targeted-plan.mjs';
import {heldoutCases} from './heldout-cases.mjs';
export const legacyVersion='legacy-trusted-v1';
export const pythonInvocationVersion='restricted-python-v1';
const executed=new Set(['repair-average','coherent-interface-patch','python-interface-and-tests','coherent-multi-location-edit']);
const sha=value=>createHash('sha256').update(value).digest('hex');
const implementations=['legacy-protocol.mjs','legacy_verification.py','python_executor.py','python-invocation.py','bwrap_executor.py','bounded_inputs.py'];
export function legacyDefinitions(){return [...developmentTasks,...heldoutCases].map(t=>({...t,split:heldoutCases.includes(t)?'evaluation-only':'development',definitionSha256:sha(JSON.stringify(t)),executedPython:executed.has(t.id)}));}
export function legacyContract(id){const t=legacyDefinitions().find(t=>t.id===id);if(!t)throw Error('Unknown legacy task');return {version:legacyVersion,task:id,split:t.split,definitionSha256:t.definitionSha256,checkSha256:sha(t.check),fixtureSha256:sha(JSON.stringify(t.files)),invocationVersion:pythonInvocationVersion,implementationSha256:sha(JSON.stringify(implementations.map(name=>[name,sha(fs.readFileSync(new URL(name,import.meta.url)))])))};}
