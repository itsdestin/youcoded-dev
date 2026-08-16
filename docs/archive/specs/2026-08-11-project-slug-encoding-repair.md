---
status: shipped
date: 2026-08-11
updated: 2026-08-15
tags: [transcript-watcher, conversations, sync, slug-encoding, cross-platform-parity, data-repair]
repos: [youcoded]
---

# Project slug encoding — repair spec

**Problem in one line:** `cwdToProjectSlug()` claims to mirror Claude Code's
`~/.claude/projects/<slug>/` encoding but only replaces four characters, so any
project folder containing other punctuation gets a slug Claude Code never
writes — and chat view, project memory, conversation sync, and resume all
silently read from a directory that does not exist.

**Revision (2026-08-11, post-review):** every claim below was re-derived from
source — the shipped CC 2.1.228 binary, the desktop/Android trees, and this
device's `~/.claude/projects` and `~/YouCoded/Personal/Conversations`. The
diagnosis and the split-the-function design survived; five things did not and are
corrected in place: the `realpath` step CC applies before slugging (§1), the
`cwd`-is-not-on-the-head-line and any-transcript-will-do errors in the inversion
design (§5.4), a nonexistent `Math.abs` edge case (§5.1), the fact that this
device's directories cannot validate the character class or produce §7's fixture
(§1, §2, §8), and the discovery that the sync space was populated from the orphan
rather than from CC's real directory, which reorders the repair (§4 #7, §6).

**Revision 2 (2026-08-12, second review):** §1–§5's diagnosis was re-verified
independently and held everywhere — the binary recovery is verbatim correct, every
statistic reproduces, and §5.0's premise turned out stronger than claimed
(`startWatching` has exactly one call site). **§6 did not survive**, and is
rewritten. Five blocking defects were found and are fixed here:

1. §6.1 and §5.4 gave **opposite answers on the one file the repair exists for**.
   There are two different ownership questions and the spec conflated them; they
   are now named rules **R1** and **R2** (§5.4), cited by everything else.
2. The `$HOME` fork is **bidirectional and mixed-`cwd`**, not "longer and newer",
   and every line carries a `parentUuid` the old "union by uuid" would break. §6
   no longer merges (§6.0).
3. A **third mis-keyed sync bucket** (`claude/transcripts/destin/`) holds the two
   largest transcripts. It is a *legitimate* bucket, so §6.2's repair is now
   session-scoped, not bucket-scoped.
4. §4's "Escapes the bug" was **backwards** for the two worst-affected sessions —
   their store records carry `originalPath: '/home/destin'`, which exists, so
   resume succeeds into the wrong project and re-forks. §6.2 now repairs records.
5. §8's "cheap" causation check **cannot work** (the breadcrumb is a `console.warn`
   that persists nowhere), and causation is settled anyway by #4.

**Revision 3 (2026-08-12, external verification pass):** every claim was re-verified
against its evidence source — desktop tree, Android tree, the shipped 2.1.228 binary,
and this device's disk — by four independent sweeps. §1–§5's diagnosis held again and
the binary recovery matched verbatim (one snippet, the `Zyi` bootstrap, is a light
paraphrase — functionally identical). Three findings force changes:

1. **§5.3 was wrong about Android.** `getCurrentSlug` is NOT "a sync key with no
   CC-directory lookup behind it" — three of its four call sites construct
   `~/.claude/projects/<slug>/` paths, and all three are silently broken on-device
   today. §4's "Android is not affected" was false for sync. §5.3 is rewritten:
   Android gets the same two-job split as desktop.
2. **The 200-line scan cap contradicted R1** and the spec's own worked example —
   the fork's `/home/destin` cwd first appears at line 279, past the cap. The cap
   is now scoped to R2 only (§5.4).
3. **§11 contradicted §6.0's case C twice** — a correct repair leaves the fork in
   `-home-destin` by design, so two checklist items were unsatisfiable as written.
   Fixed, and the case-C aftermath is now specified (§6.0).

Also corrected: importer count (nine, not six), test-file count (five, not six),
the orphan directory now holds five copies and is **still being written to** (so
the repair must not run before the code fix ships — §6.3), and a dozen
line-number/wording drifts.

**Triggering report (2026-08-11):** conversations started in
`/home/destin/YouCoded/Projects/PAF 574 - Diversity, Ethics, & Public Change`
appear in terminal view but chat view never shows received messages. Sending
works. No other folder on the device is affected.

---

## 1. Root cause

`youcoded/desktop/src/main/transcript-watcher.ts:24`:

```ts
export function cwdToProjectSlug(cwd: string): string {
  return cwd
    .replace(/\\/g, '/')   // backslash → forward slash
    .replace(/:/g, '-')    // colon → dash
    .replace(/\//g, '-')   // slash → dash
    .replace(/ /g, '-');   // space → dash (CC does this too)
}
```

### What Claude Code actually does

Recovered verbatim from the shipped CLI (2.1.228). The binary is a Bun
single-file executable with the JavaScript bundle embedded uncompressed, so
`strings` returns the source:

```js
function dpo(e){ return e.replace(/[^a-zA-Z0-9]/g,"-") }
function EGe(e){ let t=0; for(let r=0;r<e.length;r++) t=(t<<5)-t+e.charCodeAt(r)|0; return t }
function H6g(e){ return Math.abs(EGe(e)).toString(36) }
var Cee = 200;
function gv(e){                       // <- the directory name
  let t = dpo(e);
  if (t.length <= Cee) return t;
  return `${t.slice(0,Cee)}-${H6g(e)}`;
}
function EA(){ return join(An(),"projects") }
function jM(e){ return join(EA(), gv(e)) }
```

A second independent copy of the same logic sits in the same bundle
(`wvc` / `Avc = 200`), corroborating the constant. Both copies and `Cee=200`
re-verified 2026-08-12.

And the cwd that reaches `gv()` has already been **realpath-resolved**:

```js
function qu(e){ return e }                                   // identity — but see Px
async function Px(e){ try { return qu(await S4.realpath(e)) } catch { return qu(e) } }
async function Zyi(e,t){ let r = await Px(e.cwd);            // session bootstrap
  process.chdir(r); let n = {originalCwd:r, projectRoot:r, cwd:r}; … }
function EJl(e){ return join(jM(e.cwd), `${e.sessionId}.jsonl`) }
```

Four things follow, all of which the app gets wrong today:

1. **Every** non-alphanumeric character becomes `-` — not just the four the app
   handles. `_` and `.` are replaced, not preserved.
2. **Slugs longer than 200 characters are truncated and suffixed with a base36
   hash** — of the *original* path, not of the slug. A fix that only widens the
   character class reproduces this same defect for deep paths.
3. **CC slugs the `realpath` of the cwd, not the cwd it was given.** `qu()` is
   genuinely the identity function (two `qu` definitions exist in the bundle; the
   one in `Px`'s scope is `function qu(e){return e}`, the other is a highlight.js
   language definition) — but it is never reached with a raw path. `Zyi` realpaths
   at bootstrap, chdirs there, and records *that* as the session cwd. So any
   project folder reached through a symlink gets a CC directory keyed by the
   resolved path, while the app slugs the unresolved `sessionInfo.cwd`. **This is
   the same bug one indirection out, and a character-class-only fix does not
   close it.** Corroboration from our own tree: Android's
   `SyncService.getCurrentSlug` already calls `canonicalPath` "to resolve symlinks
   (e.g. /data/user/0 → /data/data)"; desktop has no equivalent.
