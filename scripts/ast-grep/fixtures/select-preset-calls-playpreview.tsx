// Violation fixture for select-preset-calls-playpreview — the select handler
// persists the choice but a comment separates it from the audition, and the
// right sequence appears only in this comment:
// setSelectedPresetId(category, id); playPreview(id, category);
declare function setSelectedPresetId(cat: string, id: string): void;
declare function playPreview(id: string, cat?: string): void;
export function onSelect(category: string, id: string) {
  setSelectedPresetId(category, id);
  // then audition it
  playPreview(id, category);
}
