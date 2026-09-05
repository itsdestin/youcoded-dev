#!/usr/bin/env python3
"""Page-shaped copy review: the NEW landing page laid out with the real site's CSS,
new copy in place, dashed placeholder boxes where the recorded loops / live embed
will sit, every text block editable in place, and a toggle that shows the old
text under each block. Served like the review deck: edits save as they happen to
<out>.answers.json; Submit ends the server and writes <out>.answers.md.

  python3 scripts/ui-review/copy-preview.py build <site index.html> <out-dir>
  python3 scripts/ui-review/copy-preview.py serve <site index.html> <out-dir> [--no-open] [--port N] [--timeout MIN]

WHY a page and not a table: Destin reviewed the old→new table (copy-review.py) and
could not tell how any of it would land on the page — "chunked up and displayed
all kinds of weird". Copy is only judgeable in its layout."""
import argparse
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from deck.serve import already_served, serve  # noqa: E402

# ---------------------------------------------------------------- the copy ----
# Each editable block: (id, new text, old text or '' for brand-new). Text is HTML
# (kept minimal: <strong>, <em>, <br>).

E = html.escape


def ed(tag, cid, new, old='', cls='', extra=''):
    """An editable block with its old text attached for the 'show old' toggle."""
    c = f' class="{cls}"' if cls else ''
    return f'<{tag}{c} data-c="{cid}" data-old="{E(old, quote=True)}"{extra}>{new}</{tag}>'


ROWS = [
    ('row1', 'Seamless integration', 'Tools and conversations work across any model.',
     'Select from hundreds of models via OpenRouter, use Claude Code with your subscription plan, or pick an offline, private model to run on your own computer. Switch models mid-conversation without interruption.',
     'LOOP · Midnight — your skit: the edgy request, Claude\'s "No can do, I\'m a good boy!", the picker switches to Grok 4, Grok\'s rant, "whoa... that was a bit too much grok", Grok dials it back. Same conversation throughout; the model chip changes.', '', '', ''),
    ('row2', 'Genuinely useful', 'Give it a task and it does real work, with boundaries you can trust.',
     'It reads your files, writes new ones, develops repeatable skills and workflows, searches the web, and helps you manage your computer and your life more efficiently. Permission modes let you restrict the model to match your level of comfort.',
     'LOOP · Crème — "go through this morning\'s email and handle what you can": Gmail search (MCP), the Quarterly Report skill loads, reads the numbers, asks before writing the draft (you click Yes), two calendar events (one asked), "want me to tell Dr. Patel?", "yes, send it", asks before sending, Sent. Email and calendar are MCP integrations the user connects first — not built in.',
     'Integrations · WeCoded', 'Connect your services.', 'With skills from the WeCoded marketplace, YouCoded can link with all of the following services: [18 clickable tags: Google Drive … Canva]'),
    ('row3', 'Logical management', 'Project view keeps your files, conversations, and assistant instructions organized.',
     'Open spreadsheets, documents, and images, revisit prior conversations, and see how your assistant is instructed to behave in each project.',
     'LOOP · Light — Project View: Files tab opens a PDF and a spreadsheet in-app; the editor pane; one project-wide search.', '', '', ''),
    ('row4', 'Stay organized', 'Tags, notes, and shortcuts.',
     'Tag and annotate conversations, pin the ones that matter, and hide the ones you\'ll never go back to. Quick chips run the prompts you use every day in one tap.',
     'LOOP · Dark — a quick chip clicked; a session tagged + noted; the resume list filtered by tag; the Instructions & Memories tab showing the project\'s instructions.', '', '', ''),
    ('row5', 'Works everywhere', 'Start on your laptop. Finish on your phone.',
     'Windows, macOS, Linux, Android, and any browser. Your conversations and files stay in sync through your own private GitHub, so what you started here is waiting there.',
     'LOOP · Meadow Mist — the same conversation on desktop, then in a phone frame beside it; sync "up to date".',
     'Cross-Device Backup & Sync', 'Start anywhere. Pick up everywhere.',
     'Your skills, conversations, themes, and settings are automatically backed up to your preferred provider — Google Drive, iCloud, or GitHub — every 15 minutes, then downsynced to your other Windows, macOS, Linux, and Android devices. Switch machines mid-thought without losing a beat. Doubles as a full restore-from-backup when you set up a new device. Not something Claude Code does natively.'),
    ('row6', 'Make it yours', 'Describe a look. Install a plugin. Share both.',
     'Build a theme by describing it — customize wallpapers, app colors, mascots. Browse 300+ plugins from the marketplace: journaling, a personal encyclopedia, calendar and email integrations, and whatever your friends publish.',
     'LOOP · Midnight → Golden Sunbreak — "build me a theme with the vibe of outdoor anime art" typed; Write cards; the app re-skins to Golden Sunbreak; then a pan across the real marketplace.',
     'Theme Builder · WeCoded Marketplace · Journaling', 'Build a theme just by describing it. / Browse, share, and download everything that makes the app yours. / Talk about your day. The structure happens on its own.',
     'Tell Claude the vibe you want and it builds full UI themes with custom wallpapers, colors, particle effects, icons, and mascot characters. Imagine "Liquid Glass", but built by a single guy in his bedroom who still outdid Apple\'s entire visual design team. Share your themes directly with friends or publish them to the WeCoded Marketplace for anyone to download. / Themes, skills, and integrations — all in one place. Install what you want, then share what you build. The marketplace is the core of how YouCoded stays fun, social, and personal instead of feeling like another boring AI tool. / Just start talking — about work, people, whatever\'s on your mind. Claude asks follow-up questions, pulls out tasks and calendar events without you having to ask, indexes information about your friends and family, and slowly builds a searchable history of your life…'),
    ('row7', 'Play while it works', 'Challenge a friend while it thinks.',
     'Long tasks take a minute. Play Connect Four with a friend in the side panel, see who\'s online, and get back to the answer when it\'s ready.',
     'LOOP · Halftone Dimension — a task running; Connect Four with a friend in the side panel; presence dots.',
     'Multiplayer Games', 'Play with friends while Claude works.',
     'Claude Code can take time on big tasks. Instead of staring at a spinner and twiddling your thumbs, challenge your friends to a game of Connect 4 right inside the app while you wait. The goal is to take the boring tasks we all use AI for (studying, working, etc.) and make them slightly more fun by allowing us to do them with friends. Real-time multiplayer, in-game chat, powered by Cloudflare. More games coming, soon to be opened to community-built games in the marketplace.'),
    ('row8', 'For builders', 'Made to be customized and work with you.',
     'Run Claude Code as a first-class session next to the app\'s own agent. Review, stage, and commit changes without leaving the window. Connect tools over MCP. Download and run local models with a GPU-fit check.',
     'LOOP · Midnight — a Claude Code session tab beside a native session; Settings → Model Providers; a local model download in progress.', '', '', ''),
]

