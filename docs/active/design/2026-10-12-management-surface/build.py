#!/usr/bin/env python3
"""Builds mockup.html: the first draft of the management surface, with real data.

WHY a builder and not a hand-written page: every row below is a fact from the repos as of
2026-10-12 (branches, pull requests, merges, roadmap, today's screenshot run). The real
version replaces the DATA block with a collector; the rendering stays. Thumbnails come from
thumbs/ (made from the ui-consistency-audit worktree's shoot run 20261012-141521, light theme).
"""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
THUMBS = os.path.join(HERE, 'thumbs')

# ----------------------------------------------------------------------------- DATA
# Open efforts: real unmerged branches, backups/bots/diagnostics excluded. "touches" was worked
# out from the files each branch changed vs origin/master. "goal" is empty everywhere because no
# merge goal has ever been recorded — that gap is shown, not hidden.
EFFORTS = [
  dict(id='ui-consistency-audit', title='Screens restyled to match the design guide', last='2026-10-12', days=0,
       touches=['Marketplace','Projects','Chat','Social'], side='screens', note='Latest: the Update-available and Unsaved-changes notices; an error-notices review deck with 7 before/after slides.',
       screens=['marketplace','projects','chat/tags','chat/games','chat/update','app/unsaved-before-quit']),
  dict(id='management-surface-20261012', title='This page: the management surface', last='2026-10-12', days=0,
       touches=['Dev tooling'], side='behind', note='Research, an independent review and this draft.', screens=[]),
  dict(id='dev-xray-tools', title='X-ray: see a conversation turn by turn, in plain words', last='2026-10-04', days=8,
       touches=['Settings'], side='screens', note='Round 2 review deck done; call and result shown as one step.', screens=['dev/','settings/development']),
  dict(id='fix-permission-approve-flake', title='A flaky test in the permission-approve walkthrough', last='2026-10-03', days=9,
       touches=['Dev tooling'], side='behind', note='One commit; the test now checks the streamed sentence whole again.', screens=[]),
  dict(id='usage-visibility-20260929', title='Usage: one account at a time, limit line over the token bars', last='2026-09-29', days=13,
       touches=['Settings'], side='screens', note='Round 2 of the review deck answered.', screens=['settings/assistant/cloud','settings/account']),
  dict(id='specialists-plans', title='Specialists show a plan and a budget before acting', last='2026-09-26', days=16,
       touches=['Chat','Settings'], side='both', note='138 commits across three branches; the biggest unfinished thing. A START-HERE note says stage 1 is done.',
       screens=['chat/specialists','settings/assistant/specialists','chat#questions']),
  dict(id='plugin-project-controls', title='Project skills & tools: per-project control of what the assistant uses', last='2026-09-24', days=18,
       touches=['Projects','Marketplace','Chat'], side='both', note='Draft pull requests #571 and #203 are open. Their title says "UI review pending".',
       screens=['projects','marketplace','chat/skills'], pr='#571 draft, checks pass'),
  dict(id='theme-plugin-update', title='Bundled skill content delivered on app update', last='2026-09-22', days=20,
       touches=['Marketplace'], side='behind', note='A fix in the plugin installer plus the Morning Rounds mascot decisions.', screens=['marketplace/theme-detail']),
  dict(id='onedrive-no-auto-download', title='OneDrive files: read without auto-downloading', last='2026-09-15', days=27,
       touches=['Projects','Chat'], side='both', note='Paused on purpose. Draft PR #476 says "known regressions". A handoff documents where it stopped.',
       screens=['projects/files','chat/files'], pr='#476 draft, checks fail', paused='Known regressions; paused with a handoff'),
  dict(id='offline-auth-bypass', title='Offline use, sign-in expiry and the startup menu', last='2026-09-14', days=28,
       touches=['Settings'], side='screens', note='A questions deck was answered; nothing built yet.', screens=['first-run','settings/account']),
  dict(id='agent-lint-tooling', title='Faster type checks and a design lint for agents', last='2026-09-14', days=28,
       touches=['Dev tooling'], side='behind', note='Swaps the linter and type checker; report-only design lint.', screens=[]),
  dict(id='files-drawer-honesty', title='Files drawer: the bytes reader follows the link before it decides', last='2026-09-11', days=31,
       touches=['Chat','Projects'], side='both', note='Review answers recorded: all four kept.', screens=['chat/files','projects/files']),
  dict(id='model-picker-tags', title='Model picker: tags, a filter panel, plainer hints', last='2026-09-11', days=31,
       touches=['Chat'], side='screens', note='Design review answered (chips, sentence case, shorter hovers).', screens=['chat/model-picker']),
  dict(id='sync-safety-audit-20260908', title='Sync safety: backup-target selection fix', last='2026-09-11', days=31,
       touches=['Devices & sync'], side='behind', note='The commit says: reviewed, verify green on Sept 9. Never merged.', screens=['settings/sync'], ready=True),
  dict(id='sync-retry-feedback', title='Sync: acknowledge retry attempts', last='2026-09-07', days=35,
       touches=['Devices & sync'], side='behind', note='Pull request #444 is open and its checks fail. Nobody has looked since Sept 8.', screens=['settings/sync'], pr='#444 open, checks fail'),
  dict(id='permission-ask-timeout', title='Permission asks that time out', last='2026-07-31', days=73,
       touches=['Chat'], side='behind', note='Five review findings closed, then silence.', screens=['chat#bubbles-approval','settings/assistant/permissions']),
  dict(id='ask-claude-reference-ux', title='"Ask Claude" reference marks in documents', last='2026-07-28', days=76,
       touches=['Files & documents'], side='screens', note='Last commit fixes same-line mark outlines.', screens=['office/document']),
]
DEV_ONLY = [  # branches that only hold docs or investigations
  dict(id='integrations-research', title='Integrations research: Todoist install failure; Google Messages is Windows-only', last='2026-09-27', days=15),
  dict(id='marketing-ads', title='First Google Search + YouTube ads experiment plan', last='2026-09-26', days=16),
  dict(id='dev-dashboard', title='The September dev dashboard draft (you said: mostly toss it)', last='2026-09-05', days=37),
  dict(id='conversation-triage-script', title='A triage script that was never in version control', last='2026-09-04', days=38),
]
LEFTOVERS = dict(
  backups='5 backup branches and 2 rescue branches from Sept 11 (snapshots of unsaved work that has since been committed elsewhere)',
  bots='7 automatic dependency updates, all with failing checks (5 Android from Sept 3, 2 desktop from Oct 5–8)',
  diag='1 temporary diagnostics branch marked "not for merge" (Sept 18)',
  worktrees=['compaction-handoff-20260922 (Sept 23)','model-picker-tags (Sept 11)','pages-empty-before (Sept 23)','plugin-project-controls (Sept 24)',
             'specialists-plans-wrapup (Sept 26)','theme-plugin-update (Sept 23)','specialists-plans-decisions (Sept 26)','plans-r12-after (Sept 19)','plans-r12-before (Sept 18)','specialists-plans (Sept 26)'],
)
BUGS = [  # from ROADMAP.md "Next release" + P1 entries; the roadmap records no reporter, so "source" is honest
  dict(title='Searching a big project stops early, for file names and for text inside files', place='Projects', src='roadmap, confirmed, P1, checked Sept 18', screens=['projects/files/filter']),
  dict(title='Error messages still guess at causes in many places', place='Chat', src='roadmap, confirmed, P1, checked Sept 11, error inventory attached', screens=['chat#openrouter-key-rejected','settings/sync#auth-error']),
  dict(title='Mac downloads may open as "broken": nothing is signed or notarized', place='Getting started', src='roadmap, P1', screens=['first-run']),
  dict(title='After a wide "Always allow", a later command that only looks similar may run without asking', place='Chat', src='roadmap, native-harness, P1', screens=['settings/assistant/permissions','chat#bubbles-approval']),
  dict(title='Gemma models download with no licence notice', place='Settings', src='roadmap, local-models', screens=['settings/assistant/local']),
  dict(title='The settings screen exists twice, once for desktop and once for phone', place='Settings', src='roadmap, user-interface, blocked on simplification', screens=['settings']),
]
RELEASE = dict(version='v1.3.0', date='Sept 20', beta='1.3.1-beta.87 (Sept 19)', merges=67, groups=[
  ('Chat', ['Switching between chats is faster, and many open tabs no longer slow things down','Verified chat performance fixes','Scrolling feels right again; a chat no longer vanishes; a stuck drag in the switcher is fixed','Custom words for voice dictation; voice reliability','Oversized images are handled safely','Picking up a conversation again, and what a helper agent is doing, both show properly'], ['chat','chat/switcher','chat/resume','chat/status-bar']),
  ('Pages', ['Pages can connect to Home Assistant'], ['pages/library/connections']),
  ('Settings and account', ['Sign in with the official ChatGPT flow','The buddy can be hidden from the tray','A cleaner minimal-chrome theme; the Mac dock icon; a sudo prompt that explains itself'], ['settings/account','settings/buddy','settings/appearance']),
  ('Devices and sync', ['Sync repairs itself more robustly and explains what it did','Sync watches only what it should'], ['settings/sync']),
  ('Installing', ['Windows builds are signed','Windows developer mode is no longer required','Linux catalog screenshots'], ['first-run']),
  ('Behind the scenes', ['One core for desktop and Android ("one-core")','Startup speed; an always-on hitch recorder','Brand identity and the website','UI review tooling, doc sweeps, a trimmed changelog'], []),
])
SUGGEST = dict(
  title='Finish "Project skills & tools"',
  why='It is the most finished unfinished thing: a P1 roadmap item, draft pull requests open since Sept 24, checks passing, waiting only on your UI review. Low effort for a feature users will feel.',
  promise='Yours to shape: each project decides what the assistant may use.',
  touches=['Projects','Marketplace','Chat'],
  connects=['The roadmap\'s built-in "Your Assistant" project needs the same per-project switches','Native-only users still have no skills home of their own (a release blocker); this branch is where that home gets decided','Marketplace search from inside a chat would read the same list'],
  config=['Per project: which skills and tools are on','A default for new projects','Whether a plugin may turn itself on in every project'],
  alternatives=[('Finish the screen restyle (active today)','You are already in it; merging it clears the biggest open UI branch.'),
                ('Specialists plans and budgets','The biggest unfinished thing (138 commits, three branches). Highest payoff, highest effort, untouched 16 days.')],
)
PLACES = [  # (name, screen prefixes)
  ('Getting started', ['first-run','welcome','tour/','handle-prompt']),
  ('Chat', ['chat']),
  ('Projects', ['projects']),
  ('Pages', ['pages']),
  ('Marketplace & library', ['marketplace','library']),
  ('Files & documents', ['office','chat/files']),
  ('Social', ['chat/games']),
  ('Settings', ['settings']),
  ('Devices & sync', ['settings/sync','settings/remote','settings/android','chat/takeover','projects/turn-on-sync']),
  ('Leaving & updating', ['app/unsaved-before-quit','chat/update','chat/close-session','chat/quit-sessions']),
  ('Developer tools', ['dev/','settings/development']),
]
DESC = {  # plain sentences for the main screens; everything else says so honestly
  'chat':'The conversation. Where you talk to the assistant and it answers, asks, and shows its work.',
  'chat/model-picker':'Pick which model answers, and whether it runs fast or careful.',
  'chat/skills':'The skills this chat can use, from the marketplace or your own.',
  'chat/specialists':'Helper agents the assistant can hand work to, each with its own instructions and tools.',
  'chat/files':'Files the conversation made or opened.',
  'chat/resume':'Pick up an earlier conversation.',
  'chat/switcher':'Jump between open chats.',
  'chat/status-bar':'The strip under the chat: which model, how much it costs, what it is doing.',
  'chat/preferences':'How this chat behaves: tone, permissions, what to always do.',
  'chat/session-context':'Everything the assistant was given to read before answering.',
  'chat/games':'Play with friends: chess, connect four, 2048, flappy.',
  'chat/commands':'Slash commands available right now.',
  'chat/quick-chips':'One-tap prompts you keep under the composer.',
  'chat/tags':'Label a conversation so you can find it later.',
  'chat/close-session':'Finish a conversation and leave a note for next time.',
  'projects':'A folder the assistant works in, with its instructions, conversations, files and Pages.',
  'projects/context':'The instructions the assistant reads for this project.',
  'projects/files':'The project\'s files, with sync state.',
  'projects/switcher':'Switch between projects.',
  'pages':'Small apps inside the app: a weather page, a task board, your money.',
  'pages/library':'Every page you have, and the connections each one may use.',
  'pages/create':'Make a new page by describing it.',
  'marketplace':'Free skills, themes, pages and plugins from the community.',
  'marketplace/detail':'One listing: what it does, who made it, reviews, install.',
  'library':'What you have installed.',
  'office/document':'The built-in document editor.',
  'office/spreadsheet':'The built-in spreadsheet.',
  'office/presentation':'The built-in slides editor.',
  'settings':'Every setting, grouped.',
  'settings/assistant':'How the assistant thinks: models, permissions, specialists, local engines.',
  'settings/assistant/permissions':'What the assistant may do without asking.',
  'settings/assistant/specialists':'Manage the helper agents.',
  'settings/assistant/cloud':'Cloud accounts and keys.',
  'settings/assistant/local':'Models that run on this computer.',
  'settings/account':'Your account and connected services.',
  'settings/sync':'Keep conversations and projects the same on every device.',
  'settings/appearance':'Themes and fine-tuning the look.',
  'settings/buddy':'The buddy in the tray.',
  'settings/development/bug-report':'Send a bug report, with logs if you choose.',
  'first-run':'The first time the app opens: sign in, install what is needed.',
  'welcome':'The empty state before any conversation.',
  'dev/open-tasks':'Developer view of background tasks.',
}
QUESTIONS = [  # question -> screen-name patterns that light up. Worked out by reading the screen list; the real version reads the code.
  ('Where does the app talk to the AI?', ['chat','settings/assistant/cloud','settings/assistant/local','chat/model-picker','chat/specialists','pages/create']),
  ('What changes how the assistant behaves?', ['settings/assistant','projects/context','chat/preferences','chat/skills','chat/quick-chips','chat/session-context','chat/model-picker','settings/buddy']),
  ('Where do marketplace add-ons show up?', ['marketplace','library','chat/skills','chat/specialists','chat/commands','settings/assistant/specialists','pages/library']),
  ('Where are permissions set or asked?', ['settings/assistant/permissions','chat/first-time-warning','chat#bubbles-approval','chat#bubbles-edit-approval','projects/files/folder/Locked','pages/library/connections','marketplace/detail/connection','settings/account/connections']),
  ('What is being worked on right now?', None),   # from EFFORTS
  ('What changed since the last release?', None), # from RELEASE
  ('Which screens have a phone version?', ['#phone']),
]
BLOCKS = [  # building blocks x places. 2 = set here, 1 = used here, 0 = not present. From the repo check, first draft.
  ('Model',                 {'Chat':2,'Projects':0,'Pages':0,'Marketplace':0,'Settings':2,'Devices & sync':0}, 'Chosen in the chat and in Settings; a specialist carries its own preference. Three places.'),
  ('Instructions',          {'Chat':1,'Projects':2,'Pages':0,'Marketplace':0,'Settings':1,'Devices & sync':0}, 'Project files, rules and memory. Edited in the project; shown in the chat.'),
  ('Skills & commands',     {'Chat':1,'Projects':0,'Pages':0,'Marketplace':2,'Settings':0,'Devices & sync':0}, 'Installed from the marketplace, used in chat. Per-project control is the draft branch above.'),
  ('Tools & MCP servers',   {'Chat':1,'Projects':0,'Pages':1,'Marketplace':2,'Settings':0,'Devices & sync':0}, 'Plugins bundle them; chat uses them; Pages reach the assistant through one. No settings screen exists.'),
  ('Permissions',           {'Chat':2,'Projects':1,'Pages':2,'Marketplace':0,'Settings':2,'Devices & sync':0}, 'Set in Settings, asked in chat, granted once per Page connection. Three places.'),
  ('Hooks',                 {'Chat':0,'Projects':0,'Pages':0,'Marketplace':2,'Settings':0,'Devices & sync':0}, 'Only plugins carry them. Nothing shows them to you.'),
  ('Connections & accounts',{'Chat':0,'Projects':0,'Pages':2,'Marketplace':2,'Settings':2,'Devices & sync':0}, 'Set up in three places: a Page, a listing, Settings.'),
  ('Theme',                 {'Chat':1,'Projects':0,'Pages':1,'Marketplace':2,'Settings':2,'Devices & sync':0}, 'Picked in Settings or the marketplace; Pages and the status bar follow it.'),
  ('Saved recipes (Specialists)', {'Chat':1,'Projects':0,'Pages':0,'Marketplace':2,'Settings':2,'Devices & sync':0}, 'The closest thing to a reusable agent today: prompt, tools, read/write rule, model preference.'),
  ('Device',                {'Chat':0,'Projects':0,'Pages':0,'Marketplace':0,'Settings':0,'Devices & sync':1}, 'Vision only: mesh would make "which computer runs this" a block.'),
]

