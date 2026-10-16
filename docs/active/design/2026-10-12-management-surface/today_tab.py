"""The Today tab, rebuilt from the independent review (docs/active/reviews/2026-10-14-today-tab-independent-review.md)
and Destin's answers (today-review.questions.answers.json: all eight recommended options).

WHY one module with one table of states (Q-1, Q-3): Destin asked "where these action buttons come from,
why they differ, how they're determined". Every piece of work now has exactly ONE state; the state is
the tinted label beside its name, and the label alone decides the row's one filled button. Pointing at
the label says what it means and why that button is offered.
WHY conversations on every row (Q-4): several chats can build one piece of work, one after another or
at once. Each row says how many chats, and Open shows them as a timeline with "Start another chat on
this card". Until work cards exist, a "chat" here is a separate copy of the work (a session branch):
the only record that exists. Results are shown only where something was written down.
WHY Q-8's words keep real terms (Destin: "i'm not an idiot. 'merge to master' is a clearer and better
button name"): plain where plain is clearer, the real name where the real name is.
"""
import html

E = html.escape

# state: (label, pill tone, main button, why that button, what the label means, where the row goes)
# WHY each main button names its real effect, with a tip saying exactly what happens (Destin, today-rebuild
# A-2/A-3: "join chat is weird… not clear what pause and close actually do in real terms… what am i opening?")
STATES = {
    'review':   ('Needs your look', 'warn',   'Open review deck',   'Its screens are ready for you to approve.', 'needs',
                 'Opens its review deck, where you approve or reject each screen.'),
    'failing':  ('Checks failing',  'danger', 'Fix failing checks', 'Its automatic checks fail, so it cannot be merged.', 'needs',
                 'Starts a chat on its branch with the failing checks\' output, to fix them.'),
    'ready':    ('Ready to merge',  'ok',     'Merge to master',    'Reviewed and its checks pass; only the merge is left.', 'needs',
                 'Merges its pull request into master, then deletes the branch.'),
    'working':  ('Working',         'info',   'Go to chat',         'A chat is working on it now. (On this mockup: a chat worked on it in the last 24 hours.)', 'working',
                 'Switches to the conversation that is working on it.'),
    'nofinish': ('No finish line',  '',       'Write finish line',  'Nobody has written down when it counts as done.', 'rest',
                 'Asks you for 1–3 sentences saying when it counts as done, saved on its card.'),
    'idle':     ('Idle',            '',       'Resume latest chat', 'Untouched for two weeks or more, with no reason given.', 'rest',
                 'Reopens its most recent conversation where it left off.'),
    'paused':   ('Paused',          '',       'Unpause',            'Stopped on purpose; the reason is on the row.', 'rest',
                 'Clears the pause, so it shows as active again. Nothing else changes.'),
}
ORDER = ['failing', 'review', 'ready', 'working', 'nofinish', 'idle', 'paused']  # superseded by STAGES below; kept for the old card 'state' tags

# WHY four stages (Destin, 2026-10-14, after today-rebuild-2: "planning, agentic buildout, human polish & review,
# merged. … 'ready to merge' is a wasted state. something ready to merge should just be merged when ready. your
# turn marker is wasted space … fine with problems as separate marker"): the label is WHERE the work is in its
# life, the same four steps for everything; a problem is a separate marker beside it; the filled button is the
# next step (next_step below), and its hover says why.
STAGES = {
    'planning': ('Planning', 'Deciding what to build: questions, plans and designs. Nothing built yet.'),
    'build':    ('Agentic buildout', 'Chats are building it.'),
    'polish':   ('Human polish & review', 'Built; now you review it, ask for polish, and merge it when it is right.'),
    'merged':   ('Merged', 'In master. It ships with the next release.'),
}
STAGE_OF = {
    'plugin-project-controls': 'polish', 'sync-safety-audit-20260908': 'polish', 'sync-retry-feedback': 'build',
    'ui-consistency-audit': 'polish', 'management-surface-20261012': 'polish', 'dev-xray-tools': 'polish',
    'fix-permission-approve-flake': 'build', 'usage-visibility-20260929': 'polish', 'specialists-plans': 'build',
    'theme-plugin-update': 'build', 'offline-auth-bypass': 'planning', 'agent-lint-tooling': 'build',
    'files-drawer-honesty': 'polish', 'model-picker-tags': 'polish', 'permission-ask-timeout': 'build',
    'ask-claude-reference-ux': 'build', 'onedrive-no-auto-download': 'build',
}
FAILING = {'sync-retry-feedback', 'onedrive-no-auto-download'}   # checks fail on its pull request
DECK = {'plugin-project-controls'}                               # a review deck waits for your answers
MERGEABLE = {'sync-safety-audit-20260908'}                       # reviewed, checks pass: just merge it


