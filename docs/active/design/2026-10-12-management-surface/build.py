#!/usr/bin/env python3
"""Builds mockup.html: the first draft of the management surface, with real data.

WHY a builder and not a hand-written page: every row below is a fact from the repos as of
2026-10-12 (branches, pull requests, merges, roadmap, today's screenshot run). The real
version replaces the DATA block with a collector; the rendering stays. Thumbnails come from
thumbs/ (made from the ui-consistency-audit worktree's shoot run 20261012-141521, light theme).
"""
import json, os, re, html, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vision_tab import render as vrender, CSS as VCSS, JS as VJS, SVG_CSS, STATUS_WORD  # noqa
import screens_tab as stab
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
       touches=['Dev tooling'], side='behind', note='One change; the test now checks the streamed sentence whole again.', screens=[]),
  dict(id='usage-visibility-20260929', title='Usage: one account at a time, limit line over the token bars', last='2026-09-29', days=13,
       touches=['Settings'], side='screens', note='Round 2 of the review deck answered.', screens=['settings/assistant/cloud','settings/account']),
  dict(id='specialists-plans', title='Helper agents (Specialists) show a plan and a budget before acting', last='2026-09-26', days=16,
       touches=['Chat','Settings'], side='both', note='Three lines of work, 138 saved changes: the biggest unfinished thing. A hand-off note says stage 1 is done.',
       screens=['chat/specialists','settings/assistant/specialists','chat#questions']),
  dict(id='plugin-project-controls', title='Project skills & tools: per-project control of what the assistant uses', last='2026-09-24', days=18,
       touches=['Projects','Marketplace','Chat'], side='both', note='Two changes are waiting for review. Their title says "UI review pending".',
       screens=['projects','marketplace','chat/skills'], pr='waiting for review, tests pass', prtip='Pull requests #571 and #203'),
  dict(id='theme-plugin-update', title='Bundled skill content delivered on app update', last='2026-09-22', days=20,
       touches=['Marketplace'], side='behind', note='A fix in the plugin installer plus the Morning Rounds mascot decisions.', screens=['marketplace/theme-detail']),
  dict(id='onedrive-no-auto-download', title='OneDrive files: read without auto-downloading', last='2026-09-15', days=27,
       touches=['Projects','Chat'], side='both', note='Paused on purpose. The change waiting for review says "known regressions". A hand-off note says where it stopped.',
       screens=['projects/files','chat/files'], pr='waiting for review, tests fail', prtip='Pull request #476', paused='Known regressions; paused with a handoff'),
  dict(id='offline-auth-bypass', title='Offline use, sign-in expiry and the startup menu', last='2026-09-14', days=28,
       touches=['Settings'], side='screens', note='A questions deck was answered; nothing built yet.', screens=['first-run','settings/account']),
  dict(id='agent-lint-tooling', title='Faster type checks and a design lint for agents', last='2026-09-14', days=28,
       touches=['Dev tooling'], side='behind', note='Swaps two code-checking tools; adds a design check that only reports.', screens=[]),
  dict(id='files-drawer-honesty', title='Files drawer: the bytes reader follows the link before it decides', last='2026-09-11', days=31,
       touches=['Chat','Projects'], side='both', note='Review answers recorded: all four kept.', screens=['chat/files','projects/files']),
  dict(id='model-picker-tags', title='Model picker: tags, a filter panel, plainer hints', last='2026-09-11', days=31,
       touches=['Chat'], side='screens', note='Design review answered (chips, sentence case, shorter hovers).', screens=['chat/model-picker']),
  dict(id='sync-safety-audit-20260908', title='Sync safety: backup-target selection fix', last='2026-09-11', days=31,
       touches=['Devices & sync'], side='behind', note='Reviewed and passing on Sept 9. Never put in the app.', screens=['settings/sync'], ready=True),
  dict(id='sync-retry-feedback', title='Sync: acknowledge retry attempts', last='2026-09-07', days=35,
       touches=['Devices & sync'], side='behind', note='A change waiting for review; its tests fail. Nobody has looked since Sept 8.', screens=['settings/sync'], pr='waiting for review, tests fail', prtip='Pull request #444'),
  dict(id='permission-ask-timeout', title='Permission asks that time out', last='2026-07-31', days=73,
       touches=['Chat'], side='behind', note='Five review findings closed, then silence.', screens=['chat#bubbles-approval','settings/assistant/permissions']),
  dict(id='ask-claude-reference-ux', title='"Ask Claude" reference marks in documents', last='2026-07-28', days=76,
       touches=['Files & documents'], side='screens', note='Last change fixes outlines on marks that share a line.', screens=['office/document']),
]
DEV_ONLY = [  # branches that only hold docs or investigations
  dict(id='integrations-research', title='Integrations research: Todoist install failure; Google Messages is Windows-only', last='2026-09-27', days=15),
  dict(id='marketing-ads', title='First Google Search + YouTube ads experiment plan', last='2026-09-26', days=16),
  dict(id='dev-dashboard', title='The September dev dashboard draft (you said: mostly toss it)', last='2026-09-05', days=37),
  dict(id='conversation-triage-script', title='A triage script that was never saved anywhere safe', last='2026-09-04', days=38),
]
LEFTOVERS = dict(
  backups='7 saved copies from Sept 11 (snapshots of unsaved work that has since been saved elsewhere)',
  bots='7 automatic library updates, all with failing tests (5 for Android from Sept 3, 2 for desktop from Oct 5–8)',
  diag='1 temporary diagnostics copy marked "not for the app" (Sept 18)',
  worktrees=['compaction-handoff-20260922 (Sept 23)','model-picker-tags (Sept 11)','pages-empty-before (Sept 23)','plugin-project-controls (Sept 24)',
             'specialists-plans-wrapup (Sept 26)','theme-plugin-update (Sept 23)','specialists-plans-decisions (Sept 26)','plans-r12-after (Sept 19)','plans-r12-before (Sept 18)','specialists-plans (Sept 26)'],
)
BUGS = [  # from the roadmap's next-release and top-priority entries; it records no reporter
  dict(title='Searching a big project stops early, for file names and for text inside files', place='Projects', src='top priority, confirmed, checked Sept 18', screens=['projects/files/filter']),
  dict(title='Error messages still guess at causes in many places', place='Chat', src='top priority, confirmed, checked Sept 11, full list of messages attached', screens=['chat#openrouter-key-rejected','settings/sync#auth-error']),
  dict(title='Mac downloads may open as "broken": nothing is signed or notarized', place='Getting started', src='top priority', screens=['first-run']),
  dict(title='After a wide "Always allow", a later command that only looks similar may run without asking', place='Chat', src='top priority, in the assistant', screens=['settings/assistant/permissions','chat#bubbles-approval']),
  dict(title='Gemma models download with no licence notice', place='Settings', src='in local models', screens=['settings/assistant/local']),
  dict(title='The settings screen exists twice, once for desktop and once for phone', place='Settings', src='in the interface, blocked on simplification', screens=['settings']),
]
RELEASE = dict(version='v1.3.0', date='Sept 20', beta='Sept 19', merges=67, groups=[
  ('Chat', ['Switching between chats is faster, and many open tabs no longer slow things down','Verified chat performance fixes','Scrolling feels right again; a chat no longer vanishes; a stuck drag in the switcher is fixed','Custom words for voice dictation; voice reliability','Oversized images are handled safely','Picking up a conversation again, and what a helper agent is doing, both show properly'], ['chat','chat/switcher','chat/resume','chat/status-bar']),
  ('Pages', ['Pages can connect to Home Assistant'], ['pages/library/connections']),
  ('Settings and account', ['Sign in with the official ChatGPT flow','The buddy can be hidden from the tray','A cleaner minimal-chrome theme; the Mac dock icon; a sudo prompt that explains itself'], ['settings/account','settings/buddy','settings/appearance']),
  ('Devices and sync', ['Sync repairs itself more robustly and explains what it did','Sync watches only what it should'], ['settings/sync']),
  ('Installing', ['Windows builds are signed','Windows developer mode is no longer required','Linux catalog screenshots'], ['first-run']),
  ('Behind the scenes', ['One shared engine for desktop and Android','Startup speed; an always-on hitch recorder','Brand identity and the website','Tools for reviewing screens, doc clean-ups, a shorter changelog'], []),
])
SUGGEST = dict(
  title='Finish "Project skills & tools"',
  why='It is the most finished unfinished thing: a top-priority item, changes waiting for review since Sept 24, tests passing, waiting only on your review of the screens. Low effort for a feature users will feel.',
  whytip='Pull requests #571 and #203',
  promise='each project decides what the assistant may use.', promisename='Yours to shape',
  touches=['Projects','Marketplace','Chat'],
  connects=['The roadmap\'s built-in "Your Assistant" project needs the same per-project switches','Native-only users still have no skills home of their own (a release blocker); this work is where that home gets decided','Marketplace search from inside a chat would read the same list'],
  config=['Per project: which skills and tools are on','A default for new projects','Whether a plugin may turn itself on in every project'],
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
  ('Skills & commands',     {'Chat':1,'Projects':0,'Pages':0,'Marketplace':2,'Settings':0,'Devices & sync':0}, 'Installed from the marketplace, used in chat. Per-project control is the unfinished work on Today.'),
  ('Tools the assistant can use',   {'Chat':1,'Projects':0,'Pages':1,'Marketplace':2,'Settings':0,'Devices & sync':0}, 'Add-ons bundle them; chat uses them; Pages reach the assistant through one. No settings screen exists.'),
  ('Permissions',           {'Chat':2,'Projects':1,'Pages':2,'Marketplace':0,'Settings':2,'Devices & sync':0}, 'Set in Settings, asked in chat, granted once per Page connection. Three places.'),
  ('Automatic actions (hooks)',                 {'Chat':0,'Projects':0,'Pages':0,'Marketplace':2,'Settings':0,'Devices & sync':0}, 'Only add-ons carry them. Nothing shows them to you.'),
  ('Connections & accounts',{'Chat':0,'Projects':0,'Pages':2,'Marketplace':2,'Settings':2,'Devices & sync':0}, 'Set up in three places: a Page, a listing, Settings.'),
  ('Theme',                 {'Chat':1,'Projects':0,'Pages':1,'Marketplace':2,'Settings':2,'Devices & sync':0}, 'Picked in Settings or the marketplace; Pages and the status bar follow it.'),
  ('Saved recipes (helper agents)', {'Chat':1,'Projects':0,'Pages':0,'Marketplace':2,'Settings':2,'Devices & sync':0}, 'The closest thing to a reusable agent today: prompt, tools, read/write rule, model preference.'),
  ('Device',                {'Chat':0,'Projects':0,'Pages':0,'Marketplace':0,'Settings':0,'Devices & sync':1}, 'Only an idea so far: a future version would let you choose which computer runs this.'),
]

