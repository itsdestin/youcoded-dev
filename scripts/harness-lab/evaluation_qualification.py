"""Current, no-provider qualification of the WHOLE selected matrix.

Receipts are evidence, not bearer authorizations. Admission always repeats these
checks using the trusted installed controller, never code from a submitted bundle.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import comparison_tasks as tasks
import secure_evaluation as secure

HERE=Path(__file__).resolve().parent

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def inspect_matrix(plan,probe):
    result=dict(schemaVersion=1,kind='current-no-provider-matrix-qualification',providerCalls=0,mode=plan.get('mode'),image=plan['image'],arms=[],tasks=[],cells=plan.get('cells',[]),blockers=list(plan.get('blockers',[])))
    try:
        image=probe.image(plan['image']);result['runtimeImage']=image
    except (ValueError,OSError,TypeError,KeyError,AttributeError,RecursionError,ImportError,subprocess.SubprocessError) as error:
        result['runtimeImage']={'qualified':False,'reason':str(error)}
        result['blockers'].append('runtime image unavailable: '+str(error))
    # Do not short-circuit: a second adapter or a different native lock key must
    # fail BEFORE any first-arm provider request can be admitted.
    for arm in plan['arms']:
        try:entry=probe.arm(arm,plan.get('builds',{}).get(arm['id']))
        except (ValueError,OSError,TypeError,KeyError,AttributeError,RecursionError,ImportError,subprocess.SubprocessError) as error:entry={'qualified':False,'reason':str(error)}
        result['arms'].append(dict(arm=arm['id'],adapter=arm['adapter'],fingerprint=arm.get('fingerprint'),version=arm.get('version'),dependencyLockKey=plan.get('builds',{}).get(arm['id'],{}).get('files',{}).get('package-lock.json'),**entry))
    for task in plan['tasks']:
        try:entry=probe.acceptance(task)
        except (ValueError,OSError,TypeError,KeyError,AttributeError,RecursionError,ImportError,subprocess.SubprocessError) as error:entry={'qualified':False,'reason':str(error)}
        result['tasks'].append(dict(task=task['id'],**entry))
    prerequisites=[result['runtimeImage'],*result['arms'],*result['tasks']]
    if all(x.get('qualified') is True for x in prerequisites):
        try:result['lifecycle']=probe.lifecycle()
        except (ValueError,OSError,TypeError,KeyError,AttributeError,RecursionError,ImportError,subprocess.SubprocessError,TimeoutError) as error:result['lifecycle']={'qualified':False,'reason':str(error)}
    else: result['lifecycle']={'qualified':False,'reason':'Current image/adapter/task prerequisites failed; no routed qualification gateway acquired'}
    result['qualified']=not result['blockers'] and all(x.get('qualified') is True for x in [result['runtimeImage'],*result['arms'],*result['tasks'],result['lifecycle']])
    arms={a['arm']:a for a in result['arms']};task_results={t['task']:t for t in result['tasks']}
    result['cellVerdicts']=[]
    for cell in result['cells']:
        checks=[result['runtimeImage'],arms[cell['arm']],task_results[cell['taskId']],result['lifecycle']]
        result['cellVerdicts'].append(dict(arm=cell['arm'],task=cell['taskId'],repetition=cell.get('repetition'),qualified=not result['blockers'] and all(c.get('qualified') is True for c in checks),reasons=[c.get('reason','required check failed') for c in checks if c.get('qualified') is not True]+result['blockers']))
    result['evidenceSha256']=digest(result)
    return result

class LocalProbe:
    def __init__(self,root,docker=('docker',)):
        self.root=Path(root);self.docker=list(docker);self.image_id=None;self.runtime={};self.acceptance_results={}
    def command(self,args,timeout=45):
        return subprocess.run(self.docker+args,env={'PATH':os.environ.get('PATH',''),'HOME':'/tmp'},capture_output=True,text=True,timeout=timeout)
    def image(self,pin):
        secure.need(re.fullmatch(r'[A-Za-z0-9._/:@-]+@sha256:[a-f0-9]{64}',pin),'immutable image required')
        r=self.command(['image','inspect',pin])
        # Locally built images may have no registry RepoDigest. An explicitly
        # selected content-ID pin may resolve only to that exact ID, never a tag.
        if r.returncode:r=self.command(['image','inspect',pin.rsplit('@',1)[1]])
        secure.need(r.returncode==0,'prepared image absent locally; pull prohibited: '+r.stderr[:300])
        records=json.loads(r.stdout);secure.need(len(records)==1,'ambiguous image');record=records[0]
        secure.need(pin in record.get('RepoDigests',[]) or record['Id']==pin.rsplit('@',1)[1],'image pin identity mismatch')
        self.image_id=record['Id'];self.runtime={'Id':record['Id'],'RepoDigests':record.get('RepoDigests',[]),'qualified':True,'identityKind':'registry-digest' if pin in record.get('RepoDigests',[]) else 'explicit-local-content-id'}
        return self.runtime
    def isolated(self,script,mounts=()):
        secure.need(self.image_id,'runtime image not resolved')
        name='yc-qualify-'+secrets.token_hex(12)
        args=['create','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=64','--memory=512m','--cpus=1','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','--entrypoint','/bin/sh']
        for source,target in mounts:args+=['--mount','type=bind,src='+str(source)+',dst='+target+',readonly']
        args += [self.image_id,'-c','exec env -i HOME=/tmp PATH=/usr/local/bin:/usr/bin:/bin:/opt/venv/bin:/root/.local/bin '+script]
        created=False
        try:
            p=self.command(args);secure.need(p.returncode==0,'qualification container create failed');created=True
            # The selected runtime/build is not allowed to flood host memory or
            # disk during qualification. Bound Docker client's output file at the
            # OS level, not after capture_output has already buffered it all.
            import resource
            def output_limit():resource.setrlimit(resource.RLIMIT_FSIZE,(secure.MAX_OUTPUT,secure.MAX_OUTPUT))
            with tempfile.TemporaryFile() as output:
                p=subprocess.run(self.docker+['start','-a',name],env={'PATH':os.environ.get('PATH',''),'HOME':'/tmp'},stdout=output,stderr=output,timeout=45,preexec_fn=output_limit)
                output.seek(0);text=output.read(secure.MAX_OUTPUT).decode(errors='replace')
                secure.need(p.returncode==0 and len(text.encode())<secure.MAX_OUTPUT,'runtime probe failed: '+text[:500]);return text.strip()
        finally:
            if created:secure.need(self.command(['rm','-f',name]).returncode==0,'qualification cleanup failed')
    def arm(self,arm,build):
        secure.need(self.image_id,'runtime image unavailable')
        if arm['adapter']=='youcoded':
            secure.need(build is not None,'native frozen build missing')
            path=self.root/'builds'/arm['id'];lock=hashlib.sha256((path/'package-lock.json').read_bytes()).hexdigest()
            # Check actual lock-keyed tree, package versions and module resolution
            # for EVERY installed dependency entry, not merely directory existence.
            script=r'''node -e 'const fs=require("fs"),path=require("path"),m=require("module");const [a,b]=process.versions.node.split(".").map(Number);if(!(a>=24||a===22&&b>=18)||typeof m.stripTypeScriptTypes!=="function")throw Error("Node TS runtime missing");const lock=JSON.parse(fs.readFileSync("/build/package-lock.json"));const dir="/opt/youcoded-deps/LOCK/node_modules";if(!fs.statSync(dir).isDirectory())throw Error("lock-key dependency directory missing");let count=0;for(const [name,entry] of Object.entries(lock.packages||{})){if(!name.startsWith("node_modules/")||entry.link||entry.optional)continue;const file=path.join(dir,name.slice(13),"package.json");const p=JSON.parse(fs.readFileSync(file));if(p.version!==entry.version)throw Error("dependency version mismatch: "+name);count++;}if(!count)throw Error("empty dependency lock");process.env.NODE_PATH=dir;m._initPaths();const runtime=require("/build/dist/main/create-runtime.js");if(typeof runtime.createRuntime!=="function")throw Error("native runtime export missing");console.log(JSON.stringify({node:process.version,lock:"LOCK",dependencies:count,runtimeExport:"createRuntime"}));' '''.replace('LOCK',lock)
            # Frozen preparations are private (0600). Normalize permissions only
            # on a disposable copy, never on the real build/shared checkout.
            with tempfile.TemporaryDirectory(prefix='yc-native-probe-') as tmp:
                private=Path(tmp);private.chmod(0o755);copy=private/'build';secure.safe_copy(path,copy)
                observation=json.loads(self.isolated(script,[(copy,'/build')]))
            secure.need(isinstance(observation,dict) and observation.get('lock')==lock and type(observation.get('dependencies')) is int and observation['dependencies']>0 and observation.get('runtimeExport')=='createRuntime','native dependency/runtime observation incomplete')
            return dict(qualified=True,lockKey=lock,observation=observation,image=self.image_id)
        executable={'claude-code':'claude','pi':'pi','hermes':'hermes','opencode':'opencode'}[arm['adapter']]
        output=self.isolated(executable+' --version')
        expected=arm['version'].lstrip('v')
        if arm['adapter']=='hermes':
            # WHY: Hermes also prints Python/SDK versions; only its anchored product header identifies the adapter.
            lines=output.splitlines()
            headers=[line for line in lines if line.startswith('Hermes Agent ')]
            match=re.match(r'^Hermes Agent v?(\d+\.\d+\.\d+)(?=\s|$)',headers[0]) if len(headers)==1 and lines and headers[0]==lines[0] else None
            found=[match.group(1)] if match else []
        else:found=re.findall(r'(?<![\d.])v?(\d+\.\d+\.\d+)(?![\d.])',output)
        secure.need(found==[expected],'exact adapter version mismatch: '+output[:300])
        return dict(qualified=True,observation=output,image=self.image_id)
    def acceptance(self,task):
        # WHY: v2 deliberately replaces unobservable in-memory assertions with
        # read-only namespaces and controller-inspected persisted output. The
        # obsolete v1 observation guard is NOT the v2 trust boundary.
        from external_verification import VERSION,CONTRACT,verify
        from bwrap_executor import BwrapExecutor
        if task.get('legacy'):
            from legacy_verification import contract_for, qualify_task
            secure.need(task.get('legacyVerification')==contract_for(task['id']),'Legacy protocol binding changed')
            result=qualify_task(task['id'])
            self.acceptance_results[task['id']]=result
            return result
        secure.need(task.get('contractVersion',VERSION)==VERSION,'external-v2 contract required')
        source=self.root/'repo-snapshot';tasks.validate_snapshot(source)
        with tempfile.TemporaryDirectory(prefix='yc-qualification-task-') as tmp:
            root=Path(tmp)/'candidate';tasks.reset(source,root,task['id'],contract_version=VERSION);baseline=tasks.hashes(root);tasks.reference(root,task['id'])
            executor=BwrapExecutor()
            reference=verify(root,task['id'],baseline,source,executor)
            negatives=[]
            for label in ('forbidden','regression-tests'):
                mutant=Path(tmp)/label;secure.safe_copy(root,mutant);tasks.mutate(mutant,task['id'],label)
                verdict=verify(mutant,task['id'],baseline,source,executor)
                negatives.append(dict(control=label,verdict=verdict))
            result=dict(qualified=reference['passed'] and all(not n['verdict']['passed'] for n in negatives),reference=reference,negativeControls=negatives,invocations=len(executor.evidence),backend='bwrap',contractVersion=VERSION,contractSha256=digest(CONTRACT),scope='current external-v2 functional acceptance; not model performance')
            self.acceptance_results[task['id']]=result
            return result
    def lifecycle(self):
        # Inspect frozen exports and requested runtime plugins independently.
        # Harbor's 'shared' mode shares the environment HANDLE, not necessarily
        # the verifier process: our plugin executes only in the host controller.
        # Offline implementation never qualifies a real backend or paid matrix.
        import tomllib
        configurations=[]
        for file in sorted((self.root/'tasks').glob('*/task.toml')):
            config=tomllib.loads(file.read_text());v=config.get('verifier',{})
            configurations.append(dict(task=file.parent.name,contract=config.get('metadata',{}).get('contract'),environmentMode=v.get('environment_mode','separate' if v.get('environment') else 'shared')))
        dependencies={}
        if self.image_id:
            output=self.isolated("/bin/sh -c 'command -v docker >/dev/null 2>&1; d=$?; python3 -c \"import cryptography\" >/dev/null 2>&1; c=$?; printf \"dockerCli=%s cryptoModule=%s\\n\" \"$d\" \"$c\"'")
            dependencies={'actualImageProbe':output}
        from lab_harbor_export import lifecycle_status
        return dict(**lifecycle_status(),frozenVerifierConfigurations=configurations,controllerImageDependencies=dependencies)

def qualify(manifest_path,docker=('docker',),out=None,engine_socket=None):
    import evaluation_workflow as workflow
    path=Path(manifest_path).resolve();m=workflow.check(path);p=json.loads((path.parent/'plan.json').read_text())
    from lab_engine_registry import ensure_clean
    ensure_clean(path.parent)  # Known orphan IDs block reuse, without daemon access.
    manifest_hash=hashlib.sha256(path.read_bytes()).hexdigest();controller_hashes=workflow.tree(HERE,True)
    if engine_socket is not None:
        from lab_engine_qualification import EngineProbe
        probe=EngineProbe(path.parent,engine_socket)
    else:
        # No ambient daemon discovery/CLI fallback for new mode qualification.
        class NoEngineProbe(LocalProbe):
            def image(self,pin): raise ValueError('Explicit trusted Engine Unix socket required for current runtime qualification')
        probe=NoEngineProbe(path.parent,docker)
    result=inspect_matrix(p,probe)
    secure.need(hashlib.sha256(path.read_bytes()).hexdigest()==manifest_hash and workflow.tree(HERE,True)==controller_hashes,'qualification source/manifest changed during preflight')
    secure.need(workflow.check(path)==m,'prepared snapshot changed during preflight')
    result['preparedManifestSha256']=manifest_hash
    result['snapshotHashesSha256']=digest(m['snapshotHashes'])
    result['controllerSourceSha256']=digest(controller_hashes)
    result['receiptSha256']=digest(result)
    if out:
        workflow.write_new(out,result)
    return result

def admit_execution(manifest):
    # WHY: scope/budget approval belongs to the trusted host operator. v2's
    # read-only bwrap/output boundary replaces v1's impossible in-memory proof.
    # Neither a caller boolean nor a schema downgrade is execution authority.
    from lab_authority import current
    return current(manifest)


def admit(manifest_path):
    return admit_execution(json.loads(Path(manifest_path).read_bytes()))


def execution_authority(manifest_path,approval):
    from lab_authority import execution_authority as establish
    return establish(manifest_path,approval)
