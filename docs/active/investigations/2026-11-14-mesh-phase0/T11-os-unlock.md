---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0, T11 - can the app require the OS unlock before adding or removing a device (design 5.1 "Unlock", section 9 row T11, O4)
---

# T11 - OS unlock prompts

## 1. Verdict

**PARTIAL (research only; nothing could be run on Windows, macOS or Android from this Linux
machine).** Pass line: "Works, or O4 goes to Destin." Result: it works out of the box on
**none** of the four systems with the app as built today. Every system needs either new code
(Android, macOS, Windows) or a choice (Linux, and the fallback for every system). So **O4 does go
to Destin** (section 5), but a narrow, answerable form of it.

## 2. What was done

- Read the app's packaging: `youcoded/desktop/electron-builder.yml`, `package.json`.
- Searched the app for any existing unlock code: `rg -n -i 'biometric|BiometricPrompt|KeyguardManager|promptTouchID|canPromptTouchID|UserConsentVerifier|pkcheck|polkit|fprintd'` over `youcoded/` (excluding node_modules and lockfiles). Hits: only `desktop/src/main/update-installer.ts` (pkexec for package updates) and `desktop/src/main/harness/tools/admin-command.ts` (refuses assistant commands that would raise a polkit dialog), plus two test/type files. **No hit anywhere under `youcoded/app/`** (Android): no BiometricPrompt, and no `androidx.biometric` dependency (`rg -n biometric app/build.gradle.kts` empty).
- Read Electron's own source for `promptTouchID` (`shell/browser/api/electron_api_system_preferences_mac.mm`) and the `node-mac-auth` README.
- Ran, on this Linux machine, with no prompt shown (no `--allow-user-interaction`): `pkcheck --action-id org.youcoded.fake.action --process $$` and `pkcheck --action-id org.freedesktop.policykit.exec --process $$`.
- Checked the running desktop: `ps` shows `polkitd` and `polkit-kde-auth` (a polkit prompt agent) running.

## 3. Findings

Packaging facts (they decide feasibility):