FAQ = [
    ('How is this different from ChatGPT or claude.ai?',
     'Those are chat websites. YouCoded Assistant is an app on your computer and phone that works in your own files — it opens, edits, and organizes them, runs tasks, and searches the web — and you choose the AI behind it: Claude, hundreds of cloud models, or one that runs locally for free.',
     'How is this different from claude.ai?',
     'Claude.ai is a chat website. YouCoded is an app built on top of Claude Code — a more powerful form of Claude that can create files, run terminal commands, manage your computer, and interact more meaningfully with a wider range of external services. Think of claude.ai as texting Claude, and YouCoded as giving Claude hands (with themes, a marketplace, games, and remote access layered on top).'),
    ('Do I have to pay for anything?',
     'No. The app is free and open source. A model that runs on your own computer costs nothing. If you want Claude, that\'s a Claude Pro or Max plan from Anthropic; if you want other cloud models, OpenRouter bills per use.',
     'What does the $20/month get me?',
     'The $20 goes to Anthropic for a Claude Pro subscription, which gives you access to Claude Code — the AI that powers everything. YouCoded itself is free and open source. You\'re paying for the AI, not the app.'),
    ('Is my data private?',
     'Your conversations, files, and settings live in your own GitHub (and, if you add them, your Google Drive or iCloud). Cloud models see what you send them while they work; a local model sends nothing anywhere. The app sends one anonymous daily ping — a hash of your device ID, the app version, platform, and rough region — so we can see how many people use it. No IP address, no username, no message content. Turn it off in Settings → About → Privacy.',
     'Is my data private?',
     'Everything YouCoded and your installed WeCoded skills create — journal entries, your Encyclopedia, tasks — is stored in your own Google Drive or iCloud account. While data is temporarily sent to Claude/Anthropic to make the actual AI work, the long-term storage of your data is fully managed by you. YouCoded itself sends one anonymous daily ping — an irreversible hash of your device\'s hardware ID, the app version, platform and OS, and the country and approximate region from the connection — so we can see whether the app is growing and which versions people are running. No IP address, no username, no message content, nothing traceable back to you. You can turn this off at any time in Settings → About → Privacy. Skills, themes, and other marketplace entries you publish are shared publicly on purpose — those are the only contents you actively submit to YouCoded.'),
    ('What platforms does it run on?',
     'Windows, macOS, Linux, and Android, plus any web browser by connecting to a computer running the app. Apple integrations (iMessage, Apple Notes, and so on) work on macOS only.',
     'What platforms does it run on?',
     'Windows, macOS, Linux, and Android are all fully supported with native apps. You can also access YouCoded remotely from any web browser. Apple ecosystem integrations (iMessage, Apple Notes, etc.) are only available on macOS.'),
    ('Do I need to know how to code?',
     'No. The whole app was built by someone who has never written code, by talking to AI. If you can use ChatGPT, you can use this.',
     'Do I need to know how to code?',
     'Not at all. YouCoded was built entirely by a non-developer using Claude Code itself. The app is designed for everyone — students, professionals, and anyone else who uses AI regularly. If you can use ChatGPT, you can use YouCoded.'),
    ('Is "agentic" AI safe?',
     'The app asks before it changes anything, and every standing permission you grant is listed on one screen where you can revoke it. AI still makes mistakes, so keep an eye on what it\'s doing — and be careful with full-auto mode, which lets it act without asking.',
     'I\'ve heard bad things about "agentic" AI. Is it safe?',
     'YouCoded always asks for permission before taking actions, so it\'s hard to break things accidentally. Claude is also, in my personal experience, much less prone to errors and hallucinations than models like ChatGPT and Gemini. However, AI is still prone to mistakes. Claude\'s permission settings should prevent those mistakes from being translated into action, but you should always monitor your AI assistant when in use to verify it\'s acting as intended. You should be especially cautious when taking advantage of "Bypass Permissions" mode, which allows Claude to act without your input.'),
    ('Who built this?',
     'So far, it\'s just me (Destin). However, my intention is for this open-source project to become something we all build together. I believe one of the greatest potential goods of AI comes from its ability to revolutionize the world of open-source software. This project is just one example of what AI can allow us to create: an app owned by nobody, improved by everybody — all without anyone needing to learn how to code or even understand what "open-source" is. No profit motive, no ulterior incentives — just people making cool shit and sharing it with other people :)',
     'Who built this?', '(unchanged)'),
]

