// Violation fixture for resume-browser-uses-shared-filter-chips (count branch, Tags):
// every primitive present and in order, but the Tags label is computed
// twice. Expected findings: 1 (whole file).
declare const FilterMenuChip: any, FilterChip: any, SearchFilterPill: any, CheckboxMark: any, PickLabel: any;
declare function pickLabel(c: string, p: string[]): any;

const projectsLabel = () => <PickLabel {...pickLabel('Projects', [])} />;
const tagsLabel = () => <PickLabel {...pickLabel('Tags', [])} />;
const narrowTagsLabel = () => pickLabel('Tags', []).text;

export const Row = () => (
  <div>
    <FilterMenuChip>{projectsLabel()}</FilterMenuChip>
    <FilterMenuChip>{tagsLabel()}{narrowTagsLabel()}</FilterMenuChip>
    <FilterChip kind="toggle" />
    <SearchFilterPill value="" />
    <CheckboxMark checked />
  </div>
);
