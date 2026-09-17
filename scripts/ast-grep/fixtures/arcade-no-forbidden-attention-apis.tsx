// Violation fixture: a game reaching for the attention APIs in several shapes.
declare const api: { playSound(s: string): void };
export const Bad = ({ isThinking }: { isThinking: boolean }) => {
  api.playSound('win');
  return <div data-x={isThinking} />;
};
