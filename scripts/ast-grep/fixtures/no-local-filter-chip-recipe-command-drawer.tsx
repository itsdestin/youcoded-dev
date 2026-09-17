// Violation fixture for no-local-filter-chip-recipe-command-drawer (absence
// branch): a drawer that renders FilterChip but ALSO keeps the retired Favorites
// recipe and its ml-auto. Expected findings: 2.
const FilterChip = (p: any) => p.children ?? null;

export const Drawer = ({ fav }: { fav: boolean }) => (
  <div>
    <FilterChip active onClick={() => {}}>Work</FilterChip>
    <button className={fav ? 'bg-accent/20 text-accent border-accent/50' : 'ml-auto'}>Favorites</button>
  </div>
);
