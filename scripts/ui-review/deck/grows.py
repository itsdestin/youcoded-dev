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
import re
import subprocess
from subprocess import SubprocessError as SubprocessError_

from .spec import is_page, row_of_pic, row_states, tickable, unlooked_rows, word_count

STAGES = ('understanding', 'design', 'before', 'after')
STAGE_NAMES = {'understanding': 'Understanding', 'design': 'Design', 'before': 'Before build', 'after': 'After build'}
PAST_WORDS_MAX = 30       # the one summary line of a topic's past (`reopened`, `past`)
RESOLVED_WORDS_MAX = 40   # what was done about something he asked for (`resolved`)
INTRO_CHARS_MAX = 160     # a page's one plain line under its heading
GIVEN_DROP = ('seconds', 'theme', 't', 'zoom', 'built')   # timing noise in a saved answer; everything else is his
# WHY (Destin, round 11: "these descriptions frequently make references to earlier rounds, external content, etc, that i wouldn't
# know off the top of my head, especially after walking away for a day or two"): a visible line may not point at a round or a step id.
# WHY only ids that really exist (code review F11): "GPT-4", "UTF-8" or "Pi-4" are product names, not step ids; a token that looks like an id is
# refused only when it IS a step, page or row id of this deck or of an earlier round of it (see `known_ids`).
ROUND_CITE = re.compile(r'\brounds?\s*\d+', re.I)
ID_LIKE = re.compile(r'\b[A-Z]{1,3}-\d{1,2}\b', re.I)
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
    # WHY a mark on a row's picture reads as that row's comment (Destin, round 13), the same as a pencil comment.
    for m in a.get('marks') or []:
        if (m.get('text') or '').strip():
            row = row_of_pic(st, m.get('pic'))
            notes.append(f'{(row or {}).get("call") or ""} — {(m.get("text") or "").strip()}' if row else f'On a picture — {(m.get("text") or "").strip()}')
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


def _words_of(saved):
    """The things he said in a round outside any answer: page comments, the general note, and the pictures pasted on them."""
    return {k: saved[k] for k in ('pageNotes', 'notes', 'pageAttach', 'notesAttach') if saved.get(k)}


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
    # WHY `stale_answers` (Destin's round-12 file carried round-11 answers because his browser restored its old copy): a spec may say which ids in a
    # file, found by its `submitted` time, were NOT said in that round; they are dropped from it, so they are not counted twice.
    stale = spec.get('stale_answers') if isinstance(spec.get('stale_answers'), dict) else {}
    for submitted, _, saved in found:
        at = saved['built'].get('at') if isinstance(saved.get('built'), dict) else None
        drop = set(stale.get(submitted) or [])
        ans = {k: v for k, v in (saved.get('answers') or {}).items() if k not in drop}
        # WHY only a copy that says `sent_before` is "a later send of the same round" (serve.py writes it on a same-build re-serve): two files that merely
        # carry the same build stamp are two rounds when nothing says the second was a re-send (a stamp copied from an old browser copy does not make one).
        if at and at in by_build and saved.get('sent_before'):
            rounds[by_build[at]] = {'submitted': submitted, 'answers': ans, 'built': saved.get('built'), **_words_of(saved)}   # a later send of the same round
            continue
        if at:
            by_build[at] = len(rounds)
        rounds.append({'submitted': submitted, 'answers': ans, 'built': saved.get('built'), **_words_of(saved)})
    before = spec.get('rounds_before') if isinstance(spec.get('rounds_before'), int) else 0
    for i, r in enumerate(rounds, 1):
        r['n'] = before + i
        r['label'] = f'Round {r["n"]}'
        r['when'] = r['submitted'][:10]
    return rounds


