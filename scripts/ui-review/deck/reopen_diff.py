# scripts/ui-review/deck/reopen_diff.py
"""What changed on a reopened topic since Destin answered it, and what he already settled.

WHY (Destin, 2026-11-18: "It feels like it keeps resetting rows/questions on me with no clear indication of what (if anything) actually
changed."): a session reopened a whole list because two rows changed, so every row he had ticked came back blank and nothing said which
rows were new or different. At build time, for each `reopened` topic, this reads the version of the topic he ANSWERED (the newest earlier
round that answered it, found by the fingerprint its answers file records) and compares. The page then shows, quietly, which rows /
options are new or changed (and what he said about them), carries his ticks on unchanged rows into the new round, and lists rows taken out.

Result per topic (rides to the page as `grow.diff`):
  list      {'kind': 'calls', 'summary', 'rows': {row id: {'tag': 'new'|'changed'|'same', 'carried', 'before', 'parts', 'said'}}, 'removed': [...]}
  pick      {'kind': 'pick', 'lines': [...], 'options': {option id: 'new'|'changed'|'yourpick'}}
  statement {'kind': 'statement', 'lines': [...], 'changed': bool, 'before'}
Nothing here runs for a topic that is not `reopened`; a version that cannot be found is a build WARNING and that topic builds as before."""
import json
import os

from .gate import as_he_saw_it
from .grows import _steps, earlier_rounds, real
from .spec import is_calls, is_choice, is_decide, row_of_pic, row_states, tickable


def _clip(text, n=160):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= n else text[:n - 1] + '…'


def _same(a, b, keys):
    return all(json.dumps(a.get(k), sort_keys=True) == json.dumps(b.get(k), sort_keys=True) for k in keys)


def _answered_round(spec, sid):
    """(round dict, his answer) for the newest earlier round that really answered `sid`, or (None, None)."""
    for r in reversed(earlier_rounds(spec)):
        a = r['answers'].get(sid)
        if real(a):
            return r, a
    return None, None


# ── a list ──────────────────────────────────────────────────────────────────────────────────────────────────
def _row_said(old_st, old_a, cid):
    """What he wrote on one row: the pencil comment, and the words on marks drawn on its picture."""
    said = []
    t = ((old_a.get('changes') or {}).get(cid) or '').strip()
    if t:
        said.append(t)
    for m in old_a.get('marks') or []:
        row = row_of_pic(old_st, m.get('pic'))
        if row and row.get('id') == cid and (m.get('text') or '').strip():
            said.append(m['text'].strip())
    return ' / '.join(said)


def _list_diff(st, old_st, old_a):
    old_rows = {c.get('id'): c for c in old_st.get('calls') or [] if isinstance(c, dict)}
    states = row_states(old_st, old_a) if tickable(old_st) else {}
    rows, n_new, n_changed, n_same = {}, 0, 0, 0
    for c in st.get('calls') or []:
        cid = c.get('id')
        o = old_rows.get(cid)
        if o is None:
            rows[cid] = {'tag': 'new'}
            n_new += 1
            continue
        call_changed = o.get('call') != c.get('call')
        pic_changed = o.get('picture') != c.get('picture')
        # why/more are the row's other words: a change there with the same bold line and picture is still a change he should hear about.
        more_changed = not _same(o, c, ('why', 'more', 'decided', 'before'))
        said = _row_said(old_st, old_a, cid)
        if call_changed or pic_changed or more_changed:
            parts = (['New picture'] if pic_changed else []) + (['Details changed'] if more_changed and not call_changed else [])
            row = {'tag': 'changed', 'parts': parts}
            if call_changed:
                row['before'] = _clip(o.get('call'))
            n_changed += 1
        else:
            # Unchanged: what he settled stays settled (a tick carries; a comment on an unchanged row is shown, not carried).
            row = {'tag': 'same'}
            n_same += 1
            if states.get(cid) == 'ok':
                row['carried'] = True   # starts ticked in the new round; shows as a pressed tick, no label (Destin: self-explanatory)
        if said:
            row['said'] = _clip(said, 240)
        rows[cid] = row
    now = {c.get('id') for c in st.get('calls') or []}
    removed = [_clip(c.get('call')) for cid, c in old_rows.items() if cid not in now]
    bits = [f'{n_new} new' if n_new else '', f'{n_changed} changed' if n_changed else '', f'{n_same} unchanged' if n_same else '']
    return {'kind': 'calls', 'summary': ' · '.join(b for b in bits if b), 'rows': rows, 'removed': removed}