# ----------------------------------------------------------------------------- screens
names = sorted(f[:-4].replace('__','/') for f in os.listdir(THUMBS) if f.endswith('.jpg'))
def thumb(n): return 'thumbs/' + n.replace('/','__') + '.jpg'
def pic(cands):
    """First existing thumbnail for any of the screen names, trying the screen's states too."""
    for s in cands:
        for n in [s] + [x for x in names if x.startswith(s + '#') or x.startswith(s + '/')]:
            # WHY a button: a picture on Today opens the same picture popup the Screens tab uses
            if os.path.exists(os.path.join(HERE, thumb(n))): return f'<button class="shotbtn" data-shot="{E(n.split("#")[0])}" data-tip="{T('today.pic')}"><img class="shot" src="{thumb(n).replace("#", "%23")}" alt=""></button>'
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
from tooltips import TIP, TRACK_SHORT
def T(k): return E(TIP[k])
# WHY the rebuild (2026-10-12 review, Destin: "throws a fuckton at me at once"): Today now opens
# first and leads with ONE recommended next step; the long lists (waiting, bugs, release) are
# folded rows with a count, and each view has a single filled button (design guide G-4).
# WHY every control carries data-tip (2026-10-13, Destin: "i want hover tooltips that elaborate on
# various buttons/pages/popups etc in laymans terms"): the words live in tooltips.py; check_tips()
# below refuses to write a page with an unexplained button, pill, badge, count or status mark.
SIDE_WORD = {'screens':'changes what you see','behind':'changes how it works','both':'both'}
def meta(touches, side):
    """One quiet line instead of five badges: where it lands, then which side of the app."""
    return f'<div class="t-2xs muted metaline"><span data-tip="{T("today.lands")}">Lands in {E(" · ".join(touches))}</span> · <span class="side {E(side)}" data-tip="{T("side." + side)}">{E(SIDE_WORD[side])}</span></div>'
