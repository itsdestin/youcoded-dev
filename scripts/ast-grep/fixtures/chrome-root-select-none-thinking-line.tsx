// Violation fixture for chrome-root-select-none-thinking-line (fires once, on
// the file): select-none is on the line, but not beside its test id.
export const Thinking = () => <div data-testid="thinking-indicator" role="status" className="flex select-none">x</div>;
