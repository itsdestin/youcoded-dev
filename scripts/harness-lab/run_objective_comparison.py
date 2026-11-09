#!/usr/bin/env python3
"""Offline-first, serial Harbor launcher. No preparation, gateway or credential loading.

Manifest v1: {schemaVersion: 1, executionAuthorized: bool, config: {...},
trials: [{id, trialKey, taskId, model, agent, tokenFile, taskPath, repetition?}],
snapshotHashes: {absolute_file_path: sha256_hex}}.

Config requires absolute sourceDir, desktopDir (if native), harbor, ledgerPath,
jobsDir, eventsPath; gateUrl, comparisonKey, budgetCapUsd and positive stopMarginUsd.
Optional minFreeBytes defaults to 5 GiB. nativeSettings requires maxRequests: 20,
timeoutSec: 180 and a nonempty differences string describing unmatched settings.
sourceDir
is the frozen harness-lab directory (including gate-network.yaml/model-panel.json).
Python caches/bytecode are refused, not ignored or deleted. All source files,
all task files, and native upload inputs
(dist/**, package*.json, test-engine/lab-*.mjs) must be covered by snapshotHashes.
Order is authoritative: supply held-out rows first. No row filters or retry option.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time
from urllib.parse import urlsplit

AGENTS = {'youcoded': 'RouterYouCoded', 'pi': 'RouterPi',
          'opencode': 'RouterOpenCode', 'claude-code': 'RouterClaudeCode',
          'hermes': 'RouterHermes'}


class Refusal(ValueError):
    """Fail closed without echoing untrusted configuration or child output."""


def require(condition, message):
    if not condition:
        raise Refusal(message)


def absolute(value):
    require(isinstance(value, str) and Path(value).is_absolute(), 'Absolute path required')
    p = Path(value)
    require(p.resolve() == p, 'Canonical paths without symlinks required')
    return p


def money(value):
    require(isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and value >= 0, 'Invalid budget amount')
    return value


def files_under(root):
    require(root.is_dir(), 'Snapshot directory missing')
    found = set()
    for p in root.rglob('*'):
        # WHY: dontwritebytecode disables writes, not reads of unreviewed bytecode.
        require('__pycache__' not in p.parts and p.suffix not in ('.pyc', '.pyo'),
                'Python cache or bytecode artifact refused')
        require(not p.is_symlink(), 'Snapshot symlink refused')
        if p.is_file():
            found.add(p)
    return found


def desktop_for(row, config):
    # WHY: validation and launch must select the identical reviewed runtime, including
    # single-row parallel children that retain the complete two-arm map.
    variants = config.get('desktopVariants')
    if 'desktopVariants' in config:
        require(isinstance(variants, dict) and set(variants) == {'baseline', 'candidate'}
                and 'desktopDir' not in config, 'Explicit desktopVariants baseline/candidate required without desktopDir')
        for value in variants.values():
            absolute(value)
    if row['agent'] != 'youcoded':
        require('buildVariant' not in row, 'buildVariant requires native agent')
        return None
    if 'desktopVariants' not in config:
        require('buildVariant' not in row, 'buildVariant requires desktopVariants')
        return absolute(config['desktopDir'])
    require(isinstance(row.get('buildVariant'), str) and row['buildVariant'] in variants,
            'Native row requires known buildVariant')
    return absolute(variants[row['buildVariant']])


def validate(manifest):
    require(manifest.get('schemaVersion') in (1, 2), 'Unsupported manifest schema')
    c = manifest['config']
    for key in ('sourceDir', 'harbor', 'ledgerPath', 'jobsDir', 'eventsPath'):
        absolute(c[key])
    source = Path(c['sourceDir'])
    require(Path(c['harbor']).is_file() and os.access(c['harbor'], os.X_OK), 'Harbor executable missing')
    u = urlsplit(c['gateUrl'])
    require(u.scheme == 'http' and u.hostname is not None and not u.username
            and not u.password and not u.query and not u.fragment and u.path in ('', '/'),
            'Gate URL must be a credential-free HTTP origin')
    require(money(c['budgetCapUsd']) > 0 and money(c['stopMarginUsd']) > 0
            and c['stopMarginUsd'] < c['budgetCapUsd'], 'Explicit budget and stop margin required')
    required = files_under(source)
    require((source/'router_agents.py').is_file() and (source/'gate-network.yaml').is_file(), 'Frozen adapter source missing')
    panel = {r['id'] for r in json.loads((source/'model-panel.json').read_text())['models']}
    require(isinstance(c.get('comparisonKey'), str) and bool(c['comparisonKey']), 'Comparison key required')
    settings = manifest.get('nativeSettings', {})
    limits = c.get('evaluationLimits')
    if manifest['schemaVersion'] == 1:
        require(limits is None and settings.get('maxRequests') == 20 and
                settings.get('timeoutSec') == 180, 'Legacy limits must remain 20 requests/180 seconds')
    else:
        # WHY: new complex tasks have explicit reviewed limits; historical manifests
        # must not silently inherit a larger allowance or another adapter class.
        require(isinstance(limits, dict) and set(limits) == {'maxRequests','timeoutSec','verifierTimeoutSec'} and
                type(limits['maxRequests']) is int and 20 <= limits['maxRequests'] <= 120 and
                type(limits['timeoutSec']) is int and 180 <= limits['timeoutSec'] <= 1200 and
                type(limits['verifierTimeoutSec']) is int and 30 <= limits['verifierTimeoutSec'] <= 120 and
                settings.get('maxRequests') == limits['maxRequests'] and
                settings.get('timeoutSec') == limits['timeoutSec'], 'Explicit v2 mode limits required')
    require(isinstance(settings.get('differences'), str) and bool(settings['differences'].strip()),
            'Declare native settings differences')
    rows = manifest['trials']
    require(isinstance(rows, list) and bool(rows), 'Nonempty ordered trials required')
    ids, keys, jobs, tokens = set(), set(), set(), set()
    for row in rows:
        for key in ('id', 'trialKey', 'taskId', 'model', 'agent'):
            require(isinstance(row[key], str) and bool(row[key]), 'Trial identity missing')
        require(row['agent'] in AGENTS and row['model'] in panel, 'Unsupported agent or model')
        if row['agent'] in ('hermes', 'claude-code'):
            require(row['model'] == 'anthropic/claude-haiku-5.5', 'Client only qualified for Haiku')
        repetition = row.get('repetition', 0)
        require(isinstance(repetition, int) and not isinstance(repetition, bool) and repetition >= 0,
                'Invalid repetition')
        job = job_id(row)
        require(row['id'] not in ids and row['trialKey'] not in keys and job not in jobs,
                'Duplicate trial identity')
        ids.add(row['id']); keys.add(row['trialKey']); jobs.add(job)
        task = absolute(row['taskPath'])
        required |= files_under(task)
        require(all((task/name).is_file() for name in ('task.toml', 'instruction.md', 'environment/Dockerfile', 'tests/test.sh')),
                'Incomplete Harbor task')
        token = absolute(row['tokenFile'])
        require(token.is_file() and stat.S_IMODE(token.stat().st_mode) == 0o600
                and token.stat().st_uid == os.getuid(), 'Token file must be owned by current user with mode 0600')
        value = token.read_text().strip()
        require(bool(re.fullmatch(r'[A-Za-z0-9_-]{24,256}', value)) and value not in tokens,
                'Distinct opaque per-trial tokens required')
        tokens.add(value)
        desktop = desktop_for(row, c)
        if row['agent'] == 'youcoded':
            require((desktop/'dist/main/create-runtime.js').is_file(), 'Built native runtime missing')
            required |= files_under(desktop/'dist')
            # WHY: reject bytecode anywhere in the native snapshot, even outside
            # selected upload inputs; never silently sanitize a reviewed snapshot.
            require(not any('__pycache__' in p.parts or p.suffix in ('.pyc', '.pyo')
                            for p in desktop.rglob('*')), 'Native Python cache or bytecode artifact refused')
            required |= {desktop/'package.json', desktop/'package-lock.json'}
            launchers = {desktop/'test-engine'/('lab-'+name+'.mjs') for name in
                         ('runner', 'worker', 'observer', 'state', 'scenario', 'faults', 'clarifications', 'io')}
            require(all(p.is_file() for p in launchers), 'Native launcher files missing')
            required |= launchers | set((desktop/'test-engine').glob('lab-*.mjs'))
    hashes = manifest['snapshotHashes']
    require(isinstance(hashes, dict) and required <= {Path(p) for p in hashes}, 'Snapshot coverage incomplete')
    for name, digest in hashes.items():
        p = absolute(name)
        require(isinstance(digest, str) and re.fullmatch('[0-9a-f]{64}', digest)
                and p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() == digest,
                'Snapshot hash mismatch')
    # WHY: budget refusal is also useful during offline validation; this never mutates the ledger.
    budget_check(c)
    storage_check(c)
    return tokens


def storage_check(c):
    minimum = c.get('minFreeBytes', 5 * 1024**3)
    require(isinstance(minimum, int) and not isinstance(minimum, bool) and minimum > 0,
            'Positive integer minFreeBytes required')
    # WHY: preserve evidence rather than cleaning Docker caches or filling the disk.
    # Check jobs, journal, and local Docker storage (when present) on their own devices.
    for directory in (Path(c['jobsDir']), Path(c['eventsPath']).parent, Path('/var/lib/docker')):
        while not directory.exists():
            directory = directory.parent
        require(shutil.disk_usage(directory).free >= minimum, 'Insufficient free storage; stopped safely')


def job_id(row):
    return 'oc-' + hashlib.sha256(row['trialKey'].encode()).hexdigest()[:24]


def command_for(row, c):
    native = row['agent'] == 'youcoded'
    desktop = desktop_for(row, c)
    adapter = 'mode_agents:ModeYouCoded' if native and 'evaluationLimits' in c else 'router_agents:'+AGENTS[row['agent']]
    cmd = [c['harbor'], 'run', '-p', row['taskPath'], '-a', adapter,
           '-m', row['model'] if native else 'openrouter/'+row['model'],
           '--ak', 'gate_url='+c['gateUrl'], '--ak', 'gate_token_file='+row['tokenFile'],
           '-n', '1', '--max-retries', '0', '--job-name', job_id(row), '-o', c['jobsDir'],
           '--extra-docker-compose', str(Path(c['sourceDir'])/'gate-network.yaml')]
    host = c.get('hostVerification')
    if host and row['taskId'] in host['taskIds']:
        # WHY: host acceptance requires both plugins; a verifier alone leaves
        # Harbor's eager reward mounts and unsafe pre-verifier downloads intact.
        cmd = cmd[:-2]  # No compose overlay can bypass the bounded environment.
        cmd += ['--env',host['environment']['import_path'],
                '--verifier',host['verifier']['import_path'],
                '--ek','controller_job_id='+job_id(row)]
    if native:
        cmd += ['--ak', 'desktop_dir='+str(desktop), '--ak', 'task_id='+row['taskId'],
                '--ak', 'repetition='+str(row.get('repetition', 0)),
                '--ak', 'comparison_key='+c['comparisonKey']]
    if 'evaluationLimits' in c:
        limits = c['evaluationLimits']
        if native:
            cmd += ['--ak', 'max_requests='+str(limits['maxRequests']),
                    '--ak', 'timeout_sec='+str(limits['timeoutSec'])]
        else:
            cmd += ['--ak', 'max_turns='+str(limits['maxRequests'])]
    return cmd


def child_env(c):
    # WHY: an allowlist prevents inherited provider credentials and Python startup hooks.
    env = {k: v for k, v in os.environ.items() if k in
           ('PATH', 'HOME', 'LANG', 'LC_ALL', 'DOCKER_HOST', 'DOCKER_CONTEXT')}
    env['PYTHONPATH'] = c['sourceDir']
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    # WHY: only the host controller receives the private policy channel. It is
    # never an --ak argument, exec environment, mount, or submitted task setting.
    for channel in ('YC_HARBOR_CONTROLLER_POLICY','YC_HARBOR_EXECUTION_AUTHORITY','YC_HARBOR_ENGINE_SOCKET'):
        if channel in os.environ: env[channel] = os.environ[channel]
    return env


def budget_check(c):
    s = json.loads(Path(c['ledgerPath']).read_text())
    require(s.get('schemaVersion') == 1 and s.get('closed') is False, 'Ledger unavailable or closed')
    cap = min(money(s['limitUsd']), money(c['budgetCapUsd']))
    charged, reserved = money(s['chargedUsd']), money(s['reservedUsd'])
    floor = money(s.get('usageFloorUsd', 0))
    if s.get('accountingMode') == 'estimated' or 'externalPriorUsd' in s or 'providerUsageUsd' in s:
        # WHY: the persisted schema stores the floor as externalPrior + providerUsage,
        # not usageFloorUsd; these are overlapping measurements, never additive charges.
        floor = max(floor, money(s['externalPriorUsd']) + money(s['providerUsageUsd']))
    require(max(charged, floor) + reserved + c['stopMarginUsd'] < cap,
            'Budget exposure is near the approved cap')


def redact(value, secrets):
    text = value.decode('utf-8', 'replace') if isinstance(value, bytes) else str(value or '')
    for secret in secrets:
        text = text.replace(secret, '[REDACTED]')
    return re.sub(r'sk-[A-Za-z0-9_-]+', '[REDACTED]', text)


def append_event(stream, event):
    stream.write(json.dumps({'at': time.time(), **event}, allow_nan=False)+'\n')
    stream.flush()
    os.fsync(stream.fileno())


def completed_prefix(events, rows):
    expected = [r['trialKey'] for r in rows]
    done = 0
    pending = None
    for e in events:
        require(done < len(expected) and e.get('trialKey') == expected[done], 'Event order or manifest changed')
        if e.get('event') == 'started':
            require(pending is None, 'Duplicate start event')
            pending = e
        elif e.get('event') == 'outcome':
            require(pending is not None and e.get('infrastructureError') is False, 'Infrastructure outcome requires inspection; no retry')
            pending = None
            done += 1
        else:
            raise Refusal('Unknown event')
    require(pending is None, 'Interrupted started trial; replay refused')
    return done


def outcome(job):
    paths = list(job.glob('*/result.json'))
    require(len(paths) == 1, 'Missing or ambiguous Harbor result')
    result = json.loads(paths[0].read_text())
    rewards = (result.get('verifier_result') or {}).get('rewards')
    exception = result.get('exception_info')
    valid = isinstance(rewards, dict) and bool(rewards) and all(
        isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in rewards.values())
    return rewards, exception, bool(exception) or not valid


@contextmanager
def stop_signals(ignore=False):
    """Bounded cleanup must survive a second Ctrl-C or supervisor SIGTERM."""
    previous = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
    def interrupt(signum, frame):
        raise KeyboardInterrupt
    try:
        for s in previous:
            signal.signal(s, signal.SIG_IGN if ignore else interrupt)
        yield
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)


def terminate_group(proc):
    errors = []
    # WHY: this PID is a new-session leader created by us, never a name search or
    # inherited/live-app group. Kill remaining descendants even if Harbor exited.
    require(proc.pid > 1 and proc.pid != os.getpgrp(), 'Unsafe process group refused')
    try:
        os.killpg(proc.pid, signal.SIGTERM)
        time.sleep(0.2)
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except OSError:
        errors.append('Trial process group termination failed')
    return errors


@contextmanager
def defer_spawn_signals():
    """Main-thread stop delivery waits until the returned child is registered."""
    previous = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
    pending = []
    def defer(signum, frame):
        pending.append(signum)
    try:
        for sig, handler in previous.items():
            if handler != signal.SIG_IGN:
                signal.signal(sig, defer)
        yield
    finally:
        # WHY: never raise between OS launch and assignment of the Popen owner.
        # Caught handlers reset at exec; no signal mask is blocked/inherited and
        # no preexec_fn is needed. Preserve explicitly ignored dispositions.
        # Nested finally restores BOTH handlers even if a newly restored handler
        # raises while the other is being restored.
        try:
            signal.signal(signal.SIGINT, previous[signal.SIGINT])
        finally:
            signal.signal(signal.SIGTERM, previous[signal.SIGTERM])
    if pending:
        raise KeyboardInterrupt


def run_scoped(command, *, env, timeout=600):
    """Own the process group and drain bounded partial output on every exit."""
    result = {'returncode': None, 'output': b'', 'runnerError': None,
              'interrupted': False, 'processCleanupErrors': []}
    proc = None
    try:
        with defer_spawn_signals():
            proc = subprocess.Popen(command, env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, start_new_session=True)
        result['output'] = proc.communicate(timeout=timeout)[0]
    except subprocess.TimeoutExpired as exc:
        result['output'] = exc.output or b''
        result['runnerError'] = 'Subprocess timeout'
    except KeyboardInterrupt:
        result['interrupted'] = True
        result['runnerError'] = 'Subprocess interrupted'
    except OSError:
        result['runnerError'] = 'Subprocess launch or capture failed'
    finally:
        with stop_signals(ignore=True):
            if proc is not None:
                result['processCleanupErrors'] = terminate_group(proc)
                try:
                    # communicate resumes its existing buffer after a timeout/interrupt.
                    result['output'] = proc.communicate(timeout=5)[0]
                    result['returncode'] = proc.returncode
                except subprocess.TimeoutExpired as exc:
                    result['output'] = exc.output or result['output']
                    result['processCleanupErrors'].append('Trial process output/reaping failed')
                except OSError:
                    result['processCleanupErrors'].append('Trial process output/reaping failed')
    return result


def cleanup_containers(row, c):
    """Stop exact current-trial containers; preserve containers, logs and volumes."""
    errors = []
    host=c.get('hostVerification')
    if host and row['taskId'] in host['taskIds']:
        # Engine trials have no Compose labels. Recover only the durable exact-ID
        # registry selected by this private controller job policy, never discovery.
        try:
            from lab_engine_registry import cleanup_job
            policy=os.environ.get('YC_HARBOR_CONTROLLER_POLICY')
            require(policy,'Missing Engine cleanup policy; inspection required')
            return cleanup_job(row,c,policy)
        except (ValueError,OSError,KeyError,TypeError,TimeoutError) as error:
            return ['Scoped Engine cleanup failed: '+str(error)[:300]]
    try:
        job = absolute(str(Path(c['jobsDir'])/job_id(row)))
        configs = list(job.glob('*/config.json'))
        # Harbor 0.24 writes trial/config.json before starting the environment.
        # No config means it cannot yet have launched a trial container.
        require(len(configs) <= 1, 'Ambiguous trial cleanup identity')
        for path in configs:
            absolute(str(path))
            data = json.loads(path.read_text())
            trial = data['trial_name']
            require(isinstance(trial, str) and trial == path.parent.name and
                    re.fullmatch(r'[A-Za-z0-9_-]+', trial), 'Invalid trial cleanup identity')
            require(absolute(data['task']['path']) == Path(row['taskPath']) and
                    absolute(data['trials_dir']) == job, 'Trial cleanup config mismatch')
            # trial.py passes trial_name+'__env'; DockerEnvironment sanitizes to
            # lowercase [a-z0-9_-] and uses --project-name. Never guess task prefixes.
            project = (trial+'__env').lower()
            environment = str(Path(row['taskPath'])/'environment')
            def docker(*args):
                result = subprocess.run(['docker', *args], env=child_env(c),
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
                require(result.returncode == 0, 'Scoped Docker cleanup command failed')
                return result.stdout
            ids = docker('ps', '-a', '--no-trunc', '--filter',
                         'label=com.docker.compose.project='+project, '--format', '{{.ID}}').decode().split()
            require(all(re.fullmatch('[0-9a-f]{64}', cid) for cid in ids), 'Invalid Docker identity')
            # Inspect every candidate before making any destructive call. Exact
            # working_dir + project labels tie it to this job's recorded task.
            for cid in ids:
                details = json.loads(docker('inspect', cid))
                require(len(details) == 1 and details[0]['Id'] == cid, 'Docker inspection mismatch')
                labels = details[0]['Config']['Labels']
                require(labels.get('com.docker.compose.project') == project and
                        labels.get('com.docker.compose.project.working_dir') == environment,
                        'Unrelated Docker container refused')
            for cid in ids:
                docker('stop', '--time', '5', cid)
                details = json.loads(docker('inspect', cid))
                require(len(details) == 1 and details[0]['Id'] == cid and
                        details[0]['State']['Running'] is False, 'Trial container still running')
    except (ValueError, OSError, KeyError, TypeError, AttributeError, subprocess.TimeoutExpired):
        errors.append('Scoped trial container cleanup failed; manual inspection required')
    return errors


def execute(manifest, tokens):
    require(manifest.get('executionAuthorized') is True, 'Manifest does not authorize execution')
    # WHY: schema/limits supplied by a caller are never execution authority.
    from evaluation_qualification import admit_execution
    admit_execution(manifest)
    c, rows = manifest['config'], manifest['trials']
    fingerprint = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    events = Path(c['eventsPath'])
    require(events.parent.is_dir(), 'Event parent directory must already exist')
    # WHY: lock the append-only journal for the entire serial run, including subprocesses.
    fd = os.open(events, os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a+') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refusal('Another launcher owns the journal') from None
        stream.seek(0)
        prior = [json.loads(line) for line in stream]
        require(all(e.get('manifestSha256') == fingerprint for e in prior), 'Manifest changed since first attempt')
        start = completed_prefix(prior, rows)
        for row in rows[start:]:
            validate(manifest)  # Recheck snapshots, token permissions and ledger before every start.
            job = Path(c['jobsDir'])/job_id(row)
            require(not job.exists(), 'Existing job evidence; replay refused')
            append_event(stream, {'event': 'started', 'trialKey': row['trialKey'], 'jobId': job_id(row),
                                  'manifestSha256': fingerprint})
            from controller_behavior import start as start_behavior, seal as seal_behavior
            behavior_policy = start_behavior(c, row, job_id(row))
            attempt = {'returncode': None, 'output': b'', 'runnerError': None,
                       'interrupted': False, 'processCleanupErrors': []}
            rewards, exception, infra = None, None, True
            with stop_signals():
                try:
                    limits = c.get('evaluationLimits')
                    outer_timeout = limits['timeoutSec'] + limits['verifierTimeoutSec'] + 180 if limits else 600
                    # WHY: this path belongs only to the host Harbor process;
                    # it is neither an agent argument nor an uploaded/mounted file.
                    host_env = child_env(c)
                    host_env['YC_BEHAVIOR_POLICY'] = str(behavior_policy)
                    attempt = run_scoped(command_for(row, c), env=host_env, timeout=outer_timeout)
                    try:
                        rewards, exception, infra = outcome(job)
                    except (ValueError, OSError, TypeError, AttributeError):
                        attempt['runnerError'] = attempt['runnerError'] or 'Invalid or missing Harbor result'
                except KeyboardInterrupt:
                    attempt['interrupted'] = True
                    attempt['runnerError'] = 'Trial interrupted'
                finally:
                    with stop_signals(ignore=True):
                        infra = (infra or attempt['returncode'] != 0 or attempt['runnerError'] is not None
                                 or bool(attempt['processCleanupErrors']) or attempt['interrupted'])
                        cleanup_errors = list(attempt['processCleanupErrors'])
                        if infra:
                            cleanup_errors += cleanup_containers(row, c)
                        event = {'event': 'outcome', 'trialKey': row['trialKey'], 'jobId': job_id(row),
                                 'manifestSha256': fingerprint, 'returncode': attempt['returncode'],
                                 'rewards': rewards, 'exception': exception,
                                 'runnerError': attempt['runnerError'], 'infrastructureError': infra,
                                 'cleanupErrors': cleanup_errors, 'interrupted': attempt['interrupted'],
                                 'output': redact(attempt['output'], tokens)}
                        # Seal before the durable outcome append, including
                        # failure/interrupt paths. Optional capture failure must
                        # not erase the independent outcome or cleanup evidence.
                        try:
                            event['controllerBehavior'] = seal_behavior(behavior_policy, job)
                        except (ValueError, OSError, TypeError, RecursionError, subprocess.SubprocessError) as error:
                            event['controllerBehaviorError'] = str(error)[:500]
                        append_event(stream, json.loads(redact(json.dumps(event), tokens)))
            if attempt['interrupted']:
                raise KeyboardInterrupt
            require(not infra, 'Infrastructure failure recorded; halted without retry')
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest', required=True, type=Path)
    modes = p.add_mutually_exclusive_group(required=True)
    modes.add_argument('--dry-run', action='store_true')
    modes.add_argument('--execute', action='store_true')
    p.add_argument('--output', type=Path, help='Optional dry-run commands file (must not exist)')
    args = p.parse_args(argv)
    try:
        manifest = json.loads(args.manifest.read_text())
        if args.execute:
            from evaluation_qualification import admit_execution
            admit_execution(manifest)  # Before token/ledger access, not schema-dispatched.
        tokens = validate(manifest)
        if args.execute:
            require(args.output is None, '--output is dry-run only')
            return execute(manifest, tokens)
        rendered = json.dumps({'commands': [command_for(r, manifest['config']) for r in manifest['trials']],
                               'environment': {'PYTHONPATH': manifest['config']['sourceDir']}}, indent=2)
        rendered = redact(rendered, tokens)+'\n'
        if args.output:
            with args.output.open('x') as out:
                out.write(rendered)
        else:
            print(rendered, end='')
        return 0
    except Refusal as exc:
        # Refusal messages are constant strings owned by this module, never child output.
        print('Launcher refused: '+str(exc), file=sys.stderr)
        return 2
    except (ValueError, OSError, KeyError, TypeError, AttributeError):
        # WHY: never print exception repr: malformed manifests or child output can contain secrets.
        print('Launcher refused; inspect manifest, snapshots, budget and append-only evidence.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