def btn(label, key, kind=''):
    # WHY kind is ignored (2026-10-13, audit #13): Destin's F-2 rule makes every action beside a
    # main one an outlined button, never bare text; the one filled button per view is written inline.
    # WHY data-does is bare: the click toast reads the same hint text, so the two always agree.
    return f'<button class="btn sm" data-does data-tip="{T(key)}">{E(label)}</button>'
def ago(d): return 'today' if d == 0 else ('yesterday' if d == 1 else f'{d} days ago')
def fold(title, count, hint, body, tip, ctip=None, open_=False):
    """G-29 expandable row: title + muted count (G-19) + one-line hint, chevron on the right."""
    c = f' <span class="cnt" data-tip="{T(ctip)}">{count}</span>' if count is not None else ''
    return f'<details class="fold sec"{" open" if open_ else ""}><summary class="foldrow big" data-tip="{T(tip)}"><span class="fbody"><span class="gh">{E(title)}{c}</span><span class="t-xs muted">{E(hint)}</span></span><span class="chev" aria-hidden="true">›</span></summary><div class="foldbody">{body}</div></details>'
def sechead(title, count, hint='', tip=None, ctip=None):
    c = f' <span class="cnt" data-tip="{T(ctip)}">{count}</span>' if count is not None else ''
    # WHY h2 + description (audit #7): the app's full-screen group heading is 16px medium in normal
    # case with a muted line under it; spaced capitals were retired app-wide.
    return f'<div class="sechead"><div class="gtext"><h2 class="gh"><span data-tip="{T(tip)}">{E(title)}</span>{c}</h2>{f"<p class=\'gdesc\'>{E(hint)}</p>" if hint else ""}</div></div>'

