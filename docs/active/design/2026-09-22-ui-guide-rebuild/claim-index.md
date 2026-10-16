---
status: active
date: 2026-09-22
related: docs/active/plans/2026-09-21-ui-ux-consistency-audit.md
---

# Source-claim index (not the new guide)

Checklist of **claims to examine**, not a set of proposed or approved rules. `G` labels
identify the existing guide's locations; the new guide does not inherit their authority
or numbering. Individual clauses within a row can conflict or require separate decisions.
Source: `docs/active/design/2026-08-25-ui-design-guide.md`.

| Claim | Existing guide location | Questions for evidence review |
|---|---|---|
| G-1 controls use one primitive, new appearance means new primitive | §1:30–37 | Does it forbid legitimate distinct roles? What is already mechanically guaranteed? |
| G-2 colour tokens and semantic exceptions | §1:39–44, §2.3:98–113 | Which constraints are validator/contrast protections versus aesthetic limits? |
| G-3 radii by role | §1:46–50 | Where do equal roles use different radii; which looks better in each theme? |
| G-4 one primary per view | §1:52–54 | Which views need multiple important actions for different jobs? |
| G-5 text-size floor, status exception | §1:56–60 | Separate accessibility/legibility requirement from taste and any deliberate exception. |
| G-6 text-on-surface pairs | §2.1:77–83 | Which pairs are objectively contrast-pinned versus a matter of hierarchy? |
| G-7 eyebrow section headers | §2.2:94–96 | Compare sibling groups and field labels in settings and dialogs. |
| G-8 accent only on named states | §2.3:115–125 | Contrast/selection signal versus decorative restraint; see each theme. |
| G-9 button vocabulary | §3:160–167 | Compare roles/sizes/placement; don't ask to waive accessible button semantics. |
| G-10 dialog header | §4.3:269–271 | Current Dialog and Settings header geometry contradicts size/weight claim. |
| G-11 dialog body/scroll/footer | §4.3:272–285 | Keep actual reachability distinct from spacing/scrollbar preference. |
| G-12 search field | §3:172–173, §4.1–4.6 | Check different search tasks and narrow layouts, not only visual resemblance. |
| G-13 welcome screen | §4.1:198–203 | Is this an app-specific accepted design or reusable taste guidance? |
| G-14 chip kinds | §4.6:320–325 | Are these roles still distinguishable on all themes and touch widths? |
| G-15 status bar | §4.1:191–196 | Record existing decisions separately from broad claims about chips/size. |
| G-16 full-screen header | §4.4:289–306 | Compare Projects, Pages, Library and Marketplace; account for their tasks. |
| G-17 list rows | §4.6:336–340 | Row/card distinction versus real file previews and Project grid/list toggle. |
| G-18 empty states | §4.7:354–356 | Distinguish useful recovery action from prescribed decorative anatomy. |
| G-19 counts | §4.6:333–335 | Does one label+count order suit every context? |
| G-20 tool card | §4.2:211–216 | Confirm common header anatomy and exceptions across tool types. |
| G-21 menus | §4.6:341–344 | Compare anchored menus and the context menu; verify touch paths. |
| G-22 find bar | §4.2:223–228 | Specific product behaviour, not necessarily a general taste rule. |
| G-23 attachment cards | §4.2:229–235 | Specific preview behaviour and accessibility; choose what generalises. |
| G-24 terminal backing | §4.2:236–241, §5:400–403 | Wallpaper readability and guard; do not mistake for generic card opacity. |
| G-25 session row | §4.2:243–249 | Distinguish app-specific content order from wider row hierarchy. |
| G-26 status pill | §4.2:250–255 | Readability/status vocabulary versus pill preference. |
| G-27 list tag chips | §4.2:256–262 | Named tags and overflow remain functional; visual treatment is separate. |
| G-28 action placement | §4.7:363–369 | Show right/full-width versus plausible role-specific exceptions. |
| G-29 expandable rows | §4.6:326–332 | Interaction affordance and control primitive versus aesthetic treatment. |
| G-30 long-list render cost | §4.6:345–350 | Performance invariant, not a taste decision; keep its actual guards. |

**Additional unnumbered prescriptions to inspect, clause by clause:** four-level
surface ladder (§2.1:66–75); exact type hierarchy and weights (§2.2:85–92);
colour exceptions (§2.3:98–113); spacing/radii/borders/shadow/motion/hover rules
(§2.4:127–154); each primitive row and exception (§3:158–181); window chrome,
chat bubbles, timestamps, thinking, composer (§4.1–4.2:189–222); Settings
anatomy/footer/danger (§4.3:264–285); full-screen cards and wallpaper exceptions
(§4.4:287–306); side-pane/sheet/toggle-row anatomy (§4.5–4.6:308–319);
loading/errors/disabled controls (§4.7:352–371); phone layout/hit areas
(§4.8:373–382); theme-pack promises (§5:386–405); and every checklist line
(§6:409–425). Split any of these into separate proposed rules only when it gives
Destin a meaningful independent decision. Record apparent source/code contradictions
in `evidence.md`, and do not re-present non-negotiable safety or accessibility
constraints as visual preferences.
