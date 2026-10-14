#!/usr/bin/env python3
"""Builds index.html: "How it's wired" — the app's real parts and the connections between them.

WHY a builder: the parts and the inside connections are written down here, each with the file
or MAP.md row it was read from (shown only in a hover/detail, labelled as code locations). The
vision links (planned / being built connections and every status word) are read live from
../../vision-skeleton.json and ../../vision-evidence-C.json — status is never typed in here
except for the parts/links that only exist in code, which are "exists" because MAP.md and the
files named below exist (checked 2026-10-14).
"""
import json, os, html
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.abspath(os.path.join(HERE, '..', '..'))
sk = json.load(open(os.path.join(D, 'vision-skeleton.json')))
ev = json.load(open(os.path.join(D, 'vision-evidence-C.json')))['nodes']
cc_css = open(os.path.join(D, 'cc.css')).read()

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

DATA = dict(parts=PARTS, edges=EDGES, traces=TRACES,
            title={i: TITLE[i] for i in TITLE})

CSS = r"""
/* page-specific rules only; every look (fonts, surfaces, radius, status colours) comes from cc.css */
.screen{position:fixed;inset:0;display:flex;flex-direction:column;background:var(--panel)}
.band{height:40px;flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 12px}
.btitle{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500}
.body{flex:1;min-height:0;display:flex;padding:0 10px 10px}
.pane{flex:1;min-width:0;display:flex;background:var(--canvas);border-radius:var(--radius-xl);overflow:hidden}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.head{padding:12px 20px 8px;display:flex;flex-direction:column;gap:8px;position:relative}
.head::after{content:'';position:absolute;bottom:0;left:16px;right:16px;height:1px;background:linear-gradient(to right,transparent,var(--edge-card) 8%,var(--edge-card) 92%,transparent)}
.lens{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.legend{display:flex;gap:14px;align-items:center;margin-left:auto;font-size:11px;color:var(--fg-muted)}
.legend i{display:inline-block;width:26px;height:0;border-top:2px solid var(--status-ok);vertical-align:middle;margin-right:5px}
.legend i.building{border-top-color:var(--fg-muted)} .legend i.planned{border-top:2px dashed var(--fg-faint)}
.scroll{flex:1;min-height:0;overflow:auto;padding:12px 20px 20px}
.stage{position:relative;width:1022px;height:610px;margin:0 auto}
.stage svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.edge{fill:none;stroke-width:2;stroke-linecap:round}
.edge.exists{stroke:var(--status-ok)} .edge.building{stroke:var(--fg-muted);stroke-width:2.5}
.edge.planned{stroke:var(--fg-faint);stroke-dasharray:6 5}
.hit{fill:none;stroke:transparent;stroke-width:16;cursor:pointer}
.ehov{opacity:.9}
.stage.dim .edge,.stage.dim .node{opacity:.22}
.stage.dim .edge.on,.stage.dim .node.on{opacity:1}
.stage.dim .edge.seen,.stage.dim .node.seen{opacity:.6}
.edge.on{stroke-width:4.5}
.edge.sel{stroke-width:4}
.node{position:absolute;width:150px;height:70px;padding:8px 10px;border-radius:var(--radius-lg);border:1px solid var(--edge-card);background:var(--panel);box-shadow:var(--layer-shadow);cursor:pointer;display:flex;flex-direction:column;justify-content:center;gap:4px;text-align:left;color:var(--fg);font:inherit;transition:background-color 120ms steps(4)}
@media (hover:hover){.node:hover{background:var(--inset)}}
.node:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.node .nt{font-size:13px;font-weight:500;line-height:1.2}
.node .ns{font-size:11px;color:var(--fg-muted);display:flex;align-items:center;gap:5px}
.node.exists{border-left:4px solid var(--status-ok)}
.node.building{border-left:4px solid var(--fg-muted)}
.node.outside{background:var(--well);border-style:solid;box-shadow:none}
.node.ahead{background:transparent;box-shadow:none;border:1px dashed var(--fg-faint);border-left:1px dashed var(--fg-faint)}
.node.ahead.planned .nt{color:var(--fg-2)}
.node.ahead.building{background:var(--panel);border-style:dashed;border-left:4px solid var(--fg-muted)}
.node.ahead.idea{background:repeating-linear-gradient(45deg,transparent 0 5px,color-mix(in srgb,var(--fg-faint) 14%,transparent) 5px 6px)}
.node.sel{outline:2px solid var(--accent);outline-offset:2px}
.badge-n{position:absolute;top:-9px;right:-9px;min-width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;padding:0 4px}
.zone{position:absolute;font-size:11px;color:var(--fg-muted)}
.zone.ahead{left:730px;top:540px;width:290px;line-height:1.4}
.zone.out{}
.dot.building{background:var(--fg-muted)} .dot.planned{background:var(--fg-faint)}
.dot.idea{background:repeating-linear-gradient(45deg,var(--fg-faint) 0 2px,transparent 2px 4px);border:1px solid var(--fg-faint)}
.dot.exists{background:var(--status-ok)}
.drawer{width:340px;flex:none;overflow:auto;padding:16px;border-left:1px solid var(--edge-card);background:var(--panel)}
.drawer h2{margin:0 0 4px;font-size:16px;font-weight:500}
.drawer h3{margin:16px 0 6px;font-size:12px;font-weight:500;color:var(--fg-muted)}
.drawer p{margin:6px 0;font-size:13px;line-height:1.45}
.crow{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;padding:8px 10px;margin:0 0 6px;border:1px solid var(--edge-card);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--inset) 50%,transparent);color:var(--fg);cursor:pointer;font-size:12px;line-height:1.4}
@media (hover:hover){.crow:hover{background:var(--inset)}}
.crow:focus-visible{outline:2px solid var(--accent)}
.crow .dot{margin-top:5px}
.crow b{font-weight:500}
.vrow{padding:6px 0;font-size:12px;border-top:1px solid var(--edge-dim)}
.vrow:first-child{border-top:0}
ul.plain{margin:4px 0;padding-left:18px;font-size:12px;color:var(--fg-2)}
details.code{margin-top:14px;font-size:11px;color:var(--fg-muted)}
details.code summary{cursor:pointer}
details.code code{display:block;font-size:11px;color:var(--fg-2);margin:3px 0;word-break:break-all}
.stepcard{border:1px solid var(--edge);border-radius:var(--radius-xl);padding:14px;background:var(--inset)}
.stepcard .sn{font-size:11px;color:var(--fg-muted)}
.stepcard p{font-size:14px;margin:6px 0 12px;line-height:1.45}
.stepcard .acts{display:flex;gap:8px;align-items:center}
.vtabs{margin:8px 0}.vtabs button{font-size:12px;padding:3px 10px}
.tooltip{position:fixed;z-index:50;max-width:300px;padding:8px 10px;border-radius:var(--radius-lg);background:var(--panel);border:1px solid var(--edge);box-shadow:var(--layer-shadow);font-size:12px;line-height:1.4;pointer-events:none;display:none}
.hint1{font-size:12px;color:var(--fg-muted)}
"""