# ----------------------------------------------------------------------------- TODAY
active = [e for e in EFFORTS if e['days'] <= 7]
IN_NEEDS = {'plugin-project-controls','sync-retry-feedback','sync-safety-audit-20260908'}
waiting = [e for e in EFFORTS if e['days'] > 7 and e['id'] not in IN_NEEDS]
# WHY "Project skills & tools" is gone from this list: it is the suggested next step at the top,
# and the old page showed it twice (Destin's rule: nothing repeated twice in one view).
# WHY renamed (2026-10-13 cut): "library updates" and "tests" were developer words; they now say
# "code the app borrows" and "automatic checks".
needs = [
  ('Sync safety: backup-target selection fix', 'Reviewed and passing its checks on Sept 9, but never put in the app. Untouched 31 days.', None,
   [btn('Put it in the app','today.putin'), btn('See before and after','today.beforeafter'), btn('Hold','today.hold')]),
  ('Sync: acknowledge retry attempts', 'Waiting for review since Sept 8; its automatic checks fail. Nobody has looked.', 'Pull request #444',
   [btn('Fix the failing checks','today.fixchecks'), btn('Drop it','today.drop')]),
  ('7 automatic updates to code the app borrows, all failing their checks', 'Five for Android from Sept 3, two for desktop from Oct 5 and 8.', None,
   [btn('Apply all seven and check them','today.applyall'), btn('Drop them','today.dropall')]),
  ('10 unfinished copies with unsaved changes, untouched for two weeks or more', 'They cannot be cleaned up automatically because the changes are not saved anywhere.', None,
   [btn('Save them all','today.saveall'), btn('List them','today.listthem')]),
]
today = []
S = SUGGEST
today.append(f'''<section class="card hero"><div class="eyebrow"><span data-tip="{T('today.start')}">Start here · suggested next</span></div>
<div class="herobody"><div class="herotext"><div class="t-lg">{E(S['title'])}</div><p class="t-sm dim">{E(S['why'])}</p>
<div class="t-xs muted"><span data-tip="{T('today.lands')}">Lands in {E(" · ".join(S['touches']))}</span><br><span data-tip="{T('today.serves')}">Serves: &ldquo;{E(S['promisename'])}&rdquo; &mdash; {E(S['promise'])}</span></div></div>
{pic(['projects','marketplace'])}</div>
<div class="acts heroacts">{btn('Set aside','today.setaside')}{btn('Open its conversation','today.openconv')}<button class="btn sm primary" data-does data-tip="{T('today.deck')}">Open its review deck</button></div>
<div class="herofolds">
<details class="fold"><summary class="foldrow" data-tip="{T('today.why')}"><span class="t-xs">Why this one</span><span class="chev">›</span></summary>
<div class="two"><div><div class="eyebrow">How it connects</div><ul class="t-xs">{''.join(f'<li>{E(c)}</li>' for c in S['connects'])}</ul></div>
<div><div class="eyebrow">What should be adjustable</div><ul class="t-xs">{''.join(f'<li>{E(c)}</li>' for c in S['config'])}</ul></div></div></details>
<div class="t-xs muted">Other options: the two in-progress items below, or anything in Waiting.</div>
</div></section>''')

today.append('<section class="sec">' + sechead('Needs you', len(needs), 'Only you can decide these.', 'today.needs', 'today.needs.count'))
for t, hint, htip, bs in needs:
    h = f'<span data-tip="{T("today.pr")} ({E(htip)})">{E(hint)}</span>' if htip else E(hint)
    today.append(f'<div class="row"><div class="body"><div class="t-sm">{E(t)}</div><div class="hint wrap">{h}</div></div><div class="acts">{"".join(bs)}</div></div>')