CARDS = [
    ('GitHub', 'required', 'Required', 'free', 'Free',
     'Keeps your conversations and files in sync across devices and delivers marketplace updates. Sign up with your Google or Apple account.', 'Create a GitHub account &rarr;',
     'GitHub · Required · Free — Required to receive marketplace updates. Sign up with your Google or Apple account.'),
    ('Anthropic', 'optional', 'Optional', 'paid', 'Paid',
     'A Claude Pro or Max plan lets you use Claude — the model YouCoded was built with.', 'See Claude plans &rarr;',
     'Anthropic · Required · Paid — A Claude Pro ($20/mo) or Max ($100–200/mo) subscription for Claude Code, which powers everything in YouCoded. The app itself is free — you\'re paying for the AI.'),
    ('OpenRouter', 'optional', 'Optional', 'paid', 'Pay as you go',
     'One account provides access to hundreds of models from every AI company. Pay only for what you use.', 'Create an OpenRouter account &rarr;', ''),
    ('Google or Apple', 'optional', 'Optional', 'free', 'Free',
     'An extra copy of your data in Google Drive or iCloud, on top of GitHub.', '',
     'Google or Apple · Required · Free — WeCoded marketplace skills store your personal data in your own Google Drive or iCloud account.'),
]


MEDIA = {'dir': None, 'gaps': {}}
SCENE_FILE = {'row1': 'row1-any-ai', 'row2': 'row2-does-things', 'row3': 'row3-projects', 'row4': 'row4-organized',
              'row5': 'row5-follow', 'row6': 'row6-yours', 'row7': 'row7-play', 'row8': 'row8-builders'}


def media_block(rid, scene):
    """The row's loop when the media dir has it (with a Yes/No/Other verdict), else the dashed placeholder."""
    name = SCENE_FILE.get(rid)
    d = MEDIA['dir']
    have = d and name and os.path.exists(os.path.join(d, name + '.webm'))
    if not have:
        return f'<div class="ph-media"><div>{E(scene)}</div></div>'
    phone = rid == 'row5' and os.path.exists(os.path.join(d, 'row5-phone.webm'))
    vid = lambda n: f'<video class="row-video" muted loop playsinline preload="metadata" poster="media/{n}.webp"><source src="media/{n}.webm" type="video/webm"></video>'
    inner = vid(name) + (f'<div class="phone-bezel">{vid("row5-phone")}</div>' if phone else '')
    gap = MEDIA['gaps'].get(rid, '')
    what = scene.split(' — ', 1)[-1] if ' — ' in scene else scene
    return (f'<div class="row-media{" row-media-duo" if phone else ""}">{inner}</div>'
            f'<div class="rv-judge" data-j="{rid}.loop"><div class="rv-what"><b>What this loop shows:</b> {E(what)}' + (f'<br><b>Known gap:</b> {E(gap)}' if gap else '') + '</div>'
            '<div class="rv-q">Does this loop tell this row\'s story? <button data-v="yes">Yes</button><button data-v="no">No</button><button data-v="other">Other</button>'
            '<input class="rv-note" placeholder="note — what\'s missing / wrong / better"></div></div>')


