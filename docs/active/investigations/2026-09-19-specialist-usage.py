#!/usr/bin/env python3
"""Per-run token/dollar usage for YouCoded native specialists and Claude Code subagents.
Read-only: reads ~/.youcoded/sessions and ~/.claude/projects; writes CSV to scratchpad."""
import json, os, glob, re, csv, sys, statistics
from collections import defaultdict

S = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.expanduser('~')
CC_SAMPLE = int(sys.argv[1]) if len(sys.argv) > 1 else 400

# ---- price table: OpenRouter list prices from the app's cached catalog (USD/token)
cat = json.load(open(os.path.join(S, 'catalog-main.json')))
orl = cat['openrouter']['data'] if isinstance(cat['openrouter'], dict) else cat['openrouter']
PRICE = {}
for m in orl:
    p = m.get('pricing') or {}
    f = lambda k: float(p[k]) if p.get(k) not in (None, '') else None
    PRICE[m['id']] = dict(inp=f('prompt'), out=f('completion'), cr=f('input_cache_read'),
                          cw=f('input_cache_write'), cw1h=f('input_cache_write_1h'))

def price_id(provider, model):
    if provider == 'local':
        return None
    if provider == 'chatgpt':
        return 'openai/' + model  # subscription; priced at OpenRouter list for comparison
    if provider == 'anthropic-cc':
        m = re.sub(r'-\d{8}$', '', model)            # strip date suffix
        m = re.sub(r'(\d+)-(\d+)$', r'\1.\2', m)       # 4-5 -> 4.5
        return 'anthropic/' + m
    return model

def dollars(pid, uncached, cread, cwrite, out, cwrite1h=0):
    p = PRICE.get(pid) if pid else None
    if not p or p['inp'] is None:
        return None
    cr = p['cr'] if p['cr'] is not None else p['inp']
    cw = p['cw'] if p['cw'] is not None else p['inp']
    cw1h = p['cw1h'] if p['cw1h'] is not None else cw
    return uncached * p['inp'] + cread * cr + cwrite * cw + cwrite1h * cw1h + out * p['out']

rows = []

# ---- YouCoded native specialists
ledger = {}
for lf in glob.glob(f'{HOME}/.youcoded/sessions/*/*.delegations.json'):
    try:
        for r in json.load(open(lf)).get('delegations', []):
            ledger[r['childId']] = r
    except Exception:
        pass
plan_text = ''
for pf in glob.glob(f'{HOME}/.youcoded/sessions/*/*.plans.json'):
    plan_text += open(pf, errors='replace').read()

for f in glob.glob(f'{HOME}/.youcoded/sessions/*/*.jsonl'):
    try:
        with open(f, errors='replace') as fh:
            head = json.loads(fh.readline())
            if head.get('sessionKind') != 'specialist':
                continue
            b = head.get('binding') or {}
            inp = out = cr = cw = 0; peak = 0; turns = 0; cost_rec = 0.0; cost_ok = True; groups = 0; prev = None
            for line in fh:
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                t = d.get('type')
                if t in ('assistant-thinking', 'assistant-text', 'tool-use') and prev not in ('assistant-thinking', 'assistant-text', 'tool-use'):
                    groups += 1  # one model response (step) begins
                if t: prev = t
                u = (d.get('data') or {}).get('usage') if t != 'tool-result' else None
                if isinstance(u, dict) and 'inputTokens' in u:
                    turns += 1
                    inp += u.get('inputTokens', 0); out += u.get('outputTokens', 0)
                    cr += u.get('cacheReadTokens', 0); cw += u.get('cacheCreationTokens', 0)
                    peak = max(peak, u.get('contextUsedTokens') or 0)
                    if isinstance(u.get('costUsd'), (int, float)): cost_rec += u['costUsd']
                    else: cost_ok = False
    except Exception:
        continue
    cid = os.path.basename(f)[:-6]
    L = ledger.get(cid, {})
    steps = L.get('steps') or groups
    pid = price_id(b.get('providerId'), b.get('modelId', ''))
    crc = min(cr, inp); cwc = min(cw, inp - crc); unc = inp - crc - cwc
    rows.append(dict(source='youcoded', type=head.get('agentType'), id=cid, model=f"{b.get('providerId')}:{b.get('modelId')}",
        requests=steps, turns=turns, uncached_in=unc, cache_read=crc, cache_write=cwc, output=out,
        peak_ctx=peak, raw_total=inp + out, billed_equiv=round(unc + cwc + 0.1 * crc + out),
        usd_list=dollars(pid, unc, crc, cwc, out), usd_recorded=(round(cost_rec, 5) if cost_ok and turns else None),
        in_plan=int(cid in plan_text), status=L.get('status', ''), date=head.get('createdAt', ''),
        task=(L.get('description') or head.get('title') or '')[:90]))

