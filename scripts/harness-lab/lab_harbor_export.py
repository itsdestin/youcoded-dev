"""New external-v2 exports; deliberately separate from frozen v1 export_suite."""
import json
from pathlib import Path
import shutil
import comparison_tasks as tasks
from external_verification import VERSION, CONTRACT
from bounded_inputs import need

VERIFIER_PLUGIN = 'lab_harbor_verifier:HostAcceptanceVerifier'
ENVIRONMENT_PLUGIN = 'lab_harbor_transport:BoundedEnvironment'


def plugin_config():
    return {'verifier': {'import_path': VERIFIER_PLUGIN},
            'environment': {'import_path': ENVIRONMENT_PLUGIN}}


def lifecycle_status():
    return dict(implementedOfflineContract=True, runtimeQualified=False, qualified=False,
                reason='Static implementation inventory only: run current Engine/Harbor/bwrap and adapter qualification for the selected scope; no real daemon has been qualified here',
                plugins=plugin_config(),
                unsupportedTransport=['individual non-diagnostic host downloads','filtered/excluded host logs','sidecar services','compose overlays'],
                remaining=['current real-daemon reviewed Engine 27.5.1 or 29.8.2 (MinAPIVersion <= wire API 1.47 <= ApiVersion)/linux-amd64 ownership/seal/archive probes',
                           'actual daemon TAR compatibility (PAX/GNU extensions intentionally refused)',
                           'real-backend log/artifact publication adversarial qualification',
                           'all-adapter actual Harbor/private budget-gateway lifecycle qualification',
                           'all selected adapters, images and dependency locks',
                           'current external-v2 reference/negative controls and approved private launch authority',
                           'current legacy-trusted-v1 reference/negative controls and all selected runtime lifecycles'])


def export_suite(source, dest, image, limits):
    dest = Path(dest); need(not dest.exists(), 'Fresh external-v2 export required'); dest.mkdir()
    for task in tasks.CONTRACT['tasks']:
        base = dest/task['id']; base.mkdir(); (base/'environment').mkdir(); (base/'tests').mkdir()
        tasks.reset(source, base/'environment/fixtures', task['id'], contract_version=VERSION)
        (base/'instruction.md').write_text('Work in /app. Read TASK.md. No live app or network access.\n'+task['goal']+'\nACTIVE CONTRACT: '+VERSION+'\n'+CONTRACT['replacements'][task['id']]+'\n'+CONTRACT['regressionTests']+'\n')
        (base/'environment/Dockerfile').write_text('FROM '+image+'\nWORKDIR /app\nCOPY fixtures/ /app/\n')
        # Harbor calls this "shared", but only the environment HANDLE is shared:
        # BaseVerifier executes on the host, never in the sealed agent container.
        (base/'task.toml').write_text('version = "1.0"\n[metadata]\nsplit = "development"\ncontract = "'+VERSION+'"\n[agent]\ntimeout_sec = '+str(limits['timeoutSec'])+'\n[verifier]\nenvironment_mode = "shared"\ntimeout_sec = '+str(limits['verifierTimeoutSec'])+'\n[environment]\nnetwork_mode = "no-network"\ncpus = 2\nmemory_mb = 4096\nstorage_mb = 4096\n')
        shutil.copytree(source, base/'tests/origin')
        (base/'tests/baseline-manifest.json').write_text(json.dumps(tasks.hashes(base/'environment/fixtures'), sort_keys=True))
        (base/'tests/host-contract.json').write_text(json.dumps({'version': VERSION, 'task': task['id']}))
        # Fail closed if someone omits the runtime plugin configuration. This is
        # NOT an in-container verifier or reward-producing shell replacement.
        (base/'tests/test.sh').write_text('#!/bin/sh\necho "Host verifier plugin required; no in-container acceptance" >&2\nexit 1\n')
        (base/'tests/test.sh').chmod(0o755)
