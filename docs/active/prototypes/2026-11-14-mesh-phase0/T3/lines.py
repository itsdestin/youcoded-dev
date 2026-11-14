#!/usr/bin/env python3
# Summarise a transcript: one row per line (index, type/subtype, uuid8, parentUuid8, cwd tail, selected keys). No chat text printed.
import json,sys
for i,l in enumerate(open(sys.argv[1],encoding='utf8')):
    o=json.loads(l); m=o.get('message') or {}
    c=m.get('content') if isinstance(m,dict) else None
    kinds=[b.get('type') for b in c] if isinstance(c,list) else ('str' if isinstance(c,str) else '')
    att=(o.get('attachment') or {}).get('type')
    print(i,o.get('type'),o.get('subtype') or att or '',(o.get('uuid') or '')[:8],(o.get('parentUuid') or '')[:8],'sid='+(o.get('sessionId') or '')[:8],'cwd=…'+(o.get('cwd') or '')[-14:],kinds,(m.get('stop_reason') if isinstance(m,dict) else ''))