def next_step(c):
    """The filled button: the next step, and why it is this one (shown on hover)."""
    if c.get('paused'):
        return 'Unpause', 'Paused on purpose. Unpause clears the pause, so it shows as active again; nothing else changes.'
    if c['state'] == 'working':
        return 'Go to chat', 'A chat is working on it now. Switches to that conversation.'
    if c['id'] in FAILING or c.get('failing'):
        return 'Fix failing checks', 'Its checks fail. Starts a chat on its branch with the failing checks\' output, to fix them.'
    if c['id'] in MERGEABLE or c.get('mergeable'):
        return 'Merge to master', 'Reviewed and its checks pass. Merges its pull request into master, then deletes the branch.'
    if c['id'] in DECK:
        return 'Open review deck', 'Its review deck waits for your answers. Opens it, where you approve or reject each screen.'
    if not c.get('chats'):
        # WHY (live page, 2026-10-16): a work card with no chat recorded has nothing to resume; its next step is a first chat
        return 'Start a chat on this', 'No chat has worked on this yet. Starts one that already knows this item: its text, what it needs and what needs it.'
    return 'Resume latest chat', 'Reopens its most recent conversation where it left off.'


def stage_pill(c):
    w, why = STAGES[c['stage']]
    return f'<span class="spill stage" data-tip="{E(w)}: {E(why)}">{E(w)}</span>'


def markers(c):
    """Problems, beside the stage: a separate marker each (any stage can have them)."""
    # WHY the c.get(...) halves: on the live page these facts come from the item's branches (scripts/manage.mjs)
    m = []
    if c['id'] in FAILING or c.get('failing'):
        m.append('<span class="spill danger" data-tip="Its automatic checks fail, so it cannot be merged until they are fixed.">Checks failing</span>')
    if c.get('unsaved'):
        m.append(NOT_BACKED)
    if c.get('paused'):
        m.append('<span class="spill" data-tip="Stopped on purpose; the line under the name says why.">Paused</span>')
    if c['state'] == 'working':
        m.append('<span class="spill info" data-tip="A chat is working on it now. (On this mockup: a chat worked on it in the last 24 hours.)"><span class="dot" aria-hidden="true"></span>Working</span>')
    return ''.join(m)

