#!/usr/bin/env python3
"""Builds mockup.html: the first draft of the management surface, with real data.

WHY a builder and not a hand-written page: every row below is a fact from the repos as of
2026-10-12 (branches, pull requests, merges, roadmap, today's screenshot run). The real
version replaces the DATA block with a collector; the rendering stays. Thumbnails come from
thumbs/ (made from the ui-consistency-audit worktree's shoot run 20261012-141521, light theme).
"""
import json, os, re, html, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vision_tab import render as vrender, CSS as VCSS, JS as VJS, SVG_CSS, STATUS_WORD
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
            if os.path.exists(os.path.join(HERE, thumb(n))): return f'<button class="shotbtn" data-shot="{E(n.split("#")[0])}" title="Open this screen"><img class="shot" src="{thumb(n).replace("#", "%23")}" alt=""></button>'
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
# WHY the rebuild (2026-10-12 review, Destin: "throws a fuckton at me at once"): Today now opens
# first and leads with ONE recommended next step; the long lists (waiting, bugs, release) are
# folded rows with a count, and each view has a single filled button (design guide G-4).
SIDE_WORD = {'screens':'changes what you see','behind':'changes how it works','both':'both'}
def meta(touches, side):
    """One quiet line instead of five badges: where it lands, then which side of the app."""
    return f'<div class="t-2xs muted metaline"><span class="tip" data-tip="Worked out from the files this work changed">Lands in {E(" · ".join(touches))}</span> · <span class="side {E(side)}">{E(SIDE_WORD[side])}</span></div>'
def btn(label, does, kind='', tip=''):
    # WHY kind is ignored (2026-10-13, audit #13): Destin's F-2 rule makes every action beside a
    # main one an outlined button, never bare text; the one filled button per view is written inline.
    t = f' title="{E(tip)}"' if tip else ''
    return f'<button class="btn sm" data-does="{E(does)}"{t}>{E(label)}</button>'
def ago(d): return 'today' if d == 0 else ('yesterday' if d == 1 else f'{d} days ago')
def fold(title, count, hint, body, open_=False, tip=''):
    """G-29 expandable row: title + muted count (G-19) + one-line hint, chevron on the right."""
    c = f' <span class="cnt">{count}</span>' if count is not None else ''
    return f'<details class="fold sec"{" open" if open_ else ""}><summary class="foldrow big"{f' title="{E(tip)}"' if tip else ''}><span class="fbody"><span class="gh">{E(title)}{c}</span><span class="t-xs muted">{E(hint)}</span></span><span class="chev" aria-hidden="true">›</span></summary><div class="foldbody">{body}</div></details>'
def sechead(title, count, hint=''):
    c = f' <span class="cnt">{count}</span>' if count is not None else ''
    # WHY h2 + description (audit #7): the app's full-screen group heading is 16px medium in normal
    # case with a muted line under it; spaced capitals were retired app-wide.
    return f'<div class="sechead"><div class="gtext"><h2 class="gh">{E(title)}{c}</h2>{f"<p class=\'gdesc\'>{E(hint)}</p>" if hint else ""}</div></div>'

