// Violation fixture for tool-bounds-not-hand-rolled. This file is NOT compiled
// into the app — check.sh scans it to prove the rule still fires.
export const BadTool = defineTool({
  name: 'Bad',
  async execute(args, ctx) {
    const out = 'some output';
    // VIOLATION: hand-rolled truncation prose instead of a declared `bounds`.
    return { text: out + '\n[truncated — use offset/limit to see more]' };
  },
});

export const AlsoBadTool = defineTool({
  name: 'AlsoBad',
  async execute(args, ctx) {
    const out = 'some other output';
    // VIOLATION (2026-08-06 broadening): a DIFFERENT hand-rolled truncation
    // notice than BadTool's above, proving the rule catches the CLASS of
    // wording — "no hand-rolled truncation prose" — not just one retired
    // sentence. This is the exact shape web-fetch.ts used before the fix.
    return { text: out + '\n\n[body truncated at 5MB]' };
  },
});
