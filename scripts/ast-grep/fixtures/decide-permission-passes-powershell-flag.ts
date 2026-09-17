// Violation fixture for decide-permission-passes-powershell-flag: the
// decidePermission call lost its powershell options object.
function makeChecker() {
  return async (tool: string, subject: string | undefined) => decidePermission(tool, subject, {
    presetRules,
    modeRules: [],
  });
}