4. Beyond `realpath`, the **Linux** build does **no** case folding, separator
   rewriting, or drive normalization. **Scope that to Linux deliberately:** every
   function above was read out of the Linux Bun executable, and the identity `qu`
   sits immediately beside UNC-path helpers
   (`function ad(e){return/^[\\/]{2}/.test(e)}`, `qJe` handling `\\?\` / `\\.\`) —
   exactly where a platform conditional would live. Whether the Windows build's
   `qu` is also the identity is **unverified**. This matters for §5.1's
   drive-uppercase step, which is *our* input normalization regardless; see risk 6.

For the reporting folder the two disagree:

```
app computes : -home-destin-YouCoded-Projects-PAF-574---Diversity,-Ethics,-&-Public-Change
CC writes to : -home-destin-YouCoded-Projects-PAF-574---Diversity--Ethics----Public-Change
```

`TranscriptWatcher.startWatching()` (`transcript-watcher.ts:389`) joins that
slug straight into the watch path with **no fallback directory scan**, so the
watcher polls a file Claude Code never creates.

**How much the on-disk evidence actually proves — read this before trusting it.**
Re-deriving `(cwd → directory)` for every **top-level** transcript in
`~/.claude/projects/` on the reporting device gives (re-measured 2026-08-12):

```
transcripts: 648   with a cwd anywhere: 648
gv(firstCwd) === dirname : 266 / 648
```

(A same-day later re-measure gave 652/652 and 268 — pure live-session drift: four
new transcripts, the first-cwd distribution's line-4 bucket grew by the same four.)

**Corpus definition, because the obvious command gives a different number.**
"Transcript" here means a top-level `~/.claude/projects/<slug>/<id>.jsonl` —
`find ~/.claude/projects -maxdepth 2 -name '*.jsonl'`. A plain
`find … -name '*.jsonl'` returns **1878**; the extra 1230 are *subagent*
transcripts under `<slug>/<sessionId>/`, which have no slug relationship to
verify. Anyone re-deriving these numbers must use `-maxdepth 2` or conclude the
analysis is wrong.

The ~382 mismatches are almost entirely materialized files carrying a *foreign*
`cwd` (`C:\Users\desti\…` sitting in a Linux project directory — risk 3, and it
is the majority of the corpus, not an edge case; 376 files have a drive-letter
first `cwd`). After excluding those, the agreeing set is ~266 and the only true
mismatches are the known-bad copies this spec is about plus the resume-replay
artifact in §9.2 — five copies + one artifact at first measurement, seven + one by
the later re-measure, because the orphan directory is **still gaining copies of the
live sessions** (§4 #4).

But agreement is nearly worthless as validation here, because **the app's rule and
CC's rule produce identical output for 16 of the 17 distinct cwds on this
device**. The whole corpus discriminates the two rules exactly once — the PAF
folder, via `,` and `&`. And **no session-originating (first) `cwd` on disk
contains `_` or `.`** — mid-file `cwd` values do (`llama.cpp`, `custom_components`,
`.worktrees`, …), but none of those ever created a CC directory — and no slug
approaches the 200-character cap (max observed 96). (All four re-verified exactly,
2026-08-12.)

So: the rule is trusted because it was read out of the binary, not because 266
directories agree with it. Everything beyond `,`/`&` — `_`, `.`, `(`, `+`, `'`,
`#`, the cap, and the `realpath` step — is **unconfirmed against a real
directory** and must be settled by the probe in §8, whose output becomes §7's
fixture. Do not present the on-disk agreement as validation of the character
class; that is the shape of mistake §2 is about.

### Why the symptoms look the way they do

| Symptom | Cause |
|---|---|
| Received messages never render in chat view | The transcript watcher is the *only* source of assistant text, tool calls, and tool results (`desktop/CLAUDE.md` → Chat View Data Flow). It emits nothing. |
| Terminal view is fine | That's the raw PTY stream; it never touches a slug. |
| Sending a message appears to work | `InputBar` dispatches `USER_PROMPT` optimistically; the user's own bubble does not depend on the watcher. |
| Only this one folder | It is the only folder under `~/YouCoded/Projects` whose name contains characters **on which the two rules disagree** (`,`, `&`). Two of the other three contain `-`, which is a fixed point of both rules — "outside the four handled characters" was the wrong test. |

---

## 2. This is a repeat, not a new bug

- **`77dc208f` `fix(chat): include spaces in cwd→project-slug encoding` (2026-04-23)**
  is the identical defect one character class short — same failure mode, same
  folder family (`PAF 540 Final Data Project`).
- **`57be5e14` (2026-07-12)** and **`f1b8e398`** fixed the *reverse* direction
  (greedy slug-walk resuming hyphenated folders from `$HOME`).

**Why the April fix did not hold:** every test asserts *the app's own rule*
rather than Claude Code's observed behavior. Verified across **both** test files
that cover this function — `tests/transcript-watcher.test.ts:290-303` **and the
co-located `src/main/transcript-watcher.test.ts:148-168`** — plus
`CwdToProjectSlugTest.kt`: none contains an external anchor of any kind. A wrong
rule pinned by a test that agrees with it stays green forever. Any fix that does
not change what the tests are anchored to will be the third occurrence — which is
why §7's fixture comes from directories Claude Code itself created rather than
from hand-written expectations.

**The same trap has a second mouth, and this spec nearly walked into it.** A
fixture harvested from *this device's existing* directories would also be green
against the current buggy code, because 16 of its 17 distinct cwds encode
identically under both rules (§1). "Anchored to CC" is only meaningful if the
anchor is a case where the two rules disagree — hence the probe in §8.

---

## 3. The structural trap: one function, two jobs

`cwdToProjectSlug` serves two unrelated purposes:

1. **Mirroring Claude Code's encoding** — `~/.claude/projects/<slug>/`. The only
   correct rule here is whatever CC actually does, bug-for-bug, collisions
   included.
2. **Naming YouCoded's own private directories** — `~/.youcoded/sessions/<slug>/`,
   `~/.youcoded/permissions.json`. The rule only has to be stable; nothing
   external depends on it.

Job 1 is broken. **Job 2 is working**, because it writes and reads with the same
function and does not care that the rule is idiosyncratic.

> **Widening the shared function fixes job 1 and destroys job 2's existing data.**
> Verified on the reporting device: `~/.youcoded/sessions/-home-destin-YouCoded-Projects-PAF-574---Diversity,-Ethics,-&-Public-Change/`
> holds **6 native session transcripts** under the buggy slug. A naive widening
> orphans all six, and separately drops every remembered "Always allow" rule in
> `permissions.json`.

The fix is to **split** the function, not widen it. Split correctly, there is no
native-store migration at all.

---

## 4. Blast radius

### Confirmed on disk (re-measured 2026-08-12)

| # | Impact | Evidence |
|---|---|---|
| 1 | **Chat view receives nothing** for the affected folder | Watcher path does not exist; CC's real directory holds the live transcript |
| 2 | **Project memory is invisible, and it is not empty** | `…-Diversity--Ethics----Public-Change/memory/` holds `MEMORY.md` and `final-project-deck-v2.md`, both live and growing (214 B / 2,323 B as of 22:51). `project-context.ts:88` slugs the buggy path and `:94` joins the memory dir from it, so the Memory group shows nothing while real memory exists. |
| 3 | **6 native transcripts sit under the buggy slug** in `~/.youcoded/sessions/` | Directory listing; these are app-owned and currently *working* |
| 4 | **An orphan duplicate CC directory holds partial copies — and is STILL GROWING** | Created by the conversations materialize path (`service.ts:312` → same buggy function). First measured at 3 copies (277/378 lines, 384/385, 14/15); the same-day re-measure found **5** — the materialize path had added copies of the two live sessions in the interim. Every checked pair is a strict subset (0 orphan-only uuids in all 4 pairs checked, `26d919ff` included — §6.3's check passes). The growth is why §6.3 must not run before the code fix ships. |
| 5 | **One PAF transcript has forked into the `$HOME` project directory, and the fork is BIDIRECTIONAL** | `~/.claude/projects/-home-destin/26d919ff…` (488 lines / 364 uuids) vs 378 lines / 276 uuids in CC's correct directory. **74 uuids exist only in CC's copy and 162 only in the `$HOME` copy** — both were appended concurrently. It is also **mixed-`cwd`**: line 4 records the PAF folder, line 279 switches to `/home/destin` and stays. `3c36fd7e…` also sits there but is **md5-identical** (`496a92d6…`, 13,601,562 B, separate inode) to the correct copy — a duplicate, not a fork. Treat the three cases differently (§6.0). |
| 6 | **The PAF project is scattered across three sync-space keys** | Its 8 sessions: **5** records under `projectName: 'Change'`, **2** under `'destin'` (`26d919ff` and `3c36fd7e` — the two largest, 5.5 MB and 13.6 MB), and **1** (`1925e5ab`, the live session) with — at first measurement — no record at all (it has since gained a slug-only `Change` record; membership drifts while the session lives, re-derive at repair time). `claude/transcripts/Change/` held 7 files then; the 7-vs-5 gap is exactly the two `destin` records. See below. |
| 7 | **The `Change` bucket was fed FROM the orphan, not from CC's real directory** | Byte sizes: `Change/26d919ff` = 3,365,926 B — identical to the **orphan** copy, while CC's real one is 4,409,708 B. Same for `3c36fd7e` (13,601,219 vs 13,601,562). Meanwhile `destin/26d919ff` = **5,532,831 B**, the largest copy anywhere. |
| 8 | **Reverse resolution cannot invert the slug** — resolves to a nonexistent path | `walkSlugParts('/', parts)` → `/home/destin/YouCoded/Projects/PAF-574-Diversity-Ethics-Public-Change`, `exists: false`. `session-manager.ts:70`'s `existsSync(cwd) ? cwd : homedir()` then masks it to `$HOME` |

**All counts above drift while the session is live.** Re-derive every one of them
at repair time (§6).

Note that #6 is exactly the failure `reconciler.ts`'s own comment predicts: *"a
mismatched reconciler key produces an ORPHAN duplicate space transcript and a
cross-device materialize gap."*

**#5 is the same mechanism as #8, except it has already produced forked data
rather than merely resolving to a bad path.** The repair must handle three
directories, not two.

**#6 forces the repair to be session-scoped, not bucket-scoped.** `Change` is a
truncation artifact and can be retired wholesale. **`destin` cannot** — it is a
*legitimate* bucket holding ~60 transcripts from real `$HOME` sessions, of which
exactly two are mis-filed PAF sessions. Any repair phrased as "re-key bucket X"
either misses those two or destroys 58 correct records. §6.2 therefore iterates
sessions and asks per session where each belongs.

**#6 also sits in a messy field.** The claude lane has 90 buckets, dozens of them
truncation fragments (`0450c0753b31`, `1hKRE9ix0j`, `haeC6W`, `dev`, `proj`,
`web`, `Temp`, `probe`, …). Most are unknown-path fallbacks working as designed.
The repair is scoped to the *sessions* provably attributable to this bug — it is
not a general cleanup. Note there is **no correct `PAF 574 …` bucket in the claude
lane to merge into**; it must be created. (The native lane has one, see below. A
`PAF 540 Final Data Project` bucket does exist in the claude lane — that is the
April bug's folder, whose name happened to survive the four-character rule.)

Counter-example confirming the diagnosis: the **native** lane keys by
`basename(cwd)` and is correctly filed as
`native/transcripts/PAF 574 - Diversity, Ethics, & Public Change/` (5 files).

### A store record is not an escape — for two sessions it is the harm

An earlier draft claimed conversations with a store record escape the bug, because
`resolveLocalProject` tries `originalPath` first "and that exists on the same
machine." **That is backwards for the two worst-affected sessions.** Measured:

```
26d919ff  projectName 'destin'  originalPath '/home/destin'  transcriptRef claude/transcripts/destin/…
3c36fd7e  projectName 'destin'  originalPath '/home/destin'  transcriptRef claude/transcripts/destin/…
```

`/home/destin` **exists**, so `resolveLocalProject` succeeds — and resumes the
session into the wrong project, where CC re-slugs to `-home-destin` and forks
again. The record has enshrined the bad path; it is the mechanism that keeps #5
recurring, not a safeguard. §6.2 must repair records, and §11 must check them.

Genuinely unaffected: sessions whose `originalPath` was recorded from a cwd that
was already correct. Slug-only rows (`originalPath: ''` — the other five PAF
records) do not escape and land in `$HOME` via #8.

### Latent (no data lost yet)

- `chatsearch-index/index-service.ts:233`, `sync-spaces/import-project.ts:233-234`,
  and `artifacts/projects-index.ts:123` route through the same broken rule.

### Android: the chat path is unaffected — sync is NOT

The **transcript/chat path** never derives the slug. It takes `transcript_path`
straight from the CC hook payload (`EventBridge.kt:101-103` →
`ManagedSession.kt:663-666` → `startWatching(id, transcriptPath)`), and
`parser/TranscriptWatcher.cwdToProjectSlug` has **zero production call sites** —
the only references outside its own file are a doc comment in `SyncService.kt:228`
and its own unit test.

An earlier revision concluded "Android is not affected" from that, and it is
**wrong**. `SyncService.getCurrentSlug()` derives a `~/.claude/projects/<slug>/`
name in production at three of its four call sites, and all three are silently
broken today, because the Android home dir
(`/data/data/com.youcoded.app/files/home`) contains dots — which CC collapses to
`-` and the app's rule preserves:

- `pushSession` (`SyncService.kt:1523-1526`) builds
  `projects/$slug/$sessionId.jsonl` and returns if it does not exist — with the
  dotted slug vs CC's dashed directory, **session-end push never uploads
  anything**.
- `rewriteProjectSlugs` (`:1380-1392`) `mkdirs` the dotted slug directory and
  symlinks foreign-device sessions into it — a phantom directory CC never reads.
- `aggregateConversations` (`:1410-1416`) requires that phantom directory to
  exist, so `/resume`-from-home aggregation targets a directory CC's own
  `/resume` does not read.

The fourth site (`:1276`, `updateConversationIndex`) stamps the slug into
`conversation-index.json` as a cross-device key — that one is the frozen job.
See §5.3 for the split.

---

## 5. Design

### 5.0 Primary fix: stop deriving the watcher's path at all

Desktop's watcher is started from the same hook event that carries
`transcript_path`:

```
ipc-handlers.ts:2729   hookRelay.on('hook-event', (event) => { …
ipc-handlers.ts:2800     transcriptWatcher.startWatching(desktopId, claudeId, sessionInfo.cwd)
ipc-handlers.ts:2803     noteSessionStarted(claudeId, sessionInfo.cwd, 'claude')
```

**`transcriptWatcher.startWatching` has exactly ONE call site in the whole tree**
(verified repo-wide: `rg 'transcriptWatcher\.startWatching' src/main` returns
`ipc-handlers.ts:2800` and nothing else — grep the *qualified* name: a bare
`rg 'startWatching\('` also hits an unrelated **local topic-file watcher of the
same name** at `ipc-handlers.ts:2649`, called at `:2795`). There is no second
entry point to keep in sync.

`hook-relay.ts:35` stores the raw hook JSON unmodified (`payload: parsed`) and
`hook-scripts/relay.js` forwards stdin verbatim, adding only
`_desktop_session_id`. CC's base hook schema has both fields as **required**
(recovered from the bundle: `transcript_path:O(),cwd:O(),prompt_id:O().optional()`)
and the emitter fills them (`transcript_path:IU(n),cwd:Yt(),prompt_id:uQe()`). So
`event.payload.transcript_path` *and* `event.payload.cwd` are both available at
that call site today.

**Change `startWatching` to take the transcript path when the hook supplies one,
falling back to slug derivation only when it is absent.** For the life-or-death
symptom this is strictly better than any mirror: no character class to get wrong,
no 200-character branch, no drift the next time CC changes its encoding, and it
is the design already proven on Android.

The subagents directory rides along — it is
`<dirname(transcript_path)>/<claudeSessionId>/subagents`, derived from the same
path rather than from the slug. (Verified against today's layout:
`claudeConfigDir/<slug>/<claudeSessionId>/subagents` and
`claudeConfigDir/<slug>/<claudeSessionId>.jsonl` share a parent.)

**Also switch the two `sessionInfo.cwd` arguments at `:2800`/`:2803` to
`event.payload.cwd`.** That is CC's own cwd — post-`realpath`, post-`chdir` — so
it is the exact string CC slugged. Using it dissolves §1's point 3 (the symlink
hazard) at both the watcher fallback and the store's `originalPath`, without a
`realpath` call anywhere in our code. Keep `sessionInfo.cwd` only as the fallback
when the payload field is missing.

**The test seam moves, and §7 must follow it.** `TranscriptWatcher`'s constructor
takes `claudeConfigDir` purely so tests can point it at a tmpdir, and every
existing watcher test builds its fixture path through `cwdToProjectSlug(cwd)` +
that dir (`tests/transcript-watcher.test.ts:331, 374, 416, 433, 470, 510, 541, 646`).
Taking `transcript_path` from the hook bypasses that seam entirely. Those tests
must be rewired to pass an explicit transcript path, or the change ships with the
*fallback* as the only covered path — which is precisely the "a wrong rule pinned
by a test that agrees with it" trap §2 exists to prevent.

The mirror below is still required, because the other call sites have no hook to
ask (project memory, conversation materialize, reconciler, chatsearch, import).
So §5.1's rule must be correct regardless; §5.0 removes the *most damaging*
dependency on it and leaves the mirror as defense-in-depth.

### 5.1 Split the function

- **`ccProjectSlug(cwd)`** — faithful CC mirror, including the 200-character cap
  and hash suffix, **and** the existing Windows uppercase-drive normalization.

  ```ts
  // Mirrors Claude Code 2.1.228's project-directory encoding, bug-for-bug.
  // Extracted from the shipped binary. CC applies NO normalization to the path
  // first (its qu() is the identity function, at least in the Linux build) —
  // the drive-uppercase step is OUR input normalization for YouCoded's
  // canonicalizer emitting `c:/…`, NOT part of CC's rule. Do not delete it as
  // "unfaithful": without it, project-filtered conversations and the Memory
  // group come back EMPTY on Windows.
  const CC_SLUG_MAX = 200;

  function ccHash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  export function ccProjectSlug(cwd: string): string {
    const p = cwd.replace(/^([a-z]):/, (_m, d) => `${d.toUpperCase()}:`);
    const slug = p.replace(/[^a-zA-Z0-9]/g, '-');
    return slug.length <= CC_SLUG_MAX
      ? slug
      : `${slug.slice(0, CC_SLUG_MAX)}-${ccHash(p)}`;
  }
  ```

  Three notes on that body, each of which someone will otherwise "fix" wrongly:

  - **There is no `Math.abs` edge case.** `(h << 5) - h + c | 0` is signed 32-bit
    with wraparound, so `h` can be `-2147483648` — but `Math.abs` takes a Number
    (a double), not an int32, so `Math.abs(-2147483648) === 2147483648`
    (`"zik0zk"` in base36; digit-checked by hand). The int32-min trap that exists
    in C and Java does not exist here. Do **not** add a guard; CC has none and
    adding one breaks the mirror. Pin `ccHash` output for a known input instead.
  - **The hash input is `p`, the drive-normalized path — deliberately.** It only
    ever matters above 200 characters, and it means we hash what we are pretending
    CC saw. It is a divergence from CC on genuinely-lowercase-drive input, for the
    same reason the normalization itself is (see risk 6).
  - **No `\` → `/` pre-pass.** Every separator maps to `-` regardless, so today's
    first `.replace()` is dead under this rule. Delete it rather than carrying it
    forward, so nobody reads it as load-bearing.

  **Symlinks: decide this explicitly.** CC slugs `realpath(cwd)` (§1 point 3).
  With §5.0's `event.payload.cwd` switch, the watcher and the store both get CC's
  already-resolved string and the question is moot for them. The other call sites
  (project memory, reconciler, chatsearch, import) take a *user-supplied* project
  path that has not been through `realpath`. Either resolve there —
  `fs.realpathSync.native(p)` inside a `try`, falling back to `p` exactly as CC's
  `Px` does — or record in the WHY comment that symlinked project folders are a
  known unhandled case. Do not leave it unstated: it is this same bug, one
  indirection out.

- **`nativeStoreSlug(cwd)`** — today's exact four-character rule, **frozen**,
  renamed so its job is unmistakable, with a WHY comment stating that it names
  app-private directories and that changing it orphans user data.
- **Delete the `cwdToProjectSlug` export** so no future call site can pick the
  wrong one by default. Full importer list in §5.2.

### 5.2 Call-site routing

**How the completeness of this table was established — the name grep alone is not
it.** A future inline re-implementation would evade
`rg 'cwdToProjectSlug|ccProjectSlug'` by construction. (Today's nearest miss,
`artifacts/projects-index.ts:122-123`, is NOT such a case — it imports
`cwdToProjectSlug` by name and inlines only the drive-normalize half, so the name
grep does find it; an earlier draft claimed otherwise.) Completeness rests on a
**shape** search instead: `rg 'replace\(/\[\^|replace\(/ /g|\^\(\[a-z\]\):' src/main`
plus a sweep of every `~/.claude/projects` path construction in `src/main`. Those
turn up no further slug derivations — the remaining hits are theme/artifact path
normalizers, the out-of-scope slugifiers §10 lists, and pure path *validators*
(`ipc-handlers.ts:927,1057`; `remote-server.ts:1228,1656,1683`) that `readdir` the
directory rather than derive a name. Re-run the shape search, not the name grep,
if this table is ever re-verified.

| → `ccProjectSlug` (mirror CC) | → `nativeStoreSlug` (frozen) |
|---|---|
| `transcript-watcher.ts:389` (in `startWatching`, `:384`; fallback only after §5.0) | `conversations/service.ts:310` (native lane) |
| `project-context.ts:88` (memory dir, joined at `:94`) | `ipc-handlers.ts:152` |
| `conversations/service.ts:312` (claude lane) | `harness/session-store.ts:64,92,173,183` / `NativeHome.sessionPath()` |
| `conversations/reconciler.ts:48` (`buildSlugToName`) | `harness/permission-store.ts:37,42` |
| `chatsearch-index/index-service.ts:233` | `chatsearch-index/index-service.ts:245` (native lane) |
| `sync-spaces/import-project.ts:233-234` | `session-browser.ts:31` (`nativeJsonlPath`) |
| `session-browser.ts:543,545,560` | `session-browser.ts:541,565` (native branch) |
| `artifacts/projects-index.ts:123` | |
| `project-conversations.ts:87,107` | |
| `ipc-handlers.ts:2106` | |

**The real counts, for the checklist:** `cwdToProjectSlug` has **nine** production
importers (`projects-index`, `chatsearch-index/index-service`,
`conversations/service`, `permission-store`, `session-store`, `ipc-handlers`,
`project-context`, `project-conversations`, `session-browser`) plus the five test
files below. `ccProjectSlug` (the existing wrapper) has **six** importers of its
own (`reconciler`, `import-project`, `index-service`, `conversations/service`,
`ipc-handlers`, `session-browser`) and **two** private re-implementations
(`project-context.ts:17`, `projects-index.ts:122`). An earlier draft said "six
importers" — that number was wrong on both axes.

Two sites need more than a re-route:

- **`artifacts/projects-index.ts:122-123` re-implements `ccProjectSlug`
  privately** — it imports `cwdToProjectSlug` and inlines the drive-normalize
  half, so a grep for `ccProjectSlug` does not find it (a grep for
  `cwdToProjectSlug` does). Replace the private copy with the shared mirror
  import.
- **`harness/permission-store.ts` carries TWO comments that are now actively
  wrong** — `:9-11` (*"the slug MUST match CC's project-dir encoding exactly (one
  function, one convention)"*) and, more emphatically, `:20-26` (*"This is
  inherited from CC's project-dir encoding deliberately — do NOT diverge here; the
  whole point of importing `cwdToProjectSlug` is one convention everywhere."*). It
  keys `~/.youcoded/permissions.json`, which nothing external reads. Routing it to
  the mirror silently drops every remembered "Always allow" rule. Delete or invert
  **both** comments in the same commit as the re-route; leaving either will point
  the next reader back at the mirror.

Other comments describing the old divergence, all of which need updating in the
same commit: `harness/session-store.ts:11`, `session-browser.ts:5-15`,
`conversations/service.ts:301-307`, `chatsearch-index/index-service.ts:241-242`,
`ipc-handlers.ts:147`.

`project-conversations.ts:26`'s existing `ccProjectSlug` wrapper becomes the real
mirror rather than a drive-normalizing pass-through, and the duplicate private
copy in `project-context.ts:17` imports it instead.

**Deleting the export breaks five test files.** They are not optional cleanup —
`tests/session-store.test.ts:247-254` in particular *pins the divergence between
the two encodings by name* and is the closest thing to an existing freeze test for
job 2; rename it, do not delete it.

```
src/main/transcript-watcher.test.ts   (own describe at :148-168)
tests/transcript-watcher.test.ts      (:290-303 and the 8 fixture sites in §5.0)
tests/session-browser.test.ts         (:6, 78, 87, 656, 684)
tests/session-store.test.ts           (:247-254)
tests/conversations-service.test.ts   (:16, 779)
```

### 5.3 Android

- **`parser/TranscriptWatcher.kt:60` (`cwdToProjectSlug`) — delete it**, along
  with `CwdToProjectSlugTest.kt` **and the watcher's unused `projectsDir`
  constructor param** (`TranscriptWatcher.kt:27`, supplied at
  `SessionRegistry.kt:53-54`, referenced nowhere else in the file). It has no
  production callers; Android reads `transcript_path` from the hook. Mirroring
  the new rule into dead code makes it harder to remove later and creates a
  false impression of parity coverage.
- **`runtime/SyncService.kt:231` (`getCurrentSlug`) — RE-KEY everything to the
  CC mirror; no freeze.** (Decision by Destin 2026-08-12, resolving the §8 open
  question after the Task 9 investigation.) Two earlier revisions each fell to
  a false premise: "freeze" assumed the slug is an opaque sync key (false —
  three of four call sites construct `~/.claude/projects/<slug>/` paths, §4),
  and the "split" revision assumed freezing the `conversation-index.json` stamp
  (`:1276`) preserves peer sync state. The investigation refuted that too:
  - The index slug **is resolved as a real path** on restore:
    `pullDriveConversationsRecent` (`:1042-1095`) uses each entry's `slug`
    verbatim to build the remote fetch path (`conversations/<slug>/<sid>.jsonl`,
    `:1074`) AND the local placement under `~/.claude/projects/` (`:1080`).
  - The remote `conversations/` corpus is **already keyed by CC's real slugs**:
    the bulk backup (`:680-697` Drive, `:813` GitHub) mirrors the actual local
    `projects/` dirs — the names CC itself wrote — not `getCurrentSlug()` output.
  - The frozen stamp is the disconnected party, not the protected one:
    `pushSession` (`:1524-1526`) looks for `projects/<frozenSlug>/` which never
    exists on Android (home has dots) and returns early — session-end push has
    **never worked** — and the recent-50 restore fetches remote paths that the
    bulk push never creates, so it silently pulls nothing for Android entries.
  - Re-keying orphans nothing: the slug is per-entry data merged by sessionId
    (`mergeConversationIndex`, `:1328-1356`); old entries keep their old slugs
    and stay coherent with wherever their files were actually pushed. The only
    invariant that matters is stamp-and-push-target agreeing **within one
    device at one time** — which re-keying preserves and freezing breaks.

  So: every `getCurrentSlug()` call site — the index stamp (`:1276`), the
  directory ops `rewriteProjectSlugs` (`:1384`) / `aggregateConversations`
  (`:1414`), and `pushSession`'s local lookup AND remote target (`:1524`,
  `:1539`, `:1548`) — moves to a Kotlin `ccProjectSlug` mirror (full rule, cap
  included), anchored to the **same §8 probe fixtures** as desktop, never to
  the TS implementation. Where the hook-supplied `transcript_path`
  (`EventBridge.getTranscriptPath`) is still available at session close,
  `pushSession` prefers it over any derivation, per §5.0's design. Fix the doc
  comment (`:226-229`), which claims the old rule matches CC's algorithm. Note
  `getCurrentSlug` already calls `canonicalPath` "to resolve symlinks" — the
  one place in the codebase that gets §1 point 3 right, by accident of a
  different requirement; keep that step.

Net: after this change there are **two** live implementations of the CC mirror —
desktop TS and Android Kotlin — both pinned to the same externally-generated
fixtures (§7/§8), never to each other. The previous "three hand-mirrored copies"
framing was the trap because the copies were anchored to nothing; a shared
external anchor is the fix, not implementation count alone.

### 5.4 Two ownership rules — R1 and R2

Reading a `cwd` out of a transcript answers **two different questions**, and an
earlier draft used one phrasing for both, producing opposite answers on the very
file §6 exists to repair. Name them, define them once, and cite them everywhere.

Both share the same mechanics:

- **Scan forward for `cwd`, do not read the head line.** CC 2.1.228 writes
  `last-prompt`, `mode`, and `permission-mode` metadata lines first. Across all
  648 transcripts here, the first line bearing a `cwd` is line 1 exactly **once**;
  the distribution is `{1:1, 2:175, 3:47, 4:359, 5:53, 6:12, 49:1}`. A `head -1`
  implementation returns nothing on 647 of 648 files.
  **The 200-line scan cap applies to R2 ONLY** (first-cwd search; observed max is
  line 49, with headroom). **R1 must scan the whole file** — it selects by
  `=== dirname` and the matching value can appear arbitrarily late: in
  `-home-destin/26d919ff…` the `/home/destin` cwd first appears at **line 279**.
  An earlier draft applied the cap to both rules, which silently falsified R1 on
  the very file this spec exists to repair.
- **Skip foreign-platform values.** A `cwd` matching `/^[A-Za-z]:/` on Linux (or a
  POSIX absolute path on Windows) is a materialized transcript from a peer device —
  376 of 648 files here. Never resolve one (risk 3).

They differ in what they select:

> **R1 — "which path does this slug directory encode?"**
> Used by the reverse resolution (§5.4a option 1). Scan **every** `cwd` value in
> the file (not just the first, not just the last) and accept one only when
> `ccProjectSlug(cwd) === dirname`. This is exact rather than inferential, and it
> is what CC itself does (`jGe` / `nPc` in the same bundle: `readdir`, read each
> transcript, compare `dpo(cwd)` — preferring a `relocated` / `relocatedCwd`
> marker in the tail when present).
>
> **"Any transcript in the directory" is wrong** — a directory's transcripts do
> not share one `cwd`. `-home-destin` holds 59 transcripts of which **2** carry
> the PAF folder's cwd; `…-CookinOnLowHeat` holds 32 of which **31** carry a
> Windows cwd. Only 266 of 648 transcripts sit in a directory their own first
> `cwd` re-slugs to. The `=== dirname` filter is what makes R1 safe.
>
> **R2 — "which project does this session belong to?"**
> Used by the data repair (§6). Take the **first** non-foreign `cwd` in the file.
> A session's origin is where it belongs; a *later* cwd change inside one
> transcript is the bug being repaired (a resume masked to `$HOME`), not a
> legitimate relocation, so it must not win.

**Why the distinction is not academic.** On
`~/.claude/projects/-home-destin/26d919ff…jsonl`:

```
line 4    cwd = /home/destin/YouCoded/Projects/PAF 574 - Diversity, Ethics, & Public Change
line 279  cwd = /home/destin      (and stays there to EOF)
```

R1 asked of the `-home-destin` directory correctly answers `/home/destin` (that
value re-slugs to the directory name). R2 asked of this **file** correctly answers
the PAF folder. A rule that said "prefer the last `cwd`" — as an earlier draft's
risk 2 did — would answer `/home/destin` for both and leave the fork unrepaired
forever. Risk 2 is rewritten accordingly (§9.2).

**Case sensitivity:** R1's `===` is case-sensitive, while `buildSlugToName`
(`reconciler.ts:45`; set/get sides lowercased at `:48`/`:61`) deliberately
lowercases both sides to tolerate Windows folder-case drift, pinned by
`conversation-reconciler.test.ts:271-285`. R1 must
match that convention — compare lowercased — or the two subsystems disagree on
Windows.

### 5.4a Stop the reverse direction from guessing

`walkSlugParts` (`session-browser.ts:147`) inverts by trying `-`-joined splits.
The encoding collapses spaces, commas, and ampersands all into `-`, so splitting
cannot recover the original — and for a slug over the 200-character cap the tail
is a hash, so there is nothing to split at all.

**Change, in preference order:**

1. **Read the recorded `cwd` — rule R1 above.** Exact, not inferential. **This is
   the only option that works above the 200-character cap** (see below) — and it
   must compare with the *capped* `ccProjectSlug`, not a raw character-class
   pass: CC's own resolver (`nPc` in the bundle) compares the **uncapped**
   `dpo(cwd)` against the dirname, so CC itself silently fails to re-resolve
   over-cap directories. Mirror the write rule (`gv`), not CC's comparison bug.

2. **Forward re-slug of on-disk candidates.** Forward is well-defined, so this
   inverts reliably where splitting cannot — but the comparison is per-*level*,
   not per-path. At each level, for each child directory `c` that exists, test
   whether `dpo(basename(c))` is a prefix of the remaining slug terminated by `-`
   or end-of-slug; recurse on a match, and confirm the terminal candidate with
   `ccProjectSlug(fullPath) === slug`. (`ccProjectSlug(candidate) === segment`
   cannot work — slugging a whole candidate path yields a whole slug, never a
   segment.)

   **Enumerate candidates longest-`dpo`-first, and BACKTRACK on failure.** This is
   not an optimization. With siblings `a` and `a-b`, matching `a` first descends
   the wrong subtree — the identical failure `57be5e14` fixed, which is why
   `walkSlugParts` carries a comment block about trying the longest leading
   segment first. Unlike `walkSlugParts` (which terminates at whatever exists), a
   per-level match here can succeed locally and dead-end several levels down, so
   the recursion must unwind and try the next candidate.

   **Above the 200-character cap this option cannot work at all — do not try.**
   `gv` truncates the *slug* at 200, which lands mid-segment, and past that point
   the slug carries **zero** information about deeper components. "Confirm with
   `ccHash(candidate) === tail`" is therefore not a confirmation step but an
   unbounded depth-first search over every descendant of the last fully-matched
   directory, hashing each. Option 2 must **detect a capped slug (a trailing
   `-<base36>` after exactly 200 characters) and decline**, returning "unresolved"
   so the caller falls through — never a wrong path. Capped slugs are resolved by
   option 1 or not at all.

3. **Longest-first split**, unchanged, as the last resort so behavior is
   identical for folders that already resolved.

---

## 6. Data repair (one-time, idempotent)

Run as a startup migration, guarded so it is safe to re-run. Every count in §4
drifts while sessions are live and **must be re-derived at repair time**.

### 6.0 Ground rules

**Never delete; quarantine.** No step unlinks a transcript. Anything this
migration would remove is *moved* to
`~/.youcoded/repair-quarantine/<ISO-8601 timestamp>/<original-relative-path>`,
and every decision (source, destination, line counts, uuid counts before/after,
which case applied) is appended to a plain-text log beside it. A repair on a
13.6 MB conversation running unattended at launch has to be reversible; unlink is
the wrong primitive.

> **The quarantine must live under `~/.youcoded/`, NOT inside
> `~/.claude/projects/`.** `reconciler.ts:101`, `symlink-sweep.ts:12`,
> `session-browser.ts:323`, and `sync-service.ts:634/772` all `readdir` the
> projects directory and treat every entry as a project slug. A quarantine folder
> placed there would be adopted as a project and re-reconciled — the bug, again,
> wearing a hat.

**Never union two transcripts.** An earlier draft prescribed "union by line
`uuid`, ordered by timestamp." That corrupts the file. Every message line carries
`parentUuid`, and CC's resume walks that chain from the tail. `26d919ff`'s two
copies diverge in **both** directions (74 uuids only in CC's copy, 162 only in the
`$HOME` copy — both were being appended concurrently), so a union produces a file
where two different children claim the same parent; which branch CC follows is
undefined and the other branch's turns become unreachable while still inflating
the file. The same applies to the order-dependent `file-history-snapshot` (11) and
`file-history-delta` (6) lines, and to the per-turn `last-prompt` / `mode` /
`permission-mode` / `ai-title` metadata.

**Classify every duplicate pair into exactly one of three cases, by content:**

| Case | Test | Action |
|---|---|---|
| **A — identical** | same content hash | Quarantine the copy in the wrong place. Keep the one in the correct directory. |
| **B — subset** | one file's uuid set ⊇ the other's | Keep the superset **in the correct directory** (moving it there if needed). Quarantine the subset. |
| **C — true fork** | neither uuid set contains the other | **Never automated.** Change nothing on disk. Snapshot both copies into the quarantine, log the uuid-difference counts, and surface a user-facing notice naming the session and both paths. |

Today `3c36fd7e` is case A, the orphan's three copies are case B (verified: 0
uuids unique to the orphan), and `26d919ff` vs `-home-destin` is case C. Decide
per file at run time, never by filename or byte size.

**Why case C is deliberately manual.** The safe automated options are all bad:
merging corrupts the parent chain, moving either direction loses turns, and
re-filing the divergent copy under a fresh session id leaves its internal
`sessionId` fields disagreeing with its filename. Two intact transcripts the user
can see beat one silently malformed 5.5 MB one. §5.0 stops new forks from
appearing; this one fork on this one device is a guided cleanup, not a migration
step. If a re-file *is* wanted later, it must be behind explicit user
confirmation, with the fresh-uuid caveat written down.

**Case C aftermath — specify the steady state, or §11 lies.** After §6.2 repairs
the store record, the reconciler resolves this session's project from the record
(`existing?.projectName` wins — `reconciler.ts:61`), so subsequent sweeps key
BOTH on-disk copies — CC's correct-directory copy *and* the untouched
`-home-destin` fork — to the project's bucket, where the add-only/shrink-guard
rules arbitrate. Two consequences the implementer must pin with a test rather
than discover: (a) the fork file remains in `-home-destin` **by design**, and
§11's checks carve it out explicitly; (b) two divergent copies now feed one
bucket file, and the shrink-guard must prevent the smaller from ever truncating
the larger. If the sweep turns out to key materialized files by *directory*
rather than by record, the `destin/` bucket would re-acquire the fork on every
sweep — verify which it is before the repair ships; do not assume.

**Order matters.** The sync-space repair (6.2) runs **before** the orphan
retirement (6.3), because §4 #7 established that the `Change` bucket was populated
*from* the orphan. Retiring first would leave the space's truncated copy as the
only surviving authority for a peer device.

### 6.1 `$HOME`-forked transcripts

For each **top-level** `.jsonl` in `~/.claude/projects/<ccProjectSlug($HOME)>/`
(direct children only — subagent transcripts live at `<sessionId>/subagents/`
below it and travel with their parent session, never independently; §1's
648-vs-1878 trap applies to this walk too), apply **rule R2** (§5.4). If the answer is a *different* known project folder, the file is
mis-filed. Compare it against that project's correct-directory copy and apply case
A / B / C from §6.0.

Note the ownership question here is R2, **not** R1 — `26d919ff`'s last `cwd` is
`/home/destin`, which re-slugs to the directory it sits in, so R1 would (correctly,
for its own purpose) call it a resident and R2 (correctly, for this purpose) calls
it a mis-filed PAF session. Citing the wrong rule here silently no-ops the whole
step.

Do not touch `~/.claude/projects/-home-destin/` beyond the specific files R2
identifies — it is a legitimate CC project directory with 59 transcripts, a
`memory/` folder, and subagent subdirectories from real `$HOME` sessions.

### 6.2 Sync space and store records — per session, not per bucket

Build the repair set by **session**, not by bucket: every session id whose R2 home
is a known project folder `P` but whose store record's `projectName` ≠
`basename(P)` (or whose record is missing). `Change` is a truncation artifact and
can be retired once empty; **`destin` cannot be re-keyed** — it holds ~60
legitimate `$HOME` sessions and exactly two mis-filed PAF ones (§4 #6).

Per session in the set:

1. Create `claude/transcripts/<basename(P)>/` if absent and move the session's
   space transcript there. Apply §6.0's case A/B/C against CC's real copy — the
   `Change` bucket's copies came from the orphan and are short (§4 #7), so a naive
   "space is newer" rule would re-truncate.
   **A space-only transcript is carried over unchanged.** `a943d85d` (164,291 B)
   exists in `Change/` with a store record and has **no copy in
   `~/.claude/projects/` at all**; "CC's real directory wins" is undefined for it.
2. **Repair the store record** — `projectName` → `basename(P)`, `originalPath` →
   `P`, `transcriptRef` → the new bucket path. This is the step that stops the
   `$HOME` fork recurring: `26d919ff` and `3c36fd7e` currently carry
   `originalPath: '/home/destin'`, which *exists*, so every resume succeeds into
   the wrong project (§4). Leaving the records alone leaves the bug live.
3. Sessions with **no** record get one created from R2, so the project's bucket
   ends up complete. (`1925e5ab` was the recordless example at first
   measurement; it has since gained a slug-only `Change` record — membership in
   this set drifts, re-derive it.)

Must honor the mirror's add-only / shrink-guard rules
(`.claude/rules/conversations.md`). Retire a source bucket directory only once it
is empty **and** its name is a truncation fragment — never `destin`.

### 6.3 Orphan CC directory

Retire `~/.claude/projects/<nativeStoreSlug(p)>/` when it differs from
`<ccProjectSlug(p)>/` for a known folder **and** the correctly-slugged directory
also exists. **Per-file case A/B/C check before moving each file** — the orphan
holds N partial copies (3 today, all case B), and any session existing only there,
or holding lines the correct copy lacks, must be preserved rather than dropped.
Quarantine per §6.0; do not `rm -rf` the directory.

**Run this only in a build where §5.0/§5.1 have already shipped.** The
materialize path was still creating fresh orphan copies of the live sessions as
late as the 2026-08-12 re-measure — retiring the orphan under the old code just
schedules its rebirth.

### 6.4 Native store — do not migrate

It stays on the frozen slug, as does `permissions.json`. This is the entire point
of the split.

### 6.5 Live sessions

A rename over an inode Claude Code is appending to loses turns — the same
constraint the existing materialize sweep documents. But the affected folder's
session *is* live, and skipping it leaves the reported data split across three
directories indefinitely. Resolve explicitly:

- Perform 6.1–6.3 for quiescent sessions at startup.
- **Define "live" mechanically** — the implementer must pick one and write it
  down: mtime within N minutes, an active sync lease, or a live PID. Do not leave
  this to a reader's judgement.
- For a session live at migration time, defer it and re-run on next launch —
  **with a bounded retry**. This particular session is resumed repeatedly, so an
  unbounded "try again next launch" may never find it quiescent. After N
  deferrals, surface it to the user rather than looping silently. Do not silently
  skip and never retry.

---

## 7. Guards

The tests that exist today would pass against the current bug, so new guards
must be anchored to external truth, not to our own rule.

- **Fixture of real `(cwd → directory)` pairs — HARVESTED *and* PROBED.** Walking
  `~/.claude/projects/` and keeping the pairs where `ccProjectSlug(cwd) === dirname`
  gives a regression net, and with the rule known it is a classification rather
  than a heuristic (the contamination warning in §9.1 no longer needs the
  `memory/`-subdirectory tell). **But it cannot produce the pairs that matter.**
  On this device: 17 distinct cwds, **zero** containing `_` or `.`, **zero** over
  200 characters, and exactly **one** that discriminates the app's rule from CC's
  at all. Harvesting alone would pin a fixture that the *current buggy code also
  passes.*

  So the discriminating pairs must be **generated by the §8 probe**, not
  harvested: one throwaway directory each for `_`, `.`, parens/`+`/`'`, a
  >200-character path, and a symlinked path (§1 point 3); one disposable session
  in each; commit the directory CC actually creates. A fixture that the pre-fix
  code passes is not a guard.
- **Cap-and-hash test.** Pin the >200-character branch — truncate the *slug* to
  200, hash the *original* argument. Pin `ccHash` output for fixed inputs, so a
  future reader cannot "fix" a nonexistent int32-min edge and break the mirror
  (**there is no such edge in JS** — `Math.abs(-2147483648)` is `2147483648`,
  `"zik0zk"` in base36; see §5.1). Pinning an input that actually hashes to
  int32-min is optional: no such string is known and one would have to be
  constructed — a WHY comment stating the fact plus ordinary fixed-input pins is
  enough.
- **Inversion tests**, using the reporting folder's name:
  - Under the cap: the new resolution returns the real path (option 2 succeeds).
  - **Over the cap: option 1 resolves it from a transcript's recorded `cwd`, and
    option 2 DECLINES rather than returning a path.** Assert both halves. The old
    split-based walk cannot satisfy the first; a naive prefix-matcher would fail
    the second by returning a plausible wrong path (§5.4a).
  - Option 2 backtracking: a fixture with sibling directories `a` and `a-b` where
    the correct answer is under `a-b`, asserting the walk does not commit to `a`.
- **R1/R2 test.** Pin the two rules on the shape that broke the earlier draft: one
  fixture transcript whose `cwd` first appears on line 4 (the modal case —
  359/648) and which then *switches* to a second `cwd` partway through. Assert R1
  asked of the second directory returns the second path, and R2 asked of the file
  returns the **first**. Plus a directory holding a mix of matching and foreign
  `cwd` values, asserting R1 picks the one that re-slugs to the directory name.
- **Merge-safety test.** Given two copies of one session that diverge in both
  directions, assert the repair classifies it **case C** and changes nothing on
  disk. Given a subset pair, assert case B keeps the superset. Given identical
  copies, assert case A. No test may produce a merged file.
- **Record-repair test.** A store record with `originalPath` pointing at `$HOME`
  for a session whose R2 home is a real project folder must be rewritten
  (`projectName`, `originalPath`, `transcriptRef`), and a resume from the repaired
  record must land in the project folder.
- **Native-store freeze test** asserting `nativeStoreSlug` output for a
  punctuated path is byte-identical to today's, so a future "cleanup" cannot
  silently orphan the native store or `permissions.json`. Rename — do not delete —
  `tests/session-store.test.ts:247-254`, which already pins this divergence.
- **Watcher-path test** asserting the watcher uses `event.payload.transcript_path`
  when present, and falls back to the mirror only when it is absent. **This
  requires rewiring the existing watcher tests** — they currently build fixture
  paths via `cwdToProjectSlug(cwd)` + the injected `claudeConfigDir`
  (`tests/transcript-watcher.test.ts:331, 374, 416, 433, 470, 510, 541, 646`), a
  seam §5.0 bypasses. Rewire them to pass an explicit transcript path; leaving
  them as they are means only the fallback is ever covered. The co-located
  `src/main/transcript-watcher.test.ts:148-168` needs the same treatment.
- **Kotlin mirror test.** §5.3 deletes the dead watcher copy but **adds** a live
  mirror for `SyncService`'s three directory operations. Anchor it to the same
  §8 probe fixtures as the TS mirror (same `(cwd → directory)` pairs, plus the
  dotted Android home path) — never to the TS implementation, never to its own
  output. An earlier draft said "no Kotlin parity test" because it believed
  nothing on Android derived the slug; that premise was false (§4).
- **Android sync-key freeze test** asserting the `conversation-index.json` key
  for the standard home path is byte-identical to today's dotted value, so the
  mirror work cannot silently re-key devices.

---

## 8. Open questions

Three remain; the character-class question that previously blocked this work is
resolved *from the binary* in §1 — but not from disk, which is the first item
below. The `$HOME`-fork causation question is now **closed**.

- **Everything beyond `,` and `&` is unconfirmed against a real directory.** The
  rule was read out of the binary, and the on-disk corpus discriminates it from
  the app's rule exactly once (§1). Unexercised by any directory here: `_`, `.`,
  parens/`+`/`'`/`#`, the >200-character cap, and the `realpath` step.

  **One probe settles all of them.** Create throwaway directories — one with `_`
  and `.` in the name, one with assorted punctuation, one whose slug exceeds 200
  characters, and one reached through a symlink — run a disposable session in
  each, and record the directory CC creates. Those become §7's fixture. This is
  the only evidence that will distinguish a correct fix from a third occurrence.

- ~~**What consumes the Android sync key?**~~ **Settled 2026-08-12 — the freeze
  premise was false, and Destin chose to re-key (see §5.3 for the full evidence
  chain).** The index slug is consumed as a real path by
  `pullDriveConversationsRecent` (`SyncService.kt:1061→1074→1080`); the remote
  corpus is already CC-real-keyed (bulk push `:695` uses `slugDir.name`);
  Android's per-session push has never worked (`:1524-1526` early-returns on a
  never-existing frozen-slug path). Re-keying the stamp to the CC mirror
  reconnects the loop and orphans nothing (slugs are per-entry, merged by
  sessionId). §5.3 rewritten accordingly; the sole remaining Android slug rule
  is the fixture-anchored `CcProjectSlug` mirror.

- ~~**How does the sweep key a materialized transcript after the record repair —
  by record or by directory?**~~ **Settled 2026-08-12 — the record wins.**
  `reconciler.ts:56-62` (`resolveProjectName`) short-circuits on
  `existing?.projectName` before the slug-derived fallbacks, and both call
  sites (`reconciler.ts:165`, `:177`) feed that name into `transcriptRef` and
  the `safeMirror` bucket. §6.0's case-C aftermath and §11's `destin/` check
  stand. Two side findings, both compatible with §6: (a) the *live*
  turn-complete mirror (`conversations/service.ts:362-380`) recomputes its
  bucket from `path.basename(ctx.cwd)` and never reads the record — benign,
  because §6.2 sets `projectName = basename(P)`, the same value; (b) the
  Resume Browser (`session-browser.ts:320-427`) lists sessions purely from
  directory scans — consistent, because §6 physically moves wrong copies
  rather than only rewriting records (and the case-C fork staying in
  `-home-destin` is §6.0's documented behavior). A pinning test lands with
  Phase 6 (plan Task 12): reconcile a tmp projects tree where the record says
  `RealProj` but a known folder competes for the same slug, assert the mirror
  bucket is `RealProj`; a no-record variant proves the fallback tier engages.

- ~~**Causation of the `$HOME` fork.**~~ **Settled — the app causes it.**
  `26d919ff` and `3c36fd7e` carry store records with `originalPath: '/home/destin'`
  (§4). That path exists, so `resolveLocalProject` succeeds and every resume of
  those two sessions runs CC in `$HOME`, where it slugs to `-home-destin` and
  appends there. No repro is needed, and §6.2's record repair is what stops it.

  **A note for whoever looks for that evidence in a log: it is not there.** An
  earlier draft suggested grepping the app's logs for `session-manager.ts:68`'s
  `resume … falling back to home` breadcrumb. That line is a bare `console.warn`,
  not the structured `log()` — `log()` writes to `~/.claude/desktop.log`,
  `console.warn` goes to Electron's stdout, and nothing in `src/main` overrides
  the console. Verified: `~/.claude/desktop.log` contains **zero**
  `session-manager` entries. **Convert that warning to
  `log('WARN', 'SessionManager', …)` as part of this work** — it was added
  deliberately as a regression breadcrumb (2026-07-12) and currently persists
  nowhere, which is a defect in its own right.

---

## 9. Risks and things that will bite the implementer

1. **The evidence source is contaminated.** The app's mis-slugged copies live in
   the same `~/.claude/projects/` tree as CC's real directories. A naive harvest
   picks them up and pins **the bug** as ground truth — this happened during
   investigation, where sort order let the orphan directory win a tie. With the
   rule known this is now mechanical (§7): keep only pairs that already agree.
   **The subtler version is that the surviving evidence is nearly vacuous** — it
   agrees with the buggy rule too (§1, §2). Contamination is the loud failure;
   non-discrimination is the quiet one, and it is the one that shipped in April.
2. **One transcript can hold more than one `cwd`, and "first" vs "last" is not a
   style choice.** A resumed session's early `cwd` lines are the *original*
   session's cwd (this produced one false mismatch in the validation sweep —
   `-tmp-ink-probe4b-sWJl6h` appearing under `-home-destin-youcoded-dev`), while a
   mid-file switch to `$HOME` is the bug itself. Do not reach for "prefer the
   last" or "prefer the first" ad hoc: use **R1** (match against the directory
   name) for inversion and **R2** (first non-foreign value) for ownership, per
   §5.4. An earlier draft of this spec got this wrong and would have no-opped §6.1
   entirely.
3. **Materialized transcripts carry foreign `cwd` values — and they are the
   MAJORITY, not an edge case.** Files synced from the Windows machine sit in
   Linux project directories while their `cwd` field still reads
   `C:\Users\desti\…`. Measured: 376 of 648 transcripts here have a drive-letter
   first `cwd`. No current call site derives a path from a transcript's `cwd`
   (verified — all use the live session's cwd), but R1, R2, and §6 all introduce
   ones that do. They must skip foreign-platform values rather than resolve them,
   and a half-hearted filter here will mis-resolve more often than it resolves.
4. **Cross-device tolerance.** Fixing the slug changes the reconciler's
   recovered `projectKey`, which changes the sync bucket. A peer still on the
   old build keeps writing `Change`. The repair must be merge-on-read and
   idempotent, not a one-shot assuming simultaneous updates.
5. **Collisions in the mirror are correct.** `Diversity, Ethics` and
   `Diversity--Ethics` produce the same slug, and so do two long paths sharing a
   200-character prefix and a hash. Those are Claude Code's collisions to own;
   deduping or "improving" them re-breaks the mirror.
6. **Windows drive-case normalization must ride along** into the new mirror or
   Windows project memory silently empties again. Note it is *ours*, not CC's
   (§1, §5.1) — and it assumes CC saw an uppercase drive. A session that genuinely
   ran with a lowercase-drive cwd got a lowercase slug from CC, and this step
   breaks that lookup. Pre-existing, not introduced here; record it rather than
   fix it blind.

   **But it may be redundant rather than compensatory.** CC realpaths the cwd
   before slugging (§1 point 3), and Windows `realpath` canonicalizes drive-letter
   case — so CC may never see a lowercase drive, making the broken-lookup case
   impossible in practice and this step a no-op that merely agrees with CC.
   Compounding the uncertainty: §1's `qu`-is-the-identity evidence comes from the
   **Linux** binary, and that `qu` sits beside UNC-path helpers, so the Windows
   build's behavior is genuinely unknown. One probe on the Windows machine (start
   a session from a `cmd` shell whose cwd prints as `c:\…`, then look at the
   directory CC creates) settles it. Worth doing before enshrining the caveat in a
   WHY comment that will outlive it.
7. **Android's reverse walk is already behind** (`SessionBrowser.kt`
   shortest-first, deferred per `.claude/rules/conversations.md`). Fixing
   desktop's inversion widens the gap for punctuated folders — record it,
   fixing it here is optional.
