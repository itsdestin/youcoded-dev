# Appended analyses (exec'd inside measure.py; shares rows/fu/out/explained/gapb)
def evt_table(title, base, provider):
    out(f'\n## {title}')
    out('| event | turns | chats | full-miss | miss% | input from cache % |')
    out('|---|---|---|---|---|---|')
    plain = lambda r: not (r['switch'] or r['compact'] or r['rebuild'] or r['resumed'])
    evs = [('all follow-ups', lambda r: True), ('model switch', lambda r: r['switch']), ('after compaction/clear', lambda r: r['compact']),
           ('expectedRebuild flag', lambda r: r['rebuild']),
           ('first turn after app launch, gap<30m', lambda r: r['resumed'] is True and r['gap_s'] < 1800),
           ('first turn after app launch, gap>=30m', lambda r: r['resumed'] is True and r['gap_s'] >= 1800),
           ('turn that ran a helper (Task), no other event', lambda r: plain(r) and r['task'] > 0 and r['gap_s'] < 300),
           ('turn without helper, no other event, gap<5m', lambda r: plain(r) and r['task'] == 0 and r['gap_s'] < 300)]
    evs += [(f'gap {b}, no other event', (lambda b: lambda r: plain(r) and gapb(r['gap_s']) == b)(b)) for b in ['<5m', '5-60m', '>1h']]
    for name, f in evs:
        rs = [r for r in base if r['gap_s'] is not None and f(r)]
        if not rs: continue
        m = [r for r in rs if r['miss'] is not None]
        I = sum(r['I'] for r in rs); R = sum(r['R'] for r in rs)
        out(f"| {name} | {len(rs)} | {len({r['chat'] for r in rs})} | {sum(r['miss'] for r in m)}/{len(m)} | {round(100*sum(r['miss'] for r in m)/len(m)) if m else '-'} | {round(100*R/I) if I else '-'} |")

or_cur = [r for r in fu if r['provider'] == 'openrouter' and r['era'] != 'pre']
or_pre = [r for r in fu if r['provider'] == 'openrouter' and r['era'] == 'pre']
evt_table('OpenRouter since #464 reached the app (2026-09-11), follow-ups', or_cur, 'openrouter')
evt_table('OpenRouter BEFORE #464 (no session_id, no Anthropic markers), follow-ups', or_pre, 'openrouter')
evt_table('ChatGPT post era (>= 2026-09-25), follow-ups', [r for r in fu if r['provider']=='chatgpt' and r['era']=='post'], 'chatgpt')
evt_table('Anthropic (direct, custom provider) all, follow-ups', [r for r in fu if r['provider']=='anthropic'], 'anthropic')
evt_table('Local since 2026-09-11 (cache_n recorded), follow-ups', [r for r in fu if r['provider']=='local' and r['era']!='pre'], 'local')

out('\n## OpenRouter per model, since 2026-09-11 vs before (follow-ups)')
out('| model | slice | turns | chats | any cache read | input from cache % | full-miss | unexplained miss (gap<5m, same model, no event) |')
out('|---|---|---|---|---|---|---|---|')
for sl, base in [('since 09-11', or_cur), ('before', or_pre)]:
    bym = collections.defaultdict(list)
    for r in base: bym[r['model']].append(r)
    for mdl, rs in sorted(bym.items(), key=lambda kv: -len(kv[1])):
        if len(rs) < 8: continue
        m = [r for r in rs if r['miss'] is not None]
        pool = [r for r in m if not explained(r)]
        I = sum(r['I'] for r in rs); R = sum(r['R'] for r in rs)
        out(f"| {mdl} | {sl} | {len(rs)} | {len({r['chat'] for r in rs})} | {sum(1 for r in rs if r['R']>0)}/{len(rs)} | {round(100*R/I) if I else '-'} | {sum(r['miss'] for r in m)}/{len(m)} | {sum(r['miss'] for r in pool)}/{len(pool)} |")

out('\nModels with follow-ups but never any cache read (excluded from unexplained counts): ' + str(sorted({(r['provider'], r['model']) for r in fu if r['model'] not in CACHING})))
out('\n## Cost of unexplained full misses (extra full-price input tokens), per 100 follow-ups')
out('| provider | slice | follow-ups | eligible (detector usable, no explaining event) | unexplained misses | rate | extra full-price tokens / 100 follow-ups | same, as % of all input |')
out('|---|---|---|---|---|---|---|---|')
for p, sl, base in [('chatgpt','post',[r for r in fu if r['provider']=='chatgpt' and r['era']=='post']),
                    ('openrouter','since 09-11',or_cur),('openrouter','before 09-11',or_pre),
                    ('anthropic','all',[r for r in fu if r['provider']=='anthropic']),
                    ('local','since 09-11',[r for r in fu if r['provider']=='local' and r['era']!='pre'])]:
    pool = [r for r in base if r['miss'] is not None and not explained(r)]
    un = [r for r in pool if r['miss']]
    ex = sum(r['excess'] for r in un); I = sum(r['I'] for r in base)
    if base: out(f"| {p} | {sl} | {len(base)} | {len(pool)} | {len(un)} | {round(100*len(un)/len(pool)) if pool else '-'}% | {round(100*ex/len(base)):,} | {round(100*ex/I,1) if I else '-'}% |")

# ChatGPT request-level ground truth from the diagnostics file
out('\n## ChatGPT request-level diagnostics (private-diagnostics/chatgpt-cache/requests*.jsonl)')
D = os.path.expanduser('~/.config/youcoded/private-diagnostics/chatgpt-cache')
reqs = []
for fn in ['requests.previous.jsonl', 'requests.jsonl']:
    for line in open(os.path.join(D, fn)):
        try: o = json.loads(line)
        except Exception: continue
        if o.get('version') == 1 and 'laneId' in o: reqs.append(o)
reqs.sort(key=lambda o: o['timestamp'])
out(f"records {len(reqs)}, {datetime.datetime.fromtimestamp(reqs[0]['timestamp']/1000,TZ).date()}..{datetime.datetime.fromtimestamp(reqs[-1]['timestamp']/1000,TZ).date()}")
seen_lane = set()
tab = collections.defaultdict(lambda: [0, 0, 0, 0])  # n, miss, input, cached
for o in reqs:
    if o['outcome'] != 'success' or o['inputTokens'] is None or o['cachedInputTokens'] is None: 
        if o['change'] == 'baseline': seen_lane.add(o['laneId'])
        continue
    e = era(o['timestamp'])
    kind = o['change']
    if kind == 'baseline': kind = 'baseline (lane seen before = reopen/restart)' if o['laneId'] in seen_lane else 'baseline (new lane)'
    seen_lane.add(o['laneId'])
    if o['inputTokens'] < 2048: continue
    miss = o['cachedInputTokens'] < 0.5 * o['inputTokens']
    for k in [(e, o['purpose'], kind), (e, o['purpose'], 'ALL')]:
        t = tab[k]; t[0] += 1; t[1] += miss; t[2] += o['inputTokens']; t[3] += o['cachedInputTokens']
out('| era | purpose | prefix change vs previous request in lane | requests | miss (<50% cached) | miss% | input from cache % |')
out('|---|---|---|---|---|---|---|')
for k in sorted(tab):
    n, m, I, R = tab[k]
    if n >= 3: out(f"| {k[0]} | {k[1]} | {k[2]} | {n} | {m} | {round(100*m/n)} | {round(100*R/I)} |")
