# Journeys

**The idea.** Walk seven real people (from Destin's voice notes) through the app as left-to-right rows of boxes. Each box is a real feature with its real status from `vision-evidence-A/B/C.json`; the first unfinished box is flagged "stops here", so a row reads "you get this far today, then it stops".

**(a) Systems.** Each box names its system. The side panel ranks systems by how many journeys they hold up (numbered chips, no percentages) and lists single unfinished things that stop several journeys. Today Agents and "a free model good enough for daily use" hold up the most.

**(b) Connections.** Clicking a box lists what it needs first and what it is tied to, with each one's status. Under each row, "also waiting on, behind the scenes" lists unfinished things the row depends on but does not show (followed through `needs`). Dashed lines mark the cut-off.

**(c) Inside the app.** Only through those `needs`/`shares` links. Nothing is drawn from MAP.md or code. This is the weakest answer here.

**Units.** Journey (a person's goal) > step (a feature) > system (the pillar, a label plus the side ranking). A journey is how Destin already thinks, and "how far along" becomes "can someone finish this".

**Judgment calls.** The seven journeys and their steps are mine (the build rejects unknown ids). Two done steps carry a "with a catch" note from their own evidence. Four short titles got clearer labels. Data wording like "Specialist file" or "Phase 4" is shown as written.

**Weakest point.** Only 33 of 168 pieces appear, so a system no journey passes through is invisible. It answers "does this work for someone" well and "what is the whole app" poorly.

Files: `build.py` + `template.html` make `index.html`; `shot.png`, `shot-detail.png`.
