"""Pure targeted A/B reporting: only allowlisted evidence, never execution or credentials."""
import math
import statistics
import hashlib
import json
import copy
import subprocess
from pathlib import Path
from collections import Counter, defaultdict
from itertools import combinations
from mode_report_scope import report_scope

TOKEN_FIELDS=('inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens')
TIMING_SCOPE='client-command-excluding-post-run-export'


def require(condition,message):
    if not condition: raise ValueError(message)


def number(value):
    return type(value) in (int,float) and math.isfinite(value) and value>=0


def usage_summary(requests):
    result={}
    for field in TOKEN_FIELDS:
        values=[(r.get('usage') or {}).get(field) for r in requests]
        require(all(v is None or number(v) for v in values),'Invalid token evidence')
        known=[v for v in values if v is not None]
        result[field]=dict(completeTotal=sum(known) if values and len(known)==len(values) else None,
            observedSubtotal=sum(known) if known else None,knownRequests=len(known),missingRequests=len(values)-len(known))
    return result


def cost_summary(requests):
    settled=[r for r in requests if r['status']=='settled']
    unresolved=[r for r in requests if r['status']!='settled']
    require(all(number(r.get('actualCostUsd')) for r in settled),'Invalid settled cost')
    require(all(number(r.get('reservationUsd')) for r in unresolved),'Invalid retained estimate')
    confirmed=sum(r['actualCostUsd'] for r in settled)
    return dict(completeUsd=confirmed if requests and not unresolved else None,
        confirmedReportedUsd=confirmed if settled else None,
        unresolvedEstimateUsd=sum(r['reservationUsd'] for r in unresolved) if unresolved else None,
        knownRequests=len(settled),unresolvedRequests=len(unresolved),
        inflightRequests=sum(r['status']=='reserved' for r in requests))


def trial_outcome(attempt):
    if attempt is None:return 'unstarted'
    if attempt.get('pending'):return 'in-progress-or-interrupted'
    if attempt.get('interrupted'):return 'interrupted'
    if attempt.get('infrastructureError'):return 'infrastructure-failure'
    reward=(attempt.get('rewards') or {}).get('reward')
    require(type(reward) in (int,float) and reward in (0,1),'Missing or invalid binary verification evidence')
    return 'passed' if reward==1 else 'verification-failed'


def summarize_targeted(manifest,attempts,requests,mode_plan=None):
    """Shared evidence analysis; mode identities are never relabeled as native A/B arms."""
    is_mode=manifest.get('schemaVersion')==2
    require(is_mode or manifest.get('schemaVersion')==1 and isinstance(manifest.get('targeted'),dict),'Targeted or mode manifest required')
    metadata=report_scope(manifest,mode_plan) if is_mode else manifest['targeted'];rows=manifest.get('trials')
    arm_order=metadata['armOrder'] if is_mode else ['baseline','candidate']
    arm_field='arm' if is_mode else 'buildVariant'
    require(isinstance(rows,list) and 2<=len(rows)<=(1000 if is_mode else 18),'Bounded trial set required')
    require(type(metadata.get('sameBuild')) is bool,'Explicit A/A identity required')
    fingerprints=metadata.get('buildFingerprints') or {}
    require(set(fingerprints)==set(arm_order) and all(isinstance(x,str) and len(x)==64 for x in fingerprints.values()),'All arm fingerprints required')
    if not is_mode:require(metadata['sameBuild']==(fingerprints['baseline']==fingerprints['candidate']),'A/A label contradicts fingerprints')
    provider=metadata.get('provider');require(isinstance(provider,str) and bool(provider),'Pinned provider required')
    models={r.get('model') for r in rows};require(len(models)==1 and all(isinstance(x,str) and x for x in models),'One model required')
    expected={};ids={};pair_rows=defaultdict(dict)
    for row in rows:
        arm=row.get(arm_field);require(arm in arm_order and (is_mode or row.get('agent')=='youcoded'),'Declared report arms required')
        require(isinstance(row.get('trialKey'),str) and row['trialKey'] not in expected and isinstance(row.get('id'),str) and row['id'] not in ids,'Unique trial identities required')
        require(type(row.get('repetition')) is int and row['repetition']>=0 and isinstance(row.get('taskId'),str),'Invalid task/repetition')
        pair=(row['taskId'],row['repetition']);require(arm not in pair_rows[pair],'Duplicate arm in pair')
        pair_rows[pair][arm]=row;expected[row['trialKey']]=row;ids[row['id']]=row
    require(all(set(pair)==set(arm_order) for pair in pair_rows.values()),'All arms required for each planned task/repetition')
    if not is_mode:require(len({r['taskId'] for r in rows})<=3,'Too many targeted tasks')
    outcomes={}
    for attempt in attempts:
        key=attempt.get('trialKey');require(key in expected and key not in outcomes,'Foreign or duplicate outcome')
        if attempt.get('jobId') is not None:require(attempt['jobId']==expected[key]['id'],'Mismatched job identity')
        outcomes[key]=attempt
    grouped_requests=defaultdict(list)
    seen_requests=set()
    for request in requests:
        tid=request.get('trialId');require(tid in ids,'Foreign request evidence')
        require(request.get('model')==ids[tid]['model'] and request.get('provider')==provider,'Request model/provider mismatch')
        require(request.get('status') in ('settled','reserved','unknown','upstream-error','restart-charged'),'Invalid request status')
        if request.get('id') is not None:
            require(request['id'] not in seen_requests,'Duplicate request evidence');seen_requests.add(request['id'])
        grouped_requests[tid].append(request)
    timing_mode='contention-affected' if 'parallel' in manifest else 'serial'
    if 'parallel' in manifest:require(manifest['parallel'].get('timingMode')=='contention-affected' and bool(manifest['parallel'].get('timingCohort')),'Parallel timing label required')
    trials=[]
    for row in rows:
        attempt=outcomes.get(row['trialKey']);outcome=trial_outcome(attempt);req=grouped_requests[row['id']]
        seconds=(attempt or {}).get('clientSeconds');scope=(attempt or {}).get('timingScope')
        require(seconds is None or number(seconds),'Invalid timing evidence')
        # WHY: missing/different timing scopes cannot masquerade as comparable client time.
        seconds=seconds if scope==TIMING_SCOPE else None
        usage=usage_summary(req);cost=cost_summary(req)
        # WHY: fully measured requests so far do not prove a pending/aborted trial's final totals.
        if outcome not in ('passed','verification-failed'):
            cost['completeUsd']=None
            for metric in usage.values():metric['completeTotal']=None
        trials.append(dict(id=row['id'],trialKey=row['trialKey'],taskId=row['taskId'],repetition=row['repetition'],arm=row[arm_field],adapter=row['agent'],split=metadata['taskSplits'][row['taskId']] if is_mode else 'development',
            outcome=outcome,clientSeconds=seconds,timingScope=scope,requestCount=len(req),requestStatuses=dict(Counter(r['status'] for r in req)),usage=usage,cost=cost))
    index={r['trialKey']:r for r in trials};pairs=[]
    for (task,rep),arms in pair_rows.items():
        for left_arm,right_arm in combinations(arm_order,2):
            left=index[arms[left_arm]['trialKey']];right=index[arms[right_arm]['trialKey']]
            def delta(a,b):return b-a if a is not None and b is not None else None
            quality=lambda row:1 if row['outcome']=='passed' else 0 if row['outcome']=='verification-failed' else None
            pairs.append(dict(taskId=task,repetition=rep,leftArm=left_arm,rightArm=right_arm,baselineOutcome=left['outcome'],candidateOutcome=right['outcome'],
                candidateMinusBaseline=dict(passed=delta(quality(left),quality(right)),clientSeconds=delta(left['clientSeconds'],right['clientSeconds']),
                    costUsd=delta(left['cost']['completeUsd'],right['cost']['completeUsd']),
                    inputTokens=delta(left['usage']['inputTokens']['completeTotal'],right['usage']['inputTokens']['completeTotal']),
                    outputTokens=delta(left['usage']['outputTokens']['completeTotal'],right['usage']['outputTokens']['completeTotal']))))
    arms={}
    for arm in arm_order:
        selected=[t for t in trials if t['arm']==arm];req=[r for t in selected for r in grouped_requests[t['id']]]
        times=[t['clientSeconds'] for t in selected if t['clientSeconds'] is not None]
        cost=cost_summary(req);usage=usage_summary(req)
        if any(t['outcome'] not in ('passed','verification-failed') or not t['requestCount'] for t in selected):
            cost['completeUsd']=None
            for metric in usage.values():metric['completeTotal']=None
        arms[arm]=dict(planned=len(selected),outcomes=dict(Counter(t['outcome'] for t in selected)),requestCount=len(req),requestStatuses=dict(Counter(r['status'] for r in req)),
            medianClientSeconds=statistics.median(times) if times else None,timingKnownTrials=len(times),cost=cost,usage=usage)
    warnings=['Correctness first: faster failed or incomplete work is not an improvement.',
        'Observed usage/cost subtotals are not complete totals when coverage is missing.',
        'Provider-reported charges are not independently reconciled invoices; retained estimates are not confirmed costs.',
        'Small development-task selection cannot establish broad superiority.']
    if metadata['sameBuild']:warnings.append('A/A calibration: identical build fingerprints, not a candidate improvement.')
    if metadata.get('profile')=='smoke':warnings.append('One smoke repetition is a plumbing/regression check, not reliable improvement evidence.')
    if timing_mode=='contention-affected':warnings.append('Contention-affected times must not be pooled with uncontended serial latency.')
    return dict(schemaVersion=2 if is_mode else 1,kind='mode-comparison' if is_mode else 'targeted-comparison',mode=metadata.get('mode','basic'),
        armIdentities=mode_plan['arms'] if is_mode else None,taskDefinitions=mode_plan['tasks'] if is_mode else None,network=metadata.get('network'),
        sameBuild=metadata['sameBuild'],profile=metadata.get('profile'),
        model=next(iter(models)),provider=provider,timingMode=timing_mode,timingCohort=manifest.get('parallel',{}).get('timingCohort'),
        buildFingerprints=fingerprints,arms=arms,pairs=pairs,trials=trials,warnings=warnings,
        synthetic=metadata.get('synthetic') is True,publicClaimReady=False)


