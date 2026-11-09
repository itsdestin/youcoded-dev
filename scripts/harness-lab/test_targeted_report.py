import copy
import unittest
import hashlib
import json
import tempfile
from pathlib import Path
from targeted_report import summarize_targeted, load_targeted_report, render_markdown


def fixture():
    rows = [dict(id='oc-'+hashlib.sha256(arm.encode()).hexdigest()[:24], trialKey=arm, taskId='task', model='model', agent='youcoded', repetition=0, buildVariant=arm) for arm in ('baseline', 'candidate')]
    manifest = dict(schemaVersion=1, targeted=dict(profile='smoke', sameBuild=True, provider='provider', buildFingerprints=dict(baseline='a'*64, candidate='a'*64)), trials=rows)
    attempts = [dict(trialKey=r['trialKey'], rewards={'reward':1}, infrastructureError=False, interrupted=False, clientSeconds=2 if r['buildVariant']=='baseline' else 1, timingScope='client-command-excluding-post-run-export') for r in rows]
    requests = [dict(trialId=r['id'], model='model', provider='provider', status='settled', actualCostUsd=0.01, reservationUsd=0.02, usage=dict(inputTokens=10, outputTokens=2, cacheReadTokens=0, cacheWriteTokens=0, reasoningTokens=None)) for r in rows]
    return manifest, attempts, requests


class TargetedReportTests(unittest.TestCase):
    def test_complete_aa_pairs_with_no_inferred_reasoning(self):
        m,a,r=fixture(); report=summarize_targeted(m,a,r)
        self.assertTrue(report['sameBuild'])
        self.assertEqual(report['arms']['baseline']['outcomes']['passed'],1)
        self.assertEqual(report['pairs'][0]['candidateMinusBaseline']['clientSeconds'],-1)
        self.assertIsNone(report['trials'][0]['usage']['reasoningTokens']['completeTotal'])
        self.assertEqual(report['trials'][0]['usage']['cacheReadTokens']['completeTotal'],0)
        self.assertIn('A/A', ' '.join(report['warnings']))

    def test_unstarted_is_not_a_failure_or_zero_cost(self):
        m,a,r=fixture(); report=summarize_targeted(m,a[:1],r[:1])
        self.assertEqual(report['arms']['candidate']['outcomes']['unstarted'],1)
        self.assertIsNone(report['pairs'][0]['candidateMinusBaseline']['passed'])
        self.assertIsNone(report['trials'][1]['cost']['completeUsd'])
        self.assertIsNone(report['trials'][1]['usage']['inputTokens']['completeTotal'])

    def test_verification_failure_distinct_from_infrastructure(self):
        m,a,r=fixture();a[1]['rewards']={'reward':0}; report=summarize_targeted(m,a,r)
        self.assertEqual(report['pairs'][0]['candidateMinusBaseline']['passed'],-1)
        a[1]['infrastructureError']=True;report=summarize_targeted(m,a,r)
        self.assertEqual(report['trials'][1]['outcome'],'infrastructure-failure')
        self.assertIsNone(report['pairs'][0]['candidateMinusBaseline']['passed'])

    def test_unknown_costs_and_tokens_not_zero_filled(self):
        m,a,r=fixture();r[1].update(status='unknown',actualCostUsd=None,usage=None)
        report=summarize_targeted(m,a,r);trial=report['trials'][1]
        self.assertEqual(trial['cost']['unresolvedEstimateUsd'],0.02)
        self.assertIsNone(trial['cost']['completeUsd'])
        self.assertIsNone(report['pairs'][0]['candidateMinusBaseline']['costUsd'])
        self.assertIsNone(trial['usage']['inputTokens']['completeTotal'])

    def test_invalid_duplicate_and_foreign_evidence_rejected(self):
        for kind in ['duplicate','foreign','model','provider','negative']:
            with self.subTest(kind=kind):
                m,a,r=fixture()
                if kind=='duplicate':a.append(copy.deepcopy(a[0]))
                if kind=='foreign':a[0]['trialKey']='foreign'
                if kind=='model':r[0]['model']='wrong'
                if kind=='provider':r[0]['provider']='wrong'
                if kind=='negative':r[0]['actualCostUsd']=-1
                with self.assertRaises(ValueError):summarize_targeted(m,a,r)

    def test_parallel_timing_and_incompatible_scopes(self):
        m,a,r=fixture();m['parallel']=dict(timingMode='contention-affected',timingCohort='parallel-2')
        report=summarize_targeted(m,a,r)
        self.assertEqual(report['timingMode'],'contention-affected')
        a[1]['timingScope']='whole-trial'
        report=summarize_targeted(m,a,r)
        self.assertIsNone(report['pairs'][0]['candidateMinusBaseline']['clientSeconds'])

    def test_interrupted_and_started_without_outcome(self):
        m,a,r=fixture();a[1].update(interrupted=True,infrastructureError=True)
        report=summarize_targeted(m,a,r)
        self.assertEqual(report['trials'][1]['outcome'],'interrupted')
        a[1]={'trialKey':'candidate','pending':True}
        report=summarize_targeted(m,a,r)
        self.assertEqual(report['trials'][1]['outcome'],'in-progress-or-interrupted')

    def test_pending_metrics_are_observed_not_complete(self):
        m,a,r=fixture();a[1]={'trialKey':'candidate','pending':True}
        report=summarize_targeted(m,a,r);candidate=report['trials'][1]
        self.assertEqual(candidate['cost']['confirmedReportedUsd'],0.01)
        self.assertIsNone(candidate['cost']['completeUsd'])
        self.assertEqual(candidate['usage']['inputTokens']['observedSubtotal'],10)
        self.assertIsNone(candidate['usage']['inputTokens']['completeTotal'])
        self.assertIsNone(report['pairs'][0]['candidateMinusBaseline']['costUsd'])
        self.assertIsNone(report['pairs'][0]['candidateMinusBaseline']['inputTokens'])

    def test_report_never_contains_raw_gateway_or_agent_payload(self):
        m,a,r=fixture();r[0]['raw']='secret-canary';a[0]['output']='secret-canary'
        import json
        self.assertNotIn('secret-canary',json.dumps(summarize_targeted(m,a,r)))

    def test_incomplete_pair_definitions_refused(self):
        m,a,r=fixture();m['trials']=m['trials'][:1]
        with self.assertRaises(ValueError):summarize_targeted(m,a[:1],r[:1])


class TargetedReportFileTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.m,self.a,self.r=fixture();self.events=self.root/'events.jsonl';self.jobs=self.root/'jobs';self.jobs.mkdir()
        pin=self.root/'pinned.txt';pin.write_text('fixture')
        self.m['snapshotHashes']={str(pin):hashlib.sha256(pin.read_bytes()).hexdigest()}
        self.m['config']={'jobsDir':str(self.jobs),'eventsPath':str(self.events),'ledgerPath':str(self.root/'ledger.json')}
        self.manifest=self.root/'manifest.json';self.manifest.write_text(json.dumps(self.m))
        self.ledger=self.root/'ledger.json';self.ledger.write_text(json.dumps({'schemaVersion':1,'requests':self.r}))
        digest=hashlib.sha256(json.dumps(self.m,sort_keys=True).encode()).hexdigest();events=[]
        for row,attempt in zip(self.m['trials'],self.a):
            trial=self.jobs/row['id']/('fixture-'+row['buildVariant']);(trial/'verifier').mkdir(parents=True);(trial/'agent').mkdir()
            (trial/'result.json').write_text(json.dumps({'verifier_result':{'rewards':attempt['rewards']},'exception_info':None}))
            (trial/'verifier/reward.txt').write_text('1')
            (trial/'agent/client-timing.json').write_text(json.dumps([{'seconds':attempt['clientSeconds'],'completed':True,'scope':attempt['timingScope']}]))
            for event in [{'event':'started'},{'event':'outcome',**{k:v for k,v in attempt.items() if k not in ('clientSeconds','timingScope')}}]:
                events.append({**event,'trialKey':row['trialKey'],'jobId':row['id'],'manifestSha256':digest})
        self.events.write_text(''.join(json.dumps(e)+'\n' for e in events))

    def test_load_reconciles_original_rewards_and_timing(self):
        report=load_targeted_report(self.manifest,self.ledger)
        self.assertEqual(report['arms']['candidate']['outcomes']['passed'],1)
        self.assertEqual(report['pairs'][0]['candidateMinusBaseline']['clientSeconds'],-1)
        self.assertTrue(report['evidenceSha256'])

    def test_raw_artifact_to_normalized_analysis_to_printed_cells(self):
        raw={'runtime':'createRuntime/NativeSessionHost','status':'completed','scenario':{'steps':[{'kind':'user'}]},
            'scenarioCheckpoints':[{'eventCount':5}],'requests':[{'id':'sdk','startedAt':0,'endedAt':30}],
            'events':[{'type':'user-message','timestamp':0,'data':{'text':'credential-canary'}},
                {'type':'assistant-text','timestamp':1,'data':{'text':'two words','partId':'text'}},
                {'type':'tool-use','timestamp':10,'data':{'toolUseId':'t','toolName':'Read','toolInput':{'path':'secret-canary'}}},
                {'type':'tool-result','timestamp':20,'data':{'toolUseId':'t','isError':False}},
                {'type':'turn-complete','timestamp':30,'data':{}}]}
        p=next(self.jobs.glob('*/fixture-baseline/agent'));(p/'youcoded-run.json').write_text(json.dumps(raw))
        report=load_targeted_report(self.manifest,self.ledger);a=report['trials'][0]['activity']['analysis']
        self.assertEqual(a['normalized']['events'][2]['toolCallId'],'t')
        self.assertEqual(a['toolLatency'][0]['submissionToResultMs'],10)
        self.assertEqual(a['workPatterns']['observed']['toolCallsByName'],{'Read':1})
        self.assertEqual(a['interactions']['progressWords'],2)
        self.assertEqual(len(report['analysisPipelineSha256']),64)
        text=render_markdown(report)
        self.assertIn('| baseline | 1 | 2 | 1 | 1 |',text)
        self.assertIn('submission-to-result',text)
        self.assertIn('| baseline | Read | 10 | unknown |',text)
        self.assertIn('cacheReadTokens',text);self.assertIn('candidate − baseline',text)
        self.assertEqual(text.count('## Family '),13)
        self.assertIn('No native run or ATIF trajectory',text)
        self.assertNotIn('canary',json.dumps(report));self.assertNotIn('canary',text)

    def test_pending_capture_without_result_remains_observed_and_malformed_capture_is_visible(self):
        p=next(self.jobs.glob('*/fixture-candidate'));(p/'result.json').unlink()
        events=[json.loads(line) for line in self.events.read_text().splitlines()]
        self.events.write_text(''.join(json.dumps(e)+'\n' for e in events if not (e['trialKey']=='candidate' and e['event']=='outcome')))
        raw=p/'agent/youcoded-run.json';raw.write_text(json.dumps({'runtime':'createRuntime/NativeSessionHost','status':'interrupted','requests':[],'events':[{'type':'tool-use','timestamp':1,'data':{'toolUseId':'t','toolName':'Read'}}]}))
        report=load_targeted_report(self.manifest,self.ledger);trial=report['trials'][1]
        self.assertEqual(trial['outcome'],'in-progress-or-interrupted')
        self.assertEqual(trial['activity']['analysis']['interactions']['observed']['toolCalls'],1)
        self.assertIsNone(trial['activity']['analysis']['interactions']['toolCalls'])
        raw.write_text('{malformed-credential-canary')
        report=load_targeted_report(self.manifest,self.ledger)
        self.assertEqual(report['trials'][1]['activity']['coverage'],'unsupported')
        self.assertEqual(report['trials'][1]['outcome'],'in-progress-or-interrupted')
        self.assertNotIn('canary',json.dumps(report))

    def test_reward_disagreement_and_drift_refused(self):
        reward=next(self.jobs.glob('*/fixture-baseline/verifier/reward.txt'));reward.write_text('0')
        with self.assertRaises(ValueError):load_targeted_report(self.manifest,self.ledger)
        reward.write_text('1');(self.root/'pinned.txt').write_text('changed')
        with self.assertRaises(ValueError):load_targeted_report(self.manifest,self.ledger)

    def test_missing_journal_reports_all_unstarted(self):
        self.events.unlink();self.ledger.write_text(json.dumps({'schemaVersion':1,'requests':[]}))
        report=load_targeted_report(self.manifest,self.ledger)
        self.assertTrue(all(t['outcome']=='unstarted' for t in report['trials']))

    def parallel_fixture(self):
        self.m['parallel']={'workers':2,'timingMode':'contention-affected','timingCohort':'test'}
        self.manifest.write_text(json.dumps(self.m));digest=hashlib.sha256(json.dumps(self.m,sort_keys=True).encode()).hexdigest()
        directory=Path(str(self.events)+'.trials');directory.mkdir();events=[{'event':'batch','manifestSha256':digest}]
        for row,attempt in zip(self.m['trials'],self.a):
            child=copy.deepcopy(self.m);child.pop('parallel');child['trials']=[row];child['config']['eventsPath']=str(directory/(row['id']+'.jsonl'))
            (directory/(row['id']+'.json')).write_text(json.dumps(child))
            cd=hashlib.sha256(json.dumps(child,sort_keys=True).encode()).hexdigest()
            journal=Path(child['config']['eventsPath']);journal.write_text(''.join(json.dumps({**e,'trialKey':row['trialKey'],'jobId':row['id'],'manifestSha256':cd})+'\n' for e in [{'event':'started'},{'event':'outcome',**attempt}]))
            events.extend([{'event':'admitted','trialKey':row['trialKey'],'jobId':row['id'],'manifestSha256':digest,'childManifestSha256':cd},{'event':'outcome','trialKey':row['trialKey'],'jobId':row['id'],'manifestSha256':digest,'childJournalSha256':hashlib.sha256(journal.read_bytes()).hexdigest(),'returncode':0,'infrastructureError':False,'interrupted':False,'cleanupConfirmed':True}])
        self.events.write_text(''.join(json.dumps(e)+'\n' for e in events))
        return directory

    def test_parallel_outcomes_use_bound_child_journals(self):
        directory=self.parallel_fixture()
        report=load_targeted_report(self.manifest,self.ledger);self.assertEqual(report['arms']['baseline']['outcomes']['passed'],1)
        journal=directory/(self.m['trials'][0]['id']+'.jsonl');journal.write_text(journal.read_text()+'\n')
        with self.assertRaises(ValueError):load_targeted_report(self.manifest,self.ledger)

    def test_parent_failure_is_not_erased_by_passing_child(self):
        self.parallel_fixture();events=[json.loads(l) for l in self.events.read_text().splitlines()]
        events[2].update(returncode=1,infrastructureError=True)
        self.events.write_text(''.join(json.dumps(e)+'\n' for e in events))
        report=load_targeted_report(self.manifest,self.ledger)
        self.assertEqual(report['trials'][0]['outcome'],'infrastructure-failure')
        events[2].update(interrupted=True);self.events.write_text(''.join(json.dumps(e)+'\n' for e in events))
        report=load_targeted_report(self.manifest,self.ledger)
        self.assertEqual(report['trials'][0]['outcome'],'interrupted')

    def test_stopped_after_admission_without_child_journal(self):
        directory=self.parallel_fixture();events=[json.loads(l) for l in self.events.read_text().splitlines()][:3]
        events[2].update(returncode=None,infrastructureError=True,interrupted=True,cleanupConfirmed=False,childJournalSha256=None)
        events.append({'event':'stopped','manifestSha256':events[0]['manifestSha256'],'cleanupConfirmed':False})
        journal=directory/(self.m['trials'][0]['id']+'.jsonl');journal.unlink()
        self.events.write_text(''.join(json.dumps(e)+'\n' for e in events))
        report=load_targeted_report(self.manifest,self.ledger)
        self.assertEqual(report['trials'][0]['outcome'],'interrupted')
        self.assertEqual(report['trials'][1]['outcome'],'unstarted')
        self.assertTrue(report['coordinatorStopped'])
        child=json.loads((directory/(self.m['trials'][0]['id']+'.json')).read_text())
        start={'event':'started','trialKey':self.m['trials'][0]['trialKey'],'jobId':self.m['trials'][0]['id'],'manifestSha256':hashlib.sha256(json.dumps(child,sort_keys=True).encode()).hexdigest()}
        journal.write_text(json.dumps(start)+'\n')
        events[2]['childJournalSha256']=hashlib.sha256(journal.read_bytes()).hexdigest();self.events.write_text(''.join(json.dumps(e)+'\n' for e in events))
        self.assertEqual(load_targeted_report(self.manifest,self.ledger)['trials'][0]['outcome'],'interrupted')


if __name__=='__main__':unittest.main()
