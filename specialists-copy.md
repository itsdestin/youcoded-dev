Specialists
Your assistant may utilize "specialists" so help it accomplish some tasks. This menu allows you to configure which specialists your assistant has access to. Click the (i) above for additional information.

SPECIALIST INTELLIGENCE TIERS

Budget * (best for searching, reading, and summarizing)
Clear
Unset the {tier} model
Loading the {tier} model…
Set to {model}
Not set — helpers use the conversation's model

Frontier * (best for nuanced tasks, code reviews, and judgment calls)

Couldn't save the {tier} model. {reason}
Could not load the model settings — unexpected response.

AVAILABLE SPECIALISTS

Built in
Your specialists
Claude Code agents

read-only
can edit files
can edit & run commands
prefers {tier}
{count} warnings

Built in
Your specialists folder · {filename}
This project's .claude/agents/{filename}
Your ~/.claude/agents/{filename}

Tools:
File:

{reason} — not offered to the assistant.

Loading specialists…
No specialists found — even the built-ins are missing, which is a bug worth reporting.

Files are re-read each time you send a message; Refresh to re-read now.
Refresh
Open folder
Not available until the specialists folder has been read

Specialists run on the desktop app. Open Settings there to add or edit them.

About Specialists

Specialists are helpers your assistant can hire for a piece of work — a search, a review, an edit — while it keeps talking to you. Each one runs on its own with only the tools its job needs.

The two model tiers
When your assistant hires a helper it can ask for the budget model (cheap, fast, good for searching and reading) or the frontier model (the strongest you have, for judgment calls). You choose which real model each name means here. If a tier is not set, the helper simply uses the conversation's own model — and the assistant is told so.
Nothing is picked for you by price. These two names are the only automatic choices your assistant can make; it may name a specific model only when you ask it to.

Where specialists come from
Explorer, Researcher, Reviewer and Worker ship with the app.
Files in your specialists folder. Add one there and it appears here the moment it is saved.
Files in a project's own .claude/agents folder, or in your ~/.claude/agents folder. Those use Claude Code's tool names, which are translated; anything that does not translate is removed and listed as a warning.

Read-only vs can edit
A read-only helper can look at files and search the web but cannot change anything or run commands. A helper that can edit is limited to the folder it was hired for. Either way, deleting things, secrets, and anything outside the folder still ask you every time. Approving a hire is what grants these — the card in the chat says exactly what before you say yes.