# ----------------------------------------------------------------------------- TODAY
active = [e for e in EFFORTS if e['days'] <= 7]
IN_NEEDS = {'plugin-project-controls','sync-retry-feedback','sync-safety-audit-20260908'}
waiting = [e for e in EFFORTS if e['days'] > 7 and e['id'] not in IN_NEEDS]
# WHY "Project skills & tools" is gone from this list: it is the suggested next step at the top,
# and the old page showed it twice (Destin's rule: nothing repeated twice in one view).
needs = [
  ('Sync safety: backup-target selection fix', 'Reviewed and passing on Sept 9, but never put in the app. Untouched 31 days.', '',
   [btn('Put it in the app','opens its conversation with "Destin approves adding this to the app" already typed','','Adds this finished change to the app for everyone'), btn('See before and after','opens the before/after screens for settings/sync'), btn('Hold','asks why; the answer becomes its waiting-on note','','Keeps it as it is and records why')]),
  ('Sync: acknowledge retry attempts', 'A change waiting for review since Sept 8; its tests fail. Nobody has looked.', 'Pull request #444',
   [btn('Fix the failing tests','starts a session on that work with the failing tests pasted in'), btn('Drop it','gives up on this change and records why','','Gives up on this change; nothing is deleted from history')]),
  ('7 automatic library updates, all with failing tests', 'Five for Android from Sept 3, two for desktop from Oct 5 and 8.', '',
   [btn('Apply all seven and test','starts one session that applies all seven and runs the tests'), btn('Drop them','gives up on all seven updates','','Gives up on all seven; nothing is deleted from history')]),
  ('10 working copies with unsaved changes, untouched for two weeks or more', 'They cannot be cleaned up automatically because the changes are not saved anywhere.', '',
   [btn('Save them all','saves each one as a saved copy, then removes the working copy','','Keeps each one as a saved copy, then clears the working copy away'), btn('List them','lists each with what is unsaved: ' + ', '.join(LEFTOVERS['worktrees']))]),
]
today = []
S = SUGGEST
today.append(f'''<section class="card hero"><div class="eyebrow">Start here · suggested next</div>
<div class="herobody"><div class="herotext"><div class="t-lg">{E(S['title'])}</div><p class="t-sm dim" title="{E(S['whytip'])}">{E(S['why'])}</p>
<div class="t-xs muted">Lands in {E(" · ".join(S['touches']))}<br><span class="tip" data-tip="Which promise of the app this serves">Serves: &ldquo;{E(S['promisename'])}&rdquo; &mdash; {E(S['promise'])}</span></div></div>
{pic(['projects','marketplace'])}</div>
<div class="acts heroacts"><button class="btn sm" data-does="records why and moves it to Waiting">Set aside</button>{btn('Open its conversation','opens its conversation with this reasoning pasted in')}<button class="btn sm primary" data-does="opens the review deck that was prepared for it">Open its review deck</button></div>
<div class="herofolds">
<details class="fold"><summary class="foldrow"><span class="t-xs">Why this one</span><span class="chev">›</span></summary>
<div class="two"><div><div class="eyebrow">How it connects</div><ul class="t-xs">{''.join(f'<li>{E(c)}</li>' for c in S['connects'])}</ul></div>
<div><div class="eyebrow">What should be configurable</div><ul class="t-xs">{''.join(f'<li>{E(c)}</li>' for c in S['config'])}</ul></div></div></details>
<div class="t-xs muted">Other options: the two in-progress items below, or anything in Waiting.</div>
</div></section>''')

today.append('<section class="sec">' + sechead('Needs you', len(needs), 'Only you can decide these.'))
for t, hint, htip, bs in needs:
    today.append(f'<div class="row"><div class="body"><div class="t-sm">{E(t)}</div><div class="hint wrap"{f" title=\'{E(htip)}\'" if htip else ""}>{E(hint)}</div></div><div class="acts">{"".join(bs)}</div></div>')
today.append('<div class="eyebrow othersh">Reports from other people</div><div class="t-xs muted">No open reports. The last one was from tjmorin03 on Sept 15, closed.</div></section>')

today.append('<section class="sec">' + sechead('In progress', len(active), 'Touched in the last 7 days. Neither has a finish line yet.'))
for e in active:
    today.append(f'''<div class="row">{pic(e['screens'])}<div class="body"><div class="t-sm">{E(e['title'])}</div>
      <div class="hint wrap">Last worked on {ago(e['days'])}. {E(e['note'])}</div>{meta(e['touches'], e['side'])}</div>
      <div class="acts">{f'<button class="btn sm" data-effscreens="{EFFORTS.index(e)}">See its screens</button>' if e['screens'] else ''}{btn('Open its conversation','opens its conversation')}{btn('Write its finish line','asks you for one to three sentences saying when this is done; every big piece of work would get one at its start','ghost','One to three sentences saying when this is done')}{btn('Set aside','records why and moves it to Waiting','ghost')}</div></div>''')
today.append('</section>')

w = []
for e in waiting:
    pr = f' · <span title="{E(e["prtip"])}">{E(e["pr"])}</span>' if e.get('pr') else ''
    paused = f'<div class="hint wrap">Waiting on: {E(e["paused"])}</div>' if e.get('paused') else ''
    w.append(f'''<div class="row"><div class="body"><div class="t-sm">{E(e['title'])}</div>
      <div class="hint wrap">{ago(e['days']).capitalize()}{pr}. {E(e['note'])}</div>{paused}{meta(e['touches'], e['side'])}</div>
      <div class="acts">{f'<button class="btn sm" data-effscreens="{EFFORTS.index(e)}">See its screens</button>' if e['screens'] else ''}{btn('Open its conversation','opens its conversation')}{btn('Wrap up','runs the wrap-up checklist and removes the working copy if nothing is lost','ghost','Checks nothing is lost, then removes the working copy')}</div></div>''')
w.append('<div class="sub">' + sechead('Notes and research only', len(DEV_ONLY)) + ''.join(f'<div class="row slim"><div class="body"><div class="t-sm">{E(d["title"])}</div><div class="hint">Last touched {ago(d["days"])}</div></div><div class="acts">{btn("Open","opens the notes")}{btn("Archive","files the notes away and removes the working copy","ghost")}</div></div>' for d in DEV_ONLY) + '</div>')
w.append(f'<div class="t-xs muted note">Cleaned up automatically at session start, nothing to do: {E(LEFTOVERS["backups"])}; {E(LEFTOVERS["diag"])}.</div>')
today.append(fold('Waiting', len(waiting), 'Untouched for a week or more. Only one says why.', ''.join(w)))