# ----------------------------------------------------------------------------- screens
names = sorted(f[:-4].replace('__','/') for f in os.listdir(THUMBS) if f.endswith('.jpg'))
def thumb(n): return 'thumbs/' + n.replace('/','__') + '.jpg'
def pic(cands):
    """First existing thumbnail for any of the screen names, trying the screen's states too."""
    for s in cands:
        for n in [s] + [x for x in names if x.startswith(s + '#') or x.startswith(s + '/')]:
            if os.path.exists(os.path.join(HERE, thumb(n))): return f'<img class="shot" src="{thumb(n)}" alt="">'
    return ''
base = [n for n in names if '#' not in n]
variants = {}
for n in names:
    if '#' in n: variants.setdefault(n.split('#')[0], []).append(n)
def place_of(n):
    best = None
    for p, prefs in PLACES:
        for pre in prefs:
            if n == pre.rstrip('/') or n.startswith(pre if pre.endswith('/') else pre + '/') or n.startswith(pre + '#') or n == pre:
                if best is None or len(pre) > best[1]: best = (p, len(pre))
    return best[0] if best else 'Other'
by_place = {}
for n in base: by_place.setdefault(place_of(n), []).append(n)
def matches(n, pats):
    return any((pat.startswith('#') and pat in n) or n == pat or n.startswith(pat.rstrip('/') + '/') or n.startswith(pat + '#') or (pat.endswith('/') and n.startswith(pat)) for pat in pats)