JS = r"""
const D = JSON.parse(document.getElementById('data').textContent);
const W=150,H=70,PX=172;
const stage=document.getElementById('stage'), svg=document.getElementById('lines'), drawer=document.getElementById('drawer'), tip=document.getElementById('tooltip');
const WORD={exists:'exists',building:'being built',planned:'planned',idea:'only an idea so far'};
const P={},E={},els={},eels={};
D.parts.forEach(p=>{P[p.id]=p;p.px=p.x*PX;p.py=p.y});
D.edges.forEach(e=>E[e.id]=e);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function showTip(html,ev){tip.innerHTML=html;tip.style.display='block';moveTip(ev)}
function moveTip(ev){const r=tip.getBoundingClientRect();let x=ev.clientX+14,y=ev.clientY+14;if(x+r.width>innerWidth-8)x=ev.clientX-r.width-14;if(y+r.height>innerHeight-8)y=ev.clientY-r.height-14;tip.style.left=x+'px';tip.style.top=y+'px'}
function hideTip(){tip.style.display='none'}
// where a line meets a box: the point on the box's outline along the line to the other box's centre
function anchor(a,b,pad){const cx=a.px+W/2,cy=a.py+H/2,tx=b.px+W/2,ty=b.py+H/2,dx=tx-cx,dy=ty-cy;
  const sx=dx?(W/2+pad)/Math.abs(dx):1e9,sy=dy?(H/2+pad)/Math.abs(dy):1e9,t=Math.min(sx,sy);return[cx+dx*t,cy+dy*t]}
function edgePath(e){const a=P[e.a],b=P[e.b],[x1,y1]=anchor(a,b,3),[x2,y2]=anchor(b,a,3);return`M${x1},${y1} L${x2},${y2}`}
// nodes
D.parts.forEach(p=>{
  const b=document.createElement('button');b.className=`node ${p.kind} ${p.cls}`;b.style.left=p.px+'px';b.style.top=p.py+'px';b.dataset.id=p.id;
  const lead=p.kind==='outside'?'Outside the app':p.kind==='ahead'?WORD[p.cls]:'';
  b.innerHTML=`<span class="nt">${esc(p.t)}</span><span class="ns">${p.kind==='ahead'?`<i class="dot ${p.cls}"></i>${esc(WORD[p.cls])}`:p.kind==='outside'?'Outside the app':`<i class="dot ${p.cls}"></i>${esc(WORD[p.cls])}`}</span>`;
  b.onmouseenter=ev=>showTip(p.code.length?`<b>${esc(p.t)}</b><br>Click for what it does. Where it lives in the code: ${p.code.slice(0,3).map(esc).join(', ')}${p.code.length>3?' …':''}`:`<b>${esc(p.t)}</b><br>${esc(WORD[p.cls])}. Click for what it needs.`,ev);
  b.onmousemove=moveTip;b.onmouseleave=hideTip;
  b.onclick=()=>{leaveTrace();select('node',p.id)};
  stage.appendChild(b);els[p.id]=b;
});
// edges
const NS='http://www.w3.org/2000/svg';
['exists','building','planned'].forEach(c=>{const m=document.createElementNS(NS,'marker');m.id='ar-'+c;m.setAttribute('viewBox','0 0 10 10');m.setAttribute('refX','8');m.setAttribute('refY','5');m.setAttribute('markerWidth','7');m.setAttribute('markerHeight','7');m.setAttribute('orient','auto-start-reverse');
 const pa=document.createElementNS(NS,'path');pa.setAttribute('d','M1,1 L9,5 L1,9 z');pa.setAttribute('fill',c==='exists'?'var(--status-ok)':c==='building'?'var(--fg-muted)':'var(--fg-faint)');m.appendChild(pa);svg.appendChild(m)});
D.edges.forEach(e=>{
  const d=edgePath(e);
  const p=document.createElementNS(NS,'path');p.setAttribute('d',d);p.setAttribute('class','edge '+e.cls);p.setAttribute('marker-end',`url(#ar-${e.cls})`);if(e.both)p.setAttribute('marker-start',`url(#ar-${e.cls})`);p.id='e-'+e.id;
  const h=document.createElementNS(NS,'path');h.setAttribute('d',d);h.setAttribute('class','hit');
  h.onmouseenter=ev=>showTip(`${esc(e.s)}<br><span style="color:var(--fg-muted)">${esc(WORD[e.cls])}. Click for why.</span>`,ev);h.onmousemove=moveTip;h.onmouseleave=hideTip;
  h.onclick=()=>{leaveTrace();select('edge',e.id)};
  svg.appendChild(p);svg.appendChild(h);eels[e.id]=p;
});
const dotLayer=document.createElementNS(NS,'g');svg.appendChild(dotLayer);

let sel=null,trace=null;
function clearMarks(){Object.values(els).forEach(n=>{n.classList.remove('on','seen','sel');const b=n.querySelector('.badge-n');if(b)b.remove()});Object.values(eels).forEach(n=>n.classList.remove('on','seen','sel'));stage.classList.remove('dim');dotLayer.innerHTML=''}
function dotRow(c){return`<i class="dot ${c}"></i>`}
function conRow(e,fromId){const other=P[e.a===fromId?e.b:e.a];
  return`<button class="crow" data-e="${e.id}"><i class="dot ${e.cls}"></i><span><b>${esc(other.t)}</b>: ${esc(e.s)} <span class="muted">(${WORD[e.cls]})</span></span></button>`}
function bindRows(){drawer.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{select('edge',b.dataset.e)})}
function renderDefault(){
  const open=D.edges.filter(e=>e.cls!=='exists');
  const order={building:0,planned:1};open.sort((a,b)=>order[a.cls]-order[b.cls]);
  drawer.innerHTML=`<h2>What is not finished</h2><p class="hint1">Each of these connections is planned or being built. Click one to see why, or pick a part.</p>`+
   open.map(e=>`<button class="crow" data-e="${e.id}"><i class="dot ${e.cls}"></i><span><b>${esc(P[e.a].t)} to ${esc(P[e.b].t)}</b>: ${esc(e.s)} <span class="muted">(${WORD[e.cls]})</span></span></button>`).join('')+
   `<h3>How to read the picture</h3><p class="hint1">Boxes are the app's real parts. Solid green lines are connections that work today. Dashed grey lines are planned. Faint boxes with dashed edges do not exist yet. Pick a trace above to watch one path step by step.</p>`;
  bindRows();
}
function select(kind,id){
  clearMarks();sel={kind,id};
  if(kind==='node'){
    const p=P[id];els[id].classList.add('sel');
    const edges=D.edges.filter(e=>e.a===id||e.b===id);
    edges.forEach(e=>{eels[e.id].classList.add('on');els[e.a].classList.add('on');els[e.b].classList.add('on')});stage.classList.add('dim');els[id].classList.add('on');
    let h=`<h2>${esc(p.t)}</h2><p><span class="spill"><i class="dot ${p.cls}"></i>${p.kind==='outside'?'Outside the app':esc(WORD[p.cls])}</span></p><p>${esc(p.what)}</p>`;
    if(p.inside.length)h+=`<h3>Inside this part</h3><ul class="plain">${p.inside.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`;
    h+=`<h3>Connections (${edges.length})</h3>`+edges.map(e=>conRow(e,id)).join('');
    if(p.visionItems.length)h+=`<h3>In your big picture</h3>`+p.visionItems.map(v=>`<div class="vrow"><i class="dot ${v.cls}"></i> <b class="fw">${esc(v.t)}</b> <span class="muted">${esc(v.w)}</span><div class="muted">${esc(v.why)}</div></div>`).join('');
    if(p.code.length)h+=`<details class="code"><summary>Where it lives in the code</summary>${p.code.map(c=>`<code>youcoded/desktop/src/${esc(c)}</code>`).join('')}<div style="margin-top:6px">Read from: ${esc(p.src)}</div></details>`;
    drawer.innerHTML=h;
  }else{
    const e=E[id];eels[id].classList.add('on','sel');els[e.a].classList.add('on');els[e.b].classList.add('on');stage.classList.add('dim');
    drawer.innerHTML=`<h2>${esc(P[e.a].t)} ${e.both?'and':'to'} ${esc(P[e.b].t)}</h2><p><span class="spill"><i class="dot ${e.cls}"></i>${esc(WORD[e.cls])}</span></p><p style="font-size:14px">${esc(e.s)}</p>
    <h3>Why we say so</h3><ul class="plain">${e.src.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
    <h3>Ends of this connection</h3><button class="crow" data-n="${e.a}"><b>${esc(P[e.a].t)}</b></button><button class="crow" data-n="${e.b}"><b>${esc(P[e.b].t)}</b></button>`;
    drawer.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>select('node',b.dataset.n));
  }
  bindRows();
}
// ---- traces
const lens=document.getElementById('traces');
D.traces.forEach(t=>{const b=document.createElement('button');b.className='fchip tip below';b.dataset.tip=t.hint;b.setAttribute('aria-pressed','false');b.textContent=t.t;b.dataset.t=t.id;b.onclick=()=>trace&&trace.t.id===t.id?leaveTrace():startTrace(t);lens.insertBefore(b,lens.querySelector('.legend'))});
function leaveTrace(){if(!trace)return;trace=null;lens.querySelectorAll('.fchip').forEach(b=>b.setAttribute('aria-pressed','false'));clearMarks();sel=null;renderDefault()}
function startTrace(t){leaveTrace();trace={t,v:t.variants[0],i:0};lens.querySelectorAll('.fchip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===t.id));drawStep()}
function stepNodes(s){return s.e?[E[s.e].a,E[s.e].b]:[s.n]}
function drawStep(){
  clearMarks();const steps=trace.v.steps,s=steps[trace.i];stage.classList.add('dim');
  // earlier steps stay softly lit; the current one is bold
  steps.slice(0,trace.i).forEach(p=>{(p.e?[p.e].concat(p.also||[]):[]).forEach(x=>eels[x].classList.add('seen'));stepNodes(p).forEach(n=>els[n].classList.add('seen'))});
  const cur=(s.e?[s.e]:[]).concat(s.also||[]);
  cur.forEach(x=>{eels[x].classList.remove('seen');eels[x].classList.add('on')});
  stepNodes(s).concat((s.also||[]).flatMap(x=>[E[x].a,E[x].b])).forEach(n=>{els[n].classList.remove('seen');els[n].classList.add('on')});
  const nb=document.createElement('span');nb.className='badge-n';nb.textContent=trace.i+1;els[stepNodes(s)[s.d===-1?1:0]].appendChild(nb);
  if(s.e){const e=E[s.e],a=s.d===-1?e.b:e.a,b=s.d===-1?e.a:e.b,[x1,y1]=anchor(P[a],P[b],3),[x2,y2]=anchor(P[b],P[a],3);
    const c=document.createElementNS(NS,'circle');c.setAttribute('r','5');c.setAttribute('fill','var(--accent)');
    const am=document.createElementNS(NS,'animateMotion');am.setAttribute('dur','1.4s');am.setAttribute('repeatCount','indefinite');am.setAttribute('path',`M${x1},${y1} L${x2},${y2}`);c.appendChild(am);dotLayer.appendChild(c)}
  const t=trace.t,multi=t.variants.length>1;
  drawer.innerHTML=`<h2>${esc(t.t)}</h2>`+(multi?`<div class="tabs vtabs">${t.variants.map(v=>`<button data-v="${v.id}" aria-selected="${v===trace.v}">${esc(v.t)}</button>`).join('')}</div>`:'')+
   `<div class="stepcard"><div class="sn">Step ${trace.i+1} of ${steps.length}</div><p>${esc(s.s)}</p><div class="acts"><button class="btn sm" id="bk" ${trace.i?'':'disabled'}>Back</button><button class="btn sm primary" id="nx">${trace.i<steps.length-1?'Next':'Start again'}</button><span class="spacer"></span><button class="btn sm ghost" id="ex">Close</button></div></div>
   <h3>All steps</h3>`+steps.map((x,k)=>`<button class="crow" data-k="${k}" ${k===trace.i?'style="background:var(--inset);border-color:var(--edge-strong)"':''}><b>${k+1}</b><span>${esc(x.s)}</span></button>`).join('');
  drawer.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{trace.v=t.variants.find(v=>v.id===b.dataset.v);trace.i=0;drawStep()});
  drawer.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{trace.i=+b.dataset.k;drawStep()});
  document.getElementById('nx').onclick=()=>{trace.i=(trace.i+1)%steps.length;drawStep()};
  document.getElementById('bk').onclick=()=>{trace.i--;drawStep()};document.getElementById('ex').onclick=leaveTrace;
}
stage.addEventListener('click',e=>{if(e.target===stage||e.target===svg){if(trace)return;sel=null;clearMarks();renderDefault()}});
renderDefault();
"""

