# Command permissions — real use cases (working notes)

| # | Automation | What it actually runs | What really matters |
|---|---|---|---|
| 1 | Morning money check | nothing (page data) | page permission |
| 2 | Price watch | nothing (visits bestbuy.com) | website |
| 3 | Email sorter | nothing (Gmail, step 5) | service |
| 4 | Weekly briefing | `git log --since=…` in one project | read one folder |
| 5 | Downloads tidy-up | `ls`, `du`, `mv`, `rm` in ~/Downloads | change/delete inside one folder |
| 6 | Voice memos to notes | `ffmpeg -i <new file> …`, `whisper <file> --model small` | read ~/Recordings, write ~/Notes; file names change |
| 7 | Photo backup | `rsync -a ~/Pictures /media/backup`, `exiftool` | read one folder, write the backup drive |
| 8 | Your own script | `python3 ~/scripts/report.py` | the script can do anything; contents locked (Q-scripts) |
| 9 | Nightly tests on a project | `git pull`, `npm install`, `npm test` | npm runs package code and downloads; folder + registry |
| 10 | Publish a site | `npm run deploy` / `wrangler deploy` | sends to the internet; not undoable |
| 11 | System upkeep | `df -h`; `paru -Syu` | updates need the admin password; change the whole system |
| 12 | Smart home | `curl http://homeassistant.local/api/...` | one local address |
| 13 | Research digest | none; reads many unknown sites | websites, read-only |

Findings
- Most everyday automations (1–4, 13) run no commands at all.
- For the rest, the command's wording is the wrong thing to judge. What matters is what it can
  reach and change: which folders (read / change / delete), which sites, and whether it sends,
  publishes or changes the system.
- General programs (python, npm, node, bash) can do anything whatever their wording, so a
  pattern on the text protects nothing (the app's own code says its text checks are "a speed
  bump, not a sandbox").
- Only an OS-level sandbox enforces "only these folders and sites" for any program.
