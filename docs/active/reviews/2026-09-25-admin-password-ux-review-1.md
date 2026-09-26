# Admin password UX review — beta tester pass 1

Reviewed at `http://127.0.0.1:5233/?mode=workbench&child=1&view=tools`, section
"Admin password" (six cards: `bash-sudo-awaiting-approval`,
`bash-sudo-awaiting-approval-fullauto`, `bash-sudo-password`,
`bash-sudo-password-wrong`, `bash-sudo-password-last-try`,
`bash-script-password-midway`). Checked at 1440px and 390px widths, and by
typing into the password fields and pressing the buttons.

- U1 accepted — the admin approval card now shows the exact command line above Yes/No. — Expected to see the actual system command before being asked to approve
  it / Instead the first two cards (the "may I?" ask, and the "full auto"
  version of the same ask) only show a friendly one-line summary ("Install the
  AMD graphics libraries local models need"). The literal command
  (`pacman -S --needed rocm-hip-runtime hipblas rocblas`) only appears once I've
  already said yes and I'm on the password screen. A cautious person can't
  actually see what they're approving until after they've approved it. —
  Admin password: `bash-sudo-awaiting-approval` — `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop.png`

- U2 accepted — the mid-command card now says it's partway through the command you approved, and tells you to type the password only if you expected this step. — (Most likely to make me suspicious) `bash-script-password-midway`: a
  script I already approved to "Run the project install script" stops partway
  through and asks for my password again, for a second, different command
  (`cp ./yc-helper /usr/local/bin/yc-helper`) that copies a file I don't
  recognize into a system folder. Nothing on the card says this is a normal,
  expected part of the same install, or why it needs to happen — it reads
  exactly like the moment a script quietly plants something extra while it has
  my password. — `bash-script-password-midway` — `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop2.png`

- U3 rejected — Run it / Skip it is the owner-settled wording of Full auto's stop band (compare R2–R4); the Ask-mode card keeps Yes / No as every other approval card does. — Expected the same decision ("let this touch my whole computer, yes or
  no?") to use the same buttons everywhere / `bash-sudo-awaiting-approval` uses
  "Yes / No"; `bash-sudo-awaiting-approval-fullauto`, which is the identical
  decision just reached from an auto-run mode, uses "Run it / Skip it"
  instead. Same question, two different sets of words for the answer. —
  Admin password cards 1–2 — `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop.png`

- U4 rejected — "Full auto" is the mode's own name, shown on its status-bar chip; the subline is owner-settled copy (2026-08-26/27) that changes only through a compare round. — "Stopped before an admin command" / "**Full auto** still stops here —
  this runs with full control of your computer." — "full auto" is never
  explained anywhere on this card or the other five; a first-time user has no
  way to know it means "the assistant normally runs things without asking."
  Shorter and self-contained: "Even set to run things automatically, this
  always stops here first." — `bash-sudo-awaiting-approval-fullauto` —
  `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop.png`

- U5 accepted — reworded to "Another wrong one may lock you out of admin actions for about 10 minutes" (kept "may": only some computers lock). — "Wrong password. 1 try left. Another wrong one may lock admin commands
  for about 10 minutes." — "lock admin commands" is vague to someone who
  doesn't know what "admin" means here (does it lock this one install, every
  password prompt, my whole computer?). Shorter and plainer: "1 try left — one
  more wrong password locks you out of admin actions for about 10 minutes." —
  `bash-sudo-password-last-try` — `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop2.png`

- U6 accepted — every password card now uses the one heading, "Enter your computer password"; the mid-command case says who is asking in the line under it. — Minor wording inconsistency: `bash-sudo-password`,
  `-wrong` and `-last-try` all title the password box "Enter your computer
  password" (an instruction to me). `bash-script-password-midway`, the same
  situation but triggered mid-script, titles it "install.sh needs your
  computer password" (the software talking about itself). Same ask, two
  different voices. — `bash-script-password-midway` —
  `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop2.png`

- U7 accepted — the wrong-password line is now full-strength text, medium weight, instead of muted grey. — Expected a wrong-password warning to visually stand out the way the
  gold "Stopped before an admin command" box does on the full-auto card /
  Instead "Wrong password. 2 tries left." and "Wrong password. 1 try left...."
  render in the same plain grey as the small disclaimer text underneath them
  ("Used once for this step, then erased…") — confirmed by sampling pixels,
  both are the same muted grey (~rgb 100–140 on the dark background), no red,
  orange, or bold. It's easy to skim right past the fact that you just typed
  the wrong password. — `bash-sudo-password-wrong`,
  `bash-sudo-password-last-try` — `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop.png`,
  `/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/admin-crop2.png`

## What worked well (not findings, for context)

Typing in a password field masks it with dots immediately
(`/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/type-crop.png`),
and the "Run it" button visibly switches from a dim/outlined look to a solid
green "ready" look only after a password is typed
(`/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/pretype-crop.png`
vs. same crop after typing) — good, reassuring feedback. The reassurance line
under every password box ("Used once for this step, then erased. It's never
saved, and the assistant never sees it.") is clear and in plain language — this
is the single most trust-building sentence on any of the six cards. At 390px
phone width all six cards reflow cleanly: the long install command wraps to
two lines, the password field and its two buttons stay on one row, and nothing
clips, overlaps, or becomes unreadable
(`/tmp/claude-1000/-home-destin-youcoded-dev/eaa2bb68-654a-4cf4-a6ae-ec612e110464/scratchpad/sudo-shots/phone-crop1.png`
through `phone-crop4.png`). Pressing "Run it" / "Skip it" / "Yes" / "No" does
nothing observable, which the briefing says is expected on this simulated
backend, not a finding.

## Summary

Yes, I could complete the task — I read all six cards, understood what each
one wanted, typed passwords into the password fields, and pressed the buttons.
The single most confusing/concerning moment was `bash-script-password-midway`
(U2): a script I'd already said yes to pauses and asks for my password again
for a *different* command that copies an unfamiliar file into a system
folder, with no explanation tying it back to the thing I originally approved.
That's the one card where, if it happened for real, I'd hesitate before typing
my password.
