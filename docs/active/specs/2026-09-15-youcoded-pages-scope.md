---
status: active
date: 2026-09-15
---

# YouCoded Pages — approved product scope

## Approval and stage

Destin approved the twelve-part plain-language scope summary in conversation on 2026-09-15: “okay, i think this looks good!” This records product scope, not approved screen designs, a technical implementation contract, permission to implement, or shipping authorization.

Opening decisions are preserved in `docs/active/design/2026-09-15-youcoded-pages/youcoded-pages.questions.answers.json`. Subsequent conversation clarified page isolation, computer programs, live themes, general connections and custom services. Those clarifications are recorded here, not fabricated as answers in the opening deck. Visual review and the sourced contract remain required before implementation.

## Product

Custom web apps inside YouCoded, created through conversation, following its live theme. Users can make dashboards, calendars, spreadsheet workspaces, games, paint studios, writing tools, specialized assistants or computer control panels. These are freely programmable pages, not a fixed dashboard widget collection. Example categories do not promise a first-party implementation or universal third-party compatibility.

## First-release scope

### 1. Library and navigation

- Permanent Pages icon between Settings and Projects; users cannot remove it.
- Personal and project-owned pages, with explicit source bindings rather than silently switching files when the current project changes.
- Optional pinned page icons in the top-left navigation, with narrow-screen/overflow access.
- Built-in Projects participates as a protected destination. Custom pages do not rewrite or replace it initially.

### 2. Live native appearance

- Shared page UI kit supplies app-standard controls, spacing, action ordering, typography, accessible interaction and states.
- Platform delivers the current theme at page startup and updates it live, including user-created and marketplace themes.
- Switching themes must not rebuild pages, reset their working state or discard unsaved work.
- Controls and surrounding presentation follow the theme; user content such as paintings, photos and game art retains its intended colors. Charts retain meaningful distinctions between series.
- The creator validates multiple themes and live theme switching; copying the current theme's literal colors is not sufficient.

### 3. Built-in creator and editing

- Ordinary saved chat plus the existing preview experience, extended for safe Page previews as necessary.
- Creator skill builds page presentation, source connections and actions using supported platform facilities.
- Draft edits remain separate from the working version until applied. A previous working version remains recoverable.
- No separate builder chat/history system in the initial release.

### 4. Isolated page code and storage

- Custom page code can calculate, render, animate, implement games/editors, use bundled libraries and keep page-owned data.
- Outside access goes through host-controlled capabilities. Generated code does not receive unrestricted app APIs or computer access by default.
- Isolation includes controlling outside network connections, not merely hiding credentials.
- Programmability is not a permission category: JavaScript inside an isolated page differs from a computer program because of enforced access, not its language or an assistant's interpretation of its intent.

### 5. Files and device capabilities

- Open selected files, save to chosen locations, and explicitly grant persistent folder access when necessary.
- Appropriate permissions for device features such as microphone, camera, clipboard and notifications where supported; not every possible hardware integration is a launch requirement.
- Page-owned storage is separate from access to unrelated pages or user files.
- Prefer meaningful, action-based grants over blanket “read files” access.

### 6. Service connections

- General service connections support public data and supported credential/sign-in methods without requiring a bespoke integration for each provider.
- Trusted YouCoded UI owns connection setup and credential entry/storage; generated page code does not receive underlying credentials.
- Access limits describe what is actually enforceable. An allowed service address is not automatically read-only access. HTTP method alone does not establish that distinction.
- Supported narrow operations may offer stronger limits than a general request connection.
- Explain combined access: a page allowed both file reads and outside requests may transmit that information.
- Some providers require app registration, approved return addresses, review or other setup. Neither a skill nor a local program guarantees access to an unsupported service.

### 7. Custom services and adoption

- The skill can create reusable service definitions using the same connection machinery as supported services.
- Definitions describe sign-in/refresh mechanisms, destinations, requested account access and exposed operations. Prefer configuration interpreted by the trusted host for standard flows, not arbitrary authentication programs.
- Separate “unreviewed service” from “runs unrestricted computer code.” Both warnings apply when both are true; one must not imply the other.
- Sign-in establishes identity; Calendar, Drive and similar features need corresponding access and operations.
- Multiple pages may reuse a service, but reusing an account does not automatically authorize every page.
- Marketplace custom services can later become reviewed/supported services with compatible page-facing behavior. Review applies to a version, not all future releases.
- Preserve compatible connections when safe. Broader account access, changed sign-in destinations or execution privileges require renewed approval. Changing the provider's application registration may require signing in again.

