---
id: 89
title: Explore a YouCoded app for iPhone
stage: explore
priority: P2
tags: other-features, misc, feature
branch: 89-explore-bringing-youcoded-to-ios
created: 2026-10-15
summary: iPhones can only use YouCoded through Safari pointed at another device; compare ways to offer a real iPhone app.
area: Devices & sync
side: both
vision: everywhere.added.ios
work: session/89-iphone-app
---
Progress
Done: Built on session/89-iphone-app: a native iPhone shell (Swift) around the desktop's own engine and page, like Android. A cloud Mac builds it and starts it in an iPhone simulator (setup screens, taps, typing all pass). On this computer, under iPhone-like conditions, a full conversation works. iPhone-only handling: no program installs at setup, Claude Code reads 'Needs a computer', no shell tool, in-app file search, marketplace installs without git, no update notice.
Next: Put it on a real iPhone through TestFlight (workflow ios-testflight.yml is ready): needs the app created in App Store Connect and the Apple signing credentials allowed for it. Then a phone test. Later: teach the counting service 'ios'; let Mesh accept the iPhone's Keychain; resolve three small overlaps when the automations branch lands.
Blocked: Signing: the Apple credentials only work from master today, and the app does not exist in App Store Connect yet. Both are Destin's to do or approve.

Chats
- 2026-11-26 session/89-iphone-app: chat started

From the old roadmap (other-features › misc, status decision, seen on n/a, last checked 2026-09-23)
Explore bringing YouCoded to iOS. Today an iPhone only reaches the app through Safari pointed at another device. Options: a native app around the shared interface (minus on-device runtime, which App Store rules refuse), a pair-to-desktop-only app, or a web client over an encrypted remote connection. Wanted: a written comparison of cost, App Store limits and what each can do before any build. Constraint: an iPhone app cannot start other programs and rule 2.5.2 bars downloaded code, so no bash, git or Claude Code on the phone; likely shape is the built-in assistant with in-app file tools plus "connect to my computer". Destin 2026-10-05 triage (roadmap-triage-2026-10-05#4): postponed until after 1.3.1
