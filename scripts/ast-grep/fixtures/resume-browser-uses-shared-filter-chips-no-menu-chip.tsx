// Violation fixture for resume-browser-uses-shared-filter-chips (presence
// branch: FilterMenuChip): everything else present and in order, but no
// <FilterMenuChip> tag — the labels sit in plain spans. Expected findings: 1
// (whole file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const projectsLabel = () => <PickLabel {...pickLabel('Projects', [])} />;
const tagsLabel = () => <PickLabel {...pickLabel('Tags', [])} />;

export const Row = () => (
  <div>
    <span>{projectsLabel()}</span>
    <span>{tagsLabel()}</span>
    <FilterChip kind="toggle">Most recent</FilterChip>
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
