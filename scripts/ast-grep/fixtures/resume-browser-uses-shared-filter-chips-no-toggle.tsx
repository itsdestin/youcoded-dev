// Violation fixture for resume-browser-uses-shared-filter-chips (presence
// branch: FilterChip kind="toggle"): everything else present and in order, but
// the only FilterChip has no kind="toggle". Expected findings: 1 (whole file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const projectsLabel = () => <PickLabel {...pickLabel('Projects', [])} />;
const tagsLabel = () => <PickLabel {...pickLabel('Tags', [])} />;

export const Row = () => (
  <div>
    <FilterMenuChip>{projectsLabel()}</FilterMenuChip>
    <FilterMenuChip>{tagsLabel()}</FilterMenuChip>
    <FilterChip kind="menu">Most recent</FilterChip>
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