today.append(f'<div class="eyebrow othersh"><span data-tip="{T("today.reports")}">Reports from other people</span></div><div class="t-xs muted">No open reports. The last one was from tjmorin03 on Sept 15, closed.</div></section>')

def seescreens(e):
    return f'<button class="btn sm" data-effscreens="{EFFORTS.index(e)}" data-tip="{T("today.seescreens")}">See its screens</button>' if e['screens'] else ''
today.append('<section class="sec">' + sechead('In progress', len(active), 'Touched in the last 7 days. Neither has a finish line yet.', 'today.inprog', 'today.inprog.count'))
for e in active:
    today.append(f'''<div class="row">{pic(e['screens'])}<div class="body"><div class="t-sm">{E(e['title'])}</div>
      <div class="hint wrap">Last worked on {ago(e['days'])}. {E(e['note'])}</div>{meta(e['touches'], e['side'])}</div>
      <div class="acts">{seescreens(e)}{btn('Open its conversation','today.openconv')}{btn('Write its finish line','today.finishline')}{btn('Set aside','today.setaside')}</div></div>''')
today.append('</section>')

w = []
for e in waiting:
    pr = f' · <span data-tip="{T("today.pr")} ({E(e["prtip"])})">{E(e["pr"].replace("tests", "checks"))}</span>' if e.get('pr') else ''
    paused = f'<div class="hint wrap">Waiting on: {E(e["paused"])}</div>' if e.get('paused') else ''
    w.append(f'''<div class="row"><div class="body"><div class="t-sm">{E(e['title'])}</div>
      <div class="hint wrap">{ago(e['days']).capitalize()}{pr}. {E(e['note'])}</div>{paused}{meta(e['touches'], e['side'])}</div>
      <div class="acts">{seescreens(e)}{btn('Open its conversation','today.openconv')}{btn('Wrap up','today.wrapup')}</div></div>''')
w.append('<div class="sub">' + sechead('Notes and research only', len(DEV_ONLY), '', 'today.notes', 'today.notes.count') + ''.join(f'<div class="row slim"><div class="body"><div class="t-sm">{E(d["title"])}</div><div class="hint">Last touched {ago(d["days"])}</div></div><div class="acts">{btn("Open","today.opennotes")}{btn("Archive","today.archive")}</div></div>' for d in DEV_ONLY) + '</div>')
w.append(f'<div class="t-xs muted note">Cleaned up automatically at session start, nothing to do: {E(LEFTOVERS["backups"])}; {E(LEFTOVERS["diag"])}.</div>')
today.append(fold('Waiting', len(waiting), 'Untouched for a week or more. Only one says why.', ''.join(w), 'today.waiting', 'today.waiting.count'))

b = []
for x in BUGS:
    b.append(f'''<div class="row">{pic(x['screens'])}<div class="body"><div class="t-sm">{E(x['title'])}</div><div class="hint wrap">In {E(x['place'])} · {E(x['src'])}</div></div>
      <div class="acts">{btn('Start a fix','today.startfix')}{btn('Not a bug anymore','today.notbug')}</div></div>''')
today.append(fold('Bugs users hit', len(BUGS), 'From the roadmap, which does not record who reported them.', ''.join(b), 'today.bugs', 'today.bugs.count'))

r = ['<div class="relgrid">']
for g, items, scr in RELEASE['groups']:
    r.append(f'<div class="card inset"><div class="eyebrow"><span data-tip="{T("today.relgroup")}">{E(g)}</span></div><ul class="t-xs">' + ''.join(f'<li>{E(i)}</li>' for i in items) + '</ul></div>')
r.append(f'</div><div class="t-xs muted note">The most recent test version went out {E(RELEASE["beta"])}.</div><div class="acts right">{btn("See all 67 changes","today.allchanges")}{btn("Start a test release","today.testrelease")}</div>')
today.append(fold('Since the last release', None, f'{RELEASE["version"]} went out {RELEASE["date"]}; {RELEASE["merges"]} changes have landed since. What users will notice.', ''.join(r), 'today.release'))

