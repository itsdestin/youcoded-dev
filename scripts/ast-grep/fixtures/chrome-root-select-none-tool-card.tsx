// Violation fixture for chrome-root-select-none-tool-card (fires once, on the
// file): the non-compact header variant lost select-none.
declare const isCompactSkill: boolean;
export const headerClass = isCompactSkill
  ? 'w-full flex items-center select-none'
  : 'w-full flex items-center hover:bg-inset/50';
