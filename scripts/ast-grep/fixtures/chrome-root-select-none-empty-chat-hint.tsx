// Violation fixture for chrome-root-select-none-empty-chat-hint (fires once, on
// the file): the hint's element has no select-none; a sibling has it.
declare const name: string;
export const Hint = () => (
  <div className="select-none">
    <div className="absolute inset-x-0 text-sm">
      Start a conversation with {name}
    </div>
  </div>
);
