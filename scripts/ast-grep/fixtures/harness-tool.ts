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