# One card per piece of work. Facts from build.py's EFFORTS (Oct 12 snapshot); chats are the separate
# copies of the work found for it, with a result only where a note or pull request records one.
CARDS = [
    dict(id='plugin-project-controls', title='Project skills & tools', state='review', area=['Projects', 'Marketplace', 'Chat'], side='both',
         date='Sept 24', days=18, unsaved=True, prs=['#571', '#203'],
         next='Review the screens, then merge pull requests #571 and #203.',
         done='Per-project switches for skills and tools are built; checks pass.', blocked='Your review of the screens.',
         chats=[('Sept 24', 'plugin-project-controls', 'Opened pull requests #571 (app) and #203 (workspace); marked "UI review pending".')]),
    dict(id='sync-safety-audit-20260908', title='Sync safety: backup-target selection fix', state='ready', area=['Devices & sync'], side='behind',
         date='Sept 11', days=31, next='Reviewed and passing its checks since Sept 9. Never merged.',
         chats=[('Sept 8–11', 'sync-safety-audit-20260908', 'Found the fix, had it reviewed; checks pass.')]),
    dict(id='sync-retry-feedback', title='Sync: acknowledge retry attempts', state='failing', area=['Devices & sync'], side='behind',
         date='Sept 7', days=35, prs=['#444'], next='Checks fail on pull request #444. Nobody has reviewed it since Sept 8.',
         chats=[('Sept 7', 'sync-retry-feedback', 'Opened pull request #444.')]),
    dict(id='ui-consistency-audit', title='Screens restyled to the design guide', state='working', area=['Marketplace', 'Projects', 'Chat', 'Social'], side='screens',
         date='Oct 12', days=0, next='Latest: the Update-available and Unsaved-changes notices; an error-notices review deck with 7 before/after slides.',
         chats=[('Oct 12', 'ui-consistency-audit', 'Error-notices review deck made.', True)]),
    dict(id='management-surface-20261012', title='This page: the management surface', state='working', area=['Dev tooling'], side='behind',
         date='Oct 12', days=0, next='Research, an independent review and this draft.',
         chats=[('Oct 12', 'management-surface-20261012', 'Draft page and independent review.', True)]),
    dict(id='dev-xray-tools', title='X-ray: see a conversation turn by turn', state='nofinish', area=['Settings'], side='screens',
         date='Oct 4', days=8, next='Round 2 review deck done; a call and its result now show as one step.',
         chats=[('Oct 4', 'dev-xray-tools', 'Round 2 review deck answered.')]),
    dict(id='fix-permission-approve-flake', title='A flaky test in the permission-approve walkthrough', state='nofinish', area=['Dev tooling'], side='behind',
         date='Oct 3', days=9, next='One change: the test checks the streamed sentence whole again.',
         chats=[('Oct 3', 'fix-permission-approve-flake', None)]),
    dict(id='usage-visibility-20260929', title='Usage: one account at a time, limit line over the token bars', state='nofinish', area=['Settings'], side='screens',
         date='Sept 29', days=13, next='Round 2 of the review deck answered.',
         chats=[('Sept 29', 'usage-visibility-20260929', 'Round 2 review deck answered.')]),
    dict(id='specialists-plans', title='Helper agents (Specialists) show a plan and a budget before acting', state='idle', area=['Chat', 'Settings'], side='both',
         date='Sept 26', days=16, unsaved=True, next='Three separate copies, 138 saved changes. A hand-off note says stage 1 is done.',
         done='Stage 1, according to the hand-off note.', blocked='Nothing recorded.',
         chats=[('Sept 26', 'specialists-plans-wrapup', 'Wrote the hand-off note: stage 1 done.'),
                ('Sept 26', 'specialists-plans-decisions', None),
                ('Sept 26', 'specialists-plans', '138 saved changes.')]),
    dict(id='theme-plugin-update', title='Bundled skill content delivered on app update', state='idle', area=['Marketplace'], side='behind',
         date='Sept 22', days=20, unsaved=True, next='A fix in the plugin installer plus the Morning Rounds mascot decisions.',
         chats=[('Sept 22', 'theme-plugin-update', None)]),
    dict(id='offline-auth-bypass', title='Offline use, sign-in expiry and the startup menu', state='idle', area=['Settings'], side='screens',
         date='Sept 14', days=28, next='Questions deck answered; nothing built yet.',
         chats=[('Sept 14', 'offline-auth-bypass', 'Questions deck answered.')]),
    dict(id='agent-lint-tooling', title='Faster type checks and a design lint for agents', state='idle', area=['Dev tooling'], side='behind',
         date='Sept 14', days=28, next='Swaps two code-checking tools; adds a design check that only reports.',
         chats=[('Sept 14', 'agent-lint-tooling', None)]),
    dict(id='files-drawer-honesty', title='Files drawer: the bytes reader follows the link before it decides', state='idle', area=['Chat', 'Projects'], side='both',
         date='Sept 11', days=31, next='Review answers recorded: all four kept.',
         chats=[('Sept 11', 'files-drawer-honesty', 'Review answered: all four kept.')]),
    dict(id='model-picker-tags', title='Model picker: tags, a filter panel, plainer hints', state='idle', area=['Chat'], side='screens',
         date='Sept 11', days=31, unsaved=True, next='Design review answered: chips, sentence case, shorter hovers.',
         chats=[('Sept 11', 'model-picker-tags', 'Design review answered.')]),
    dict(id='permission-ask-timeout', title='Permission asks that time out', state='idle', area=['Chat'], side='behind',
         date='July 31', days=73, next='Five review findings closed, then nothing since.',
         chats=[('July 31', 'permission-ask-timeout', 'Five review findings closed.')]),
    dict(id='ask-claude-reference-ux', title='"Ask Claude" reference marks in documents', state='idle', area=['Files & documents'], side='screens',
         date='July 28', days=76, next='Last change fixes outlines on marks that share a line.',
         chats=[('July 28', 'ask-claude-reference-ux', None)]),
    dict(id='onedrive-no-auto-download', title='OneDrive files: read without auto-downloading', state='paused', area=['Projects', 'Chat'], side='both',
         date='Sept 15', days=27, prs=['#476'], paused='known regressions; a hand-off note says where it stopped.',
         chats=[('Sept 15', 'onedrive-no-auto-download', 'Wrote a hand-off note; pull request #476 waits, checks fail.')]),
]
# WHY these words (Destin, 2026-10-16: "UI/UX Only", "Backend Only", or "UI/UX and Backend")
SIDE = {'screens': ('UI/UX Only', 'It changes what you see and how you use it, not how the app works underneath.'),
        'behind': ('Backend Only', 'It changes how the app works underneath, not what you see.'),
        'both': ('UI/UX and Backend', 'It changes both what you see and how the app works underneath.')}

