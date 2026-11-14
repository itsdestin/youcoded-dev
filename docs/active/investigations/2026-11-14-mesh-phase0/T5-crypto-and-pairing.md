---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0, T5 — key-exchange library, hostile-pipe pairing prototype, and the concrete Phase 1 cryptographic construction
---

# T5: key-exchange library, pairing, and the Phase 1 construction

Prototype: `docs/active/prototypes/2026-11-14-mesh-phase0/T5/` (plain Node ESM). Everything below was run on this
Linux machine with Node v26.10.0. The app's Android runtime is Node 24.22.1 on Alpine with OpenSSL 3.5.9
(`youcoded/app/runtime/alpine-lock.json` lines 77, 157), so the same JavaScript and the same Node `crypto` calls
run there; nothing was run on a phone.

## 1. Verdict

**PARTIAL.** Against design section 9 row T5: "a pipe that guesses is locked out after 3 tries" PASSES (tested with the
real protocol, including 50 simultaneous connections and a Monte Carlo run). "Under 1 MB added" PASSES (the whole
pairing stack bundles to 40 KB minified, 15 KB gzipped; the CPace layer plus the primitives it needs is 28 KB). "Under
3 s on the phone" is UNVERIFIED but not in doubt: a whole pairing costs about 6 ms of CPU here (3.4 ms on the existing
device, 2.3 ms on the new one), roughly 500 times below the limit. "Pairs on Windows, macOS, Linux and Android" is
only shown on Linux; the code is pure JavaScript plus Node built-ins, so the remaining risk is packaging (section 3.9),
not cryptography.

## 2. What was done (re-run with `cd T5 && node <file>`)

`node_modules` in the prototype folder is a symlink to a scratchpad install, because the workspace guard blocks `npm
install` inside a worktree (it would rewrite hardlinked dependency folders). Packages used: `@noble/curves` 2.4.0,
`@noble/hashes` 2.4.0, `@noble/ciphers` 2.4.0 (not needed in the end), `cpace-ts` 0.1.6 and `@hpke/*` (cross-checks
only, never shipped), `esbuild` (size measurement only). Nothing was installed into the app.

| File | What it is |
|---|---|
| `cpace.mjs` | Our CPACE-X25519-SHA512 layer (about 90 lines), straight from draft-irtf-cfrg-cpace-21 |
| `hpke.mjs` | RFC 9180 base mode, X25519 / HKDF-SHA256 / ChaCha20-Poly1305, from Node built-ins only (about 70 lines) |
| `cbor.mjs` | Deterministic CBOR subset with a decoder that refuses any non-canonical input |
| `mesh-crypto.mjs` | The Phase 1 construction as running code: identity, key hierarchy, frame sealing, roster entries, key generations, relay challenge |
| `pairing.mjs` | QR and typed-code pairing (existing device and new device state machines) |
| `test-vectors.mjs` | Published test vectors: CPace B.1 incl. low-order points, HPKE A.2, RFC 8949 samples (17 checks) |
| `interop.mjs` | Ours against `cpace-ts` and `hpke-js`, both directions (4 checks) |
| `test-mesh.mjs` | Behaviour of the construction: tamper, replay, forgery, removal, relay auth (13 checks) |
| `run-pairing.mjs` | Hostile-pipe scenarios, Monte Carlo, timing (output saved in `run-pairing.output.txt`) |
| `montecarlo.mjs`, `overhead.mjs` | Larger guessing run; per-frame cost (outputs saved beside them) |

All checks are saved in `checks.output.txt`: 34 passed, 0 failed.

## 3. Findings

### Part A: the library for the typed code

1. **No maintained, audited, ready-made PAKE for JavaScript exists; the best option is "a small layer of ours over
   audited primitives, proved against the RFC's own vectors".** Evidence: `npm search` for spake2, cpace, pake and
   opaque-ke (run 2026-11-14; only the first 12 hits of each were read, so UNVERIFIED beyond that) and `npm view` of each
   candidate. The honest table:

   | Candidate | Protocol and vectors | Maintenance | Audit | Size | Fit |
   |---|---|---|---|---|---|
   | **Our layer over `@noble/curves`** (recommended) | CPace draft-21 X25519/SHA-512; matches the draft's Appendix B.1 byte for byte (generator, Ya, Yb, K, ISK) and all 12 low-order-point vectors B.1.10 | us; noble releases rarely on purpose | noble-curves audited: Trail of Bits at 2.3.0 (Aug 2026), Cure53 (Sep 2024), Kudelski (2023), Trail of Bits (2023), per its README; **our 90 lines are not audited** | 28 KB minified with the primitives | exact |
   | `cpace-ts` 0.1.6 | draft-21 X25519/SHA-512 (README); our code interoperates with it in both roles | one author, 0.x, published 2026-10-14, no audit, Rust/WASM crate optional | none | 232 KB on disk | fits; used here only as an independent check |
   | `@cipherman/pake-js` 0.1.1 | SPAKE2+ (RFC 9383) and CPace draft-20 Ristretto255 only; vectors wired for those | one author, pre-1.0, README says "do not deploy until your own audit" | none | 943 KB | wrong curve variant; SPAKE2+ is the asymmetric kind |
   | `spake2` 1.0.2 / `@niomon/spake2` | old SPAKE2, `elliptic` + `bn.js` | last release 2019 / 2022 | none | n/a | reject: unmaintained, no RFC 9382 vectors |
   | OPAQUE (`@cloudflare/opaque-ts` 0.7.5, `@serenity-kit/opaque` 1.1.0 WASM) | RFC 9807 | Cloudflare package last released 2022 and pins `@noble/hashes` 0.4.4; serenity is Rust compiled to WASM | none found | n/a | wrong shape: OPAQUE is client-to-server with a stored password file and a sign-up step; pairing has no server and one throwaway secret |
   | `libsodium-wrappers` 0.8.4 | no CPace, SPAKE2 or OPAQUE in libsodium | active | libsodium reviewed | 550 KB | no PAKE to use |
   | Node `crypto` | none | n/a | OpenSSL | 0 | no PAKE (as the design says) |

