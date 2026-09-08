---
status: active
---

# Repository public-truth and cleanup audit

## Purpose

Conduct a read-only, evidence-based audit of the YouCoded repository. The audit will identify:

- public documentation that no longer accurately describes YouCoded as an independent, cross-platform, model-flexible agentic assistant;
- public claims that disagree with the app, another public document, or a current provider policy;
- privacy explanations that fail to clearly distinguish local processing from third-party cloud-provider handling; and
- code, documentation, generated outputs, and configuration that may be stale, obsolete, or removable.

The audit is a recommendation document. It does not change, delete, archive, commit, deploy, or test against the running app.

## Product truth used for review

YouCoded is the product, not a Claude Code wrapper. It is an open-source assistant for everyday users, students, and professionals, available across desktop and Android with remote access. It supports more than one model path, including provider accounts/subscriptions, cloud APIs and local models. Its agent can work with user files and tools subject to the app's permission system. Claude Code compatibility remains a product capability, but it must not be presented as YouCoded's sole identity or requirement when current product behavior supports other paths.

This statement is a review lens, not a claim that every advertised capability is already shipped. The audit will mark vision, in-progress work, and verified current behavior separately.

## Scope

### Full repository archaeology

Review the tracked `youcoded` repository in these categories:

1. Application source, tests, build and deployment configuration, scripts, package manifests, vendored code and generated-looking assets.
2. Repository documentation, including active and historical plans/specifications where present.
3. Publicly deployed/documented material: README, landing page, license, privacy policy, terms, security policy, contribution guide, changelog, GitHub configuration, public site assets and service descriptions.
4. Git history and repository references where needed to establish whether a candidate remains active or was explicitly retired.

The review will not call an item removable based only on its age. A deletion recommendation requires concrete evidence, such as an explicit retirement/supersession marker, no production/configuration/build reference after a repository-wide search, a replacement already in use, or a generated artifact whose source/deployment path is independently verified.

### Privacy and data-retention truth

The public-policy review will specifically evaluate whether documents clearly explain these distinct cases:

- Conversations or files sent through a third-party cloud path may be retained and handled by that provider under that provider's own terms, privacy notice, account settings, and retention policy. The scope includes Anthropic/Claude, OpenRouter, and OpenAI/ChatGPT where those paths are offered.
- YouCoded should not imply that it controls, overrides, or can delete third-party provider records.
- Local-model conversations are processed on the user's device and are not sent to a cloud model provider for inference; therefore they are not subject to a cloud model provider's chat-retention policy. The audit will distinguish this from other optional network features the user may separately enable.
- The audit will separately identify what the YouCoded app stores locally and what product-operated services receive, retain, or transiently process.

Current external provider claims must be sourced to first-party provider documentation during the audit. Where a provider's policy varies by plan, API, account setting, region, or service, the recommendation will say so rather than flattening it into an absolute claim.

## Audit method

1. Inventory public-facing text and map each material product, privacy, pricing/free, compatibility, availability, count, and affiliation claim to code/configuration or a documented source of truth.
2. Search the whole repository for legacy, deprecated, superseded, obsolete, retired, TODO-removal, and duplicate/replacement signals; then verify candidates through imports, references, configurations, tests, build paths, and history.
3. Verify current third-party retention descriptions against official provider documentation.
4. Classify every finding by evidence and impact, avoiding speculative deletion recommendations.
5. Deliver a report with findings and recommendations only; no ready-to-paste replacement copy in this first pass.

## Deliverable

A Markdown audit report with:

1. an executive summary and current public-positioning assessment;
2. ranked public-document and landing-page findings;
3. a privacy/data-retention transparency section that clearly separates provider paths, local models, YouCoded-local storage, and YouCoded-operated services;
4. cleanup candidates grouped into:
   - safe to remove or archive,
   - requires a migration, configuration, or dependency change first,
   - retain despite age;
5. evidence for each finding: relevant paths, source checks, dependency checks, risk/confidence, and recommended next action; and
6. limitations and unanswered product/legal decisions.

## Safety and boundaries

- The audit is read-only after this design record is written.
- No live YouCoded app interaction, DevTools access, process signaling, settings access, deployment, or release activity is permitted.
- No code, documentation, policy, site, configuration, or asset changes are included in audit scope.
- The report is not legal advice. It will recommend transparency and identify claims needing counsel or owner confirmation where appropriate.

## Verification standard

Before a conclusion is reported:

- public claims are compared against the current app/source configuration and other public documents;
- removal candidates receive a repository-wide dependency/reference check;
- current provider-policy claims use a first-party source;
- broad negative claims state the exact search scope and any limitations.
