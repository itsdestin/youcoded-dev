"""Validate frozen mode identities for analysis, without executing copied planner code."""
import re


def report_scope(manifest, plan):
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    require(manifest.get('schemaVersion') == 2 and isinstance(plan, dict), 'Frozen mode plan required')
    mode = plan.get('mode')
    require(mode in ('basic', 'compare', 'thorough'), 'Unknown evaluation mode')
    require(manifest.get('evaluation', {}).get('mode') == mode, 'Mode matrix identity drift')
    arms = plan.get('arms', [])
    names = [a.get('id') for a in arms]
    require(len(names) == len(set(names)) and all(isinstance(n, str) and n for n in names), 'Unique mode arm identities required')
    adapters = {a['id']: a.get('adapter') for a in arms}
    if mode == 'basic':
        require(set(names) == {'baseline', 'candidate'} and set(adapters.values()) == {'youcoded'}, 'Basic requires two native builds')
    elif mode == 'compare':
        require(len(arms) == 2 and set(adapters.values()) == {'youcoded', 'claude-code'}, 'Compare adapter matrix drift')
    else:
        require(len(arms) == 5 and set(adapters.values()) == {'youcoded', 'claude-code', 'pi', 'hermes', 'opencode'}, 'Thorough adapter matrix drift')
    fingerprints = {a['id']: a.get('fingerprint') for a in arms}
    require(all(isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v) for v in fingerprints.values()), 'Mode arm fingerprints required')
    tasks = plan.get('tasks', [])
    task_ids = [t.get('id') for t in tasks]
    require(len(task_ids) == len(set(task_ids)) and all(isinstance(t, str) and t for t in task_ids), 'Unique task identities required')
    require(1 <= len(tasks) <= 3 if mode == 'basic' else len(tasks) == 3 if mode == 'compare' else len(tasks) >= 3, 'Mode task count mismatch')
    rows = manifest.get('trials', [])
    require(isinstance(rows, list) and 2 <= len(rows) <= 1000, 'Bounded mode matrix required')
    fields = ('taskId', 'model', 'agent', 'arm', 'repetition')
    require([tuple(r.get(k) for k in fields) for r in rows] == [tuple(c.get(k) for k in fields) for c in plan.get('cells', [])], 'Frozen mode matrix drift')
    require(all(r.get('arm') in adapters and r.get('agent') == adapters[r['arm']] and r.get('taskId') in task_ids and r.get('model') == plan.get('model') for r in rows), 'Mode adapter/task/model matrix drift')
    require({r['taskId'] for r in rows} == set(task_ids), 'Missing mode task cells')
    splits = {t['id']: t.get('split') for t in tasks}
    require(all(s in ('development', 'evaluation-only') for s in splits.values()), 'Declared task split required')
    # WHY: older schema-2 trial rows omit split; derive it from frozen definitions,
    # but reject any explicit manifest/cell relabeling of evaluation-only evidence.
    for cell in plan.get('cells', []) + rows:
        require(cell.get('split', splits[cell['taskId']]) == splits[cell['taskId']], 'Frozen task split drift')
    profile = plan.get('profile')
    repetitions = {'smoke': 1, 'confirmation': 3}.get(profile)
    require(repetitions is not None, 'Unknown repetition profile')
    require({(r['taskId'], r['arm'], r['repetition']) for r in rows} == {(t, a, n) for t in task_ids for a in names for n in range(repetitions)}, 'Incomplete mode repetition matrix')
    require(manifest['evaluation'].get('profile') == profile and manifest['evaluation'].get('network') == plan.get('network'), 'Mode profile/network drift')
    return dict(mode=mode, profile=profile, provider=plan.get('provider'), buildFingerprints=fingerprints,
                sameBuild=mode == 'basic' and fingerprints['baseline'] == fingerprints['candidate'],
                armOrder=['baseline','candidate'] if mode == 'basic' else names, adapters=adapters,
                taskSplits=splits, network=plan.get('network'), tasks=tasks)
