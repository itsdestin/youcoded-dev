"""The done / not-done gate for the walkthrough flow (replaces the signed contract's gate).

When the contract and acceptance decks were retired (rethink round 9, S-1 = "all"), four
automatic checks went with them. This is the fourth: ONE command that refuses to call a
feature finished while something is unfinished. It reads two walkthrough specs and their
answers files and returns plain-language reasons.

  before = <feature>.walkthrough.json         (shown before the build)
  after  = <feature>.walkthrough.after.json   (shown after it)

It refuses unless:
  1. the before-walkthrough was SUBMITTED (he answered it);
  2. every REQUEST row of it has a matching row in the after-walkthrough — a request row is
     one that quotes him (`decided`) or that he commented on. The link is explicit: an after
     row carries `"from": "<before step id>/<row id>"`, or the before row is named by an
     after row `"dropped": "<why>"` (also `"from"`), so a dropped request is visible, not lost;
  3. every check he left switched ON has a result row (pass / fail / unclear) in the after
     walkthrough — never "not run";
  4. the after-walkthrough was SUBMITTED and he asked for no changes.

WHY a command and not memory: a session building under time pressure forgets the boring
checks; a command that exits non-zero cannot. WHY rows link by id and not by wording:
wording is rewritten during a build, ids are not."""
import json
import os
import re

from .grows import settled_ids
from .spec import strip_comments, unlooked_rows, tickable

# Checks he can switch (before the build) carry one of these; after the build the row carries a
# real outcome. `todo` is "left for him to try", which is not a check result.
SWITCHES = ('run', 'skip')
OUTCOMES = ('pass', 'fail', 'unclear')
FROM_RE = re.compile(r'^[\w.-]+/[\w.-]+$')


def _load(path):
    with open(path) as f:
        return strip_comments(json.load(f))


def answers_file(path):
    """`x.walkthrough.json` -> `x.walkthrough.answers.json` (the same name serve.py writes)."""
    return os.path.splitext(path)[0] + '.answers.json'


def after_path(before):
    """The after-build spec's conventional name: `x.walkthrough.json` -> `x.walkthrough.after.json`."""
    return os.path.splitext(before)[0] + '.after.json'


