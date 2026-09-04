// The lines on screen — exactly the spec's storyboard strings, pinned by
// captions.test.ts against the spec file and the landing page's banned list.
// Each beat has a headline and a quieter sub-line (Caption.tsx).
export const CAPTIONS = {
  b1: { head: 'YouCoded', sub: 'Useful. Fun. Yours.' },
  b2: { head: 'One tap to start.', sub: 'Briefing, inbox, journal. Quick actions you set up once.' },
  b3: { head: 'Your files, beside the chat.', sub: 'Attach a spreadsheet. Ask. Watch it change.' },
  b4: { head: 'Play while it works.', sub: 'Chess and Connect 4 with friends. Flappy on your own.' },
  b5: { head: 'Every conversation, findable.', sub: 'Search, tag, note, drag into order.' },
  b6: { head: 'Start on your laptop. Finish on your phone.', sub: 'Same conversation, picked up where you left it.' },
  b7: { head: "Describe a look. It's yours.", sub: 'Or pick one from the community.' },
  b8: { head: 'Free. Open source.', sub: 'Windows · Mac · Linux · Android' },
  link: 'github.com/itsdestin/youcoded',
} as const;
export const BANNED = ['real app', 'real files', 'actually', 'does real work', 'self-improving'];
