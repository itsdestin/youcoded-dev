// Fixture for chatgpt-types-no-locale-formatter (2026-09-16, u1 fix round 1).
// Shapes the direct-property oxlint ban (no-restricted-properties) misses —
// every one of these is a real evasion named in the fix-list item.
declare const d: any;

// An indirect string key: the property is never written as `.toLocaleTimeString`,
// so no property-access rule sees it.
const k = 'toLocaleTimeString';
d[k]();

// A reflective/computed lookup: same problem, different spelling.
Reflect.get(d, 'toLocaleString');

// An import of the name followed by a bare call — no `.` at all.
import { toLocaleDateString } from './y';
toLocaleDateString();

// An aliased import specifier: the LOCAL name is `x`, but the original name
// (still a real identifier node) is `toLocaleDateString`.
import { toLocaleDateString as x } from './z';
