#!/usr/bin/env python3
"""Read-only cache measurement over ~/.youcoded/sessions (no message text is read out or printed).

Per follow-up turn (2nd+ turn-complete of a chat) we compute:
  I  = usage.inputTokens  (whole prompt, summed over every step of the turn)
  R  = usage.cacheReadTokens, W = usage.cacheCreationTokens (summed over steps)
  prevCtx = previous turn's usage.contextUsedTokens (= last step prompt + output of that turn)
  growth  = max(0, thisCtx - prevCtx)  -> tokens that were genuinely new during this turn
  excess  = (I - R) - growth  -> full-price input beyond what new content explains
  missTurn: excess >= 0.5 * prevCtx and prevCtx >= 2048  (at least one step re-read the
            whole earlier conversation at full price; usually the turn's first step)
Events between prev turn and this one: model switch, compact-summary/context-clear,
expectedRebuild flag, user-interrupt, app launch (journal, from 2026-10-20 only), idle gap.
"""
import json, glob, os, sys, collections, datetime, csv

SESS = os.path.expanduser('~/.youcoded/sessions')
OUT = os.path.dirname(os.path.abspath(__file__))
TZ = datetime.timezone(datetime.timedelta(hours=-7))
def ms(s): return int(datetime.datetime.fromisoformat(s).timestamp() * 1000)
ERA_MID = ms('2026-09-11T18:56:28-07:00')   # beta.80 installed (#461, #464)
ERA_POST = ms('2026-09-25T14:06:19-07:00')  # beta.89 installed (#553, #554, #559)
TODAY = ms('2026-09-30T00:00:00-07:00')     # "today" window: last ~6 weeks
JOURNAL_FROM = ms('2026-10-20T04:35:02-07:00')
_lf = os.path.join(OUT, 'app-launches.txt')
launches = sorted(ms(l.strip()) for l in open(_lf) if l.strip()) if os.path.exists(_lf) else []

def provider_of(model, hdr_provider):
    m = model or ''
    if '/' in m or m.startswith('~'): return 'openrouter'
    if m.startswith('claude-'): return 'anthropic'
    # Bare gpt-* ids are ChatGPT-plan ids; OpenRouter ids always carry a vendor prefix.
    # (The header binding is only the chat's FIRST provider; a mid-chat switch is not recorded there.)
    if m.startswith('gpt-'): return 'chatgpt'
    if hdr_provider == 'local' or '-Q' in m or 'UD-' in m: return 'local'
    return hdr_provider or 'unknown'

def era(ts):
    return 'pre' if ts < ERA_MID else ('mid' if ts < ERA_POST else 'post')

