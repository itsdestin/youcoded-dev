#!/usr/bin/env python3
"""Versioned plan/prepare/check/run/report path; default run is no-provider command export.

Paid run still needs --execute, exact receipt and provider key file. No install/pull.
Old targeted manifests remain unchanged. Reporting uses the independently reviewed
full evidence pipeline; legacy inventories are supplemental compatibility files.
"""
import sys
sys.dont_write_bytecode=True
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import targeted_workflow as legacy
import run_objective_comparison as serial
import comparison_tasks as tasks

HERE=Path(__file__).resolve().parent
require=serial.require
canonical=legacy.canonical
read_json=legacy.read_json
write_new=legacy.write_new
tree=legacy.tree
sha=legacy.sha

def node_json(script,args,cwd=HERE):
    p=subprocess.run(['node','--input-type=module','-e',script,*map(str,args)],cwd=cwd,env=serial.child_env({'sourceDir':str(HERE)}),capture_output=True,text=True)
    require(p.returncode==0,'Offline planner/export refused inputs')
    return json.loads(p.stdout)

def resolve(request,source=HERE):
    # Resolve from a JSON file, not interpolated code or shell strings.
    with tempfile.TemporaryDirectory(prefix='yc-mode-plan-') as tmp:
        p=Path(tmp)/'request.json';p.write_text(json.dumps(request))
        return node_json("import fs from 'node:fs';import {planMode} from './evaluation-modes.mjs';console.log(JSON.stringify(planMode(JSON.parse(fs.readFileSync(process.argv[1])))));",[p],source)

def desktop_snapshot(directory):
    return node_json("import {snapshotDesktop} from './targeted-plan.mjs';console.log(JSON.stringify(snapshotDesktop(process.argv[1])));",[directory])

def plan(request_path,out):
    request=read_json(request_path);p=resolve(request);out=canonical(out)
    require(not out.exists() and out.parent.is_dir(),'Fresh plan directory required')
    builds={}
    for arm in p['arms']:
        if arm['adapter']=='youcoded':
            require('desktopDir' in arm,'Native build path required')
            build=desktop_snapshot(arm['desktopDir'])
            require(build['sha256']==arm['fingerprint'],'Native arm fingerprint differs from actual build inputs')
            builds[arm['id']]=build
        else:
            # The immutable image supplies competitor installation bytes; its digest
            # is the reviewed pin, not a made-up independent client binary hash.
            require(arm['fingerprint']==p['image'].rsplit(':',1)[1],'Competitor fingerprint must equal immutable image digest')
    p['builds']=builds;p['request']=request;p['sourceHashes']=tree(HERE,True)
    out.mkdir(mode=0o700);write_new(out/'plan.json',p)
    return p

def export_legacy(p,dest):
    selected=[t for t in p['tasks'] if t.get('legacy')]
    if not selected:return
    # Existing frozen suite behavior is preserved; only NEW exported files get the explicit limits/image.
    with tempfile.TemporaryDirectory(prefix='yc-mode-export-') as tmp:
        ids=Path(tmp)/'ids.json';ids.write_text(json.dumps(selected))
        node_json("import fs from 'node:fs';import {developmentTasks} from './targeted-plan.mjs';import {heldoutCases} from './heldout-cases.mjs';import {exportSuite} from './suite.mjs';const all=[...developmentTasks,...heldoutCases];for(const t of JSON.parse(fs.readFileSync(process.argv[1])))exportSuite(process.argv[2]+'/'+t.id,[all.find(x=>x.id===t.id)],{split:t.split});console.log('{}');",[ids,tmp])
        for t in selected:
            src=Path(tmp)/t['id']/t['id'];target=dest/t['id'];shutil.copytree(src,target)
            (target/'environment/Dockerfile').write_text('FROM '+p['image']+'\nWORKDIR /app\nCOPY fixtures/ /app/\n')
            file=target/'task.toml';s=file.read_text().replace('timeout_sec = 300','timeout_sec = '+str(p['limits']['timeoutSec'])).replace('timeout_sec = 30\n','timeout_sec = '+str(p['limits']['verifierTimeoutSec'])+'\n')
            from legacy_verification import contract_for
            contract=contract_for(t['id'])
            require(t.get('legacyVerification')==contract,'Legacy protocol binding changed')
            s=s.replace('[metadata]\n','[metadata]\ncontract = "'+contract['version']+'"\n').replace('[verifier]\n','[verifier]\nenvironment_mode = "shared"\n');file.write_text(s)
            # WHY: only fresh mode exports acquire host acceptance. Frozen
            # generated suites/check strings and historical attempts stay intact.
            (target/'tests/verify.py').unlink()
            (target/'tests/host-contract.json').write_text(json.dumps(contract,sort_keys=True))
            (target/'tests/test.sh').write_text('#!/bin/sh\necho "Host verifier plugin required; no in-container acceptance" >&2\nexit 1\n')

