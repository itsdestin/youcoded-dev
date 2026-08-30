# Emits the three new landing-page variants. The BODY markup is identical in all
# three (same sections, same words) so the only thing being compared is the look.
import json, io, os
import os
BASE = os.path.dirname(os.path.abspath(__file__))  # portable: run from wherever this file lives
THEMES = json.load(open(BASE + '/themes.json'))

FEATURES = [
 ("Seamless integration","Tools and conversations work across any model.","Select from hundreds of models via OpenRouter, use Claude Code with your subscription plan, or pick an offline, private model to run on your own computer. Switch models mid-conversation without interruption.","row1-any-ai"),
 ("Genuinely useful","Give it a task and it does real work, with boundaries you can trust.","It reads your files, writes new ones, develops repeatable skills and workflows, searches the web, and helps you manage your computer and your life more efficiently. Permission modes let you restrict the model to match your level of comfort.","row2-does-things"),
 ("Logical management","Project view keeps your files, conversations, and assistant instructions organized.","Open spreadsheets, documents, and images, revisit prior conversations, and see how your assistant is instructed to behave in each project.","row3-projects"),
 ("Stay organized","Tags, notes, and shortcuts.","Tag and annotate conversations, pin the ones that matter, and hide the ones you'll never go back to. Quick chips run the prompts you use every day in one tap.","row4-organized"),
 ("Works everywhere","Start on your laptop. Finish on your phone.","Windows, macOS, Linux, Android, and any browser. Your conversations and files stay in sync through your own private GitHub, so what you started here is waiting there.","row5-follow"),
 ("Make it yours","Describe a look. Install a plugin. Share both.","Build a theme by describing it — customize wallpapers, app colors, mascots. Browse 300+ plugins from the marketplace: journaling, a personal encyclopedia, calendar and email integrations, and whatever your friends publish.","row6-yours"),
 ("Play while it works","Challenge a friend while it thinks.","Long tasks take a minute. Play Connect Four with a friend in the side panel, see who's online, and get back to the answer when it's ready.","row7-play"),
 ("For builders","Made to be customized and work with you.","Run Claude Code as a first-class session next to the app's own agent. Review, stage, and commit changes without leaving the window. Connect tools over MCP. Download and run local models with a GPU-fit check.","row8-builders"),
]
ROADMAP = ("Roadmap","Hand it off.","Set up a job once — what to do, which tools it may use, where to stop and check with you — then run it on a schedule or send it from your phone. Results and approvals land in an inbox. First: run now and scheduled runs. Later: kick off from an incoming email or a changed file.")

FAQ = [
 ("How is this different from ChatGPT or claude.ai?","Those are chat websites. YouCoded Assistant is an app on your computer and phone that works in your own files — it opens, edits, and organizes them, runs tasks, and searches the web — and you choose the AI behind it: Claude, hundreds of cloud models, or one that runs locally for free."),
 ("Do I have to pay for anything?","No. The app is free and open source. A model that runs on your own computer costs nothing. If you want Claude, that's a Claude Pro or Max plan from Anthropic; if you want other cloud models, OpenRouter bills per use."),
 ("Is my data private?","Your conversations, files, and settings live in your own GitHub (and, if you add them, your Google Drive or iCloud). Cloud models see what you send them while they work; a local model sends nothing anywhere. The app sends one anonymous daily ping — a hash of your device ID, the app version, platform, and rough region — so we can see how many people use it. No IP address, no username, no message content. Turn it off in Settings → About → Privacy."),
 ("What platforms does it run on?","Windows, macOS, Linux, and Android, plus any web browser by connecting to a computer running the app. Apple integrations (iMessage, Apple Notes, and so on) work on macOS only."),
 ("Do I need to know how to code?","No. The whole app was built by someone who has never written code, by talking to AI. If you can use ChatGPT, you can use this."),
 ('Is "agentic" AI safe?',"The app asks before it changes anything, and every standing permission you grant is listed on one screen where you can revoke it. AI still makes mistakes, so keep an eye on what it's doing — and be careful with full-auto mode, which lets it act without asking."),
 ("Who built this?","So far, it's just me (Destin). However, my intention is for this open-source project to become something we all build together. I believe one of the greatest potential goods of AI comes from its ability to revolutionize the world of open-source software. This project is just one example of what AI can allow us to create: an app owned by nobody, improved by everybody — all without anyone needing to learn how to code or even understand what “open-source” is. No profit motive, no ulterior incentives — just people making cool shit and sharing it with other people :)"),
]

