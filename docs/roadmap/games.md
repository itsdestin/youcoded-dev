# games — the arcade
Filing test: the arcade — the games, leaderboards, head-to-head, match relay.

- [ ] A friend running a hand-written client can post a forfeit "win" against you the moment you go
      offline and it lands on both records for good; the two head-to-head result messages also have
      no rate limit, so a loop of them can slow everyone's online/offline status
      `all` `needs-verify` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-game-forfeit-unattested-record.md

- [ ] Idea: bind the dedicated Copilot/AI key on Windows laptops (and others) to open/close the
      games panel; may need Windows-specific keycode detection
      `arcade` `desktop` `parked` `checked 2026-09-01`

- [ ] Holding the key down in Flappy is supposed to give one flap, and on this Linux machine it
      probably machine-guns the bird instead: the guard against a held key relies on the browser
      marking a keystroke as a repeat, and Electron on Linux does not reliably do that. Same cause
      as the message box's space bar behaving unpredictably (fixed there 2026-09-05 by tracking
      the key ourselves instead of asking)
      `arcade` `desktop` `needs-verify` `checked 2026-09-05` `needs-repro`