MENU_TIP = 'More: pause or close this work.'
def git_label(b):
    """'youcoded-dev · plugin-project-controls': the repo first, and the generic "session/" prefix dropped.
    WHY (Destin, 2026-10-16: "sessions/blahblah is not a useful tag"): which repo it lives in is the useful
    fact; prefixes that mean something (feat/, backup/, docs/) stay."""
    name = b['name'][len('session/'):] if b['name'].startswith('session/') else b['name']
    repos = b.get('repos') or []
    return (' + '.join(repos) + ' · ' if repos else '') + name


# the status bar's git-branch icon (octicon), copied from StatusBar.tsx
GIT_ICON = ('<svg class="gicon" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>')
PAUSE = ('Pause…', 'Marks it paused on its card, with your reason. Its branch, copy and pull request stay exactly as they are.')
CLOSE = ('Close…', 'Saves any unsaved changes to a backup branch, closes its pull request, removes its copy from this computer and marks the card closed. The branch stays on GitHub.')


# WHY beside the name and renamed (A-1: "unsaved changes … should be near the name… unclear what needs your
# look means vs unsaved changes"): it is a warning about the copy on this computer, not the work's state
NOT_BACKED = '<span class="spill warn" data-tip="Its copy on this computer has changes that exist nowhere else: not committed, or committed but not pushed to GitHub. Close… backs them up first.">Not backed up</span>'


def pill(state):
    w, tone, main, why, _, _ = STATES[state]
    dot = '<span class="dot" aria-hidden="true"></span>' if state == 'working' else ''
    # WHY the hover names the button (Q-3): the rule is explained exactly where you would wonder about it
    return f'<span class="spill {tone}" data-tip="{E(w)}: {E(why)} That\'s why this row offers {E(main)}.">{dot}{E(w)}</span>'


def menu():
    """The ⋯ button and its small menu (the app's shared Menu): only the two stopping words (Q-2)."""
    return ('<span class="mwrap"><button class="btn sm mbtn" aria-haspopup="menu" aria-expanded="false" data-tip="' + E(MENU_TIP) + '">⋯</button>'
            '<span class="menu layer" role="menu" hidden>'
            # WHY the effect is written under each item, not only on hover (A-2): what these do is the question
            f'<button class="mitem" role="menuitem" data-does data-tip="{E(PAUSE[1])}"><span>{PAUSE[0]}</span><span class="mhint">{E(PAUSE[1])}</span></button>'
            f'<button class="mitem" role="menuitem" data-does data-tip="{E(CLOSE[1])}"><span>{CLOSE[0]}</span><span class="mhint">{E(CLOSE[1])}</span></button></span></span>')


