---
id: 157
title: Add Gmail without delaying Google files
stage: explore
tags: google, integrations, email, privacy, feature
needs: 155
vision: marketplace.browse.integrations, chat.steer.permissions
branch: 157-add-gmail-without-delaying-google
created: 2026-10-18
why: Destin approved treating Gmail separately from Google Drive/Docs/Sheets/Slides on 2026-10-17. Reuse the Google connection. September proposal separated local drafts/send from inbox reading/organizing; user chose option A (advanced setup first) and asked about app passwords. App-password and Apps Script alternatives were explanations/proposals, NOT selected implementation. Determine scopes, Google restricted-access verification/security assessment obligations, AI-provider data policies and work/school restrictions before committing to a route. Old audit price/time estimates are historical, not current quotes. Preserve restrictive configurable send/create permissions, local drafts before finalization, multiple accounts and per-device credentials. Source: session/integrations-research at 109a2161, docs/active/design/2026-09-26-everyday-actions/{proposal.md,questions.answers.json}; dfa75edb-b39c-4a57-a71f-36dc6c439378.
---
Progress
Done: nothing yet (no Gmail code, plan or branch with commits found).
Next: waits for the decision on the paused Google connection work (card #155). Then check whether the existing google-services plugin already covers Gmail before planning anything new.
Blocked: #155 is paused (Destin is comparing rclone against the current sign-in approach). Gmail rules (Google approval, AI data policy, work/school limits) also still open.

Chats
