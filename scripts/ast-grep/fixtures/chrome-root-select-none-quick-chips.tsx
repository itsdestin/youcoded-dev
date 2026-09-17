// Violation fixture for chrome-root-select-none-quick-chips (fires once, on
// the file): the wrapper has select-none, but a second element sits between it
// and the chip row.
export const QuickChips = () => (
  <div className="relative select-none">
    <span />
    <div className="flex gap-1 px-3 py-1 overflow-x-auto items-center">x</div>
  </div>
);
