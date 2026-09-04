// The lines on screen — exactly the spec's storyboard strings, pinned by
// captions.test.ts against the spec file and the landing page's banned list.
// Each beat has a headline and a quieter sub-line.
export const CAPTIONS = {
  b1: { head: 'YouCoded Assistant', sub: 'Useful. Fun. Yours.' },
  b2: { head: 'Just ask.', sub: 'Type what you need. It pulls your notes and gets to work.' },
  b3: { head: 'Describe a look.', yours: "It's yours.", sub: 'Or pick one from the community.' },
  b4: { head: 'Your model, your call.', sub: 'Claude, a cloud model, or one running on your machine.' },
  // Destin, 2026-09-04 (the script editor): "rename this section to Collaborate with your assistant"; "change to Everything is a project."
  b5: { head: 'Collaborate with your assistant.', sub: 'Attach a spreadsheet. Ask. Watch it change.', head2: 'Everything is a project.', project: 'Every file, chat and note lives in its project.' },
  b6: { head: 'Play while it works.', sub: 'Chess and Connect 4 with friends. Flappy on your own.' },
  b7: { head: 'Every conversation, findable.', sub: 'Search, tag, note, drag into order.' },
  b8: { head: 'Pick up on any device.', sub: 'Chats and project files sync across all your devices.' },
  b9: { head: 'Add what you need.', sub: 'Plugins from the WeCoded marketplace. One click to install.' },
  b10: { head: 'Free. Open source.', sub: 'Windows · Mac · Linux · Android' },
  link: 'www.youcoded.ai',   // Destin, 2026-09-04: the site, not the repo
} as const;
export const BANNED = ['real app', 'real files', 'actually', 'does real work', 'self-improving'];