2. **Recommendation: our layer, with `@noble/curves` for X25519 and Elligator2, pinned to an exact version.
   Fallback: `cpace-ts` (same behaviour, proven by interop) if we would rather not own the 90 lines, or
   `CPACE-RISTR255-SHA512` through noble's ristretto255 if X25519 low-order handling ever worries a reviewer.**

3. **Risk of writing our own layer, stated plainly.** The design says no home-made cipher. CPace is a protocol, not a
   cipher: every primitive (X25519, Elligator2, SHA-512) is someone else's audited code, and the remaining code is string
   framing and one hash call. What can still go wrong in it: wrong byte order or length encoding (the vectors catch
   this), a missed abort on low-order points (vectors B.1.10 catch this), and side channels. The vectors pass,
   including ISK. What the vectors do NOT prove: constant-time behaviour of our glue (the generator is derived from the
   password hash with JavaScript BigInt maths in `elligator2Reference`/noble's map, which is not constant time; this
   matters only to an attacker on the same machine timing the typed code's derivation, and the code is guessable only 3
   times anyway), and that a future draft revision does not change something (draft-21 is awaiting the RFC Editor;
   the status page is dated 2026-10-07, so a final RFC number may exist by build time). Mitigation: the T5 test
   files go into the app's test suite as they are; the pairing code and this layer are in scope for the pre-Phase-7
   outside review (design section 8).

4. **A detail that matters when pinning.** noble exposes the Elligator2 map as `_map_to_curve_elligator2_curve25519`
   ("Experimental name: may be renamed later", `ed25519.d.ts`). Our reference Elligator2, written from the draft's
   appendix A.5, agrees with it on the vector and on 2,000 random inputs (`test-vectors.mjs`). So: pin the version,
   keep the test, and if noble renames it, switch to our reference function (about 10 lines, already written and
   tested).

5. **Packaging.** `@noble/curves` 2.x is ESM-only (`"type": "module"`, `package.json`). The desktop main process is
   compiled to CommonJS (`youcoded/desktop/tsconfig.json:10`), so it must `require()` an ES module, which Node supports
   from 22.12 (and 20.19). The Android backend runs Node 24.22.1, so that is fine. The version of Node inside Electron 44.10.0
   was not checked (the Electron binary is not in this worktree): UNVERIFIED, Phase 1 must confirm with one test that
   imports the module in the real main process. The Android backend copies production dependencies as plain JS
   (`app/runtime/build-backend.sh`), so a pure-JS package needs nothing special; a WASM or native package would
   (so none is recommended). `@noble/hashes` 2.2.0 is already in the desktop `node_modules`, but only through
   electron-builder (dev), so both noble packages would become new production dependencies.

6. **Size.** `esbuild --bundle --minify` of `cpace.mjs`: 27,765 bytes (10,995 gzipped); of the whole pairing stack:
   39,758 bytes (14,818 gzipped); of `mesh-crypto.mjs`: 9,502 bytes. If the packages are copied whole, they weigh
   1.6 MB (`@noble/curves`, all curves, with type files) plus 0.7 MB (`@noble/hashes`) on disk; only their `.js`
   files, 0.58 MB plus 0.27 MB, would ever be loaded, and only the parts reachable from `ed25519.js` are executed.
   The brief's "under 1 MB added" holds for what the app runs; if it is measured as raw folder size it is 2.3 MB.
   Say which way it is measured before calling it a pass.

### Part B: pairing over a hostile pipe (`run-pairing.mjs`, saved in `run-pairing.output.txt`)