def body():
    p = []
    a = p.append
    a('<nav class="nav"><div class="nav-inner"><a href="#" class="nav-logo"><img src="favicon-dark.svg" alt="" class="nav-icon" width="22" height="22">'
      '<span class="nav-logo-text"><span>You<span style="color: var(--title-highlight)">Coded</span> ' + ed('span', 'nav.agent', 'Assistant', 'Agent', 'nav-logo-agent') + '</span>'
      + ed('span', 'nav.sub', 'Agentic AI for Everyone.', 'For Claude Code by Anthropic', 'nav-logo-sub') + '</span></a>'
      '<ul class="nav-links"><li><a href="#about">About</a></li><li><a href="#demo">Features</a></li><li><a href="#get-started">Download</a></li><li><a href="#faq">FAQ</a></li></ul></div></nav>')
    a('<header class="hero" id="top"><div class="container"><h1>Make AI <span class="word-cycler-static" style="color:var(--title-highlight);font-style:italic">Yours.</span></h1>'
      '<p class="rv-caption">animates: <b>Useful.</b> → <b>Fun.</b> → <b>Yours.</b> (was: Make Claude Useful. → Fun. → Cute. → Yours.)</p>'
      + ed('p', 'hero.sub', 'A self-improving, customizable AI agent. Use any AI model from any provider to build or accomplish anything you want.', '(no sentence under the headline today)', 'hero-sub')
      + '</div></header>')
    a('<div class="container"><div class="divider"></div></div>')
    a('<section id="about"><div class="container">' + ed('p', 'about.label', 'What is this?', 'What is this?', 'section-label') + ed('h2', 'about.title', 'More than a chatbot.', 'More than a chatbot.', 'section-title')
      + '<div class="intro-box">' + ed('p', 'about.p1', 'YouCoded is a fully-customizable AI assistant that works with your own files and data to autonomously accomplish tasks. Review and organize large spreadsheets, compile the latest medical or financial research, draft an email or slideshow, or build new features in large coding projects. With YouCoded, you can utilize OpenRouter to access any AI model from any provider including Anthropic (Claude), OpenAI (ChatGPT), Alibaba (Qwen) and more. YouCoded also allows you to download and run open source AI models on your own device, if your hardware supports it. YouCoded is built to become a fully-modular and open source assistant platform, as the app itself integrates the ability for all users to build and share skills, tools, themes, and app improvements. Because YouCoded was designed from the ground up to improved by individuals with no coding or development interest, it can quickly outpace development of competing closed agents in a way that is driven by what users really want.',
                                        'YouCoded is an add-on of sorts for Claude Code, a powerful agentic AI tool from Anthropic that can create and edit any type of file, search the web, run terminal commands, and navigate your screen. While Claude Code was designed for coding, YouCoded turns it into something else entirely — a fully capable and customizable agentic AI assistant that doesn\'t require you to know how to use AI or understand what "agentic" means. With YouCoded, you can teach Claude to navigate emails from any provider, read and summarize your texts, rebuild your spreadsheets, help you study, and more. You get the most intriguing and intuitive form of AI available today, all without needing to become a fratty tech-bro to do it. // YouCoded combines that powerful AI with a themeable chat UI, a community marketplace WeCoded to share and download "skills" (instructions that give your Claude new abilities), multiplayer mini-games, custom integrations with external services, and remote access from any browser.')
      + ed('p', 'about.perm', 'Nothing happens without your permission. YouCoded Assistant asks before it acts.', 'Nothing happens without your permission. YouCoded will always ask before taking any action.', 'permission-note') + '</div></div></section>')
    a('<div class="container"><div class="divider"></div></div>')
    a('<section id="see-it"><div class="container">' + ed('p', 'embed.label', 'Try it', '', 'section-label') + ed('h2', 'embed.title', 'Click around, I guess.', '', 'section-title')
      + ed('p', 'embed.desc', 'Type a message, open the model picker, or switch the theme. This demo is a pixel-perfect representation of the real app\'s interface.', '', 'section-desc')
      + '<div class="ph-media ph-embed"><div><b>LIVE EMBED</b> — the real app, clickable, in a window frame.<br>Theme swatches under it: Midnight · Crème · Light · Dark · Halftone · Meadow Mist · Golden Sunbreak</div></div></div></section>')
    a('<div class="container"><div class="divider"></div></div>')
    a('<section class="demo-section" id="demo"><div class="container">' + ed('p', 'demo.label', 'What you get', 'What you get', 'section-label') + ed('h2', 'demo.title', 'Everything the app gives you.', 'Everything the app gives you.', 'section-title') + '<div class="showcase-grid">')
    for i, (rid, label, title, desc, scene, ol, ot, od) in enumerate(ROWS):
        a(f'<div class="showcase-item{" reverse" if i % 2 else ""}"><div class="showcase-text">' + ed('span', rid + '.label', label, ol, 'showcase-label') + ed('h3', rid + '.title', title, ot, 'showcase-title') + ed('p', rid + '.desc', desc, od, 'showcase-desc')
          + '</div>' + media_block(rid, scene) + '</div>')
    a('<div class="showcase-item reverse"><div class="showcase-text">' + ed('span', 'row9.label', 'Roadmap <span class="roadmap-chip">Coming after 1.3</span>', '', 'showcase-label') + ed('h3', 'row9.title', 'Hand it off.', '', 'showcase-title')
      + ed('p', 'row9.desc', 'Set up a job once — what to do, which tools it may use, where to stop and check with you — then run it on a schedule or send it from your phone. Results and approvals land in an inbox. First: run now and scheduled runs. Later: kick off from an incoming email or a changed file.', '', 'showcase-desc')
      + '</div><div class="ph-media ph-sketch"><div><b>SKETCH, not a recording</b> — dashed-outline Agents view: a named automation with a schedule, "Run now" from a phone, an inbox entry waiting for approval.</div></div></div>')
    a('</div><p class="rv-removed"><b>Cut from this section:</b> the 18-tag "Connect your services" wall (folds into row 2), the 10-item "Everything else you get" accordion, and the standalone Journaling row (an example inside row 6).</p></div></section>')
    a('<div class="container"><div class="divider"></div></div>')
    a('<section class="origin-story-section" id="story"><div class="container">' + ed('p', 'story.label', 'Story', 'Story', 'section-label') + ed('h2', 'story.title', 'How we got here.', 'How we got here.', 'section-title') + '<div class="origin-story">'
      + '<p class="origin-story-text rv-unchanged">Honestly, I really just wanted a cooler and more efficient way to journal and track my own tasks/goals. The very first thing I built with Claude is the Journaling and Life History system (now available in the marketplace), and I pretty quickly decided that I wanted to share it with my friends. However, the thought of installing and opening "Claude Code" in the terminal scared away most people almost immediately. I realized that the idea of advanced agentic AI is still rather new to most people, and that persuading them to adopt my fancy new journaling system would require it to be <em>much</em> more accessible and user-friendly. Towards this end, I kind of just&hellip; kept adding things. And now we\'re here.</p>'
      + '<p class="origin-story-text rv-unchanged" style="margin-top:16px">Every line of YouCoded was written through conversation with Claude by me, <strong>someone who has never written code</strong>. Every feature, every platform port, every theme, every multiplayer game. The entire app was built, and is currently maintained, without a single line typed by hand.</p>'
      + ed('p', 'story.p3', 'YouCoded Assistant is what that kind of AI looks like when it\'s built for everyone — not just the people who already know how to use it.', '(new third paragraph)', 'origin-story-text', ' style="margin-top:16px"')
      + '<a class="origin-story-link">Built by Destin &rarr;</a></div></div></section>')
    a('<div class="container"><div class="divider"></div></div>')
    a('<section id="get-started"><div class="container">' + ed('p', 'gs.label', 'Get started', 'Get started', 'section-label') + ed('h2', 'gs.title', 'You may need a few accounts.', 'You\'ll need a couple of accounts.', 'section-title') + '<div class="prereq-grid rv-four">')
    for i, (name, b1c, b1, b2c, b2, text, link, old) in enumerate(CARDS):
        a(f'<div class="prereq-card"><div class="prereq-header"><h3>{name}</h3><div class="prereq-badges"><span class="prereq-badge {b1c}">{b1}</span><span class="prereq-badge {b2c}">{b2}</span></div></div>'
          + ed('p', f'gs.card{i}', text, old) + (f'<a class="prereq-link">{link}</a>' if link else '') + '</div>')
    a('</div>' + ed('p', 'gs.line', 'Or skip the paid ones entirely — run a model on your own computer, free and offline.', '', 'download-note') + '</div></section>')
    a('<section class="download-section" id="download"><div class="container">' + ed('h2', 'dl.title', 'Download YouCoded Assistant', 'Download YouCoded', 'section-title')
      + '<div class="download-grid">' + ''.join(f'<a class="download-card"><div class="download-card-text"><span class="download-card-label">Download for</span><span class="download-card-platform">{pl}</span></div></a>' for pl in ('Windows', 'macOS', 'Linux', 'Android')) + '</div>'
      + ed('p', 'dl.note', 'Free and open source.<br>On iPhone? Use YouCoded Assistant from Safari by connecting to any computer running the app.', 'Free and open source. Just bring your Claude Pro or Max plan. / On iPhone? Use YouCoded from Safari by connecting to any computer running the app via remote access.', 'download-note')
      + '<div class="rv-modal"><b>Install popup → "After install" steps:</b> ' + ed('span', 'dl.step1', '1. Sign in with GitHub.', '1. Sign in with your Claude Pro or Max plan') + ' ' + ed('span', 'dl.step2', '2. Choose where your AI comes from — Claude, OpenRouter, or a model on this computer (Settings → Model Providers).', '2. Pick a starter theme and model') + ' ' + ed('span', 'dl.step3', '3. Pick a theme and browse the marketplace.', '3. Browse the marketplace')
      + ' <em>Android only:</em> ' + ed('span', 'dl.android', 'On Android, the first launch downloads the Claude Code runtime (~400–600 MB) — Android uses Claude only.', 'Android: first launch downloads the Claude Code runtime (~400–600MB depending on the package tier you pick)') + '</div></div></section>')
    a('<div class="container"><div class="divider"></div></div>')
    a('<section class="faq-section" id="faq"><div class="container">' + ed('p', 'faq.label', 'Common questions', 'Common questions', 'section-label') + ed('h2', 'faq.title', 'FAQ', 'FAQ', 'section-title') + '<div class="faq-list">')
    for i, (q, ans, oq, oa) in enumerate(FAQ):
        a('<div class="faq-item"><div class="faq-question">' + ed('span', f'faq{i}.q', q, oq) + '</div><div class="faq-answer rv-open"><div class="faq-answer-inner">' + ed('span', f'faq{i}.a', ans, oa) + '</div></div></div>')
    a('</div></div></section>')
    a('<section class="gallery-section" id="gallery"><div class="container">' + ed('p', 'gal.label', 'Gallery', 'Gallery', 'section-label') + ed('h2', 'gal.title', 'See what people have built.', 'See what people have built.', 'section-title')
      + '<div class="ph-media ph-strip"><div>GALLERY STRIP — fresh screenshots of the current app across themes (same strip as today, new images)</div></div></div></section>')
    a('<footer><div class="container"><div class="footer-inner"><a class="footer-logo"><span>You<span style="color: var(--title-highlight)">Coded</span> Assistant</span></a><div class="footer-links"><a>GitHub</a><a>Built by Destin</a><span class="rv-badge">Open Source</span></div></div>'
      + '<p class="footer-legal rv-unchanged">MIT License · YouCoded is an independent, community-built project. Not affiliated with, endorsed by, or officially supported by Anthropic.</p></div></footer>')
    return '\n'.join(p)


