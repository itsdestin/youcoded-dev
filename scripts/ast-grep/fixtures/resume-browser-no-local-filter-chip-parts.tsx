// Violation fixture for resume-browser-no-local-filter-chip-parts: every local
// part the shared primitives replaced. Expected findings: 6 (one per line
// marked "fires").
function FilterPill({ label }: { label: string }) { // fires: local pill
  return <span>{label} ▾</span>; // fires: text-glyph chevron (JSX text)
}
export const sortLabel = (asc: boolean) => (asc ? 'Oldest ↑' : 'Newest'); // fires: arrow in a string
export const box = (checked: boolean) => `w-3 h-3 rounded-sm border ${checked ? 'bg-accent' : ''}`; // fires: hand-made check box
export const names = (picked: string[]) => picked.join(', '); // fires: comma-joined names
export const count = (n: number) => `Projects (${n})`; // fires: "Projects (N)"
export { FilterPill };
