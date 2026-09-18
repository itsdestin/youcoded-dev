// Violation fixture: an undebounced re-ask on one display event only.
declare const screen: { on: (e: string, fn: () => void) => void };
declare const refresh: () => void;
const reresolveWorkArea = () => refresh();
screen.on('display-added', reresolveWorkArea);