def load_targeted_report(manifest_path, ledger_path=None):
    """Read controller evidence and reconcile outcomes; never repair/retry or load credentials."""
    evidence={}
    def read_bytes(name,record=True):
        p=Path(name)
        require(p.is_absolute() and p.resolve()==p and p.is_file(),'Ordinary canonical evidence path required')
        require(p.stat().st_size<=64*1024*1024,'Evidence file exceeds report bound')
        data=p.read_bytes()
        if record:evidence[str(p)]=hashlib.sha256(data).hexdigest()
        return data
    def read_json(name,record=True):return json.loads(read_bytes(name,record))
    def fingerprint(value):return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
    manifest_path=Path(manifest_path).absolute()
    manifest=read_json(manifest_path)
    require(isinstance(manifest.get('snapshotHashes'),dict) and bool(manifest['snapshotHashes']),'Snapshot hashes required')
    for name,digest in manifest['snapshotHashes'].items():
        require(hashlib.sha256(read_bytes(name)).hexdigest()==digest,'Execution snapshot drift')
    config=manifest['config'];digest=fingerprint(manifest)
    rows={r['trialKey']:r for r in manifest['trials']}
    require(len(rows)==len(manifest['trials']),'Duplicate planned trial')
    for row in rows.values():
        require(row['id']=='oc-'+hashlib.sha256(row['trialKey'].encode()).hexdigest()[:24],'Derived job identity mismatch')
    events_path=Path(config['eventsPath'])
    require(events_path.is_absolute() and events_path.resolve()==events_path,'Canonical journal path required')
    events=[json.loads(line) for line in read_bytes(events_path).decode().splitlines()] if events_path.exists() else []
    admitted={};outcomes={};stopped=False
    parallel='parallel' in manifest
    for index,event in enumerate(events):
        require(event.get('manifestSha256')==digest and not stopped,'Journal fingerprint/order mismatch')
        kind=event.get('event')
        if kind=='batch':
            require(parallel and index==0,'Unexpected batch event');continue
        if kind=='stopped':
            require(parallel and index==len(events)-1,'Unexpected stopped event');stopped=True;continue
        key=event.get('trialKey');require(key in rows and event.get('jobId')==rows[key]['id'],'Foreign journal identity')
        if kind==('admitted' if parallel else 'started'):
            require(key not in admitted,'Duplicate admission');admitted[key]=event
        elif kind=='outcome':
            require(key in admitted and key not in outcomes,'Outcome without unique admission');outcomes[key]=event
        else:raise ValueError('Unknown journal event')
    attempts=[]; activity_entries=[]; selected_outcomes={}
    for key,row in rows.items():
        if key not in admitted:continue
        event=outcomes.get(key)
        if event is None:
            attempts.append(dict(trialKey=key,pending=True));continue
        if parallel:
            folder=Path(str(events_path)+'.trials');child_path=folder/(row['id']+'.json');journal=folder/(row['id']+'.jsonl')
            child=read_json(child_path);expected=copy.deepcopy(manifest);expected.pop('parallel')
            expected['trials']=[copy.deepcopy(row)];expected['config']['eventsPath']=str(journal)
            require(child==expected and fingerprint(child)==admitted[key].get('childManifestSha256'),'Child manifest mismatch')
            parent_event=event
            parent_failure=(parent_event.get('infrastructureError') is not False or
                parent_event.get('returncode')!=0 or parent_event.get('cleanupConfirmed') is not True)
            child_events=[]
            if journal.exists():
                raw=read_bytes(journal)
                recorded_hash=parent_event.get('childJournalSha256')
                require((recorded_hash is None and parent_failure) or hashlib.sha256(raw).hexdigest()==recorded_hash,'Child journal changed')
                child_events=[json.loads(line) for line in raw.decode().splitlines()]
                require([e.get('event') for e in child_events] in ([],['started'],['started','outcome']),'Invalid child event sequence')
                require(all(e.get('manifestSha256')==fingerprint(child) and e.get('trialKey')==key and e.get('jobId')==row['id'] for e in child_events),'Child identity mismatch')
            else:
                require(parent_event.get('childJournalSha256') is None and parent_failure,'Expected child journal missing')
            # WHY: an admitted worker may fail before writing a journal. A parent's failure cannot be erased by a passing child.
            if len(child_events)==2:
                event=dict(child_events[-1])
            else:
                require(parent_failure,'Successful child outcome missing')
                event={'trialKey':key,'jobId':row['id'],'rewards':None,'infrastructureError':True}
            event['infrastructureError']=bool(event.get('infrastructureError')) or parent_failure
            event['interrupted']=bool(event.get('interrupted')) or bool(parent_event.get('interrupted'))
        # Keep the validated child's receipt, not the parent's unforwarded
        # outcome. Parent failure precedence above remains authoritative.
        selected_outcomes[key]=event
        normalized={k:event.get(k) for k in ('trialKey','jobId','rewards','infrastructureError','interrupted')}
        status=trial_outcome(normalized)
        job=Path(config['jobsDir'])/row['id']
        require(job.is_absolute() and job.resolve()==job,'Canonical job directory required')
        results=list(job.glob('*/result.json'))
        require(len(results)<=1,'Ambiguous trial evidence')
        if status in ('passed','verification-failed'):
            require(len(results)==1,'Completed trial result missing')
            result=read_json(results[0]);reward=result.get('verifier_result') or {}
            require(result.get('exception_info') is None and reward.get('rewards')==normalized['rewards'],'Result and journal disagree')
            host_acceptance=results[0].parent/'verifier/host-acceptance.json'
            host_plugin=(config.get('hostVerification') or {}).get('verifier',{}).get('import_path')=='lab_harbor_verifier:HostAcceptanceVerifier'
            if host_plugin:
                # Host plugin returns VerifierResult directly, never an agent
                # reward mount. Reconcile its controller-written acceptance.
                accepted=read_json(host_acceptance)
                require(type(accepted.get('passed')) is bool and int(accepted['passed'])==normalized['rewards']['reward'],'Host acceptance and journal disagree')
            else:
                reward_file=results[0].parent/'verifier/reward.txt'
                require(float(read_bytes(reward_file).decode().strip())==normalized['rewards']['reward'],'Independent reward and journal disagree')
        if results:
            timing=results[0].parent/'agent/client-timing.json'
            if timing.exists():
                spans=read_json(timing)
                require(isinstance(spans,list),'Invalid client timing shape')
                if spans and all(s.get('completed') is True and s.get('scope')==TIMING_SCOPE for s in spans):
                    require(all(number(s.get('seconds')) for s in spans),'Invalid client timing values')
                    normalized.update(clientSeconds=sum(s['seconds'] for s in spans),timingScope=TIMING_SCOPE)
        attempts.append(normalized)
    ledger=read_json(Path(ledger_path or config['ledgerPath']).absolute(),record=False)
    require(ledger.get('schemaVersion')==1 and isinstance(ledger.get('requests'),list),'Ledger schema required')
    selected_ids={r['id'] for r in rows.values()}
    allowed=('id','trialId','model','provider','status','actualCostUsd','reservationUsd','usage')
    selected=[];gateway_activities=defaultdict(list)
    for request in ledger['requests']:
        if request.get('trialId') not in selected_ids:continue
        if request.get('activity') is not None:
            gateway_activities[request['trialId']].append(dict(requestId=request['id'],activity=request['activity']))
        filtered={k:request.get(k) for k in allowed}
        if filtered['usage'] is not None:
            filtered['usage']={k:filtered['usage'].get(k) for k in TOKEN_FIELDS}
        selected.append(filtered)
    mode_plan=None
    if manifest.get('schemaVersion')==2:
        # WHY: the manifest digest binds the original plan; never execute frozen planner code to report.
        plan_bytes=read_bytes(manifest_path.parent/'plan.json')
        require(hashlib.sha256(plan_bytes).hexdigest()==manifest.get('preparation',{}).get('planSha256'),'Frozen mode plan hash mismatch')
        mode_plan=json.loads(plan_bytes)
    report=summarize_targeted(manifest,attempts,selected,mode_plan=mode_plan)
    for trial in report['trials']:
        if trial['trialKey'] not in admitted:continue
        # WHY: incomplete/failed attempts may have a raw capture but no result.json.
        # Journal admission selects the job; never restrict evidence to successful results.
        job=Path(config['jobsDir'])/trial['id']
        require(job.is_absolute() and job.resolve()==job,'Canonical activity job directory required')
        native=list(job.glob('*/agent/youcoded-run.json'));atif=list(job.glob('*/agent/trajectory.json'))
        require(len(native)<=1 and len(atif)<=1,'Ambiguous activity artifact')
        artifacts=native or atif
        receipt=selected_outcomes.get(trial['trialKey'],{}).get('controllerBehavior')
        if not artifacts and not gateway_activities[trial['id']] and receipt is None:continue
        artifact=artifacts[0] if artifacts else None;status=trial['outcome']
        # A controller fallback capture permits interrupted/early-failed attempts
        # to retain host facts without inventing agent activity or test coverage.
        fallback=None
        if not artifact and isinstance(receipt,dict) and receipt.get('capturePath'):
            try:
                fallback_path=Path(receipt['capturePath'])
                require(fallback_path.parent==manifest_path.parent/'controller-behavior','Controller fallback location mismatch')
                data=read_bytes(fallback_path)
                require(hashlib.sha256(data).hexdigest()==receipt.get('captureSha256'),'Controller fallback hash mismatch')
                fallback=json.loads(data)
            except (ValueError,TypeError,OSError,RecursionError):fallback={'invalidArtifact':True}
        try:raw=read_json(artifact) if artifact else fallback if fallback is not None else {'steps':[],'agent':{'name':'gateway-only'}}
        except (json.JSONDecodeError,UnicodeDecodeError,RecursionError):raw={'invalidArtifact':True}
        # WHY: valid JSON scalars/arrays are malformed captures, not a reason to lose other trials.
        if not isinstance(raw,dict):raw={'invalidArtifact':True}
        behavior_raw=copy.deepcopy(raw)
        controller={}
        if receipt is not None:
            # WHY: agent/youcoded-run.json is untrusted for controller assertions.
            # Only a journal-pinned envelope in a controller-owned sibling directory
            # may supply labels/state. Never auto-discover evidence in the agent tree.
            try:
                location=Path(receipt.get('path',''))
                root=manifest_path.parent/'controller-behavior'
                require(location.is_absolute() and location.parent==root and root.resolve()==root,'Controller behavior must be outside agent/job tree')
                require(not root.is_relative_to(Path(config['jobsDir'])),'Controller behavior cannot reside in jobs tree')
                payload=read_bytes(location)
                require(hashlib.sha256(payload).hexdigest()==receipt.get('sha256'),'Controller behavior journal hash mismatch')
                controller=dict(controllerEvidence=json.loads(payload),controllerAuthority=dict(sha256=receipt['sha256'],reference=str(events_path)))
            except (ValueError,TypeError,AttributeError,OSError,RecursionError) as error:
                # A damaged optional collector cannot erase the independent result.
                controller=dict(controllerEvidence={'invalidControllerReceipt':str(error)},controllerAuthority={})
        raw['gatewayActivities']=gateway_activities[trial['id']]
        verified=True if status=='passed' else False if status=='verification-failed' else None
        outcome_record=dict(id=trial['id'],outcome=dict(verified=verified,status='completed' if verified is True else 'failed' if verified is False else 'interrupted' if status=='interrupted' else 'missing'),
            resources={},evidence=dict(checks=[dict(id='reward',kind='task-acceptance',status='passed' if verified else 'failed',source='verifier',reference=str(artifact.parent.parent/'result.json') if artifact else 'journal-reconciled-result')] if verified is not None else [],followThrough=[],recovery=[],safety=[]),
            coverage=dict(followThrough=False,recovery=False,safety=False))
        activity_entries.append(dict(id=trial['id'],expectedAdapter=trial['adapter'] if artifact else None,source=str(artifact) if artifact else 'selected-gateway-activity',sourceSha256=evidence[str(artifact)] if artifact else fingerprint(gateway_activities[trial['id']]),raw=raw,behaviorRaw=behavior_raw,taskId=trial['taskId'],outcomeRecord=outcome_record,**controller))
    present={e['id'] for e in activity_entries}
    activity_entries.extend(dict(id=r['id']) for r in rows.values() if r['id'] not in present)
    adapter=Path(__file__).resolve().with_name('evaluation-import.mjs')
    imported=subprocess.run(['node',str(adapter)],input=json.dumps(activity_entries),text=True,capture_output=True,check=False)
    require(imported.returncode==0,'Shared activity evidence adapter failed; original evidence unchanged')
    activity=json.loads(imported.stdout);require(activity.get('schemaVersion')==1,'Activity schema mismatch')
    by_id={r['id']:r for r in activity['records']}
    for trial in report['trials']:trial['activity']=by_id[trial['id']]
    report['activityEvidenceSchemaVersion']=activity['schemaVersion']
    pipeline_files=('targeted_report.py','mode_report_scope.py','evaluation-import.mjs','activity-normalize.mjs','activity-timeline.mjs','activity-receipts.mjs','gateway-activity.mjs','activity-evidence.schema.json','activity-capture.schema.json',
        'interactions.mjs','work-patterns.mjs','outcome-scores.mjs','behavior-evidence.mjs','behavior-oracles.mjs','evaluation-audit.mjs','continuation-metrics.mjs','runtime-observed.mjs')
    report['analysisSourceSha256']={name:hashlib.sha256((adapter.parent/name).read_bytes()).hexdigest() for name in pipeline_files}
    report['analysisPipelineSha256']=fingerprint(report['analysisSourceSha256'])
    report['evidenceSha256']=evidence
    report['selectedLedgerRowsSha256']=fingerprint(selected)
    report['selectedGatewayActivitiesSha256']=fingerprint(dict(gateway_activities))
    report['manifestSha256']=digest
    report['coordinatorStopped']=stopped
    return report