ACCOUNTS = [
 ("GitHub",["Required","Free"],"Keeps your conversations and files in sync across devices and delivers marketplace updates. Sign up with your Google or Apple account.","Create a GitHub account &rarr;","https://github.com/signup",None),
 ("Anthropic",["Optional","Paid"],"A Claude Pro or Max plan lets you use Claude — the model YouCoded was built with.","See Claude plans &rarr;","https://claude.ai/upgrade",None),
 ("OpenRouter",["Optional","Pay as you go"],"One account provides access to hundreds of models from every AI company. Pay only for what you use.","Create an OpenRouter account &rarr;","https://openrouter.ai/",None),
 # Two destinations, so this one card carries a second, smaller link for Apple.
 ("Google or Apple",["Optional","Free"],"An extra copy of your data in Google Drive or iCloud, on top of GitHub.","Create a Google account &rarr;","https://accounts.google.com/signup",("or an Apple ID &rarr;","https://account.apple.com/account")),
]

OS_SVG = {
 'Windows':'<path d="M3,12V6.75L9,5.43V11.91L3,12M20,3V11.75L10,11.9V5.21L20,3M3,13L9,13.09V19.9L3,18.75V13M20,13.25V22L10,20.09V13.1L20,13.25Z"/>',
 'macOS':'<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>',
 'Linux':'<path d="M19,16C19,17.72 18.37,19.3 17.34,20.5C17.75,20.89 18,21.41 18,22H6C6,21.41 6.25,20.89 6.66,20.5C5.63,19.3 5,17.72 5,16H3C3,14.75 3.57,13.64 4.46,12.91L4.47,12.89C6,11.81 7,10 7,8V7A5,5 0 0,1 12,2A5,5 0 0,1 17,7V8C17,10 18,11.81 19.53,12.89L19.54,12.91C20.43,13.64 21,14.75 21,16H19M16,16A4,4 0 0,0 12,12A4,4 0 0,0 8,16A4,4 0 0,0 12,20A4,4 0 0,0 16,16Z"/>',
 'Android':'<path d="M18.44 5.56c-.68 1.16-1.36 2.33-2.03 3.5-.04-.02-.08-.03-.11-.04-1.83-.7-3.49-.8-4.42-.79-1.86.02-3.36.46-4.26.82-.09-.15-1.76-3.02-2.03-3.49a1.15 1.15 0 0 0-.14-.19c-.33-.36-.9-.49-1.38-.2-.47.28-.71.94-.39 1.5 1.95 3.37-.1-.22 1.95 3.36.02.03-.5.26-1.4 1.02C2.9 12.18.45 14.77 0 18.99h24c-.12-1.11-.37-2.1-.75-3.07-.74-1.91-1.84-3.29-2.74-4.18a12.1 12.1 0 0 0-2.13-1.69c.66-1.12 1.31-2.25 1.96-3.38.21-.36.19-.8-.01-1.12a1.1 1.1 0 0 0-.85-.53c-.52-.05-.94.31-1.05.54z"/>',
}
GALLERY = ["home-midnight","marketplace-meadow-mist","projects-light","model-picker-creme",
           "connect4-halftone-dimension","permissions-dark","tags-midnight","themes-creme"]

DL_ID = {'Windows':'dl-windows','macOS':'dl-macos','Linux':'dl-linux','Android':'dl-android','iOS':'dl-ios'}
def dl_buttons(cls='dlbtn', primary='Windows'):
    # ids matter: the install-tips modal lifted from the real page binds to them.
    out=[]
    for os_ in ('Windows','macOS','Linux','Android','iOS'):
        p=' primary' if os_==primary else ''
        # iOS: no download exists — the asterisk marks it, the chip opens the
        # explainer popup instead (bound in the modal script by its dl-ios id).
        label = 'iOS<sup>*</sup>' if os_=='iOS' else os_
        svg = OS_SVG['macOS'] if os_=='iOS' else OS_SVG[os_]
        href = '#' if os_=='iOS' else 'https://github.com/itsdestin/youcoded/releases/latest'
        out.append(f'<a id="{DL_ID[os_]}" class="{cls}{p}" href="{href}">'
                   f'<svg viewBox="0 0 24 24" aria-hidden="true">{svg}</svg><span>{label}</span></a>')
    return '\n        '.join(out)

def swatches():
    out=[]
    for slug,t in THEMES.items():
        out.append(f'<button class="sw" data-theme="{slug}" title="{t["name"]}" '
                   f'style="--a:{t["accent"]};--c:{t["canvas"]}"><span></span></button>')
    return '\n        '.join(out)

def steps():
    out=[]
    for i,(label,title,desc,_) in enumerate(FEATURES):
        out.append(f'''<div class="step" data-i="{i}">
          <div class="step-label">{label}</div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>''')
    l,t,d = ROADMAP
    out.append(f'''<div class="step" data-i="8">
          <div class="step-label">{l} <span class="rmchip">Coming after 1.3</span></div>
          <h3>{t}</h3>
          <p>{d}</p>
        </div>''')
    return '\n        '.join(out)