def work_on(n):
    return [e for e in EFFORTS if e['screens'] and matches(n, e['screens'])]
light = {}
for q, pats in QUESTIONS:
    if pats is None and q.startswith('What is being'): pats = sorted({s for e in EFFORTS for s in e['screens']})
    if pats is None: pats = sorted({s for g in RELEASE['groups'] for s in g[2]})
    light[q] = [n for n in names if matches(n, pats)]

E = html.escape
def chips(touches, side):
    s = {'screens':'what you see','behind':'behind the scenes','both':'what you see + behind the scenes'}[side]
    return ''.join(f'<span class="badge tip" data-tip="Worked out from the files this branch changed">{E(t)}</span>' for t in touches) + f'<span class="side {E(side)} tip" data-tip="{E(s)}">{E(s)}</span>'
def btn(label, does, primary=False):
    return f'<button class="btn sm{" primary" if primary else ""}" data-does="{E(does)}">{E(label)}</button>'
def ago(d): return 'today' if d == 0 else ('yesterday' if d == 1 else f'{d} days ago')

# ----------------------------------------------------------------------------- TODAY
active = [e for e in EFFORTS if e['days'] <= 7]
IN_NEEDS = {'plugin-project-controls','sync-retry-feedback','sync-safety-audit-20260908'}
waiting = [e for e in EFFORTS if e['days'] > 7 and e['id'] not in IN_NEEDS]
needs = []
needs.append(('ready', 'Sync safety: backup-target selection fix', 'Reviewed and green on Sept 9. Never merged. Untouched 31 days.',
              [btn('See what changed','opens the before/after screens for settings/sync'), btn('Merge it','opens its conversation with "Destin approves merging" already typed', True), btn('Not yet','asks why; the answer becomes its waiting-on note')]))