def _read_answers(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def rows(spec):
    """Every list row of a walkthrough as {'step/row': (step, row)}, in order."""
    out = {}
    for st in spec.get('steps') or []:
        if isinstance(st, dict) and isinstance(st.get('calls'), list):
            for c in st['calls']:
                if isinstance(c, dict) and c.get('id'):
                    out[f'{st.get("id")}/{c["id"]}'] = (st, c)
    return out


def effective_result(row, step_id, answers):
    """A row's status as it stands: what HE set (answers.results) wins over what the spec says."""
    mine = ((((answers or {}).get('answers') or {}).get(step_id) or {}).get('results') or {})
    return mine.get(row['id'], row.get('result'))


def row_comments(answers):
    """{'step/row': his words} for every list row he typed a change on."""
    out = {}
    for sid, a in ((answers or {}).get('answers') or {}).items():
        for rid, text in ((a or {}).get('changes') or {}).items():
            out[f'{sid}/{rid}'] = (text or '').strip()
    return out


def changes_requested(answers):
    """What in an answers file means "I want something different". The page writes a change as an
    entry in `changes` (a row he typed on), `edits` (words he retyped), `marks` (an area he dragged
    on a picture) or `asks` (more context wanted); a status he set to fail / unclear; a No; or a
    note he left on a step, a page or the deck. An empty list means he went through changing nothing.
    WHY notes count: a note is him steering, and "he changed nothing" must not be true while a
    sentence of his has gone unanswered."""
    out = []
    for sid, a in ((answers or {}).get('answers') or {}).items():
        a = a or {}
        for key in ('changes', 'edits'):
            for rid, t in (a.get(key) or {}).items():
                out.append(f'{sid}/{rid}: he asked for a change')
        out += [f'{sid}: he marked an area on a picture' for _ in a.get('marks') or []]
        out += [f'{sid}/{k}: he asked for more context' for k in a.get('asks') or []]
        for rid, r in (a.get('results') or {}).items():
            if r in ('fail', 'unclear'):
                out.append(f'{sid}/{rid}: he set it to {r}')
        if a.get('v') == 'no':
            out.append(f'{sid}: he answered No')
        if (a.get('note') or '').strip():
            out.append(f'{sid}: he left a note')
    for k, t in (answers.get('pageNotes') or {}).items() if answers else []:
        if (t or '').strip():
            out.append(f'page {k}: he left a note')
    if answers and (answers.get('notes') or '').strip():
        out.append('he left a general note')
    return out


def unlooked_in(spec, answers, skip=()):
    """Rows of a "Yours to change" list in `spec` that he neither ticked nor changed, as
    'step/row ("words")'. WHY (round 10, R-2): in the after-build walkthrough a row he never looked
    at means he has not gone through it, so the deck is not finished. A list answered under the old
    shape (accepted, no ticks) still reads as accepted - see spec.row_states."""
    out = []
    mine = (answers or {}).get('answers') or {}
    for st in spec.get('steps') or []:
        if isinstance(st, dict) and tickable(st) and st.get('id') not in skip:
            for c in unlooked_rows(st, mine.get(st.get('id'))):
                out.append(f'{st.get("id")}/{c.get("id")} ("{(c.get("call") or "")[:70]}")')
    return out


def request_rows(before, answers):
    """Before-walkthrough rows the build must answer for: those quoting him, and any he commented on."""
    comments = row_comments(answers)
    return [key for key, (_, c) in rows(before).items() if c.get('decided') or key in comments]


def checks(before, answers):
    """{'step/row': 'run' | 'skip'} — the checks-menu rows and whether each ended up switched on."""
    out = {}
    for key, (st, c) in rows(before).items():
        if c.get('result') in SWITCHES:
            out[key] = effective_result(c, st.get('id'), answers)
    return out


def also_check(before, answers):
    """His comments on the checks that are ON: passed to the checker as "also check this"."""
    comments = row_comments(answers)
    return {k: comments[k] for k, v in checks(before, answers).items() if v == 'run' and comments.get(k)}


def check_gate(before_path, after=None):
    """-> (problems, notes). `problems` non-empty means NOT finished."""
    problems, notes = [], []
    after = after or after_path(before_path)
    try:
        before = _load(before_path)
    except (OSError, ValueError) as e:
        return [f'cannot read the before-build walkthrough {before_path}: {e}'], notes
    b_ans = _read_answers(answers_file(before_path))
    if not b_ans or not b_ans.get('submitted'):
        problems.append('the before-build walkthrough has not been submitted — he has not answered it yet')
        b_ans = b_ans or {}
    if not os.path.exists(after):
        problems.append(f'no after-build walkthrough yet ({os.path.basename(after)}) — build it from the same pages and show it to him')
        return problems, notes
    try:
        aft = _load(after)
    except (OSError, ValueError) as e:
        return problems + [f'cannot read the after-build walkthrough {after}: {e}'], notes
    a_rows = rows(aft)
    linked = {}   # before 'step/row' -> the after row that answers it
    for key, (_, c) in a_rows.items():
        src = c.get('from')
        if src is None:
            continue
        if not isinstance(src, str) or not FROM_RE.match(src):
            problems.append(f'after row {key}: "from" must look like "<before step id>/<row id>", not {src!r}')
        else:
            linked.setdefault(src, []).append((key, c))
        if c.get('dropped') is not None and not (isinstance(c['dropped'], str) and c['dropped'].strip()):
            problems.append(f'after row {key}: "dropped" needs the reason in words')
    b_rows = rows(before)
    for src in linked:
        if src not in b_rows:
            problems.append(f'after row {linked[src][0][0]} says it came from {src}, which is not a row of the before-build walkthrough')
    # 2. requests
    for key in request_rows(before, b_ans):
        if key not in linked:
            words = (b_rows[key][1].get('decided') or b_rows[key][1].get('call') or '')[:70]
            problems.append(f'request {key} ("{words}") has no row in the after-build walkthrough — add one with "from": "{key}", or "dropped": "<why>"')
    # 3. checks
    on = {k for k, v in checks(before, b_ans).items() if v == 'run'}
    for key in sorted(on):
        results = [c.get('result') for _, c in linked.get(key, [])]
        if not any(r in OUTCOMES for r in results):
            shown = results[0] if results else 'missing'
            problems.append(f'check {key} was switched on but has no result row (pass / fail / unclear) — it shows "{shown}"; a check is never reported as not run')
    # 4. his review of the after-build deck
    a_ans = _read_answers(answers_file(after))
    if not a_ans or not a_ans.get('submitted'):
        problems.append('the after-build walkthrough has not been submitted — he has not gone through it yet')
    else:
        for line in changes_requested(a_ans):
            problems.append(f'after-build walkthrough, not finished: {line}')
        # WHY (Destin, round 10): on a deck that grows, a list he settled in an earlier round is not asked
        # again, so its rows have no ticks in THIS round's file; they are not "not looked at".
        settled = settled_ids({**aft, '_base': os.path.dirname(os.path.abspath(after)),
                               '_stem': os.path.basename(os.path.splitext(after)[0])}, a_ans)
        for line in unlooked_in(aft, a_ans, settled):
            problems.append(f'after-build walkthrough, not finished: row {line} was not looked at - he neither ticked it nor asked for a change')
    for k, t in also_check(before, b_ans).items():
        notes.append(f'also check ({k}): {t}')
    if not problems:
        notes.insert(0, f'{len(request_rows(before, b_ans))} requests and {len(on)} switched-on checks all answered; he went through the after-build walkthrough changing nothing')
    return problems, notes
