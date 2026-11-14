# Mesh crypto library: independent review (commits 6863d7a02, c70d4881b)

Reviewer: fresh agent, did not write the code. Review-only. Scratch proofs live in
`/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/crypto-review/`
(`poc-roster.js`, `poc-sas.js`, `poc-frames.js`, `poc-seen.js`; run against tsc output of the worktree source with node, nothing in the repo touched).
All paths below are under `youcoded/desktop/src/main/mesh/crypto/`.
Existing suite re-run: 13 files, 197 tests pass.

**VERDICT: SOUND TO BUILD ON: yes-with-fixes.**
The primitives and the CPace core are correct and well tested. The weaknesses are in what sits on top: the
roster verifier, the "matching number", and a few design contracts. None is exploitable today (nothing calls the
library), but findings 1-3 should be fixed before the transport/storage/UI layers depend on them.

Counts: critical 0, high 2, medium 5, low 5, informational 4.

---

## Findings

### 1. HIGH, demonstrated: any member can rebind another device's key-agreement key
`roster.ts:151-176` (`verifyRosterLog`, `add` branch). An `add` entry overwrites `devices[deviceIdFor(info.signKey)]`
unconditionally. Member C signs `add{signKey: A.signKey, agreeKey: C.agreeKey}`; the log verifies and the returned map now says
A's agreement key is C's. `keygen.ts` seals every future generation secret to the roster's `agreeKey`, so after a key rotation
C (or a removed device that is still allowed to sign, finding 3) receives the new secret that A was supposed to get, silently.
Proof: `poc-roster.js` prints `A.agreeKey now == C.agreeKey? true`. Also `add` of an already-present id should never be legal
(only a first add).
Fix: in `verifyRosterLog`, reject an `add` whose device id is already in the map (`bad-roster: duplicate device`); and make
agreement-key changes an explicit, self-signed entry kind if ever needed.

### 2. HIGH, demonstrated: the 4-digit matching number does not defeat a man-in-the-middle who knows the code
`pairing.ts:78-81` (`shortAuthString`), used at `pairing.ts:268` and `NewDevice.sas`. It is `SHA-256(label, isk)` mod 10^4.
Without the code a middle party cannot finish the key exchange at all (the confirmation macs already stop it), so the number
adds nothing there. With the code (the shoulder-surfer case, threat model P-4, which is exactly what the number was added for) the
middle party runs two separate exchanges and picks its own secret value for the second leg until the two numbers agree. Only
about 10,000 tries (~20,000 key multiplications, a couple of seconds) are needed because the number is a function of values the
attacker chooses after seeing the other side's. Proof: `poc-sas.js` pairs a "phone" through an interceptor with both screens
showing 6921, the new device reaching `hello`.
So the number is decorative for the attack it is meant to stop. (Against an attacker who simply pairs first as the new device it
also does nothing, since only one session exists; there the defence is the user recognising the prompt.)
Fix: make the number grind-proof by committing before revealing (ZRTP style): each side sends `H(nonce)` before seeing the
other's nonce, reveals the nonce after, and the number comes from both nonces plus the session key. Even then keep at least 6
digits, since success is 1/10^n per attempt. Until then do not describe it to Destin as MITM protection.