def slides():
    out=[]
    for i,(_,_,_,media) in enumerate(FEATURES):
        on=' class="on"' if i==0 else ''
        extra=''
        out.append(f'<video{on} data-i="{i}" muted loop playsinline preload="none" poster="media/{media}.webp"><source src="media/{media}.webm" type="video/webm"></video>')
    out.append('''<div class="sketch" data-i="8">
          <div><div class="k">Agents</div><div class="li on2">Weekly grocery list</div><div class="li">Inbox digest · 7am</div><div class="li">Receipts → spreadsheet</div></div>
          <div><div class="k">Weekly grocery list</div><div class="li">1 · Read this week's plan</div><div class="li">2 · Draft the list</div><div class="li on2">3 · Check with me before ordering</div><div class="li">4 · Send to my phone</div><div class="k" style="margin-top:14px">Inbox</div><div class="li">Needs approval · Weekly grocery list · 2 min ago</div></div>
        </div>''')
    return '\n        '.join(out)

def accounts():
    out=[]
    for name,badges,body,link,href,alt in ACCOUNTS:
        b=' '.join(f'<span class="badge{" req" if x=="Required" else ""}">{x}</span>' for x in badges)
        inner=f'<div class="badges">{b}</div><h3>{name}</h3><p>{body}</p><span class="acct-link">{link}</span>'
        if alt:
            # A link can't sit inside a link, so this card is a div that acts as one
            # (see the click handler in CORE_JS); the Apple link stays a real <a>.
            inner+=f'<a class="acct-alt" href="{alt[1]}" target="_blank" rel="noopener">{alt[0]}</a>'
            out.append(f'<div class="panel acct" role="link" tabindex="0" data-href="{href}">{inner}</div>')
        else:
            out.append(f'<a class="panel acct" href="{href}" target="_blank" rel="noopener">{inner}</a>')
    return '\n        '.join(out)

def faq():
    out=[]
    for i,(q,a) in enumerate(FAQ):
        op=' open' if i==0 else ''
        out.append(f'<details class="panel"{op}><summary>{q}</summary><div class="a">{a}</div></details>')
    return '\n        '.join(out)

def gallery():
    return '\n      '.join(f'<img src="gallery/{g}.webp" alt="" loading="lazy">' for g in GALLERY)


# ---------------------------------------------------------------------------
# Header arrangements. Everything from the nav down to (but not including)
# "More than a chatbot." — the only part that differs between the D builds.
# The "Try it / Click around, I guess." heading block is gone from all of them.
# ---------------------------------------------------------------------------
EMBED = ("""<div class="frame embed"><div class="embed-stage">
      <img class="embed-poster" src="media/embed.webp" alt="YouCoded Assistant chat window">
      <button class="embed-start" type="button">Start the demo &rarr;</button>
      <button class="embed-interact" type="button" hidden>Click to try it</button>
      <iframe class="embed-iframe" title="YouCoded Assistant live demo" loading="lazy" data-src="site/index.html?mode=workbench&amp;child=1&amp;scenario=site&amp;latency=0&amp;reply=site"></iframe>
    </div></div>""")

HEADERS = {

# D1 — CENTRED. Type stacked in the middle, buttons, then the live app full width.
'centred': f'''<header class="hero hero-centred" id="top">
  <div class="wrap">
    <p class="kicker">Free &middot; Open source &middot; Any AI model</p>
    <h1>Make AI <em>Yours.</em></h1>
    <p class="hero-sub">A self-improving, customizable AI agent. Use any AI model from any provider to work and build your way.</p>
    <div class="dlrow">
        {dl_buttons()}
    </div>
    <div class="hero-app">{EMBED}</div>
  </div>
</header>''',

# D2 — SPLIT. Pitch on the left, the app on the right running off the edge, so
# the headline and the product are on screen at the same moment.
'split': f'''<header class="hero hero-split" id="top">
  <div class="split-in">
    <div class="split-text">
      <p class="kicker">Free &middot; Open source &middot; Any AI model</p>
      <h1>Make AI <em>Yours.</em></h1>
      <p class="hero-sub">A self-improving, customizable AI agent. Use any AI model from any provider to work and build your way.</p>
      <div class="dlrow">
        {dl_buttons()}
      </div>
    </div>
    <div class="split-app">{EMBED}</div>
  </div>
</header>''',

# D3 — APP FIRST. One line of type, then the app enormous, and the download row
# docked on a glass bar under it — you see the thing before you're asked to install.
'appfirst': f'''<header class="hero hero-appfirst" id="top">
  <div class="wrap">
    <h1>Make AI <em>Yours.</em></h1>
    <p class="hero-sub">A self-improving, customizable AI agent. Use any AI model from any provider to work and build your way.</p>
    <div class="hero-app">{EMBED}</div>
    <div class="dlbar panel">
      <span class="dlbar-label">Get it for</span>
      <div class="dlrow">
        {dl_buttons(primary=None)}
      </div>
      <span class="hero-note">Free &middot; open source</span>
    </div>
  </div>
</header>''',

# D4 — THEME FIRST. The swatches come out of the nav and sit under the app as a
# labelled control, so the page's headline interaction is re-skinning it.
'themefirst': f'''<header class="hero hero-themefirst" id="top">
  <div class="wrap">
    <p class="kicker">Free &middot; Open source &middot; Any AI model</p>
    <h1>Make AI <em>Yours.</em></h1>
    <p class="hero-sub">A self-improving, customizable AI agent. Use any AI model from any provider to work and build your way.</p>
    <div class="dlrow">
        {dl_buttons()}
    </div>
    <div class="themebar">
      <span class="themebar-label">Every colour on this page is a theme from the app. Try one:</span>
      <div class="swatches swatches-big" id="swatches-hero">
      {swatches()}
      </div>
    </div>
    <div class="hero-app">{EMBED}</div>
  </div>
</header>''',
}

