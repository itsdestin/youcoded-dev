# (id, file, old, new, what it removes)
M = [
 ('M1-park-id', 'parked.ts', "const env = openEnv(raw, { role: 'park', version: st.key, id: name.slice(0, -5) });", "const env = openEnv(raw, { role: 'park', version: st.key });", 'drain no longer compares the position+hash id sealed in a park with its file name (F1)'),
 ('M2-park-linehash', 'parked.ts', "if (h.digest('hex').slice(0, 16) !== name.slice(17, 33)) lines = null;", "void h;", 'drain no longer re-hashes the parked lines against the id'),
 ('M3-env-version', 'envelope.ts', "if (h.v !== want.version) return", "if (false) return", 'envelope no longer compares the version key (foreign chat/version file accepted)'),
 ('M4-env-role', 'envelope.ts', "if (h.r !== want.role) return", "if (false) return", 'envelope no longer compares the role (another kind of small file accepted)'),
 ('M5-env-id', 'envelope.ts', "if (want.id !== undefined && h.i !== want.id) return", "if (false) return", 'envelope no longer compares the sealed id (a tail of another takeover, a park of another position) (F2)'),
 ('M6-hw-ladder', 'highwater.ts', "return mine !== null && mine.slice(0, 16) === pick[1] ?", "return mine !== null ?", 'rollback report no longer checks the folder holds the SAME history as the record'),
 ('M7-hw-nolower', 'highwater.ts', "if (st.rolledBack && st.count < st.rolledBack.had) return;", "", 'a rolled-back head may lower/overwrite the high-water mark it was compared with'),
 ('M8-ck-tag', 'checkpoint.ts', "if (!s.subarray(60, 76).equals(tag)) return null;", "", 'a checkpoint slot of another version is believed'),
 ('M9-slot-seq', 'slotfile.ts', "slots[i]!.seq > slots[best]!.seq", "slots[i]!.seq < slots[best]!.seq", 'slot files pick the OLDER slot (freshness counter ignored) (marks.bin / high-water)'),
 ('M10-ck-boundary', 'checkpoint.ts', "if (((flags & 1) !== 0) !== (evLines > 0)) return null;", "", 'checkpoint slot whose boundary flag contradicts its eviction state is believed (F4/F5 area)'),
 ('M11-hw-lower-on-cut', 'store.ts', "    await this.lowerHwTo(st, n);\n", "", 'a deliberate set-aside cut no longer lowers the high-water record (false rollback alarm)'),
 ('M12-tail-done-guard', 'store.ts', "if (!existing && await this.fs.exists(nodePath.join(dir, `${takeoverId}.done`))) throw new StoreError('corrupt', 'the saved tail file is missing although the cut was marked done');", "", 'a retry may write an empty tail over a lost tail that was marked done'),
 ('M13-tail-readdone', 'store.ts', "if (!t && await this.fs.exists(nodePath.join(this.vdir(key), 'tails', `${takeoverId}.done`))) throw new StoreError('corrupt', 'the saved tail file is missing although the cut was marked done');", "", 'tail() reports a deleted tail as plain absent even when the cut was marked done'),
 ('M14-hw-raise-every', 'highwater.ts', "if (!force && st.count - st.hw.noted < HW_EVERY) return;", "if (!force) return;", 'the high-water record is only raised at close/evict/restore, never during appends'),
]
