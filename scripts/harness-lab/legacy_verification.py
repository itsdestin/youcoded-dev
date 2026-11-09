"""Controller-owned legacy acceptance. No submitted module executes on the host.

The original 15 data checks run verbatim in isolated trusted Python. Four checks
are split into data assertions plus untrusted sibling API/test observations.
Unittest output retains historical criteria; it is NOT proof of honest coverage.
"""
import json
from pathlib import Path
import subprocess
import tempfile
import time

from bounded_inputs import copy as safe_copy, end, need
from python_executor import PythonExecutor

HERE = Path(__file__).resolve().parent
VERSION = 'legacy-trusted-v1'


def _node(expression):
    result = subprocess.run(['node','--input-type=module','-e',
        "import {legacyDefinitions,legacyContract} from './legacy-protocol.mjs';console.log(JSON.stringify("+expression+"));"],
        cwd=HERE, env={'PATH':'/usr/bin'}, capture_output=True, timeout=10)
    need(result.returncode == 0, 'Trusted legacy definitions unavailable')
    need(len(result.stdout) < 2*1024*1024, 'Legacy definitions bound')
    return json.loads(result.stdout)


def definitions():
    return {t['id']: t for t in _node('legacyDefinitions()')}


def contract_for(task_id):
    return _node('legacyContract('+json.dumps(task_id)+')')


def data_check(task):
    check = task['check']; name = task['id']
    # WHY: use the exact original data assertions, not a port of CSV/Decimal,
    # regex, datetime or equivalent-wording semantics. Executable spans alone
    # move out; the task definition/check hash remains the original one.
    if name == 'repair-average': return 'pass'
    if name == 'coherent-interface-patch': return check[check.index("assert json.loads"):]
    if name == 'python-interface-and-tests':
        return check[check.index('assert json.loads'):check.index('def run_user_tests')] + check[check.index("assert (root/'unrelated.txt')"):]
    if name == 'coherent-multi-location-edit':
        return check[check.index('assert json.loads'):check.index('result = subprocess.run')] + check[check.index("assert (root/'unrelated.txt')"):]
    return check


def _call(executor, root, module, function, args=None, kwargs=None, deadline=None, comparison=None):
    request=dict(operation='call', module=module, function=function, args=args or [], kwargs=kwargs or {})
    if comparison is not None:request['compareValue']=comparison
    result = executor.run(root, request=request, deadline=deadline)
    need(result['status'] == 0, 'Submitted Python invocation failed')
    observation = json.loads(result['stdout'])
    need(isinstance(observation, dict) and len(observation) == 1, 'Malformed Python observation')
    return observation


def python_checks(root, task_id, executor, deadline):
    def call(module, function, args=None, kwargs=None):
        return _call(executor, root, module, function, args, kwargs, deadline)
    if task_id == 'repair-average':
        for values, expected in [([2,4,6],4),([-2,2],0),([3],3)]:
            need(_call(executor,root,'average','average',[values],deadline=deadline,comparison=expected) == {'equals':True}, 'Mean observation mismatch')
        need(call('average','average',[[]]) == {'exception':'ValueError'}, 'Empty mean must raise ValueError')
    elif task_id in ('coherent-interface-patch','python-interface-and-tests'):
        module, greeting = ('core','service') if task_id == 'coherent-interface-patch' else ('profile','greeting')
        need(call(greeting,'greeting',kwargs={'name':'Ada'}) == {'value':'Hello Ada'}, 'Greeting observation mismatch')
        need(call(module,'display_name',[{'name':'Lin'}]) == {'value':'Lin'}, 'Name observation mismatch')
        need(call(module,'display_name',[{'label':'old'}]) == {'exception':'KeyError'}, 'Old field accepted')
    elif task_id == 'coherent-multi-location-edit':
        need(call('resolver','resolve_project',[{'key':'north'}]) == {'value':'projects/north'}, 'Resolver observation mismatch')
        need(call('resolver','resolve_project',[{'slug':'north'}]) == {'exception':'KeyError'}, 'Old slug accepted')
    if task_id in ('python-interface-and-tests','coherent-multi-location-edit'):
        result = executor.run(root, request={'operation':'tests','verbosity':2 if task_id == 'python-interface-and-tests' else 1}, deadline=deadline)
        need(result['status'] == 0, 'Submitted tests failed')
        if task_id == 'python-interface-and-tests':
            need(b'Ran 2 test' in result['stderr'], 'Historical two-test criterion missing')
            with tempfile.TemporaryDirectory(prefix='yc-legacy-mutant-') as tmp:
                broken = Path(tmp)/'project'; safe_copy(root, broken, deadline=deadline)
                (broken/'profile.py').write_text('def display_name(profile):\n    return profile.get("name", profile.get("label"))\n')
                negative = executor.run(broken, request={'operation':'tests','verbosity':2}, deadline=deadline)
                need(negative['status'] != 0 and b'Ran 2 test' in negative['stderr'], 'Submitted tests missed permissive-profile mutant')
        # No minimum test count is added to coherent-multi-location-edit.


