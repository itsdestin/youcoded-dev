"""Big picture painted from the work items (plan deck Q-10, Destin 2026-10-16: "Big picture reads the items directly").

WHY: the statuses were researched once, on Oct 12, and only grew stale. Each work item now names the parts of the
vision it builds (`vision:` on the item, cards.mjs). A part with open items takes its status from them — being built
when one is in Agentic buildout or Human polish & review, planned when one is in Planning, only an idea when they
are all still being explored — and lists them in its details. A part that already exists stays "exists" (its items
are fixes or follow-ups), and a part with no items keeps its Oct 12 status.
"""
import html

E = html.escape
WORD = {'explore': 'Preliminary exploration', 'planning': 'Planning', 'build': 'Agentic buildout', 'polish': 'Human polish & review'}


def paint(nodes, cards, status_words):
    by = {}
    for c in cards:
        if c.get('stage') not in WORD:
            continue
        for v in c.get('vision') or []:
            by.setdefault(v, []).append(c)
    for nid, n in nodes.items():
        its = by.get(nid)
        if not its:
            continue
        stages = {c['stage'] for c in its}
        if n.get('status') != 'done':
            n['status'] = 'building' if stages & {'build', 'polish'} else 'planned' if 'planning' in stages else 'vision'
        # WHY escaped: the details panel puts this text in as HTML
        line = 'Work items: ' + '; '.join(f"#{c['id']} {E(c['title'])} ({WORD[c['stage']]})" for c in its) + '.'
        n['why'] = (n['why'] + ' ' if n.get('why') else '') + line
        n['items'] = [c['id'] for c in its]
    # Capabilities and areas summarise their features, as vision_tab.merge does
    for nid, n in nodes.items():
        if n.get('kind') == 'feature':
            continue
        kids = [m for m in nodes.values() if m.get('parent') == nid] if n.get('kind') == 'capability' else [m for m in nodes.values() if m.get('kind') == 'feature' and m.get('pillar') == nid]
        n['counts'] = {s: sum(1 for k in kids if k.get('status') == s) for s in status_words}
        n['total'] = len(kids)
    return nodes
