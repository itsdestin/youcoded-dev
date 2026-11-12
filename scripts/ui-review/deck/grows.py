# scripts/ui-review/deck/grows.py
"""A deck that grows: ONE deck per feature, re-built each round, that keeps what Destin already said.

WHY (Destin, round 1: "a single deck that kind of 'evolves' in response to my questions and keeps my
earlier responses"; round 8, on the History button: "I want these decks to be evolving documents,
documents that grow in response to my answers in previous rounds and... evolve into the pre-build deck,
which eventually evolves into the post-build deck... feels like you tacked on a fucking sticky note";
round 10: open topics on top, answered topics sink to a list at the bottom with the round they were
answered in, an open topic shows ONE summary line of its past and the story opens on request).

A spec opts in with `"grows": true`. Nothing here runs for any other spec.

What a round is: every time he submits, serve.py moves the answers aside as
`<stem>.answers.<stamp>.json`. Those dated files, in time order, ARE the earlier rounds of this deck.
The submitted answers file not yet moved aside (the deck was rebuilt before it was re-served) counts as
the newest earlier round, so a rebuild right after he answers already shows the next round.

This module is shared by the spec check (refuses a change that would silently lose something he said),
the page builder (what each step carries to the page), serve.py's summary and gate.py."""
import glob
import json
import os

from .spec import is_page, tickable, unlooked_rows, word_count

STAGES = ('understanding', 'design', 'before', 'after')
STAGE_NAMES = {'understanding': 'Understanding', 'design': 'Design', 'before': 'Before build', 'after': 'After build'}
PAST_WORDS_MAX = 30       # the one summary line of a topic's past (`reopened`, `past`)
RESOLVED_WORDS_MAX = 40   # what was done about something he asked for (`resolved`)
ANSWER_NAMES = {'yes': 'Yes', 'no': 'No', 'other': 'Something else', 'skip': 'Not answered'}


def is_grows(spec):
    return spec.get('grows') is True


def real(a):
    """A real answer: something chosen, not left or skipped."""
    return bool(a) and bool(a.get('v')) and a.get('v') != 'skip'


def answer_view(st, a):
    """(answer, notes) for one step and his saved answer to it, in plain words.
    WHY one function (it used to live inside build._history): the History panel and a growing deck's
    answered topics must read an answer the same way, so they share this and cannot drift."""
    rows = {c.get('id'): c.get('call', '') for c in st.get('calls') or [] if isinstance(c, dict)}
    opts = {o.get('id'): o.get('label', '') for o in st.get('options') or [] if isinstance(o, dict)}
    a = a or {}
    v = a.get('v') or 'skip'
    if v == 'pick':
        answer = opts.get(a.get('pick')) or str(a.get('pick') or '')
    elif v == 'picks':
        answer = ', '.join(opts.get(p) or str(p) for p in a.get('picks') or [])
    elif v == 'wrote':
        answer = ''
    elif st.get('calls') and v == 'yes':
        answer = 'Accepted as listed'
    elif st.get('calls') and v == 'other':
        answer = 'Changed'
    else:
        answer = ANSWER_NAMES.get(v, v)
    notes = [t for t in [(a.get('text') or '').strip(), (a.get('note') or '').strip()] if t]
    notes += [f'{rows.get(k) or k} — {(t or "").strip()}' for k, t in (a.get('changes') or {}).items() if (t or '').strip()]
    notes += [f'On a picture — {(m.get("text") or "").strip()}' for m in a.get('marks') or [] if (m.get('text') or '').strip()]
    # `state` (round 7b): what was open on the screen when the words were changed.
    notes += [f'Reword “{t.get("from", "")}” to “{t.get("to", "")}”' + (f' (seen with: {t["state"]})' if t.get('state') else '')
              if isinstance(t, dict) else f'{rows.get(k) or k} reworded — {t}'
              for k, t in (a.get('edits') or {}).items()]
    return answer, notes


def is_plain_acceptance(st, a):
    """True when his answer asked for nothing: a plain yes / a pick / a typed answer, with no note,
    no marks on a picture, no row changes and no row left unlooked. Anything else is a request the
    next round must say what became of."""
    v = a.get('v')
    if v not in ('yes', 'pick', 'picks', 'wrote'):
        return False
    if (a.get('note') or '').strip() or a.get('marks') or a.get('changes') or a.get('edits') or a.get('asks'):
        return False
    if v != 'wrote' and (a.get('text') or '').strip():
        return False
    if tickable(st) and unlooked_rows(st, a):
        return False
    return True