b = []
for x in BUGS:
    b.append(f'''<div class="row">{pic(x['screens'])}<div class="body"><div class="t-sm">{E(x['title'])}</div><div class="hint wrap">In {E(x['place'])} · {E(x['src'])}</div></div>
      <div class="acts">{btn('Start a fix','starts a session with the roadmap entry and the screen pasted in')}{btn('Not a bug anymore','closes it with a note','ghost')}</div></div>''')
today.append(fold('Bugs users hit', len(BUGS), 'From the roadmap', ''.join(b), tip='The roadmap does not record who reported them.'))

r = ['<div class="relgrid">']
for g, items, scr in RELEASE['groups']:
    r.append(f'<div class="card inset"><div class="eyebrow">{E(g)}</div><ul class="t-xs">' + ''.join(f'<li>{E(i)}</li>' for i in items) + '</ul></div>')
r.append(f'</div><div class="t-xs muted note">The most recent test release went out {E(RELEASE["beta"])}.</div><div class="acts right">{btn("See all 67 changes","opens the full list of 67 with each one\'s before/after","ghost")}{btn("Start a test release","runs the release skill for the next test release; nothing in progress blocks it")}</div>')
today.append(fold('Since the last release', None, f'{RELEASE["version"]} went out {RELEASE["date"]}; {RELEASE["merges"]} changes have landed since. What users will notice.', ''.join(r)))

# ----------------------------------------------------------------------------- SCREENS
# WHY rebuilt (2026-10-13, Destin: "sort/filter/group in more interesting/dynamic ways ... clearer
# nesting and ways to trace/visualize click-paths ... i don't like the side panel for images"):
# the facets, click paths and picture popup live in screens_tab.py; this only feeds it the page's data.
SHORTQ = ['Talks to the AI','Changes its behaviour','Add-ons','Permissions']
QPATS = [(q, pats) for q, pats in QUESTIONS if pats and not pats[0].startswith('#')]
REL_PATS = sorted({s for g in RELEASE['groups'] for s in g[2]})
SGROUPS = stab.build(HERE, names, place_of, DESC, EFFORTS, REL_PATS, QPATS, matches)
GROUP_IDS = {g['id'] for g in SGROUPS}
app = [stab.head_controls(list(zip([q for q,_ in QPATS], SHORTQ)), EFFORTS), '<p class="t-xs muted scount" id="scount"></p><div id="sbody"></div>']
cols = ['Chat','Projects','Pages','Marketplace','Settings','Devices & sync']
bt = ['<p class="t-xs muted">Filled dot: you set it here. Hollow: it is used here. A first draft; it will be built properly later.</p><div class="tablewrap"><table class="blocks"><thead><tr><th></th>' + ''.join(f'<th>{E(c)}</th>' for c in cols) + '<th></th></tr></thead><tbody>']
for bname, cells, note in BLOCKS:
    dup = sum(1 for c in cols if cells.get(c)==2)
    bt.append(f'<tr><th>{E(bname)}</th>' + ''.join(f'<td><span class="bdot d{cells.get(c,0)}"></span></td>' for c in cols) + f'<td class="t-2xs muted">{E(note)}{" <span class=\"spill warn\"><span class=\"dot\"></span>set in "+str(dup)+" places</span>" if dup>=3 else ""}</td></tr>')
bt.append('</tbody></table></div>')
app.append(fold('Which parts are set in more than one place', None, 'Each row is one part of the app; a filled dot is a place where you set it.', ''.join(bt)))


# ----------------------------------------------------------------------------- PAGE
vision_html, vision_nodes, vision_tot = vrender(HERE)
CSS = open(os.path.join(HERE, 'cc.css')).read() + open(os.path.join(HERE, 'page.css')).read()
DRAFT = ("A draft to react to, not a working tool. Every row is real as of Oct 12: unfinished work, changes waiting for review, finished changes, the roadmap, and today's screenshot run. "
         "Screenshots come from the screen-restyle work, not yet from the main copy. Buttons only say what they would do. The one-sentence screen descriptions were "
         "written for this draft; the real version has an agent write them when a screen's code changes.")
