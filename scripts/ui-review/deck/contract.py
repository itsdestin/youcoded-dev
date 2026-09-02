"""The gate's three facts, and the acceptance deck built from the contract.

contract-check reads what the design calls the gate (feature-flow design §4): (1) the contract
holds — every row's `source` names a step that exists in a deck the spec's `sources` map points
at, that deck's answers were SUBMITTED, that step was answered (not skipped), and every
`mechanical` guard exists on disk or on the contract's branch; (2) the contract was SIGNED —
its own answers file is submitted and the contract step answered yes; (3) the acceptance deck
was submitted. Only (1) is an exit code: the contract agent runs this before Destin has seen
the deck, so (2) and (3) are reported as `ok:` / `todo:` lines that close-out.sh relays.

acceptance merges the grader's verdicts into the contract: step 1 is the table with a verdict
beside every graded row, then one words step per human / live-app row for Destin to tick."""
import glob
import json
import os
import subprocess

from .spec import is_contract, workspace_root


class AcceptanceError(Exception):
    pass


def contract_steps(spec):
    return [st for st in spec['steps'] if is_contract(st)]


def _when(stamp):
    return (stamp or '')[:16].replace('T', ' ')


def guard_exists(root, branch, guard):
    """A `mechanical` row's guard, as a workspace-relative path. True if it is on disk under
    `root`, or committed on `branch` (or `origin/<branch>`) in the repo the path's first
    segment names — `youcoded/desktop/tests/x.test.ts` is looked up in the `youcoded` repo as
    `desktop/tests/x.test.ts`; `scripts/x.py` in the workspace repo itself.
    WHY the branch: from a worktree, workspace_root() is the MAIN checkout, where a test the
    feature branch adds does not exist until merge — and those are most of the guards a
    contract names. An uncommitted file is found nowhere, on purpose."""
    if not guard:
        return False
    if os.path.exists(os.path.join(root, guard)):
        return True
    if not branch:
        return False
    first, _, rest = guard.partition('/')
    repo, rel = (os.path.join(root, first), rest) if rest and os.path.exists(os.path.join(root, first, '.git')) else (root, guard)
    for ref in (branch, f'origin/{branch}'):
        r = subprocess.run(['git', '-C', repo, 'cat-file', '-e', f'{ref}:{rel}'], capture_output=True)
        if r.returncode == 0:
            return True
    return False


def answers_for(spec_path):
    """(raw spec, newest SUBMITTED answers, why) for a source deck. Returns (None, None, why)
    when the spec cannot be read; (spec, None, why) when nothing submitted exists.
    WHY the glob: serve.rotate_submitted moves a submitted file to <stem>.answers.<stamp>.json
    before a re-serve, so the plain file may be the EMPTY new one while the decisions sit in
    the stamped one. The newest submitted file wins, whichever name it carries."""
    try:
        with open(spec_path) as f:
            raw = json.load(f)
    except (OSError, ValueError) as e:
        return None, None, f'cannot read {os.path.basename(spec_path)}: {e}'
    base, stem = os.path.dirname(spec_path), os.path.splitext(os.path.basename(spec_path))[0]
    candidates = [os.path.join(base, stem + '.answers.json')] + sorted(glob.glob(os.path.join(base, stem + '.answers.*.json')), reverse=True)
    seen_any = False
    for c in candidates:
        try:
            with open(c) as f:
                a = json.load(f)
        except (OSError, ValueError):
            continue
        seen_any = True
        if a.get('submitted'):
            return raw, a, ''
    rel = os.path.basename(spec_path)
    return raw, None, (f'{rel} answers were never submitted' if seen_any else f'{rel} has no answers file')


def check_contract(spec):
    """One problem per line; empty means the contract holds together."""
    problems, cache = [], {}
    sources = spec.get('sources') or {}
    root = workspace_root()
    for st in contract_steps(spec):
        for r in st['rows']:
            tag = f'{st["id"]}/{r["id"]}'
            key, _, sid = (r.get('source') or '').partition('#')
            rel = sources.get(key)
            if not rel:
                problems.append(f'{tag}: source deck "{key}" is not in the spec\'s "sources"')
                continue
            if key not in cache:
                cache[key] = answers_for(os.path.join(spec['_base'], rel))
            raw, ans, why = cache[key]
            if raw is None:
                problems.append(f'{tag}: {why}')
                continue
            if raw.get('key') != key:
                problems.append(f'{tag}: {rel} is deck "{raw.get("key")}", not "{key}"')
            if sid not in {s.get('id') for s in raw.get('steps', [])}:
                problems.append(f'{tag}: no step "{sid}" in {rel}')
            if ans is None:
                problems.append(f'{tag}: {why}')
                continue
            a = (ans.get('answers') or {}).get(sid) or {}
            if not a.get('v') or a['v'] == 'skip':
                problems.append(f'{tag}: step {sid} of {key} was not answered')
            if r.get('checkedBy') == 'mechanical' and not guard_exists(root, spec.get('branch'), r.get('guard', '')):
                problems.append(f'{tag}: guard {r.get("guard")} is neither on disk under {root} nor committed on branch "{spec.get("branch") or "(no branch in the spec)"}"')
    return problems