def render_markdown(report):
    """Every family stays visible; unsupported collectors are not completed metrics."""
    def display(value):
        if value is None:return 'unknown'
        if isinstance(value,(int,float)):return f'{value:.6g}'
        return str(value).replace('|','\\|').replace('\n',' ')
    def table(headers,rows):
        return ['','| '+' | '.join(headers)+' |','|'+'|'.join('---' for _ in headers)+'|']+['| '+' | '.join(display(x) for x in row)+' |' for row in rows]
    def family(index,title,coverage):return ['',f'## Family {index}: {title}','',coverage,'']
    def analysis(trial):return (trial.get('activity') or {}).get('analysis')
    def observed(trial):
        a=analysis(trial)
        if not a:return {}
        i=a['interactions'];return i.get('observed',i)
    def behavior(t):return (analysis(t) or {}).get('behavior') or {}
    def scored(t,key):return ((analysis(t) or {}).get('outcome') or {}).get(key)
    def assessment_cell(t,kind):
        rows=[r for r in behavior(t).get('assessments',[]) if r.get('kind')==kind]
        if not rows:return 'unknown — no validated semantic assessment'
        known=[r for r in rows if r.get('verdict') is not None]
        provisional=sum(r.get('provisionalVerdict') is not None for r in rows)
        return f"{sum(r.get('verdict') is True for r in known)} false / {len(known)} assessed / {len(rows)} observations; {provisional} provisional"
    def score_cell(t,key):
        s=scored(t,key)
        if not s or not s['observations']:return 'not-applicable — no trigger in controller capture' if key=='recovery' and behavior(t).get('recoveryTriggersComplete') is True else 'unknown — missing cited assessments'
        return f"{s.get('failures',0)} failures / {s['observations']} observations; {s.get('successes',s.get('passed',0))} successful; {s['unresolved']} unresolved; {s.get('provisional',0)} provisional"
    trials=report['trials']
    lines=[f"# Evaluation comparison: {report['mode']}" if report.get('kind')=='mode-comparison' else '# Targeted YouCoded comparison','',
        '**Synthetic offline evidence — not model quality results.**' if report.get('synthetic') else '**A/A calibration — identical build inputs.**' if report['sameBuild'] else '**Baseline versus candidate.**',
        '',f"Timing mode: {report['timingMode']}. Correctness comes first.",'',
        '| Arm | Passed | Verification failed | Infrastructure / interrupted | Unstarted / pending | Requests | Median client seconds | Confirmed reported USD | Unresolved estimate USD |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name,arm in report['arms'].items():
        o=arm['outcomes'];cost=arm['cost']
        lines.append(f"| {name} | {o.get('passed',0)} | {o.get('verification-failed',0)} | {o.get('infrastructure-failure',0)+o.get('interrupted',0)} | {o.get('unstarted',0)+o.get('in-progress-or-interrupted',0)} | {arm['requestCount']} | {display(arm['medianClientSeconds'])} | {display(cost['confirmedReportedUsd'])} | {display(cost['unresolvedEstimateUsd'])} |")
    lines+=family(1,'Verified outcomes','Measured where journal, result and independent reward agree. Failures/interrupted/unstarted attempts remain in the denominator; reward is task acceptance, not comprehensive safety.')
    lines+=table(['Task','Split','Rep','Arm','Outcome','Client seconds'],[(t['taskId'],t.get('split','development'),t['repetition'],t['arm'],t['outcome'],t['clientSeconds']) for t in trials])
    lines+=family(2,'Physical requests','Observed gateway request count; provider-hidden retries are unsupported. SDK attempts below are a separate measurement boundary, not extra physical calls.')
    lines+=table(['Arm','Gateway requests','SDK attempts observed','Scope'],[(t['arm'],t['requestCount'],len(analysis(t)['normalized']['requests']) if analysis(t) else None,'selected trial; SDK includes recorded child requests') for t in trials])
    lines+=family(3,'Status and evidence coverage','Gateway statuses describe settlement, not HTTP success. HTTP response-status coverage is not collected by this adapter. Each activity source/hash and its exact capture limitation appear below.')
    lines+=table(['Arm','Gateway status counts','Activity coverage','Capture denominator / reason'],[(t['arm'],json.dumps(t.get('requestStatuses',{})),(t.get('activity') or {}).get('coverage','not-collected'),
        f"{analysis(t)['capture']['normalizedEvents']} normalized / {analysis(t)['capture']['expectedEvents']} expected: {analysis(t)['capture']['reason']}" if analysis(t) else (t.get('activity') or {}).get('reason','Activity adapter not loaded; no raw capture selected.')) for t in trials])
    lines+=family(4,'Tokens and cache','Complete totals require every selected gateway request and a completed trial. Known subtotals are not complete totals. Missing cache-write/reasoning usage is unknown, not zero. Cache/order differences confound even A/A timing and cost.')
    lines+=table(['Arm','Metric','Complete total','Known subtotal','Known / recorded requests'],[(name,k,arm['usage'][k]['completeTotal'],arm['usage'][k]['observedSubtotal'],f"{arm['usage'][k]['knownRequests']} / {arm['requestCount']}") for name,arm in report['arms'].items() for k in TOKEN_FIELDS])
    lines+=family(5,'Cost','Confirmed provider-reported charges and retained estimates are separate categories, not an independently reconciled invoice.')
    lines+=table(['Arm','Complete USD','Confirmed reported USD','Unresolved estimate USD','Known / unresolved requests'],[(name,a['cost']['completeUsd'],a['cost']['confirmedReportedUsd'],a['cost']['unresolvedEstimateUsd'],f"{a['cost']['knownRequests']} / {a['cost']['unresolvedRequests']}") for name,a in report['arms'].items()])
    lines+=family(6,'Scoped timing and paired comparison','Per-task right arm − left arm differences (candidate − baseline in basic mode), preserving adapter identities. Client time excludes post-run export. One smoke pair cannot estimate reliable improvement; no uncertainty interval is inferred by this table. Cache warmth/order and configuration differences require separate comparability checks.')
    lines+=table(['Task','Rep','Left arm','Right arm','Δ pass','Δ client seconds','Δ complete USD','Δ input tokens','Δ output tokens'],[(p['taskId'],p['repetition'],p.get('leftArm','baseline'),p.get('rightArm','candidate'),*[p['candidateMinusBaseline'][k] for k in ('passed','clientSeconds','costUsd','inputTokens','outputTokens')]) for p in report['pairs']])
    lines+=family(7,'Interaction burden','Observed parent-scope subtotals below: chunks coalesce and retractions/child display copies are excluded. Complete capture is declared separately in Family 3. Messages/tools are not model requests; opaque scripts have unknown underlying operation totals.')
    lines+=table(['Arm','Messages','Words','Tool calls','Submitted groups','Progress / final / unclassified','Declared operations','Opaque calls'],[(t['arm'],observed(t).get('assistantMessages'),observed(t).get('assistantWords'),observed(t).get('toolCalls'),observed(t).get('submittedToolGroups'),
        ' / '.join(display(observed(t).get(k)) for k in ('progressMessages','turnFinalMessages','unclassifiedMessages')),observed(t).get('declaredOperations'),observed(t).get('opaqueOperationCalls')) for t in trials])
    lines+=table(['Arm','Progress words','Turn-final words','Unclassified words','Tool-call counts by tool','Tool-call counts by category'],[(t['arm'],*[observed(t).get(k) for k in ('progressWords','turnFinalWords','unclassifiedWords')],json.dumps(analysis(t)['workPatterns']['observed']['toolCallsByName']) if analysis(t) else None,json.dumps(analysis(t)['workPatterns']['observed']['toolCallsByCategory']) if analysis(t) else None) for t in trials])
    lines+=family(8,'Edit patterns and explicit errors','Successful edit chains, repeated identical failed signatures and explicit errors use the shared work-pattern analyzer. Repetition is not automatically waste. Tool submission-to-result latency includes queuing, NOT execution duration; actual execution is separately measured only when correlated diagnostic receipts exist.')
    lines+=table(['Arm','Edit chains observed','Explicit errors observed','Repeated failed signatures observed','Unknown outcomes','Complete explicit errors'],[(t['arm'],len(analysis(t)['workPatterns']['observed']['editChains']) if analysis(t) else None,
        analysis(t)['workPatterns']['observed']['explicitToolErrors'] if analysis(t) else None,analysis(t)['workPatterns']['observed']['repeatedFailedCalls'] if analysis(t) else None,
        analysis(t)['workPatterns']['observed']['unknownToolOutcomes'] if analysis(t) else None,analysis(t)['workPatterns']['explicitToolErrors'] if analysis(t) else None) for t in trials])
    lines+=table(['Arm','Tool','Observed submission-to-result ms','Execution ms','Submission-to-execution ms (queue/preparation/asks)'],[(t['arm'],r['tool'],r['submissionToResultMs'],r['executionMs'],r.get('submissionToExecutionMs')) for t in trials if analysis(t) for r in analysis(t)['toolLatency']])
    lines+=table(['Arm','Repeated identical reads observed','Submitted category sequence','Result-to-next-action gaps ms'],[(t['arm'],analysis(t)['workPatterns']['observed']['repeatedIdenticalReads'] if analysis(t) else None,
        ' → '.join(r['category'] for r in analysis(t)['workPatterns']['observed']['toolSequence']) if analysis(t) else None,
        ', '.join(display(r['gapMs']) for r in analysis(t)['workPatterns']['observed']['resultToNextAction']) if analysis(t) else None) for t in trials])
    lines+=table(['Arm','Edit-chain calls','Between-edit gaps ms','Submission-to-result sum ms','Elapsed ms'],[(t['arm'],c['calls'],c['betweenEditsMs'],c['submissionToResultMs'],c['elapsedMs']) for t in trials if analysis(t) for c in analysis(t)['workPatterns']['observed']['editChains']])
    lines+=['','Categories use declared tool identities only; test versus other shell operations is unsupported without validated operation metadata. Result-to-next-action gaps are observed boundary gaps, not thinking/idle or removable waste.']
    lines+=family(9,'Supervision and false claims','Provenance-separated inputs are observed, not inferred from prose. Genuine corrections/nudges/approvals/clarification answers and their wait durations need explicit labels/receipts. False waiting needs complete same-checkpoint work-state and validated semantic labels; false test claims need named execution evidence and cited semantic labels. Supplied controller assessments appear below; absent labels remain unknown, never phrase-only verdicts. Zero observed human receipts is not complete human-burden coverage.')
    lines+=table(['Arm','Human-labeled inputs observed','Scripted inputs observed','Notices observed','Unknown provenance inputs','Clarification calls observed','False waiting / test claims'],[(t['arm'],*[analysis(t)['interactions']['provenance'][k] if analysis(t) else None for k in ('human','scripted','notice','unknown')],observed(t).get('clarificationCalls'),assessment_cell(t,'work-pending')+' / '+assessment_cell(t,'tests-passed')) for t in trials])
    lines+=table(['Arm','Controller supervision provenance','Kind','Observed receipts'],[(t['arm'],p,k,v) for t in trials for p,counts in (behavior(t).get('supervision') or {}).items() for k,v in counts.items()])
    lines+=table(['Arm','Supervision kind','Provenance','Observed wait ms','Clock / reference'],[(t['arm'],r['kind'],r['provenance'],r['durationMs'],str(r['clock'])+' / '+r['reference']) for t in trials for r in behavior(t).get('supervisionWaits',[])])
    lines+=table(['Arm','Assessment','Verdict','Provisional verdict','Checkpoint','Semantic source / label','State / test reference','Reason'],[(t['arm'],r.get('kind','unknown'),r.get('verdict'),r.get('provisionalVerdict'),r.get('checkpointId'),str(r.get('source'))+' / '+str(r.get('reference')),r.get('stateReference'),r.get('reason')) for t in trials for r in behavior(t).get('assessments',[])])
    lines+=family(10,'No-nudge continuation','Measured only with validated correlated episodes. Historical selected runs lack child completion, report receipt, parent state, genuine input provenance and verified useful progress episodes. Collector and validation remain required; no automatic success from a final response.')
    lines+=table(['Arm','No-nudge continuation','Delivery / request / progress delay','Reason'],[(t['arm'],json.dumps(analysis(t)['continuation']['summary']) if analysis(t) and analysis(t)['continuation'] else 'unknown','see correlated episodes below' if analysis(t) and analysis(t)['continuation'] else 'unknown','Validated shared continuation scorer' if analysis(t) and analysis(t)['continuation'] else 'No validated continuation episode in selected raw artifact') for t in trials])
    lines+=table(['Arm','Episode','Completion / consumer scope','Outcome','Completion-to-consumer delivery ms','Delivery-to-request ms','Ready-to-useful-progress ms','Actionable-idle ms','Reason'],[(t['arm'],e['id'],e.get('completionKind','specialist')+' / '+e.get('observerScope','native-parent'),e['noNudgeContinuation'],e['completionToReportMs'],e['deliveryToParentStartMs'],e['readyToUsefulProgressMs'],e['actionableIdleMs'],e['reason']) for t in trials if analysis(t) and analysis(t)['continuation'] for e in analysis(t)['continuation']['episodes']])
    lines+=family(11,'Safety, recovery and budget completion','Task acceptance is not comprehensive safety coverage. Historical captures lack protected-state/safety assessments, declared scored completion budgets, and correlated recovery episodes with trigger plus verified recovery. Runtime spending ceilings are not completion-budget scores. Controller-captured trigger/repair/test intervals and subsequent check results are shown where available. Missing trigger-bound request/token counters remain unknown; fixture-triggered attribution is not a production root-cause diagnosis.')
    lines+=table(['Arm','Safety','Recovery','Verified completion within declared scored budget'],[(t['arm'],score_cell(t,'safety'),score_cell(t,'recovery'),'unknown — no scored budget declaration') for t in trials])
    lines+=['','### Native runtime-observed diagnostics (not controller/semantic authority)','',
        'These ordinary native harness callbacks measure SDK attempts, actual tool execution outcomes, scripted decisions, background Bash exits and event/sampled scheduler state. Same-container arbitrary Bash can tamper with runtime telemetry; a host-published capture hash preserves selection/integrity, not unforgeable authorship. Independent gateway requests and controller-verified task/file checks remain separate. No observed permission decision is labeled human.']
    runtime=lambda t:(analysis(t) or {}).get('runtimeObserved') or {}
    lines+=table(['Arm','Telemetry provenance / coverage','SDK attempts observed','Execution failures / observed','Scripted decisions','Same-command failed → passed observations','Continuous scheduler / actionable idle'],[(t['arm'],str(runtime(t).get('provenance','missing'))+' / '+str(runtime(t).get('coverage','not-collected')),len(runtime(t)['sdk']) if 'sdk' in runtime(t) else None,
        str(sum(e['status']=='failed' for e in runtime(t)['executions']))+' / '+str(len(runtime(t)['executions'])) if 'executions' in runtime(t) else None,len(runtime(t)['decisions']) if 'decisions' in runtime(t) else None,
        len(runtime(t).get('recovery',{}).get('sameCheckPasses',[])) if runtime(t).get('recovery') else None,'not covered / unknown') for t in trials])
    lines+=table(['Arm','Native tool','Call','Execution status','Observed execution ms','Exact command hash (not semantic test identity)'],[(t['arm'],e['toolName'],e['toolCallId'],e['status'],e['durationMs'],e['commandHash']) for t in trials for e in runtime(t).get('executions',[])])
    lines+=table(['Arm','Native background shell','Status','Observed exit code','Stop reason'],[(t['arm'],e['shellId'],e['status'],e['exitCode'],e['stopReason']) for t in trials for e in runtime(t).get('shells',[])])
    lines+=table(['Arm','Native shell','Completion-to-injection ms','Injection-to-SDK request ms','Subsequent completed tool (not useful-work verdict)','Injection-to-tool ms','Explicit fixture Stop-held'],[(t['arm'],e['shellId'],e['completionToDeliveryMs'],e['deliveryToRequestMs'],e['firstSubsequentToolId'],e['deliveryToSubsequentToolMs'],e['explicitFixtureStopHeld']) for t in trials for e in runtime(t).get('shells',[])])
    lines+=table(['Arm','Observed decision tool','Decision','Provenance (not human)','Request'],[(t['arm'],e['toolName'],e['decision'],e['provenance'],e['requestId']) for t in trials for e in runtime(t).get('decisions',[])])
    lines+=table(['Arm','Observed rerun trigger','Same command passing call','Observed interval ms','SDK attempts observed in interval','Reported tokens observed in interval','Causal repair verified'],[(t['arm'],e['triggerId'],e['subsequentId'],e['elapsedMs'],e['extraSdkAttemptsObserved'],e['extraReportedTokens'],e['causalRepairVerified']) for t in trials for e in runtime(t).get('recovery',{}).get('sameCheckPasses',[])])
    lines+=['','Identical Bash-command reruns are observations, not proof of test coverage or causal repair. Native shell notice delivery and subsequent tools are measured; useful followup requires a defined fixture and independently checked output. Scheduler intervals are bounded by observations, never asserted continuous or used to certify false waiting.']
    lines+=table(['Arm','Actual test execution','Named test','Exit code','Checkpoint','Reference'],[(t['arm'],r['id'],r['testId'],r['exitCode'],r['checkpointId'],r['reference']) for t in trials for r in behavior(t).get('executions',[])])
    lines+=table(['Arm','Safety assessment','Verdict','Source','Reference'],[(t['arm'],r['kind'],r['verdict'],r.get('source'),r.get('reference')) for t in trials for r in (behavior(t).get('evidence') or {}).get('safety',[])])
    lines+=table(['Arm','Recovery trigger','Status','Extra SDK attempts','Extra reported tokens','Trigger-to-test ms','Subsequent correctness','Resource boundary','Attribution / reference'],[(t['arm'],r['trigger'],r['status'],r.get('extraRequests'),r.get('extraTokens'),r.get('extraMs'),r.get('subsequentCorrectness'),r.get('resourceBoundary'),str(r.get('attribution'))+' / '+r['reference']) for t in trials for r in (behavior(t).get('evidence') or {}).get('recovery',[])])
    lines+=table(['Arm','Behavioral coverage','Controller source / integrity','Exact missing capability'],[(t['arm'],behavior(t).get('coverage','not-collected'),json.dumps(behavior(t).get('authority',{})),reason) for t in trials for reason in behavior(t).get('missingCapabilities',[(t.get('activity') or {}).get('reason','No controller envelope')])])
    lines+=family(12,'Configuration, payload attribution and calibration','Pinned manifest build/model/provider identities are recorded. Actual per-request payload bytes/hashes below are observed SDK attribution, not a causal explanation. Effort/protocol/network/cache-order equivalence requires additional controls. Grader order/repeat reliability and human calibration are not collected: no grades, human observations or references in this targeted evidence path.')
    lines+=table(['Arm','Build fingerprint','Model','Provider'],[(name,fp,report['model'],report['provider']) for name,fp in report['buildFingerprints'].items()])
    lines+=table(['Arm','Captured SDK route','Captured controls','Runtime-resolved context tokens'],[(t['arm'],analysis(t)['configuration']['provider'] if analysis(t) else None,json.dumps(analysis(t)['configuration']['controls']) if analysis(t) else None,analysis(t)['configuration']['resolvedContextTokens'] if analysis(t) else None) for t in trials])
    lines+=table(['Arm','Request','System bytes','Tools bytes','History bytes','System hash','Tools hash'],[(t['arm'],r['id'],*[ (r.get('requestShape') or {}).get(k) for k in ('systemBytes','toolsBytes','historyBytes','systemHash','toolsHash')]) for t in trials if analysis(t) for r in analysis(t)['normalized']['requests']])
    lines+=family(13,'Activity timeline','Historical captures: partial timestamp envelopes. New captures: explicit process observation windows; lane totals are non-additive. Union/overlap prevents double counting. Unclassified time is neither proven thinking nor proven idle. Tool lane means submitted/pending, not executing. Missing phase/scheduler/approval/background-dependency lanes are unsupported, not zero.')
    lines+=table(['Arm','Observed envelope ms','Request union ms','Tool pending union ms','Any interval union ms','Overlap ms','Unclassified request-phase ms','Unclassified outside-request ms','Censored / invalid intervals'],[(t['arm'],
        analysis(t)['timeline']['window']['end']-analysis(t)['timeline']['window']['start'] if analysis(t) and analysis(t)['timeline']['window'] else None,
        analysis(t)['timeline']['laneUnionMs'].get('request-in-flight') if analysis(t) else None,analysis(t)['timeline']['laneUnionMs'].get('tool-submitted-to-result') if analysis(t) else None,
        *[analysis(t)['timeline'][k] if analysis(t) else None for k in ('coveredUnionMs','overlapMs','unclassifiedInRequestMs','unclassifiedOutsideRequestMs')],
        f"{display(analysis(t)['timeline']['censoredIntervals'])} / {display(analysis(t)['timeline']['invalidIntervals'])}" if analysis(t) else None) for t in trials])
    lines+=table(['Arm','End-to-end launcher envelope ms','Launcher status','Scope / clock'],[(t['arm'],analysis(t)['launcherObservation']['durationMs'],analysis(t)['launcherObservation']['status'],analysis(t)['launcherObservation']['scope']+' / '+analysis(t)['launcherObservation']['clock']['id']) if analysis(t) and analysis(t).get('launcherObservation') else (t['arm'],None,'unknown','No explicit launcher monotonic envelope in historical artifact') for t in trials])
    lines+=table(['Arm','Observed reasoning delivery ms','Observed answer delivery ms','Tool-argument delivery ms','Actual execution union ms','Approval wait union ms','Clock / window coverage'],[(t['arm'],*[analysis(t)['timeline']['laneUnionMs'].get(k) if analysis(t) else None for k in ('reasoning-stream','answer-stream','tool-argument-stream','tool-executing','approval-wait')],
        f"{analysis(t)['timeline']['window']['clock']} / {analysis(t)['timeline']['coverage']}" if analysis(t) and analysis(t)['timeline']['window'] else 'unknown') for t in trials])
    lines+=table(['Arm','Captured request','Duration ms','First observed chunk delay ms','Scope','Status'],[(t['arm'],r['requestId'],r['durationMs'],r['firstObservedByteMs'],r['scope'],r['status']) for t in trials if analysis(t) and analysis(t).get('collectedActivity') for r in analysis(t)['collectedActivity']['requestSpans']])
    lines+=table(['Arm','Timing receipts','Dropped receipts','Open / unmatched spans','Observation status','Stop receipts (points only)'],[(t['arm'],analysis(t)['collectedActivity']['coverage'],analysis(t)['collectedActivity']['dropped'],f"{analysis(t)['collectedActivity']['openIntervals']} / {analysis(t)['collectedActivity']['unmatchedReceipts']}",analysis(t)['collectedActivity']['observation']['status'],sum(p['kind']=='stop' and p['scope']=='parent' for p in analysis(t)['collectedActivity']['points'])) if analysis(t) and analysis(t).get('collectedActivity') else (t['arm'],'not-collected',None,'unknown','Historical capture has no monotonic receipts',None) for t in trials])
    lines+=table(['Arm','Inter-request gap ms','Overlap ms','Scope'],[(t['arm'],g['gapMs'],g['overlapMs'],g['scope']) for t in trials if analysis(t) and analysis(t).get('collectedActivity') for g in analysis(t)['collectedActivity']['requestGaps']])
    lines+=table(['Arm','Gateway request','Reasoning delivery ms','Answer delivery ms','Tool-argument delivery ms','Clock / coverage'],[(t['arm'],g['requestId'],*[g['analysis']['timelines']['parent']['laneUnionMs'].get(k) for k in ('reasoning-stream','answer-stream','tool-argument-stream')],f"{g['analysis']['clock']['id']} / {g['analysis']['coverage']}") for t in trials if analysis(t) for g in analysis(t).get('gatewayActivity',[])])
    lines+=table(['Arm','Gateway inter-request gap ms','Overlap ms','Clock','Scope'],[(t['arm'],g['gapMs'],g['overlapMs'],c['analysis']['clock']['id'],c['scope']) for t in trials if analysis(t) for c in analysis(t).get('gatewayCohorts',[]) for g in c['analysis']['requestGaps']])
    lines+=['','Future captures use explicit process observation windows and monotonic clocks; historical artifacts retain event-envelope scope. Stream intervals are observed delivery envelopes, not internal thinking/writing computation. Native SDK first-byte means first SDK chunk; gateway first-byte means upstream bytes. Separate native/gateway clocks are never subtracted or pooled. Unknown timeline lanes where absent: actual execution, approval waits, background dependencies and scheduler ready/idle/Stop-held/blocked; stop receipts are points, not continuous idle-state proof. Historical point events do not establish continuous durations.','',
        '### Activity source references (immutable raw evidence)','']
    lines.append(f"Evidence schema: {display(report.get('activityEvidenceSchemaVersion'))}; analyzer pipeline SHA-256: {display(report.get('analysisPipelineSha256'))}. Full source-file hashes are in summary.json.")
    for t in trials:
        source=(t.get('activity') or {}).get('source') or {}
        lines.append(f"- {t['arm']}: {display(source.get('reference'))}; SHA-256 {display(source.get('sha256'))}.")
    lines+=['','## Remaining collection and analysis work','',
        '- Collect new native/gateway monotonic receipts on future runs; historical phase/execution/approval evidence cannot be reconstructed. Scheduler/dependency and broader lifecycle/continuation coverage still need collectors; cross-process alignment remains explicit work.',
        '- Validate semantic waiting/verification labels, actual fault/recovery episodes, scored budgets, safety references and human calibration.',
        '- Validate test-operation classification and richer distributions; historical samples cannot establish cohort-wide capture completeness.',
        '- Retain failures and originals; this enriched report is derived evidence, not permission for new paid experiments or external superiority claims.','','## Limits','']
    lines.extend('- '+warning for warning in report['warnings'])
    return '\n'.join(lines)+'\n'