def icon():
    return '<svg class="ic" viewBox="0 0 24 24"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/></svg>'

page = f"""<!doctype html><html lang="en" data-theme="creme"><head><meta charset="utf-8"><title>How it is wired</title>
<style>{cc_css}
{CSS}</style></head><body>
<div class="screen">
 <div class="band"><span></span><span class="btitle">{icon()}How it's wired</span><span></span></div>
 <div class="body"><div class="pane">
  <div class="main">
   <div class="head">
    <div class="t-xs muted">The app's real parts and what connects them. Pick a part or a line, or follow one path step by step.</div>
    <div class="lens" id="traces"><span class="legend"><span><i></i>works today</span><span><i class="building"></i>being built</span><span><i class="planned"></i>planned</span></span></div>
   </div>
   <div class="scroll"><div class="stage" id="stage">
     <svg id="lines"></svg>
     <div class="zone ahead">Not built yet: these exist only in your big picture</div>
   </div></div>
  </div>
  <aside class="drawer" id="drawer"></aside>
 </div></div>
</div>
<div class="tooltip" id="tooltip"></div>
<script type="application/json" id="data">{json.dumps(DATA).replace('</', '<\\/')}</script>
<script>{JS}</script></body></html>"""
open(os.path.join(HERE, 'index.html'), 'w').write(page)
print('wrote index.html', len(page), 'bytes;', len(PARTS), 'parts,', len(EDGES), 'connections')
