import { mkdtemp, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { buildFixture } from './fixture.mjs';
import { startRequestGate } from './request-gate.mjs';
import { stagePrivateOpenCodeProfile } from './private-opencode-profile.mjs';
import { runOpenCodeThreeTurns } from './opencode-adapter.mjs';
import { launchIsolatedNative, connectIsolatedNative, nativeDiagnosticsReader } from './live-native-cdp.mjs';

const BASE = '/home/destin/.cache/youcoded-luna-experiment';
const BINARY = `${BASE}/opencode-v1.18.31/packages/opencode/dist/opencode-linux-x64/bin/opencode`;
const PROMPTS = [
  'Without using tools or reading files, reply in one short sentence: The marker is blue.',
  'Without using tools or reading files, recall the marker from our preceding turn in one short sentence.',
  'Without using tools or reading files, after this process restart recall the marker and say whether the preceding turn asked you to recall it.',
];
const output = (label, value) => console.log(JSON.stringify({ label, ...value }));
let parent, gate, native, client, staged;
let stopAfterNative = false;
const nativeRows = [];
try {
  parent = await mkdtemp('/tmp/luna-minimal-comparison-');
  const { roots } = await buildFixture(parent);
  staged = await stagePrivateOpenCodeProfile({ sourceRoot: BASE });
  // WHY: one bodyless gate owns the remaining 9 approved provider attempts for BOTH clients, including the restart.
  gate = await startRequestGate({ limit:9, budgets:{ perProbe:1, perRepetition:5, perTurn:2, turnMs:90_000 } });
  const nativeEnv = Object.fromEntries(['PATH','DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS','XDG_CURRENT_DESKTOP','KDE_SESSION_VERSION','LANG']
    .filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  Object.assign(nativeEnv, {
    HOME:BASE, XDG_CONFIG_HOME:`${BASE}/config`, XDG_DATA_HOME:`${BASE}/data`,
    XDG_CACHE_HOME:`${BASE}/cache`, XDG_STATE_HOME:`${BASE}/state`, TMPDIR:`${BASE}/tmp`,
    YOUCODED_PROFILE:'luna-eval', YOUCODED_NATIVE:'1', YOUCODED_LUNA_EXPERIMENT:'1',
    LUNA_GUARD_URL:gate.url, LUNA_FIXTURE_ROOT:roots[0],
  });
  const getUsage = nativeDiagnosticsReader(`${BASE}/config/youcoded-luna-eval/private-diagnostics/chatgpt-cache`);
  let sessionId;
  gate.beginRepetition('youcoded-three-turn');
  try {
    for (let index=0; index<3; index++) {
      if (index===2) {
        await client.close(); client=null;
        native.killGroup(); native=null;
        await delay(1000);
      }
      if (!native) {
        native=await launchIsolatedNative({ env:nativeEnv });
        try { client=await connectIsolatedNative(native, { port:9472, viteTarget:'http://127.0.0.1:5423', fixtureRoot:roots[0] }); }
        catch (error) { output('native-launch', { startup:native.startupStatus(), requestCount:gate.reserved() }); throw error; }
      }
      gate.beginTurn(index+1);
      const before = gate.reserved();
      try {
        if (!sessionId) {
          const info=await client.create({name:'Luna Cache Measurement',cwd:roots[0],skipPermissions:false,
            provider:'native',binding:{providerId:'chatgpt',modelId:'gpt-5.6-luna'},preset:'assistant'});
          sessionId=info?.id;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) throw new Error('Native session identity missing.');
        } else if (index===2) {
          const resumed=await client.resume(sessionId);
          if (resumed.id!==sessionId) throw new Error('Private native session did not resume same id.');
        }
        const eventTypes=[];const handler=client.onTranscriptEvent((event)=>eventTypes.push(event.type));
        const result=await client.send(sessionId,PROMPTS[index]);
        client.offTranscriptEvent('transcript:event',handler);
        if (result.status!=='sent' || eventTypes.length) throw new Error(`Native turn status ${result.status}; reason ${result.reason ?? 'none'}; event types ${eventTypes.join(',') || 'none'}.`);
        const rows=await getUsage({sessionId});
        nativeRows.push({ turn:index+1, providerAttempts:gate.reserved()-before, rows });
        output('youcoded-turn', { turn:index+1, attempts:gate.reserved()-before, rows });
      } finally { gate.endTurn(); }
    }
  } finally {
    try { await client?.close(); } catch {}
    try { native?.killGroup(); } catch {}
    client=null; native=null;
    gate.endRepetition();
  }
  if (gate.halted() || nativeRows.some((turn)=>turn.rows.length===0)) throw new Error('YouCoded request diagnostics incomplete or gate halted.');
  // WHY: fresh OpenCode staging contains only the independently signed-in OAuth credential.
  const openCode=await runOpenCodeThreeTurns({binary:BINARY,cwd:roots[1],env:staged.env,
    prompts:PROMPTS,authRoot:staged.authRoot,gate});
  output('opencode-turns', {attempts:openCode.requestCount,rows:openCode.turns});
  output('comparison-counts', {totalAttempts:gate.reserved(),deniedAttempts:gate.denied(),native:nativeRows,
    opencode:openCode.turns});
} catch (error) {
  output('comparison-stopped', {reason:error instanceof Error ? error.message.slice(0,160) : 'unknown',
    totalAttempts:gate?.reserved?.()??0,deniedAttempts:gate?.denied?.()??0, native:nativeRows});
  process.exitCode=2;
} finally {
  try { await client?.close(); } catch {}
  try { native?.killGroup(); } catch {}
  try { await gate?.close(); } catch {}
  try { await staged?.cleanup(); } catch {}
  if (parent) try { await rm(parent,{recursive:true,force:true}); } catch {}
}
