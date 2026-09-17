// Violation fixture for resume-browser-uses-shared-filter-chips (presence
// branches): a filter row with none of the shared primitives and no pickLabel
// calls — only local markup. Expected findings: 1 (whole file).
export const Row = () => (
  <div>
    <button>Projects</button>
    <button>Tags</button>
  </div>
);