8. **Do not rename the affected folder as a workaround** if the fix is going to
   land. Renaming changes CC's slug again and strands the existing transcripts
   under the old one, which the repair in §6 would then have to chase.
9. **CC has its own project-relocation mechanism** — a `relocated` /
   `relocatedCwd` marker written into the transcript tail, which its resolver
   prefers over the head `cwd`. `sync-spaces/import-project.ts` instead renames
   the slug directory. These will interact eventually. Out of scope here; worth a
   ROADMAP line.

---

## 10. Out of scope

- Android `SessionBrowser.kt` reverse-walk parity (risk 7).
- Any change to how the native store or `permissions.json` names its directories.
- General cleanup of the ~85 sync-space buckets; only the *sessions* attributable
  to this bug are repaired (§6.2).
- Merging the case-C fork (§6.0) — quarantine-and-surface only; any re-file is a
  separate, user-confirmed action.
- Broader hardening of the other slugify helpers (`src/main/sync-state.ts`,
  `src/main/sync-spaces/space-manager.ts`, `src/main/harness/mcp/mcp-registry.ts`,
  `src/main/harness/tools/spill-paths.ts`) — different purposes, no CC-mirroring
  contract, not implicated here.

---

## 11. Verification checklist

### Code

- [x] `bash scripts/verify.sh <worktree>` green
- [x] §8 probe completed; `_`, `.`, punctuation, >200-character, and symlink
      pairs all recorded as fixtures — **and each one fails against the
      pre-fix code** (a fixture the old code passes is not a guard)