def known_ids(spec, rounds):
    """Every step, page and row id this deck has or ever had (upper-case), so a title may name a product ("GPT-4") but never a step ("Q-3")."""
    ids = set()
    for st in spec.get('steps') or []:
        if isinstance(st, dict):
            ids.add(str(st.get('id') or '').upper())
            ids.update(str(c.get('id') or '').upper() for c in st.get('calls') or [] if isinstance(c, dict))
    for r in rounds:
        ids.update(k.upper() for k in r['answers'])
        ids.update(str(i).upper() for i in ((r.get('built') or {}).get('ids') or []))
        ids.update(k.upper() for k in r.get('pageNotes') or {})
    ids.update(k.upper() for k in (spec.get('retired') or {}))
    ids.discard('')
    return ids


# WHY (code review F10): `built.commit` comes from an answers file the browser wrote, and git reads a value starting "--" as an option.
# Only a plain commit hash (7 to 40 hex characters) is ever handed to git.
COMMIT_RE = re.compile(r'^[0-9a-fA-F]{7,40}$')


def spec_bytes_at_commit(path, commit):
    """The raw bytes of the spec file `path` at git `commit`, or None (git, the commit or the path is not available, or `commit` is not a hash)."""
    if not isinstance(commit, str) or not COMMIT_RE.match(commit):
        return None
    try:
        here = os.path.dirname(os.path.abspath(path))
        top = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=here, capture_output=True, text=True, timeout=10)
        if top.returncode:
            return None
        rel = os.path.relpath(os.path.realpath(path), os.path.realpath(top.stdout.strip())).replace(os.sep, '/')
        shown = subprocess.run(['git', 'show', f'{commit}:{rel}'], cwd=here, capture_output=True, timeout=20)
        return shown.stdout if shown.returncode == 0 else None
    except (OSError, SubprocessError_):
        return None


def spec_at_commit(path, commit):
    """The text of the spec file `path` as it was at git `commit`, parsed, or None when git, the commit or
    the path is not available. WHY (Destin, final-check + "New" tags): each answers file records the build's commit,
    so the exact deck he saw can be read back from git instead of saving a second copy (gate.py checks it is the SAME bytes)."""
    raw = spec_bytes_at_commit(path, commit)
    try:
        return json.loads(raw) if raw is not None else None
    except ValueError:
        return None


def previous_ids(spec):
    """The topic ids of the deck as Destin last SAW it (the newest earlier round's build), or None when that is not
    known (no earlier round, or an old answers file naming neither the ids nor a commit to read them from).
    New builds record their topic ids in the build stamp (`built.ids`); an older file falls back to the spec at its commit."""
    rounds = earlier_rounds(spec)
    built = rounds[-1].get('built') if rounds else None
    if not isinstance(built, dict):
        return None
    if isinstance(built.get('ids'), list):
        return set(built['ids'])
    commit = built.get('commit')
    if commit and spec.get('_base') and spec.get('_stem'):
        old = spec_at_commit(os.path.join(spec['_base'], spec['_stem'] + '.json'), commit)
        if isinstance(old, dict):
            return {st.get('id') for st in old.get('steps') or [] if isinstance(st, dict) and not is_page(st) and st.get('id')}
    return None


def new_ids(spec, info):
    """Ids of topics that are NEW this round: open, and not in the deck as he last saw it. A reopened topic is
    not new (it was there). With no earlier round nothing is new (everything would be, and a tag on all is noise)."""
    before = previous_ids(spec)
    if before is None:
        return set()
    return {sid for sid, i in info.items() if sid not in before and not i['answered'] and not _by_id(spec, sid).get('reopened')}


def _by_id(spec, sid):
    return next((st for st in _steps(spec) if st.get('id') == sid), {})


def round_number(spec):
    """The round being built: rounds before + submitted rounds on disk + 1."""
    before = spec.get('rounds_before') if isinstance(spec.get('rounds_before'), int) else 0
    return before + len(earlier_rounds(spec)) + 1


def _steps(spec):
    return [st for st in spec.get('steps') or [] if isinstance(st, dict) and not is_page(st)]