needs.append(('review', 'Project skills & tools: per-project control of what the assistant uses', 'Draft pull requests open since Sept 24, checks pass. The title says "UI review pending", so it is waiting on you.',
              [btn('Review the screens','opens the review deck that was prepared for it', True), btn('Resume','opens its conversation'), btn('Park it','records why and moves it to Waiting')]))
needs.append(('failing', 'Sync: acknowledge retry attempts', 'Pull request #444 has been open since Sept 8 with failing checks. Nobody has looked.',
              [btn('Fix the checks','starts a session on that branch with the failing checks pasted in', True), btn('Close it','closes the PR and records why')]))
needs.append(('bots', '7 automatic dependency updates, all failing checks', 'Five Android bumps from Sept 3, two desktop bumps from Oct 5 and 8.',
              [btn('Try them together','starts one session that applies all seven and runs the checks', True), btn('Close them','closes the seven PRs')]))
needs.append(('stale', '10 worktrees with unsaved changes nobody has opened in 2+ weeks', 'They cannot be cleaned up automatically because the changes are not saved anywhere. ' + ', '.join(LEFTOVERS['worktrees'][:4]) + ' and 6 more.',
              [btn('Save all as backup branches','commits each one to a backup branch, pushes, then removes the worktree', True), btn('Show me','lists each with what is unsaved')]))

