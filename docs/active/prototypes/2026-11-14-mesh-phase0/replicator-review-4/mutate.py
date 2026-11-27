#!/usr/bin/env python3
# Mutation runner: applies ONE textual mutation to a COPY of the replicator source (mut/), runs the project's replicator tests with --bail, restores.
import subprocess, sys, json, os, shutil, time
ROOT = os.path.dirname(os.path.abspath(__file__)); MUT = os.path.join(ROOT, os.environ.get('MUTDIR', 'mut'))
R = 'src/main/mesh/replicator/'
TESTS = ['tests/mesh/replicator', 'tests/mesh/round3', 'src/main/mesh/replicator', 'tests/mesh/convergence']
mutants = json.load(open(os.path.join(ROOT, 'mutants.json')))
only = sys.argv[1:]
if len(only)==1 and only[0].startswith('part'): a,b=[int(x) for x in only[0][4:].split('of')]; ids=[m['id'] for m in mutants]; only=[i for k,i in enumerate(ids) if k%b==a-1]
results = []
for m in mutants:
    if only and m['id'] not in only: continue
    f = os.path.join(MUT, R + m['file']); src = open(f).read(); orig = src
    n = src.count(m['old'])
    if n != 1: results.append((m['id'], 'BAD-PATTERN(%d)' % n, 0)); print(m['id'], 'BAD-PATTERN', n, flush=True); continue
    open(f, 'w').write(src.replace(m['old'], m['new']))
    t0 = time.time()
    try:
        p = subprocess.run(['node_modules/.bin/vitest', 'run', '--bail', '1', *(['-t', os.environ['TESTPAT']] if os.environ.get('TESTPAT') else []), *TESTS], cwd=MUT, capture_output=True, text=True, timeout=1500, env={**os.environ, 'VITE_CONFIG_NATIVE_IGNORE_WARNING': 'true'})
        out = p.stdout + p.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith('FAIL') or ' × ' in l]
        verdict = 'KILLED' if p.returncode != 0 else 'SURVIVED'
        results.append((m['id'], verdict, round(time.time() - t0), failed[:2]))
        print(m['id'], verdict, round(time.time() - t0), 's', (failed[:1] or [''])[0][:160], flush=True)
    except subprocess.TimeoutExpired:
        results.append((m['id'], 'TIMEOUT(killed: loop)', 1500)); print(m['id'], 'TIMEOUT', flush=True)
    finally:
        open(f, 'w').write(orig)
json.dump(results, open(os.path.join(ROOT, 'mutation-results-%s%s.json' % (os.environ.get('MUTDIR', 'mut'), os.environ.get('SUFFIX',''))), 'w'), indent=1)
