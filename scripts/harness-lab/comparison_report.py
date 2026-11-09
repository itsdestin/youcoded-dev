#!/usr/bin/env python3
"""Offline common-transport report; never reads credentials or calls a model."""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import random
import statistics


def gate_totals(rows):
    complete = bool(rows) and all(r.get('usageComplete') for r in rows)
    usage = [r['usage'] for r in rows if r.get('usageComplete')]
    input_tokens = sum(u['inputTokens']+u['cacheCreationInputTokens']+u['cacheReadInputTokens'] for u in usage)
    output = sum(u['outputTokens'] for u in usage)
    return {'requests':len(rows), 'usageComplete':complete,
            'inputTokens':input_tokens if complete else None, 'outputTokens':output if complete else None,
            'totalTokens':input_tokens+output if complete else None,
            'observedTokens':input_tokens+output,
            'cachedInputTokens':sum(u['cacheReadInputTokens'] for u in usage) if complete else None}


def answer_from_trajectory(trajectory):
    for step in reversed(trajectory.get('steps', [])):
        if step.get('source') == 'agent' and not step.get('tool_calls'):
            text = step.get('message')
            if isinstance(text, str) and text.strip(): return text
    return None


def collect(root, ledger):
    output=[]
    for row in json.loads((root/'trials.json').read_text()):
        paths=list((root/'jobs'/row['id']).glob('*/result.json'))
        requests=[r for r in ledger['requests'] if r['trialId']==row['id']]
        data={k:row[k] for k in ('id','agent','task','repetition')}
        data.update(gate_totals(requests))
        data['gateRejections']=sum(r.get('trialId')==row['id'] for r in ledger.get('rejections',[]))
        data.update(status='missing',success=None,seconds=None,clientSeconds=None,reportingOverheadSeconds=None,finalAnswer=None,words=None)
        if len(paths)==1:
            trial=json.loads(paths[0].read_text())
            reward=(trial.get('verifier_result') or {}).get('rewards',{}).get('reward')
            exception=trial.get('exception_info')
            timing=trial.get('agent_execution') or {}
            if timing.get('started_at') and timing.get('finished_at'):
                start=datetime.fromisoformat(timing['started_at']); end=datetime.fromisoformat(timing['finished_at'])
                data['seconds']=(end-start).total_seconds()
                # Time alone cannot distinguish commissioning from a failed metered attempt.
                measured=[r for r in requests if start.timestamp() <= r['startedAt'] <= end.timestamp()]
                outside=[r for r in requests if not start.timestamp() <= r['startedAt'] <= end.timestamp()]
                data['allAttemptRequests']=len(requests)
                data['allAttemptUsage']=gate_totals(requests)
                data['outOfWindowRequests']=len(outside)
                data['outOfWindowUsage']=gate_totals(outside)
                data.update(gate_totals(measured))
            data.update(status='infrastructure-error' if exception else 'completed',
                        success=False if exception else reward==1 if reward in (0,1) else None,
                        exception=exception,source=str(paths[0]))
            clock=paths[0].parent/'agent/client-timing.json'
            if clock.exists():
                spans=json.loads(clock.read_text())
                values=[s.get('seconds') for s in spans]
                if values and all(isinstance(v,(int,float)) and math.isfinite(v) and v>=0 for v in values):
                    data['clientSeconds']=sum(values)
                    if data['seconds'] is not None:
                        data['reportingOverheadSeconds']=max(0,data['seconds']-data['clientSeconds'])
            native=paths[0].parent/'agent/youcoded-run.json'
            trajectory=paths[0].parent/'agent/trajectory.json'
            if native.exists(): data['finalAnswer']=json.loads(native.read_text()).get('finalText')
            elif trajectory.exists(): data['finalAnswer']=answer_from_trajectory(json.loads(trajectory.read_text()))
            if data['finalAnswer'] is not None: data['words']=len(data['finalAnswer'].split())
        output.append(data)
    return output


def median(values):
    values=[v for v in values if v is not None]
    return statistics.median(values) if values else None