# ----------------------------------------------------------------------------- SCREENS
# WHY cut (2026-10-13, Destin: "just wayyy too many controls"): screens_tab.py now draws one
# control row and the picture popup; this only feeds it the page's data.
QPATS = [(q, pats) for q, pats in QUESTIONS if pats and not pats[0].startswith('#')]
REL_PATS = sorted({s for g in RELEASE['groups'] for s in g[2]})
SGROUPS = stab.build(HERE, names, place_of, DESC, EFFORTS, REL_PATS, QPATS, matches)
app = [stab.head_controls(TIP), '<p class="t-xs muted scount" id="scount"></p><div id="sbody"></div>']
cols = ['Chat','Projects','Pages','Marketplace','Settings','Devices & sync']
BDOT = {2: 'bdot.2', 1: 'bdot.1', 0: 'bdot.0'}
bt = ['<p class="t-xs muted">Filled dot: you set it here. Hollow: it is used here. A first draft; it will be built properly later.</p><div class="tablewrap"><table class="blocks"><thead><tr><th></th>' + ''.join(f'<th><span data-tip="{T("scr.blocks.col")}">{E(c)}</span></th>' for c in cols) + '<th></th></tr></thead><tbody>']
for bname, cells, note in BLOCKS:
    dup = sum(1 for c in cols if cells.get(c)==2)
    bt.append(f'<tr><th><span data-tip="{T("part." + bname)}">{E(bname)}</span></th>' + ''.join(f'<td><span class="bdot d{cells.get(c,0)}" data-tip="{T(BDOT[cells.get(c,0)])}"></span></td>' for c in cols) + f'<td class="t-2xs muted">{E(note)}{f" <span class=\"spill warn\" data-tip=\"{T("scr.set3")}\"><span class=\"dot\"></span>set in {dup} places</span>" if dup>=3 else ""}</td></tr>')
bt.append('</tbody></table></div>')
app.append(fold('Which parts are set in more than one place', None, 'Each row is one part of the app; a filled dot is a place where you set it.', ''.join(bt), 'scr.blocks'))


# ----------------------------------------------------------------------------- tooltips
# WHY the app's Tooltip and not a CSS ::after (Tooltip.tsx on the UI-consistency branch): one
# bubble on the layer surface ('px-2 py-1 text-2xs text-fg-2 leading-snug', max 20rem), 800ms
# before the first one, 130ms for a neighbour within 400ms, a 110ms fade; below the control,
# flipped above when there is no room, and kept 12px inside the window so it is never clipped.
TIP_CSS = '''
.tipbubble{position:fixed;left:0;top:0;z-index:60;pointer-events:none;padding:4px 8px;max-width:min(20rem,calc(100vw - 1.5rem));font-size:11px;line-height:1.375;color:var(--fg-2);background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-xl);box-shadow:var(--layer-shadow);white-space:normal;text-align:left}
@keyframes tooltip-in{from{opacity:0}to{opacity:1}}
.tooltip-in{animation:tooltip-in 110ms ease-out both}
@media (prefers-reduced-motion:reduce){.tooltip-in{animation:none}}
'''
TIP_JS = r'''
const TB=document.createElement('div');TB.className='tipbubble';TB.setAttribute('role','tooltip');TB.id='tipbubble';TB.hidden=true;document.body.appendChild(TB);
let tipT=null,tipFor=null,tipWarm=0;
function placeTip(el){const r=el.getBoundingClientRect(),w=TB.offsetWidth,h=TB.offsetHeight,G=6,M=12;
  let top=r.bottom+G;if(top+h>innerHeight-M&&r.top-G-h>=M)top=r.top-G-h;
  const left=Math.min(Math.max(M,r.left+r.width/2-w/2),innerWidth-M-w);TB.style.left=left+'px';TB.style.top=Math.max(M,top)+'px'}
function showTip(el){if(!el||!el.isConnected||!el.dataset.tip)return;TB.textContent=el.dataset.tip;TB.hidden=false;TB.classList.remove('tooltip-in');void TB.offsetWidth;TB.classList.add('tooltip-in');placeTip(el);tipFor=el}
function hideTip(){clearTimeout(tipT);if(tipFor)tipWarm=Date.now()+400;tipFor=null;TB.hidden=true}
function armTip(el){clearTimeout(tipT);const warm=tipFor||Date.now()<tipWarm;if(tipFor){tipWarm=Date.now()+400;tipFor=null;TB.hidden=true}tipT=setTimeout(()=>showTip(el),warm?130:800)}
function onOver(e){const el=e.target.closest&&e.target.closest('[data-tip]');if(el===tipFor)return;if(!el){hideTip();return}armTip(el)}
document.addEventListener('mouseover',onOver);document.addEventListener('mouseenter',onOver,true);
document.addEventListener('mouseleave',e=>{if(e.target===document.documentElement)hideTip()},true);
// keyboard focus shows the same hint (the app's Tooltip does the same); a mouse click does not
document.addEventListener('focusin',e=>{const el=e.target.closest('[data-tip]');if(el&&el.matches(':focus-visible'))armTip(el)});
document.addEventListener('focusout',hideTip);
document.addEventListener('mousedown',hideTip,true);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tipFor){hideTip()}},true);
addEventListener('scroll',hideTip,true);addEventListener('resize',hideTip);
window.showTip=showTip;window.hideTip=hideTip;
'''

