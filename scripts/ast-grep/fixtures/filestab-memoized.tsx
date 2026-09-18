// Violation fixture for filestab-memoized: FilesTab exported as a plain
// function, not React.memo(...). Expected: 1 finding (the whole file).
export function FilesTab() { return null; }
