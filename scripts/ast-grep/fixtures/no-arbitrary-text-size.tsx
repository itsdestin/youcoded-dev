// Violation fixture for no-arbitrary-text-size: a hand-typed pixel value
// instead of a named step, including the decimal form.
const Bad = () => (
  <div className="text-[12.5px]">Off-scale</div>
);