rows = []
for f in glob.glob(os.path.join(SESS, '*', '*.jsonl')):
    hdr = None; evs = []
    with open(f, errors='replace') as fh:
        for line in fh:
            try: o = json.loads(line)
            except Exception: continue
            if hdr is None: hdr = o; continue
            evs.append(o)
    if not hdr: continue
    hp = (hdr.get('binding') or {}).get('providerId')
    is_child = bool(hdr.get('parentSessionId'))
    chat = os.path.basename(f)[:-6]
    prev = None; ti = 0
    pending = dict(compact=False, clear=False, interrupt=False, start=None, task=0)
    for o in evs:
        t = o.get('type'); ts = o.get('timestamp') or 0
        if t == 'compact-summary': pending['compact'] = True
        elif t == 'context-clear': pending['clear'] = True
        elif t == 'user-interrupt': pending['interrupt'] = True; pending['start'] = None
        elif t == 'user-message' and pending['start'] is None: pending['start'] = ts
        elif t == 'tool-use' and (o.get('data') or {}).get('toolName') == 'Task': pending['task'] += 1
        elif t == 'turn-complete':
            d = o.get('data') or {}; u = d.get('usage') or {}
            I = u.get('inputTokens') or 0; R = u.get('cacheReadTokens') or 0; W = u.get('cacheCreationTokens') or 0
            ctx = u.get('contextUsedTokens')
            prov = provider_of(d.get('model'), hp)
            r = dict(chat=chat, child=is_child, idx=ti, ts=ts, era=era(ts), today=ts >= TODAY, provider=prov,
                     model=d.get('model'), servedBy=','.join(u.get('servedBy') or []) or None, servedChanged=None, I=I, R=R, W=W, ctx=ctx, rebuild=bool(u.get('expectedRebuild')),
                     prevCtx=None, gap_s=None, switch=False, compact=pending['compact'] or pending['clear'],
                     interrupt=pending['interrupt'], task=pending['task'], resumed=None, excess=None, miss=None)
            if prev is not None:
                r['prevCtx'] = prev['ctx']
                start = pending['start'] or ts
                r['gap_s'] = max(0, (start - prev['ts']) / 1000)
                r['switch'] = d.get('model') != prev['model']
                # Card #69: only turns recorded after the serving-company logging shipped carry this.
                if r['servedBy'] and prev['servedBy']: r['servedChanged'] = r['servedBy'] != prev['servedBy']
                if prev['ts'] >= JOURNAL_FROM:
                    r['resumed'] = any(prev['ts'] < L < start for L in launches)
                pc = prev['ctx']
                if pc and ctx and I:
                    growth = max(0, ctx - pc)
                    r['excess'] = max(0, (I - R) - growth)
                    r['miss'] = (pc >= 2048) and r['excess'] >= 0.5 * pc
            rows.append(r)
            prev = r; ti += 1
            pending = dict(compact=False, clear=False, interrupt=False, start=None, task=0)