def communication_summary(ratings, agents, tasks):
    output=[]
    for agent in agents:
        grades=[r for r in ratings.get('grades',[]) if r['agent']==agent]
        by_task={task:[r for r in grades if r['task']==task] for task in tasks}
        complete=all(by_task.values())
        row={'agent':agent,'acceptedGrades':len(grades),'taskCoverage':sum(bool(g) for g in by_task.values())}
        for field in ('clarity','concision'):
            row[field]=statistics.mean(statistics.mean(r[field] for r in group) for group in by_task.values()) if complete else None
        output.append(row)
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--ledger',type=Path,required=True)
    args=parser.parse_args()
    root=args.root.resolve(); ledger=json.loads(args.ledger.read_text())
    protocol=json.loads((root/'protocol.json').read_text())
    rows=collect(root,ledger)
    summary=[]
    for agent in protocol['agents']:
        subset=[r for r in rows if r['agent']==agent]
        timing_subset=[r for r in subset if r['repetition'] in protocol.get('timingAnalysisRepetitions',range(protocol['repetitions']))]
        summary.append({'agent':agent,'scheduled':len(subset),'completed':sum(r['status']=='completed' for r in subset),
                        'successes':sum(r['success'] is True for r in subset),
                        'infrastructureErrors':sum(r['status']=='infrastructure-error' for r in subset),
                        'medianAttemptSeconds':median([r['seconds'] for r in subset]),
                        'medianClientSeconds':median([r['clientSeconds'] for r in timing_subset]),
                        'clientTimingCoverage':sum(r['clientSeconds'] is not None for r in timing_subset),
                        'timingScheduled':len(timing_subset),
                        'medianAttemptTokens':median([r['totalTokens'] for r in subset]),
                        'tokenCoverage':sum(r['usageComplete'] for r in subset),
                        'medianAnswerWords':median([r['words'] for r in subset])})
    result={'protocol':protocol,'summary':summary,'trials':rows,
            'budget':{k:ledger[k] for k in ('limitUsd','initialUpperUsd','spentUpperUsd','reservedUpperUsd','observedRateCardUsd')},
            'limitations':['Three easy public tasks, repeated; descriptive pilot, not a general ranking. Client-time medians use the equally applied timing-calibration pass, excluding post-run export.',
                           'Missing usage is not zero; all calls including auxiliaries counted by shared gateway.',
                           'Gate enforces Haiku only, output ceiling and disabled thinking; cache remains harness-specific.',
                           'Rate-card estimates assume 1-hour writes; not invoices and not a precise cross-client cost comparison.',
                           'Word counts are descriptive; any model-based communication ratings below are exploratory and not human-calibrated.',
                           'Per-cell tokens cover the final recorded execution window. Out-of-window requests (which may be failed attempts, not just setup) are separately reported with all-attempt usage; every request remains in the cumulative budget ledger.']}
    ratings_path=root/'communication-ratings.json'
    if ratings_path.exists():
        ratings=json.loads(ratings_path.read_text())
        result['communication']={'kind':ratings['kind'],'aggregation':'equal task weight; mean of accepted ratings within each task',
            'summary':communication_summary(ratings,protocol['agents'],protocol['tasks']), 'failedBatches':ratings['failures']}
    (root/'comparison.json').write_text(json.dumps(result,indent=2)+'\n')
    lines=['# Matched Haiku pilot','', '| Harness | Verified / scheduled | Infra errors | Median client seconds | Median total tokens | Token coverage | Median answer words |',
           '|---|---:|---:|---:|---:|---:|---:|']
    f=lambda n:'unknown' if n is None else str(round(n,2))
    for s in summary:
        lines.append(f"| {s['agent']} | {s['successes']}/{s['scheduled']} | {s['infrastructureErrors']} | {f(s['medianClientSeconds'])} | {f(s['medianAttemptTokens'])} | {s['tokenCoverage']}/{s['scheduled']} | {f(s['medianAnswerWords'])} |")
    lines += ['', *['- '+s for s in result['limitations']], '',
              'Client timing coverage: '+', '.join(f"{s['agent']} {s['clientTimingCoverage']}/{s['timingScheduled']}" for s in summary)+'.',
              '', '## Per-task outcomes', '']
    for r in rows:
        if r.get('outOfWindowRequests'):
            lines.append(f"  Outside final window for {r['id']}: {r['outOfWindowRequests']} requests; tokens={f(r['outOfWindowUsage']['totalTokens'])}. See allAttemptUsage in JSON; not assumed free.")
        lines.append(f"- {r['id']}: {r['status']}; verified={r['success']}; client seconds={f(r['clientSeconds'])}; Harbor phase seconds={f(r['seconds'])}; tokens={f(r['totalTokens'])}; requests={r['requests']}; gate rejections={r['gateRejections']}")
    if 'communication' in result:
        lines += ['', '## Exploratory blinded communication ratings', '',
                  'Haiku judge, 1–5. Equal task weighting; not human-calibrated. Invalid quote-grounding rejects a judging batch, not the agent answer.', '',
                  '| Harness | Clarity | Concision | Accepted grades |', '|---|---:|---:|---:|']
        for s in result['communication']['summary']:
            lines.append(f"| {s['agent']} | {f(s['clarity'])} | {f(s['concision'])} | {s['acceptedGrades']} |")
        lines.append(f"\nRejected judging batches: {len(result['communication']['failedBatches'])}.")
    (root/'comparison.md').write_text('\n'.join(lines)+'\n')
    review=[r for r in rows if r['finalAnswer'] is not None]
    random.Random(148).shuffle(review)
    blind=['# Blinded answer review','', 'Rate completeness, clarity and concision separately (1–5). Word count is not a quality score. Identity key is in comparison.json.','']
    for index,r in enumerate(review,1):
        blind += [f"## Answer {index} — {r['task']}", '', r['finalAnswer'], '']
    (root/'blinded-answers.md').write_text('\n'.join(blind))
    print(root/'comparison.md')

if __name__=='__main__': main()