def chips(c):
    out = []   # WHY no "Suggested above" chip (Destin, 2026-10-16: remove it)
    # WHY first and teal (Destin, 2026-10-16: like the status bar's branch chip, "with the same teal tint"): the
    # status bar's icon and teal (#0D9488), with the colour in the tint, outline and icon only (guide: never in words)
    if c.get('branches'):
        bs = c['branches']
        tip = 'Its branch' + ('es' if len(bs) > 1 else '') + ': ' + '; '.join(git_label(b) + f' (branch {b["name"]}' + (', merged' if b.get('merged') else '') + ')' + (f', open on this computer in {b["worktree"]}' if b.get('worktree') else '') for b in bs)
        more = f' <span class="bmore">+{len(bs) - 1}</span>' if len(bs) > 1 else ''
        out.append(f'<span class="badge gitchip" data-tip="{E(tip)}">{GIT_ICON}{E(git_label(bs[0]))}{more}</span>')
    out += [f'<span class="badge" data-tip="The part of the app it lands in.">{E(a)}</span>' for a in c['area']]
    if c.get('platform'):
        out.append(f'<span class="badge" data-tip="It only applies on this platform.">{E(c["platform"])}</span>')
    # WHY only when set: work outside the app (Workspace, Website, Release & business) has no UI/UX-or-Backend side
    if c.get('side'):
        lab, tip = SIDE[c['side']]
        out.append(f'<span class="badge" data-tip="{E(tip)}">{E(lab)}</span>')
    # WHY no priority or release chips (Destin, 2026-10-16: "completely scrap priority/version tags for the time
    # being"): the design never decided them; rebuilding them is its own Planning item.
    n = len(c['chats']); live = sum(1 for x in c['chats'] if len(x) > 3 and x[3])
    # WHY nothing at zero (Destin approved the chat count, never a "No chats yet" wording)
    if n:
        out.append(f'<span class="badge" data-tip="How many chats have worked on this. View chats lists them.">{n} chat{"s" if n != 1 else ""}{f" · {live} working now" if live else ""}</span>')
    for k, word, tip in (('needs', 'needs', 'Must exist before this one can be built.'), ('related', 'overlaps', 'Exploration items covering some of the same ground.')):
        if c.get(k):
            out.append(f'<span class="badge" data-tip="{tip}">{word} {", ".join("#" + str(x) for x in c[k])}</span>')
    for p in c.get('prs', []):
        out.append(f'<span class="badge" data-tip="A change waiting to be merged into master.">Pull request {E(p)}</span>')
    return ''.join(out)


def date(c):
    d = c['days']; ago = 'today' if d == 0 else ('yesterday' if d == 1 else f'{d} days ago')
    return f'<span class="cdate t-2xs muted" data-tip="Last worked on {ago}.">{E(c["date"])}</span>'


def body(c, pic):
    """What Open shows, inside the same box (guide: a folded box opens inside itself)."""
    h = []
    note = [(k, c.get(k)) for k in ('done', 'blocked') if c.get(k)]  # WHY no 'next': the row already shows it
    if c['state'] == 'paused': note = [('paused', 'Paused because: ' + c['paused'])]
    if c.get('done') or c.get('blocked'):
        h.append('<div class="eyebrow" data-tip="The card\'s progress note: what is done, what is next, what it waits on.">Progress</div><div class="pnote t-xs">' +
                 ''.join(f'<div><span class="muted">{E(k.capitalize())}:</span> {E(v)}</div>' for k, v in note) + '</div>')
    n = len(c['chats'])
    h.append(f'<div class="eyebrow" data-tip="Every chat that worked on this, newest first.">Chats <span class="cnt" data-tip="How many chats.">{n}</span></div><div class="tline">')
    if not n:
        h.append('<p class="t-xs muted" style="margin:0">No chats are recorded on this item yet. From now on, a chat that works on it adds itself here.</p>')
    for x in c['chats']:
        d, name, res = x[0], x[1], x[2]; live = len(x) > 3 and x[3]
        lp = '<span class="spill info" data-tip="This chat is working on it now. (On this mockup: in the last 24 hours.)"><span class="dot" aria-hidden="true"></span>Working</span>' if live else ''
        r = E(res) if res else '<span class="missing">No summary saved.</span>'
        h.append(f'<div class="row slim tl"><span class="t-2xs muted tld">{E(d)}</span><span class="body"><span class="t-xs rt">{E(name)}</span><span class="hint wrap">{r}</span></span>{lp}' +
                 (f'<button class="btn sm" data-does data-tip="Switches to this conversation, which is open now.">Go to chat</button></div>' if live else
                  f'<button class="btn sm" data-does data-tip="Reopens this conversation where it left off.">Resume chat</button></div>'))
    h.append('</div><button class="btn bpfull" data-does data-tip="Starts a new chat that already knows this work\'s finish line and progress, so it continues instead of starting over.">Start another chat on this card</button>')
    p = pic(c.get('screens') or [])
    if p:
        see = f'<button class="btn sm" data-effscreens="{c["eidx"]}" data-tip="Shows every screen it touches, in the Screens tab.">See its screens</button>' if c.get('eidx') is not None else ''
        h.append(f'<div class="eyebrow" data-tip="Screens this work touches. Click the picture to open it.">Screens</div><div class="cshots">{p}{see}</div>')
    return ''.join(h)