### 8. Assistant tasks within pages

- Selected-model tasks, custom inputs, progress and results presented inside the page.
- Host-owned task lifecycle with cancellation, permission-scoped tools and appropriate spending limits.
- Model access is not an indirect grant to execute commands or read unrelated files.
- Account for unavailable models, failed tasks and previously saved results without inventing error causes.

### 9. Optional computer programs

- Advanced pages may use local scripts, installed tools or supporting programs outside the page environment.
- Explicit broad permission: run programs on this computer with the user's computer-account access unless a separate restriction is genuinely enforced.
- Managing process startup/output/cancellation is not a security sandbox. Reviewing code or describing its purpose is not a guarantee of its behavior.
- Approval attaches to the approved executable version and relevant access; changed program code must not silently inherit trust.
- Installing or previewing marketplace content does not automatically execute its supporting computer programs.
- Stopping/revoking prevents future authorized activity and stops managed work; it does not undo prior effects or promise control over every detached external effect.

### 10. Background activity

- Refresh on opening where appropriate; optional per-page background work while YouCoded is running.
- Background permission is separate from file, connection, model or computer access, and does not expand those grants.
- Visible activity, stop controls and limits for paid work.
- Local work pauses when the computer sleeps or YouCoded closes. Closed-app durable scheduling is not an initial promise.
- Coordinate later scheduling with Agents & Automations instead of creating a competing general job system.

### 11. Marketplace at launch

- Publish/install reusable pages and custom services; do not reduce launch scope to personal-only or export/import-only.
- Separate packages from credentials, private data, account connections and recipient permissions.
- Trust-sensitive updates require approval; reviewed status must not silently extend to unreviewed changed versions.
- Exact review, identity, update and compatibility mechanisms require technical design after the visual flow is approved.

### 12. Platforms and proving examples

- Desktop plus paired remote access initially. Pages fit small screens; desktop-backed remote work requires the host online.
- Independent Android execution is later scope, not inferred from the shared renderer.
- First end-to-end examples: Destin's analytics dashboard and a spreadsheet/report page using a selected model.
- Analytics should reuse its service-side data processing with controlled authenticated reads and page-side visualization; no unrestricted local backend is inherently needed.

## Later work, retained within the Pages roadmap

- Dedicated visual editor with chat alongside preview, drag/reorganize/resize and useful element-editing tools (explicit request in Q-chat).
- Independent Android support.
- Closed-app/durable background automation coordinated with Agents & Automations.
- Additional first-party service integrations, including calendar use cases, according to user value.
- Stronger restricted execution for computer programs if justified; do not imply this exists in the initial version.

## Existing foundations and remaining design

Read-only architecture discovery found reusable header/Projects navigation, theme engine and UI primitives, isolated HTML previews, session permission machinery and model/specialist execution. These are foundations, not a Pages implementation. Existing command and task APIs are conversation-owned; directly calling tool execution would not automatically supply the required driver permission checks.

The new central responsibility is a Pages host: identity, storage, pinning, isolation, theme delivery, connections, permission ownership, task/program lifecycle and marketplace installation/update behavior.

Entry points inspected by the architecture explorer: `youcoded/desktop/src/renderer/components/HeaderBar.tsx`, `components/artifact-views/HtmlView.tsx`, `themes/theme-engine.ts`, `components/ui/`, `youcoded/desktop/src/main/harness/permission-engine.ts`, `tools/bash.ts`, `tools/task.ts` and `native-session-host.ts`. Analytics HTML was separately inspected read-only in the shared marketplace checkout at `wecoded-marketplace/worker/src/admin/dashboard-html.ts`; that component was not provisioned in this session workspace.

## Next stage

Build order lives in `docs/active/plans/2026-09-16-youcoded-pages-phasing.md` (2026-09-16).
Phases 1 (the shell) and 2 (connections) are built; files, model tasks and the marketplace stay
open questions answered per phase.

**Where later decisions changed this scope** (each recorded in the plan with its deck):
§3 — there is no separate draft: an edit goes live and git history is the undo (2026-09-17).
§4 and §6 — outside access is now enforced by the app, as this scope asked (Phase 2).
§12 — "pages fit small screens" is not true yet; the phone layout is an open roadmap item. Destin reviews decks himself; the automated UX tester, code
reviewer and grader are not used. Conversation approval here is product scope, not a signed UI
contract, and does not authorize shipping.
