#!/usr/bin/env python3
"""Exploratory, blinded final-answer ratings through the SAME budget gate. Never takes an API key."""
import argparse
import json
from pathlib import Path
import random
import urllib.request


def validate_scores(scores, answers):
    if not isinstance(scores,list) or len(scores)!=len(answers): raise ValueError('Incomplete judge response')
    seen=set()
    for score in scores:
        identity=score.get('id')
        if identity not in answers or identity in seen: raise ValueError('Unknown or duplicate answer ID')
        seen.add(identity)
        for key in ('clarity','concision'):
            if type(score.get(key)) is not int or not 1<=score[key]<=5: raise ValueError('Invalid score')
        quote=score.get('quote')
        if not isinstance(quote,str) or not quote.strip() or quote not in answers[identity]: raise ValueError('Ungrounded quote')
        if not isinstance(score.get('rationale'),str) or not score['rationale'].strip(): raise ValueError('Missing rationale')
    return scores


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study',type=Path,required=True)
    parser.add_argument('--rubric',type=Path,required=True)
    parser.add_argument('--gate-url',required=True)
    parser.add_argument('--token-file',type=Path,required=True)
    args=parser.parse_args()
    token=args.token_file.read_text().strip()
    if not token.startswith('yc-gate-'): raise ValueError('Only an opaque gate token is accepted')
    study=json.loads((args.study/'comparison.json').read_text())
    rubric=args.rubric.read_text()
    output=args.study/'communication-ratings.json'
    if output.exists(): raise ValueError('Refusing to overwrite prior ratings')
    record={'rubric':'communication-v1','judge':'claude-haiku-5-5',
            'kind':'exploratory LLM ratings; not human-calibrated','grades':[],'failures':[]}
    for task in study['protocol']['tasks']:
        rows=[r for r in study['trials'] if r['task']==task and r.get('finalAnswer')]
        if not rows: continue
        instruction=(args.study/'tasks'/task/'instruction.md').read_text()
        for repetition in range(2):
            order=list(rows); random.Random(f'{task}-{repetition}-148').shuffle(order)
            key={f'A{i+1}':r for i,r in enumerate(order)}
            payload={'model':'claude-haiku-5-5','max_tokens':4096,'stream':False,
                     'system':rubric, 'messages':[{'role':'user','content':json.dumps({
                         'task':instruction,'answers':[{'id':k,'answer':r['finalAnswer']} for k,r in key.items()]})}]}
            request=urllib.request.Request(args.gate_url.rstrip('/')+'/v1/messages',
                data=json.dumps(payload).encode(),headers={'x-api-key':token,'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(request,timeout=120) as response: raw=json.load(response)
                text=''.join(c.get('text','') for c in raw.get('content',[]) if c.get('type')=='text').strip()
                if text.startswith('```'):
                    text='\n'.join(text.splitlines()[1:-1])
                scores=validate_scores(json.loads(text),{k:r['finalAnswer'] for k,r in key.items()})
                record['grades'].extend({**g,'trialId':key[g['id']]['id'],'agent':key[g['id']]['agent'],
                                         'task':task,'judgeRepetition':repetition} for g in scores)
            except Exception as error:
                # Preserve failed grades as missing; never retry until a favorable score appears.
                record['failures'].append({'task':task,'judgeRepetition':repetition,'error':str(error)})
            output.write_text(json.dumps(record,indent=2)+'\n'); output.chmod(0o600)
    print(f"Saved {len(record['grades'])} grades; {len(record['failures'])} failed judging calls. Not human-calibrated.")

if __name__=='__main__': main()