# ── a question with options or drawings ─────────────────────────────────────────────────────────────────────
def _options(st):
    return [o for o in (st.get('options') or st.get('variants') or []) if isinstance(o, dict)]


def _pick_diff(st, old_st, old_a):
    new_o, old_o = _options(st), {o.get('id'): o for o in _options(old_st)}
    mark = {}
    for o in new_o:
        was = old_o.get(o.get('id'))
        if was is None:
            mark[o.get('id')] = 'new'
        elif not _same(was, o, ('label', 'summary', 'picture', 'pros', 'cons', 'risk', 'cost', 'measured', 'crop')):
            mark[o.get('id')] = 'changed'
    all_new = bool(new_o) and all(mark.get(o.get('id')) == 'new' for o in new_o)
    if all_new:
        mark = {}   # a tag on every option is noise: the line says so once
    lines = []
    v = old_a.get('v')
    picks = [old_a.get('pick')] if v == 'pick' else list(old_a.get('picks') or []) if v == 'picks' else []
    names = [(old_o.get(p) or {}).get('label') or str(p) for p in picks if p]
    if names:
        lines.append('You picked before: ' + ', '.join(names))
        ids_now = {o.get('id') for o in new_o}
        for p in picks:
            if p in ids_now and not all_new:
                mark[p] = 'yourpick'   # marked, never preselected: he chooses again
    elif v == 'wrote':
        lines.append('You wrote an answer before: “' + _clip(old_a.get('text'), 240) + '”')
    else:
        lines.append('You did not pick one of the options before')
    note = ' / '.join(t.strip() for t in (old_a.get('text') if v != 'wrote' else '', old_a.get('note')) if isinstance(t, str) and t.strip())
    if note:
        lines.append('You said: “' + _clip(note, 240) + '”')
    if all_new:
        lines.append('None of these options were in the version you answered.')
    return {'kind': 'pick', 'lines': lines, 'options': mark}


# ── a statement (Holds / Fails, Yes / No) ───────────────────────────────────────────────────────────────────
def _statement_diff(st, old_st, old_a):
    v = old_a.get('v')
    label = {'yes': old_st.get('yes') or 'Yes', 'no': old_st.get('no') or 'No', 'other': 'Something else'}.get(v, v)
    lines = [f'You marked it before: {label}']
    note = (old_a.get('note') or '').strip()
    if note:
        lines.append('You said: “' + _clip(note, 240) + '”')
    changed = not _same(old_st, st, ('headline', 'changed', 'notice', 'today', 'proposal'))
    out = {'kind': 'statement', 'lines': lines, 'changed': changed}
    if changed and old_st.get('headline') != st.get('headline'):
        out['before'] = _clip(old_st.get('headline'))
    return out


def compute(spec):
    """-> ({topic id: diff}, [warnings]) for every reopened topic of a growing deck."""
    diffs, warns = {}, []
    path = os.path.join(spec.get('_base') or '.', (spec.get('_stem') or '') + '.json')
    seen = {}   # fingerprint -> (old spec, problem), so each as-built copy is read once
    for st in _steps(spec):
        sid = st.get('id')
        if not st.get('reopened'):
            continue
        rnd, a = _answered_round(spec, sid)
        if not rnd:
            continue   # never answered: nothing to compare against
        built = rnd.get('built') if isinstance(rnd.get('built'), dict) else {}
        key = built.get('spec_sha256') or ''
        if key not in seen:
            seen[key] = as_he_saw_it(path, built)[::2] if key else (None, 'his answers file records no fingerprint of the deck he saw')
        old, bad = seen[key]
        old_st = next((s for s in _steps(old) if s.get('id') == sid), None) if isinstance(old, dict) else None
        if old_st is None:
            warns.append(f'{sid}: cannot show what changed since he answered it ({bad or "that topic is not in the version he saw"}); it builds without the changes shown')
            continue
        if is_calls(st) and is_calls(old_st):
            diffs[sid] = _list_diff(st, old_st, a)
        elif (is_decide(st) or is_choice(st)) and (is_decide(old_st) or is_choice(old_st)):
            diffs[sid] = _pick_diff(st, old_st, a)
        elif not _options(st) and not st.get('calls') and not st.get('rows'):
            diffs[sid] = _statement_diff(st, old_st, a)
    return diffs, warns
