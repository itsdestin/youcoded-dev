import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeActivity} from './activity-normalize.mjs';
import {analyzeTimeline} from './activity-timeline.mjs';
import {importEvaluationEvidence} from './evaluation-import.mjs';
import {buildEvaluationReport} from './evaluation-report.mjs';

const native=(events,requests=[])=>({runtime:'createRuntime/NativeSessionHost',status:'completed',events,requests,scenarioCheckpoints:[{eventCount:events.length}]});
const record=(id,run)=>({id,run,outcome:{verified:true,status:'completed'},resources:{},evidence:{checks:[],followThrough:[],recovery:[],safety:[]},coverage:{events:true,requests:true,followThrough:false,recovery:false,safety:false}});

test('normalization preserves root versus child compaction identity',()=>{
 const raw=native([{type:'user-message',sessionId:'root',timestamp:0,data:{inputKind:'scripted',text:'fixture'}}],[
  {id:'root-summary',sessionId:'root',role:'compaction',startedAt:1,endedAt:2},
  {id:'child-summary',sessionId:'child',role:'compaction',startedAt:1,endedAt:2},
 ]);
 raw.rootSessionId='root';
 assert.deepEqual(analyzeActivity(raw).normalized.requests.map(r=>r.scope),['parent','child']);
});

test('raw adapter identity must match the declared arm',()=>{
 for(const raw of [native([]),{agent:{name:'pi'},steps:[]}]){
  const r=importEvaluationEvidence([{id:'foreign-adapter',expectedAdapter:'claude-code',raw}]).records[0];
  assert.equal(r.coverage,'unsupported');assert.equal(r.analysis,null);assert.match(r.reason,/adapter/);
 }
});

test('malformed request identities cannot escape per-record isolation',()=>{
 for(const coverage of [true,false])for(const requests of [[{id:'duplicate'},{id:'duplicate'}],[{}]]){
  const good=record('good',native([]));const bad=record('bad',native([],requests));bad.coverage.requests=coverage;
  const rows=buildEvaluationReport({schemaVersion:1,records:[good,bad]}).records;
  assert.equal(rows.length,2);assert.equal(rows[1].activityEvidence.coverage,'unsupported');
  assert.equal(rows[1].interactions.modelRequests,null);
  assert.equal(rows[1].workPatterns.coverage.requestsComplete,false);
 }
});

test('orphan error remains observed and cannot certify complete zero errors',()=>{
  const a=analyzeActivity(native([{type:'tool-result',timestamp:10,data:{toolUseId:'missing',isError:true}}]));
  assert.equal(a.workPatterns.observed.explicitToolErrors,1);
  assert.equal(a.workPatterns.explicitToolErrors,null);
  assert.equal(a.workPatterns.observed.unknownToolOutcomes,1);
});

test('censored request makes outside-request time unknown rather than inflated',()=>{
  const a=analyzeTimeline([
    {lane:'request-in-flight',start:0,end:10,clock:'epoch-ms',scope:'parent'},
    {lane:'request-in-flight',start:20,end:null,clock:'epoch-ms',scope:'parent'},
  ],{start:0,end:100,clock:'epoch-ms',scope:'parent'});
  assert.equal(a.censoredIntervals,1);
  assert.equal(a.unclassifiedOutsideRequestMs,null);
});

test('malformed activity does not suppress valid records or independent outcomes',()=>{
  const report=buildEvaluationReport({schemaVersion:1,records:[
    record('good',native([{type:'user-message',timestamp:0,data:{text:'fixture',inputKind:'scripted'}}])),
    record('bad',{runtime:'createRuntime/NativeSessionHost',status:'completed'}),
  ]});
  assert.equal(report.records.length,2);
  assert.deepEqual(report.records.map(r=>r.id),['good','bad']);
  assert.equal(report.records[1].activity,null);
  assert.equal(report.records[1].activityEvidence.coverage,'unsupported');
  assert.ok(report.records[1].outcome);
});

test('explicit physical request coverage reaches work-pattern input segments',()=>{
  const run=native([{type:'user-message',timestamp:0,data:{text:'fixture',inputKind:'scripted'}}],
    [{id:'request-1',role:'main',startedAt:1,endedAt:2,status:'completed'}]);
  const report=buildEvaluationReport({schemaVersion:1,records:[record('one',run)]});
  assert.equal(report.records[0].workPatterns.coverage.requestsComplete,true);
  assert.equal(report.records[0].workPatterns.inputSegments[0].modelRequests,1);
});

test('count-reconciled malformed event is unsupported, not complete zero totals',()=>{
  const imported=importEvaluationEvidence([{id:'bad-shape',raw:native([{}])}]);
  assert.equal(imported.records[0].coverage,'unsupported');
  assert.equal(imported.records[0].analysis,null);
});
