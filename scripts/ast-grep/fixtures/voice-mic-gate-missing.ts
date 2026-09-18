// Violation fixture for voice-mic-gate-uses-workbench-document, branch 1: the
// microphone gate names no workbench predicate at all. Fires once, on the file.
export const canRecord = (bridge: { sendAudio?: unknown } | null) => !!bridge && typeof bridge.sendAudio === 'function';
