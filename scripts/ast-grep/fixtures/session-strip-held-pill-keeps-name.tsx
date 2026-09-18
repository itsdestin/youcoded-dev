// Violation fixture: the pill in hand collapsed to a dot.
declare const COLLAPSED_PILL_PX: number;
export function widthOf(id: string, sessionId: string): number {
  if (id === sessionId) return COLLAPSED_PILL_PX;
  return 0;
}