def clean_given(a):
    """His saved answer as the page paints it: everything he said, none of the timing."""
    return {k: v for k, v in (a or {}).items() if k not in GIVEN_DROP}


def step_info(spec, **kw):
    """{step id: info} for a growing deck. info: answered (bool), round, answer, notes, resolved,
    line (the one summary line of the past, for an open topic), story (his answers, oldest first:
    [{round, answer, notes, ticked, rows}]), given (his latest answer exactly as saved, for drawing
    the original card with his pick on it). `_latest` (from the answers files only) and `_last` are private.
    WHY `answered` may be a LIST (round 12: "what about my history over rounds?"): a topic answered in
    several rounds keeps each round's answer, oldest first; entries carry `given`, his saved answer verbatim."""
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
        hand_story = []
        if isinstance(hand, list):
            for h in hand:
                g = h.get('given')
                if isinstance(g, dict):
                    ans, notes = answer_view(st, g)
                else:
                    ans, notes = h.get('answer', ''), list(h.get('notes') or [])
                hand_story.append({'round': h.get('round', ''), 'answer': ans, 'notes': notes, '_a': g if isinstance(g, dict) else None})
        info = {'answered': False}
        if isinstance(hand, dict):
            info.update(answered=True, round=hand.get('round', ''), answer=hand.get('answer', ''), notes=list(hand.get('notes') or []))
            story = story or [{'round': info['round'], 'answer': info['answer'], 'notes': info['notes'], '_a': None}]
        elif hand_story:
            story = hand_story + story
            info.update(answered=True, round=story[-1]['round'], answer=story[-1]['answer'], notes=story[-1]['notes'])
        elif latest and not st.get('reopened'):
            info.update(answered=True, round=latest['round'], answer=latest['answer'], notes=latest['notes'])
        last = story[-1] if story else None
        for s_ in story:
            if s_['_a'] is not None and tickable(st):
                s_['ticked'] = sum(1 for v in row_states(st, s_['_a']).values() if v == 'ok')
                s_['rows'] = len(st.get('calls') or [])
        info['story'] = [{k: v for k, v in s_.items() if k != '_a'} for s_ in story]
        # WHY (Destin, round 11: the answered card must show "how my response differed"): for a tick-or-change list
        # the card says how many rows he ticked; his comments on rows are already in `notes`.
        if last and info['answered'] and last['_a'] is not None:
            info['given'] = clean_given(last['_a'])
            if tickable(st):
                info['ticked'], info['rows'] = last.get('ticked'), last.get('rows')
        line = st.get('reopened') or st.get('past')
        if line and not info['answered']:
            info['line'] = line
        if st.get('resolved') and info['answered']:
            info['resolved'] = st['resolved']
        info['_latest'] = latest
        info['_last'] = last
        out[sid] = info
    return out


def _quote(latest):
    parts = ([latest['answer']] if latest['answer'] else []) + latest['notes']
    words = ' / '.join(parts)
    return words if len(words) <= 140 else words[:137] + '...'


def round_notes(rnd, step_ids):
    """What he said in this round that no answer carries: {key: his words}. Key is a page id (a page comment), a step id (a note on a step he left
    unanswered) or 'general' (the deck-wide note). A picture or file pasted with no words still counts (shown as that)."""
    out = {}
    pics = '(a picture or file, no words)'
    for k, t in (rnd.get('pageNotes') or {}).items():
        if (t or '').strip():
            out[k] = t.strip()
    for k, lst in (rnd.get('pageAttach') or {}).items():
        if lst:
            out.setdefault(k, pics)
    if (rnd.get('notes') or '').strip():
        out['general'] = rnd['notes'].strip()
    elif rnd.get('notesAttach'):
        out['general'] = pics
    for sid, a in rnd['answers'].items():
        if isinstance(a, dict) and not real(a) and (a.get('note') or '').strip():
            out[sid] = a['note'].strip()
    return out


