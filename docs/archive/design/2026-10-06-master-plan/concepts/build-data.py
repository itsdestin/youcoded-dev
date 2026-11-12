#!/usr/bin/env python3
"""build-data.py — writes concepts/data.json from the real map (scratch/command-center/grid.json)
plus the morning's hand-checked facts below, then re-inlines it into every concept page's
<script id="data" type="application/json"> block.

WHY a script: the first data.json was a one-off heredoc built from a STALE grid.json, so the
GitHub sign-in showed under Marketplace while the rules file said Sync. Regenerating is one
command and the pages can never carry data older than the map:

    node scripts/command-center/aggregate.mjs && python3 docs/active/design/2026-10-06-master-plan/concepts/build-data.py
"""
import json, re, collections, pathlib
from datetime import date
HERE = pathlib.Path(__file__).resolve().parent
W = HERE.parents[4]
g = json.load(open(W / 'scratch/command-center/grid.json'))
rules = json.load(open(W / 'scripts/command-center/parts.rules.json'))
parts = rules['parts']
TODAY = date(2026, 10, 8)

SYS = {
 'chat-agents': ('Chat & agents', 'Talking to your assistant, and the agents that work for you.'),
 'pages': ('Pages', 'Screens you build or bring in and make your own: money, home, anything.'),
 'marketplace': ('Marketplace', 'Plugins, themes and tools from the community, and your library of them.'),
 'social': ('Social', 'Friends, games and sharing.'),
 'projects-files': ('Projects & files', 'Your projects, documents and the files the assistant works in.'),
 'sync-devices': ('Sync & devices', 'Your computer, phone and remote access staying in step.'),
 'foundations': ('Foundations', 'The window, settings, themes and plumbing everything else stands on.'),
 'workshop': ('Workshop', 'The tools we use to build and check the app itself.'),
}
side = lambda layer: 'screens' if layer == 'screens' else 'behind'

systems = []
for s in g['systems']:
    name, purpose = SYS[s]
    ps = []
    for layer in g['layers']:
        for p in g['cells'][f'{s}/{layer}']['parts']:
            e = {'id': p['part'], 'layer': layer, 'side': side(layer), 'phone': layer == 'android',
                 'files': p['files'], 'lines': p['lines'], 'purpose': p['purpose']}
            if p.get('also'): e['alsoServes'] = p['also']; e['alsoWhy'] = p.get('alsoWhy', '')
            ps.append(e)
    systems.append({'id': s, 'name': name, 'purpose': purpose, 'files': sum(p['files'] for p in ps),
                    'screensFiles': sum(p['files'] for p in ps if p['side'] == 'screens'),
                    'behindFiles': sum(p['files'] for p in ps if p['side'] == 'behind'),
                    'phoneFiles': sum(p['files'] for p in ps if p['phone']), 'parts': ps})

seam = collections.Counter(); seamBy = collections.defaultdict(collections.Counter)
for e in g['cellEdges']:
    a = e['from'].split('/')[0]; b = e['to'].split('/')[0]
    if a == b: continue
    k = tuple(sorted((a, b))); seam[k] += e['total']
    for t, n in e['byType'].items(): seamBy[k][t] += n
TYPE_WORDS = {'import': 'code that calls the other side', 'channel': 'requests the screen sends behind the scenes',
              'cochange': 'files often changed together', 'event': 'messages one side announces and the other listens for',
              'test': 'tests that cover both', 'doc': 'docs that describe both'}
seams = [{'a': k[0], 'b': k[1], 'strength': v, 'byType': dict(seamBy[k]), 'mostly': seamBy[k].most_common(1)[0][0],
          'words': TYPE_WORDS[seamBy[k].most_common(1)[0][0]]} for k, v in seam.most_common()]