def prepare(plan_path,settings_path,out):
    p=read_json(plan_path);settings=read_json(settings_path)
    require(set(settings)=={'harbor','sharedLedgerPath','gatePolicy','stopMarginUsd'},'Exact documented execution settings required')
    # Re-resolve task/arm matrix from trusted current definitions before any copying.
    resolved=resolve(p['request'])
    require({k:v for k,v in p.items() if k not in ('builds','request','sourceHashes')}==resolved,'Plan matrix changed')
    require(tree(HERE,True)==p['sourceHashes'],'Planner/controller source changed since plan')
    metadata=legacy.ledger_metadata(settings['sharedLedgerPath'])
    require(p['budgetUsd']<=metadata['limitUsd']<=15,'Existing cumulative USD15 cap required')
    # Reuse the existing strict request-price reservation validation.
    legacy.settings_validate(dict(sourceDir=str(HERE),harbor=settings['harbor'],image=p['image'],sharedLedgerPath=settings['sharedLedgerPath'],gatePolicy=settings['gatePolicy'],workers=1,stopMarginUsd=settings['stopMarginUsd']),dict(budgetUsd=p['budgetUsd'],model=p['model'],pinnedProvider=p['provider']))
    out=canonical(out);require(not out.exists() and out.parent.is_dir(),'Fresh preparation required')
    protected=[HERE,canonical(plan_path).parent,canonical(settings['sharedLedgerPath']).parent,*[canonical(b['desktopDir']) for b in p['builds'].values()]]
    require(not any(out==r or r in out.parents for r in protected),'Output overlaps protected input')
    out.mkdir(mode=0o700)
    # Preserve partial preparation on failure, labeled and never runnable, rather than deleting evidence.
    write_new(out/'plan.json',p)
    try:
        legacy.copy_map(HERE,out/'source',p['sourceHashes'])
        for arm,build in p['builds'].items():
            current=desktop_snapshot(build['desktopDir']);require(current==build,'Build changed after plan')
            legacy.copy_map(Path(build['desktopDir']),out/'builds'/arm,build['files'])
        selected_new=[t for t in p['tasks'] if not t.get('legacy')]
        if selected_new:
            identity=tasks.snapshot(HERE.parents[1]/'youcoded',out/'repo-snapshot')
            # WHY: new preparations explicitly select external-v2, never rewrite v1.
            from lab_harbor_export import export_suite
            export_suite(out/'repo-snapshot',out/'tasks',p['image'],p['limits'])
            for task in tasks.IDS:
                if task not in {t['id'] for t in selected_new}:shutil.rmtree(out/'tasks'/task)
        else:
            identity=None;(out/'tasks').mkdir()
        export_legacy(p,out/'tasks')
        cohort='modes-'+secrets.token_hex(12);network='yc-'+cohort;gateway=network+'-gateway'
        (out/'source/gate-network.yaml').write_text('services:\n  main:\n    networks: [default, budget]\nnetworks:\n  budget:\n    external: true\n    name: '+network+'\n')
        rows=[];grants={}
        for cell in p['cells']:
            arm=next(a for a in p['arms'] if a['id']==cell['arm'])
            row=dict(trialKey=json.dumps([cohort,cell['taskId'],cell['model'],cell['arm'],cell['repetition']],separators=(',',':')),taskId=cell['taskId'],model=cell['model'],agent=cell['agent'],arm=cell['arm'],repetition=cell['repetition'],taskPath=str(out/'tasks'/cell['taskId']))
            row['id']=serial.job_id(row);row['tokenFile']=str(out/'tokens'/row['id'])
            if p['mode']=='basic':row['buildVariant']=cell['arm']
            token='yc-gate-'+secrets.token_urlsafe(32);tokenpath=Path(row['tokenFile']);tokenpath.parent.mkdir(mode=0o700,exist_ok=True)
            fd=os.open(tokenpath,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'w') as f:f.write(token+'\n')
            grants[token]=dict(trialId=row['id'],maxRequests=p['limits']['maxRequests'],policy=settings['gatePolicy'],budgetScope=dict(id=cohort,limitUsd=p['budgetUsd']))
            rows.append(row)
        write_new(out/'gateway-config.json',dict(host='0.0.0.0',port=18766,allowNetworkBind=True,ledgerPath='/ledger/'+Path(settings['sharedLedgerPath']).name,tokens=grants,**metadata))
        c=dict(sourceDir=str(out/'source'),harbor=settings['harbor'],ledgerPath=settings['sharedLedgerPath'],jobsDir=str(out/'jobs'),eventsPath=str(out/'events.jsonl'),gateUrl='http://yc-router-gateway:18766',comparisonKey=cohort,budgetCapUsd=metadata['limitUsd'],stopMarginUsd=settings['stopMarginUsd'],evaluationLimits=p['limits'])
        if p['tasks']:
            from lab_harbor_export import plugin_config
            c['hostVerification'] = dict(**plugin_config(),taskIds=[t['id'] for t in p['tasks']])
        if p['mode']=='basic':c['desktopVariants']={a:str(out/'builds'/a) for a in p['builds']}
        else:c['desktopDir']=str(out/'builds'/next(iter(p['builds'])))
        manifest=dict(schemaVersion=2,executionAuthorized=False,config=c,trials=rows,nativeSettings=dict(maxRequests=p['limits']['maxRequests'],timeoutSec=p['limits']['timeoutSec'],differences='Mode v2 explicit limits; controlled CLI retrieval, not native/live WebSearch; image dependencies not build fingerprint.'),evaluation=dict(mode=p['mode'],profile=p['profile'],network=p['network'],blockers=p['blockers'],suiteVersion=p['suiteVersion'],repository=identity,marketingReady=False),preparation=dict(cohort=cohort,scopeID=cohort,planSha256=sha((out/'plan.json').read_bytes()),experimentLimitUsd=p['budgetUsd'],sharedLedger=metadata,image=p['image'],expectedImageID=None,network=network,gateway=gateway,gatewayConfigSha256=sha((out/'gateway-config.json').read_bytes())),snapshotHashes={})
        for d in ('source','tasks','builds'):
            manifest['snapshotHashes'].update({str(out/d/k):v for k,v in tree(out/d).items()})
        write_new(out/'prepared-manifest.json',manifest)
        receipt=legacy.receipt_for(manifest,out/'prepared-manifest.json');receipt['approved']=False
        write_new(out/'authorization-template.json',receipt)
        check(out/'prepared-manifest.json');return manifest
    except BaseException:
        write_new(out/'PREPARATION-FAILED.json',{'runnable':False,'reason':'Incomplete preparation; retained for inspection. Use a fresh output.'});raise

