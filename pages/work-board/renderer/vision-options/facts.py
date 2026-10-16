#!/usr/bin/env python3
"""ONE list of facts for every big-picture view (zoom, journeys, stack, wiring) -> facts.json.

WHY (Destin, 2026-10-14, vision-options choice deck): "i would want to be able to kinda switch between
any/all of them, and have them all kinda pull from the same underlying data". Before this, Zoom and
Foundations read all three evidence files while Wiring read only one, so the views could disagree.
Now every view's build.py reads facts.json and nothing else. Statuses come only from the evidence
files, merged by the page's own loader (../vision_tab.py). Journeys and the app's wiring (parts,
connections, traces) are hand-written definitions moved here unchanged from journeys/ and wiring/;
the real version replaces them with facts the work cards record.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.dirname(HERE)
sys.path.insert(0, DESIGN)
import vision_tab as vt

sk, _ev, _ins = vt.load(DESIGN)
nodes = vt.flatten(sk)
vt.merge(nodes, _ev)
for nid, n in nodes.items():
    n['track'] = vt.track_for(nid, nodes, sk['track_of'])
    n['screens'] = sk.get('screens_of', {}).get(nid, [])
# The helpers below were written against the raw evidence dict; the merged nodes have the same keys.
ev = nodes

# ============================================================== JOURNEYS (moved from journeys/build.py)
LABEL = {'marketplace.browse.pages': 'Find pages in the marketplace', 'marketplace.publish.share': 'Publish your own skill, theme or page',
         'everywhere.platforms.desktop': 'Install on Windows, Mac or Linux', 'marketplace.setup.install': 'One-click install with clear permissions'}
# (vision_tab.merge already drops connections to ids the skeleton does not have)

# ---- the journeys, from Destin's own words (destin-words.md, 2026-10-07 voice notes + the skeleton quotes)
J = [
 dict(title='A student puts the app on a laptop and a phone, and picks a free model',
      quote='it\'s cross platform and everything is designed to work cross platform. So you can download it on anything',
      steps=['everywhere.platforms.desktop','everywhere.firstrun.setup','everywhere.platforms.android','sync.follow.projects','chat.converse.local','yours.model.free','yours.everyone.student']),
 dict(title='Someone builds a money page by describing it, then shares it',
      quote='you can either build something yourself from scratch, or pull in more or less any existing open source application',
      steps=['pages.build.create','pages.build.theme','pages.connect.connections','pages.connect.money','marketplace.publish.share','marketplace.browse.pages','marketplace.publish.fork']),
 dict(title='An agent runs overnight on whichever of your devices is on',
      quote='automatically hand it off to whichever of your devices are live and connected at any given moment',
      steps=['agents.unit.recipe','agents.background.personal','agents.background.scheduled','sync.follow.projects','sync.follow.safety','sync.mesh.handoff','agents.background.view']),
 dict(title='A page that updates itself every week with the research you need',
      quote='autonomous agents in the background that are tied to a specific page … they compile all this week\'s research … in a page',
      steps=['pages.build.create','agents.unit.recipe','agents.background.scheduled','pages.agents.attached','agents.background.view','yours.everyone.student']),
 dict(title='Start a chat on one device, pick it up on another',
      quote='I start a conversation on one device, I can pick it up on almost any of my other devices pretty much immediately',
      steps=['sync.follow.chats','sync.follow.remote','everywhere.platforms.web','everywhere.platforms.android','sync.follow.safety','sync.mesh.backup']),
 dict(title='A normal person finds free tools and has the assistant set them up',
      quote='download a single app and then see curated free content that would actually be useful to them in their daily lives',
      steps=['everywhere.platforms.desktop','everywhere.firstrun.setup','marketplace.browse.curated','marketplace.setup.install','marketplace.setup.walkthrough','yours.everyone.ostools']),
 dict(title='Use any AI you like, with no single company holding your work',
      quote='use any open weight model, any US or Chinese model to work with an open source document editor',
      steps=['chat.converse.cloud','chat.converse.local','chat.converse.native','yours.model.any','yours.model.free','yours.model.data']),
]
# WHY: two steps are marked done but their own evidence line says there is a catch; a row should not read cleaner than the evidence
CATCH = ['marketplace.publish.share', 'everywhere.platforms.android']
# titles of every skeleton node
TITLE = {}
def walk(n):
    TITLE[n['id']] = n['title']
    for k in ('capabilities', 'features'):
        for c in n.get(k, []): walk(c)
for p in sk['pillars']: walk(p)
WORD = {'done': 'exists', 'building': 'being built', 'planned': 'planned', 'vision': 'only an idea so far'}
CLS = {'done': 'exists', 'building': 'building', 'planned': 'planned', 'vision': 'idea'}

def need(a, b):
    """The plain reason a needs b, straight from the evidence file."""
    for x in ev[a]['needs']:
        if x['id'] == b: return f"{TITLE[a]} needs {TITLE[b]}: {x['because']}"
    raise KeyError((a, b))
def share(a, b):
    for x in ev[a]['shares']:
        if x['id'] == b: return f"{TITLE[a]} and {TITLE[b]} overlap: {x['because']}"
    raise KeyError((a, b))
def st(i): return ev[i]['status']


# ============================================================== WIRING (moved from wiring/build.py)
SRC = 'youcoded/desktop/src/'
# ----------------------------------------------------------------------------- PARTS
# x,y are grid cells (pitch 172 x 1px). kind: inside = in the app; outside = other people's
# systems; ahead = not built (only from the vision files).
P = lambda **k: k
PARTS = [
 P(id='chat', t='Chat screen', kind='inside', status='exists', x=0, y=20,
   what="The window where you type and read. It draws every message and the cards that ask your permission.",
   inside=['Message box', 'Chat view', 'Permission and plan cards', 'Status bar', 'Model picker'],
   code=['renderer/components/InputBar.tsx', 'renderer/state/chat-reducer.ts', 'renderer/state/screen-feed.ts'],
   src="docs/MAP.md row 'Chat & transcript'", vision=[]),
 P(id='phone', t='Phone & browser', kind='inside', status='exists', x=0, y=150,
   what="Another screen onto the assistant running on your computer: your phone app or any web browser. It does not hold your chats; it reaches your computer over a private link.",
   inside=['Phone app (Android)', 'Web version in a browser', "The computer's side of the link", 'Paired-device list'],
   code=['main/remote-server.ts', 'renderer/remote-shim.ts', 'main/remote-devices.ts', 'app/src/main/kotlin/com/youcoded/app/runtime/'],
   src="docs/MAP.md rows 'Remote access', 'Android runtime'",
   vision=['sync.follow.remote', 'everywhere.platforms.web', 'everywhere.platforms.android', 'everywhere.platforms.onecore']),
 P(id='door', t='The doorway', kind='inside', status='exists', x=1, y=85,
   what="One shared list of everything a screen can ask for (send a message, open a chat, install a skill). The computer window and the phone read the same list, so they cannot drift apart.",
   inside=['Window door', 'Phone door', 'One request list, grouped by feature (chat, files, sync, marketplace, pages...)'],
   code=['shared/backend-contract.ts', 'main/ipc/channel-table.ts', 'main/preload.ts', 'main/remote-server.ts'],
   src="docs/MAP.md row 'IPC bridge (parity)'", vision=[]),
 P(id='keeper', t='Conversation keeper', kind='inside', status='exists', x=2, y=85,
   what="Starts, tracks and ends every conversation. Keeps the computer's own record of each one and pushes live updates (waiting questions, queued messages, model name) to every screen showing it.",
   inside=['Starting and stopping chats', "The computer's record of each chat", 'Live facts sent to screens', "'May be stuck' check"],
   code=['main/session-manager.ts', 'main/session-record.ts', 'main/publish.ts', 'main/session-live.ts', 'main/create-runtime.ts'],
   src="docs/MAP.md rows 'The runtime and the two doors', 'PTY I/O & keyboard', 'Remote access'", vision=[]),
 P(id='cc', t='Claude Code', kind='inside', status='exists', x=3, y=20,
   what="Anthropic's own assistant program, run for you in a hidden terminal. YouCoded types into it and reads back what it writes down.",
   inside=['Hidden terminal', 'Reading its pop-up questions so they become buttons', 'Tool-use signals it sends back (hooks)', 'The live file watcher'],
   code=['main/pty-worker.js', 'main/session-manager.ts', 'main/hook-relay.ts', 'main/transcript-watcher.ts'],
   src="docs/MAP.md rows 'PTY I/O & keyboard', 'Claude Code prompts', 'Chat & transcript'", vision=[]),
 P(id='engine', t="YouCoded's own engine", kind='inside', status='exists', x=3, y=150,
   what="YouCoded's own way to run the assistant, with the model you pick, including models on your own computer. It has its own instructions, tools, permissions and helpers.",
   inside=['Instructions it is given', 'Tools it can use', 'Helpers (specialists)', 'Permissions', 'Models on your computer', 'Model providers', 'Skill list'],
   code=['main/harness/native-session-host.ts', 'main/harness/harness-session.ts', 'main/harness/prompt-assembly.ts', 'main/providers/provider-registry.ts', 'main/engine/engine-supervisor.ts'],
   src="docs/MAP.md rows 'Native runtime (harness)', 'Local engine & models', 'Specialists'", vision=[]),
 P(id='cloud', t='Cloud AI companies', kind='outside', status='exists', x=4, y=85,
   what="The companies whose models answer: Anthropic (Claude), OpenAI (ChatGPT) and OpenRouter. Outside the app; you sign in or bring a key.",
   inside=['Claude (account sign-in)', 'ChatGPT (sign-in)', 'OpenRouter (key or sign-in)'],
   code=['main/providers/claude-account.ts', 'main/providers/chatgpt-auth.ts', 'main/providers/provider-registry.ts'],
   src="docs/MAP.md rows 'Claude Code's own sign-in', 'Sign in with ChatGPT', 'OpenRouter key check'", vision=[]),
 P(id='projects', t='Projects & files', kind='inside', status='exists', x=1, y=240,
   what="The folders you work in. Every conversation runs inside one project folder.",
   inside=['Saved folders', 'Project instructions and context', 'Folder watcher'],
   code=['main/folders-service.ts', 'main/saved-folders.ts', 'main/project-context.ts', 'main/project-repo.ts'],
   src='session-manager.ts (every session has a working folder, cwd)', vision=[]),
 P(id='saved', t='Saved conversations', kind='inside', status='exists', x=2, y=250,
   what="Every chat is a file on your computer. The app reads the file as it grows (that is how answers appear) and it is what resuming and syncing use.",
   inside=['Conversation store', 'Resume browser', 'Handoff between computers', 'Chat search'],
   code=['main/conversations/store-core.ts', 'main/transcript-watcher.ts', 'main/harness/session-store.ts', 'main/session-browser.ts'],
   src="docs/MAP.md rows 'Conversation store', 'Chat & transcript'", vision=[]),
 P(id='sync', t='Sync (your GitHub)', kind='inside', status='exists', x=2, y=380,
   what="Keeps your projects and chats in step between your computers, through a hidden copy in your own GitHub account. Never touches a git repository of your own.",
   inside=['Watcher and sync engine', 'GitHub copy', 'Project list', 'Live signal between computers', 'One-writer check before a chat opens'],
   code=['main/sync-spaces/engine.ts', 'main/sync-spaces/git-transport.ts', 'main/sync-spaces/project-registry.ts', 'main/sync-hub-socket.ts', 'main/conversations/resume-admission.ts'],
   src="docs/MAP.md rows 'Sync spaces & GitHub', 'Conversation handoff'",
   vision=['sync.follow', 'sync.follow.chats', 'sync.follow.projects', 'sync.follow.safety']),
 P(id='market', t='Marketplace & add-ons', kind='inside', status='exists', x=4, y=250,
   what="Skills, themes and plugins you install. Installing copies them onto your computer where the assistants can find them.",
   inside=['Skills', 'Themes', 'Plugins', 'Install records'],
   code=['main/skill-provider.ts', 'main/plugin-installer.ts', 'main/claude-code-registry.ts', 'main/install-reconcile.ts', 'main/marketplace-api-handlers.ts'],
   src="docs/MAP.md row 'Registries & plugins'", vision=[]),
 P(id='store', t='Online store', kind='outside', status='exists', x=5, y=250,
   what="The shared catalog online: what exists, ratings and install counts. Separate from the app; it is fetched when you open the Marketplace.",
   inside=['Skill catalog and ratings', 'Theme catalog'],
   code=['wecoded-marketplace/worker/', 'wecoded-themes/'],
   src="CLAUDE.md 'Registries are fetched at runtime'; docs/MAP.md 'Registries & plugins'", vision=[]),
 P(id='pages', t='Pages', kind='inside', status='exists', x=4, y=380,
   what="Small apps that live inside YouCoded. A page is kept with a project or in your personal space, and talks to the outside only through connections you approve.",
   inside=['Page view', 'Connection approvals', 'The Page builder skill'],
   code=['main/pages/pages-store.ts', 'main/pages/pages-service.ts', 'main/pages/page-connections.ts', 'renderer/components/pages/PageHost.tsx'],
   src="docs/MAP.md row 'YouCoded Pages'", vision=[]),
 # ---- ahead: only from the vision files
 P(id='mesh', t='Mesh: devices as one', kind='ahead', status=st('sync.mesh.handoff'), x=1, y=520,
   what="Your devices act as one pool and work moves to whichever is on. Nothing in the app picks a device for you yet.",
   inside=[], code=[], src='vision-evidence-C.json', vision=['sync.mesh', 'sync.mesh.handoff', 'sync.mesh.backup', 'sync.mesh.anydevice', 'sync.mesh.cloud']),
 P(id='sched', t='Scheduled agents', kind='ahead', status=st('agents.background.scheduled'), x=2, y=520,
   what="Work that runs by itself while you are away, with a place to see every agent. No scheduling code exists yet.",
   inside=[], code=[], src='vision-evidence-C.json', vision=['agents.background', 'agents.background.scheduled', 'agents.background.personal', 'agents.background.view', 'agents.background.device']),
 P(id='recipe', t='Saved agent recipes', kind='ahead', status=st('agents.unit.recipe'), x=3, y=520,
   what="An assistant saved as a reusable thing: its model, instructions, tools and limits. Helpers (specialists) are the nearest real thing today.",
   inside=[], code=[], src='vision-evidence-C.json', vision=['agents.unit', 'agents.unit.recipe', 'agents.unit.workflows', 'agents.unit.inpages']),
]
PID = {p['id'] for p in PARTS}

# ----------------------------------------------------------------------------- CONNECTIONS
E = lambda **k: k
EDGES = [
 E(id='chat-door', a='chat', b='door', both=True, status='exists',
   s="Your message leaves the chat box as a request to the doorway. Answers come back the same way.",
   src=['docs/MAP.md row IPC bridge', SRC + 'renderer/components/InputBar.tsx', SRC + 'shared/backend-contract.ts (session:input)']),
 E(id='phone-door', a='phone', b='door', both=True, status='exists',
   s="A phone or browser sends the very same requests, over a private link to your computer.",
   src=['docs/MAP.md row Remote access', SRC + 'main/remote-server.ts', SRC + 'renderer/remote-shim.ts']),
 E(id='door-keeper', a='door', b='keeper', both=True, status='exists',
   s="The doorway hands each request to the keeper of that conversation; the keeper pushes updates back out through it.",
   src=['docs/MAP.md rows IPC bridge, The runtime and the two doors', SRC + 'main/ipc/session.ts', SRC + 'main/publish.ts']),
 E(id='keeper-cc', a='keeper', b='cc', status='exists',
   s="For a Claude Code chat, the keeper types your words into the hidden terminal where Claude Code is running.",
   src=['docs/MAP.md row PTY I/O & keyboard', SRC + 'main/session-manager.ts', SRC + 'main/pty-worker.js']),
 E(id='keeper-engine', a='keeper', b='engine', both=True, status='exists',
   s="For a chat on YouCoded's own engine, the keeper hands your message to the engine, and gets the answer straight back.",
   src=['docs/MAP.md row Native runtime (harness)', SRC + 'main/harness/native-session-host.ts']),
 E(id='cc-cloud', a='cc', b='cloud', both=True, status='exists',
   s="Claude Code sends the conversation to Anthropic, signed in as you, and the answer streams back.",
   src=["docs/MAP.md row 'Claude Code's own sign-in, read LIVE'", SRC + 'main/providers/claude-account.ts']),
 E(id='engine-cloud', a='engine', b='cloud', both=True, status='exists',
   s="The engine sends it to whichever company you picked, or to a model running on your own computer instead.",
   src=['docs/MAP.md rows Native runtime, Local engine & models', SRC + 'main/providers/provider-registry.ts', SRC + 'main/engine/engine-supervisor.ts']),
 E(id='cc-saved', a='cc', b='saved', status='exists',
   s="Claude Code writes every message of the chat into a file as it goes.",
   src=['docs/MAP.md row Chat & transcript', SRC + 'main/transcript-watcher.ts']),
 E(id='engine-saved', a='engine', b='saved', status='exists',
   s="The engine saves each turn into the same kind of file.",
   src=[SRC + 'main/harness/native-session-host.ts (writes each turn to disk)', SRC + 'main/harness/session-store.ts']),
 E(id='saved-keeper', a='saved', b='keeper', status='exists',
   s="The app watches that file. Each new line becomes an update, which is how a Claude Code answer reaches your screen.",
   src=['docs/MAP.md row Chat & transcript', SRC + 'main/transcript-watcher.ts', SRC + 'main/publish.ts']),
 E(id='keeper-projects', a='keeper', b='projects', status='exists',
   s="Every conversation runs inside one project folder and works on the files there.",
   src=[SRC + 'main/session-manager.ts (a session carries its folder)']),
 E(id='projects-sync', a='projects', b='sync', status=st('sync.follow.projects'),
   s="Sync watches your project folders and copies changes to your own GitHub account.",
   src=[SRC + 'main/sync-spaces/engine.ts', 'vision-evidence-C.json: Projects and files on every device']),
 E(id='saved-sync', a='saved', b='sync', both=True, status=st('sync.follow.chats'),
   s="Chats are synced the same way, and before a chat opens, sync checks no other computer is writing to it.",
   src=['docs/MAP.md row Conversation handoff (one writer per conversation)', SRC + 'main/conversations/resume-admission.ts', 'vision-evidence-C.json: Conversations continue on any device']),
 E(id='market-store', a='market', b='store', both=True, status='exists',
   s="The app fetches the catalog from the online store and tells it what you installed.",
   src=['docs/MAP.md row Registries & plugins', SRC + 'main/marketplace-api-handlers.ts', SRC + 'main/install-reconcile.ts']),
 E(id='market-cc', a='market', b='cc', status='exists',
   s="An installed skill is copied into the folder Claude Code reads, so it shows up in your chats in any project.",
   src=[SRC + 'main/plugin-installer.ts', SRC + 'main/claude-code-registry.ts']),
 E(id='market-engine', a='market', b='engine', status='exists',
   s="The engine's own skill list reads the same installed skills.",
   src=[SRC + 'main/harness/skills/skill-catalog.ts', SRC + 'main/skill-provider.ts']),
 E(id='market-pages', a='market', b='pages', status='exists',
   s="The Page builder is itself a marketplace skill; the pages it makes appear in Pages.",
   src=["docs/MAP.md row YouCoded Pages (wecoded-marketplace/wecoded-pages-plugin)"]),
 # ---- ahead: from needs / shares
 E(id='sched-recipe', a='sched', b='recipe', status=st('agents.background.scheduled'),
   s="A scheduled agent needs a saved recipe to run.",
   src=[need('agents.background.scheduled', 'agents.unit.recipe')]),
 E(id='recipe-engine', a='recipe', b='engine', status=st('agents.unit.recipe'),
   s="A saved recipe grows out of helpers (specialists), which the engine already has.",
   src=[share('agents.unit.recipe', 'chat.steer.specialists')]),
 E(id='mesh-sched', a='mesh', b='sched', status=st('sync.mesh.handoff'),
   s="Mesh has nothing to move until scheduled agents exist.",
   src=[need('sync.mesh.handoff', 'agents.background.scheduled')]),
 E(id='mesh-sync', a='mesh', b='sync', status=st('sync.mesh.handoff'),
   s="Mesh builds on the project copying Sync already does, and on 'never lose or duplicate work', which is still being built.",
   src=[need('sync.mesh.handoff', 'sync.follow.projects'), need('sync.mesh.handoff', 'sync.follow.safety'), need('sync.mesh.backup', 'sync.follow.projects')]),
 E(id='mesh-phone', a='mesh', b='phone', status=st('sync.mesh.anydevice'),
   s="A request handed to any device would travel over the same live link the phone uses today.",
   src=[need('sync.mesh.anydevice', 'sync.follow.remote')]),
]
for e in EDGES:
    assert e['a'] in PID and e['b'] in PID, e
    e['status'] = e['status']  # evidence word
EDGE_STATUS = lambda s: {'done': 'exists', 'exists': 'exists', 'building': 'building', 'planned': 'planned', 'vision': 'planned'}[s]
for e in EDGES: e['cls'] = EDGE_STATUS(e['status'])
for p in PARTS: p['cls'] = {'exists': 'exists', 'done': 'exists', 'building': 'building', 'planned': 'planned', 'vision': 'idea'}[p['status']]
# the recipe edge to the engine is the one in-progress link
# vision items of each part with status, titles and why — read from the evidence
for p in PARTS:
    p['visionItems'] = [dict(id=i, t=TITLE[i], cls=CLS[st(i)], w=WORD[st(i)], why=ev[i]['why']) for i in p['vision']]

# ----------------------------------------------------------------------------- TRACES
TRACES = [
 dict(id='message', t='Follow a message',
      hint='Press Enter in the chat box and watch where your words go and how the answer comes back.',
      variants=[
       dict(id='cc', t='Claude Code', steps=[
        dict(e='chat-door', d=1, s="You press Enter. The chat screen turns your message into a request and sends it to the doorway."),
        dict(e='door-keeper', d=1, s="The doorway passes it to the keeper of this conversation."),
        dict(e='keeper-cc', d=1, s="The keeper types your words into the hidden terminal where Claude Code is running."),
        dict(e='cc-cloud', d=1, s="Claude Code sends the conversation to Anthropic, signed in as you."),
        dict(e='cc-cloud', d=-1, s="The answer streams back to Claude Code."),
        dict(e='cc-saved', d=1, s="Claude Code writes the answer into the conversation's file."),
        dict(e='saved-keeper', d=1, s="The app is watching that file. Each new line becomes an update."),
        dict(e='door-keeper', d=-1, s="The keeper pushes the update out through the doorway to every screen showing this chat."),
        dict(e='chat-door', d=-1, s="Your chat screen draws the answer. A phone with the same chat open draws it too.", also=['phone-door']),
       ]),
       dict(id='engine', t="YouCoded engine", steps=[
        dict(e='chat-door', d=1, s="You press Enter. The chat screen turns your message into a request and sends it to the doorway."),
        dict(e='door-keeper', d=1, s="The doorway passes it to the keeper of this conversation."),
        dict(e='keeper-engine', d=1, s="The keeper hands your message to YouCoded's own engine."),
        dict(e='engine-cloud', d=1, s="The engine sends it to the company you picked, or to a model on your own computer."),
        dict(e='engine-cloud', d=-1, s="The answer streams back to the engine."),
        dict(e='keeper-engine', d=-1, s="The engine hands the answer straight back to the keeper, and saves a copy to the conversation's file.", also=['engine-saved']),
        dict(e='door-keeper', d=-1, s="The keeper pushes the update out through the doorway to every screen showing this chat."),
        dict(e='chat-door', d=-1, s="Your chat screen draws the answer. A phone with the same chat open draws it too.", also=['phone-door']),
       ])]),
 dict(id='install', t='Follow a marketplace install',
      hint='Install a skill and watch where it lands and who can then use it.',
      variants=[dict(id='x', t='', steps=[
        dict(e='market-store', d=1, s="You open the Marketplace. The app asks the online store for the catalog."),
        dict(e='market-store', d=-1, s="The store sends back the list, with ratings and install counts."),
        dict(n='market', s="You press Install. The app downloads the item to your computer."),
        dict(e='market-cc', d=1, s="The skill is copied into the folder Claude Code reads. Any hooks or tools it needs are registered."),
        dict(e='market-engine', d=1, s="YouCoded's own engine reads the same installed skills, so it can use it too."),
        dict(e='market-store', d=1, s="The app tells the store what you installed. That is where install counts come from."),
        dict(n='chat', s="Your next chat, in any project, can use the skill."),
      ])]),
 dict(id='sync', t='Follow a sync',
      hint='Change something on one computer and watch it reach your other one.',
      variants=[
       dict(id='proj', t='A project file', steps=[
        dict(e='projects-sync', d=1, s="You change a file in a project. Sync notices a moment later."),
        dict(n='sync', s="Sync copies the change to your own GitHub account, into a hidden copy that never touches a repository of your own."),
        dict(n='sync', s="On your other computer, Sync hears about it (a live signal, or its regular check) and pulls the change down."),
        dict(e='projects-sync', d=-1, s="It writes the new file into that computer's copy of the project."),
        dict(n='projects', s="If both computers changed the same file at once, today you only get a short warning. Safer handling is still being built."),
       ]),
       dict(id='chat', t='A chat', steps=[
        dict(e='saved-sync', d=1, s="Your chat is a file; Sync notices it grew and picks it up."),
        dict(n='sync', s="Sync copies it to your own GitHub account, into a hidden copy that never touches a repository of your own."),
        dict(n='sync', s="On your other computer, Sync hears about it and pulls it down."),
        dict(e='saved-sync', d=-1, s="Before it opens there, sync checks no other computer is writing to this chat, then saves it into that computer's chat files."),
        dict(e='saved-keeper', d=1, s="You resume the chat. The keeper reads the file and the conversation is back on screen."),
       ])]),
]


for e in EDGES:
    assert e['a'] in PID and e['b'] in PID, e
for j_ in J:
    for s in j_['steps']: assert s in nodes, s
for k_, v_ in LABEL.items(): nodes[k_]['label'] = v_
for k_ in CATCH: nodes[k_]['catch'] = True

facts = dict(
    mission=sk['mission'],
    tracks={t['id']: t for t in sk['tracks']},
    systems=[dict(id=p['id'], title=p['title']) for p in sk['pillars']],
    nodes=nodes,
    journeys=J,
    parts=PARTS, edges=EDGES, traces=TRACES,
)
bad = [n['id'] for n in nodes.values() if n['kind'] == 'feature' and n['status'] not in ('done', 'building', 'planned', 'vision')]
assert not bad, ('a feature with no real status', bad)
open(os.path.join(HERE, 'facts.json'), 'w').write(json.dumps(facts, ensure_ascii=False, indent=1))
print('facts.json:', sum(n['kind'] == 'feature' for n in nodes.values()), 'features,', len(J), 'journeys,', len(PARTS), 'parts,', len(EDGES), 'connections,', len(TRACES), 'traces')
