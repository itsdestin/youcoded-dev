// Violation fixture for resume-browser-uses-shared-filter-chips (count branch, Projects):
// every primitive present and in order, but the Projects label is computed
// twice. Expected findings: 1 (whole file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const projectsLabel = () => <PickLabel {...pickLabel('Projects', [])} />;
const tagsLabel = () => <PickLabel {...pickLabel('Tags', [])} />;
const narrowProjectsLabel = () => pickLabel('Projects', []).text;

export const Row = () => (
  <div>
    <FilterMenuChip>{projectsLabel()}{narrowProjectsLabel()}</FilterMenuChip>
    <FilterMenuChip>{tagsLabel()}</FilterMenuChip>
    <FilterChip kind="toggle" />
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