def signoff(spec):
    """Fact (2): the contract's OWN answers — submitted, and the contract step answered yes.
    Returns (ok, one line for close-out)."""
    steps = contract_steps(spec)
    sid = steps[0]['id'] if steps else None
    _, ans, why = answers_for(os.path.join(spec['_base'], spec['_stem'] + '.json'))
    if ans is None:
        return False, f'not signed — {why}; serve {spec["_stem"]}.json and answer it'
    a = (ans.get('answers') or {}).get(sid) or {}
    if a.get('v') == 'yes':
        return True, f'signed {_when(ans.get("submitted"))} — {sid} yes' + (f' — "{a["note"].strip()}"' if (a.get('note') or '').strip() else '')
    if a.get('v') in ('no', 'other'):
        return False, f'answered "{a["v"]}" {_when(ans.get("submitted"))} — the contract is not agreed' + (f': "{a["note"].strip()}"' if (a.get('note') or '').strip() else '')
    return False, f'not signed — submitted {_when(ans.get("submitted"))} but step {sid} was skipped'


def acceptance_status(spec):
    """Fact (3): `<stem>.acceptance.json` exists and its newest answers file is submitted."""
    acc = os.path.join(spec['_base'], spec['_stem'] + '.acceptance.json')
    if not os.path.exists(acc):
        return False, f'acceptance deck not built — write {spec["_stem"]}.verdicts.json, then review-cards.py acceptance {spec["_stem"]}.json'
    _, ans, why = answers_for(acc)
    if ans is None:
        return False, f'acceptance deck not submitted — serve {os.path.basename(acc)}'
    return True, f'acceptance deck submitted {_when(ans.get("submitted"))}'


GRADED = ('mechanical', 'deck')


def acceptance_spec(spec, verdicts):
    """The acceptance deck as a spec dict. `verdicts` is {row id: {verdict, evidence}} from
    <stem>.verdicts.json. Refuses when a graded row has none: an ungraded row is not a pass."""
    steps = contract_steps(spec)
    if len(steps) != 1:
        raise AcceptanceError(f'expected exactly one contract step, found {len(steps)}')
    st = steps[0]
    missing = [f'{r["id"]} ({r["checkedBy"]})' for r in st['rows'] if r.get('checkedBy') in GRADED and not (verdicts.get(r['id']) or {}).get('verdict')]
    if missing:
        raise AcceptanceError('no verdict for graded rows: ' + ', '.join(m + ' has no verdict' for m in missing))
    rows = []
    for r in st['rows']:
        v = verdicts.get(r['id']) or {}
        rows.append({**r, **({'verdict': v['verdict'], 'evidence': v.get('evidence', '')} if v.get('verdict') else {})})
    table = {**st, 'id': st['id'], 'rows': rows, 'headline': 'The contract, graded — accept these verdicts?',
             'yes': 'Yes, accept', 'no': 'No, something is wrong'}
    human = [{'id': r['id'], 'words': True, 'surface': st['surface'], 'path': 'Acceptance',
              'headline': r['statement'],
              'changed': 'Checked by you.' + (f' Your note at review: “{r["note"]}”' if r.get('note') else ''),
              'notice': r.get('threshold') or 'pass / fail',
              'yes': 'Holds', 'no': 'Fails'}
             for r in st['rows'] if r.get('checkedBy') in ('human', 'live-app')]
    return {'title': spec['title'] + ' — acceptance', 'key': spec['key'] + '-acceptance',
            'out': spec['_stem'] + '.acceptance.html', 'themes': list(spec['themes']),
            'branch': spec.get('branch', ''), 'sources': dict(spec.get('sources') or {}),
            'steps': [table] + human}
