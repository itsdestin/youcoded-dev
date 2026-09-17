// Violation fixture for no-local-filter-chip-recipe: the marketplace bar painting
// its own chip again — the active recipe in a string, the base recipe split off
// by a template substitution. Expected findings: 2.
export const Chip = ({ on }: { on: boolean }) => (
  <button className={on ? 'px-3 py-1 bg-accent text-on-accent' : `${'px-3'} rounded-full text-sm`}>x</button>
);