def check_tips(page):
    """WHY (2026-10-13, Destin): nothing ships unexplained. Every <button>, <select>, <summary>,
    search box, filter pill, badge, status pill, count and status mark in the page, including the
    ones the page's scripts draw later, must carry data-tip. Marks hidden from screen readers
    (aria-hidden) are decoration inside something that already explains itself. Also refuses any
    title= attribute: the operating system draws those in its own grey box, on top of ours."""
    bad = []
    for m in re.finditer(r'<(button|select|summary|input|span|div|i|figure|h2|h3|dt)\b([^<>]*)>', page):
        tag, attrs = m.group(1), m.group(2)
        cls = re.search(r'class="([^"]*)"', attrs)
        cls = cls.group(1).split() if cls else []
        need = tag in ('button', 'select', 'summary', 'input') or any(c in ('fchip', 'badge', 'spill', 'cnt', 'count', 'sdot', 'statusline', 'status', 'pill', 'leg', 'bdot') for c in cls)
        if need and 'data-tip' not in attrs and 'aria-hidden="true"' not in attrs:
            bad.append(m.group(0)[:140])
    titles = re.findall(r'<(?!title)[a-z]+\b[^<>]*\stitle="', page)
    if bad or titles:
        raise SystemExit('check_tips: these have no hover hint (add one to tooltips.py):\n  ' + '\n  '.join(bad[:40] + titles[:10]) + f'\n({len(bad)} missing, {len(titles)} title= attributes)')

