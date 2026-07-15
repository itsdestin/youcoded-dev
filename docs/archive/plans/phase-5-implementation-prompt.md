---
status: shipped
origin: wecoded-marketplace@eecc843:docs/phase-5-implementation-prompt.md
---

## Task: Unified Marketplace — Phase 5: Android Theme Marketplace

### Context

We're unifying YouCoded's three separate content systems into a single marketplace. The full plan is at `wecoded-marketplace/docs/unified-marketplace-plan.md`. Read it before starting.

Phases 0-4 should already be completed. The unified marketplace works fully on desktop. This phase brings theme marketplace support to Android in four incremental steps. Each step is independently shippable — commit and report after each one.

### Background: How themes work today

**Desktop:** Built-in themes (light, dark, midnight, creme) are JSON files compiled into the React bundle, applied via CSS custom properties and localStorage. Custom themes are downloaded to `~/.claude/wecoded-themes/<slug>/` with a `manifest.json` and optional assets (images, SVGs, CSS). Assets are served via Electron's custom `theme-asset://` protocol registered in `theme-protocol.ts`. A file watcher (`theme-watcher.ts`) monitors the themes directory and pushes reload events to the renderer.

**Android:** Built-in themes work perfectly — they're in the React bundle, applied via CSS + localStorage. Custom themes don't work at all: no protocol handler for `theme-asset://`, no directory scanning, no IPC handlers for theme marketplace operations. The React marketplace UI renders (it's shared) but every button is a no-op.

### What you need to do

**Step 1: Familiarize with the codebase.** Read these files:

Desktop theme system:
- `youcoded/desktop/src/main/theme-protocol.ts` — the `theme-asset://` protocol handler. URL format, path resolution, security checks, MIME types. This is what you're replicating on Android.
- `youcoded/desktop/src/main/theme-watcher.ts` — fs.watch on themes dir, debounce, IPC events
- `youcoded/desktop/src/main/theme-marketplace-provider.ts` — registry fetch, install (download manifest + assets, validate, write to disk), uninstall
- `youcoded/desktop/src/renderer/state/theme-context.tsx` — how themes are loaded, applied to DOM, hot-reloaded
- `youcoded/desktop/src/renderer/themes/theme-asset-resolver.ts` — converts relative paths to `theme-asset://` URIs for user/community themes

Android:
- `youcoded/app/src/main/kotlin/com/destin/code/ui/WebViewHost.kt` — WebView setup. No theme-asset handler. Has `shouldOverrideUrlLoading` but no `shouldInterceptRequest`.
- `youcoded/app/src/main/kotlin/com/destin/code/runtime/SessionService.kt` — the IPC dispatcher. No `theme:marketplace:*` handlers exist.
- `youcoded/app/src/main/kotlin/com/destin/code/bridge/LocalBridgeServer.kt` — WebSocket server on :9901. Understand the message format for adding new handlers.

IPC definitions:
- `youcoded/desktop/src/main/preload.ts` — theme marketplace IPC channels (lines ~244-261): list, detail, install, uninstall, publish, generatePreview
- `youcoded/desktop/src/renderer/remote-shim.ts` — WebSocket equivalents. Check if theme marketplace methods are already defined here.

**Step 2: Implement in four incremental steps.**

#### 5a. Theme browsing

Add bridge message handlers to `SessionService.kt`:
- `theme:marketplace:list` — fetch theme registry from `wecoded-marketplace/themes/index.json` (same URL desktop uses), apply filters, return entries with `installed` status
- `theme:marketplace:detail` — return full entry for a given slug

To determine installed status, scan `~/.claude/wecoded-themes/` for directories containing `manifest.json`.

After this step: Android users can open the Themes tab, browse themes, see token-based previews, read descriptions. They can't install yet.

#### 5b. Token-only theme install

Add bridge message handlers:
- `theme:marketplace:install` — download manifest.json from the registry entry's `manifestUrl`, validate, write to `~/.claude/wecoded-themes/<slug>/manifest.json`. Do NOT download assets yet.
- `theme:marketplace:uninstall` — delete the theme directory. Only allow for community-source themes (not user-created).

The React theme system will pick up the manifest and apply token-based styling (colors, border-radius, layout settings) automatically — these are pure CSS custom properties that work in any WebView.

After this step: Android users can install and apply themes that only use color tokens. Themes with custom assets (background images, particles, mascots) will apply their colors but show broken images for assets.

#### 5c. Custom theme assets

Implement `shouldInterceptRequest()` in `WebViewHost.kt`:

```kotlin
webViewClient = object : WebViewClient() {
    override fun shouldInterceptRequest(
        view: WebView?,
        request: WebResourceRequest?
    ): WebResourceResponse? {
        val url = request?.url ?: return null
        if (url.scheme == "theme-asset") {
            val slug = url.host ?: return null
            val path = url.path?.trimStart('/') ?: return null
            val themesDir = File(homeDir, ".claude/wecoded-themes")
            val file = File(themesDir, "$slug/$path")
            // Security: verify resolved path is inside themes dir
            if (!file.canonicalPath.startsWith(themesDir.canonicalPath)) {
                return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", null, null)
            }
            if (!file.exists()) {
                return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null)
            }
            val mimeType = when (file.extension.lowercase()) {
                "jpg", "jpeg" -> "image/jpeg"
                "png" -> "image/png"
                "webp" -> "image/webp"
                "svg" -> "image/svg+xml"
                "css" -> "text/css"
                "json" -> "application/json"
                else -> "application/octet-stream"
            }
            return WebResourceResponse(mimeType, null, file.inputStream())
        }
        return super.shouldInterceptRequest(view, request)
    }
}
```

Update the install handler (5b) to also download asset files listed in the registry entry's `assetUrls`.

After this step: All themes work fully on Android — background images, particle SVGs, mascots, custom CSS, everything.

#### 5d. Theme hot-reload

Add a `FileObserver` (or `FileObserver` subclass) watching `~/.claude/wecoded-themes/`:
- On file changes (CREATE, MODIFY, DELETE), extract the theme slug from the path
- Debounce per slug (100ms, matching desktop's pattern)
- Send a `theme:reload` push event via the bridge WebSocket with the slug
- The React renderer already listens for `theme:reload` events and handles them

After this step: Theme changes (from /theme-builder or manual edits) are reflected live on Android without restarting the session.

### Important rules

- Sync every repo before starting: `git fetch origin && git pull origin master`
- Use a worktree for the work
- Annotate code edits with brief inline comments
- Each of the four steps (5a-5d) should be a separate commit
- Test each step independently — 5a works without 5b, 5b works without 5c, etc.
- The `shouldInterceptRequest` approach is preferred over serving via HTTP on :9901 — it's the direct Android equivalent of Electron's protocol.handle()
- Security: always verify resolved file paths are inside the themes directory (prevent path traversal)
- Do NOT push — report what you did and what branch it's on
