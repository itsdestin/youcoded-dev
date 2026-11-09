#!/usr/bin/env python3
"""Retained actual Docker no-provider qualification; never installs/pulls or calls a model."""
import argparse
import json
from pathlib import Path
import tempfile
import comparison_tasks as tasks
import secure_evaluation as secure

def run(source,image,out):
    out=Path(out);secure.need(not out.exists(),'fresh evidence root required');out.mkdir(mode=0o700)
    tasks.validate_snapshot(source);executor=secure.DockerExecutor(image);results=[]
    files=['qualify_submission_boundary.py','secure_evaluation.py','comparison_tasks.py','submission-executor.cjs','comparison-loader.cjs','comparison-contracts.json']
    source_hashes={n:tasks.sha((tasks.HERE/n).read_bytes()) for n in files}
    with tempfile.TemporaryDirectory(prefix='yc-isolation-probe-') as tmp:
        observation=executor.call(Path(tmp),'isolation')
        secure.need(observation['uid']==65534 and observation['env']==['HOME','NODE_NO_WARNINGS','PATH'] and not observation['oraclePresent'] and not observation['socketPresent'] and all(v in ('EACCES','EROFS') for v in observation['writes'].values()),'actual isolation capability probe failed: '+str(observation))
    (out/'isolation.json').write_text(json.dumps(observation,indent=2))
    for task in tasks.IDS:
        root=out/('reference-'+task);tasks.reset(source,root,task);baseline=tasks.hashes(root);tasks.reference(root,task)
        verdict=tasks.verify_against(root,task,baseline,source,executor=executor)
        results.append(dict(task=task,control='reference',expectedPass=True,verdict=verdict))
        print(json.dumps(results[-1]),flush=True)
        unchanged=out/('unchanged-'+task);tasks.reset(source,unchanged,task)
        value=tasks.verify_against(unchanged,task,baseline,source,executor=executor)
        results.append(dict(task=task,control='unchanged',expectedPass=False,verdict=value))
        for label in tasks.mutations(task):
            mutant=out/(task+'-'+label);secure.safe_copy(root,mutant);tasks.mutate(mutant,task,label)
            verdict=tasks.verify_against(mutant,task,baseline,source,executor=executor)
            results.append(dict(task=task,control=label,expectedPass=False,verdict=verdict));print(json.dumps(results[-1]),flush=True)
        if task in tasks.IDS[:2]:
            alternative=out/(task+'-alternative');secure.safe_copy(root,alternative)
            name='desktop/src/shared/release-validation.mts' if task==tasks.IDS[0] else 'desktop/src/shared/context-migration.mts'
            p=alternative/name;s=p.read_text();p.write_text(s.replace("a.sha256.toLowerCase()","String(a.sha256).toLowerCase()") if task==tasks.IDS[0] else s.replace("p.openrouter==='long'","['long'].includes(p.openrouter as string)"))
            verdict=tasks.verify_against(alternative,task,baseline,source,executor=executor)
            results.append(dict(task=task,control='alternative',expectedPass=True,verdict=verdict));print(json.dumps(results[-1]),flush=True)
    # These inputs used to terminate the trusted assertion process or forge its success.
    reference=out/('reference-'+tasks.IDS[0]);baseline=json.loads(reference.with_suffix('.input.json').read_text())
    target='desktop/src/main/update-manifest-verify.ts'
    attacks={'early-exit':'process.exit(0);','forged-success':'console.log(JSON.stringify({passed:true}));process.exit(0);','monkeypatch':"require('node:fs').readFileSync=()=>Buffer.from('{}');require('node:crypto').createHash=()=>({update(){return this},digest(){return 'a'.repeat(64)}});process.exit(0);",'tamper':"require('node:fs').writeFileSync('/adapter/comparison-loader.cjs','process.exit(0)');",'loop':'while(true){}','output-flood':"process.stdout.write('x'.repeat(400000));process.exit(0);"}
    for label,code in attacks.items():
        root=out/('attack-'+label);secure.safe_copy(reference,root);(root/target).write_text(code);(root/'submission/test.cjs').write_text('process.exit(0);')
        verdict=tasks.verify_against(root,tasks.IDS[0],baseline,source,executor=executor)
        results.append(dict(task=tasks.IDS[0],control=label,expectedPass=False,verdict=verdict));print(json.dumps(results[-1]),flush=True)
    for label,gate in [('removed-hash','actualHash.toLowerCase() !== entry.sha256.toLowerCase()'),('removed-size','actualSize !== entry.size')]:
        root=out/label;secure.safe_copy(reference,root);p=root/target;text=p.read_text();secure.need(gate in text,'integrity gate control missing');p.write_text(text.replace(gate,'false'))
        verdict=tasks.verify_against(root,tasks.IDS[0],baseline,source,executor=executor)
        results.append(dict(task=tasks.IDS[0],control=label,expectedPass=False,verdict=verdict));print(json.dumps(results[-1]),flush=True)
    root=out/'attack-symlink';secure.safe_copy(reference,root);(root/'submission/escape').symlink_to('/etc/passwd')
    verdict=tasks.verify_against(root,tasks.IDS[0],baseline,source,executor=executor);results.append(dict(task=tasks.IDS[0],control='symlink',expectedPass=False,verdict=verdict))
    secure.need(source_hashes=={n:tasks.sha((tasks.HERE/n).read_bytes()) for n in files},'controller source changed during qualification')
    result=dict(kind='actual-docker-submission-boundary-qualification',image=image,sourceHashes=source_hashes,providerCalls=0,results=results,invocations=executor.evidence,qualified=all(r['verdict']['passed']==r['expectedPass'] for r in results),scope='Task acceptance/controller isolation, not Harbor lifecycle, adapter admission, live model performance or full evaluator completion')
    (out/'results.json').write_text(json.dumps(result,indent=2));return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);p.add_argument('--image',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    result=run(Path(a.source),a.image,a.out);print(json.dumps({k:v for k,v in result.items() if k not in ('results','invocations')}));raise SystemExit(0 if result['qualified'] else 1)