BODY = f'''
<div class="backdrop" id="backdrop"><div class="bd-layer" id="bd-a"></div><div class="bd-layer" id="bd-b"></div><div class="bd-scrim"></div></div>

<nav class="nav"><div class="nav-in">
  <a href="#top" class="logo"><span class="mark">YC</span><span class="wm">You<b>Coded</b> <i>Assistant</i><em>Agentic AI for Everyone</em></span></a>
  <div class="nav-right">
    <div class="swatches" id="swatches" role="group" aria-label="Change the look">
      {swatches()}
    </div>
    <ul class="nav-links"><li><a href="#about">About</a></li><li><a href="#demo">Features</a></li><li><a href="#faq">FAQ</a></li></ul>
  </div>
</div></nav>

{{HEADER}}

<section id="about"><div class="wrap">
  <p class="eyebrow">What is this?</p><h2>More than a chatbot.</h2>
  <div class="panel prose">
    <p class="big">YouCoded is a fully-customizable AI assistant that works with your own files and data to autonomously accomplish tasks. Review and organize large spreadsheets, compile the latest medical or financial research, draft an email or slideshow, or build new features in large coding projects.</p>
    <div class="cols">
      <p>With YouCoded, you can utilize OpenRouter to access any AI model from any provider including Anthropic (Claude), OpenAI (ChatGPT), Alibaba (Qwen) and more. YouCoded also allows you to download and run open source AI models on your own device, if your hardware supports it.</p>
      <p>YouCoded is built to become a fully-modular and open source assistant platform, as the app itself integrates the ability for all users to build and share skills, tools, themes, and app improvements. Because YouCoded was designed from the ground up to improved by individuals with no coding or development interest, it can quickly outpace development of competing closed agents in a way that is driven by what users really want.</p>
    </div>
    <p class="permission">Nothing happens without your permission. YouCoded Assistant asks before it acts.</p>
  </div>
</div></section>

<section id="demo"><div class="wrap">
  <p class="eyebrow">What you get</p><h2>Everything the app gives you.</h2>
  <div class="theater">
    <div class="steps" id="steps">
        {steps()}
    </div>
    <div class="stagewrap"><div class="stage frame" id="stage">
        {slides()}
    </div><div class="dots" id="dots"></div></div>
  </div>
</div></section>

<!-- INTEGRATIONS — restored from the pre-1.3 page (commit 75b1ede6^). The
     tag list, every description, the icons and the note are the originals;
     only the styling is new. Sits after the feature tour, before the story. -->
<section id="integrations"><div class="wrap">
  <p class="eyebrow">Integrations</p><h2>Connect your services.</h2>
  <div class="panel integrations">
    <p class="integrations-intro">With skills from the WeCoded marketplace, YouCoded can link with all of the following services:</p>
    <div class="integrations-tags">
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can automatically back up your journal entries, Encyclopedia, and system files to Google Drive — keeping everything safe and synced across sessions."><img class="tag-icon" src="icons/google-drive.svg" alt="">Google Drive</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can create, read, and edit documents — drafting cover letters, memos, reports, and more directly in Google Docs."><img class="tag-icon" src="icons/google-docs.svg" alt="">Google Docs</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can create and analyze spreadsheets — building trackers, organizing data, and working with structured information in Google Sheets."><img class="tag-icon" src="icons/google-sheets.svg" alt="">Google Sheets</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can create and edit slide decks and visual presentations in Google Slides."><img class="tag-icon" src="icons/google-slides.svg" alt="">Google Slides</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can read and create events on your Google Calendar. Mention an appointment in conversation or screenshot a flyer, and it can get scheduled automatically."><img class="tag-icon" src="icons/google-calendar.svg" alt="">Google Calendar</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can search your inbox, read threads, and compose replies in Gmail — all without leaving the app."><img class="tag-icon" src="icons/gmail.svg" alt="">Gmail</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can read your SMS and RCS conversations and send texts on your behalf through Google Messages."><img class="tag-icon" src="icons/google-messages.svg" alt="">Google Messages</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can access your Apple Messages conversations and send texts through iMessage."><img class="tag-icon" src="icons/imessage.svg" alt="">iMessage</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can automatically back up your journal entries, Encyclopedia, and system files to iCloud Drive — keeping everything safe and synced across sessions."><img class="tag-icon" src="icons/icloud.svg" alt="">iCloud</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can read your existing Apple Notes and create new ones for quick reference and capture."><img class="tag-icon" src="icons/apple-notes.svg" alt="">Apple Notes</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can add items to your Apple Reminders lists and help you keep track of things to do."><img class="tag-icon" src="icons/apple-reminders.svg" alt="">Apple Reminders</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can read and create events on your Apple Calendar. Mention an appointment in conversation or screenshot a flyer, and it can get scheduled automatically."><img class="tag-icon" src="icons/apple-calendar.svg" alt="">Apple Calendar</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can search your inbox, read threads, and compose replies through Apple Mail."><img class="tag-icon" src="icons/apple-mail.svg" alt="">Apple Mail</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can manage your task list, process inbox items captured from your phone, create tasks from conversations, and help you stay on top of priorities."><img class="tag-icon" src="icons/todoist.svg" alt="">Todoist</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can receive marketplace updates and sync your configuration through GitHub, keeping your installation current with the latest features and fixes."><img class="tag-icon" src="icons/github.svg" alt="">GitHub</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can navigate websites, fill out forms, take screenshots, and interact with web pages through Chrome."><img class="tag-icon" src="icons/chrome.svg" alt="">Chrome</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can navigate websites, fill out forms, take screenshots, and interact with web pages through Safari."><img class="tag-icon" src="icons/safari.svg" alt="">Safari</button>
    <button class="integration-tag" tabindex="0" data-desc="YouCoded can generate graphics, edit presentations, and work with visual content directly in Canva."><img class="tag-icon" src="icons/canva.svg" alt="">Canva</button>
    <span class="integration-tag soon">More coming soon...</span>
    </div>
    <div class="integration-desc" id="integration-desc"></div>
    <p class="prereq-note"><strong>NOTE:</strong> Some integrations require account authorization or additional setup. You can link these services at any time from within the app.</p>
  </div>
</div></section>

<section id="story"><div class="wrap">
  <p class="eyebrow">Story</p><h2>How we got here.</h2>
  <div class="panel prose story">
    <p>Honestly, I really just wanted a cooler and more efficient way to journal and track my own tasks/goals. The very first thing I built with Claude is the Journaling and Life History system (now available in the marketplace), and I pretty quickly decided that I wanted to share it with my friends. However, the thought of installing and opening &ldquo;Claude Code&rdquo; in the terminal scared away most people almost immediately. I realized that the idea of advanced agentic AI is still rather new to most people, and that persuading them to adopt my fancy new journaling system would require it to be <em>much</em> more accessible and user-friendly. Towards this end, I kind of just&hellip; kept adding things. And now we're here.</p>
    <p>Every line of YouCoded was written through conversation with Claude by me, <strong>someone who has never written code</strong>. Every feature, every platform port, every theme, every multiplayer game. The entire app was built, and is currently maintained, without a single line typed by hand.</p>
    <p>YouCoded Assistant is what that kind of AI looks like when it's built for everyone — not just the people who already know how to use it.</p>
    <a class="sign" href="#">Built by Destin &rarr;</a>
  </div>
</div></section>

<section id="get-started"><div class="wrap">
  <p class="eyebrow">Get started</p><h2>You may need a few accounts.</h2>
  <div class="acctgrid">
        {accounts()}
  </div>
  <p class="note">Or skip the paid ones entirely &mdash; run a model on your own computer, free and offline.</p>
  <p class="note">Free and open source. On iPhone? Use YouCoded Assistant from Safari by connecting to any computer running the app.</p>
</section>

<section id="faq"><div class="wrap">
  <p class="eyebrow">Common questions</p><h2>FAQ</h2>
  <div class="faq">
        {faq()}
  </div>
</div></section>

<section id="gallery"><div class="wrap">
  <p class="eyebrow">Gallery</p><h2>See what people have built.</h2>
</div><div class="gal">
      {gallery()}
</div></section>

<footer><div class="wrap"><div class="panel foot">
  <a href="#top" class="logo"><span class="mark">YC</span><span class="wm">You<b>Coded</b></span></a>
  <div class="flinks"><a href="#">GitHub</a><a href="#">Built by Destin</a><span class="badge">Open Source</span></div>
  <p class="legal">MIT License &middot; YouCoded is an independent, community-built project. Not affiliated with, endorsed by, or officially supported by Anthropic.</p>
</div></div></footer>

<button class="topcta" id="topcta">&uarr; Download</button>

<!-- Install-tips modal — markup and script lifted from the live page so the
     per-platform "Before you install" guidance survives the redesign. -->
<div class="install-modal" id="install-modal" aria-hidden="true">
  <div class="install-modal-scrim" data-close></div>
  <div class="install-modal-panel" role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
    <button class="install-modal-close" data-close aria-label="Close">&times;</button>
    <h3 class="install-modal-title" id="install-modal-title">Before you install YouCoded</h3>
    <div class="install-modal-body" id="install-modal-body"></div>
    <div class="install-modal-footer">
      <a class="install-modal-download-btn" id="install-modal-download-btn"
         href="https://github.com/itsdestin/youcoded/releases/latest"
         target="_blank" rel="noopener">Download Now</a>
    </div>
  </div>
</div>
'''

