// Violation fixture for section-label-no-h4: a heading level standing in as
// a section label instead of the app's real section heading (<h3>).
const BadHeading = () => (
  <h4 className="text-3xs font-medium text-fg-muted tracking-wider uppercase">Bad</h4>
);
