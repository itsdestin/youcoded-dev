// Violation fixture for limit-sentence-uses-shared-time-format: the limit
// sentence formats the reset time itself, with no import from './time-format'.
import { formatDuration } from './duration-format';

export function chatGptLimitMessage(label: string, resetsAt: string): string {
  return `You have reached ChatGPT's ${label} session limit (Resets @ ${resetsAt}, ${formatDuration(1)}).`;
}
