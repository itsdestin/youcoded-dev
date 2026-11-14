// Aggregate static-scan per-file records into counts. usage: node aggregate.mjs <scanDir>
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2]; const recs = [];
for (const f of fs.readdirSync(dir)) if (/^shard\d+\.jsonl$/.test(f)) for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (l) recs.push(JSON.parse(l));
const kinds = ['cc-main', 'cc-sub', 'native'];
const sum = (rs, k) => rs.reduce((a, r) => a + (r[k] || 0), 0);
const cnt = (rs, f) => rs.filter(f).length;
for (const k of kinds) {
  const rs = recs.filter((r) => r.kind === k);
  console.log(`\n=== ${k}: files ${rs.length}, bytes ${(sum(rs, 'bytes') / 1e9).toFixed(2)} GB, lines ${sum(rs, 'lines')}, empty-size files ${cnt(rs, r => r.bytes === 0)}`);
  const row = (name, f, lines) => console.log(`${name.padEnd(46)} files ${String(cnt(rs, f)).padStart(5)}${lines ? '  lines ' + sum(rs, lines) : ''}`);
  row('line contains raw U+2028/2029', r => r.lsLines > 0, 'lsLines'); row('bad JSON line', r => r.bad > 0, 'bad'); row('empty line', r => r.empty > 0, 'empty'); row('CR at line end', r => r.crlf > 0, 'crlf');
  row('no trailing newline (partial tail)', r => r.noTrailingNewline);
  row('dup uuid', r => r.dupUuids > 0, 'dupUuids'); row('  dup w/ same length', r => r.dupSameLen > 0, 'dupSameLen'); row('  dup w/ different length', r => r.dupDiffLen > 0, 'dupDiffLen');
  const dt = {}; for (const r of rs) for (const [t, n] of Object.entries(r.dupByType)) dt[t] = (dt[t] || 0) + n; console.log('  dup by type', JSON.stringify(dt));
  row('timestamp goes backwards', r => r.tsInversions > 0, 'tsInversions'); row('  by >1 s', r => r.tsInvOver1s > 0, 'tsInvOver1s'); row('  by >60 s', r => r.tsInvOver60s > 0, 'tsInvOver60s');
  console.log('  max backwards (ms)', Math.max(0, ...rs.map(r => r.tsMaxInvMs)));
  row('parentUuid points outside file', r => r.parentAbsent > 0, 'parentAbsent'); row('  of which within first 50 lines', r => r.parentAbsentFirst50 > 0, 'parentAbsentFirst50');
  row('first line is type summary', r => r.firstIsSummary); row('any summary-type line', r => r.summaryTypeLines > 0, 'summaryTypeLines');
  row('first line sessionId != file id', r => r.firstSessionMismatch); row('any line with other sessionId', r => r.linesOtherSession > 0, 'linesOtherSession');
  row('forkedFrom present', r => r.forkedFrom > 0, 'forkedFrom'); row('sidechain lines', r => r.sidechainLines > 0, 'sidechainLines');
  row('compact_boundary', r => r.compactBoundaries > 0, 'compactBoundaries'); row('isCompactSummary', r => r.compactSummaries > 0, 'compactSummaries');
  console.log('  boundary parent: present-before', sum(rs, 'boundaryParentPresentBefore'), 'absent', sum(rs, 'boundaryParentAbsent'), 'later', sum(rs, 'boundaryParentLater'), 'no logicalParent', sum(rs, 'boundaryNoParent'));
  row('native context-clear', r => r.contextClear > 0, 'contextClear'); row('native compact-summary', r => r.nativeCompactSummary > 0, 'nativeCompactSummary'); row('native dropPart tombstone', r => r.dropPart > 0, 'dropPart');
  // reply-end analysis
  const ends = {}; for (const r of rs) { const key = r.end + ':' + r.endDetail; ends[key] = (ends[key] || 0) + 1; } console.log('  ending state', JSON.stringify(ends, null, 0));
  row('has >=1 reply end', r => r.replyEnds > 0, 'replyEnds'); row('assistant line with no stop_reason', r => r.assistantNoStop > 0, 'assistantNoStop');
  const sc = {}; for (const r of rs) for (const [t, n] of Object.entries(r.stopCounts)) sc[t] = (sc[t] || 0) + n; console.log('  stop_reason counts', JSON.stringify(sc));
  row('api-error / synthetic reply-end', r => r.apiErrorLines > 0, 'apiErrorLines'); row('interrupt lines', r => r.interrupts > 0, 'interrupts'); row('  interrupt with promptId', r => r.interruptWithPromptId > 0, 'interruptWithPromptId');
  row('turn content after a reply end w/o new prompt', r => r.endAfterEndTurnContinues > 0, 'endAfterEndTurnContinues');
  row('queue-operation lines', r => r.queueOps > 0, 'queueOps'); row('queued_command attachments', r => r.queuedCommandAttachments > 0, 'queuedCommandAttachments');
  row('meta lines after last reply end', r => r.trailingMetaAfterEnd > 0, 'trailingMetaAfterEnd');
}
fs.writeFileSync(path.join(dir, 'all.json'), JSON.stringify(recs));