- [x] Chat view receives assistant messages in the reporting folder
- [x] Watcher uses the hook's `transcript_path`; fallback exercised by a test;
      **both** watcher test files rewired off the `claudeConfigDir` + slug seam
- [x] `event.payload.cwd` used at `ipc-handlers.ts:2800`/`:2803`, not
      `sessionInfo.cwd`
- [x] All **nine** `cwdToProjectSlug` importers updated, plus the six
      `ccProjectSlug` importers and both private inline copies (§5.2);
      `tests/session-store.test.ts:247-254` renamed rather than deleted
- [x] Both wrong `permission-store.ts` comments fixed (`:9-11` and `:20-26`)
- [x] `session-manager.ts:68` converted from `console.warn` to `log()`
- [x] Project memory resolves for the reporting folder — `MEMORY.md` and
      `final-project-deck-v2.md` both visible in the Memory group
- [x] R1 and R2 both pinned, including the mid-file `cwd`-switch fixture
- [x] Over-cap inversion: option 1 resolves it; option 2 **declines** rather than
      returning a path
- [x] Option 2 backtracks past a sibling `a` to reach `a-b`
- [x] All 6 native transcripts still reachable after the change (guard: `nativeStoreSlug` byte-identical to the historical rule — freeze pin in `slug-encoding.test.ts` + `session-store.test.ts`)
- [x] Remembered "Always allow" rules survive the change (same freeze guard; `permission-store.ts` routed to `nativeStoreSlug`, Task 3 review)
- [x] `./gradlew test` green; Kotlin `cwdToProjectSlug`, its test, and the unused
      `projectsDir` watcher param are gone and nothing references them