def check(manifest_path):
    path=canonical(manifest_path);root=path.parent;m=read_json(path)
    require(not (root/'PREPARATION-FAILED.json').exists(),'Failed preparation cannot run')
    require(m.get('schemaVersion')==2 and m.get('executionAuthorized') is False,'Prepared v2 manifest required')
    p=read_json(root/'plan.json')
    prep=m['preparation'];c=m['config']
    require(sha((root/'plan.json').read_bytes())==prep['planSha256'],'Plan hash changed')
    require(prep['cohort'].startswith('modes-') and len(prep['cohort'])==30 and prep['scopeID']==prep['cohort'] and prep['network']=='yc-'+prep['cohort'] and prep['gateway']==prep['network']+'-gateway','Scoped identity changed')
    require(root.stat().st_mode&0o777==0o700,'Private preparation root required')
    actual={str(root/d/k):v for d in ('source','tasks','builds') for k,v in tree(root/d).items()}
    require(actual==m['snapshotHashes'],'Immutable task/build/source snapshot changed')
    # WHY: checking a bundle must never execute code copied into that bundle
    # before authorization. Use the trusted workflow's planner, after hashes.
    resolved=resolve(p['request'])
    require({k:v for k,v in p.items() if k not in ('builds','request','sourceHashes')}==resolved,'Frozen plan scope changed')
    require(set(x.name for x in (root/'tasks').iterdir())=={t['id'] for t in p['tasks']},'Task set changed')
    require(c['sourceDir']==str(root/'source') and c['jobsDir']==str(root/'jobs') and c['eventsPath']==str(root/'events.jsonl') and c['comparisonKey']==prep['cohort'] and c['gateUrl']=='http://yc-router-gateway:18766','Runtime paths changed')
    from lab_harbor_export import plugin_config
    new_ids=[t['id'] for t in p['tasks']]
    require(c.get('hostVerification')==(dict(**plugin_config(),taskIds=new_ids) if new_ids else None),'Host plugin configuration drift')
    require(c['evaluationLimits']==p['limits'] and m['nativeSettings']['maxRequests']==p['limits']['maxRequests'] and m['nativeSettings']['timeoutSec']==p['limits']['timeoutSec'],'Limit drift')
    if p['mode']=='basic':require(c.get('desktopVariants')=={a:str(root/'builds'/a) for a in p['builds']} and 'desktopDir' not in c,'Build arm drift')
    else:require(c.get('desktopDir')==str(root/'builds'/next(iter(p['builds']))) and 'desktopVariants' not in c,'Build arm drift')
    for arm,b in p['builds'].items():legacy.verify_map(root/'builds'/arm,b['files'],True)
    expected=[(x['taskId'],x['model'],x['agent'],x['arm'],x['repetition']) for x in p['cells']]
    actual_rows=[(x['taskId'],x['model'],x['agent'],x['arm'],x['repetition']) for x in m['trials']]
    require(actual_rows==expected,'Trial matrix changed')
    require(sha((root/'gateway-config.json').read_bytes())==prep['gatewayConfigSha256'],'Scoped gateway changed')
    gate=read_json(root/'gateway-config.json');require(legacy.ledger_metadata(c['ledgerPath'])==prep['sharedLedger'],'Shared budget metadata changed')
    require(gate['ledgerPath']=='/ledger/'+Path(c['ledgerPath']).name and gate['limitUsd']==prep['sharedLedger']['limitUsd'] and c['budgetCapUsd']==gate['limitUsd'] and prep['experimentLimitUsd']==p['budgetUsd'] and 0<c['stopMarginUsd']<p['budgetUsd'],'Budget drift')
    require(gate['host']=='0.0.0.0' and gate['port']==18766 and gate['allowNetworkBind'] is True and len(gate['tokens'])==len(expected),'Gateway scope drift')
    for r in m['trials']:
        require(r['id']==serial.job_id(r) and r['taskPath']==str(root/'tasks'/r['taskId']) and Path(r['tokenFile'])==root/'tokens'/r['id'],'Trial path drift')
        if p['mode']=='basic':require(r.get('buildVariant')==r['arm'],'Build selection drift')
        else:require('buildVariant' not in r,'Unexpected variant')
        token=canonical(r['tokenFile']);require(token.stat().st_mode&0o777==0o600,'Private token required');value=token.read_text().strip();g=gate['tokens'][value]
        require(g==dict(trialId=r['id'],maxRequests=p['limits']['maxRequests'],policy=g['policy'],budgetScope=dict(id=prep['scopeID'],limitUsd=p['budgetUsd'])),'Grant scope changed')
        require(g['policy']['model']==p['model'] and g['policy']['provider']==p['provider'],'Route drift')
    require(prep['image']==p['image'] and prep['expectedImageID'] is None,'Image pin drift')
    require(m['evaluation']['mode']==p['mode'] and m['evaluation']['blockers']==p['blockers'] and m['evaluation']['marketingReady'] is False,'Mode metadata changed')
    serial.validate(m);return m