CORE_JS = '''
var THEMES = %s;
var order = Object.keys(THEMES);
var bdA = document.getElementById('bd-a'), bdB = document.getElementById('bd-b'), useA = true;
var fontLinks = {};
function backdropCss(t){
  if (t.gradient) return t.gradient;
  if (t.wall) return 'url("' + t.wall + '")';
  return t.canvas;
}
function rgb(h){ h=(h||'#000').replace('#',''); if(h.length===3) h=h.split('').map(function(c){return c+c}).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)].join(','); }
function applyTheme(slug){
  var t = THEMES[slug]; if(!t) return;
  var r = document.documentElement.style;
  // Panels are rgba() built from the theme's own panel colour + its own
  // panels-opacity, so the site is made of the same material as the app.
  r.setProperty('--panel-rgb', rgb(t.panel));
  r.setProperty('--accent-rgb', rgb(t.accent));
  r.setProperty('--canvas-rgb', rgb(t.canvas));
  r.setProperty('--fg-rgb', rgb(t.fg));
  r.setProperty('--edge-rgb', rgb(t.edge));
  r.setProperty('--canvas', t.canvas); r.setProperty('--panel', t.panel);
  r.setProperty('--accent', t.accent); r.setProperty('--on-accent', t.onAccent);
  r.setProperty('--fg', t.fg); r.setProperty('--fg2', t.fg2);
  r.setProperty('--dim', t.dim); r.setProperty('--muted', t.muted);
  r.setProperty('--edge', t.edge); r.setProperty('--radius', t.radius);
  r.setProperty('--blur', t.blur + 'px'); r.setProperty('--panel-op', t.opacity);
  // Some themes (Strawberry Kitty is nearly transparent, 4px blur) are tuned
  // for the app's short UI labels. A marketing page has paragraphs, so panels
  // holding prose get a readability FLOOR; frames keep the theme's real numbers.
  r.setProperty('--panel-op-prose', Math.max(t.opacity, 0.80));
  r.setProperty('--blur-prose', Math.max(t.blur, 16) + 'px');
  document.documentElement.setAttribute('data-dark', t.dark ? '1' : '0');
  // Load the theme's own webfont, exactly like the app does.
  if (t.fontUrl && !fontLinks[t.fontUrl]) {
    var l = document.createElement('link'); l.rel='stylesheet'; l.href=t.fontUrl;
    document.head.appendChild(l); fontLinks[t.fontUrl]=1;
  }
  r.setProperty('--font-theme', t.font || "'DM Sans', system-ui, sans-serif");
  // Crossfade the wallpaper between two stacked layers so it never flashes.
  var next = useA ? bdB : bdA, cur = useA ? bdA : bdB;
  next.style.background = backdropCss(t);
  next.style.backgroundSize = 'cover'; next.style.backgroundPosition = 'center';
  next.style.opacity = 1; cur.style.opacity = 0; useA = !useA;
  document.querySelectorAll('.sw').forEach(function(s){ s.classList.toggle('on', s.dataset.theme === slug); });
  try { localStorage.setItem('yc-mock-theme', slug); } catch(e){}
  // The demo is the real app's interface, and it keeps its theme under this
  // key (same origin, so we share storage): set it before boot, sync it after.
  currentTheme = slug;
  try { localStorage.setItem('youcoded-theme', slug); } catch(e){}
  syncEmbedTheme();
  if (typeof maskEmbed === 'function') maskEmbed();
}

// --- Live demo: boot the real app in the iframe; theme it with the page.
var currentTheme = 'midnight';
var embed = document.querySelector('.embed'), embedLive = false;
function syncEmbedTheme(){
  if (!embed || !embed.classList.contains('live')) return;
  var f = embed.querySelector('.embed-iframe');
  // The app's own cross-window appearance sync: applied live, no reload.
  try { if (f.contentWindow.__workbenchAppearanceSync) f.contentWindow.__workbenchAppearanceSync({ theme: currentTheme }); } catch(e){}
}
// The page must NOT clip the iframe with overflow/clip-path (Chrome smears
// the app's glass blur over the whole window), and rounding from INSIDE the
// app hits the same bug one level down. What does work: a mask-image on the
// wrapper — an SVG rounded rectangle regenerated at the embed's current size.
function maskEmbed(){
  if (!embed) return;
  var b = embed.getBoundingClientRect();
  var w = Math.round(b.width), h = Math.round(b.height);
  if (!w || !h) return;
  var rad = parseFloat(getComputedStyle(embed).borderRadius) || 0;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">' +
            '<rect width="'+w+'" height="'+h+'" rx="'+rad+'" ry="'+rad+'"/></svg>';
  var url = 'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")';
  embed.style.webkitMaskImage = url; embed.style.maskImage = url;
  embed.style.webkitMaskSize = '100' + String.fromCharCode(37) + ' 100' + String.fromCharCode(37);
  embed.style.maskSize = embed.style.webkitMaskSize;
}
var maskTimer = null;
if (embed) {
  maskEmbed();
  addEventListener('resize', function(){ clearTimeout(maskTimer); maskTimer = setTimeout(maskEmbed, 150); });
}
function bootEmbed(){
  if (!embed || embedLive) return; embedLive = true;
  var f = embed.querySelector('.embed-iframe'), start = embed.querySelector('.embed-start'), inter = embed.querySelector('.embed-interact');
  start.hidden = true;
  f.addEventListener('load', function(){ embed.classList.add('live'); inter.hidden = false; syncEmbedTheme(); });
  f.src = f.dataset.src + '#t=' + currentTheme;
}
if (embed) {
  embed.querySelector('.embed-start').addEventListener('click', function(){ bootEmbed(); embed.classList.add('interactive'); });
  embed.querySelector('.embed-interact').addEventListener('click', function(){ embed.classList.add('interactive'); });
  // Also boot once it scrolls into view, unless the visitor asked for less motion.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) bootEmbed(); }); }, { threshold: 0.6 }).observe(embed);
  }
}

// --- Account cards that are divs (the two-link one) open their link like the <a> cards do.
document.querySelectorAll('.acct[data-href]').forEach(function(card){
  function go(){ window.open(card.dataset.href, '_blank', 'noopener'); }
  card.addEventListener('click', function(e){ if (!e.target.closest('a')) go(); });
  card.addEventListener('keydown', function(e){ if (e.key === 'Enter') go(); });
});
document.getElementById('swatches').addEventListener('click', function(e){
  var b = e.target.closest('.sw'); if (b) applyTheme(b.dataset.theme);
});
applyTheme(%s);

// --- Sticky feature theater: the step nearest the middle owns the pinned stage.
var steps = [].slice.call(document.querySelectorAll('.step'));
var slides = [].slice.call(document.querySelectorAll('#stage > *'));
var dotsEl = document.getElementById('dots');
steps.forEach(function(_, i){ var d = document.createElement('button'); d.className='dot';
  d.onclick = function(){ steps[i].scrollIntoView({block:'center', behavior:'smooth'}); }; dotsEl.appendChild(d); });
var dots = [].slice.call(dotsEl.children), cur = -1;
function show(i){
  if (i === cur) return; cur = i;
  slides.forEach(function(s, n){ s.classList.toggle('on', n === i);
    if (s.tagName === 'VIDEO') { n === i ? s.play().catch(function(){}) : s.pause(); } });
  steps.forEach(function(s, n){ s.classList.toggle('active', n === i); });
  dots.forEach(function(d, n){ d.classList.toggle('on', n === i); });
}
function onScroll(){
  var mid = innerHeight / 2, best = 0, bd = 1e9;
  steps.forEach(function(s, n){ var r = s.getBoundingClientRect();
    var d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = n; } });
  show(best);
  // The floating pill is now a "back to the download buttons" control: the
  // download buttons live in the hero, so it pulls you to the top.
  document.getElementById('topcta').classList.toggle('show', scrollY > innerHeight * 0.9);
}
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// --- Integrations: click a service to read what it does (restored) ---
document.querySelectorAll('.integration-tag').forEach(function(tag){
  if (tag.tagName !== 'BUTTON') return;
  tag.addEventListener('click', function(){
    var desc = document.getElementById('integration-desc');
    var name = tag.textContent.trim();
    var text = tag.getAttribute('data-desc');
    if (tag.classList.contains('active')) {
      tag.classList.remove('active'); desc.classList.remove('visible'); return;
    }
    document.querySelectorAll('.integration-tag.active').forEach(function(t){ t.classList.remove('active'); });
    tag.classList.add('active');
    desc.innerHTML = '';
    var n = document.createElement('span'); n.className = 'integration-desc-name'; n.textContent = name + ': ';
    desc.appendChild(n); desc.appendChild(document.createTextNode(text));
    desc.classList.add('visible');
  });
});
document.getElementById('topcta').onclick = function(){ scrollTo({ top: 0, behavior: 'smooth' }); };
'''

