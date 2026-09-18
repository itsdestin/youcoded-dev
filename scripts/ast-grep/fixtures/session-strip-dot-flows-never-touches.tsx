// Violation fixture: none of the veil/flow pieces, and a direction-aware flow.
declare const travel: { current: { dir: number } };
declare const bar: { getBoundingClientRect(): { left: number } };
export function f() {
  const dir = travel.current.dir;
  const barL = bar.getBoundingClientRect().left;
  return dir + barL;
}