def row(c, pic, show_stage=False, live=False):
    # WHY show_stage is off inside a stage's own section: the heading already says it (guide: show a state only once)
    # WHY `live` (2026-10-16): the live page draws its rows with THIS function, adding only a tick box and a
    # clickable name, so the approved anatomy can never drift from the mockup again.
    main, does = next_step(c)
    nxt = ('Paused because: ' + c['paused']) if c.get('paused') else c['next']
    tick = f'<input type="checkbox" class="ltick" aria-label="Tick #{E(c["id"])}" data-tip="Tick to edit several items at once.">' if live else ''
    # WHY plain text (2026-10-16: "i hate clickable elements that are bare text"): the whole card opens it instead
    name = (f'<span class="t-sm fw"><span class="lid">#{E(c["id"])}</span> {E(c["title"])}</span>'
            if live else f'<span class="t-sm fw">{E(c["title"])}</span>')
    attrs = (f' data-cid="{E(c["id"])}" data-stage="{E(c["stage"])}" data-area="{E((c.get("area") or [""])[0])}" data-tags="{E(" ".join(c.get("tags", [])))}" data-search="{E(c.get("search", ""))}"' if live else '')
    # WHY this order (UI-consistency guide, "Cards", Destin 2026-10-16: "make the card hierarchy match the ui
    # consistency branch design principles"): name with its status on the top line, quick actions at its top
    # right → one row of fact chips right under the name → the description (two lines at most) → the date at
    # the bottom right, at the end of the details line.
    # WHY this layout (Destin, 2026-10-16: "make the date sit in the bottom right, and allow the tags/descriptions
    # to take more space"): the name and the actions share the top line; the chip row and the description then run
    # the card's full width under both, and the date sits at the card's bottom right (guide "Cards" order kept).
    return (f'<div class="crow{" lrow" if live else ""}" data-card="{E(c["id"])}"{attrs}>'
            f'<div class="ctop">{tick}<div class="ctl">{name}{stage_pill(c) if show_stage else ""}{markers(c)}</div>'
            f'<div class="acts">{menu()}<button class="btn sm copen" aria-expanded="false" data-tip="Shows, inside this card, the chats that worked on it.">View chats</button>'
            f'<button class="btn sm primary" data-does data-tip="{E(does)}">{E(main)}</button></div></div>'
            f'<div class="cfull"><div class="cchips">{chips(c)}</div>'
            f'<div class="cdesc"><span class="t-xs dim cnext">{E(nxt)}</span>{date(c)}</div></div>'
            f'<div class="cbody" hidden>{body(c, pic)}</div></div>')


