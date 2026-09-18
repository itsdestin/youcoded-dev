// Violation fixture for resume-browser-uses-shared-filter-chips (presence
// branch: pickLabel('Tags'): every primitive present and Projects labelled
// once, but no pickLabel('Tags', …) call. Expected findings: 1 (whole file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const projectsLabel = () => <PickLabel {...pickLabel('Projects', [])} />;
const tagsLabel = () => null; // no pickLabel call

export const Row = () => (
  <div>
    <FilterMenuChip>{projectsLabel()}</FilterMenuChip>
    <FilterMenuChip>{tagsLabel()}</FilterMenuChip>
    <FilterChip kind="toggle">Most recent</FilterChip>
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