def run(manifest_path,execute=False,authorization=None,key_file=None,backend=None,dry_out=None):
    if not execute:
        require(dry_out is not None,'No-provider run requires fresh --dry-out; paid run requires --execute and receipt')
        m=check(manifest_path);out=canonical(dry_out)
        commands=[serial.command_for(r,m['config']) for r in m['trials']]
        write_new(out,dict(dryRun=True,providerCalls=0,executionAuthorized=False,manifestSha256=sha(canonical(manifest_path).read_bytes()),blockers=m['evaluation']['blockers'],commands=commands));return commands
    require(authorization is not None and key_file is not None,'Exact approval receipt and key path required before execution')
    # Keep admission at this public entry BEFORE calling the acquisition API.
    # Its nested authority context joins this same live private lease, so there
    # is still exactly one current whole-matrix/container-probe batch.
    m=check(manifest_path)
    require(m.get('schemaVersion')==2,'Mode execution qualification requires schema 2 external-v2')
    import evaluation_qualification
    with evaluation_qualification.execution_authority(manifest_path,authorization):
        return legacy.run(manifest_path,True,authorization,key_file,backend)

def report(manifest_path,out):
    # WHY: historical evidence must remain reportable without today's planner,
    # Docker capabilities or paid-admission qualification. The loader verifies
    # original frozen manifest/plan/snapshots/journals/ledger, without executing them.
    import targeted_report
    summary=targeted_report.load_targeted_report(manifest_path)
    m=read_json(manifest_path);root=canonical(manifest_path).parent;out=canonical(out)
    require(not out.exists() and out.parent.is_dir(),'Fresh report output required');out.mkdir(mode=0o700)
    write_new(out/'summary.json',summary)
    (out/'report.md').write_text(targeted_report.render_markdown(summary))
    events=[]
    if (root/'events.jsonl').exists():events=[json.loads(line) for line in (root/'events.jsonl').read_text().splitlines()]
    result=dict(schemaVersion=2,kind='mode-execution-inventory',mode=m['evaluation']['mode'],manifestSha256=sha(canonical(manifest_path).read_bytes()),plannedCells=len(m['trials']),events=events,tasks=read_json(root/'plan.json')['tasks'],evaluation=m['evaluation'],qualification='offline-workflow-only; no paid performance qualification',coverage={name:dict(status='not-collected',reason='Supplemental legacy inventory only; see summary.json/report.md for the full evidence report and metric-specific coverage.') for name in ('resources','time-activity','interaction-burden','work-patterns','supervision','follow-through','recovery','comparison')},marketingReady=False)
    outcomes={e.get('trialKey'):e for e in events if e.get('event')=='outcome'}
    result['cells']=[dict(taskId=r['taskId'],arm=r['arm'],adapter=r['agent'],repetition=r['repetition'],status='not-run' if r['trialKey'] not in outcomes else 'infrastructure-error' if outcomes[r['trialKey']].get('infrastructureError') else 'verifier-recorded',rawOutcome=outcomes.get(r['trialKey'])) for r in m['trials']]
    result['coverage']['outcome-safety']=dict(status='partial' if outcomes else 'not-collected',reason='Controller-owned functional/protected-state task checks only; no comprehensive safety certification. Raw verifier records retained including failures.')
    write_new(out/'inventory.json',result)
    text='# Evaluation mode execution inventory\n\n'+f"Mode: {result['mode']}; planned cells: {result['plannedCells']}.\n\nSupplemental execution inventory only. See report.md and summary.json for the full evidence report. This inventory is not paid qualification.\n\n"+'\n'.join(f'- {k}: {v["status"]} — {v["reason"]}' for k,v in result['coverage'].items())+'\n\nPublic development tasks and previously inspected evaluation-only tasks do not establish unseen held-out evidence. No marketing-ready default.\n'
    text+='\n## Planned cells and retained outcomes\n\n| Task | Arm | Adapter | Repetition | Status |\n|---|---|---|---|---|\n'+'\n'.join('| '+ ' | '.join(str(cell[k]) for k in ('taskId','arm','adapter','repetition','status'))+' |' for cell in result['cells'])+'\n'
    (out/'inventory.md').write_text(text);return result