def _ack(spec, key, rounds, i):
    """What was done about his words under `key` in rounds[i], or None when nothing says so.
    A plain line counts unless an EARLIER round also had words under that key (then the line may be about that one: use {"round", "done"})."""
    v = (spec.get('notes_handled') or {}).get(key)
    if isinstance(v, dict):
        return v.get('done') if v.get('round') in (None, rounds[i]['label']) else None
    if isinstance(v, str) and v.strip():
        if any(key in round_notes(r, ()) for r in rounds[:i]):
            return None
        return v
    return None


def handled_view(spec):
    """{page id, step id or 'general': [{round, said, done}]}: his words that were not answers, with what was done, for the page to show."""
    out = {}
    if not is_grows(spec) or not isinstance(spec.get('notes_handled'), dict):
        return out
    rounds = earlier_rounds(spec)
    for key in spec['notes_handled']:
        for i in range(len(rounds) - 1, -1, -1):
            said = round_notes(rounds[i], ()).get(key)
            done = _ack(spec, key, rounds, i) if said else None
            if said and done:
                out.setdefault(key, []).append({'round': rounds[i]['label'], 'said': said, 'done': done})
                break
    return out


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
    # WHY (Destin, round 11: "we're not editing prior sections of the deck once we've gotten to post build"): a deck is AT
    # one stage; a page of an earlier stage is a record, so nothing on it may still be waiting for an answer.
    cur = spec.get('stage')
    if cur in STAGES:
        page = None
        for st in spec.get('steps') or []:
            if not isinstance(st, dict):
                continue
            if is_page(st):
                page = st
                continue
            if page is not None and page.get('stage') in STAGES and STAGES.index(page['stage']) < STAGES.index(cur) \
                    and not st.get('context') and not info[st.get('id')]['answered']:
                errs.append(f'{st.get("id")}: "{st.get("headline", st.get("id"))}" is still open but sits on the {STAGE_NAMES[page["stage"]]} page, '
                            f'an earlier stage than the deck is at ({STAGE_NAMES[cur]}); answer it first, or move it to a {STAGE_NAMES[cur]} page')
    # WHY (Destin, round 11: rows "frequently make references to earlier rounds, external content, etc, that i wouldn't know off the
    # top of my head"): what he is asked to judge must make sense on its own. A topic that is still open may not point at a round or a
    # step id in its title, or in a row's bold line or plain line; where it came from goes behind "more".
    known = known_ids(spec, rounds)

    def cite(where, text, what):
        m = ROUND_CITE.search(text or '') or next((x for x in ID_LIKE.finditer(text or '') if x.group(0).upper() in known), None)
        if m:
            errs.append(f'{where}: {what} says "{m.group(0)}"; say it in plain words here and put where it came from in "more" '
                        f'(he may come back after days and will not remember it)')
    for st in _steps(spec):
        if info[st.get('id')]['answered']:
            continue
        cite(st.get('id'), st.get('headline'), 'the title')
        for c in st.get('calls') or []:
            if isinstance(c, dict):
                cite(f'{st.get("id")}/{c.get("id")}', c.get('call'), 'the bold line')
                cite(f'{st.get("id")}/{c.get("id")}', c.get('why'), 'the plain line')
    # WHY (Destin, round 12: "this is a visual question, but lacks a visual reference"): something he would SEE is judged from a picture, never from words.
    # An open question or row flagged "visual": true must carry a `picture`.
    # WHY (round 12: "what we include in more should be… more similar to our existing context/pros/cons structure"): on an open list he can change, a row's
    # More that exists must be labelled like a question: it needs today, problem or change (a bare string or does/returns/why no longer passes).
    for st in _steps(spec):
        if info[st.get('id')]['answered']:
            continue
        sid = st.get('id')
        if st.get('visual') and not (st.get('picture') or (st.get('options') and all(o.get('picture') for o in st['options'] if isinstance(o, dict)))):
            errs.append(f'{sid}: "{st.get("headline", sid)}" is flagged visual but has no picture; a change he would see is judged from a picture, so add "picture" (a file beside the spec)')
        for c in st.get('calls') or []:
            if not isinstance(c, dict):
                continue
            if c.get('visual') and not c.get('picture'):
                errs.append(f'{sid}/{c.get("id")}: this row is flagged visual but has no picture; add "picture" (and "before" when it changed), or take "visual" off')
            m = c.get('more')
            if tickable(st) and m is not None and not (isinstance(m, dict) and any(m.get(k) for k in ('today', 'problem', 'change'))):
                errs.append(f'{sid}/{c.get("id")}: more on a row he can change is labelled like a question: give it today (what it is now), problem and/or change (what is different now), '
                            f'and pros / cons if they help; a bare line or does/returns/why does not pass')
    for p in spec.get('steps') or []:
        if isinstance(p, dict) and is_page(p):
            cite(p.get('id'), p.get('intro'), 'the page intro')
            cite(p.get('id'), p.get('page'), 'the page name')
    # WHY (code review F3; Destin: nothing he writes may be silently lost): a page comment, the general note or a note on a step he left unanswered
    # is only ever in the dated file, so a rebuild could drop it unseen. The latest round's must each say what was done ("notes_handled").
    if rounds:
        last = len(rounds) - 1
        for key, said in round_notes(rounds[last], ()).items():
            if not _ack(spec, key, rounds, last):
                where = 'the general note' if key == 'general' else f'his note on "{key}"'
                errs.append(f'{key}: {where} in {rounds[last]["label"].lower()} ("{said[:70]}") is not acknowledged; add to "notes_handled": '
                            f'{{"{key}": "what was done about it, in plain words"}} (or "Read; not acted on" if that is true)')
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
    for k in ('rounds_before', 'retired', 'stale_answers', 'notes_handled'):
        if k in spec and not on:
            errors.append(f'{k} belongs on a deck that grows; add "grows": true')
    if on and 'rounds_before' in spec and (not isinstance(spec['rounds_before'], int) or isinstance(spec['rounds_before'], bool) or spec['rounds_before'] < 0):
        errors.append('rounds_before is a whole number: how many separate decks this feature had before this one')
    if on and 'stale_answers' in spec:
        r = spec['stale_answers']
        if not isinstance(r, dict) or not all(isinstance(k, str) and isinstance(v, list) and v and all(isinstance(i, str) for i in v) for k, v in r.items()):
            errors.append('stale_answers is {"<the file\'s submitted time>": ["<step id>", ...]}: answers in that round\'s file that were not said in that round')
    if on and 'notes_handled' in spec:
        r = spec['notes_handled']
        def ok_(v):
            return (isinstance(v, str) and v.strip()) or (isinstance(v, dict) and set(v) <= {'round', 'done'} and isinstance(v.get('done'), str) and v['done'].strip()
                                                         and (v.get('round') is None or isinstance(v['round'], str)))
        if not isinstance(r, dict) or not all(isinstance(k, str) and ok_(v) for k, v in r.items()):
            errors.append('notes_handled is {"<page id, step id or general>": "what was done about his words, one plain line"} (or {"round": "Round 3", "done": "..."})')
    if on and 'retired' in spec:
        r = spec['retired']
        if not isinstance(r, dict) or not all(isinstance(k, str) and isinstance(v, str) and v.strip() for k, v in r.items()):
            errors.append('retired is {"<step id>": "<why it went, one line>"}')
    # WHY (Destin, round 11: "What section of the deck is this on? At what phase of the process would this deck be for?"):
    # a deck that grows says which stage it is AT now; pages of earlier stages are its record.
    cur = spec.get('stage')
    if on and cur not in STAGES:
        errors.append(f'stage is required on a deck that grows: the stage it is at now, one of {", ".join(STAGES)}')
    cur_n = STAGES.index(cur) if on and cur in STAGES else None
    page_stage = None
    for st in steps:
        sid = st.get('id') or 'a step'
        if is_page(st):
            page_stage = st.get('stage')
            if cur_n is not None and page_stage in STAGES and STAGES.index(page_stage) > cur_n:
                errors.append(f'{sid}: this page is the {STAGE_NAMES[page_stage]} stage, later than the deck ({STAGE_NAMES[cur]}); remove it until the deck gets there')
            # WHY (Destin, round 11: opening lines "don't really well explain what the page is or what i'm expected to do with it"):
            # the intro is ONE plain line under the page heading.
            if on and isinstance(st.get('intro'), str) and len(st['intro']) > INTRO_CHARS_MAX:
                errors.append(f'{sid}: the page intro is {len(st["intro"])} characters (max {INTRO_CHARS_MAX}): it is one plain line under the page heading saying what he decides here; '
                              f'anything longer belongs in the rows')
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
        # `visual` marks a question or row whose change he would SEE (checked in problems(): it needs a picture).
        if 'visual' in st and not isinstance(st['visual'], bool):
            errors.append(f'{sid}: visual is true or false')
        for c in st.get('calls') or []:
            if isinstance(c, dict) and 'visual' in c and not isinstance(c['visual'], bool):
                errors.append(f'{sid}/{c.get("id")}: visual is true or false')
        a = st.get('answered')
        if a is not None:
            # WHY a list too (round 12): one entry per round he answered it, oldest first; `given` is his saved answer verbatim.
            for e in (a if isinstance(a, list) else [a]):
                if not isinstance(e, dict) or not isinstance(e.get('round'), str) or not e['round'].strip() \
                        or not (isinstance(e.get('given'), dict) or (isinstance(e.get('answer'), str) and e['answer'].strip())):
                    errors.append(f'{sid}: answered is {{"round": "Round 4", "answer": "Yes", "notes": ["his words"]}}, or a list of {{"round", "given": his saved answer}}, oldest first; round and answer are required text')
                    continue
                if 'notes' in e and (not isinstance(e['notes'], list) or not all(isinstance(n, str) and n.strip() for n in e['notes'])):
                    errors.append(f'{sid}: answered.notes is a list of his words, each as text')
                for k in e:
                    if k not in ('round', 'answer', 'notes', 'given'):
                        errors.append(f'{sid}: answered holds round, answer, notes and given, not "{k}"')
            if isinstance(a, list) and not a:
                errors.append(f'{sid}: answered is a list with at least one round')
        for k, cap in (('reopened', PAST_WORDS_MAX), ('past', PAST_WORDS_MAX), ('resolved', RESOLVED_WORDS_MAX)):
            v = st.get(k)
            if v is None:
                continue
            if not isinstance(v, str) or not v.strip():
                errors.append(f'{sid}: {k} is one plain line')
            elif word_count(v) > cap:
                errors.append(f'{sid}: {k} is {word_count(v)} words (max {cap}); one line, the story opens on request')
        if cur_n is not None and st.get('reopened') is not None and page_stage in STAGES and STAGES.index(page_stage) < cur_n:
            errors.append(f'{sid}: reopened topics live on a {STAGE_NAMES[cur]} page; this one is on an earlier (record) page')
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
        if cur_n is not None and not any(is_page(st) and st.get('stage') == cur for st in steps):
            errors.append(f'the deck is at {STAGE_NAMES[cur]} but has no page of the {STAGE_NAMES[cur]} stage; add one, or move the deck\'s stage')
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
    info = step_info(spec)
    fresh = new_ids(spec, info)
    # WHY `new` only when true: an unchanged topic's data stays exactly as it was.
    return {sid: {**{k: v for k, v in i.items() if not k.startswith('_')}, **({'new': True} if sid in fresh else {})} for sid, i in info.items()}