TITLES = {
 'session/ui-consistency-audit': 'UI consistency audit: every screen on the shared parts',
 'session/perf-switch-marks-20261005': 'Zero-hitch performance: faster session switching',
 'session/perf-recorder-integration-20261005': 'Freeze recorder for the performance program',
 'session/dev-xray-tools': 'X-ray: see what a turn actually did, in plain words',
 'session/fix-permission-approve-flake': 'Fix a flaky permission test',
 'session/usage-visibility-20260929': 'Usage: see how much of each account you have used',
 'feat/specialists-plans-ui': 'Specialists and plans: spending rework',
 'session/plugin-project-controls': 'Project skills & tools: per-project control of what the assistant uses',
 'session/theme-plugin-update': 'Theme and plugin update check',
 'diag/mm-memory-timing': 'Memory timing diagnosis',
 'feat/specialists-plans-5b': 'Specialists and plans: round 5b review fixes',
 'session/onedrive-no-auto-download': 'OneDrive read protection (paused, known regressions)',
 'session/agent-lint-tooling': 'Lint tooling for agents',
 'session/files-drawer-honesty': 'Files drawer: show only what is really there',
 'session/model-picker-tags': 'Model picker: cost and intelligence tags',
 'session/quick-cache-check': 'Quick cache check',
 'session/prerelease-sep07': 'September pre-release notes',
 'session/sync-safety-audit-20260908': 'Sync safety audit',
 'session/sync-retry-feedback': 'Sync: say when a retry is happening',
 'feat/dev-dashboard': 'Old dev dashboard sketch (ideas only)',
 'chore/conversation-triage-script': 'Conversation triage script',
 'feat/permission-ask-timeout': 'Permission prompts that time out',
 'feat/ask-claude-reference-ux': 'Ask Claude about a selection',
}
PR = {'session/plugin-project-controls': {'number': 571, 'state': 'draft', 'note': 'UI review pending'},
      'session/onedrive-no-auto-download': {'number': 476, 'state': 'draft', 'note': 'paused, known regressions'},
      'session/sync-retry-feedback': {'number': 444, 'state': 'open', 'note': 'open since 8 Sep, nobody has looked'},
      'session/perf-switch-marks-20261005': {'number': 616, 'state': 'merged', 'note': 'merged today'}}
# WHY: merged this morning (PR 616) after the map was drawn; a merged effort is cleanup, not work in flight.
MERGED = {'session/perf-switch-marks-20261005', 'session/perf-recorder-integration-20261005'}
PURPOSE = {
 'session/ui-consistency-audit': 'Every screen uses the same shared buttons, rows and folds, so nothing looks home-made.',
 'session/dev-xray-tools': 'A view that explains what the assistant did in a turn, step by step, in plain words.',
 'session/usage-visibility-20260929': 'Shows how much of each cloud account you have used, under the provider it belongs to.',
 'session/plugin-project-controls': 'Lets each project choose which plugins and tools the assistant may use.',
 'feat/specialists-plans-ui': 'Plans with a spending cap, and specialists that run inside them.',
 'session/sync-retry-feedback': 'When sync retries, the screen says so instead of looking stuck.',
 'session/model-picker-tags': 'Cost and intelligence tags beside each model so choosing does not need the names.',
 'session/onedrive-no-auto-download': 'Stops the assistant from pulling whole OneDrive folders down just by reading them.'}

efforts = []
for b in g['branches']:
    d = date.fromisoformat(b['lastCommit']); age = (TODAY - d).days
    ui = sum(p['files'] for p in b['partsTouched'] if parts.get(p['part'], {}).get('layer') == 'screens')
    be = sum(p['files'] for p in b['partsTouched'] if parts.get(p['part'], {}).get('layer') != 'screens')
    sysc = collections.Counter()
    for p in b['partsTouched']: sysc[parts.get(p['part'], {}).get('system', '?')] += p['files']
    merged = b['branch'] in MERGED
    efforts.append({'branch': b['branch'], 'title': TITLES.get(b['branch'], b['branch']), 'purpose': PURPOSE.get(b['branch']),
        'members': b['members'], 'commits': b['ahead'], 'lastTouched': b['lastCommit'], 'daysAgo': age,
        'active': age <= 7 and not merged, 'merged': merged,
        'uiFiles': ui, 'behindFiles': be, 'kind': 'screens' if ui > be * 2 else ('behind' if be > ui * 2 else 'both'),
        'systems': [{'id': s, 'files': n} for s, n in sysc.most_common()],
        'parts': [{'id': p['part'], 'files': p['files'], 'side': side(parts.get(p['part'], {}).get('layer', 'backend')),
                   'purpose': parts.get(p['part'], {}).get('purpose', '')} for p in b['partsTouched']],
        'pr': PR.get(b['branch'])})

