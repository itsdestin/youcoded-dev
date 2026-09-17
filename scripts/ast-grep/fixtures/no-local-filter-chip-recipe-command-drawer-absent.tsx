// Violation fixture for no-local-filter-chip-recipe-command-drawer (presence
// branch): a drawer whose chips no longer go through FilterChip at all — the
// name only in this comment and a type argument. Expected findings: 1.
import { useState } from 'react';

export const Drawer = () => {
  const [on] = useState<FilterChipKind | null>(null);
  return <button aria-pressed={!!on}>Work</button>;
};
type FilterChipKind = 'toggle';
