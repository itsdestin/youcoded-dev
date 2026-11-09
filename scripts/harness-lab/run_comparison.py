#!/usr/bin/env python3
"""Prepare or execute the declared matched-model pilot. No provider key is read here."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

HERE = Path(__file__).resolve().parent
AGENTS = {'youcoded':'GateYouCoded', 'claude-code':'GateClaudeCode', 'pi':'GatePi', 'hermes':'GateHermes', 'opencode':'GateOpenCode'}


def schedule(protocol):
    rows = []
    block = 0
    for repetition in range(protocol['repetitions']):
        for task in protocol['tasks']:
            agents = protocol['agents']
            offset = block % len(agents)
            for agent in agents[offset:] + agents[:offset]:
                rows.append({'id':f'{agent}-{task}-r{repetition}', 'agent':agent, 'task':task, 'repetition':repetition})
            block += 1
    return rows


def command_for(row, root, desktop, harbor, gate_url, protocol_id):
    root = Path(root)
    command = [harbor, 'run', '-p', str(root/'tasks'/row['task']), '-a', 'comparison_agents:'+AGENTS[row['agent']],
               '-m', ('claude-haiku-5-5' if row['agent'] in ('youcoded', 'claude-code') else 'anthropic/claude-haiku-5-5'),
               '--ak', 'gate_url='+gate_url, '--ak', 'gate_token_file='+row['token_file'],
               '-n','1','--max-retries','0','--job-name',row['id'],'-o',str(root/'jobs'),
               '--extra-docker-compose',str(HERE/'gate-network.yaml')]
    if row['agent'] == 'youcoded':
        command += ['--ak','desktop_dir='+desktop, '--ak','task_id='+row['task'],
                    '--ak','repetition='+str(row['repetition']), '--ak','comparison_key='+protocol_id]
    return command


def prepare(root, private_dir, protocol):
    if root.exists() or private_dir.exists():
        raise ValueError('Choose fresh root and private token directory; never overwrite evidence')
    root.mkdir(parents=True, mode=0o700)
    private_dir.mkdir(parents=True, mode=0o700)
    subprocess.run(['node', str(HERE/'suite.mjs'), str(root/'tasks')], check=True)
    for task in protocol['tasks']:
        directory = root/'tasks'/task
        (directory/'environment/Dockerfile').write_text(f"FROM {protocol['image']}\nWORKDIR /app\nCOPY fixtures/ /app/\n")
        config = (directory/'task.toml').read_text().replace('timeout_sec = 300','timeout_sec = 180')
        (directory/'task.toml').write_text(config)
    rows = schedule(protocol)
    tokens = {}
    for row in rows:
        token = 'yc-gate-' + secrets.token_hex(32)
        token_file = private_dir/(row['id']+'.token')
        token_file.write_text(token); token_file.chmod(0o600)
        row['token_file'] = str(token_file)
        tokens[token] = row['id']
    (root/'protocol.json').write_text(json.dumps(protocol, indent=2)+'\n')
    (root/'trials.json').write_text(json.dumps(rows, indent=2)+'\n')
    mapping = private_dir/'tokens.json'
    mapping.write_text(json.dumps(tokens)); mapping.chmod(0o600)
    print(f'Prepared {len(rows)} trials. Private gate-token mapping: {mapping}')


def execute(args):
    root = args.root.resolve()
    protocol = json.loads((root/'protocol.json').read_text())
    rows = json.loads((root/'trials.json').read_text())
    for row in rows:
        if args.only and row['id'] not in args.only:
            continue
        job = root/'jobs'/row['id']
        results = list(job.glob('*/result.json')) if job.exists() else []
        if results:
            previous = json.loads(results[0].read_text())
            if previous.get('exception_info'):
                if not args.retry_infra:
                    raise RuntimeError(f"Unresolved infrastructure failure: {row['id']}; inspect before --retry-infra")
                archive = root/'infrastructure-attempts'
                archive.mkdir(exist_ok=True)
                job.rename(archive/(row['id']+'-'+str(time.time_ns())))
            else:
                print('Already recorded: '+row['id'], flush=True)
                continue
        elif job.exists():
            raise RuntimeError(f'Incomplete job directory requires inspection: {job}')
        env = {k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG','LC_ALL','DOCKER_HOST','DOCKER_CONTEXT')}
        env['PYTHONPATH'] = str(HERE)
        # These are revocable gate tokens, NOT the Anthropic account credential.
        if row['agent'] != 'youcoded':
            env['ANTHROPIC_API_KEY'] = Path(row['token_file']).read_text().strip()
            env['ANTHROPIC_BASE_URL'] = args.gate_url
        command = command_for(row, str(root), str(args.desktop.resolve()), args.harbor, args.gate_url, protocol['id'])
        print('Running: '+row['id'], flush=True)
        with (root/(row['id']+'.log')).open('a') as log:
            result = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=600)
        results = list(job.glob('*/result.json'))
        if result.returncode or len(results) != 1:
            raise RuntimeError(f"Runner failure for {row['id']}; inspect preserved log")
        trial = json.loads(results[0].read_text())
        if trial.get('exception_info'):
            raise RuntimeError(f"{row['id']}: {trial['exception_info']['exception_message']}")
        print('Outcome: '+str((trial.get('verifier_result') or {}).get('rewards')), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare','run'])
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--private-dir', type=Path)
    parser.add_argument('--desktop', type=Path)
    parser.add_argument('--harbor', default='harbor')
    parser.add_argument('--gate-url')
    parser.add_argument('--only', nargs='+')
    parser.add_argument('--retry-infra', action='store_true')
    args = parser.parse_args()
    if args.action == 'prepare':
        if not args.private_dir: parser.error('--private-dir is required')
        prepare(args.root.resolve(), args.private_dir.resolve(), json.loads((HERE/'comparison_protocol.json').read_text()))
    else:
        if not args.desktop or not args.gate_url: parser.error('--desktop and --gate-url are required')
        execute(args)

if __name__ == '__main__':
    main()
