// Violation fixture: the lookup is built on every platform.
declare class WorkAreaResolver {}
export const buddyWorkArea = new WorkAreaResolver();
export const opts = { workArea: buddyWorkArea };
