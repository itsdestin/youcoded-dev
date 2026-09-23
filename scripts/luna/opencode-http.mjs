import { assertIsolatedEnvironment } from './live-controller.mjs';
import { startBackend, verifySignedInRoot, killGroup } from './opencode-adapter.mjs';

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TURN_MS = 90_000;
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

/** WHY: the synchronous session API returns the completed assistant message;
 * never persist its text, session IDs or opaque reasoning from that response. */
export function sanitizeCompletedResponse(response) {
  if (response?.info?.role !== 'assistant' || response.info.error) throw new Error('OpenCode response error or missing assistant result.');
  if (response.info.modelID && response.info.modelID !== 'gpt-5.6-luna') throw new Error('OpenCode response used the wrong model.');
  if (response.info.providerID && response.info.providerID !== 'openai') throw new Error('OpenCode response used the wrong provider.');
  const rows = [];
  for (const part of response.parts ?? []) {
    if (part?.type !== 'step-finish') continue;
    const tokens = part.tokens ?? {};
    const fresh = count(tokens.input);
    const read = count(tokens.cache?.read);
    const write = count(tokens.cache?.write);
    const output = count(tokens.output);
    if (fresh === null || read === null || write === null || output === null) throw new Error('OpenCode provider usage is invalid.');
    // WHY: OpenCode persists non-cached input, whereas YouCoded records provider-total input.
    // A persisted zero cache field may mean missing detail, not a provider-reported miss.
    rows.push({ inputTokens: fresh + read + write, cacheReadTokens: read || null, outputTokens: output + (count(tokens.reasoning) ?? 0) });
  }
  if (!rows.length) throw new Error('OpenCode response contains no completed provider step.');
  return rows;
}

async function json(url, options = {}) {
  const result = await fetch(url, { ...options, signal: AbortSignal.timeout(TURN_MS) });
  if (!result.ok) throw new Error(`OpenCode isolated server returned HTTP ${result.status}.`);
  return result.json();
}

/** One serialized root-chat request per turn; the backend, not its attached CLI,
 * confirms completion and persists the same session across a real server restart. */
// WHY: the repeat comparison (live-repeat-comparison.mjs) needs fresh sessions with no restart,
// a fixed pause between turns, and a unique gate label per round.
export async function runOpenCodeHttpThreeTurns({ binary, cwd, env, prompts, authRoot, gate, restartBeforeTurn = 2, gapMs = 0, repetitionLabel = 'opencode-http-three-turn' }) {
  if (!Array.isArray(prompts) || prompts.length !== 3 || !prompts.every(x => typeof x === 'string' && x)) throw new TypeError('Three fixed prompts required.');
  if (!gate || typeof gate.beginRepetition !== 'function' || typeof gate.reserved !== 'function') throw new TypeError('Strict external request gate required.');
  const isolatedEnv = Object.fromEntries(['PATH','HOME','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','TMPDIR','YOUCODED_LUNA_EXPERIMENT','OPENCODE_PURE']
    .filter(key => typeof env?.[key] === 'string').map(key => [key,env[key]]));
  isolatedEnv.LUNA_GUARD_URL=gate.url;
  isolatedEnv.LUNA_FIXTURE_ROOT=cwd;
  isolatedEnv.OPENCODE_CONFIG_CONTENT=JSON.stringify({share:'disabled',autoupdate:false});
  isolatedEnv.OPENCODE_DISABLE_AUTOCOMPACT='1';
  isolatedEnv.OPENCODE_DISABLE_PRUNE='1';
  isolatedEnv.OPENCODE_DISABLE_PROJECT_CONFIG='1';
  assertIsolatedEnvironment(isolatedEnv,cwd);
  await verifySignedInRoot(authRoot,isolatedEnv);
  const turns=[];
  let backend;
  let sessionId;
  const before=gate.reserved();
  gate.beginRepetition(repetitionLabel);
  try {
    for (let index=0;index<3;index++) {
      if (index>0 && gapMs>0) await new Promise((resolve)=>setTimeout(resolve,gapMs));
      if (index===restartBeforeTurn && backend) { killGroup(backend.pid); backend=null; }
      if (!backend) backend=await startBackend(binary,cwd,isolatedEnv);
      const base=backend.url;
      if (!sessionId) {
        const created=await json(`${base}/session`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
        if (!SESSION_ID.test(created?.id)) throw new Error('OpenCode session identity missing.');
        sessionId=created.id;
      } else if (index===restartBeforeTurn) {
        const resumed=await json(`${base}/session/${encodeURIComponent(sessionId)}`);
        if (resumed?.id!==sessionId) throw new Error('OpenCode did not restore the same session.');
      }
      gate.beginTurn(index+1);
      const turnStart=gate.reserved();
      try {
        const response=await json(`${base}/session/${encodeURIComponent(sessionId)}/message`,{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({model:{providerID:'openai',modelID:'gpt-5.6-luna'},parts:[{type:'text',text:prompts[index]}]}),
        });
        for (const row of sanitizeCompletedResponse(response)) turns.push({turn:index+1,...row,attempts:gate.reserved()-turnStart});
      } finally { gate.endTurn(); }
    }
    return { turns, sessionLabel:'session-1', requestCount:gate.reserved()-before };
  } finally {
    if (backend) killGroup(backend.pid);
    gate.endRepetition();
  }
}