REVIEW_CSS = '''
.reveal{opacity:1!important;transform:none!important;visibility:visible!important}
body.intro-mode{overflow:auto}
.faq-answer.rv-open{max-height:none!important;height:auto!important;opacity:1!important;display:block!important;overflow:visible!important}
.faq-question{cursor:default}
.ph-media{aspect-ratio:16/10;border:2px dashed var(--border-accent);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;text-align:center;padding:28px;color:var(--text-dim);font-size:14px;line-height:1.5;background:var(--accent-subtle)}
.ph-media b{color:var(--text-primary)}.ph-embed{aspect-ratio:16/9;margin-top:22px}.ph-strip{aspect-ratio:6/1;margin-top:22px}.ph-sketch{border-style:dotted}
.hero-sub{max-width:720px;margin:18px auto 0;font-size:20px;line-height:1.5;color:var(--text-secondary);text-align:center}
.hero-actions{display:flex;gap:12px;justify-content:center;margin-top:22px}
.btn{display:inline-block;padding:12px 22px;border-radius:12px;font-weight:600;font-size:15px}.btn-primary{background:var(--title-highlight);color:#fff}.btn-ghost{border:1px solid var(--border);color:var(--text-primary)}
.nav-logo-agent{font-weight:500;opacity:.72}
.section-desc{max-width:720px;color:var(--text-secondary);font-size:16px;line-height:1.6}
.rv-caption{text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:8px}
.rv-removed{margin-top:22px;padding:12px 16px;border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-dim);font-size:14px}
.rv-modal{margin-top:22px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius);font-size:14px;color:var(--text-secondary);line-height:1.7}
.rv-four{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))!important}
.roadmap-chip{margin-left:8px;border:1px solid var(--title-highlight);color:var(--title-highlight);border-radius:999px;padding:1px 8px;font-size:10px}
.rv-badge{font-family:var(--font-mono);font-size:11px;border:1px solid var(--border);border-radius:999px;padding:2px 8px}
.footer-legal{color:var(--text-faint);font-size:12px;margin-top:10px}
/* real loops */
.row-media{border-radius:var(--radius);overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);border:1px solid var(--border);background:#0b1020}
.row-video{display:block;width:100%;height:auto}
.row-media-duo{position:relative;background:transparent;box-shadow:none;border:0;overflow:visible;margin-bottom:6%}
.phone-bezel{position:absolute;right:-3%;bottom:-8%;width:24%;border-radius:22px;padding:8px 4px;background:#111;box-shadow:0 20px 50px rgba(0,0,0,.35)}
.phone-bezel .row-video{border-radius:16px}
.rv-judge{margin-top:14px;padding:12px 14px;border:1px solid var(--border-accent);border-radius:var(--radius-sm);background:var(--accent-subtle);font-size:14px;color:var(--text-secondary)}
.rv-judge.yes{border-color:#2e7d4f}.rv-judge.no{border-color:#b23b3b}.rv-judge.other{border-color:#c98a2e}
.rv-what{margin-bottom:10px;line-height:1.5}.rv-what b{color:var(--text-primary)}
.rv-q{display:flex;flex-wrap:wrap;gap:8px;align-items:center;color:var(--text-primary);font-weight:600}
.rv-q button{border:1px solid var(--border);background:transparent;color:var(--text-primary);border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;font-weight:500;cursor:pointer}
.rv-judge.yes .rv-q button[data-v=yes]{background:#2e7d4f;color:#fff;border-color:#2e7d4f}
.rv-judge.no .rv-q button[data-v=no]{background:#b23b3b;color:#fff;border-color:#b23b3b}
.rv-judge.other .rv-q button[data-v=other]{background:#c98a2e;color:#fff;border-color:#c98a2e}
.rv-note{flex:1 1 260px;border:1px solid var(--border);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;background:transparent;color:var(--text-primary)}
/* review chrome */
[data-c]{outline:1px dashed transparent;outline-offset:3px;border-radius:4px;transition:outline-color .15s;position:relative}
body.rv-hint [data-c]{outline-color:rgba(127,127,127,.35)}
[data-c]:hover{outline-color:var(--title-highlight)}[data-c]:focus{outline:2px solid var(--title-highlight);background:rgba(127,127,127,.06)}
[data-c].rv-edited{outline-color:#c98a2e}[data-c].rv-no{text-decoration:line-through;opacity:.55;outline-color:#b23b3b}
.rv-unchanged{opacity:.7}
.old-text{display:none;font-size:12.5px;line-height:1.45;color:var(--text-muted);font-family:var(--font-mono);margin:6px 0 10px;padding:8px 10px;border-left:3px solid var(--border);white-space:pre-wrap}
body.rv-show-old .old-text{display:block}.old-text::before{content:"was: ";color:var(--text-faint)}
.rv-x{position:absolute;top:-10px;right:-10px;width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--bg-card);color:var(--text-dim);font-size:12px;line-height:20px;text-align:center;cursor:pointer;display:none;z-index:2}
[data-c]:hover>.rv-x,[data-c].rv-no>.rv-x{display:block}
#rvbar{position:fixed;top:68px;right:12px;z-index:1000;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:10px 12px;font:13px/1.4 var(--font-display);color:var(--text-primary);display:flex;gap:10px;align-items:center;box-shadow:0 10px 30px rgba(0,0,0,.25)}
#rvbar button{border:1px solid var(--border);background:transparent;color:var(--text-primary);border-radius:999px;padding:5px 11px;font:inherit;cursor:pointer}
#rvbar button[aria-pressed=true]{background:var(--text-primary);color:var(--bg-card)}
#rvbar .go{background:var(--title-highlight);color:#fff;border-color:var(--title-highlight);font-weight:600}
#rvstatus{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:1000;background:var(--bg-card);border:1px solid var(--border);border-radius:999px;padding:8px 16px;font:13px var(--font-display);color:var(--text-dim);max-width:90vw}
'''