def render(efforts, dev_only, leftovers, suggest, pic, T, sechead, fold):
    eidx = {e['id']: i for i, e in enumerate(efforts)}
    for c in CARDS:
        e = efforts[eidx[c['id']]]
        c['screens'] = e['screens']; c['eidx'] = eidx[c['id']]; c['stage'] = STAGE_OF[c['id']]
    hero_id = 'plugin-project-controls'
    hero = next(c for c in CARDS if c['id'] == hero_id)
    out = []
    # ---- Start here: the top card drawn large, same label and buttons as its row (Q-7)
    S = suggest
    main, does = next_step(hero)
    out.append(f'''<section class="card hero"><div class="eyebrow"><span data-tip="{T('today.start')}">Start here · suggested next</span></div>
<div class="herobody"><div class="herotext"><div class="ctl"><span class="t-lg">{E(hero['title'])}</span>{stage_pill(hero)}{markers(hero)}</div><p class="t-sm dim">{E(S['why'])}</p>
<div class="cchips">{chips(hero)}</div></div>{pic(['projects', 'marketplace'])}</div>
<div class="acts heroacts">{menu()}<button class="btn sm" data-does data-tip="Shows its progress and every conversation that worked on it (the same list as its row's View chats).">View chats</button><button class="btn sm primary" data-does data-tip="{E(does)}">{E(main)}</button></div>
<div class="herofolds"><details class="fold"><summary class="foldrow" data-tip="{T('today.why')}"><span class="t-xs">Why this one</span><span class="chev">›</span></summary>
<div class="two"><div><div class="eyebrow">How it connects</div><ul class="t-xs">{''.join(f'<li>{E(x)}</li>' for x in S['connects'])}</ul></div>
<div><div class="eyebrow">What should be adjustable</div><ul class="t-xs">{''.join(f'<li>{E(x)}</li>' for x in S['config'])}</ul></div></div></details></div></section>''')
    hero['suggested'] = True
    # WHY sections are the stages (Destin's four labels): your stage first, then the chats', then planning;
    # paused work is folded apart with its reason. Newest first inside each.
    by = {k: [c for c in sorted(CARDS, key=lambda c: c['days']) if c['stage'] == k and not c.get('paused')] for k in STAGES}
    paused = [c for c in CARDS if c.get('paused')]
    out.append('<section class="sec">' + sechead('Human polish & review', len(by['polish']), 'Built, and waiting on you: review it, ask for polish, or merge it. The filled button is the next step.', 'today.needs', 'today.needs.count'))
    out += [row(c, pic) for c in by['polish']]
    out.append('</section>')
    out.append('<section class="sec">' + sechead('Agentic buildout', len(by['build']), 'Chats are building these. A red marker means something needs fixing.', 'today.inprog', 'today.inprog.count'))
    out += [row(c, pic) for c in by['build']]
    out.append('</section>')
    out.append(fold('Planning', len(by['planning']), 'Being decided: questions, plans and designs. Nothing built yet.',
                    '<div class="cstack">' + ''.join(row(c, pic) for c in by['planning']) + '</div>', 'today.planning', 'today.planning.count'))
    out.append(fold('Paused', len(paused), 'Stopped on purpose, each with its reason.',
                    '<div class="cstack">' + ''.join(row(c, pic, show_stage=True) for c in paused) + '</div>', 'today.paused', 'today.paused.count'))
    out.append(tidy(leftovers, dev_only, fold, [c['id'] for c in CARDS]))
    return out


def tidy(leftovers, dev_only, fold, card_ids, raw=False):
    """Tidy up (Q-5): housekeeping that never changes the app. Shared by the mockup and the live page."""
    nocard = [w for w in leftovers['worktrees'] if not any(w.startswith(str(i)) for i in card_ids)]
    nocard = [w for w in nocard if not w.startswith('specialists-plans')]
    t = []
    t.append(f'''<div class="row crow"><div class="ctop"><div class="cmain"><div class="ctl"><span class="t-sm fw">7 automatic dependency updates fail their checks</span></div>
<div class="t-xs dim cnext">Five for Android from Sept 3, two for desktop from Oct 5 and 8.</div></div>
<div class="acts">{menu()}<button class="btn sm primary" data-does data-tip="Tries all seven updates together and runs the checks once.">Try all seven</button></div></div></div>''')
    t.append(f'''<div class="row crow"><div class="ctop"><div class="cmain"><div class="ctl"><span class="t-sm fw">{len(nocard)} leftover copies with unsaved changes and no card</span></div>
<div class="t-xs dim cnext">{E(", ".join(nocard))}.</div></div>
<div class="acts">{menu()}<button class="btn sm primary" data-does data-tip="Saves each copy's changes as a backup branch, so they can be cleaned up safely.">Save as backup branches</button></div></div></div>''')
    t.append(f'''<div class="row crow"><div class="ctop"><div class="cmain"><div class="ctl"><span class="t-sm fw">{len(dev_only)} copies that hold only notes or research</span></div>
<div class="t-xs dim cnext">{E("; ".join(d["title"] for d in dev_only))}.</div></div>
<div class="acts">{menu()}<button class="btn sm primary" data-does data-tip="Keeps the notes in the workspace and closes the copies.">Keep the notes, close the copies</button></div></div></div>''')
    t.append(f'<div class="t-xs muted note">Cleaned up automatically, nothing to do: {E(leftovers["backups"])}; {E(leftovers["diag"])}.</div>')
    if raw:  # WHY: the live page draws its own group heading around the same content
        return 3, ''.join(t)
    return (fold('Tidy up', 3, 'Housekeeping: nothing here changes the app.', '<div class="cstack">' + ''.join(t) + '</div>', 'today.tidy', 'today.tidy.count'))


