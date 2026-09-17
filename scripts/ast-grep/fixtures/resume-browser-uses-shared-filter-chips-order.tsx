// Violation fixture for resume-browser-uses-shared-filter-chips (order branch):
// every primitive present, each label once, but Tags is labelled before
// Projects. Expected findings: 1 (whole file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const tagsLabel = () => <PickLabel {...pickLabel('Tags', [])} />;
const projectsLabel = () => <PickLabel {...pickLabel('Projects', [])} />;

export const Row = () => (
  <div>
    <FilterMenuChip>{projectsLabel()}</FilterMenuChip>
    <FilterMenuChip>{tagsLabel()}</FilterMenuChip>
    <FilterChip onClick={() => {}} kind="toggle">Most recent</FilterChip>
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