def earlier_rounds(spec, include_live=True, exclude_built=None):
    """The submitted rounds of THIS deck, oldest first: [{'n', 'label', 'when', 'answers'}].
    Files holding the same build stamp are one round (a same-build re-serve keeps a dated copy and
    he can submit again): the latest of them is kept.

    `include_live`: the submitted answers file not yet moved aside counts (building the NEXT round).
    `exclude_built`: skip any copy of the build with this stamp. WHY: summing up a round that is being
    submitted right now must never treat that same round's own answers (the live file, or the dated copy
    kept by a same-build re-serve) as an EARLIER round, or everything he just answered would look settled."""
    base, stem = spec.get('_base') or '', spec.get('_stem') or ''
    files = glob.glob(os.path.join(glob.escape(base), glob.escape(stem) + '.answers.*.json'))
    live = os.path.join(base, stem + '.answers.json')
    if include_live and os.path.exists(live):
        files.append(live)
    found = []
    for path in files:
        try:
            with open(path, encoding='utf-8') as f:
                saved = json.load(f)
        except (OSError, ValueError):
            continue
        if isinstance(saved, dict) and saved.get('submitted'):
            if exclude_built and isinstance(saved.get('built'), dict) and saved['built'].get('at') == exclude_built:
                continue
            found.append((saved['submitted'], os.path.basename(path), saved))
    found.sort(key=lambda x: (x[0], x[1]))
    rounds, by_build = [], {}
    for submitted, _, saved in found:
        at = saved['built'].get('at') if isinstance(saved.get('built'), dict) else None
        if at and at in by_build:
            rounds[by_build[at]] = {'submitted': submitted, 'answers': saved.get('answers') or {}}   # a later send of the same round
            continue
        if at:
            by_build[at] = len(rounds)
        rounds.append({'submitted': submitted, 'answers': saved.get('answers') or {}})
    before = spec.get('rounds_before') if isinstance(spec.get('rounds_before'), int) else 0
    for i, r in enumerate(rounds, 1):
        r['n'] = before + i
        r['label'] = f'Round {r["n"]}'
        r['when'] = r['submitted'][:10]
    return rounds


def round_number(spec):
    """The round being built: rounds before + submitted rounds on disk + 1."""
    before = spec.get('rounds_before') if isinstance(spec.get('rounds_before'), int) else 0
    return before + len(earlier_rounds(spec)) + 1


def _steps(spec):
    return [st for st in spec.get('steps') or [] if isinstance(st, dict) and not is_page(st)]


def step_info(spec, **kw):
    """{step id: info} for a growing deck. info: answered (bool), round, answer, notes, resolved,
    line (the one summary line of the past, for an open topic), story (his earlier answers,
    oldest first: [{round, answer, notes}]). `_latest` is private to this module."""
    rounds = earlier_rounds(spec, **kw)
    out = {}
    for st in _steps(spec):
        sid = st.get('id')
        story = []
        for r in rounds:
            a = r['answers'].get(sid)
            if real(a):
                ans, notes = answer_view(st, a)
                story.append({'round': r['label'], 'answer': ans, 'notes': notes, '_a': a})
        hand = st.get('answered')
        latest = story[-1] if story else None
        info = {'answered': False, 'story': [{k: v for k, v in s.items() if k != '_a'} for s in story]}
        if isinstance(hand, dict):
            info.update(answered=True, round=hand.get('round', ''), answer=hand.get('answer', ''), notes=list(hand.get('notes') or []))
            info['story'] = info['story'] or [{'round': info['round'], 'answer': info['answer'], 'notes': info['notes']}]
        elif latest and not st.get('reopened'):
            info.update(answered=True, round=latest['round'], answer=latest['answer'], notes=latest['notes'])
        line = st.get('reopened') or st.get('past')
        if line and not info['answered']:
            info['line'] = line
        if st.get('resolved') and info['answered']:
            info['resolved'] = st['resolved']
        info['_latest'] = latest
        out[sid] = info
    return out


def _quote(latest):
    parts = ([latest['answer']] if latest['answer'] else []) + latest['notes']
    words = ' / '.join(parts)
    return words if len(words) <= 140 else words[:137] + '...'


def problems(spec):
    """The refusals that keep a rebuild from silently losing something he said (plain sentences)."""
    errs = []
    if not is_grows(spec):
        return errs
    info = step_info(spec)
    rounds = earlier_rounds(spec)
    for st in _steps(spec):
        latest = info[st.get('id')]['_latest']
        if not latest or isinstance(st.get('answered'), dict):
            continue
        if is_plain_acceptance(st, latest['_a']) or st.get('reopened') or st.get('resolved'):
            continue
        errs.append(f'{st["id"]}: his {latest["round"].lower()} answer on "{st.get("headline", st["id"])}" asked for a change '
                    f'({_quote(latest)}); say what happened: add "reopened" (one line of its past; the topic is open again) '
                    f'or "resolved" (what was done about it; the topic stays answered)')
    present = {st.get('id') for st in _steps(spec)}
    retired = spec.get('retired') if isinstance(spec.get('retired'), dict) else {}
    gone = {}
    for r in rounds:
        for sid, a in r['answers'].items():
            if real(a) and sid not in present and sid not in retired and sid not in gone:
                gone[sid] = r['label']
    for sid, label in gone.items():
        errs.append(f'{sid}: he answered this in {label.lower()} but it is no longer in the deck; keep it, or list it under '
                    f'"retired": {{"{sid}": "why it went"}}')
    return errs


