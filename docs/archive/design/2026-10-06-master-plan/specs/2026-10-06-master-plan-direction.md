---
status: draft
---

# YouCoded master plan — direction and decision record

## Purpose

Connect Destin's product vision to existing roadmap items, active work and draft plans, and make that relationship easy to see. This is a discovery record, not an implementation specification or authorization to migrate the roadmap.

## Product vision expressed by Destin

A user-owned, open-source computing environment, with provider choice and local-model options, portable data and customization, and community-built alternatives to subscription-dependent software. An OS-like cross-device experience is a long-term outcome, not a chosen distributed-systems architecture.

- Pages become customizable apps, potentially with services and databases.
- Users install, remix, and republish; parent/variant relationships preserve provenance.
- Marketplace items support reviews and bug reports.
- Open-source tools such as document editors and Home Assistant integrate into a coherent workspace.
- The agent runtime is reusable in chat, Pages, project automations and personal background work.
- Pages may associate tools/MCP connections and agents, with reusable building blocks and templates.
- Assistant-guided setup complements forms when services require account creation, credentials or complex configuration.
- Mesh connects personal devices for data availability and execution; host selection, replication and offline behavior remain undecided. Sync and backup are distinct requirements.

## Direction accepted in this conversation

Destin accepted a shared planning foundation with private and public views, and then accepted GitHub as the initial community intake/discussion system.

- GitHub Issues owns community reports, discussions and issue open/closed state.
- Portable version-controlled planning records own strategic structure, priorities and milestones.
- Detailed specifications and implementation plans remain linked Markdown documents.
- An in-app planning Page and a public page, potentially at youcoded.ai/roadmap, connect those sources rather than creating independently editable duplicates.
- Initial public output is an explicitly sanitized read-only snapshot. Private content must not be shipped to a browser and merely hidden.
- Community reporting and edits initially link to GitHub. Custom community accounts, comments and full bidirectional synchronization are not initial requirements.
- Several reports can link to one underlying issue; several issues can support an initiative. Preserve original author, date and wording where available. Unknown provenance remains unknown.
- Private voice/conversation requests must not automatically become public issues.

The public URL, record format, API/authentication approach, update cadence, final UI and migration process are not approved designs. A YouCoded-specific first version with reusable parts is the assistant's recommendation; general marketplace packaging has not been decided.

## Existing context — first-pass documentary inventory

These sources were identified by a read-only specialist. Their stated statuses are not independently verified implementation or release status.

- `docs/active/specs/2026-09-01-agent-platform-vision-and-state.md`: agent-focused vision, not a whole-product master tracker.
- `docs/active/specs/2026-09-15-youcoded-pages-scope.md`: approved Pages product scope includes services, model tasks, background activity and marketplace distribution; scope is not shipping authorization.
- `docs/active/plans/2026-09-16-youcoded-pages-phasing.md`: staged delivery and recorded status.
- `docs/roadmap/native-harness.md`: automations-related work, project tools, parked Mesh/Cloud.
- `docs/roadmap/marketplace.md`: existing catalog, installation and community-related work.
- `docs/roadmap/sync.md` and `remote-access.md`: current cross-device concerns, distinct from the long-term Mesh vision.
- `ROADMAP.md`: existing index and filing grammar. It remains the current tracker until an approved migration changes that.

The initial sweep covered roadmap files and direct children of active plans/specs/handoffs; nested documents and current worktrees still need reconciliation. Finance and Home Assistant work must not be inferred complete or incomplete from branch names alone.

## Next design work

1. Verify existing Pages capabilities and public-site deployment constraints.
2. Reconcile nested planning documents and relevant ongoing work without modifying other sessions.
3. Present remaining product choices in the required questions deck, without reopening accepted direction unnecessarily.
4. Review visual designs using representative existing work, including one initiative with several reports and one private conversation source.
5. Define migration, source ownership, public projection and verification before implementation.
