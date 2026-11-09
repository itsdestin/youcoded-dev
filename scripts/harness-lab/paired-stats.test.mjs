import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pairedTaskStats} from './paired-stats.mjs';
const pair=(taskId,repetition,delta)=>({taskId,repetition,delta});
test('independent tasks are weighted equally, not inflated by repeated easy tasks',()=>{
 const r=pairedTaskStats([pair('a',0,10),pair('a',1,10),pair('a',2,10),pair('b',0,-10)],{samples:200,seed:1});
 assert.equal(r.meanDelta,0);assert.equal(r.taskCount,2);assert.equal(r.pairCount,4);
 assert.equal(r.publicClaimReady,false);
});
test('missing pairs are explicitly excluded and duplicate identities refused',()=>{
 const r=pairedTaskStats([pair('a',0,null),pair('b',0,2)],{samples:200,seed:1});
 assert.equal(r.missingPairs,1);assert.equal(r.taskCount,1);assert.equal(r.interval95,null);
 assert.throws(()=>pairedTaskStats([pair('a',0,1),pair('a',0,2)]),/duplicate/i);
});
test('cluster bootstrap is deterministic and constant paired effects stay constant',()=>{
 const pairs=Array.from({length:25},(_,i)=>pair('task'+i,0,-5));
 const a=pairedTaskStats(pairs,{samples:300,seed:123});
 assert.deepEqual(a,pairedTaskStats(pairs,{samples:300,seed:123}));
 assert.deepEqual(a.interval95,[-5,-5]);assert.equal(a.meanDelta,-5);
 assert.equal(a.publicClaimReady,false); // task count alone never certifies methodology
});
