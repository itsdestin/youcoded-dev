---
date: 2026-09-01
status: active
type: investigation
topic: Transcript storage has no long-term plan — GitHub will run out, and large transcripts are already unsyncable
---

# Transcript storage has no long-term plan

Parked for a proper design pass. This report preserves the measurements so the pass doesn't start from zero.

**Root.** Conversation transcripts are append-only JSONL that grow without bound, and sync stores them as full copies in a git repo on GitHub. Three problems follow.

**(1) The ceiling is real and everyone hits it.** Measured 2026-07-30 on the Z13: Personal space **841 MB local / 652 MB on GitHub**, against GitHub's 1 GB soft / 5 GB hard limit. One project space (`PAF 574`) was already **439 MB**. Any daily user reaches this on a long enough timeline; at the limit GitHub refuses pushes and sync stops for the whole account.

**(2) There is no pruning anywhere.** Nothing ages out, compacts or tiers transcripts. `youcoded/desktop/src/main/snapshot-retention.ts` prunes Drive/iCloud *backup snapshots* only. History compaction would not help: squashing all 75,566 historical blob versions on a throwaway clone landed at **611 MB** — the bulk is *current content* (3,415 files / 1,892 MB uncompressed), not history. Do not reach for the documented manual-compaction procedure.

**(3) Large transcripts are effectively unsyncable, and the UX for that would lie.** `MAX_SYNC_FILE_BYTES` is 50 MB (`youcoded/desktop/src/main/sync-spaces/guards.ts`), so today everything rides — but content is concentrated: **68 transcripts (4% of files) hold 736 MB**, nine over 20 MB, one at 43 MB, while all 1,673 conversation *records* total **1 MB**. Metadata is nearly free; transcripts are the whole cost. Lowering the cap is blocked by copy: a record whose transcript is absent renders as "Not synced to this device yet" (`session-browser.ts` `fs.existsSync` probe → `notSyncedYet` → disabled row in `ResumeBrowser.tsx`). That wording is built for a *temporary* gap; a size-excluded transcript never arrives, so it would name a false cause — exactly what `docs/error-message-standards.md` forbids.

The "yet" wording is still what the resume browser shows for an absent transcript:
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/ResumeBrowser.tsx", "contains": "'Not synced to this device yet'"} -->

Related asymmetry: the backend resume refusal ("This conversation hasn't synced to this device yet") exists only in the native lane (`ipc-handlers.ts`); the CC lane relies on the UI gate alone.

**Goal to design toward (Destin, 2026-07-30): every transcript available on every device, always.** GitHub may simply be the wrong permanent store for transcript bytes. Options: a different backing store for transcripts (records keep riding git at 1 MB), on-demand fetch from a peer or blob store, or folding into a future YouCoded-managed cloud at cheap-ish rates (see the parked "YouCoded Cloud sync transport" idea in `docs/roadmap/sync.md`). Whatever it becomes needs an honest not-here state and a fetch affordance.

Sibling work: `docs/archive/specs/2026-07-30-sync-corruption-self-heal-design.md` fixes silent sync failure, not this.

**History.** Added 2026-07-30 (measured during the 2026-07-27 corruption repair session). Re-checked 2026-09-01: cap still 50 MB, no pruning added, wording unchanged.