def verify_legacy(snapshot, task_id, trusted_contract, executor=None, deadline=None):
    deadline = end(deadline)
    result = dict(passed=False, contractVersion=VERSION, task=task_id, runtimeQualified=False,
                  testEvidence='Historical unittest criteria only; stdout does not prove honest coverage')
    try:
        need(trusted_contract == contract_for(task_id), 'Legacy trusted contract binding mismatch')
        task = definitions()[task_id]; executor = executor or PythonExecutor()
        with tempfile.TemporaryDirectory(prefix='yc-legacy-accept-') as tmp:
            root = Path(tmp)/'snapshot'; safe_copy(snapshot, root, deadline=deadline)
            source = "import json\nfrom pathlib import Path\nroot = Path('/work')\n" + data_check(task) + '\n'
            checked = executor.run(root, check=source, deadline=deadline)
            need(checked['status'] == 0, 'Legacy data/protected-state assertions failed')
            if task['executedPython']: python_checks(root, task_id, executor, deadline)
        result['passed'] = True
    except (ValueError, OSError, KeyError, TypeError, RecursionError, UnicodeError, subprocess.SubprocessError) as error:
        result['reason'] = str(error)[:500]
    return result


def materialize(root, files):
    root.mkdir()
    for name, text in files.items():
        path = root/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)


def qualify_task(task_id):
    task = definitions()[task_id]; contract = contract_for(task_id)
    executor = PythonExecutor()
    with tempfile.TemporaryDirectory(prefix='yc-legacy-qualify-') as tmp:
        base = Path(tmp); reference = base/'reference'
        materialize(reference, {**task['files'], **task['oracle']})
        accepted = verify_legacy(reference, task_id, contract, executor)
        pristine = base/'pristine'; materialize(pristine, task['files'])
        negatives = [dict(control='unchanged', verdict=verify_legacy(pristine, task_id, contract, executor))]
        # Wrong output: remove one required oracle output (all existing tasks
        # require every oracle file). Protected controls mutate only existing
        # original inputs not legitimately replaced by the reference solution.
        wrong = base/'wrong'; safe_copy(reference, wrong)
        (wrong/next(iter(task['oracle']))).unlink()
        negatives.append(dict(control='missing-output', verdict=verify_legacy(wrong, task_id, contract, executor)))
        incorrect = base/'incorrect'; safe_copy(reference, incorrect)
        (incorrect/next(iter(task['oracle']))).write_text('incorrect output\n')
        negatives.append(dict(control='wrong-output', verdict=verify_legacy(incorrect, task_id, contract, executor)))
        protected = [n for n in task['files'] if n not in task['oracle']]
        for index,name in enumerate(protected):
            changed = base/('protected-'+str(index)); safe_copy(reference, changed)
            (changed/name).write_text('corrupted protected input\n')
            negatives.append(dict(control='protected-state:'+name, verdict=verify_legacy(changed, task_id, contract, executor)))
        return dict(qualified=accepted['passed'] and all(not n['verdict']['passed'] for n in negatives),
            reference=accepted, negativeControls=negatives, backend=executor.backend, contractVersion=VERSION,
            contract=contract, invocations=len(executor.evidence), runtimeQualified=False,
            scope='Offline current legacy acceptance only; runtime/adapter lifecycle pending')