with open(os.path.join(OUT, 'turns.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

CACHING = {r['model'] for r in rows if r['R'] > 0}
TTL = {'openrouter': 300, 'anthropic': 300, 'chatgpt': 1800, 'local': 900}
def explained(r):
    if r['model'] not in CACHING: return True   # provider never reports cache reads for this model: unknown, not drift
    if r['switch'] or r['compact'] or r['rebuild'] or r['resumed']: return True
    return r['gap_s'] is not None and r['gap_s'] > TTL.get(r['provider'], 300)

def gapb(g):
    return '<5m' if g < 300 else ('5-60m' if g < 3600 else '>1h')

def agg(rs):
    n = len(rs); I = sum(r['I'] for r in rs); R = sum(r['R'] for r in rs)
    hit = sum(1 for r in rs if r['R'] >= 1024 or (r['I'] and r['R'] >= 0.5 * r['I']))
    m = [r for r in rs if r['miss'] is not None]
    return dict(n=n, chats=len({r['chat'] for r in rs}), hitTurns=f"{hit}/{n}" if n else '-',
                hitPct=round(100 * hit / n) if n else None, cachedInPct=round(100 * R / I) if I else None,
                missTurns=f"{sum(r['miss'] for r in m)}/{len(m)}", missPct=round(100 * sum(r['miss'] for r in m) / len(m)) if m else None)

lines = []
def out(s=''): lines.append(s); print(s)
fu = [r for r in rows if r['idx'] >= 1 and not r['child']]
out('# Cache measurement (main chats; follow-up turns = turn index >= 1)')
allmain = [r for r in rows if not r['child']]
for p in sorted({r['provider'] for r in rows}):
    rs = [r for r in allmain if r['provider'] == p]
    if rs:
        out(f"{p}: main chats {len({r['chat'] for r in rs})}, turns {len(rs)}, "
            f"{datetime.datetime.fromtimestamp(min(r['ts'] for r in rs)/1000, TZ).date()}..{datetime.datetime.fromtimestamp(max(r['ts'] for r in rs)/1000, TZ).date()}")
out()
out('## Follow-up turns by provider x era (and today = since 2026-09-30)')
out('| provider | slice | turns | chats | hit turns | hit% | input from cache % | full-miss turns | miss% |')
out('|---|---|---|---|---|---|---|---|---|')
for p in ['chatgpt', 'openrouter', 'local', 'anthropic']:
    for sl, f in [('pre', lambda r: r['era'] == 'pre'), ('mid', lambda r: r['era'] == 'mid'), ('post', lambda r: r['era'] == 'post'), ('today', lambda r: r['today'])]:
        rs = [r for r in fu if r['provider'] == p and f(r)]
        if not rs: continue
        a = agg(rs)
        out(f"| {p} | {sl} | {a['n']} | {a['chats']} | {a['hitTurns']} | {a['hitPct']} | {a['cachedInPct']} | {a['missTurns']} | {a['missPct']} |")
out()
out('## Events, post-fix era (>= 2026-09-25), follow-up turns')
out('| provider | event | turns | full-miss | miss% | input from cache % |')
out('|---|---|---|---|---|---|')
for p in ['chatgpt', 'openrouter', 'local', 'anthropic']:
    base = [r for r in fu if r['provider'] == p and r['era'] == 'post']
    if not base: continue
    plain = lambda r: not (r['switch'] or r['compact'] or r['rebuild'] or r['resumed'])
    evs = [('model switch', lambda r: r['switch']), ('after compaction/clear', lambda r: r['compact']),
           ('expectedRebuild flag', lambda r: r['rebuild']), ('first turn after app launch (since 10-20)', lambda r: r['resumed'] is True),
           ('no app launch between (since 10-20)', lambda r: r['resumed'] is False and plain(r))]
    evs += [(f'gap {b}, no other event', (lambda b: lambda r: plain(r) and r['gap_s'] is not None and gapb(r['gap_s']) == b)(b)) for b in ['<5m', '5-60m', '>1h']]
    for name, f in evs:
        rs = [r for r in base if f(r)]
        m = [r for r in rs if r['miss'] is not None]
        if not rs: continue
        I = sum(r['I'] for r in rs); R = sum(r['R'] for r in rs)
        out(f"| {p} | {name} | {len(rs)} | {sum(r['miss'] for r in m)}/{len(m)} | {round(100*sum(r['miss'] for r in m)/len(m)) if m else '-'} | {round(100*R/I) if I else '-'} |")
out()
out('## OpenRouter per model, post era, follow-up turns (models with >= 10 follow-ups)')
out('| model | turns | chats | turns with any cache read | input from cache % | full-miss | unexplained full-miss (gap<5m, same model, no event) | per-100 unexplained excess tokens |')
out('|---|---|---|---|---|---|---|---|')
orr = [r for r in fu if r['provider'] == 'openrouter' and r['era'] == 'post']
bym = collections.defaultdict(list)
for r in orr: bym[r['model']].append(r)
for mdl, rs in sorted(bym.items(), key=lambda kv: -len(kv[1])):
    if len(rs) < 10: continue
    m = [r for r in rs if r['miss'] is not None]
    unexp_pool = [r for r in m if not explained(r)]
    un = [r for r in unexp_pool if r['miss']]
    I = sum(r['I'] for r in rs); R = sum(r['R'] for r in rs)
    anyR = sum(1 for r in rs if r['R'] > 0)
    ex = sum(r['excess'] for r in un)
    out(f"| {mdl} | {len(rs)} | {len({r['chat'] for r in rs})} | {anyR}/{len(rs)} | {round(100*R/I) if I else '-'} | {sum(r['miss'] for r in m)}/{len(m)} | {len(un)}/{len(unexp_pool)} | {round(100*ex/len(rs)) if rs else '-'} |")
out()
out('## Unexplained full misses per provider (post era): same model, no compaction/rebuild/launch, gap under provider TTL')
out('| provider | eligible follow-ups | unexplained full misses | rate | extra full-price input tokens per 100 follow-ups | median prevCtx of those |')
out('|---|---|---|---|---|---|')
for p in ['chatgpt', 'openrouter', 'local', 'anthropic']:
    rs = [r for r in fu if r['provider'] == p and r['era'] == 'post' and r['miss'] is not None and not explained(r)]
    allp = [r for r in fu if r['provider'] == p and r['era'] == 'post']
    un = [r for r in rs if r['miss']]
    if not rs: continue
    ex = sum(r['excess'] for r in un)
    pcs = sorted(r['prevCtx'] for r in un)
    out(f"| {p} | {len(rs)} | {len(un)} | {round(100*len(un)/len(rs))}% | {round(100*ex/len(allp))} | {pcs[len(pcs)//2] if pcs else '-'} |")
out()
# reporting check: follow-ups where cache read is always zero per provider/model
out('## Turns reporting zero cache read (all eras, follow-ups with I>=4096)')
for p in ['chatgpt', 'openrouter', 'local', 'anthropic']:
    rs = [r for r in fu if r['provider'] == p and r['I'] >= 4096]
    if rs: out(f"{p}: {sum(1 for r in rs if r['R'] == 0)}/{len(rs)} zero-read; with write>0: {sum(1 for r in rs if r['W'] > 0)}")
zero_models = [(m, len(rs)) for m, rs in bym.items() if all(r['R'] == 0 for r in rs)]
out(f"OpenRouter post-era models whose follow-ups never reported a cache read: {sorted(zero_models, key=lambda x: -x[1])}")
# specialists
ch = [r for r in rows if r['child']]
out(f"\nSpecialist child sessions: {len({r['chat'] for r in ch})} sessions, {len(ch)} turns, of which follow-ups {sum(1 for r in ch if r['idx']>=1)}; first-turn input from cache %: "
    f"{round(100*sum(r['R'] for r in ch if r['idx']==0)/max(1,sum(r['I'] for r in ch if r['idx']==0)))}")
for p in ['chatgpt', 'openrouter', 'local', 'anthropic']:
    c0 = [r for r in ch if r['idx'] == 0 and r['provider'] == p and r['era'] == 'post']
    if c0: out(f"  {p} specialist first turns (post): {len(c0)}, input from cache {round(100*sum(r['R'] for r in c0)/max(1,sum(r['I'] for r in c0)))}%")
# Card #69 (2026-11-12): misses by serving company. Empty until the app has run a while with
# the servedBy logging (turn-complete usage.servedBy, OpenRouter only).
out()
out('## OpenRouter follow-ups by serving company (only turns that recorded one)')
sv = [r for r in fu if r['provider'] == 'openrouter' and r['servedBy']]
if not sv:
    out('No turns carry a serving company yet.')
else:
    out('| serving company | follow-ups | full-miss | miss% | input from cache % |')
    out('|---|---|---|---|---|')
    byc = collections.defaultdict(list)
    for r in sv: byc[r['servedBy']].append(r)
    for c, rs in sorted(byc.items(), key=lambda kv: -len(kv[1])):
        m = [r for r in rs if r['miss'] is not None]; I = sum(r['I'] for r in rs); R = sum(r['R'] for r in rs)
        out(f"| {c} | {len(rs)} | {sum(r['miss'] for r in m)}/{len(m)} | {round(100*sum(r['miss'] for r in m)/len(m)) if m else '-'} | {round(100*R/I) if I else '-'} |")
    out()
    out('| company changed since previous turn? | follow-ups | full-miss | miss% |')
    out('|---|---|---|---|')
    for lab, val in [('yes', True), ('no', False)]:
        rs = [r for r in sv if r['servedChanged'] is val and r['miss'] is not None]
        if rs: out(f"| {lab} | {len(rs)} | {sum(r['miss'] for r in rs)}/{len(rs)} | {round(100*sum(r['miss'] for r in rs)/len(rs))} |")
exec(open(os.path.join(OUT, 'extra.py')).read())
open(os.path.join(OUT, 'tables.md'), 'w').write('\n'.join(lines) + '\n')