def offline_fixture(out):
    """Retained, visibly synthetic orchestration/export evidence, never paid work."""
    out=canonical(out);require(not out.exists() and out.parent.is_dir(),'Fresh fixture root required');out.mkdir(mode=0o700)
    build=out/'fixture-build';(build/'dist/main').mkdir(parents=True);(build/'test-engine').mkdir()
    (build/'dist/main/create-runtime.js').write_text('// OFFLINE TEST DOUBLE: not a runnable app\n')
    for name in ('package.json','package-lock.json'):(build/name).write_text('{}')
    for name in ('runner','worker','observer','state','scenario','faults','clarifications','io'):(build/'test-engine'/('lab-'+name+'.mjs')).write_text('// OFFLINE TEST DOUBLE\n')
    fingerprint=desktop_snapshot(build)['sha256'];digest='a'*64
    request=dict(mode='compare',profile='smoke',arms=[dict(id='youcoded',adapter='youcoded',version='build:'+fingerprint,fingerprint=fingerprint,desktopDir=str(build)),dict(id='claude-code',adapter='claude-code',version='2.1.302',fingerprint=digest)],model='anthropic/claude-haiku-5.5',provider='Anthropic',network='controlled-retrieval',limits=dict(maxRequests=60,timeoutSec=720,verifierTimeoutSec=90),budgetUsd=1,image='offline-fixture@sha256:'+digest)
    write_new(out/'request.json',request)
    ledgerdir=out/'fixture-ledger';ledgerdir.mkdir(mode=0o700);ledger=ledgerdir/'ledger.json'
    write_new(ledger,dict(schemaVersion=1,closed=False,requests=[],limitUsd=15,priorUpperUsd=0,chargedUsd=0,reservedUsd=0))
    write_new(out/'settings.json',dict(harbor=str(Path(sys.executable).resolve()),sharedLedgerPath=str(ledger),gatePolicy=dict(model=request['model'],provider=request['provider'],maxContextTokens=32768,maxOutputTokens=8192,maxPromptUsdPerMillion=1,maxCacheWriteUsdPerMillion=1,maxCompletionUsdPerMillion=5,reservationUsd=.2),stopMarginUsd=.01))
    plan(out/'request.json',out/'plan');prepare(out/'plan/plan.json',out/'settings.json',out/'prepared')
    manifest=out/'prepared/prepared-manifest.json';check(manifest);run(manifest,dry_out=out/'commands.json');report(manifest,out/'report')
    controls=[]
    for task in tasks.IDS:
        candidate=out/('reference-'+task);tasks.reset(out/'prepared/repo-snapshot',candidate,task);tasks.reference(candidate,task)
        verdict=tasks.verify(candidate,task);require(verdict['passed'],'Offline reference failed');controls.append(dict(task=task,reference=verdict))
    write_new(out/'reference-verdicts.json',controls)
    return dict(fixture=True,providerCalls=0,cells=6,referencePasses=len(controls))

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    cmd=sub.add_parser('fixture',help='Offline only: retain a non-executable compare workflow plus three reference verifications');cmd.add_argument('--out',required=True)
    cmd=sub.add_parser('plan');cmd.add_argument('--request',required=True);cmd.add_argument('--out',required=True)
    cmd=sub.add_parser('prepare');cmd.add_argument('--plan',required=True);cmd.add_argument('--settings',required=True);cmd.add_argument('--out',required=True)
    cmd=sub.add_parser('qualify',help='Whole-matrix no-provider current runtime qualification; no pulls or keys');cmd.add_argument('--manifest',required=True);cmd.add_argument('--out',required=True)
    cmd.add_argument('--engine-socket',help='Explicit trusted controller Unix socket; no discovery, pulls or provider calls')
    for name in ('check','run','report'):
        cmd=sub.add_parser(name);cmd.add_argument('--manifest',required=True)
        if name=='run':
            cmd.add_argument('--execute',action='store_true');cmd.add_argument('--authorization');cmd.add_argument('--key-file');cmd.add_argument('--dry-out')
        if name=='report':cmd.add_argument('--out',required=True)
    a=parser.parse_args(argv)
    try:
        if a.command=='fixture':result=offline_fixture(a.out)
        elif a.command=='plan':result=plan(a.request,a.out)
        elif a.command=='prepare':result=prepare(a.plan,a.settings,a.out)
        elif a.command=='check':result={'checked':True,'cells':len(check(a.manifest)['trials'])}
        elif a.command=='run':result=run(a.manifest,a.execute,a.authorization,a.key_file,dry_out=a.dry_out)
        elif a.command=='qualify':
            from evaluation_qualification import qualify
            result=qualify(a.manifest,out=a.out,engine_socket=a.engine_socket)
            print(json.dumps(result,sort_keys=True));return 0 if result['qualified'] else 2
        else:result=report(a.manifest,a.out)
        print(json.dumps({'command':a.command,'ok':True,'providerCalls':0 if not getattr(a,'execute',False) else 'receipt-gated'}));return 0
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError):
        print('Mode workflow refused; inspect scope, immutable snapshots, explicit limits and approval receipt.',file=sys.stderr);return 1
if __name__=='__main__':sys.exit(main())
