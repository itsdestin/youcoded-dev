---
id: 155
title: Connect Google and work with selected Drive files
stage: planning
tags: google, integrations, files, feature
vision: marketplace.browse.integrations, chat.files
branch: 155-connect-google-and-work-with
finish: Connect Google, select or create a file, ask for changes, approve as required, and save back to Google Drive.
created: 2026-10-18
why: Destin, 2026-10-17: "i want a simple and straightforward integration with google docs/slides/drive etc"; "i want to start building out our google integration". Approved: YouCoded-owned sign-in; user-selected Drive files (drive.file) plus new files; read/edit/save Docs, Sheets and Slides back to Drive. Reusable sign-in/account management; Calendar next, Gmail separate, Contacts/tasks later. No whole-Drive search or embedded Google editor in the approved first scope. Carry forward multiple accounts, prepare/finalize separation, restrictive configurable permissions, per-device credentials, and useful legacy capabilities. Source: session/integrations-research at 109a2161, docs/active/design/2026-09-26-everyday-actions/{proposal.md,questions.answers.json}; conversation dfa75edb-b39c-4a57-a71f-36dc6c439378. October files-first decision supersedes September calendar/email-first tiers. Next: design review, then implementation plan; no live account changes authorized. drive.file is non-sensitive per Google docs checked October 17; validate actual scopes/privacy/AI-provider policy before implementing.
work: session/google-connections-planning
---
Progress
Done: Files-first scope and separate follow-ups saved; historical source commit and conversation linked. Planning only; no Google account or app changes.
Next: Design the connection/account and select-create-edit-save flow. Resolve account routing, file access versus chat attachment lifetime, reconnect/revocation, action approvals, conflict handling, desktop/Android/remote and both assistant engines. Reuse old capability knowledge, not the old broad OAuth scopes. Then approve implementation plan.
Blocked: No implementation blocker established; UI contract and exact OAuth/data-policy checks still required.

Chats
- 2026-10-18 session/google-connections-planning: Recovered approved direction from 109a2161 on session/integrations-research and this conversation. Follow-ups: #156 Calendar, #157 Gmail, #158 Microsoft/Apple, #159 contacts/tasks. Source records remain historical: no old review-price estimates, Android/remote limitations, or unimplemented proposal should be treated as current truth. Preserve source branch until full records are reconciled; do not merge its retired ROADMAP.md or docs/roadmap files.
