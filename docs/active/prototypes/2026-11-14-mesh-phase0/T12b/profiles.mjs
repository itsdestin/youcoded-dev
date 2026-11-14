// Rule profiles. LITERAL = the design text read as written (every INTERP in decide.mjs taken literally, no device duties beyond
// those the text names). FIXED = the proposed rule changes from the report, all on.
export const LITERAL = { loserRelease: false, anyOnBehalf: false, restoreAll: false, backed: false, pendingTakeover: false,
  seenMaximal: true, literalLosers: true, noOwnerField: true, naiveCluster: true, runFix: false, orphanClaim: false, lineageSetAside: false, stableIds: false, parentOwesOnLoss: false, primaryIsChatId: false, reversibleSetAside: false, adoptClaim: false, rosterGate: false, keepLonger: false, noOverwrite: false, selfParent: false, roleField: false, oldEra: false, formatMax: false, reconcileAfterAdopt: false, hostNoPull: false };
export const FIXED = { loserRelease: true, anyOnBehalf: true, restoreAll: true, backed: true, pendingTakeover: false, runFix: true, orphanClaim: true, lineageSetAside: true, stableIds: true, parentOwesOnLoss: true, primaryIsChatId: true, reversibleSetAside: true, adoptClaim: true, rosterGate: true, keepLonger: true, noOverwrite: true, selfParent: true, roleField: true, oldEra: true, formatMax: true, reconcileAfterAdopt: true, hostNoPull: true };
LITERAL.witnessEntries = false; // not part of the written text; here so --revert/--add can name it
export const profile = (argv) => (argv.includes('--literal') ? LITERAL : FIXED);

// --revert key[,key] : the FIXED profile with just those rules put back to their literal reading (ablation).
export const ablate = (argv) => {
  // --only key[,key]: the LITERAL (old, T12 text) rules plus just those fixes switched on, with the T12 baseline fixes (loserRelease, anyOnBehalf,
  // restoreAll, backed) that were already in the previous report's FIXED set kept on, so one new rule's effect is visible alone.
  const o = argv.indexOf('--only'); if (o >= 0) { const r = { loserRelease: true, anyOnBehalf: true, restoreAll: true, backed: true, pendingTakeover: false }; for (const k of argv[o + 1].split(',')) r[k] = true; return r; }
  // --add key[,key]: FIXED plus experimental options (e.g. witnessEntries)
  const j = argv.indexOf('--add'); if (j >= 0) { const r = { ...FIXED }; for (const k of argv[j + 1].split(',')) r[k] = true; return r; }
  const i = argv.indexOf('--revert'); if (i < 0) return profile(argv);
  const r = { ...FIXED }; for (const k of argv[i + 1].split(',')) r[k] = LITERAL[k];
  return r;
};

LITERAL.mutateClock = false; // set true via --mutate in fuzz.mjs to prove the clock check can fail