def validate_fields(spec, errors):
    """Plain-language checks of every field a growing deck adds."""
    steps = [st for st in spec.get('steps') or [] if isinstance(st, dict)]
    grows = spec.get('grows')
    if grows is not None and grows is not True:
        errors.append('grows is true or left out (one deck for the whole feature, re-built each round)')
    on = grows is True
    for k in ('rounds_before', 'retired'):
        if k in spec and not on:
            errors.append(f'{k} belongs on a deck that grows; add "grows": true')
    if on and 'rounds_before' in spec and (not isinstance(spec['rounds_before'], int) or isinstance(spec['rounds_before'], bool) or spec['rounds_before'] < 0):
        errors.append('rounds_before is a whole number: how many separate decks this feature had before this one')
    if on and 'retired' in spec:
        r = spec['retired']
        if not isinstance(r, dict) or not all(isinstance(k, str) and isinstance(v, str) and v.strip() for k, v in r.items()):
            errors.append('retired is {"<step id>": "<why it went, one line>"}')
    for st in steps:
        sid = st.get('id') or 'a step'
        if is_page(st):
            stage = st.get('stage')
            if stage is not None and not on:
                errors.append(f'{sid}: stage belongs on a deck that grows; add "grows": true')
            elif stage is not None and stage not in STAGES:
                errors.append(f'{sid}: stage is one of {", ".join(STAGES)}')
            continue
        for k in ('answered', 'reopened', 'resolved', 'past'):
            if k in st and not on:
                errors.append(f'{sid}: {k} belongs on a deck that grows; add "grows": true to the spec')
        if not on:
            continue
        a = st.get('answered')
        if a is not None:
            if not isinstance(a, dict) or not isinstance(a.get('round'), str) or not a['round'].strip() \
                    or not isinstance(a.get('answer'), str) or not a['answer'].strip():
                errors.append(f'{sid}: answered is {{"round": "Round 4", "answer": "Yes", "notes": ["his words"]}}; round and answer are required text')
            else:
                if 'notes' in a and (not isinstance(a['notes'], list) or not all(isinstance(n, str) and n.strip() for n in a['notes'])):
                    errors.append(f'{sid}: answered.notes is a list of his words, each as text')
                for k in a:
                    if k not in ('round', 'answer', 'notes'):
                        errors.append(f'{sid}: answered holds round, answer and notes, not "{k}"')
        for k, cap in (('reopened', PAST_WORDS_MAX), ('past', PAST_WORDS_MAX), ('resolved', RESOLVED_WORDS_MAX)):
            v = st.get(k)
            if v is None:
                continue
            if not isinstance(v, str) or not v.strip():
                errors.append(f'{sid}: {k} is one plain line')
            elif word_count(v) > cap:
                errors.append(f'{sid}: {k} is {word_count(v)} words (max {cap}); one line, the story opens on request')
        if st.get('answered') is not None and st.get('reopened') is not None:
            errors.append(f'{sid}: a topic is answered or reopened, not both; drop one')
        if st.get('answered') is not None and st.get('past') is not None:
            errors.append(f'{sid}: past is for an open topic; this one is answered')
        if st.get('reopened') is not None and st.get('resolved') is not None:
            errors.append(f'{sid}: reopened means the topic is open again, resolved means it stays answered; keep one')
        if st.get('reopened') is not None and st.get('past') is not None:
            errors.append(f'{sid}: give reopened or past, not both; each is the one line of the topic\'s past')
        if st.get('state') is not None or any(isinstance(c, dict) and c.get('state') for c in st.get('calls') or []):
            errors.append(f'{sid}: state is not used on a deck that grows; answered topics sink to the bottom by themselves')
        if st.get('trail') and not (st.get('reopened') or st.get('past') or st.get('answered')):
            errors.append(f'{sid}: a trail on a deck that grows opens from one summary line; add "reopened" (or "past") with that line, or drop the trail')
    if on:
        last = -1
        for st in steps:
            if not is_page(st):
                continue
            if st.get('stage') is None:
                errors.append(f'{st.get("id")}: every page of a deck that grows names its stage ({", ".join(STAGES)})')
            elif st['stage'] in STAGES:
                n = STAGES.index(st['stage'])
                if n < last:
                    errors.append(f'{st.get("id")}: stages go in order ({", ".join(STAGES)}); this page is {st["stage"]} after a later stage')
                last = max(last, n)
        if steps and not is_page(steps[0]):
            errors.append(f'{steps[0].get("id")}: on a deck that grows the first question follows a page marker that names its stage')


def settled_ids(spec, state=None):
    """Step ids shown as already answered and not reopened by him: nothing is asked of him on them
    this round, so no count, summary or finish list includes them."""
    if not is_grows(spec):
        return set()
    reopened = (state or {}).get('reopened') or {}
    # Not the live file and not this build's own copies: see earlier_rounds.
    built = (state or {}).get('built') or {}
    info = step_info(spec, include_live=False, exclude_built=built.get('at') if isinstance(built, dict) else None)
    return {sid for sid, i in info.items() if i['answered'] and not reopened.get(sid)}


def step_data(spec):
    """What each step carries to the page, as {step id: dict} (empty for a deck that does not grow)."""
    if not is_grows(spec):
        return {}
    return {sid: {k: v for k, v in i.items() if not k.startswith('_')} for sid, i in step_info(spec).items()}