# ----------------------------------------------------------------------------- PAGE
vision_html, vision_nodes, vision_tot = vrender(HERE, TIP, TRACK_SHORT)
CSS = open(os.path.join(HERE, 'cc.css')).read() + open(os.path.join(HERE, 'page.css')).read()
def _ic(d): return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>'
ICON_HOME=_ic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>')
ICON_TODAY=_ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
ICON_SCREENS=_ic('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>')
ICON_MAP=_ic('<path d="M9 4l-6 3v13l6-3 6 3 6-3V4l-6 3z"/><path d="M9 4v13M15 7v13"/>')
CHEV='<span class="chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span>'
# WHY the header holds only the tabs, the theme, the Draft tag and the date (2026-10-13 cut): every
# other control moved into the tab it belongs to, or was removed.
page = f'''<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouCoded — Today</title>
<style>{CSS}{stab.CSS}{VCSS}{SVG_CSS}{TIP_CSS}</style></head><body>
<div class="screen">
<header class="band"><div class="bl"><span class="badge draft" tabindex="0" data-tip="{T('draft')}">Draft ⓘ</span></div>
<div class="btitle">{ICON_HOME}YouCoded</div>
<div class="br"><span class="muted t-2xs asof" data-tip="{T('asof')}">Facts as of Oct 12</span><div class="bandpill" data-tip="{T('theme')}"><select id="theme" aria-label="Theme" data-tip="{T('theme')}"><option value="light">Light</option><option value="dark">Dark</option><option value="midnight">Midnight</option><option value="creme">Creme</option></select></div></div></header>
<div class="screen-body"><div class="pane">
<div class="panehead hline" id="panehead"><div class="tabs" role="tablist" aria-label="Views"><button role="tab" aria-selected="true" data-view="today" data-tip="{T('tab.today')}">{ICON_TODAY}Today</button><button role="tab" aria-selected="false" data-view="app" data-tip="{T('tab.screens')}">{ICON_SCREENS}Screens <span class="count" data-tip="{T('tab.screens.count')}">{len(SGROUPS)}</span></button><button role="tab" aria-selected="false" data-view="vision" data-tip="{T('tab.vision')}">{ICON_MAP}Big picture</button></div></div>
<div class="panescroll fadescroll" id="scroller"><main class="cc-main">
<div id="today" class="view on">{''.join(today)}</div>
<div id="app" class="view">{''.join(app)}</div>
<div id="vision" class="view">{vision_html}</div>
</main></div></div></div></div>
<aside class="panel" id="panel" aria-label="Details"><div class="phd hline"><div class="t-base" id="pti"></div><button class="closebtn" aria-label="Close" id="pclose" data-tip="{T('vis.panel.close')}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div><div class="pbody fadescroll" id="pbody"></div><div class="pfoot" id="pfoot"></div></aside>
{stab.dialog_shell(TIP)}
<div class="toast" id="toast"></div>
<script>
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
// WHY (T-02, approved): a fixed head over a separately scrolling body; the body fades 42px at an edge
// only while more is hidden there. Same data-fade-top/bottom switch the app's useScrollFade sets.
function fade(el){{if(!el)return;el.dataset.fadeTop=el.scrollTop>1;el.dataset.fadeBottom=el.scrollTop+el.clientHeight<el.scrollHeight-1}}
function fadeX(el){{el.dataset.fadeLeft=el.scrollLeft>1;el.dataset.fadeRight=el.scrollLeft+el.clientWidth<el.scrollWidth-1}}
// WHY (U12): at phone width the tab and filter rows scroll sideways; a fade shows which edge has more
function fadesX(){{$$('.tabs,.fchips').forEach(el=>{{if(!el.dataset.fx){{el.dataset.fx=1;el.addEventListener('scroll',()=>fadeX(el),{{passive:true}})}}fadeX(el)}})}}
function fades(){{requestAnimationFrame(()=>{{fade($('#scroller'));fade($('#pbody'));fadesX()}})}}
{TIP_JS}
addEventListener('DOMContentLoaded',()=>{{['#scroller','#pbody'].forEach(s=>$(s).addEventListener('scroll',e=>fade(e.target),{{passive:true}}));addEventListener('resize',fades);
  // WHY: the Screens control row lives in the fixed head (like Projects' tab row), not in the scroll body
  $$('.view .lensbar').forEach(l=>{{l.dataset.view=l.closest('.view').id;l.hidden=!l.closest('.view').classList.contains('on');$('#panehead').appendChild(l)}});fades()}});
let tt; function toast(m){{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),3200)}}
// WHY the toast reads the hint (2026-10-13): what a button says it will do on hover and what it says after a click can never disagree
const lc=s=>s.charAt(0).toLowerCase()+s.slice(1);
document.addEventListener('click',e=>{{const b=e.target.closest('[data-does]');if(b){{toast('Not built yet. In the real version, clicking it '+lc(b.dataset.tip));e.preventDefault();}}
  // WHY (cross-links): Today's pictures and "See its screens" lead into the Screens tab's popup and filters
  const sh=e.target.closest('[data-shot]');if(sh&&!sh.classList.contains('vshot')&&typeof openShot==='function'&&GI[sh.dataset.shot]){{openShot(sh.dataset.shot);return}}
  const es=e.target.closest('[data-effscreens]');if(es){{showScreensFor(+es.dataset.effscreens)}}}});
// WHY one side pane for everything: G-4.5 anatomy (title row + close, body, actions on the right per G-28).
function openPanel(eb,title,body,acts){{$('#pti').textContent=title;$('#pbody').innerHTML=(eb?`<div class="eyebrow">${{eb}}</div>`:'')+body;$('#pfoot').innerHTML=acts;$('#panel').classList.add('open');$('#pbody').scrollTop=0;fades()}}
function closePanel(){{$('#panel').classList.remove('open');$$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));$$('.web .lines').forEach(s=>s.innerHTML='')}}
$('#pclose').onclick=closePanel;document.addEventListener('keydown',e=>{{if(e.key==='Escape')closePanel()}});
$$('[data-view]').forEach(b=>b.onclick=()=>{{$$('[data-view]').forEach(x=>x.setAttribute('aria-selected',x===b));$$('.view').forEach(v=>v.classList.toggle('on',v.id===b.dataset.view));$('#panel').classList.remove('open');$('#scroller').scrollTop=0;$$('#panehead .lensbar').forEach(l=>l.hidden=l.dataset.view!==b.dataset.view);fades()}});
$('#theme').onchange=e=>document.documentElement.dataset.theme=e.target.value;
</script><script>
{stab.JS % (json.dumps(SGROUPS), json.dumps([dict(title=e['title'], days=e['days']) for e in EFFORTS]), json.dumps({k: w for k, _, w in stab.KINDS}), json.dumps([p for p, _ in PLACES] + ['Other']), json.dumps(TIP))}
</script><script>
{(VJS % (json.dumps(vision_nodes), json.dumps(STATUS_WORD)))}
</script></body></html>'''
page = page.replace('<span class="chev" aria-hidden="true">›</span>', CHEV).replace('<span class="chev">›</span>', CHEV)
check_tips(page)
open(os.path.join(HERE, 'mockup.html'), 'w').write(page)
print('screens', len(names), 'base', len(base), 'places', {p: len(v) for p, v in by_place.items()})
print('hints', len(TIP), '· wrote mockup.html', len(page)//1024, 'KB')