REVIEW_JS = r'''
(function(){
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const KEY='copy-preview'; let server=false;
  const els=$$('[data-c]'); const orig={}; els.forEach(e=>orig[e.dataset.c]=e.innerHTML);
  const state={deck:KEY,started:new Date().toISOString(),submitted:null,answers:{}};
  const bar=document.createElement('div'); bar.id='rvbar';
  bar.innerHTML='<span><b id="rv-n">0</b> edited · <b id="rv-x">0</b> cut<span id="rv-l"></span></span><button id="rv-hint" aria-pressed="false">Show editable</button><button id="rv-old" aria-pressed="false">Show old text</button><button class="go" id="rv-submit">Submit</button>';
  document.body.appendChild(bar);
  const st=document.createElement('div'); st.id='rvstatus'; st.textContent=$$('.rv-judge').length?'Each row: watch the loop under its words, answer Yes / No / Other, add a note if it isn\'t Yes. Text is still editable in place. Submit when done.':'Click any text to rewrite it in place — saves as you type. Hover a block for ✕ to cut it. "Show old text" reveals what each block replaces.'; document.body.appendChild(st);
  async function load(){ try{const r=await fetch('/answers',{cache:'no-store'}); if(r.ok){server=true;const j=await r.json(); if(j&&j.answers)Object.assign(state,j);return;}}catch(e){} try{const j=JSON.parse(localStorage.getItem(KEY)||'null'); if(j&&j.answers)Object.assign(state,j);}catch(e){} }
  let t; function save(){ clearTimeout(t); t=setTimeout(async()=>{ try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){} if(server){ try{ await fetch('/answers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)}); st.textContent='Saved.'; }catch(e){ st.textContent='Server gone — edits kept in this browser; tell Claude.'; } } },250); }
  function paint(){ let n=0,x=0,ly=0,ln=0,lt=$$('.rv-judge').length; Object.entries(state.answers).forEach(([k,a])=>{ if(k.endsWith('.loop')){ if(a.v==='yes')ly++; else if(a.v)ln++; return; } if(a.v==='other')n++; if(a.v==='no')x++; }); $('#rv-n').textContent=n; $('#rv-x').textContent=x; const l=$('#rv-l'); if(l) l.textContent=lt?` · loops ${ly} yes / ${ln} no-other / ${lt-ly-ln} open`:''; }
  els.forEach(e=>{
    e.contentEditable='true'; e.spellcheck=true;
    const x=document.createElement('span'); x.className='rv-x'; x.title='Cut this block'; x.textContent='✕'; x.contentEditable='false'; e.appendChild(x);
    const old=document.createElement('div'); old.className='old-text'; old.textContent=e.dataset.old||'(brand new — nothing to compare)'; e.insertAdjacentElement('afterend',old);
    const a=state.answers[e.dataset.c]; if(a&&a.v==='other'){ e.firstChild.textContent=''; e.innerHTML=a.note+x.outerHTML; e.classList.add('rv-edited'); } if(a&&a.v==='no'){ e.classList.add('rv-no'); }
    e.addEventListener('input',()=>{ const clone=e.cloneNode(true); clone.querySelector('.rv-x')?.remove(); const html=clone.innerHTML.trim(); if(html===orig[e.dataset.c].trim()){ delete state.answers[e.dataset.c]; e.classList.remove('rv-edited'); } else { state.answers[e.dataset.c]={v:'other',note:html}; e.classList.add('rv-edited'); e.classList.remove('rv-no'); } paint(); save(); });
    x.addEventListener('mousedown',ev=>{ ev.preventDefault(); ev.stopPropagation(); if(e.classList.contains('rv-no')){ e.classList.remove('rv-no'); delete state.answers[e.dataset.c]; } else { const why=prompt('Cut this block — why? (optional)')||''; state.answers[e.dataset.c]={v:'no',note:why}; e.classList.add('rv-no'); e.classList.remove('rv-edited'); } paint(); save(); });
  });
  // loops: play when on screen, pause off; per-row verdicts share the answers file
  if('IntersectionObserver' in window){ const io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting) e.target.play().catch(()=>{}); else e.target.pause(); }),{threshold:.3}); $$('.row-video').forEach(v=>io.observe(v)); }
  $$('.rv-judge').forEach(j=>{ const id=j.dataset.j; const note=j.querySelector('.rv-note'); const a=state.answers[id]; if(a&&a.v){ j.classList.add(a.v); note.value=a.note||''; }
    j.querySelectorAll('button[data-v]').forEach(b=>b.onclick=()=>{ j.classList.remove('yes','no','other'); j.classList.add(b.dataset.v); state.answers[id]={v:b.dataset.v,note:note.value}; paint(); save(); if(b.dataset.v!=='yes') note.focus(); });
    note.addEventListener('input',()=>{ const cur=state.answers[id]||{v:'other'}; cur.note=note.value; state.answers[id]=cur; if(!j.classList.contains('yes')&&!j.classList.contains('no')){ j.classList.add('other'); cur.v='other'; } save(); }); });
  $('#rv-hint').onclick=function(){ const on=this.getAttribute('aria-pressed')!=='true'; this.setAttribute('aria-pressed',on); document.body.classList.toggle('rv-hint',on); };
  $('#rv-old').onclick=function(){ const on=this.getAttribute('aria-pressed')!=='true'; this.setAttribute('aria-pressed',on); document.body.classList.toggle('rv-show-old',on); };
  $('#rv-submit').onclick=async function(){ state.submitted=new Date().toISOString(); if(server){ try{ await fetch('/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(state)}); st.textContent='Submitted — Claude has your edits.'; }catch(e){ st.textContent='Submit failed — server gone; the edits are in this browser, tell Claude.'; } } else { try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){} st.textContent='Submitted locally (no server) — tell Claude.'; } this.disabled=true; };
  load().then(paint);
})();
'''


