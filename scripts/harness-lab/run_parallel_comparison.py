#!/usr/bin/env python3
"""Future runs only: bounded independent serial-runner processes, never threads.

Usage: python3 -B run_parallel_comparison.py --manifest /absolute/future.json
       --dry-run [--output /absolute/new-preview.json] | --execute

The serial v1 manifest is unchanged except for a required top-level `parallel`:
  {"workers": 2, "timingMode": "contention-affected",
   "timingCohort": "future-batch-two-workers", "reserveMemoryBytes": 2147483648}
workers is explicitly fixed at 1..8 (recommend 2, not automatic qualification).
Every prepared task.toml must declare positive environment.cpus, memory_mb and
storage_mb. Those actual caps, affinity/cgroup CPU, MemAvailable/cgroup headroom,
and free storage constrain admission; nothing silently tunes the chosen count.
config.eventsPath is the NEW parent journal; `<eventsPath>.trials/oc-*.json`
and `.jsonl` are stable immutable single-row manifests and child journals.
The frozen sourceDir must include the exact reviewed run_objective_comparison.py.
All children retain the original ledgerPath, jobsDir, trialKey, tokens and hashes.
Only the existing shared gateway reserves/spends; no worker ledger is created.
A contention cohort is NOT comparable to uncontended serial latency.

Dry-run is offline and write-free unless --output is explicit. Execution still
requires executionAuthorized and separate spending approval. No retries or repair:
changed fingerprints, ambiguous evidence, interrupted/infra outcomes and stopped
batches require inspection. SIGINT/SIGTERM stop admissions and reach every owned
runner; the parent waits for their existing bounded process/container cleanup.
SIGKILL/power loss cannot be cleaned by a signal handler: durable admission makes
that attempt non-replayable. Never point this at an active serial batch's files.
"""
import sys

# WHY: an offline dry-run must not create a cache beside the reviewed serial
# helper even when the caller forgets -B. Set this before any helper imports.
sys.dont_write_bytecode = True

import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
import tomllib

import run_objective_comparison as serial

Refusal = serial.Refusal
require = serial.require
MIB = 1024**2


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def cgroup_limits():
    """Read v2 limits at our cgroup and all ancestors (including containers)."""
    root = Path('/sys/fs/cgroup')
    membership = Path('/proc/self/cgroup')
    if not membership.exists():
        return []
    for line in membership.read_text().splitlines():
        if line.startswith('0::'):
            # A cgroup namespace may expose only the mount root. Check that root
            # as well; never follow ../ outside the kernel's cgroup mount.
            relative = Path(line[3:].lstrip('/'))
            current = root/relative if '..' not in relative.parts else root
            if not current.exists():
                current = root
            return [current, *[p for p in current.parents if p == root or root in p.parents]]
    return []


def host_capacity():
    cpus = float(len(os.sched_getaffinity(0)))
    fields = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    memory = int(fields['MemAvailable'].split()[0]) * 1024
    for group in cgroup_limits():
        cpu = group/'cpu.max'
        if cpu.exists():
            quota, period = cpu.read_text().split()
            if quota != 'max':
                cpus = min(cpus, int(quota)/int(period))
        limit, current = group/'memory.max', group/'memory.current'
        if limit.exists() and current.exists() and limit.read_text().strip() != 'max':
            memory = min(memory, max(0, int(limit.read_text())-int(current.read_text())))
    return dict(cpus=cpus, memoryBytes=memory)


def task_resources(row):
    env = tomllib.loads((Path(row['taskPath'])/'task.toml').read_text())['environment']
    values = [env[k] for k in ('cpus', 'memory_mb', 'storage_mb')]
    require(all(isinstance(v, (int, float)) and not isinstance(v, bool) and
                math.isfinite(v) and v > 0 for v in values), 'Positive prepared task resource caps required')
    return dict(cpus=values[0], memoryBytes=math.ceil(values[1]*MIB), diskBytes=math.ceil(values[2]*MIB))


class CapacityWait(Refusal):
    """No trial admitted: drain owned work before remeasuring available capacity."""


