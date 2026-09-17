// Violation fixture for section-label-canonical-classes: same four classes,
// wrong order — renders identically to the canonical recipe and defeats a
// grep for the exact string.
const BadOrder = () => (
  <div className="uppercase text-3xs tracking-wider text-fg-muted">Bad order</div>
);
