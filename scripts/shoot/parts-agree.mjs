// "Parts agree" — the one check `shoot` makes about a screen's pieces rather than the screen.
//
// WHY (marketplace-detail friction, proposal 2): three visual defects passed every check and
// every picture review on the Marketplace detail pages, and two of them are geometry a script
// can see: chips of three different heights in one row (round 2, "install is tiny"), and a
// chip's bottom border cut off by the row's own scroll clip (round 5, only visible at 1.5×).
// Nothing compared siblings or clip edges. This does, on rows marked for it:
//
//   - every visible child of a marked row is the same height (within 1px);
//   - in a row that clips (any overflow other than visible — a sideways scroller clips
//     vertically too), every child keeps at least half a pixel of room inside the clip at the
//     top and bottom. Touching the edge exactly is the M5-3 bug: fine at 1×, cut at 1.5×,
//     where the border rounds to the next device pixel.
//
// A row opts in with `data-parts-agree` (any value names it in the report; the shared notice's
// button rows carry it). The rows the renderer already marks for other reasons are read too:
// `[data-detail-chips]` and `[data-detail-actions]` (Marketplace detail pages) and `[data-trust]`
// (a Marketplace card's chip row — its icon-only safety chip was 18px beside 22.5px chips on every
// phone-width card until the fact chip got its strut, 2026-10-05). It is opt-in on purpose:
// "siblings are one height" is a rule for chip and button rows, not for a list of differently
// sized cards.

export const PARTS_SELECTOR = '[data-parts-agree], [data-detail-chips], [data-detail-actions], [data-trust]';

/** Runs in the page: measures every marked row. Pure data out, so the rules below can be tested
 *  without a browser. Hidden rows and rows with fewer than one visible child are skipped. */
export const MEASURE_PARTS = `(() => {
  const name = (el) => el.getAttribute('data-parts-agree') || (el.hasAttribute('data-detail-chips') ? 'detail chips'
    : el.hasAttribute('data-detail-actions') ? 'detail buttons' : el.hasAttribute('data-trust') ? 'card chips' : el.tagName.toLowerCase());
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30) || el.tagName.toLowerCase();
  const seen = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width >= 1 && r.height >= 1 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const rows = [];
  for (const row of document.querySelectorAll(${JSON.stringify(PARTS_SELECTOR)})) {
    if (!seen(row) || rows.length >= 200) continue;
    const cs = getComputedStyle(row); const r = row.getBoundingClientRect();
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    const top = r.top + row.clientTop; const bottom = top + row.clientHeight;
    const children = [...row.children].filter(seen).map((c) => { const b = c.getBoundingClientRect(); return { label: label(c), top: b.top, bottom: b.bottom, height: b.height }; });
    if (children.length) rows.push({ row: name(row), clips, clip: { top, bottom }, children });
  }
  return rows;
})()`;

/** The rules, on measured rows. Returns one plain sentence per problem. */
export function partsFindings(rows, { heightSlack = 1, clipRoom = 0.5 } = {}) {
  const out = [];
  for (const { row, clips, clip, children } of rows) {
    if (children.length > 1) {
      const hs = children.map((c) => c.height);
      const min = Math.min(...hs), max = Math.max(...hs);
      if (max - min > heightSlack) {
        const lo = children[hs.indexOf(min)], hi = children[hs.indexOf(max)];
        out.push(`${row}: parts differ in height — "${lo.label}" ${round(min)}px, "${hi.label}" ${round(max)}px`);
      }
    }
    if (clips) {
      for (const c of children) {
        if (c.top < clip.top + clipRoom || c.bottom > clip.bottom - clipRoom) {
          out.push(`${row}: "${c.label}" touches or leaves the row's clip edge (it would be cut at 1.5×)`);
          break;   // one line per row: the cause is the row, not each child
        }
      }
    }
  }
  return out;
}

const round = (n) => Math.round(n * 10) / 10;