def page(title, css, default_theme, header='centred', extra_js=''):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
{css}
</style>
</head>
<body>
{BODY.replace('{HEADER}', HEADERS[header])}
<script>
{CORE_JS % (json.dumps(THEMES), json.dumps(default_theme))}
{extra_js}
</script>
</body>
</html>
'''

OUT = BASE + '/mockups/'
MODAL_CSS  = open(BASE + '/css_modal.css').read()
HEADER_CSS = open(BASE + '/css_d_headers.css').read()
INTEG_CSS  = open(BASE + '/css_integrations.css').read()
EMBED_CSS  = open(BASE + '/css_embed_acct.css').read()

def patch_modal(js):
    """iOS popup: same modal shell, no download. Minimal patches to the
    script lifted verbatim from the live page."""
    entry = (
      "      var platforms = {\n"
      "        'dl-ios': {\n"
      "          platformLabel: 'iOS',\n"
      "          title: 'YouCoded on iPhone',\n"
      "          noDownload: true,\n"
      "          intro: 'iOS isn\\'t natively supported yet &mdash; but you don\\'t need a download to use YouCoded from an iPhone.',\n"
      "          steps: [\n"
      "            'Install YouCoded on any other platform &mdash; Windows, Mac, Linux, or Android.',\n"
      "            'Turn on remote access in the app on that device.',\n"
      "            'Open the address it gives you in Safari on your iPhone &mdash; the full app, in the browser.'\n"
      "          ],\n"
      "          note: null\n"
      "        },\n")
    js = js.replace("      var platforms = {\n", entry)
    js = js.replace(
      "title.textContent = 'Before you install YouCoded on ' + p.platformLabel;",
      "title.textContent = p.title || ('Before you install YouCoded on ' + p.platformLabel);")
    js = js.replace(
      "resetDownloadButton(downloadKeyFor(platformKey), 'Download Now');\n        modal.setAttribute('data-open', '');",
      "resetDownloadButton(downloadKeyFor(platformKey), 'Download Now');\n        downloadBtn.parentElement.hidden = !!p.noDownload;\n        modal.setAttribute('data-open', '');")
    js = js.replace(
      "['dl-windows', 'dl-macos', 'dl-linux', 'dl-android']",
      "['dl-windows', 'dl-macos', 'dl-linux', 'dl-android', 'dl-ios']")
    js = js.replace(
      "'<details class=\"install-modal-details\">' +\n            '<summary>After install: What to expect on first launch</summary>' +\n            '<div class=\"install-modal-section\">' + afterInstallHtml + '</div>' +\n          '</details>';",
      "(p.noDownload ? '' : '<details class=\"install-modal-details\">' +\n            '<summary>After install: What to expect on first launch</summary>' +\n            '<div class=\"install-modal-section\">' + afterInstallHtml + '</div>' +\n          '</details>');")
    for pat in ("'dl-ios'", "p.title ||", "noDownload"):
        assert pat in js, 'modal patch missed: ' + pat
    return js

MODAL_JS   = ('''
// Mock of the latest-release asset map the live page fetches from GitHub, so
// the Linux distro picker and the size labels appear here too.
window.__youcodedReleaseAssets = {
  'dl-windows':      { url:'#', sizeBytes: 118*1024*1024 },
  'dl-macos':        { url:'#', sizeBytes: 126*1024*1024 },
  'dl-linux':        { url:'#', sizeBytes: 131*1024*1024 },
  'dl-linux-deb':    { url:'#', sizeBytes: 112*1024*1024 },
  'dl-linux-rpm':    { url:'#', sizeBytes: 113*1024*1024 },
  'dl-linux-pacman': { url:'#', sizeBytes: 110*1024*1024 },
  'dl-android':      { url:'#', sizeBytes:  94*1024*1024 }
};
''' + patch_modal(open(BASE + '/modal.js').read()))

# Each skin declares the four colours the shared modal stylesheet consumes.
MODAL_VARS = {
    'css_d.css': ':root{--m-solid:rgb(var(--panel-rgb));--m-bg:rgba(var(--panel-rgb),.97);--m-fg:var(--fg);--m-dim:var(--dim);--m-line:var(--hair)}',
    'css_e.css': ':root{--m-solid:#0C0E14;--m-bg:rgba(12,14,20,.96);--m-fg:var(--tx);--m-dim:var(--tx-dim);--m-line:var(--hair)}',
    'css_f.css': ':root{--m-solid:#0F1115;--m-bg:#0F1115;--m-fg:var(--tx);--m-dim:var(--tx-dim);--m-line:var(--line)}',
}

BUILDS = [
    ('mockup-d1-centred.html',   'YouCoded — D1 Centred',    'css_d.css', 'cotton-candy-sky', 'centred'),
    ('mockup-d2-split.html',     'YouCoded — D2 Split',      'css_d.css', 'cotton-candy-sky', 'split'),
    ('mockup-d3-appfirst.html',  'YouCoded — D3 App first',  'css_d.css', 'cotton-candy-sky', 'appfirst'),
    ('mockup-d4-themefirst.html','YouCoded — D4 Theme first','css_d.css', 'cotton-candy-sky', 'themefirst'),
    ('mockup-e-liquid.html',     'YouCoded — Mockup E: Liquid','css_e.css','meadow-mist',     'centred'),
    ('mockup-f-frame.html',      'YouCoded — Mockup F: Frame','css_f.css', 'midnight',        'centred'),
]
for f, title, css, dflt, hdr in BUILDS:
    sheet = open(BASE + '/' + css).read() + MODAL_VARS[css] + MODAL_CSS + INTEG_CSS + EMBED_CSS
    if css == 'css_d.css':
        sheet += HEADER_CSS
    open(OUT + f, 'w').write(page(title, sheet, dflt, header=hdr, extra_js=MODAL_JS))
    print('wrote', f)
