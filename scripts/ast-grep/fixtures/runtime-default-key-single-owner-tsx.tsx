// Violation fixture for the .tsx twin of runtime-default-key-single-owner (fires 3
// times — an attribute string, a JSX attribute name and JSX body text).
export const Bad = () => (
  <span title="youcoded-runtime-default" data-youcoded-runtime-default>
    youcoded-runtime-default
  </span>
);