today = []
today.append('<section class="sec"><div class="sechead"><span class="t-base">Needs you</span><span class="muted t-xs">Things only you can decide. Nothing here repeats below.</span></div>')
for kind, t, hint, bs in needs:
    today.append(f'<div class="row"><div class="body"><div class="t-sm">{E(t)}</div><div class="hint wrap">{E(hint)}</div></div><div class="acts">{"".join(bs)}</div></div>')
today.append('<div class="callout muted t-xs">From other people: no open reports on GitHub. The last one was from tjmorin03 on Sept 15, closed.</div></section>')

today.append('<section class="sec"><div class="sechead"><span class="t-base">In progress</span><span class="muted t-xs">Touched in the last 7 days.</span></div>')
for e in active:
    today.append(f'''<div class="row">{pic(e['screens'])}<div class="body"><div class="t-sm">{E(e['title'])}</div>
      <div class="hint wrap">Last worked on {ago(e['days'])}. {E(e['note'])}</div>
      <div class="goal missing">No merge goal recorded. <button class="btn ghost sm" data-does="asks you for 1–3 sentences; every big piece of work would get this at its start">Set one</button></div>
      <div class="chips">{chips(e['touches'], e['side'])}</div></div>
      <div class="acts">{btn('Resume','opens its conversation', True)}{btn('Park','records why and moves it to Waiting')}</div></div>''')
today.append('</section>')

today.append('<section class="sec"><div class="sechead"><span class="t-base">Waiting</span><span class="muted t-xs">Not touched in over a week. Oldest at the bottom.</span></div>')
for e in waiting:
    why = e.get('paused') or 'No reason recorded'
    pr = f' · {E(e["pr"])}' if e.get('pr') else ''
    today.append(f'''<div class="row"><div class="body"><div class="t-sm">{E(e['title'])}</div>
      <div class="hint wrap">Last worked on {ago(e['days'])}{pr}. {E(e['note'])}</div>
      <div class="hint wrap">Waiting on: <span class="{'missing' if not e.get('paused') else ''}">{E(why)}</span></div>
      <div class="chips">{chips(e['touches'], e['side'])}</div></div>
      <div class="acts">{btn('Resume','opens its conversation', True)}{btn('Close out','runs the close-out checklist and removes the worktree and branch if nothing is lost')}</div></div>''')
today.append('<details class="more"><summary class="muted t-xs">4 branches hold only notes and research</summary>' + ''.join(f'<div class="row slim"><div class="body"><div class="t-xs">{E(d["title"])}</div><div class="hint">Last touched {ago(d["days"])}</div></div><div class="acts">{btn("Open","opens the notes")}{btn("Archive","moves the notes to the archive and removes the branch")}</div></div>' for d in DEV_ONLY) + '</details>')
today.append(f'<div class="callout muted t-xs">Cleaned up automatically at session start, nothing to do: {E(LEFTOVERS["backups"])}; {E(LEFTOVERS["diag"])}.</div></section>')

