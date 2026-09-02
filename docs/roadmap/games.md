# games — the arcade
Filing test: the arcade — the games, leaderboards, head-to-head, match relay.

- [ ] A friend running a hand-written client can post a forfeit "win" against you the moment you go
      offline and it lands on both records for good; the two head-to-head result messages also have
      no rate limit, so a loop of them can slow everyone's online/offline status
      `all` `confirmed` `checked 2026-09-01` `security` → docs/active/investigations/2026-09-01-game-forfeit-unattested-record.md

- [ ] Connect 4 can't be played without a mouse — no way to Tab to a column or drop a piece with
      the keyboard, and nothing is announced; chess in the same panel works fine (2026-08-31)
      `arcade` `desktop` `confirmed` `checked 2026-09-01` → docs/active/investigations/2026-09-01-connect4-keyboard-play.md

- [ ] Idea: bind the dedicated Copilot/AI key on Windows laptops (and others) to open/close the
      games panel; may need Windows-specific keycode detection
      `arcade` `desktop` `parked` `checked 2026-09-01`
