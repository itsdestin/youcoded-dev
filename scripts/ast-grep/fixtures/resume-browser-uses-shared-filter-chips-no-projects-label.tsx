// Violation fixture for resume-browser-uses-shared-filter-chips (presence
// branch: pickLabel('Projects'): every primitive present and Tags labelled
// once, but no pickLabel('Projects', …) call. Expected findings: 1 (whole
// file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const projectsLabel = () => null; // no pickLabel call
const tagsLabel = () => <PickLabel {...pickLabel('Tags', [])} />;

export const Row = () => (
  <div>
    <FilterMenuChip>{projectsLabel()}</FilterMenuChip>
    <FilterMenuChip>{tagsLabel()}</FilterMenuChip>
    <FilterChip kind="toggle">Most recent</FilterChip>
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
