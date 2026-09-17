// Violation fixture: the handler ranks and formats scores itself.
declare const rows: { score: number }[];
declare function format(n: number): string;
export const board = rows.sort((a, b) => b.score - a.score).map((r) => format(r.score));
