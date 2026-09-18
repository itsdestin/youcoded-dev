// Violation fixture for get-meta-marks-failed-read-unreadable-remote: the case
// answers blanks with no `unreadable:` (fires once) and says it falls through
// (fires once more).
export function route(type: string): unknown {
  switch (type) {
    case 'session:get-meta': {
      const why = 'fall through to empty';
      return { tags: [], note: '', supported: true, why };
    }
    default:
      return null;
  }
}