briefing = {
 'date': '2026-10-08', 'weekday': 'Thursday', 'release': {'version': '1.3.0', 'date': '2026-09-20'}, 'prerelease': {'version': '1.3.1-beta.87', 'date': '2026-09-20'},
 'mergedSinceRelease': 69, 'mergedSincePrerelease': 68,
 'mergedToday': [{'number': 616, 'title': 'Zero-hitch performance: fixes, freeze recorder, faster session switching'}, {'number': 615, 'title': 'Money page: Plaid bank connection, bills and subscription review'}, {'number': 613, 'title': 'Oversized image safety: shrink and disclose, history heal, bounded retry'}, {'number': 612, 'title': 'Pages socket: point the design comment at the archived spec'}],
 'mergedYesterday': [{'number': 611, 'title': 'Pages: home-device connection, live camera video, see-through glass; Home Assistant Home page'}, {'number': 610, 'title': 'Custom desktop voice vocabulary'}],
 'mergeable': [{'number': 444, 'branch': 'session/sync-retry-feedback', 'title': 'Sync: say when a retry is happening', 'since': '2026-09-08', 'note': 'Open for a month. Small: 2 parts, 1 commit.'},
               {'number': 614, 'branch': 'dependabot', 'title': '31 small library updates for the desktop app', 'since': '2026-10-08', 'note': 'Automatic. Tests pass.'},
               {'number': 466, 'branch': 'dependabot', 'title': 'Test runner update (vitest 4 → 5)', 'since': '2026-10-05', 'note': 'Automatic. Tests pass.'}],
 'cleanup': {'localBranchesMerged': 11, 'worktrees': 16, 'worktreesIdle': 9, 'remoteBranchesMerged': 1, 'line': '11 finished branches you can delete, and 9 idle work folders',
             'examples': ['Zero-hitch performance (merged today)', 'Money page (merged today)', 'Home-device connection (merged yesterday)', 'two before/after comparison copies']},
 'bugs': [{'title': 'The settings screen exists twice, once for desktop and once for phone, so changes are made twice and can disagree.', 'area': 'Foundations', 'tags': ['release blocker', 'on hold since 18 Sep']},
          {'title': 'Error messages still guess at causes in many places; batch 1 of 7 shipped.', 'area': 'Foundations', 'tags': ['confirmed']},
          {'title': 'A permission near-miss can pass silently on tool cards.', 'area': 'Chat & agents', 'tags': ['confirmed']},
          {'title': 'Project files background index can stall on big folders.', 'area': 'Projects & files', 'tags': ['confirmed']}],
 'recommendation': {'effort': 'session/sync-retry-feedback', 'title': 'Sync: say when a retry is happening',
   'why': 'Smallest open thing with a finished review: one commit, two parts, no overlap with anything else in flight. Merging it clears the oldest open item.',
   'links': 'Touches the same sync parts as the sync safety audit (idle since 11 Sep); nothing active collides.',
   'seams': 'The retry message comes from the sync engine and is shown by the sync screen. Make the wording a setting of the engine, not the screen, so the phone shows the same words.'},
}
gallery = {'total': 216, 'shown': ['home', 'projects', 'marketplace', 'themes', 'model-picker', 'permissions', 'tags', 'connect4'],
 'names': {'home': 'Home', 'projects': 'Projects', 'marketplace': 'Marketplace', 'themes': 'Themes', 'model-picker': 'Model picker', 'permissions': 'Permissions', 'tags': 'Tags', 'connect4': 'Connect Four'},
 'changedBy': {'home': [{'pr': 605, 'title': 'Brand icons: glass app icon', 'date': '2026-10-05'}], 'projects': [{'pr': 615, 'title': 'Money page: Plaid bank connection', 'date': '2026-10-08'}], 'marketplace': [{'pr': 571, 'title': 'Project skills & tools (in review)', 'date': '2026-09-24'}], 'themes': [], 'model-picker': [{'pr': 609, 'title': 'ChatGPT: official sign in', 'date': '2026-10-06'}], 'permissions': [{'pr': 613, 'title': 'Oversized image safety', 'date': '2026-10-08'}], 'tags': [], 'connect4': []}}
out = {'generatedAt': g['generatedAt'], 'commit': g['commit'], 'systems': systems, 'seams': seams, 'efforts': efforts, 'briefing': briefing, 'gallery': gallery,
       'counts': {'parts': sum(len(s['parts']) for s in systems), 'desktopFiles': 1311, 'androidFiles': 85, 'efforts': len(efforts), 'activeEfforts': sum(1 for e in efforts if e['active'])}}
text = json.dumps(out, indent=1, ensure_ascii=False)
(HERE / 'data.json').write_text(text + '\n')
print('data.json:', out['counts'])
# re-inline into every concept page
pat = re.compile(r'(<script[^>]*id="data"[^>]*>)(.*?)(</script>)', re.S)
for page in sorted(HERE.glob('*.html')):
    s = page.read_text()
    if not pat.search(s): print('  skip (no data block):', page.name); continue
    s2 = pat.sub(lambda m: m.group(1) + '\n' + text.replace('</script', '<\\/script') + '\n' + m.group(3), s, count=1)
    page.write_text(s2); print('  inlined into', page.name)