7. **One protocol for QR and typed code.** Both run CPace with the secret as the password. The QR secret is 128
   random bits and also carries the existing device's key fingerprint; the typed code is a few characters. After
   CPace: new device proves it knows the key first, existing device checks (this is where the guess is counted), then
   the existing device proves itself; only then does the new device send its name and keys (sealed under the session
   key), and only then does "Add this device?" appear. Evidence: event order recorded on the existing device is
   `pake1 -> confirm-ok -> prompt -> welcome-sent`, asserted in the run.

8. **Both sides derive the same session key**: the same 64-byte CPace output, asserted equal; keys for the two
   confirmations and the two sealed directions are separate HKDF outputs of it.

9. **The welcome arrives.** Roster (genesis entry plus the signed `add` for the new device), and each set-secret
   generation sealed to the new device's key-agreement key with HPKE, inside the session-key layer. The new device
   verified every roster signature, opened the secret, and opened a first real frame sealed by the existing device.

10. **A pipe-only attacker cannot complete pairing.** The recording pipe saw none of the device name, the code or the
    set secret (byte search over everything it carried). Dropped confirmation: nothing is shown anywhere. Confirmation
    held back and delivered late and twice: accepted once. Forged welcome and random bytes injected: ignored, real
    welcome still completes. A full recorded session replayed at the spent code: no second prompt; replayed at a
    different fresh code: 1 failure counted, nothing shown. A man in the middle answering the new device with its own
    guess: 1 failure counted on the existing device, the new device sits waiting for proof and has revealed nothing.
    A QR shown for one device but answered by another: refused by the new device (fingerprint check).

11. **Online guessing burns the code after 3, counted on the existing device.** Three wrong guesses: 3 failures, code
    burned; afterwards even the correct code is refused and no prompt is ever shown. The existing device evaluated
    exactly 3 confirmations in total, because the budget is checked before a confirmation is evaluated. 50 connections
    opened at once: still only 3 evaluated.

12. **Why a failed or dropped attempt gives the attacker nothing beyond the one guess.** The existing device sends
    nothing that depends on the code until after the new device's confirmation checks out, so there is nothing to test
    offline; each connection tests exactly the one guess its first message was built from. A wrong guess costs the
    attacker the connection and one of the three.