def resource_check(manifest, rows=None):
    p, c = manifest['parallel'], manifest['config']
    resources = [task_resources(r) for r in (manifest['trials'] if rows is None else rows)]
    n = p['workers']
    # WHY: heterogeneous task caps require the worst possible admitted set, not
    # an average or a hardcoded claim that eight containers fit this machine.
    totals = {key: sum(sorted((r[key] for r in resources), reverse=True)[:n])
              for key in ('cpus', 'memoryBytes', 'diskBytes')}
    def available(condition, message):
        if not condition:
            if rows is not None and len(rows) > 1:
                raise CapacityWait(message)
            raise Refusal(message)
    capacity = host_capacity()
    available(totals['cpus'] <= capacity['cpus'], 'Insufficient available CPU capacity')
    available(totals['memoryBytes'] + p['reserveMemoryBytes'] <= capacity['memoryBytes'],
              'Insufficient available memory capacity')
    serial.storage_check(c)
    minimum = c.get('minFreeBytes', 5*1024**3) + totals['diskBytes']
    for directory in (Path(c['jobsDir']), Path(c['eventsPath']).parent, Path('/var/lib/docker')):
        while not directory.exists():
            directory = directory.parent
        available(shutil.disk_usage(directory).free >= minimum, 'Insufficient free storage for task caps')
    return totals


def child_paths(manifest, row):
    directory = Path(manifest['config']['eventsPath']+'.trials')
    stem = serial.job_id(row)
    return directory/(stem+'.json'), directory/(stem+'.jsonl')


def child_manifest(manifest, row):
    child = copy.deepcopy(manifest)
    child.pop('parallel')
    child['trials'] = [copy.deepcopy(row)]
    child['config']['eventsPath'] = str(child_paths(manifest, row)[1])
    return child


def child_command(manifest_path):
    child = json.loads(manifest_path.read_text())
    return [sys.executable, '-B', str(Path(child['config']['sourceDir'])/'run_objective_comparison.py'),
            '--manifest', str(manifest_path), '--execute']


def validate(manifest):
    tokens = serial.validate(manifest)
    p, c = manifest['parallel'], manifest['config']
    n = p['workers']
    require(isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= 8, 'Explicit workers must be 1 through 8')
    require(p.get('timingMode') == 'contention-affected' and
            isinstance(p.get('timingCohort'), str) and bool(p['timingCohort'].strip()),
            'Explicit contention-affected timing cohort required')
    reserve = p['reserveMemoryBytes']
    require(isinstance(reserve, int) and not isinstance(reserve, bool) and reserve >= 0,
            'Explicit nonnegative reserveMemoryBytes required')
    reviewed = Path(serial.__file__).read_bytes()
    require((Path(c['sourceDir'])/'run_objective_comparison.py').read_bytes() == reviewed,
            'Frozen serial runner must match reviewed runner')
    # WHY: new coordinator evidence must never overwrite gateway or frozen inputs.
    protected = {serial.absolute(name) for name in manifest['snapshotHashes']}
    protected |= {Path(r['tokenFile']) for r in manifest['trials']} | {Path(c['ledgerPath'])}
    destinations = [Path(c['eventsPath']), Path(c['eventsPath']+'.trials'), Path(c['jobsDir'])]
    roots = [Path(c['sourceDir'])] + [Path(r['taskPath']) for r in manifest['trials']]
    if c.get('desktopDir'):
        roots.append(serial.absolute(c['desktopDir']))
    for destination in destinations:
        serial.absolute(str(destination))
        require(destination not in protected and not any(
            destination == root or root in destination.parents for root in roots), 'Evidence overlaps protected inputs')
    require(Path(c['eventsPath']).parent.is_dir(), 'Parent journal directory must already exist')
    resource_check(manifest)
    return tokens


