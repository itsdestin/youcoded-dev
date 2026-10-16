    // --- Install-tips modal ---
    // Click on a download card opens the modal instead of starting the
    // download. The modal shows "Before you install" friction-bypass steps
    // and a collapsible "After install" section. The actual download fires
    // only when the user clicks the Download Now button in the footer.
    //
    // Content below is deliberately per-platform and tuned for each OS's
    // current gatekeeping behavior (Sequoia System Settings flow for macOS,
    // SmartScreen for Windows, sideload permissions + Play Protect for
    // Android, AppImage quirks for Linux). Keep language non-technical and
    // honest about *why* the warning appears — users who understand the
    // reason are more likely to proceed calmly.
    (function() {
      var modal = document.getElementById('install-modal');
      if (!modal) return;
      var body = document.getElementById('install-modal-body');
      var title = document.getElementById('install-modal-title');
      var downloadBtn = document.getElementById('install-modal-download-btn');
      if (!body || !title || !downloadBtn) return;

      // Universal "After install" content. Same on every platform. The
      // androidExtra HTML is appended only when the modal opens for Android.
      var AFTER_INSTALL = '' +
        '<ol>' +
          '<li>Sign in with GitHub.</li>' +
          '<li>Choose where your AI comes from &mdash; Claude, OpenRouter, or a model on this computer (Settings &rarr; Model Providers).</li>' +
          '<li>Pick a theme and browse the marketplace.</li>' +
        '</ol>';

      var ANDROID_AFTER_EXTRA = '' +
        '<p class="install-modal-note"><strong>On Android, expect one extra step:</strong> the first launch runs a one-time setup that downloads and unpacks the Claude Code runtime (~400&ndash;600MB depending on the package tier you pick). Keep the app open on the setup screen until it finishes &mdash; it\'s fast on Wi-Fi.</p>';

      // Per-platform structured content. Each entry builds into the modal
      // body via renderPlatform() — keeping content data-shaped rather than
      // HTML-string-shaped makes it easier to tweak wording without touching
      // markup.
      var platforms = {
        'dl-windows': {
          platformLabel: 'Windows',
          intro: 'YouCoded is open-source and isn\'t signed with a Microsoft code-signing certificate yet. Windows will show a warning on first launch &mdash; this is expected. Here\'s how to get past it.',
          steps: [
            'Open the file you just downloaded (the YouCoded installer).',
            'Windows SmartScreen will likely show a blue window: <strong>"Windows protected your PC."</strong> Don\'t click the big "Don\'t run" button.',
            'Click the small <strong>More info</strong> link under the warning text. A <strong>Run anyway</strong> button will appear.',
            'Click <strong>Run anyway</strong>. The installer will proceed normally.',
            'You only see this prompt the first time. Windows remembers your choice for future launches.'
          ],
          note: null
        },
        'dl-macos': {
          platformLabel: 'Mac',
          intro: 'YouCoded is open-source and isn\'t signed with an Apple Developer certificate yet (it costs $99/yr 😢). macOS will block it on first launch &mdash; this is expected. Here\'s how to get past it.',
          steps: [
            'Open the file you just downloaded, then drag YouCoded into your <strong>Applications</strong> folder.',
            'Open your <strong>Applications</strong> folder and double-click YouCoded. macOS will show a warning: <em>"YouCoded can\'t be opened because Apple cannot check it for malicious software."</em> Click <strong>Done</strong>.',
            'Open <strong>System Settings → Privacy &amp; Security</strong> (Apple menu → System Settings).',
            'Scroll down to the <strong>Security</strong> section. You\'ll see a note: <em>"YouCoded was blocked to protect your Mac."</em> Click the <strong>Open Anyway</strong> button next to it.',
            'Enter your password or use Touch ID to confirm.',
            'Go back to your Applications folder and double-click YouCoded one more time. A final dialog appears &mdash; click <strong>Open</strong>.',
            'You only have to do this the first time. After that, YouCoded opens normally.'
          ],
          note: null
        },
        // Linux is the one platform where the right file depends on the
        // distro, and the browser can't tell us which one it is. So this entry
        // carries `variants` instead of `steps`/`note`: the modal renders a
        // picker (see renderVariantPicker) and swaps in that variant's steps
        // and download URL. Ordered most-common-first; the first AVAILABLE one
        // is the default, so Debian-family users — the majority — get the
        // right file without touching the picker.
        'dl-linux': {
          platformLabel: 'Linux',
          intro: 'Linux packages come in a few flavours. Pick your distribution and you\'ll get the one that installs like any other app &mdash; with a menu entry you can pin.',
          variants: [
            {
              key: 'dl-linux-deb',
              label: 'Ubuntu, Debian, Linux Mint, Pop!_OS',
              hint: 'Installs like any other app, with a menu entry.',
              steps: [
                'Open the <code>.deb</code> you just downloaded &mdash; double-clicking hands it to your software centre (GNOME Software, Discover, or similar), which installs it like any other app and pulls in anything it needs.',
                'If your desktop doesn\'t open it automatically, right-click the file → <strong>Open With → Software Install</strong>. From a terminal instead: <code>sudo apt install ./youcoded_*.deb</code>.',
                'Launch YouCoded from your applications menu &mdash; and pin it to your dock or taskbar if you want it handy.'
              ],
              note: null
            },
            {
              key: 'dl-linux-rpm',
              label: 'Fedora, RHEL, openSUSE',
              hint: 'Installs like any other app, with a menu entry.',
              steps: [
                'Open the <code>.rpm</code> you just downloaded &mdash; double-clicking hands it to your software centre (GNOME Software, Discover, or similar), which installs it like any other app.',
                'If your desktop doesn\'t open it automatically, from a terminal: <code>sudo dnf install ./youcoded-*.rpm</code> &mdash; on openSUSE, <code>sudo zypper install ./youcoded-*.rpm</code>.',
                'Launch YouCoded from your applications menu &mdash; and pin it if you want it handy.'
              ],
              note: null
            },
            {
              key: 'dl-linux-pacman',
              label: 'Arch, CachyOS, Manjaro',
              hint: 'Native package. Installs with one pacman command.',
              steps: [
                'Install the file you just downloaded: <code>sudo pacman -U youcoded-*.pacman</code>',
                'Launch YouCoded from your applications menu &mdash; and pin it if you want it handy.'
              ],
              // Honest about why this one isn't a double-click: Arch simply has
              // no graphical installer for standalone package files.
              note: '<strong>Why a command here?</strong> Arch has no graphical installer for standalone package files &mdash; <code>pacman -U</code> is the normal way to install one, and it\'s the same command an AUR helper would run for you.'
            },
            {
              // Always last, always offered: the universal fallback for
              // distros we don't ship a native package for.
              key: 'dl-linux',
              label: 'Something else',
              hint: 'AppImage &mdash; one file, runs on any distribution.',
              steps: [
                'Open the AppImage you just downloaded &mdash; most file managers run it on a double-click.',
                'If double-clicking does nothing, the file needs permission to run. In your file manager: right-click the file → <strong>Properties → Permissions</strong> → tick <strong>"Allow executing file as program"</strong> (the wording varies by desktop). From a terminal instead: <code>chmod +x YouCoded-*.AppImage</code>, then launch it with <code>./YouCoded-*.AppImage</code>.',
                'YouCoded opens straight from the file &mdash; nothing is copied into your system.',
                '<strong>To keep it around:</strong> move the AppImage somewhere permanent (such as a <code>~/Applications</code> folder) before you rely on it &mdash; if it sits in <code>~/Downloads</code> and you clear that folder, your launcher breaks. For a real menu entry you can pin to your taskbar, install <a href="https://github.com/TheAssassin/AppImageLauncher" target="_blank" rel="noopener">AppImageLauncher</a>: it adds an icon and menu entry for any AppImage automatically the first time you run it.'
              ],
              // FUSE belongs to the AppImage alone — the native packages don't
              // depend on it. Verified on a clean Ubuntu 24.04 VM: the AppImage
              // dies with `dlopen(): error loading libfuse.so.2`, while the .deb
              // declares zero fuse deps. `libfuse2` is correct here even though
              // 24.04 renamed the real package to libfuse2t64 — apt resolves it
              // via Provides, and this spelling also works on Debian/Mint.
              note: '<strong>If the app doesn\'t start:</strong> some distributions need the FUSE library the AppImage depends on. Install it with your package manager &mdash; <code>sudo apt install libfuse2</code> (Debian/Ubuntu/Mint), <code>sudo dnf install fuse-libs</code> (Fedora/RHEL), <code>sudo pacman -S fuse2</code> (Arch/CachyOS/Manjaro), or <code>sudo zypper install fuse</code> (openSUSE). Still nothing? Launch the AppImage from a terminal &mdash; it will print the underlying error.'
            }
          ]
        },
        'dl-android': {
          platformLabel: 'Android',
          intro: 'YouCoded isn\'t on the Google Play Store yet, so you\'ll install it directly from the APK you just downloaded. Android asks for permission the first time you do this.',
          steps: [
            'When the download finishes, tap the notification (or open <strong>Files → Downloads</strong> and tap the YouCoded APK).',
            'Android will say <em>"For your security, your phone isn\'t allowed to install unknown apps from this source."</em> Tap <strong>Settings</strong>.',
            'Enable <strong>Allow from this source</strong> for whichever app you\'re installing from (usually Chrome). Tap back.',
            'Tap <strong>Install</strong>. If <strong>Google Play Protect</strong> shows a warning, tap <strong>More details → Install anyway</strong>. Play Protect often doesn\'t recognize apps that aren\'t in the Play Store &mdash; this is normal.',
            'Wait for the install to finish, then tap <strong>Open</strong>.'
          ],
          note: '<strong>On Samsung phones:</strong> The "Allow from this source" setting lives under <strong>Settings → Biometrics and security → Install unknown apps</strong> if Android doesn\'t take you there automatically.'
        }
      };

      // Format a byte count as "XX MB". Returns null if bytes is null/missing.
      function formatSize(bytes) {
        if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return null;
        var mb = bytes / 1024 / 1024;
        // Under 10 MB → one decimal, over → round. Keeps label compact.
        return mb < 10 ? mb.toFixed(1) + ' MB' : Math.round(mb) + ' MB';
      }

      // Which variant the user picked, remembered across reopens of the modal
      // (null = "not chosen yet", so the default below applies).
      var chosenVariantKey = null;

      // Variants whose asset actually exists in the latest release. The
      // AppImage entry is kept unconditionally: it's the universal fallback,
      // and if the release fetch failed we still want a working button
      // (resetDownloadButton falls back to the /releases/latest page).
      function availableVariants(p) {
        if (!p.variants) return [];
        var have = window.__youcodedReleaseAssets || {};
        return p.variants.filter(function(v) {
          return v.key === 'dl-linux' || (have[v.key] && have[v.key].url);
        });
      }

      // The variant to render: the user's pick if it's still on offer,
      // otherwise the first available (most-common distro family first).
      function activeVariant(p) {
        var vs = availableVariants(p);
        if (!vs.length) return null;
        for (var i = 0; i < vs.length; i++) {
          if (vs[i].key === chosenVariantKey) return vs[i];
        }
        return vs[0];
      }

      // Radio list of distro choices. Returns '' when there's nothing to
      // choose between (e.g. a release with only an AppImage) so those users
      // see exactly the modal they saw before this existed.
      function renderVariantPicker(p, active) {
        var vs = availableVariants(p);
        if (vs.length < 2) return '';
        var opts = vs.map(function(v) {
          var size = formatSize(((window.__youcodedReleaseAssets || {})[v.key] || {}).sizeBytes);
          return '' +
            '<label class="distro-option">' +
              '<input type="radio" name="distro" value="' + v.key + '"' +
                (v.key === active.key ? ' checked' : '') + '>' +
              '<span class="distro-option-text">' +
                '<span class="distro-option-label">' + v.label + '</span>' +
                '<span class="distro-option-hint">' + v.hint + (size ? ' &middot; ' + size : '') + '</span>' +
              '</span>' +
            '</label>';
        }).join('');
        return '<fieldset class="distro-picker">' +
          '<legend>Which distribution do you use?</legend>' + opts + '</fieldset>';
      }

      // Build the modal body HTML for a given platform, including the
      // "After install" collapsible and (for Android) the runtime-size note.
      // Platforms with `variants` (Linux) take their steps/note from the
      // active variant and get a picker above them.
      function renderPlatform(platformKey) {
        var p = platforms[platformKey];
        if (!p) return '';
        var active = p.variants ? activeVariant(p) : null;
        var content = active || p;
        var stepsHtml = content.steps.map(function(s) { return '<li>' + s + '</li>'; }).join('');
        var noteHtml = content.note ? '<p class="install-modal-note">' + content.note + '</p>' : '';
        var pickerHtml = active ? renderVariantPicker(p, active) : '';
        var afterInstallHtml = AFTER_INSTALL + (platformKey === 'dl-android' ? ANDROID_AFTER_EXTRA : '');
        return '' +
          '<p class="install-modal-intro">' + p.intro + '</p>' +
          pickerHtml +
          '<div class="install-modal-section">' +
            '<ol>' + stepsHtml + '</ol>' +
            noteHtml +
          '</div>' +
          '<details class="install-modal-details">' +
            '<summary>After install: What to expect on first launch</summary>' +
            '<div class="install-modal-section">' + afterInstallHtml + '</div>' +
          '</details>';
      }

      // The asset key the Download Now button should point at: the chosen
      // variant for Linux, the platform's own key everywhere else.
      function downloadKeyFor(platformKey) {
        var p = platforms[platformKey];
        var active = p && p.variants ? activeVariant(p) : null;
        return active ? active.key : platformKey;
      }

      // Reset the Download Now button to its "unclicked" state. Called on
      // every openModal() so reopening the same platform's modal doesn't
      // leave a stale "Download Initiated" label.
      //
      // `assetKey` is usually the platform/card id, but for Linux it's the
      // chosen variant's key (dl-linux-deb/-rpm/-pacman) — see downloadKeyFor.
      function resetDownloadButton(assetKey, label) {
        downloadBtn.removeAttribute('data-initiated');
        downloadBtn.textContent = label;

        // Resolve href + size from whatever the latest-release fetch captured.
        // If the fetch hasn't completed yet (or failed), fall back to the
        // generic /releases/latest page so the button is never broken.
        var asset = (window.__youcodedReleaseAssets || {})[assetKey];
        if (asset && asset.url) {
          downloadBtn.href = asset.url;
          var sizeLabel = formatSize(asset.sizeBytes);
          if (sizeLabel) {
            downloadBtn.textContent = label + ' (' + sizeLabel + ')';
          }
        } else {
          downloadBtn.href = 'https://github.com/itsdestin/youcoded/releases/latest';
        }
      }

      // Which platform's modal is currently open — the picker's change
      // handler needs it to re-render the right body.
      var openPlatformKey = null;

      function openModal(platformKey) {
        var p = platforms[platformKey];
        if (!p) return;
        openPlatformKey = platformKey;
        title.textContent = 'Before you install YouCoded on ' + p.platformLabel;
        body.innerHTML = renderPlatform(platformKey);
        resetDownloadButton(downloadKeyFor(platformKey), 'Download Now');
        modal.setAttribute('data-open', '');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }

      // Picking a distro swaps the steps and repoints the download button.
      // Delegated because the radios are re-created on every render.
      body.addEventListener('change', function(e) {
        var t = e.target;
        if (!t || t.name !== 'distro' || !openPlatformKey) return;
        chosenVariantKey = t.value;
        body.innerHTML = renderPlatform(openPlatformKey);
        resetDownloadButton(downloadKeyFor(openPlatformKey), 'Download Now');
      });

      function closeModal() {
        modal.removeAttribute('data-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }

      // Card click: intercept navigation and open the modal instead.
      // The card's own href still exists as a no-JS fallback — if JS is
      // disabled, clicking just navigates to /releases/latest as before.
      ['dl-windows', 'dl-macos', 'dl-linux', 'dl-android'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', function(e) {
          e.preventDefault();
          openModal(id);
        });
      });

      // Download Now click: flip the button to "Download Initiated" *before*
      // the default navigation runs. We don't preventDefault — the anchor's
      // native click-to-download (or new-tab) is what actually starts the file.
      downloadBtn.addEventListener('click', function() {
        downloadBtn.setAttribute('data-initiated', '');
        downloadBtn.textContent = 'Download Initiated';
      });

      modal.addEventListener('click', function(e) {
        if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-close')) closeModal();
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.hasAttribute('data-open')) closeModal();
      });
    })();