1. Windows ships as an NSIS installer, macOS as a DMG (ad-hoc signed for ordinary builds, Developer ID for releases), Linux as **AppImage, deb, rpm and pacman** (`electron-builder.yml` lines 6, 33, 76-82). Android is a separate Kotlin app (`app/`, minSdk 28, targetSdk 35: `app/build.gradle.kts:54-55`) that starts the Node backend as a child process (`BackendService.kt:181`).
2. The app already ships `koffi` (a library that lets Node call a system's C functions without compiling anything): `desktop/package.json:55`. It is used by the sudo-password helper. It can call plain C interfaces; it cannot comfortably call Objective-C blocks (macOS LocalAuthentication) or WinRT objects (Windows Hello).
3. `npmRebuild: false` in the build config: a new native add-on would need its build step added to CI for each OS.

Per system:

**macOS**

4. Electron has `systemPreferences.canPromptTouchID()` and `promptTouchID(reason)` (https://www.electronjs.org/docs/latest/api/system-preferences). Evidence of what it really asks for: its source line 510 uses `LAPolicyDeviceOwnerAuthenticationWithBiometricsOrWatch` (https://raw.githubusercontent.com/electron/electron/main/shell/browser/api/electron_api_system_preferences_mac.mm). That policy means **fingerprint or Apple Watch only; no password fallback**. A Mac with no Touch ID (any Mac mini, iMac, or a laptop used with the lid closed on an external keyboard) answers "cannot prompt". Nothing is prompted, nothing is checked.
5. The password-fallback version of the same question is `LAPolicyDeviceOwnerAuthentication`, which shows Touch ID and offers the Mac login password. Electron does not expose it. `node-mac-auth` (https://github.com/codebytere/node-mac-auth) wraps the same biometric call and says it "does not nor is it intended to perform process privilege escalation"; UNVERIFIED whether it can be told to use the password policy (I could not read its source file). Getting the password version needs a small native add-on or a small helper program shipped inside the app, built on a Mac.
6. Cheaper, ugly stand-in that needs no native code: ask macOS's own admin dialog through `osascript` ("do shell script ... with administrator privileges"). UNVERIFIED here (no Mac); known to work and to show "osascript wants to make changes", not YouCoded's name.

**Windows**

7. The Windows Hello check is `UserConsentVerifier`. For a desktop (non-store) program Microsoft says to use the interop interface `IUserConsentVerifierInterop::RequestVerificationForWindowAsync`, which needs the app window's handle (https://learn.microsoft.com/en-us/windows/win32/api/userconsentverifierinterop/nf-userconsentverifierinterop-iuserconsentverifierinterop-requestverificationforwindowasync). A plain `RequestVerificationAsync` is for store (UWP) apps.
8. **No maintained npm package** for this was found in two searches (only React Native's `react-native-windows-hello` and a Rust crate that does the same interop call). It needs a small custom native add-on (about one file of C++/WinRT) built in CI on Windows, or a small helper .exe. UNVERIFIED on a real Windows machine; `koffi` is not a good fit for WinRT.
9. If Hello is not set up, `UserConsentVerifier` reports the verifier as unavailable (it has a separate availability check). Windows can still be asked for the account password through a different, older call (`CredUIPromptForWindowsCredential`, plain C, which `koffi` can call). UNVERIFIED; this is the likely no-Hello fallback on Windows.

**Linux**

10. The design says "a polkit prompt". A **custom** polkit action does not work without installing a file system-wide. Proof from this machine: `pkcheck --action-id org.youcoded.fake.action` returned exit 127 with "Action org.youcoded.fake.action is not registered". Polkit actions are defined by `.policy` files in `/usr/share/polkit-1/actions`, root-owned (https://documentation.suse.com/sles/html/SLES-all/cha-security-polkit.html).
11. What each Linux install can do about that: **deb, rpm and pacman** installs run as root, so the package can drop the `.policy` file in place (electron-builder's deb/rpm accept extra files and an after-install script; this is new packaging work). **AppImage** installs without root: it cannot register an action at all. **Flatpak/Snap**: the app is not shipped that way today (`rg -n -i 'flatpak|snap' electron-builder.yml` empty), so out of scope, but a sandbox would also block calling polkit.
12. A built-in action that exists everywhere polkit does: `org.freedesktop.policykit.exec` (what `pkexec` uses). Measured here: `pkcheck --action-id org.freedesktop.policykit.exec --process $$` answered "auth_admin" without showing anything. Using `pkexec /bin/true` as the "prove you are here" step therefore needs **no install**, shows the system's own password window, and, where the user has fingerprint login set up, that window offers the fingerprint too (polkit prompts through the same login modules). Catches: (a) the window text is generic ("run /usr/bin/true as the super user"), not YouCoded's wording; (b) it asks for an **administrator** account, so on a standard (non-admin) account it asks for someone else's password; (c) the app already uses `pkexec` for package updates (`update-installer.ts:456`), so this is a known pattern, and the assistant itself is forbidden to run it (`admin-command.ts:5-6`).
13. A desktop with **no prompt agent running** (a bare window manager, a server with a remote desktop): polkit then cannot show the question and the check fails. Here an agent is running (`polkit-kde-auth`), so it cannot be shown to fail from this machine. UNVERIFIED on a bare window manager.
14. `fprintd` (fingerprint) is reached through polkit's login-module stack, so no separate Linux fingerprint work is needed; where it is not set up, the user just types the password.

**Android**

15. `BiometricPrompt` with `BIOMETRIC_STRONG | DEVICE_CREDENTIAL` shows fingerprint or face, with the phone's PIN/pattern/password as the built-in fallback (https://developer.android.com/identity/sign-in/biometric-auth). **It is not used anywhere in the app yet** (search above), so it is new code plus the `androidx.biometric` dependency.
16. **Version catch:** that combination is **not supported on Android 10 (API 29) and lower**; the app's minSdk is 28. On 28-29 the app must check `KeyguardManager.isDeviceSecure()` and use the older `createConfirmDeviceCredentialIntent` screen.
17. A phone with **no screen lock** at all: `canAuthenticate` reports "none enrolled". Then there is nothing for the OS to ask, and the app needs its own fallback (below).
18. The prompt needs a visible activity on the phone and the pairing logic runs in the Node backend, so the backend must ask the Kotlin app through a new host call, the way it already does for `keepAwake` and `notify` (`BackendService.kt:242-248`).

## 4. What this changes in the design

- **5.1 "Unlock", replace the bullet with:** "**Unlock** for adding and removing a device: Android `BiometricPrompt` with the phone's screen lock as fallback (Android 10 and older: the older screen-lock confirmation); macOS Touch ID or Apple Watch, with the Mac login password as fallback (needs a small native piece; Electron's own call has no password fallback); Windows Hello, with the Windows password as fallback (needs a small native piece); Linux: the system password window through polkit's built-in `pkexec` action, which needs an administrator account and no installation. Where a system offers no unlock (see O4), the app asks the user to confirm in its own window, and tells every other device 'a device was added/removed here'."
- **Section 7.1 (changes by area):** add "a small native unlock helper per desktop OS" and "an Android host call `unlock`".
- **O4 (section 13):** reword to the two choices in section 5 below.
- **Section 12:** add "Unlock needs a small piece of native code on macOS and Windows and an Android library; none exists today."

## 5. Needs Destin

O4, as plain choices. The case: a desktop where the computer itself has no unlock to ask for (a Linux computer with no password-window program running, a standard non-admin Linux account, an AppImage-only user, a Windows or Mac user with no password/Hello/Touch ID set up, or an Android phone with no screen lock).

Choice 1, **"Ask in the app and warn the others" (recommended).** Adding or removing a device shows a confirmation window inside YouCoded ("Add this device? Only continue if this is you"), and your other devices immediately show a notice "A device was added from X". Pro: works on every computer with zero setup; the notice means a stranger at an unlocked laptop cannot add a device quietly. Con: someone sitting at your already-open, unlocked computer can still add a device; the notice only tells you afterwards.

Choice 2, **"Make you set a YouCoded password on those computers".** If a computer offers no unlock, YouCoded asks you to create its own password the first time, and asks for it for adding/removing. Pro: stops the person at the unlocked computer. Con: one more password to remember; forgotten password means a reset path must be built and designed; extra setup screen for a rare case.

Choice 3, **"Refuse".** On such a computer, adding/removing a device is simply not allowed; use another device. Pro: simplest and strictest. Con: a Linux user with no prompt program is locked out of managing their devices from that computer.

Recommendation: Choice 1 for everyone, with the real OS unlock used wherever the computer has one. It never blocks a user and it is the cheapest to build.

Also needs a yes: the wording of the Linux password window will be the system's generic one (finding 12), not YouCoded's.

## 6. Could not test here

- **Windows**: whether Hello can be raised from Electron through a custom add-on, and what is shown when Hello is not set up.
- **macOS**: `promptTouchID` on a Mac with no Touch ID; whether a password-capable add-on works inside an ad-hoc signed build; the `osascript` stand-in.
- **Android**: the whole thing; the API 28-29 path.
- **Linux**: a computer with no polkit agent; an account that is not an administrator; fingerprint login; the actual `pkexec` window (not run: it would have shown a window on Destin's screen).
