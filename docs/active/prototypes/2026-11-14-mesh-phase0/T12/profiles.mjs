// Rule profiles. LITERAL = the design text read as written (every INTERP in decide.mjs taken literally, no device duties beyond
// those the text names). FIXED = the proposed rule changes from the report, all on.
export const LITERAL = { loserRelease: false, anyOnBehalf: false, restoreAll: false, backed: false, pendingTakeover: false,
  seenMaximal: true, literalLosers: true, noOwnerField: true, naiveCluster: true };
export const FIXED = { loserRelease: true, anyOnBehalf: true, restoreAll: true, backed: true, pendingTakeover: false };
LITERAL.witnessEntries = false; // not part of the written text; here so --revert/--add can name it
export const profile = (argv) => (argv.includes('--literal') ? LITERAL : FIXED);

// --revert key[,key] : the FIXED profile with just those rules put back to their literal reading (ablation).
export const ablate = (argv) => {
  // --add key[,key]: FIXED plus experimental options (e.g. witnessEntries)
  const j = argv.indexOf('--add'); if (j >= 0) { const r = { ...FIXED }; for (const k of argv[j + 1].split(',')) r[k] = true; return r; }
  const i = argv.indexOf('--revert'); if (i < 0) return profile(argv);
  const r = { ...FIXED }; for (const k of argv[i + 1].split(',')) r[k] = LITERAL[k];
  return r;
};

LITERAL.mutateClock = false; // set true via --mutate in fuzz.mjs to prove the clock check can fail