today.append('<section class="sec"><div class="sechead"><span class="t-base">Bugs hurting users</span><span class="muted t-xs">From the roadmap. It does not record who reported them, so these are all "you". That gap closes when reports become work units.</span></div>')
for b in BUGS:
    today.append(f'''<div class="row">{pic(b['screens'])}<div class="body"><div class="t-sm">{E(b['title'])}</div><div class="hint wrap">Where: {E(b['place'])} · Source: {E(b['src'])}</div></div>
      <div class="acts">{btn('Start a fix','starts a session with the roadmap entry and the screen pasted in', True)}{btn('Not a bug anymore','closes it with a note')}</div></div>''')
today.append('</section>')

today.append(f'<section class="sec"><div class="sechead"><span class="t-base">Since the last release</span><span class="muted t-xs">{E(RELEASE["version"])} on {E(RELEASE["date"])}; the last pre-release was {E(RELEASE["beta"])}. {RELEASE["merges"]} merges since. What users will notice:</span></div><div class="relgrid">')
for g, items, scr in RELEASE['groups']:
    today.append(f'<div class="card inset"><div class="eyebrow">{E(g)}</div><ul class="t-xs">' + ''.join(f'<li>{E(i)}</li>' for i in items) + '</ul></div>')
today.append(f'</div><div class="acts right">{btn("See every merge","opens the full list of 67 with each one\'s before/after")}{btn("Start a pre-release","runs the release skill for 1.3.1-beta.88; nothing in progress blocks it", True)}</div></section>')

today.append(f'''<section class="sec"><div class="sechead"><span class="t-base">Suggested next</span><span class="muted t-xs">One recommendation. Most value for effort.</span></div>
<div class="card"><div class="t-base">{E(SUGGEST['title'])}</div><p class="t-sm">{E(SUGGEST['why'])}</p>
<div class="chips">{''.join(f'<span class="badge">{E(t)}</span>' for t in SUGGEST['touches'])}<span class="badge tip" data-tip="Which promise of the app this serves">{E(SUGGEST['promise'])}</span></div>
<div class="two"><div><div class="eyebrow">How it connects</div><ul class="t-xs">{''.join(f'<li>{E(c)}</li>' for c in SUGGEST['connects'])}</ul></div>
<div><div class="eyebrow">What should be configurable</div><ul class="t-xs">{''.join(f'<li>{E(c)}</li>' for c in SUGGEST['config'])}</ul></div></div>
<div class="acts">{btn('Start it','opens its conversation with the review deck link and this reasoning pasted in', True)}{btn('Other options','shows the two below')}</div>
<details class="more"><summary class="muted t-xs">Other options</summary>{''.join(f'<div class="row slim"><div class="body"><div class="t-xs">{E(a)}</div><div class="hint wrap">{E(b)}</div></div><div class="acts">{btn("Start this instead","opens its conversation")}</div></div>' for a,b in SUGGEST['alternatives'])}</details></div></section>''')

# ----------------------------------------------------------------------------- THE APP
app = []
app.append('<div class="askbar"><span class="t-sm">Show me…</span><div class="tabs qtabs">' + ''.join(f'<button data-q="{E(q)}">{E(q)}</button>' for q,_ in QUESTIONS) + '<button data-q="">Everything</button></div><span class="muted t-xs qnote"></span></div>')
for p, _ in PLACES:
    lst = by_place.get(p, [])
    if not lst: continue
    app.append(f'<section class="sec place" data-place="{E(p)}"><div class="sechead"><span class="t-base">{E(p)}</span><span class="muted t-xs">{len(lst)} screens</span></div><div class="wall">')
    for n in lst:
        v = variants.get(n, [])
        w = work_on(n)
        app.append(f'''<figure class="tile" data-name="{E(n)}" data-variants="{E(json.dumps(v))}" tabindex="0">
          <img src="{thumb(n)}" loading="lazy" alt=""><figcaption><span class="t-xs">{E(n.split('/')[-1] if n.count('/')>0 else n)}</span><span class="t-2xs muted">{E(n)}</span>
          {('<span class="badge">' + str(len(v)) + ' states</span>') if v else ''}{('<span class="status idle"><span class="dot"></span>in progress</span>') if w else ''}</figcaption></figure>''')
    app.append('</div></section>')
# building blocks
cols = ['Chat','Projects','Pages','Marketplace','Settings','Devices & sync']
app.append('<section class="sec"><div class="sechead"><span class="t-base">Building blocks</span><span class="muted t-xs">What every place is assembled from. Filled dot: set here. Hollow: used here. First draft from the repo check; built properly after the eight questions are answered.</span></div><table class="blocks"><thead><tr><th></th>' + ''.join(f'<th>{E(c)}</th>' for c in cols) + '<th></th></tr></thead><tbody>')
for b, cells, note in BLOCKS:
    dup = sum(1 for c in cols if cells.get(c)==2)
    app.append(f'<tr><th>{E(b)}</th>' + ''.join(f'<td><span class="bdot d{cells.get(c,0)}"></span></td>' for c in cols) + f'<td class="t-2xs muted">{E(note)}{" <span class=\"badge warn\">set in "+str(dup)+" places</span>" if dup>=3 else ""}</td></tr>')
