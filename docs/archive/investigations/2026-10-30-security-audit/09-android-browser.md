# 09 - Android app + the assistant's Browser (static review, read-only)

Scope: youcoded/app/src/main (manifest, kotlin, res/xml), app/build.gradle.kts, app/runtime/*, plus desktop/src/main/assistant-browser/*, harness/tools/untrusted.ts, remote-local.ts, remote-origin.ts, remote-server.ts (local-mode auth). Paths below are relative to the worktree's `youcoded/` folder unless absolute.

## Summary
No Critical or High issues found. Seven Medium/Low items worth fixing or disclosing. The architecture is sound: the Android app has one exported component (the launcher activity), no FileProvider, no deep links, and a token-gated loopback backend; the Browser runs in a separate process with its own profile and no app IPC. The weakest points are (B1) the Browser's Chromium is launched with its sandbox OFF, (B2) the "confirm before buy/send" guard is word-matching, so it is friction not a barrier (the code itself says so), and (A1) cleartext traffic is allowed app-wide.

---
## Findings

### B1 - Browser's Chromium runs with `--no-sandbox` (Medium)
- Justification: a Chromium renderer exploit on any visited page would land directly in the user's OS account (no sandbox layer), and the Browser visits arbitrary sites by design.
- Attacker/precondition: hostile website + a Chromium renderer bug (not present today; this removes the second line of defence).
- Steps: assistant visits page -> renderer exploited -> code runs as the desktop user with no sandbox.
- Evidence: `desktop/src/main/assistant-browser/browser-service.ts:412-433` calls `launchPersistentContext` and sets no `chromiumSandbox`. Playwright-core 1.64 adds `--no-sandbox` unless `chromiumSandbox === true` (`desktop/node_modules/playwright-core/lib/coreBundle.js:44764-44765`). grep for `chromiumSandbox|no-sandbox` in assistant-browser/ returns nothing.
- Mitigations: separate OS process (utilityProcess), dedicated profile, the browser is kept up to date only if the user's installed Chrome is used / downloaded Chromium is current; DOM text is framed as untrusted.
- Confidence: Confirmed (code + library source). Exploitability: Speculative.
- Fix: pass `chromiumSandbox: true` in `launchPersistentContext`; test on Linux (needs user namespaces / suid sandbox) and Windows/macOS; fall back with a logged warning rather than silently.

### B2 - "Confirm before buy/send/delete" is a text-matching heuristic; a page can evade it (Medium)
- Justification: the guard exists and the model cannot skip it, but a hostile page can choose labels/structure that do not match, so a prompt-injected assistant could take a harmful click after only a one-time "allow clicking on this site" approval.
- Attacker/precondition: page text injects instructions; user previously clicked "Allow for this chat" (or "Always allow") for that site.
- Steps: page shows a button labelled e.g. "Continue", icon-only, or non-English ("Comprar", "Bestellen"), whose handler purchases/posts. `isFinalStep` sees no FINAL_WORDS, no FINAL_PATHS, no form submit match -> only the per-site grant applies -> action runs. Also a plain `BrowserNavigate` to a state-changing GET URL never asks ("opening/reading pages never asks").
- Evidence: `browser-tool-runners.ts:92-93` (regexes FINAL_WORDS / FINAL_PATHS, English only), `:95-115` isFinalStep, `:466-` act() ask flow; header comment at `:1-20` says "This is friction ... not a sandbox".
- Existing mitigations (verified): runs in the worker process, so the model cannot bypass it (`browser-host.ts:178-185` routes every call through `runBrowserTool`); the element is re-read from the live page, not from model words (`elementInfo`, `:118-153`); re-checks host and element after the user answers (`:340-368`); declined step refused for 2 min (`:60`); password fields flagged hidden; JS dialogs: confirm/prompt auto-declined (`browser-service.ts:682-691`); My Chrome asks per new site.
- Confidence: Confirmed (design limit, documented by authors). Fix: add a "default-deny for unknown buttons on pages that look like checkout/account/mail" heuristic or a semantic pass (ask the model-free check on URL path + any `<form method=post>`), localise word lists, and treat any click on a cross-origin `<form action>` POST as final. Disclose honestly as "reduces risk, not a guarantee".

### B3 - Page sub-requests can still reach the home network / localhost (Medium-Low)
- Justification: public page JavaScript can send blind requests (fetch no-cors, form POST, img) to `127.0.0.1` / router / local dev servers; only Document loads are screened.
- Evidence: `browser-tool-runners.ts:520-538` header comment: "Requests a page's scripts and images make are not covered"; `browser-service.ts:469-485` route only intercepts `resourceType() === 'document'`; DNS-rebinding window acknowledged in `browser-net.ts:13-15`.
- Impact: write-only (CSRF-style) against unauthenticated local services; cannot read responses cross-origin (CORS). YouCoded's own local servers need a token/password (see OK list), so the app itself is not exposed by this.
- Mitigations: Chromium Private Network Access preflights (partial). Confidence: Confirmed gap; impact Likely low.
- Fix: also route `fetch/xhr/script/image` requests whose resolved address is private when the top page is public (same `navigationVerdict`), pin resolved IP.

### B4 - Navigation guard waves through non-http schemes, including `file:` (Low)
- Evidence: `browser-tool-runners.ts:523-525`: `if (!/^https?:/i.test(url)) return 'allow'` ("data:, about:, blob:") - `file:` is treated the same.
- Why not exploitable today: model navigation is normalised to http/https only (`browser-net.ts:105-114`, `browser-tool-validation.ts`); the person's address box rejects file:/chrome:/javascript: (`browser-net.ts:~117`); Chromium itself refuses http(s) pages navigating/redirecting to file://. So a prompt-injected page cannot make the model read local files through the Browser. (Tested by reading code paths only, not by running.)
- Confidence: Likely safe; defence gap only. Fix: make the guard an allow-list (`https?:`, `about:blank`, `data:`, `blob:`) and block `file:`, `chrome:`, `view-source:`, `devtools:` explicitly - cheap insurance if a future Chromium or "My Chrome" tab starts on file://.

### B5 - "My Chrome" mode exposes the user's real signed-in Chrome (Low-Medium, opt-in, by design)
- Evidence: `browser-my-chrome.ts` (reads DevToolsActivePort, connects `ws://127.0.0.1:<port>`), `browser-service.ts:449-465` connectOverCDP; guard for it is CDP Fetch on Document requests only (`installNavigationGuard`, `browser-tool-runners.ts:540-557`). The own-profile guard is `ctx.route` which is not used in My Chrome (browser-wide route would hit the user's tabs).
- Mitigations: experimental, off by default; Chrome itself shows "Allow?"; every new site asks (no "Always"), `:480-497`; cookies of the user's Chrome are reachable by whatever the assistant does after approval.
- Fix/disclosure: keep labelled Experimental; recommend a prominent warning that page text can try to steer the assistant inside signed-in accounts.

### B6 - Downloads auto-saved without asking (Low)
- Evidence: `browser-service.ts:692` `page.on('download')`, `:989-1001` saveDownload -> `userData/assistant-browser/downloads/<session>/<sanitized name>`; `acceptDownloads: true` (`:419`). Name sanitised (`:1368-1372`, slashes, dots, control chars), unique-ified, capped at 20 files/chat, pruned after 7 days (`:1011-1033`); programs flagged to the model "do not open or run it".
- Not executed, not in the user's Downloads folder, not auto-opened. Residual: disk fill, and the model could later hand a file to the user ("file-sharing tool") - gated by the model's judgement and the note. Confidence: Confirmed. Fix: optional size cap per file; consider block-listing executables outright.

### B7 - Possible indirect secret exposure through screenshots (Info)
- Screenshots of signed-in pages are kept in `shots/` for 7 days (`browser-service.ts:1011-1025`) - noted by authors (F12). Fine; mention in privacy notes.

### A1 - Cleartext HTTP/WS permitted for every host (Medium)
- Justification: any network traffic the app makes over http:// or ws:// (e.g., remote-access pairing to a LAN/Tailscale IP) can be read or altered by someone on the same Wi-Fi.
- Evidence: `app/src/main/res/xml/network_security_config.xml` `<base-config cleartextTrafficPermitted="true"/>`; manifest points at it (`AndroidManifest.xml:36`).
- Existing mitigations: remote pairing sends a password handshake (bcrypt on the host), Tailscale users get WireGuard under it; authors documented the trade-off (file comment). The WebView forces `MIXED_CONTENT_NEVER_ALLOW` (`AppWebView.kt:46`). Backend (Node on-device) uses its own TLS stack for HTTPS APIs; not governed by the NSC.
- Gap: LAN pairing sends the pairing password in cleartext; downloads from the paired desktop use http (`WebViewUrlRouter` MINTED_PATH over http/https) with a bearer-style token in the URL.
- Confidence: Confirmed. Fix: restrict cleartext to private ranges - NSC cannot do CIDR, so enforce in code (refuse cleartext to non-RFC1918/CGNAT/loopback hosts) or ship TLS for the remote path. Disclose in Play "Data safety" (already planned in the file comment).

### A2 - `allowFileAccessFromFileURLs = true` on the WebView (Low)
- Evidence: `AppWebView.kt:44-46` (`allowFileAccess = true`, `allowFileAccessFromFileURLs = true`, `allowUniversalAccessFromFileURLs = false`). Deprecated setting; likely needed so the bundled `file:///android_asset/web` page's module scripts load.
- Risk: if script ever runs inside the app page (XSS in chat rendering), it may read other `file://` paths readable by the app (the whole private data dir: home, conversations, backend.log). The page also holds the `YouCodedHost` bridge and the backend token in its URL, so XSS is already high impact; this widens it to direct file reads.
- Mitigations: navigation to any file:// other than the asset folder is BLOCKED (`WebViewUrlRouter.decide`, `isBundledAsset`, tests exist per comments); HTML previews run in sandboxed iframes without same-origin (`components/artifact-views/HtmlView.tsx:41` `allow-scripts allow-popups allow-forms`, `ArtifactThumbnail.tsx:233` `sandbox=""`, `PageHost.tsx:710`). Note `office/EditorFrame.tsx:861` has `allow-scripts allow-same-origin` - worth a separate check that its source is only app-bundled content.
- Confidence: Likely (setting confirmed; exploit needs an XSS). Fix: serve assets via `WebViewAssetLoader` over `https://appassets.androidplatform.net` and turn both file-access flags off.

### A3 - Unrestricted schemes passed to `ACTION_VIEW` from WebView navigations (Low)
- Evidence: `AppWebView.kt:73-76` `openExternally` -> `startActivity(ACTION_VIEW, Uri.parse(url))` for anything `WebViewUrlPolicy.decide` doesn't recognise (`WebViewUrlRouter.kt` `else -> OPEN_EXTERNALLY`), so `intent:`, `tel:`, `sms:`, `market:`, `content:` links in rendered chat text reach the system. By contrast the backend's own `openExternal` only allows http(s) (`BackendService.kt:~193`).
- Impact: a link needs a user tap; Android shows the target app or dialog. `intent:` URIs are not parsed with `Intent.parseUri`, so no intent smuggling - plain Uri VIEW only.
- Confidence: Confirmed; severity Low. Fix: allow only http, https, mailto (and maybe tel) in `openExternally`.

### A4 - Build-time supply chain: downloads have no hash/signature pinning (Low)
- Evidence: `app/runtime/build-runtime.sh:43` (patchelf tarball from GitHub), `:50` (Alpine APKINDEX), `:72` (musl source), `:166` (Claude Code npm tarball). All HTTPS; `grep -i sha|checksum|gpg` across build-runtime.sh, resolve-apk.py, pins.env finds nothing for integrity. Versions are pinned (`pins.env`) but not hashes.
- Not a runtime issue: the phone does NOT download a Linux environment; everything ships inside the APK (`RuntimeInstaller.kt` unpacks bundled assets only). Impact limited to a compromised mirror/CDN at build time.
- Fix: record SHA-256 for each artefact in pins.env and verify; verify Alpine APKINDEX signature (abuild keys).

### A5 - Secrets fallback to plain preferences when Keystore fails (Low)
- Evidence: `runtime/PairedDeviceStore.kt:46-58` falls back to unencrypted `remote_devices` SharedPreferences (private app storage, not external). `SecretKeyStore` (backend secret key) uses the same `prefs()` so it would also land unencrypted in that case. Also uses deprecated `MasterKeys` API.
- Mitigation: file lives in app-private storage (other apps cannot read; not rooted devices). Fix: surface a warning instead of silent downgrade; migrate to Keystore directly.

### A6 - Claude Code and its tools run as the app's own Android user (Info/accepted design)
- Anything the assistant runs on the phone can read the whole private app dir (conversations, paired-device prefs file (encrypted), logs, `~/.claude`). Authors already keep the backend token and secrets key out of the environment (stdin, `headless-main.ts:20-45`; `BackendService.kt:140-150`). Noted for the baseline statement: the phone's trust boundary is the app sandbox, not per-tool.

---
## Checked and OK (with evidence)

Android
- Only one exported component: `MainActivity` with the LAUNCHER intent filter (`AndroidManifest.xml:46-56`); `BackendService` is `exported="false"` (`:63-69`). No receivers, no providers, no `<data>` intent filters or deep links. `MainActivity.kt` does not read intent extras/data (no `getIntent`/`onNewIntent` matches).
- No `FileProvider` and no `file_paths.xml` exist (res/xml contains only network_security_config.xml), so no root-path exposure.
- `allowBackup="false"` (`AndroidManifest.xml:37`); no `debuggable` attribute in the manifest; `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)` (`AppWebView.kt:34`) so release builds are not inspectable.
- `allowUniversalAccessFromFileURLs = false`, `MIXED_CONTENT_NEVER_ALLOW` (`AppWebView.kt:45-46`).
- JS bridge `YouCodedHost.invoke` requires the per-run 64-hex token, compared in constant time (`HostJsBridge.kt:~50-55`); methods are a fixed allow-list (`TYPES`, `handle`) - none run commands or read arbitrary files; replies are escaped via `JSONObject.quote` (`:~130-140`). Only `@JavascriptInterface` method is `invoke`.
- Link routing: dev servers (`localhost`) are NOT loaded in place in release (they'd reach the bridge) (`WebViewUrlRouter.kt:~118-125`); file:// only inside android_asset, with `..`/encoded-slash rejection (`isBundledAsset`); host compared exactly, not by prefix; minted-download links only from paired hosts, strict 43-char token path, sanitised file names, no hidden files, bidi/invisible char stripping, saved into Downloads by DownloadManager (`:90-170`).
- `theme-asset://` handler blocks path escape with canonical-path prefix check (`AppWebView.kt:103-108`).
- Local backend server: bound to `127.0.0.1` only in local mode (`remote-server.ts:377`), WebSocket must authenticate with this run's 32-byte random token before anything works (`remote-server.ts:899-906`, `remote-local.ts:13-17` timingSafeEqual, `BackendService.kt:randomHex(32)` via SecureRandom); token goes to the node process on stdin, not env or argv. Other phone apps can reach the port but cannot sign in without the token; Origin check for cross-site pages (`remote-origin.ts`, `remote-server.ts:459-489`) allows opaque origin by design (needs token anyway).
- Abstract unix socket for backend->phone calls checks `peerCredentials.uid == myUid` (`HostSocketServer.kt:~37`); host calls: `openExternal` http(s) only, `notify`, `keepAwake` (wake lock capped 4 h).
- PendingIntents are `FLAG_IMMUTABLE` (`Notifier.kt:19,34`, `BackendService.kt`).
- Zip/tar extraction rejects path traversal (`RuntimeInstaller.kt:untarGz` canonical-path check).
- Release signing: `storePassword`/`keyPassword` read from git-ignored `keystore.properties` (`build.gradle.kts:11-14,66-72`), `*.jks`, `*.keystore`, `keystore.properties` are in `.gitignore`; only `app/debug.keystore` (public "android" password, debug only) is un-ignored, and `git ls-files` shows no real keystore tracked. Release has `isMinifyEnabled`/`isShrinkResources` (`:106-107`). `releaseTest` uses debug signing and a separate app id.
- `minSdk 28`, `targetSdk 35` (`build.gradle.kts:54-55`): modern WebView/Keystore; cleartext default is relaxed only by the NSC noted above.
- Permissions requested are limited to INTERNET, FOREGROUND_SERVICE(+special use), POST_NOTIFICATIONS, WAKE_LOCK, CAMERA (QR pairing), RECORD_AUDIO (voice) - both asked at runtime.
- No runtime download of Linux environment/packages: assets bundled (`RuntimeInstaller.kt`); NSC aside, there is no HTTP bootstrap to attack.

Browser (desktop)
- Isolation: the Browser is a Playwright-driven separate Chromium in a utilityProcess (`browser-electron.ts:25-33`, `browser-host.ts`), not an Electron `<webview>`/BrowserView: no app preload, no app IPC, no shared Electron session/cookies. Own profile folder `userData/assistant-browser/profile` (`browser-service.ts:398-399`). Pages cannot call YouCoded IPC. Nothing in assistant-browser/ uses `addInitScript`/`exposeBinding`/`exposeFunction`.
- Permissions (camera/mic/geolocation/notifications): no `grantPermissions` or permission handler anywhere in assistant-browser/, so Chromium defaults apply (prompt in a shown window, denied when headless); not auto-granted.
- JS dialogs: alert/beforeunload accepted, confirm/prompt dismissed (`browser-service.ts:682-691`).
- Page text is wrapped as `<untrusted-content>` for every tool result (screenshots, outlines, errors) and look-alike closing tags are neutralised (`untrusted.ts:12-22`; `browser-tool-runners.ts` many `wrapUntrusted` calls); the MCP instructions tell the model not to follow page instructions (`browser-tool-specs.ts` / MCP server instructions).
- The guards live in code inside the worker (`browser-tool-runners.ts`): site-permission ask for click/type per site, final-step ask every time, home-network ask per host:port, metadata/link-local never (`browser-net.ts:35-56`, classification uses resolved IP and the worst answer), declined asks block repeat for 2 min. The model cannot bypass them: tool calls only enter via `runBrowserTool`; there is no tool that evaluates arbitrary JS or sets input files (`browser-tool-specs.ts` lists navigate/act/snapshot/screenshot/tabs/history/wait/zoom/ask-user).
- Model-side navigation accepts only http/https (`normaliseAddress`, `browser-net.ts:105-114`); person's address box rejects file:, javascript:, data:, chrome:, view-source: (`personAddress`).
- Claude Code relay: Unix socket in private 0700 dir / named pipe, token via 0600 config, timingSafeEqual, session id must belong to a live Claude Code session (`claude-code-browser-mcp.ts:17-26,199-258`).
- Downloads: sanitised names, stored under the app's data dir, capped, pruned, executables flagged (see B6).
