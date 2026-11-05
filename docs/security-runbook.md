# Bad-day checklist (security runbook)

What to do when something goes wrong with YouCoded's security. The top part is for Destin. The rest is for
the assistant he hands it to. Built 2026-11 with the security watch, the attack alarms and the update
alarms. The private record of the September 2026 review is `~/system/youcoded-security-2026-09-10/`.

Where the watchers live: daily bundled-component check `youcoded/scripts/security-watch.mjs`
(`.github/workflows/security-watch.yml`); hourly release check `youcoded/scripts/release-watch.mjs`; hourly
server alarms `wecoded-marketplace/worker/src/security/alarms.ts`. All three push to the `NTFY_TOPIC` channel.

## For Destin: the first minute

1. **Don't panic, and don't delete anything yet.** Logs and history are how we find out what happened.
2. Open YouCoded (or Claude Code) in the `youcoded-dev` workspace and say:
   **"Security emergency: <paste the alert or describe what you saw>. Follow docs/security-runbook.md."**
3. If the alert says *a release changed outside the normal process* or *new sign-in to an admin account*
   and **it wasn't you**, also do these two things yourself right away (only you can):
   - GitHub → Settings → Sessions: **sign out of all other sessions**, then change your GitHub password.
   - GitHub → Settings → Developer settings → Personal access tokens: **delete any you don't recognise**.

Your phone alerts never say more than "look now". The details are in GitHub (Actions runs and the
`security-watch` issues) and in Cloudflare's worker logs, which only you can open.

## For the assistant: how to work an incident

- Read before you act; write down the timeline as you go (in `docs/active/investigations/<date>-incident.md`).
- Do not delete releases, accounts, logs or branches before Destin confirms. Disabling (turning a switch off,
  revoking a token) is fine once he agrees; destroying evidence is not.
- Every secret below lives in GitHub repo secrets; rotating one = make a new value at its source, set the
  secret (`gh secret set`), then re-run the workflow that pushes it. Never paste a secret into chat or a file.

### 1. "A YouCoded app release changed outside the normal release process" (release watch)
Source: `youcoded/.github/workflows/release-watch.yml` → its run log names the release, file and uploader.
- Open the release on GitHub. If Destin uploaded it by hand, done: note it and stop.
- Otherwise: ask Destin to **mark the release as a draft** at once (hides it from the updater and download
  page without destroying it). Then compare each file's checksum with the release workflow's own run.
- The in-app updater only installs files signed with `UPDATE_SIGNING_KEY` (public half in
  `desktop/src/main/update-signing-key.ts`), so a swapped installer is refused by existing apps **unless the
  signing key itself leaked**. People downloading fresh from the website have no such check: assume they are
  exposed until the files are restored.
- Find how they got in: GitHub audit log (Settings → Security log), Actions runs, deploy keys, new tokens.

### 2. "Unusual sign-in activity / new logins / several networks hit the sign-in limit" (worker alarms)
Source: `wecoded-marketplace/worker/src/security/alarms.ts`; details in Cloudflare → Workers → Logs
(lines starting `security alarm`).
- A burst that stops on its own is usually a bot hitting the per-network cap: note it, no action.
- A sustained burst: set `REQUIRE_LOOPBACK_SIGNIN = "1"` in `worker/wrangler.toml` only if every supported
  app version sends a loopback port (the safer sign-in shipped after v1.3.3), and merge: that refuses the
  link-only sign-in an attacker would use.
- To sign everyone out (a stolen session store, a bad session bug): delete all rows of the `sessions` table
  through a reviewed migration; every user then signs in again. Destin decides.

### 3. "New sign-in to a YouCoded admin account" and it wasn't Destin
- Do the two GitHub steps in the first-minute list (the admin account IS his GitHub identity).
- Remove that account's sessions (`DELETE FROM sessions WHERE user_id = …` via a reviewed migration).
- Check `/admin/*` use in the worker logs for the same hour: catalog changes, moderation actions.

### 4. A key or token may have leaked
| Secret | Where it comes from | Rotate | Then |
|---|---|---|---|
| `UPDATE_SIGNING_KEY` (youcoded) | ed25519 key made in Sept 2026 | New key pair; private half to the secret | **Needs a release**: apps trust the public key built into them, so a new public key only protects people after they update. Until then, an attacker with the old key could sign updates: treat as the worst case; draft any release you didn't make. |
| `KEYSTORE_*` (youcoded) | Android signing keystore | Cannot be swapped for existing installs (Android ties updates to it) | Play/APK users would need a reinstall under a new key. Escalate to Destin before anything. |
| `CF_API_TOKEN`, `MARKETPLACE_CF_ANALYTICS_TOKEN` | Cloudflare → My Profile → API Tokens | Roll the token | Re-run `worker-deploy.yml` (pushes secrets). Check Cloudflare audit log. |
| `MARKETPLACE_GH_CLIENT_SECRET` | GitHub OAuth app settings | Generate a new client secret, delete the old | Re-run `worker-deploy.yml`. Sign-ins keep working. |
| `MARKETPLACE_CATALOG_INGEST_TOKEN` | any long random value | New random value | Re-run `worker-deploy.yml`; the hourly ingest reads the same secret. |
| `NTFY_TOPIC` (youcoded, wecoded-marketplace) | a random channel name | New random name in both repos | Re-run `worker-deploy.yml`; Destin re-subscribes on his phone. |
| `YOUCODED_TEST_ANTHROPIC_KEY` | Anthropic console | Delete and recreate | Spending cap must be set on the new key. |
A leaked GitHub token of Destin's: he revokes it (first-minute list); then check the security log for what it did.

### 5. A community plugin turns out to be malicious
- Retire it from the catalog (the ingest's retire list) so nobody new installs it.
- Add its id to the plugin off-switch list so installed copies are turned off with a notice (built after
  the November 2026 review; until then, retiring only stops new installs).
- If it shipped in the official Anthropic collection, report it to Anthropic as well.

### 6. A theme turns out to be harmful
- The app re-cleans every drawing before showing it, and the registry now pins each file to a reviewed
  commit with a fingerprint. Remove the theme from `wecoded-themes/themes/` with a PR; the registry rebuild
  drops it. Installed copies stay until users remove them: say so in an announcement (`/announce`).

### 7. A serious known flaw (CVE) in something we bundle
- The daily security watch opens a `security-watch` issue and pings the phone for High/Critical.
- Fix in a branch (bump the version the issue names), and use the release process Destin approved for
  severe fixes. **Releases happen only when Destin says so.**

### 8. Someone reports a vulnerability privately
- GitHub private vulnerability reporting is on for every repo (Security → Advisories).
- Thank them within two days, confirm or rule out the problem, fix it in a private fork from the advisory,
  and publish the advisory with credit after the fixed release is out.