### 3. MEDIUM (deferred by design, but must be tracked): a removed device's later and back-dated entries verify, and it can re-add itself
`roster.ts:151-176`. There is no removed state: a removed device stays in the map (comment `roster.ts:5-10` says the decide layer
will rule). Proof (`poc-roster.js`): after `remove B`, entries signed by B (a rename dated before its removal, a re-add of itself,
an `add` of a brand-new device D with `seen: []`, `at: 150`) all verify (`LOG ACCEPTED, devices: 4`, D present). `seen` is never
checked to reference real entries, and `at` is unconstrained, so the library gives the decide layer no honest ordering to work
from. Same for frames: `FrameReceiver` accepts a removed device's frames under any generation it still holds, because only the
caller's `signKeyFor` can refuse.
Fix: record in the design that `verifyRosterLog` output is "keys ever seen", never "members"; add tests that pin which of these
the decide layer must reject; require `seen` to reference known ids (or the entry's `at` ordering to be derived from `seen`).

### 4. MEDIUM, demonstrated: a hostile relay can permanently drop frames by reordering
`frames.ts:221-228` (`check`) and `:242-262`. A receiver that sees counter N first refuses every older counter more than 1024
behind as `out-of-window`, which cannot be told from replay and is never retried. Delivering a sender's newest frame first
(trivial for the relay, and natural for a new device catching up) loses the rest: `poc-frames.js`, 1976 of 2999 older frames
refused for good. This is silent data loss driven by an untrusted party.
Fix: for a session the receiver has never seen, accept down to counter 0 (track gaps with a set/bitmap from the first frame), or
return `out-of-window` as "park and re-request", never "drop"; document that delivery must be in order per sender or the window
big enough.

### 5. MEDIUM, demonstrated: replay protection and the nonce contract are weaker than stated across state rollback and memory snapshots
- `frames.ts:268-290`: `importState` merges but cannot know it was handed an old file. Restoring an older state re-accepts
  frames already applied (`poc-frames.js`: frames 10-19 accepted twice). Needs an integrity note plus a monotonic counter in the
  storage layer's contract.
- `frames.ts:20-30` claims a "VM snapshot" cannot reuse a nonce. True for restored SAVED state (a restart makes a new
  session). False for a snapshot of the RUNNING process resumed twice: both copies hold the same session and counter and encrypt
  different frames under one (key, nonce). Not provable in JS. Fix: reword the contract ("disk restore only"); optionally
  have `seal` mix a boot-time value (a fresh 8-byte per-process random) into the session so a resumed copy at least diverges
  only if re-keyed; at minimum list it in the threat model as accepted.

### 6. MEDIUM: the "timing does not matter" claim for the generator is wrong; also a free CPU lever for the relay
`cpace.ts:21-23` (G21) and `pairing.ts:181-186`. `Existing` derives the code-dependent generator (BigInt Elligator2, variable
time) inside the handler of every `pake1`, and pake1 never costs the sender a try (only `MAX_CONNECTIONS` limits it). The relay,
which is the assumed attacker, can therefore trigger the same code-dependent computation thousands of times and average its
response latency. Realistic leakage is tiny, but the stated reason ("only a LOCAL attacker") is false, and it is avoidable.
Fix: compute the generator once in `openInvite` (it depends only on code, mode, room, all fixed per invite) and reuse it; this
removes the remote timing trigger and the per-message cost.

### 7. MEDIUM, demonstrated: pairing breaks once the roster has more than 1024 entries
`pairing.ts:259` passes every roster id as `seen`; `roster.ts:80` (`parseEntryValue`) allows at most 1024 `seen` ids while
`MAX_ROSTER_ENTRIES` is 4096. E builds an `add` entry that the new device then refuses as malformed (`poc-seen.js`:
"parse refuses own entry: malformed: seen"). Fix: send only the current heads (or the last N ids) as `seen`; align the caps.

### 8. LOW: names and platform strings are only sanitised on some paths
`roster.ts:79-83`, `pairing.ts:262`. Names parsed from a verified roster are not sanitised (`readAdd`, 200 chars, bidi kept:
`poc-roster.js` shows `"‮evil\u0007"` surviving); `platform` is length-limited only, and reaches the "Add this device?"
prompt unsanitised. `UNSAFE_CHARS` misses U+00AD, U+3164, U+2800, U+2028/2029, tag characters (U+E00xx), so a name made only of
those passes `.trim()` as "empty-looking" yet not replaced by "Unnamed device". Fix: sanitise at display time and in `readAdd`
and for `platform`, use an allow-list of letters/digits/punctuation, and re-check emptiness after stripping.

### 9. LOW, demonstrated: low-order agreement keys are accepted and later throw
`roster.ts` (`readAdd`) and `pairing.ts:216-219` accept an all-zero `agreeKey`; sealing to it throws
`MeshCryptoError('low-order-point')` (`poc-roster.js`). From `Existing.decide()` called by UI code (not via `onMessage`) that
exception escapes to the caller; a code-holder can thus make the Approve button throw, and any member can poison later key
rotation. Fix: reject low-order/all-zero agreement keys at parse; catch inside `decide`.
Related availability note: three bad points or macs burn the invite (pake1 low-order counts as a try, `pairing.ts:222`); the
relay can burn any invite anyway, so this is inherent.

### 10. LOW, demonstrated: secrets print when the object is serialised or inspected
`DeviceIdentity` (`identity.ts:20-26`) holds `signSeed`/`agreeSecret` as plain Buffer properties: `JSON.stringify(identity)` and
`util.inspect` print them (`poc-frames.js`). `CPace` keeps `y`, `Invite.secret`/`code` are plain fields. The no-logging test
only guards this folder, not callers. Fix: make secret fields non-enumerable and add `toJSON()`/`[util.inspect.custom]` that
return a redacted form. No zeroing is claimed anywhere (good): nothing misleading found there. `guard()` (`errors.ts:46-53`)
also relabels a caller-callback bug as `malformed` (`poc-frames.js`), which hides programming errors; let non-input errors
through for `secretFor`/`signKeyFor`.

### 11. LOW: parsing and encoding nits (no crash found)
- `roster.ts:78` `parseEntryValue` accepts an entry with no `body` key (body `undefined`); it round-trips but is a second spelling.
- `cbor.ts:50-60` encoder turns `Date`/class instances into `{}` and a lone surrogate into U+FFFD silently; harmless for the
  current callers, but two JS values can share bytes. Reject non-plain objects and unpaired surrogates in `enc`.
- `relay-auth.ts:60-66` calls `toHex` on an attacker-sized nonce before the length check; check length first.
- Fuzz, depth (64), array/map length vs remaining bytes, integers above 2^53, indefinite lengths all handled; I found no input
  that throws a non-module error or allocates beyond the input size from the parsers I tried and read.

### 12. LOW / UNVERIFIED: dependency and build evidence
- `@noble/curves` 2.4.0 and `@noble/hashes` 2.4.0 exist on this machine and their integrity strings in
  `desktop/package-lock.json:2325,2340` equal the integrity recorded in the local npm cache for the registry tarballs
  (`~/.npm/_cacache`). Registry provenance beyond npm's own metadata: UNVERIFIED (no network).
- The worktree's `node_modules/@noble/*` were NOT installed through npm: `node_modules/.package-lock.json` still lists hashes
  2.2.0 and no curves, while the files are 2.4.0 with mtime 05:52 (link count 1, so the shared checkout, still 2.2.0, was not
  touched). So local tests prove nothing about the lockfile; a clean CI `npm ci` is the real check. Lockfile itself is
  consistent: `@noble/hashes` raised 2.2.0 to 2.4.0 (still satisfies `app-builder-lib`'s `^2.2.0`) and now ships in production.
- `esm-load.test.ts` is meaningful for the tsc CommonJS output under plain Node (it compiles with the app's module settings and
  asserts a real `require("@noble/curves/ed25519.js")`), and the dependency really is `"type":"module"`. It is NOT proof for
  Electron 44's embedded Node, loading from inside `app.asar`, or the Android Node runtime; it ran on Node 26.10 here. The
  existing pdfjs precedent helps but is not the same package. UNVERIFIED for Windows/macOS/Android/packaged builds.
- `_map_to_curve_elligator2_curve25519` is documented "experimental, may be renamed": the exact pin plus the 2,000-input
  comparison against the draft reference (`cpace.test.ts`) is the right guard.

### 13. LOW: test gaps
No test pins findings 1, 2, 3, 4, 7 (the suite proves honest flows and many forgeries, but not roster overwrite/removed-signer, SAS
grinding, relay reordering, or large rosters). Known-answer tests for frames, ids and entries are "cross-checked against the T5
prototype", i.e. regression locks against the builder's own earlier code, not independent vectors; only CPace (draft Appendix B.1)
and HPKE (RFC 9180 A.2) are external. `no-secret-logging.test.ts` is a source-text scan (reasonable, can be dodged by an
indirect call, fine as a tripwire). Add the missing negatives as failing-first tests when fixing.

---

## Things checked and found correct (so you need not redo them)

**CPace** (`cpace.ts`): generator string, zero padding to the SHA-512 block, truncation to 32 bytes, bit-255 clearing, Elligator2
(noble and the draft's reference agree), ISK = H(lv_cat(DSI_ISK, sid, K) || transcript_ir) with initiator first, LEB128
length prefixes: all match draft-irtf-cfrg-cpace Appendix A/B. Scalars are clamped inside noble's X25519 (the draft's raw test
scalars pass). Low-order and zero outputs abort (all 12 draft low-order vectors tested). The published vectors in
`cpace.test.ts` (password "Password", sid 7e4b...2c57, generator d04bf6...a73f, K 5b067e...2c6b) are the draft's own
values as far as I can recall them, they are not self-generated, and the code passes them for generator, Ya, Yb, K, ISK on both
roles; I could not re-fetch the draft offline, so UNVERIFIED against the live text. Deviation from the draft's advice: `ci`
carries only a label and mode (no party identities) and one `sid` is shared by all connections to an invite; neither weakens the
one-guess property because device identities are bound afterward through the proof-of-possession over `SHA-256(isk)`.
**One guess per run**: a passive observer cannot test a code offline (needs a discrete-log-hard computation; E sends nothing
code-dependent until N's mac verified); an active party gets one test per connection. **Try budget**: held in memory on E only,
checked before a confirmation is evaluated (`pairing.ts:249`), serial and therefore exact under concurrency (tested with 50
connections); `openInvite` is the only reset and it also draws a new code. Confirmation is both ways and complete before any
name or key is revealed or shown (`cE` before `hello`; prompt only after `pop`). Invite expiry (5 min) is checked at pake1 and
at the mac, prompt expiry (2 min) at `decide`. One gap: N has no try limit, so a relay impersonating E gets one guess each
time the user retypes; at 2^30 codes this is negligible.
**Frames**: the whole header is both AEAD associated data and covered by the signature (set, to, group, gen, from, session,
counter, kind), so surreptitious forwarding into another set, recipient, group or generation is rejected; key is per
(generation, sender, session); counter is the only nonce input; sender cannot set counter or session; unknown versions refused;
padding lies inside the AEAD, `p` is not signed but cannot be used to forge; sign message framing is length-prefixed
(unambiguous); labels separate frame, entry, relay and pairing signatures. The decoder refuses every non-canonical form, so one
value has one encoding.
**Constant time**: macs, fingerprints and ids compared with `timingSafeEqual` through `ctEqual`.
**Regression** (item 9): the two commits change only `desktop/package.json`, `desktop/package-lock.json` and the new folder;
`npx knip` reports nothing for mesh or noble; no existing file imports the folder.

## Item 6 answers in one place
- Alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (32 symbols, 5 bits each, no modulo bias, 30 bits per code): correct and safe. The T5
  text says "no 0/O/1/I/L", which cannot yield 32 symbols (it gives 31), so keeping L is the right call. Typing 0, 1, I or O gives a
  local `invalid-code` (costs no try on E).
- 5-minute expiry and name sanitising: correct, with the gaps in finding 8.
- Optional padding: correct (bucket search verified by pinned test).
- 4-digit number: see finding 2 (decorative against a code-knowing middle party).