13. **How big must the typed code be.** With 3 guesses and a uniformly random secret of N possibilities the attacker
    wins with probability 3/N per code (assuming they are on the pipe at the moment of pairing):

    | Secret | N | 3 guesses win |
    |---|---|---|
    | 6 digits | 10^6 | 3.0e-6 (1 in 333,333) |
    | 8 digits | 10^8 | 3.0e-8 (1 in 33 million) |
    | 10 digits | 10^10 | 3.0e-10 |
    | 6 characters of a 32-letter alphabet (30 bits) | 1.07e9 | 2.8e-9 (1 in 358 million) |
    | 8 characters of the same | 1.1e12 | 2.7e-12 |

    Theory was checked with the real protocol on tiny codes: 1-digit code, 2,000 trials: attacker won 618, theory 600
    plus or minus 20.5 (0.9 sigma). 2-digit code, 3,000 trials: 111 wins, theory 90 plus or minus 9.3 (2.3 sigma, inside
    the 4-sigma bar I set before running; the larger rerun, 6,000 trials, gave 191 against 180 plus or minus 13.2, 0.8 sigma, so the first was chance). **Recommendation: 6
    characters of the 32-letter alphabet (no 0/O/1/I/L), 3 tries, 5 minutes**, which is 1 in 358 million per code; 8
    digits (1 in 33 million) is the all-numeric alternative. For scale: Magic Wormhole's default code has 16 bits of
    secret and allows effectively one guess, a 1 in 65,536 chance
    (<https://magic-wormhole.readthedocs.io/en/latest/attacks.html>); NIST SP 800-63B's throttling guidance is far
    looser (up to 100 consecutive failures). This design is already much stricter than either.
    The meeting-point part of the typed text is separate and must be random and independent of the secret (G14, C10).

14. **Timing (this machine, 200 runs each, both sides in one process, no network):** typed code median 5.9 ms
    (existing 3.4 ms, new 2.3 ms, worst 10.8 ms); QR median 5.7 ms (worst 13.8 ms); creating a device identity 0.16 ms.
    A 100 times slower phone would still pair in under a second of CPU. Real pairing time will be dominated by the
    network and the human, not by cryptography. Android itself: UNVERIFIED.

### Part C: the construction (what the builders implement)

All of it runs in `mesh-crypto.mjs` and is exercised by `test-mesh.mjs`. Cost measured with `overhead.mjs`: about 250
bytes of overhead per frame; sign+seal 0.38 ms and open+verify 0.52 ms for a tiny frame, 14 ms each way for 1 MB.

**C1. Primitives and libraries.** Node `crypto`: Ed25519 (RFC 8032) signatures, X25519 (RFC 7748), HKDF-SHA256
(RFC 5869), HMAC-SHA256, SHA-256/512, ChaCha20-Poly1305 (RFC 8439, 96-bit nonce, 128-bit tag). Our code: CPace (A),
HPKE one-shot base mode (C6), deterministic CBOR (C5). One cipher suite, no negotiation; a version byte `v` in every
header; an unknown `v` is refused, never downgraded. XChaCha20 is not in Node and is not needed (C3).

**C2. Identity and ids.**
- Each device makes an Ed25519 signing pair and an X25519 key-agreement pair on first mesh start.
- `deviceId` = first 16 bytes of SHA-256("youcoded-mesh/v1/device-id\0" || signKey). Self-certifying; nothing to
  do with the machine id (reasons in G9). Reinstalling with data intact keeps the keys, so it keeps the id; this
  gives the design's "same machine replaces its entry" behaviour with no machine id involved.
- `setId` (also the relay room name, 5.6) = SHA-256("youcoded-mesh/v1/room\0" || first device's signKey).
- QR fingerprint = SHA-256("youcoded-mesh/v1/fingerprint\0" || signKey || agreeKey), all 32 bytes.

**C3. Keys from the set secret, per generation and per purpose.** `S_G` is 32 random bytes, never used directly.
`K = HKDF-SHA256(ikm = S_G, salt = setId, info = "youcoded-mesh/v1/" || purpose || 0x00 || u32(G) || context, 32)`.
Purposes: `frame` (context = sender id and session), `register` (reuse `frame`, see G17), `roster-name`. A new
generation's secret is fresh random bytes, never derived from the old one (otherwise a removed device would compute
it); tested.

**C4. Nonces (safe with many devices and restarts).** Do not put the sender in the nonce. The AEAD key is derived per
(generation, sender, session), so it is unique to one sender's one run; the 12-byte nonce is `00 00 00 00 || u64
counter`. Rules: (1) `session` is 16 fresh random bytes on **every process start**, counter starts at 0; (2) the
sender **never saves or restores** its own counter or session (the design's "saved with the counter" applies only to
receivers' duplicate tables); (3) a sender refuses to seal when the counter reaches 2^32. Why rule 2: the demo in
`test-mesh.mjs` shows that two messages under one key and nonce leak the XOR of their plaintexts; a restored backup or
virtual-machine snapshot that rewinds a saved counter would do exactly that. With a fresh random session a rewind
gives a new key, so it is harmless. A single key per generation with the tuple packed into 96 bits cannot work anyway:
sender (16) + session (16) + counter (8) is 40 bytes.

**C5. Canonical encoding: deterministic CBOR (RFC 8949 section 4.2.1), restricted subset.** Allowed: unsigned integers
below 2^53, byte strings, text strings, arrays, maps with text keys sorted bytewise, true/false/null. The decoder
refuses everything else: non-shortest integers and lengths, indefinite lengths, floats, tags, negative numbers,
duplicate or unsorted map keys, trailing bytes. Why not JSON canonicalisation (RFC 8785): binary keys, hashes and
signatures would need base64 (33% bigger), number formatting is JavaScript-specific, and a non-JavaScript reader
later (the Pi, a Rust helper) would have to reimplement it. Why restricted CBOR: bytes are bytes, canonical form is
trivial, and rejecting second spellings means one value has one id. Checked against RFC 8949 Appendix A samples.
About 100 lines, ours, not security-critical in the cipher sense but id-critical: it needs the same pinning tests.

**C6. Sealing a secret to one device: HPKE (RFC 9180) base mode, X25519 / HKDF-SHA256 / ChaCha20-Poly1305.** Built from
Node primitives (about 70 lines), verified against the RFC's Appendix A.2 vector (encapsulated key and ciphertext match
exactly) and against `hpke-js` in both directions. Library option: `@hpke/core` + `dhkem-x25519` + `chacha20poly1305`
(MIT, one maintainer, no audit found) adds about 2 MB on disk for the same thing; not recommended. `info` =
"youcoded-mesh/v1/keygen\0" || setId || u32(G); `aad` = sender id || recipient id. Base mode does not authenticate the
sender, so every sealed secret travels inside a signed frame (C7).

**C7. Frames: sign-then-encrypt, with the signature bound to the outside header.**
```
header (outside, readable, CBOR):  { v, set, to|null, group, gen, from, session, counter, kind }
aad        = canonical(header)
sig        = Ed25519( "youcoded-mesh/v1/frame-sig\0" || u32(len aad) || aad || canonical(body) )
ciphertext = ChaCha20-Poly1305( key = K(frame, gen, from, session), nonce = 0^4 || u64(counter), aad, canonical{ b: body, s: sig } )
wire       = canonical{ h: header, c: ciphertext }
```
Why sign-then-encrypt: the keeper sees who is connected anyway, but gains nothing from seeing signatures; with the
signature inside, a keeper cannot even tell which frames are `control` from `lines` beyond the group name. Why the
signature covers the header: otherwise any member (they all hold the key) could lift a signed body into a different
group, sequence or generation (tested: group, recipient, counter, kind, session and set changes are all rejected). A
member cannot forge another device's frame: they hold the key but not the signing key (tested). Receivers
authenticate first and record `(sender, session, counter)` only afterwards, so junk cannot poison the duplicate table
(tested). `seq` is NOT in the header: the keeper assigns it after sealing, so it is routing only; ordering and
duplicate protection come from `(sender, session, counter)`.

**C8. Roster and control entries.** `id = SHA-256("youcoded-mesh/v1/entry\0" || canonical(fields except id and
signature))`; `signature = Ed25519("youcoded-mesh/v1/entry-sig\0" || id)`. The id depends only on content, so two
devices compute the same id; the signature covers the id, so any edit breaks it (tested). `witness` and `cutoff`
use the same rule.

**C9. Relay authentication.** The relay sends `{ aud, nonce }` (aud = its own host name, nonce = 32 random bytes,
single use, 30 seconds). The device first checks `aud` equals the host it actually dialled, then signs
"youcoded-mesh/v1/relay-auth\0" || canonical{ aud, room, nonce, dev }. The relay checks: nonce is its own, unused and
fresh; `dev` is on `room`'s roster; signature valid. Tested: replayed response, response moved to another room,
challenge forwarded from another relay (device refuses), signature presented at a different relay, non-member,
stale nonce all fail. The room is named in the signed message; it is verified against the roster, never trusted.

**C10. Room names and meeting points.** Room = `setId` (C2), derived from a public key, never from the set secret.
Pairing meeting points are random values the relay hands out, in a separate namespace from rooms, and are never
derived from the pairing secret (if they were, the relay could test guesses against the room name).

**C11. Key storage.** Private keys and set secrets go in one file per device (for example `<userData>/mesh/keys.bin`),
written with 0600 from the first byte, atomically (the pattern `github-client.ts` already uses), sealed by
`safeStorage.encryptString`, and excluded by an ast-grep rule and a test from every synced folder, backup and log.
Android: the shim (`electron-headless.ts:140-172`) seals with AES-256-GCM under a 32-byte key the Kotlin app
keeps in `EncryptedSharedPreferences` and passes to the backend on stdin at each start. Weaknesses found there are
G12. Linux without a keyring: G13.

**C12. Forward secrecy.** A static set secret gives **none** until a generation change: anyone who records the
ciphertext a keeper holds (the relay, a Wi-Fi sniffer) and later obtains the set secret from any one device can read
everything sealed under that generation. A hash ratchet (replacing `S_G` with `H(S_G)` on a schedule) is NOT worth it:
a device that was offline must be able to catch up, so devices would have to keep the old link, and a stolen device
then derives all future links anyway. What is worth it and nearly free: a scheduled new generation (for example every
90 days, or after any removal) made exactly like a removal's, which bounds how much a single leaked secret exposes and
which the design already has all the parts for. Chats are stored readable on every device, so forward secrecy only
protects data in flight or held by a keeper, which is bounded by the 30-day hold. Honest statement for the product:
"the relay cannot read your chats; if someone both copies what the relay holds and later steals one of your
unlocked devices, they can read the last few weeks of what passed through it." Pairing itself has forward secrecy
(everything in it is under the CPace session key).

**C13. Metadata the relay sees** (design 2.4 says "counts, sizes, timing"; the full list): which room each connection
belongs to; its IP address and connection times; the public signing and agreement keys and deviceIds of every device
in the set; roster entry sizes and timing (names are sealed); for each frame: group name (`chat:<version>`,
`project:<id>`: stable ids that let it count chats and group frames per chat), sender id, recipient, generation,
session, counter, size, send time; acknowledgement positions in the unsealed `received` calls (design 5.6), which tell
it which device is behind on which chat; which devices hold which project; register keys. It does not see chat text,
titles, project names, device names, or file names. Group names should be random ids, never hashes of titles.

### Review against published practice, and where the design falls short

15. Compared against: Signal's Sesame (<https://signal.org/docs/specifications/sesame/>, read), Magic Wormhole
    (<https://magic-wormhole.readthedocs.io/en/latest/attacks.html>, read), WhatsApp's multi-device description
    (<https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf>) and Matrix key verification
    (<https://spec.matrix.org/latest/client-server-api/#key-verification-framework>) both from memory and NOT re-read
    for this report (UNVERIFIED in detail), MLS (<https://www.rfc-editor.org/rfc/rfc9420>), RFC 9180, RFC 8439, NIST
    SP 800-56C Rev. 2 / SP 800-108 (key derivation; HKDF is the extract-then-expand form SP 800-56C approves), SP 800-57
    (crypto periods: supports G10's scheduled new generation) and SP 800-63B (throttling).
    The honest summary: this design is a **shared group secret with signed roster**, closer to a small MLS group
    without the tree than to Signal/WhatsApp (pairwise ratcheting sessions per device pair). That is a sound choice for
    at most a handful of devices owned by one person, and the price is fewer properties: no forward secrecy, no
    post-compromise security short of a removal, and one device's compromise exposes everything of that generation.

16. **Gaps, each with severity and a fix** (G numbers are used above):

| # | Where | Problem | Severity | Fix |
|---|---|---|---|---|
| G1 | 6.3 | `from`, `generation`, `session`, `counter` are inside the sealed part, but a receiver needs them to choose the key and nonce before it can decrypt. As written it cannot be built. | High (unbuildable as written) | Move them to the outside header and authenticate the header as associated data (C7). |
| G2 | 5.1 duplicates, 6.3 | `(sender, session, counter)` cannot fit a 96-bit nonce; and "session saved with the counter" invites nonce reuse after a restore, which for ChaCha20-Poly1305 leaks plaintext and the authentication key (RFC 8439 section 2.3; demonstrated in `test-mesh.mjs`). | High | Per-(generation, sender, session) key, counter-only nonce, fresh random session each start, senders never persist counters (C4). |
| G3 | 6.3 | `seq` is assigned by the keeper after sealing, so it cannot be authenticated. | Medium | State that `seq` is routing only; ordering and duplicates come from the signed tuple; group in the associated data stops moving frames between groups. |
| G4 | 6.3 | `live-event`, `beat`, `hello` are sealed but not signed: any holder of the generation secret (including a removed device before the next generation reaches everyone) can forge "reply running" or text shown to watchers. | Medium | Sign every frame. At 4 live frames a second the cost is 0.4 ms each, trivially affordable. |
| G5 | 6.2 | "id = SHA-256(rest)": unclear whether `rest` includes the signature; no encoding named; no signature scope. | Medium | C5 and C8. |
| G6 | 5.1 | "the one in the set longer stands" for two devices removing each other has no clock-free definition; a device can inflate any count it controls. | Medium | Define as the causal depth of the device's own `add` entry (fixed by whoever added it); ties broken by lowest entry id. Add to the T12 fuzz. |
| G7 | 5.1 | A `remove` entry and the new generation's `keygen` are separate things; a device that knows of the removal but not yet the new secret has no safe thing to seal under. | Medium | The remover sends the `remove` entry and the `keygen` frame as one signed bundle; devices keep sealing under the old generation only until they hold the new one, and never after learning of the removal without it queued. |
| G8 | 5.1 | The cut-off is "the furthest point any remaining device held", taken from witnesses; no rule for a remaining device that is offline, nor for a witness arriving after others have acted. | Medium | Make the cut-off a deterministic function of the roster log (maximum over witnesses present in the log at a stated point), and fuzz it in T12/T15. Not decided here. |
| G9 | 5.1 | "The roster and relay see a one-way hash of the machine id so a set cannot be tied to an analytics record." The machine id (`device-id.json`, a random UUID) is sent in clear to the existing sync hub (`sync-hub-socket.ts:80`), so a plain SHA-256 of it is computable by whoever holds that data; the analytics id is an HMAC with a salt shipped in the open-source app (`analytics-service.ts:192`). | Medium (a privacy claim that would not hold) | Use the key-derived `deviceId` (C2); do not use the machine id at all. |
| G10 | 5.1, 8 | No forward secrecy, no post-compromise security except on removal. | Medium, accepted | State honestly (C12); add a scheduled new generation. |
| G11 | 5.1 "Unlock" | The unlock is a screen gate: the signing key stays usable by the app (and by any code running as the user: DPAPI on Windows and libsecret on Linux hand the key to any process of that user, including the assistant itself and anything a web page tricks it into running). Nothing in the cryptography requires the unlock. | Medium | Say so in the product wording (8 "Limits"). Later hardening: keep the roster-signing key in the OS store with user presence required (Android `setUserAuthenticationRequired`, macOS access control, Windows Hello); T11. |
| G12 | 3.5 Android shim | See finding 17. | Medium | See finding 17. |
| G13 | 5.1 keys | Linux without a keyring. | Medium | See finding 18. |
| G14 | 5.1 pairing | Typed-code length unspecified; the meeting point is guessable if short, so anyone can burn live codes by guessing rooms (a nuisance, not a break-in); a pipe-only attacker can always burn a code deliberately. | Low-Medium | 6-character secret (13); room part at least 4 characters allocated by the relay; per-address rate limits (already in 5.6); say plainly in the UI that "code expired" can be an attack. |
| G15 | 5.1 pairing | Someone who sees the typed code on screen within its 5 minutes can pair first and choose any device name; the "Add this device?" name is attacker-chosen. | Low-Medium | Show the same 4-digit number on both screens, derived from the session key, and ask the user to confirm they match (Matrix and Signal both offer such a check). User-visible, see section 5. |
| G16 | 5.6 | "Room comes from the authenticated key" cannot be literally true for a device that is in two sets during a join. | Low | The room is named inside the signed challenge response and checked against that room's roster (C9). |
| G17 | 5.6 registers | A sealed register value is not bound to its key name; a relay could swap values between `host:<a>` and `host:<b>`. | Medium | Registers are ordinary signed frames (group `reg:<key>`, associated data includes the key name and the previous value's hash). One sealing format, not two. |
| G18 | 6.3 | `hello` is the one frame the design leaves unsigned that is harmless to forge (it only announces versions); signing it too keeps one rule. | Low | Sign it. |
| G19 | 8 rule 1 | "No key written to a synced folder or backup" has no mechanism. | Low | C11: fixed path, excluded in every backup and sync list, enforced by a test plus an ast-grep rule. |
| G20 | 5.1 | HPKE to a static key has no forward secrecy: a device's agreement key leaking later opens recorded keygen blobs. | Low | Rotate each device's agreement key at every generation change (signed roster entry), and keep the signed-frame wrapping. |
| G21 | 5.1 Elligator | The typed code goes through BigInt maths that is not constant time. | Low | Only matters to a local attacker timing this device; 3 guesses cap it; note and move on. |

17. **Android secret shim, read at `electron-headless.ts:140-172` and `SecretKeyStore.kt`, `PairedDeviceStore.kt`.**
    (a) `PairedDeviceStore.prefs` falls back to ordinary `SharedPreferences` if `EncryptedSharedPreferences` cannot be created
    (`PairedDeviceStore.kt:50-52`), and `SecretKeyStore` then keeps the key in it, so the key that seals every saved
    secret can end up unencrypted on the phone without anyone being told. For mesh keys the backend must be able to ask
    "was the Keystore really used" and refuse otherwise. (b) The key is a software AES key held in the Node process memory
    for its whole life (`heldSecretKey`), not a non-exportable Keystore key used on demand; it is protected at rest by the
    Keystore master key only. The environment copy is removed and it travels on stdin (a good, documented
    fix, `headless-main.ts:21-44`). Whether another process running as the same app user (a tool Claude Code starts) can
    read that memory through `/proc/<pid>/mem` was not tested: UNVERIFIED. (c) Blobs carry no context
    (no associated data), so one sealed blob can be swapped for another purpose's blob by anyone who can write the
    file; mesh should add its own label as associated data. (d) `MasterKeys` is a deprecated AndroidX API. (e) Good:
    `android:allowBackup="false"` (`AndroidManifest.xml:35`), so the blobs are not copied to cloud backup; a wiped
    phone gets a new key and the old blobs are unreadable, which matches "after an Android uninstall it is a new
    device". (f) 12-byte random IVs under one key are fine for the expected number of writes (limit about 2^32).

18. **Linux with no secret store.** Electron's own docs: without a secret store, items are "encrypted via hardcoded
    plaintext password", and `getSelectedStorageBackend()` returns `basic_text`
    (<https://www.electronjs.org/docs/latest/api/safe-storage>, read). The docs do not say what `isEncryptionAvailable()`
    returns in that state; the app's `keychain-operation.ts:15` therefore also checks `!== 'basic_text'`, but
    `github-client.ts:190-222` does not and, when encryption is "unavailable", deliberately writes the token as a plain
    0600 file with a logged note, while the ChatGPT sign-in refuses (`chatgpt-auth.ts:602`). Two precedents in one app.
    Mesh keys are far more powerful than either token (they let a holder read every chat and make assistants on other
    devices run commands), so the recommendation is the refusing precedent: **mesh refuses to switch on when
    `getSelectedStorageBackend()` is `basic_text` or `unknown`**, with a plain explanation. Even with a real keyring,
    Linux protects only against copying the disk (any process in the session can ask the keyring). Needs a
    decision, section 5.

19. **Everything in design 5.1, 6, 8 that is unsound or underspecified is in the G table**; the three that stop a
    builder are G1 (cannot decrypt as specified), G2 (nonce construction) and G5 (what an id is).

## 4. What this changes in the design

Section by section, proposed wording (the lead decides; section 2 is Destin's and is not edited here):

- **5.1 "Library."** Replace with: "Node's `crypto` supplies Ed25519, X25519, HKDF-SHA256, HMAC and ChaCha20-Poly1305.
  The typed code uses CPace (`CPACE-X25519-SHA512`, draft-irtf-cfrg-cpace-21) implemented as about 90 lines of our own
  glue over `@noble/curves` (audited), proved against the draft's published test vectors, with `cpace-ts` as an
  independent cross-check in tests only. Sealing a secret to a device uses RFC 9180 base mode built from Node
  primitives, proved against RFC 9180 Appendix A.2. Entry ids and signatures use deterministic CBOR. These layers
  are in scope for the pre-Phase-7 outside review."
- **5.1 "Identity."** Replace the machine-id hash with: "A device's id is the first 16 bytes of SHA-256 of its public
  signing key, with a fixed label. The machine id is not used by the mesh."
- **5.1 "Duplicates."** Replace with: "A frame is identified by `(sender, session, counter)`. `session` is 16 random bytes
  chosen at every process start; the counter starts at 0; a sender never saves either. Receivers keep what they have
  seen per `(sender, session)`. The frame key is derived per (generation, sender, session) so a nonce can never repeat."
- **5.1 "Roster."** Add: the removal of two devices by each other is decided by the causal depth of each device's `add`
  entry, ties by lowest entry id (G6); the `remove` entry and the next generation's keygen travel as one signed bundle
  (G7); the cut-off is a deterministic function of the roster log (G8).
- **5.1 "Pairing."** Replace the two bullets with: one protocol for both; the typed code is a relay-chosen random
  meeting point plus a 6-character secret; sequence as in finding 7; 3 evaluated confirmations per code, counted on the
  existing device, checked before evaluating; a success also spends the code; names and keys are sent only after key
  confirmation; the meeting point is never derived from the secret.
- **5.6 item 1.** "A device answers a one-time challenge `{ relay host, 32-byte nonce }` after checking the host is the
  one it dialled, naming the room it wants; the relay verifies the signature against that room's roster."
- **6.2.** Add the id and signature rule (C8) and "entries are encoded as deterministic CBOR (C5)".
- **6.3.** Rewrite `outside` as `{ v, set, to, group, gen, from, session, counter, kind, bytes }` with everything except
  `bytes` authenticated as associated data; `seq` is added by the keeper and is not authenticated; mark every frame kind
  as signed; registers are frames.
- **8.** Add to "Must be true": "Every frame is signed, the signature covers its header, and a sender never reuses a
  `(session, counter)`." Add to "Limits to state honestly": "Software running as you on a device can use that device's
  keys; the unlock is a gate for people, not for programs." and "Anyone who copies what the relay holds and later
  steals one device can read what passed through it in the last weeks."
- **9 row T5.** Mark done: library chosen and proved on Linux; Windows, macOS and Android runs remain (they need only
  the packaging check in finding 5).
- **13 (open).** Add: whether a scheduled new generation is built (C12); the Linux keyring rule (finding 18).

## 5. Needs Destin

1. **The typed pairing code.** Proposed: letters and digits without look-alikes, like `K7QD-4MXW9R`: a few
   characters that say where to meet plus 6 that are the secret, valid 5 minutes, 3 tries. Chance a stranger on the
   network guesses it: about 1 in 358 million per attempt. Pros: short enough to type from a screen onto a phone.
   Cons: letters on a number pad are awkward. Alternative: 8 digits only (1 in 33 million), easier on a number pad,
   weaker and longer to read out. I recommend the letters-and-digits code.
2. **A matching number on both screens when pairing by typed code.** Both devices show the same 4-digit number and
   you confirm they match. Pro: someone who read the code over your shoulder cannot get a device added, because their
   screen is not in front of you. Con: one more step each time. Without it the only guard is that the existing
   device shows the new device's name, which the attacker chooses. I recommend adding it. It is a visible step, so it needs your
   yes.
3. **Linux computers with no password keyring.** Either mesh refuses to turn on and explains how to set one up
   (recommended: the keys can read every chat and make your assistants run commands, and without a keyring they are
   stored in a form any program can read), or it turns on and warns (like the GitHub token does today; easier, less safe).
4. **Wording about "end-to-end encrypted".** Per sections 8 and C12 the product must not claim more than: the relay
   cannot read your chats; a thief with one unlocked device, or any program running as you on it, can use that
   device's keys. Please approve the plain-language statement before launch copy.

## 6. Could not test here

- Windows, macOS and Android: nothing was run on them. The Android backend uses Node 24.22.1 with OpenSSL 3.5.9, and
  the code uses only calls that exist there, but "under 3 s on the phone" is a prediction from 6 ms on this machine,
  not a measurement. Packaging an ES-only dependency into the Android backend and the Electron main process (finding
  5) is the one concrete thing to prove on each.
- Whether another process of the same user can read the Android backend's memory (finding 17b).
- Electron 44's bundled Node version (the binary is not in the worktree).
- What `safeStorage.isEncryptionAvailable()` returns on Linux when the backend is `basic_text` (docs silent).
- The OS unlock prompts (T11) and the Android Keystore with user-presence keys.
- Matrix and WhatsApp comparisons are from memory; Signal Sesame and Magic Wormhole pages were read.
- No outside cryptographic review of the 90-line CPace layer, the HPKE glue or the CBOR subset has happened; the test
  vectors prove the arithmetic, not the absence of other mistakes.
