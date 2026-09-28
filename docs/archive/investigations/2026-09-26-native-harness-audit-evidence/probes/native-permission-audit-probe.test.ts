import { expect, it } from 'vitest';
import { AskUserQuestionTool, formatAnswers } from '../src/main/harness/tools/ask-user-question';

// The permission failure regression lives in harness-session-loop/history-rebuild.
// Keep the unrelated question/comma audit observation unchanged.
it('observes ambiguous duplicate questions and comma-label provenance', () => {
  const options = [{ label: 'Design, then build' }, { label: 'Other option' }];
  const args = { questions: [
    { question: 'Which approach?', header: 'First', options, multiSelect: false },
    { question: 'Which approach?', header: 'Second', options, multiSelect: false },
  ] };
  expect(AskUserQuestionTool.inputSchema.safeParse(args).success).toBe(true);
  const output = formatAnswers(args, { answers: { 'Which approach?': 'Design, then build' } });
  console.log('AUDIT_QUESTION_ANSWERS', output);
  expect(output.match(/the user typed their own answer/g)).toHaveLength(2);
});