def _ic(d): return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>'
ICON_HOME=_ic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>')
ICON_TODAY=_ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')
ICON_SCREENS=_ic('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>')
ICON_MAP=_ic('<path d="M9 4l-6 3v13l6-3 6 3 6-3V4l-6 3z"/><path d="M9 4v13M15 7v13"/>')
CHEV='<span class="chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></span>'
page = f'''<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouCoded — Today</title>
<style>{CSS}{stab.CSS}{VCSS}{SVG_CSS}</style></head><body>
<div class="screen">
<header class="band"><div class="bl"><span class="badge tip below draft" tabindex="0" data-tip="{E(DRAFT)}">Draft ⓘ</span></div>
<div class="btitle">{ICON_HOME}YouCoded</div>
<div class="br"><span class="muted t-2xs asof">As of Oct 12 · the main copy</span><div class="bandpill"><select id="theme" aria-label="Theme"><option value="light">Light</option><option value="dark">Dark</option><option value="midnight">Midnight</option><option value="creme">Creme</option></select></div></div></header>
<div class="screen-body"><div class="pane">
<div class="panehead hline" id="panehead"><div class="tabs" role="tablist" aria-label="Views"><button role="tab" aria-selected="true" data-view="today">{ICON_TODAY}Today</button><button role="tab" aria-selected="false" data-view="app">{ICON_SCREENS}Screens <span class="count">{len(SGROUPS)}</span></button><button role="tab" aria-selected="false" data-view="vision">{ICON_MAP}Big picture</button></div></div>
<div class="panescroll fadescroll" id="scroller"><main class="cc-main">
<div id="today" class="view on">{''.join(today)}</div>
<div id="app" class="view">{''.join(app)}</div>
<div id="vision" class="view">{vision_html}</div>
</main></div></div></div></div>
<aside class="panel" id="panel" aria-label="Details"><div class="phd hline"><div class="t-base" id="pti"></div><button class="closebtn" aria-label="Close" id="pclose"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div><div class="pbody fadescroll" id="pbody"></div><div class="pfoot" id="pfoot"></div></aside>
{stab.dialog_shell()}
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
addEventListener('DOMContentLoaded',()=>{{['#scroller','#pbody'].forEach(s=>$(s).addEventListener('scroll',e=>fade(e.target),{{passive:true}}));addEventListener('resize',fades);
  // WHY: each view's filter strip lives in the fixed head (like Projects' tab row), not in the scroll body
  $$('.view .lensbar').forEach(l=>{{l.dataset.view=l.closest('.view').id;l.hidden=!l.closest('.view').classList.contains('on');$('#panehead').appendChild(l)}});fades()}});
let tt; function toast(m){{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('show'),3200)}}
document.addEventListener('click',e=>{{const b=e.target.closest('[data-does]');if(b){{toast('In the real version this '+b.dataset.does+'.');e.preventDefault();}}
  // WHY (cross-links): Today's pictures and "See its screens" lead into the Screens tab's popup and filters
  const sh=e.target.closest('[data-shot]');if(sh&&!sh.classList.contains('vshot')&&typeof openShot==='function'&&GI[sh.dataset.shot]){{openShot(sh.dataset.shot);return}}
  const es=e.target.closest('[data-effscreens]');if(es){{showScreensFor(+es.dataset.effscreens)}}}});
// WHY one side pane for everything: G-4.5 anatomy (title row + close, body, actions on the right per G-28).
function openPanel(eb,title,body,acts){{$('#pti').textContent=title;$('#pbody').innerHTML=(eb?`<div class="eyebrow">${{eb}}</div>`:'')+body;$('#pfoot').innerHTML=acts;$('#panel').classList.add('open');$('#pbody').scrollTop=0;fades()}}
function closePanel(){{$('#panel').classList.remove('open');$$('.chip').forEach(c=>c.classList.remove('focus','rel','relby'));if(typeof vApply==='function'&&$('#vision').classList.contains('on'))vApply()}}
$('#pclose').onclick=closePanel;document.addEventListener('keydown',e=>{{if(e.key==='Escape')closePanel()}});
$$('[data-view]').forEach(b=>b.onclick=()=>{{$$('[data-view]').forEach(x=>x.setAttribute('aria-selected',x===b));$$('.view').forEach(v=>v.classList.toggle('on',v.id===b.dataset.view));$('#panel').classList.remove('open');$('#scroller').scrollTop=0;$$('#panehead .lensbar').forEach(l=>l.hidden=l.dataset.view!==b.dataset.view);fades()}});
$('#theme').onchange=e=>document.documentElement.dataset.theme=e.target.value;
</script><script>
{stab.JS % (json.dumps(SGROUPS), json.dumps([dict(title=e['title'], days=e['days']) for e in EFFORTS]), json.dumps(SHORTQ), json.dumps({k: w for k, _, w in stab.KINDS}), json.dumps([p for p, _ in PLACES] + ['Other']))}
</script><script>
{(VJS % (json.dumps(vision_nodes), json.dumps(STATUS_WORD)))}
</script></body></html>'''
page = page.replace('<span class="chev" aria-hidden="true">›</span>', CHEV).replace('<span class="chev">›</span>', CHEV)
open(os.path.join(HERE, 'mockup.html'), 'w').write(page)
print('screens', len(names), 'base', len(base), 'places', {p: len(v) for p, v in by_place.items()})
print('wrote mockup.html', len(page)//1024, 'KB')