CSS = '''
/* Today rows (today_tab.py): one anatomy for every card (Q-6) — name + label, one line, chips + date, buttons right */
.crow{display:block;padding:12px 16px;margin-bottom:12px;background:var(--panel);border:1px solid var(--edge);border-radius:var(--radius-xl);box-shadow:0 4px 16px rgba(0,0,0,calc(var(--shadow-strength) * .8))}
.gitchip{background:color-mix(in srgb,#0D9488 12%,transparent);border-color:rgba(13,148,136,.35)} .gitchip .gicon{color:#0D9488;flex:none} .gitchip .bmore{color:var(--fg-muted)}
.ctop > .ctl{flex:1;min-width:0}
.cfull{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.lrow .cfull{padding-left:28px}  /* the tick box's width, so chips and text line up under the name */
.cdesc{display:flex;align-items:flex-end;gap:16px} .cdesc .cnext{flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cdesc .cdate{margin-left:auto}
.ctop{display:flex;gap:12px;align-items:flex-start}
.cmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.ctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cnext{margin:0}
.cmeta{display:flex;align-items:center;gap:8px;margin-top:6px}
.cchips{display:flex;gap:6px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.cchips::-webkit-scrollbar{display:none}
.cdate{white-space:nowrap;flex:none}
.crow .acts{flex-wrap:nowrap}
.cbody{margin-top:12px;display:flex;flex-direction:column;gap:8px}
.cbody .eyebrow{margin-top:4px}
.pnote{display:flex;flex-direction:column;gap:2px}
.tline{display:flex;flex-direction:column;gap:8px}
.tl{display:flex;align-items:center;gap:12px;margin:0;background:var(--inset)}
.tld{width:64px;flex:none}
.cshots{display:flex;align-items:center;gap:12px}
.cstack{display:flex;flex-direction:column;gap:8px}
.cstack .row{margin:0}
.hero .ctl .spill{margin-left:4px}
.hero .cchips{margin-top:8px}
.spill.danger{background:color-mix(in srgb,var(--status-error) 15%,transparent);border-color:color-mix(in srgb,var(--status-error) 30%,transparent)}
.spill.info .dot{background:var(--accent)}
.spill.stage{background:var(--panel);border-color:var(--edge-strong);color:var(--fg)}  /* the stage: neutral, a step stronger than the markers' tint */
/* the ⋯ menu: the app's shared Menu, hanging under its button */
.mwrap{position:relative;display:inline-flex}
.mhint{font-size:11px;color:var(--fg-muted);line-height:1.35}
.menu{position:absolute;right:auto;left:0;top:calc(100% + 4px);z-index:20;min-width:140px;padding:4px;display:flex;flex-direction:column;border-radius:var(--radius-lg)}
.menu[hidden]{display:none}
.menu{min-width:280px;max-width:320px}
.mitem{display:flex;flex-direction:column;gap:2px;font:inherit;font-size:12px;text-align:left;padding:6px 10px;border:0;border-radius:var(--radius-md);background:transparent;color:var(--fg);cursor:pointer}
@media (hover:hover){.mitem:hover{background:var(--inset)}} .mitem:focus-visible{outline:2px solid var(--accent)}
@media (max-width:760px){.ctop{flex-direction:column}.crow .acts{width:100%;justify-content:flex-end}}
'''

JS = r'''
// Today: Open unfolds a row inside its own box; ⋯ opens the small menu (closes on a click outside or Esc)
document.addEventListener('click',e=>{
  const o=e.target.closest('.copen');if(o){const b=o.closest('.crow').querySelector('.cbody');b.hidden=!b.hidden;o.setAttribute('aria-expanded',!b.hidden);o.textContent=b.hidden?'View chats':'Hide chats';fades();return}
  const m=e.target.closest('.mbtn');$$('.menu').forEach(x=>{if(!m||x!==m.nextElementSibling){x.hidden=true;x.previousElementSibling.setAttribute('aria-expanded','false')}});
  if(m){const x=m.nextElementSibling;x.hidden=!x.hidden;m.setAttribute('aria-expanded',!x.hidden)}
  if(e.target.closest('.mitem'))$$('.menu').forEach(x=>x.hidden=true)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.menu').forEach(x=>x.hidden=true)});
'''