def read_events(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def child_result(manifest, row, returncode):
    path, journal = child_paths(manifest, row)
    child = child_manifest(manifest, row)
    result = dict(returncode=returncode, infrastructureError=True, interrupted=False,
                  cleanupConfirmed=False, childJournalSha256=None)
    try:
        require(json.loads(path.read_text()) == child, 'Child manifest changed')
        events = read_events(journal)
        result['childJournalSha256'] = hashlib.sha256(journal.read_bytes()).hexdigest()
        require(len(events) == 2 and all(e.get('manifestSha256') == fingerprint(child) for e in events),
                'Ambiguous child evidence')
        require(events[0].get('event') == 'started' and events[1].get('event') == 'outcome' and
                all(e.get('trialKey') == row['trialKey'] for e in events), 'Invalid child event identity')
        outcome = events[1]
        require(isinstance(outcome.get('cleanupErrors'), list) and
                isinstance(outcome.get('infrastructureError'), bool) and
                isinstance(outcome.get('interrupted'), bool), 'Invalid child outcome')
        result['interrupted'] = outcome['interrupted']
        result['cleanupConfirmed'] = not outcome['cleanupErrors']
        result['infrastructureError'] = (returncode != 0 or outcome['infrastructureError'] or
                                          outcome['interrupted'] or bool(outcome['cleanupErrors']) or
                                          outcome.get('returncode') != 0 or bool(outcome.get('runnerError')))
        if not result['infrastructureError']:
            require(serial.completed_prefix(events, [row]) == 1, 'Incomplete child result')
    except (ValueError, OSError, KeyError, TypeError, AttributeError):
        result['infrastructureError'] = True
    return result


def completed_trials(events, manifest):
    """Validate an admission/outcome state machine, never a contiguous prefix."""
    digest = fingerprint(manifest)
    rows = {r['trialKey']: r for r in manifest['trials']}
    admitted, completed = set(), set()
    for index, event in enumerate(events):
        require(event.get('manifestSha256') == digest, 'Manifest changed since first attempt')
        kind = event.get('event')
        if index == 0:
            require(kind == 'batch', 'Missing batch fingerprint')
            continue
        require(kind in ('admitted', 'outcome'), 'Stopped or unknown batch event; inspection required')
        key = event.get('trialKey')
        require(key in rows and event.get('jobId') == serial.job_id(rows[key]), 'Unknown trial event')
        if kind == 'admitted':
            require(key not in admitted, 'Duplicate admission; no retry')
            require(event.get('childManifestSha256') == fingerprint(child_manifest(manifest, rows[key])),
                    'Child fingerprint changed')
            admitted.add(key)
        else:
            require(key in admitted and key not in completed, 'Ambiguous outcome order')
            require(event.get('infrastructureError') is False and event.get('interrupted') is False and
                    event.get('cleanupConfirmed') is True and event.get('returncode') == 0,
                    'Failed or interrupted attempt; no retry')
            actual = child_result(manifest, rows[key], 0)
            require(not actual['infrastructureError'] and actual['cleanupConfirmed'] and
                    event.get('childJournalSha256') == actual['childJournalSha256'], 'Child evidence changed')
            completed.add(key)
    require(admitted == completed, 'Interrupted admission; no replay')
    return completed


def durable_manifest(path, child):
    """Exclusive creation and fsync before admission. Never replace prior evidence."""
    require(not path.exists(), 'Existing unadmitted child evidence; inspection required')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(json.dumps(child, sort_keys=True, allow_nan=False)+'\n')
        stream.flush()
        os.fsync(stream.fileno())
    fsync_directory(path.parent)


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def execute(manifest):
    require(manifest.get('executionAuthorized') is True, 'Manifest does not authorize execution')
    # WHY: downgrading schema/limits must not waive execution authority.
    from evaluation_qualification import admit_execution
    admit_execution(manifest)
    c, rows = manifest['config'], manifest['trials']
    events_path = Path(c['eventsPath'])
    fd = os.open(events_path, os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a+') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refusal('Another coordinator owns the batch journal') from None
        fsync_directory(events_path.parent)
        stream.seek(0)
        prior = [json.loads(line) for line in stream]
        done = completed_trials(prior, manifest)
        pending = [r for r in rows if r['trialKey'] not in done]
        if not pending:
            return 0
        directory = child_paths(manifest, rows[0])[0].parent
        serial.absolute(str(directory))
        directory.mkdir(mode=0o700, exist_ok=True)
        fsync_directory(directory.parent)
        digest = fingerprint(manifest)
        def record(event, row=None):
            if row is not None:
                event.update(trialKey=row['trialKey'], jobId=serial.job_id(row))
            serial.append_event(stream, dict(event, manifestSha256=digest))
        if not prior:
            record(dict(event='batch', workers=manifest['parallel']['workers'],
                        timingMode='contention-affected', timingCohort=manifest['parallel']['timingCohort']))
        active = {}
        cleanup_confirmed = True
        waiting_for_drain = False
        stopping = [False]
        # WHY: a non-raising main-thread handler closes the Popen/registration
        # race. A signal can never bypass registration of a just-created child.
        def interrupt(signum, frame):
            stopping[0] = True
        previous = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
        try:
            for sig in previous:
                signal.signal(sig, interrupt)
            while pending or active:
                # Observe ALL available completions before refilling any slot.
                for proc, row in list(active.items()):
                    rc = proc.poll()
                    if rc is not None:
                        del active[proc]
                        result = child_result(manifest, row, rc)
                        cleanup_confirmed = cleanup_confirmed and result['cleanupConfirmed']
                        fsync_directory(directory)
                        record(dict(event='outcome', **result), row)
                        if result['infrastructureError']:
                            stopping[0] = True
                if stopping[0]:
                    raise Refusal('Batch stopped; inspection required, no retry')
                if not active:
                    waiting_for_drain = False
                if pending and not waiting_for_drain and len(active) < manifest['parallel']['workers']:
                    # Recheck gateway exposure and storage even while other trials
                    # run. The gateway, not this observation, atomically reserves.
                    serial.validate(manifest)
                    try:
                        resource_check(manifest, [*active.values(), pending[0]])
                    except CapacityWait:
                        # WHY: current free bytes already exclude consumed active
                        # allocations. Without trustworthy per-job usage, never add
                        # those bytes back or reserve only the candidate (which can
                        # undercount active allocations not consumed yet). Full-cap
                        # admission is a sufficient safe bound, NOT a permanent
                        # refusal: drain naturally, then remeasure candidate alone.
                        # CPU still includes every active cap. Hard storage floors,
                        # budget/infra/signal failures remain immediate stop paths.
                        # This waits BEFORE manifest creation/durable admission;
                        # no attempted trial is replayed and worker choice stays fixed.
                        waiting_for_drain = True
                        continue
                    if stopping[0]:
                        continue
                    row = pending.pop(0)
                    path, journal = child_paths(manifest, row)
                    require(not journal.exists() and not (Path(c['jobsDir'])/serial.job_id(row)).exists(),
                            'Existing job or journal evidence; no replay')
                    durable_manifest(path, child_manifest(manifest, row))
                    record(dict(event='admitted', childManifestSha256=fingerprint(child_manifest(manifest, row))), row)
                    if stopping[0]:
                        record(dict(event='outcome', returncode=None, infrastructureError=True,
                                    interrupted=True, cleanupConfirmed=True), row)
                        continue
                    # Never capture secrets in parent logs or inherit provider env.
                    try:
                        proc = subprocess.Popen(child_command(path), env=serial.child_env(c),
                                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                                start_new_session=True)
                    except OSError:
                        record(dict(event='outcome', returncode=None, infrastructureError=True,
                                    interrupted=False, cleanupConfirmed=True), row)
                        raise
                    active[proc] = row
                elif active:
                    time.sleep(.02)
            return 0
        except BaseException:
            # WHY: every failure path (including full disk/fsync, validation and
            # signals) stops admissions BEFORE interrupting every owned runner.
            # Do not kill their groups: serial runners own distinct Harbor groups
            # and exact-container cleanup. Wait/reap all even if journaling fails.
            for proc in active:
                if proc.poll() is None:
                    try:
                        proc.send_signal(signal.SIGINT)
                    except ProcessLookupError:
                        pass
            for proc, row in list(active.items()):
                rc = proc.wait()
                result = child_result(manifest, row, rc)
                cleanup_confirmed = cleanup_confirmed and result['cleanupConfirmed']
                result['interrupted'] = True
                result['infrastructureError'] = True
                try:
                    record(dict(event='outcome', **result), row)
                except (OSError, ValueError):
                    pass  # Unmatched durable admission still blocks replay.
            try:
                record(dict(event='stopped', cleanupConfirmed=cleanup_confirmed and
                            all(p.poll() is not None for p in active)))
            except (OSError, ValueError):
                pass
            raise
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--dry-run', action='store_true')
    modes.add_argument('--execute', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    try:
        require(not args.execute or args.output is None, '--output is dry-run only')
        manifest = json.loads(args.manifest.read_text())
        if args.execute:
            from evaluation_qualification import admit_execution
            admit_execution(manifest)  # Before token/ledger/resource admission.
        tokens = validate(manifest)
        if args.execute:
            return execute(manifest)
        children = [dict(trialKey=r['trialKey'], manifestPath=str(child_paths(manifest, r)[0]),
                         journalPath=str(child_paths(manifest, r)[1])) for r in manifest['trials']]
        rendered = serial.redact(json.dumps(dict(workers=manifest['parallel']['workers'],
                    timingMode='contention-affected', timingCohort=manifest['parallel']['timingCohort'],
                    resourceCaps=resource_check(manifest), children=children), indent=2), tokens)+'\n'
        if args.output:
            with args.output.open('x') as out:
                out.write(rendered)
        else:
            print(rendered, end='')
        return 0
    except (ValueError, OSError, KeyError, TypeError, AttributeError, KeyboardInterrupt):
        # Never echo exception text, configuration, child output or credentials.
        print('Parallel launcher refused; inspect manifest, resources, shared budget and durable evidence. No retry.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