def build(site_html, out_dir):
    with open(site_html, encoding='utf-8') as f:
        src = f.read()
    style = src[src.index('<style>'):src.index('</style>') + len('</style>')]
    fonts = '\n'.join(l for l in src.split('\n') if 'fonts.g' in l)
    page = ('<!doctype html><html lang="en" data-theme="creme"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Landing page — copy in place (review)</title>' + fonts + style + '<style>' + REVIEW_CSS + '</style></head>'
            '<body class="rv">' + body() + '<script>' + REVIEW_JS + '</script></body></html>')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'copy.preview.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    # the favicon the nav references
    fav = os.path.join(os.path.dirname(site_html), 'favicon-dark.svg')
    if os.path.exists(fav):
        import shutil
        shutil.copy(fav, os.path.join(out_dir, 'favicon-dark.svg'))
    ids = re.findall(r'data-c="([^"]+)"', page)
    return out, ids


def strip_tags(s):
    return re.sub(r'<[^>]+>', '', s).replace('&rarr;', '→').replace('&hellip;', '…').strip()


def write_edits(out_dir, page_path):
    apath = os.path.join(out_dir, 'copy.preview.answers.json')
    with open(apath) as f:
        state = json.load(f)
    with open(page_path, encoding='utf-8') as f:
        page = f.read()
    orig = {m.group(1): strip_tags(m.group(2)) for m in re.finditer(r'data-c="([^"]+)"[^>]*>(.*?)</(?:p|h2|h3|span|a)>', page, re.S)}
    lines = [f'# Copy preview — edits ({(state.get("submitted") or "")[:16].replace("T", " ")})', '']
    for cid, a in (state.get('answers') or {}).items():
        if cid.endswith('.loop'):
            lines.append(f'- **LOOP {a.get("v", "?").upper()}** `{cid}`' + (f': {a["note"]}' if a.get('note') else ''))
            continue
        if a.get('v') == 'other':
            lines.append(f'- **EDIT** `{cid}`\n  - was: {orig.get(cid, "?")}\n  - now: {strip_tags(a.get("note", ""))}')
        elif a.get('v') == 'no':
            lines.append(f'- **CUT** `{cid}`: {orig.get(cid, "?")}' + (f'\n  - why: {a["note"]}' if a.get('note') else ''))
    if len(lines) == 2:
        lines.append('_No edits — every block kept as written._')
    out = os.path.join(out_dir, 'copy.preview.answers.md')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return out


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('build', 'serve'):
        s = sub.add_parser(name); s.add_argument('site'); s.add_argument('out_dir')
        s.add_argument('--media', help='dir of <scene>.webm/.webp loops to drop into the rows (copied to <out-dir>/media)')
        s.add_argument('--gap', action='append', default=[], help='rowN=known gap text, shown on that row')
        if name == 'serve':
            s.add_argument('--no-open', action='store_true'); s.add_argument('--port', type=int, default=0); s.add_argument('--timeout', type=int, default=240)
    a = ap.parse_args()
    if a.media:
        import shutil
        md = os.path.join(a.out_dir, 'media'); os.makedirs(md, exist_ok=True)
        for f in os.listdir(a.media):
            if f.endswith(('.webm', '.webp')):
                shutil.copy(os.path.join(a.media, f), os.path.join(md, f))
        MEDIA['dir'] = md
    for g in a.gap:
        k, _, v = g.partition('='); MEDIA['gaps'][k] = v
    out, ids = build(a.site, a.out_dir)
    print(f'[copy-preview] built {out} — {len(ids)} editable blocks')
    if a.cmd == 'build':
        return 0
    spec = {'_base': a.out_dir, '_stem': 'copy.preview', 'out': 'copy.preview.html', 'key': 'copy-preview', 'steps': [{'id': i} for i in ids]}
    other = already_served(spec)
    if other:
        print(f'REFUSING: already served by pid {other["pid"]} at {other["url"]}'); return 3
    rc = serve(spec, port=a.port, open_browser=not a.no_open, timeout_min=a.timeout, log=lambda m: print(m) if m.startswith('[') or m.startswith('copy-preview') else None)
    if rc == 0:
        print(f'[copy-preview] edits written to {write_edits(a.out_dir, out)}')
    return rc


if __name__ == '__main__':
    sys.exit(main())
