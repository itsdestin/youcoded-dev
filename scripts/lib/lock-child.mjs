// scripts/lib/lock-child.mjs — helper process for lock.test.mjs's "exactly one wins" races.
// WHY its own file (2026-11-27): lock.test.mjs used to re-run ITSELF as the child, and each child re-ran
// the whole suite and spawned 8+ more children: a fork bomb that crashed the desktop three times. This
// file imports no test runner and spawns nothing, so a child can never reach test() or start more children.
import { tryAcquireLock } from './lock.mjs';

const got = tryAcquireLock(process.argv[2]);
console.log(got.acquired ? 'won' : 'lost');
// Stay alive briefly so a winner's lock stays live (its pid running) while the rivals try.
setTimeout(() => process.exit(0), 400);
