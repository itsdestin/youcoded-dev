# Brief: D1 + D2 — consent for file-defined specialists (the requirements the diff must meet)

Context: YouCoded's native harness can hire "specialists" (helper agents). Built-in ones
ship with the app; file-defined ones come from three folders: `~/.youcoded/specialists/`
(source 'personal'), `~/.claude/agents/` (Claude-Code user folder), `<cwd>/.claude/agents/`
(Claude-Code project folder). The Task tool hires them. A hire is gated by the parent's
permission engine: `permissionSubject` in `tools/task.ts` yields a subject string; the
engine's layers are presetRules → modeRules → denyList → rememberedRules, LAST MATCH WINS;
`ruleMatches` (`shared/subject-glob.ts`) is the only matcher (`match:'exact'` = byte-equal;
glob `*` = `[\s\S]*`, case-insensitive). `rememberedRuleFor` (`harness-session.ts`)
persists a non-Bash "Always allow" as `{tool, pattern: subject, action:'allow', match:'exact'}`
— so the SUBJECT SHAPE IS THE GRANT WIDTH.

## Destin's decisions (the spec)
D1 (accepted): in `auto-edit` mode a FILE-DEFINED helper must still show a consent card.
Built-in helpers keep today's behaviour exactly (no card in auto-edit). Full-auto unchanged.

D2 (his words: "that's fine" to this shape): every helper gets an Always-allow option, BUT
- cross-project Always-allow ONLY for helpers from folders the user controls
  (`~/.youcoded/specialists/`, `~/.claude/agents/`);
- a project's own `.claude/agents/` helper gets AT MOST a project-scoped grant;
- the grant is keyed to a content fingerprint of the definition file so an edit re-asks.

## Global Constraint carried from plan 1c (still binding)
Two mechanisms keep a hire grant from leaking between helpers: (a) subject scoping in
`tools/task.ts`; (b) the renderer stays default-closed (no Always-allow offered) while the
helper's definition is unknown. Built-in subjects must not change (existing grants survive).
No child may hire (no recursion). Nothing needs mirroring to Android/remote for this change.

## Expected shapes
- grantScope on `SpecialistDefinition`: 'builtin' | 'user' | 'project', stamped by the
  CATALOG (the only place that knows the folder — `source:'claude-code'` spans two folders).
- subjects: builtin `${charter}:${workDir}`; user `${charter}:file:${id}@${fp}`;
  project `${charter}:${workDir}:file:${id}@${fp}`; fp = sha256(file bytes) first 12 hex.
- auto-edit adds `{tool:'Task', pattern:'*:file:*', action:'ask'}` AFTER the broad Task allow.
- Renderer: Always-allow offered for file-defined hires WITH a note stating the width and
  "If you edit its file, you'll be asked again."; still suppressed while definition unknown.
- Settings → Permissions describes these grants in words (describe-rule.ts).
- Resume (`task_id`, no work_dir → no subject → no card): ledger stores the spawn-time
  fingerprint; `resumeSpecialist` refuses with `definition-changed` on mismatch; Task tool
  reports it and tells the model to hire afresh.
- One roster lookup per Task tool instance (memo), work_dir resolved against session cwd.

## Prior review's OPEN minor items (judge whether they now matter)
- a builtin whose work-dir path contains `:file:` would trip the auto-edit ask (glob is
  case-insensitive) — fail-safe (extra ask), not a leak.
- same-size same-mtime rewrite isn't re-read by the catalog: hash AND cached definition are
  equally stale, so grant and behaviour agree.
- naming: `grantScope` field vs the existing width type `GrantScope`.