app.append('</tbody></table></section>')

# side panel data
panel = {n: dict(desc=DESC.get(n), variants=variants.get(n, []), work=[dict(title=e['title'], days=e['days']) for e in work_on(n)], place=place_of(n)) for n in base}

# ----------------------------------------------------------------------------- PAGE
CSS = open(os.path.join(HERE, 'cc.css')).read()
page = f'''<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>YouCoded — Today</title>
<style>{CSS}
.cc-main{{max-width:1240px}}
.sec{{margin:0 0 28px}} .sechead{{display:flex;align-items:baseline;gap:12px;margin:0 0 10px;flex-wrap:wrap}}
.row{{align-items:flex-start;margin-bottom:8px}} .row.slim{{min-height:36px;padding:6px 10px}} .row .hint.wrap{{white-space:normal}}
.row .shot{{width:112px;height:70px;object-fit:cover;object-position:top;border-radius:var(--radius-sm);border:1px solid var(--edge-dim);background:var(--well);flex:none}}
.acts{{display:flex;gap:6px;flex:none;flex-wrap:wrap;justify-content:flex-end}} .acts.right{{margin-top:10px}}
.chips{{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}}
.goal{{font-size:11px;margin-top:6px;display:flex;align-items:center;gap:6px}} .missing{{color:var(--status-warn)}}
.relgrid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}} .relgrid ul,.two ul{{margin:6px 0 0;padding-left:16px}} .relgrid li{{margin:2px 0}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:10px 0}}
.more{{margin-top:8px}} .more summary{{cursor:pointer}}
.callout{{margin-top:8px}}
.banner{{background:var(--well);border:1px dashed var(--edge);border-radius:var(--radius-md);padding:8px 12px;font-size:12px;color:var(--fg-2);margin-bottom:16px}}
.askbar{{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;position:sticky;top:48px;background:var(--canvas);padding:10px 0;z-index:2}}
.qtabs{{flex-wrap:wrap;border-radius:var(--radius-lg)}} .qtabs button{{border-radius:var(--radius-md);font-size:12px}}
.wall{{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}}
.tile{{margin:0;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-md);overflow:hidden;cursor:pointer;transition:opacity var(--dur-hover) var(--ease),border-color var(--dur-hover) var(--ease)}}
.tile img{{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;display:block;background:var(--well)}}
.tile figcaption{{padding:6px 8px;display:flex;flex-direction:column;gap:2px}} .tile figcaption .badge,.tile figcaption .status{{align-self:flex-start;margin-top:2px}}
.tile.dim{{opacity:.22}} .tile.lit{{border-color:var(--status-ok);box-shadow:0 0 0 2px color-mix(in srgb,var(--status-ok) 35%,transparent)}}
.tile:focus-visible{{outline:2px solid var(--accent)}}
.blocks{{border-collapse:collapse;width:100%}} .blocks th,.blocks td{{padding:6px 8px;text-align:left;border-bottom:1px solid var(--edge-dim);vertical-align:middle}} .blocks thead th{{font-size:11px;color:var(--fg-muted);font-weight:500}} .blocks tbody th{{font-size:12px;font-weight:500;white-space:nowrap}}
.bdot{{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--fg-muted)}} .bdot.d2{{background:var(--fg);border-color:var(--fg)}} .bdot.d1{{background:transparent}} .bdot.d0{{opacity:.15}}
.badge.warn{{border-color:var(--status-warn);color:var(--status-warn)}}
.panel{{position:fixed;top:48px;right:0;bottom:0;width:380px;background:var(--panel);border-left:1px solid var(--edge);padding:16px;overflow:auto;transform:translateX(100%);transition:transform var(--dur-reveal) var(--ease);z-index:5}} .panel.open{{transform:none}}
.panel img.big{{width:100%;border-radius:var(--radius-sm);border:1px solid var(--edge-dim)}} .panel .strip{{display:flex;gap:6px;overflow:auto;padding:4px 0}} .panel .strip img{{height:54px;border-radius:3px;border:1px solid var(--edge-dim)}}
.toast{{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--accent);color:var(--on-accent);padding:10px 14px;border-radius:var(--radius-md);font-size:12px;max-width:560px;opacity:0;transition:opacity var(--dur-hover);z-index:9;pointer-events:none}} .toast.show{{opacity:1}}
.view{{display:none}} .view.on{{display:block}}
select{{font:inherit;font-size:12px;background:var(--inset);color:var(--fg);border:1px solid var(--edge);border-radius:var(--radius-md);padding:4px 8px}}
</style></head><body>
<header class="cc-header"><span class="title">YouCoded</span>
<div class="tabs" role="tablist"><button role="tab" aria-selected="true" data-view="today">Today</button><button role="tab" aria-selected="false" data-view="app">The app <span class="count">{len(base)} screens</span></button></div>
<span class="spacer"></span><span class="muted t-2xs">as of Oct 12, 2026 · latest main</span>
<select id="theme"><option value="light">Light</option><option value="dark">Dark</option><option value="midnight">Midnight</option><option value="creme">Creme</option></select></header>
<main class="cc-main">
<div class="banner">A draft to react to, not a working tool. Every row is real as of Oct 12: branches, pull requests, merges, the roadmap, and today's screenshot run. Screenshots come from the screen-restyle branch, not yet from main. Buttons only say what they would do. The one-sentence screen descriptions were written for this draft; the real version has an agent write them when a screen's code changes.</div>
<div id="today" class="view on">{''.join(today)}</div>
<div id="app" class="view">{''.join(app)}</div>
</main>
<aside class="panel" id="panel"></aside>
<div class="toast" id="toast"></div>
<script>
const PANEL={json.dumps(panel)}; const LIGHT={json.dumps(light)}; const THUMB=n=>'thumbs/'+n.replaceAll('/','__')+'.jpg';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let tt; function toast(m){{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),3200)}}
document.addEventListener('click',e=>{{const b=e.target.closest('[data-does]');if(b){{toast('In the real version this '+b.dataset.does+'.');e.preventDefault();}}}});
$$('[data-view]').forEach(b=>b.onclick=()=>{{$$('[data-view]').forEach(x=>x.setAttribute('aria-selected',x===b));$$('.view').forEach(v=>v.classList.toggle('on',v.id===b.dataset.view));$('#panel').classList.remove('open');window.scrollTo(0,0)}});
$('#theme').onchange=e=>document.documentElement.dataset.theme=e.target.value;
$$('.qtabs button').forEach(b=>b.onclick=()=>{{$$('.qtabs button').forEach(x=>x.setAttribute('aria-selected',x===b));const q=b.dataset.q;const lit=new Set(q?LIGHT[q]:[]);
  $$('.tile').forEach(t=>{{const n=t.dataset.name;const vs=JSON.parse(t.dataset.variants);const on=lit.has(n)||vs.some(v=>lit.has(v));t.classList.toggle('lit',!!q&&on);t.classList.toggle('dim',!!q&&!on)}});
  $$('.place').forEach(s=>{{s.style.display=(!q||s.querySelector('.tile.lit'))?'':'none'}});
  $('.qnote').textContent=q?(lit.size+' screens. Worked out from the screen list and the branches; the real version reads the code.'):''}});
$$('.tile').forEach(t=>{{const open=()=>{{const n=t.dataset.name,d=PANEL[n];const p=$('#panel');
  p.innerHTML=`<div class="eyebrow">${{d.place}}</div><div class="t-base">${{n}}</div><p class="t-sm">${{d.desc||'<span class="missing">No description yet. The real version has an agent write one sentence when this screen\\'s code changes, and marks it stale when the code changes again.</span>'}}</p>
  <img class="big" src="${{THUMB(n)}}" alt="">
  ${{d.variants.length?`<div class="eyebrow" style="margin-top:12px">${{d.variants.length}} states</div><div class="strip">${{d.variants.map(v=>`<img src="${{THUMB(v)}}" title="${{v}}" alt="">`).join('')}}</div>`:''}}
  <div class="eyebrow" style="margin-top:12px">Work touching it</div>${{d.work.length?d.work.map(w=>`<div class="row slim"><div class="body"><div class="t-xs">${{w.title}}</div><div class="hint">last worked on ${{w.days===0?'today':w.days+' days ago'}}</div></div></div>`).join(''):'<div class="muted t-xs">Nothing open.</div>'}}
  <div class="eyebrow" style="margin-top:12px">History</div><div class="muted t-xs">One picture per merge, newest first, with the change highlighted. Starts collecting once this runs on every merge.</div>
  <div class="acts" style="margin-top:14px;justify-content:flex-start"><button class="btn sm primary" data-does="saves your comment as a work unit with you as the source, and shows it in Today">Comment</button><button class="btn sm" data-does="opens a chat already pointed at this screen\\'s code">Ask about this</button><button class="btn sm" data-does="opens the before/after for the last merge that touched it">What changed</button><button class="btn ghost sm" onclick="document.getElementById('panel').classList.remove('open')">Close</button></div>`;
  p.classList.add('open')}};t.onclick=open;t.onkeydown=e=>{{if(e.key==='Enter')open()}}}});
</script></body></html>'''
open(os.path.join(HERE, 'mockup.html'), 'w').write(page)
print('screens', len(names), 'base', len(base), 'places', {p: len(v) for p, v in by_place.items()})
print('wrote mockup.html', len(page)//1024, 'KB')