# ---- Claude Code subagents (most recent N)
cc = sorted(glob.glob(f'{HOME}/.claude/projects/*/*/subagents/*.jsonl'), key=os.path.getmtime, reverse=True)[:CC_SAMPLE]
for f in cc:
    meta = {}
    mp = f[:-6] + '.meta.json'
    if os.path.exists(mp):
        try: meta = json.load(open(mp))
        except Exception: pass
    reqs = {}; model = None; first_task = ''
    with open(f, errors='replace') as fh:
        for line in fh:
            try: d = json.loads(line)
            except Exception: continue
            if not first_task and d.get('type') == 'user':
                c = d.get('message', {}).get('content')
                first_task = (c if isinstance(c, str) else json.dumps(c))[:90]
            m = d.get('message') or {}
            u = m.get('usage')
            if d.get('type') == 'assistant' and u:
                if m.get('model') == '<synthetic>': continue
                model = m.get('model') or model
                reqs[d.get('requestId') or d.get('uuid')] = u   # same request repeated per content block
    if not reqs: continue
    unc = sum(u.get('input_tokens', 0) for u in reqs.values())
    crd = sum(u.get('cache_read_input_tokens', 0) for u in reqs.values())
    cwt = sum(u.get('cache_creation_input_tokens', 0) for u in reqs.values())
    cw1h = sum((u.get('cache_creation') or {}).get('ephemeral_1h_input_tokens', 0) for u in reqs.values())
    out = sum(u.get('output_tokens', 0) for u in reqs.values())
    peak = max(u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0) for u in reqs.values())
    pid = price_id('anthropic-cc', model or '')
    rows.append(dict(source='claude-code', type=meta.get('agentType', 'unknown'), id=os.path.basename(f)[:-6], model=model,
        requests=len(reqs), turns='', uncached_in=unc, cache_read=crd, cache_write=cwt, output=out, peak_ctx=peak,
        raw_total=unc + crd + cwt + out, billed_equiv=round(unc + cwt + 0.1 * crd + out),
        usd_list=dollars(pid, unc, crd, cwt - cw1h, out, cw1h), usd_recorded=None, in_plan=0, status='',
        date=os.path.getmtime(f), task=(meta.get('description') or first_task)[:90]))

cols = list(rows[0].keys())
with open(os.path.join(S, 'specialist_runs.csv'), 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); w.writerows(rows)

def pct(v, q):
    v = sorted(v); k = (len(v) - 1) * q; lo = int(k); hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)

def fmt(x, usd=False):
    if usd: return f'${x:.3f}' if x < 10 else f'${x:.1f}'
    return f'{x/1000:.0f}k' if x < 1e6 else f'{x/1e6:.2f}M'

def summarize(key, label):
    g = defaultdict(list)
    for r in rows: g[key(r)].append(r)
    print(f'\n## {label}')
    print('group | n | reqs p50/p90 | raw p50/p75/p90/max | billed-eq p50/p75/p90/max | peak ctx p50/p90/max | $ p50/p75/p90/max (n priced)')
    for k in sorted(g, key=lambda k: (-len(g[k]), str(k))):
        rs = g[k]
        if len(rs) < 2 and label.startswith('by model'): continue
        rq = [r['requests'] or 0 for r in rs]
        raw = [r['raw_total'] for r in rs]; be = [r['billed_equiv'] for r in rs]; pk = [r['peak_ctx'] for r in rs]
        usd = [r['usd_list'] for r in rs if r['usd_list'] is not None]
        s = f"{k} | {len(rs)} | {pct(rq,.5):.0f}/{pct(rq,.9):.0f} | " + '/'.join(fmt(pct(raw,q)) for q in (.5,.75,.9,1)) + ' | ' + \
            '/'.join(fmt(pct(be,q)) for q in (.5,.75,.9,1)) + ' | ' + '/'.join(fmt(pct(pk,q)) for q in (.5,.9,1))
        s += ' | ' + ('/'.join(fmt(pct(usd,q), True) for q in (.5,.75,.9,1)) + f' ({len(usd)})' if usd else 'n/a')
        print(s)

summarize(lambda r: (r['source'], r['type']), 'by source x type')
summarize(lambda r: r['source'], 'by source')
summarize(lambda r: (r['source'], r['model']), 'by model (n>=2)')
yc = [r for r in rows if r['source'] == 'youcoded']
print('\nyoucoded in_plan runs:', sum(r['in_plan'] for r in yc), '| with nonzero usage:', sum(1 for r in yc if r['raw_total'] > 0), '/', len(yc))
print('\nTop 8 by billed-equiv:')
for r in sorted(rows, key=lambda r: -r['billed_equiv'])[:8]:
    print(r['source'], r['type'], r['model'], r['requests'], fmt(r['raw_total']), fmt(r['billed_equiv']), r['usd_list'] and round(r['usd_list'], 2), '|', r['task'])
print('\nTop 6 youcoded by billed-equiv:')
for r in sorted(yc, key=lambda r: -r['billed_equiv'])[:6]:
    print(r['type'], r['model'], r['requests'], fmt(r['raw_total']), fmt(r['billed_equiv']), r['usd_list'] and round(r['usd_list'], 3), r['usd_recorded'], '|', r['task'])