- [x] ~~Android `SyncService` split landed~~ **Superseded by the re-key decision (§5.3): every call site is on `ccHomeSlug()`; no frozen rule survives** — originally:: `pushSession`, `rewriteProjectSlugs`,
      and `aggregateConversations` resolve CC's real (dashed) directory for the
      dotted home path — pinned by a fixture test — and the
      `conversation-index.json` key is byte-identical to pre-change

### Data repair

- [x] The repair ran in a build that already contains the §5.0/§5.1 code fix —
      the materialize path was still creating fresh orphan copies as of
      2026-08-12 (§6.3)
- [x] **Nothing was unlinked.** Every removal landed in
      `~/.youcoded/repair-quarantine/<ts>/` with a decision log, and the
      quarantine is NOT under `~/.claude/projects/`
- [x] **No transcript was merged.** Every duplicate pair was classified A / B / C
      and the log records which; the case-C fork (`26d919ff`) is untouched on
      disk and surfaced to the user with both paths named
- [x] Sync space repair ran **before** the orphan retirement
- [x] Orphan CC directory retired; per-file case check logged; no session lost
- [x] `$HOME` project directory holds no foreign-R2 transcripts **except the
      surfaced case-C fork (`26d919ff`), which remains by design (§6.0
      aftermath)**; its 57 legitimate `$HOME` transcripts (59 total minus the
      two mis-filed), `memory/`, and subagent subdirs are intact
- [x] Sync space shows **one** bucket for the project containing **every** PAF
      session (8 as of 2026-08-12); no PAF session id remains in `Change/`;
      after the sweep re-keys off the repaired records none remains in `destin/`
      either — **as run 2026-08-15: one exception, `destin/26d919ff` holds the
      project-side fork copy (4,409,708 B) and is HELD by the fork hold until the
      user resolves the fork; every other PAF id is gone from `destin/`** (the case-C fork's mirror now feeds the project bucket — §6.0
      aftermath, §8's sweep-keying question settled); `destin/` still holds its
      ~58 legitimate `$HOME` sessions
- [x] The space's `26d919ff…` is a superset of the largest pre-repair copy by
      **uuid set** (byte size is not the test; the largest pre-repair copy was
      5,532,831 B in `destin/`, not the 4,409,708 B in CC's directory)
- [x] No PAF store record carries `originalPath: '/home/destin'`; all carry the
      real project path, and `1925e5ab` has a record
- [x] Resume from a repaired record lands in the real folder, not `$HOME`
- [x] Resume from a slug-only row lands in the real folder, not `$HOME`
- [x] "Live" has a written mechanical definition and the deferral has a bounded
      retry that surfaces to the user
