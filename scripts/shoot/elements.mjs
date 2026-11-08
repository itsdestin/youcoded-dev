// The recorder's measuring code for "What changed since last release": one in-page function that
// lists everything a person can SEE on the page (buttons, fields, words, pictures) with its box,
// words and a few style values. shoot writes the result beside each picture as
// <theme>.elements.json (format: scripts/shoot/what-changed/FORMAT.md).
//
// WHY it lives here and is injected with a page evaluate, not built into the app: the "before"
// side is the released v1.3.3 app, which must not need any change to be measured.
//
// The function is written as a real function (so it is lint/readable) and sent as text.

/* eslint-disable no-undef */
function measure() {
  const MAX = 6000;                       // a safety stop; real screens hold a few hundred
  const out = [];
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'IFRAME', 'OPTION', 'OPTGROUP', 'PATH', 'DEFS', 'LINEARGRADIENT']);
  const CONTROL_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'checkbox', 'radio', 'switch', 'option', 'treeitem', 'slider', 'spinbutton', 'combobox']);
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const r1 = (n) => Math.round(n * 10) / 10;

  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.split(' ')[0];
    const t = el.tagName.toLowerCase();
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'a' && el.hasAttribute('href')) return 'link';
    if (t === 'select') return 'combobox';
    if (t === 'textarea') return 'textbox';
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset', 'image'].includes(ty)) return 'button';
      if (ty === 'checkbox') return 'checkbox';
      if (ty === 'radio') return 'radio';
      if (ty === 'range') return 'slider';
      return 'textbox';
    }
    if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return 'textbox';
    return null;
  };
  const FIELD_ROLES = new Set(['textbox', 'combobox', 'slider', 'spinbutton']);
  const kindOf = (el, role) => {
    const t = el.tagName.toLowerCase();
    if (role && FIELD_ROLES.has(role)) return 'field';
    if (role && (CONTROL_ROLES.has(role) || t === 'button')) return 'control';
    if (el.hasAttribute('tabindex') && Number(el.getAttribute('tabindex')) >= 0 && el !== document.body) return 'control';
    return null;
  };

  const nameOf = (el) => {
    const al = el.getAttribute('aria-label'); if (al) return norm(al);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const s = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent).filter(Boolean).join(' '); if (norm(s)) return norm(s); }
    if (el.labels && el.labels.length) { const s = norm([...el.labels].map((l) => l.textContent).join(' ')); if (s) return s; }
    const t = norm(el.innerText ?? el.textContent); if (t) return t;
    const img = el.querySelector?.('img[alt]'); if (img && norm(img.alt)) return norm(img.alt);
    return norm(el.getAttribute('title') || el.getAttribute('placeholder') || el.value || '');
  };

  const styleOf = (el) => {
    const cs = getComputedStyle(el);
    const fam = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    return {
      color: cs.color, background: cs.backgroundColor,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      radius: cs.borderTopLeftRadius, font: `${cs.fontSize} ${cs.fontWeight} ${fam}`, opacity: cs.opacity,
    };
  };
  // A short, number-light route to the element: the last few tags with their place among same-tag siblings.
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 5; e = e.parentElement) {
      const t = e.tagName.toLowerCase();
      const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
      parts.unshift(same.length > 1 ? `${t}:nth(${same.indexOf(e) + 1})` : t);
      if (e.getAttribute('role') === 'dialog') break;
    }
    return parts.join('>');
  };

  const inter = (a, b) => {
    const x0 = Math.max(a.l, b.l), y0 = Math.max(a.t, b.t), x1 = Math.min(a.r, b.r), y1 = Math.min(a.b, b.b);
    return x1 - x0 >= 1 && y1 - y0 >= 1 ? { l: x0, t: y0, r: x1, b: y1 } : null;
  };
  // Is something else on top of the middle (or any corner) of this visible area?
  const covered = (el, v) => {
    if (getComputedStyle(el).pointerEvents === 'none') return false;
    const pts = [[(v.l + v.r) / 2, (v.t + v.b) / 2], [v.l + 1, v.t + 1], [v.r - 1, v.t + 1], [v.l + 1, v.b - 1], [v.r - 1, v.b - 1]];
    for (const [x, y] of pts) {
      const hit = document.elementFromPoint(Math.min(Math.max(x, 0), innerWidth - 1), Math.min(Math.max(y, 0), innerHeight - 1));
      if (!hit || el.contains(hit) || hit.contains(el)) return false;
    }
    return true;
  };
  const shown = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };

  const pushed = new Set();
  const push = (el, kind, role, box, extra) => {
    if (out.length >= MAX) return;
    pushed.add(el);
    out.push({
      id: out.length + 1, kind, role, name: extra.name ?? '', text: extra.text ?? null,
      title: el.getAttribute('title') || null, placeholder: el.getAttribute('placeholder') || null,
      box: { x: r1(box.l), y: r1(box.t), w: r1(box.r - box.l), h: r1(box.b - box.t) },
      style: styleOf(el), path: pathOf(el),
    });
  };

  // `clip` is what the nearest scrolling/hiding ancestors let through; `inControl` marks words that belong to a control.
  const walk = (el, clip, inControl) => {
    if (out.length >= MAX || SKIP_TAGS.has(el.tagName) || el.hasAttribute('data-screen')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const r = el.getBoundingClientRect();
    const hidden = cs.visibility === 'hidden' || +cs.opacity === 0;
    let myClip = clip;
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const own = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      myClip = inter(clip, own);
      if (!myClip) return;
    }
    const tag = el.tagName.toLowerCase();
    const role = roleOf(el);
    let kind = kindOf(el, role);
    const vis = r.width >= 1 && r.height >= 1 && !hidden ? inter(myClip, { l: r.left, t: r.top, r: r.right, b: r.bottom }) : null;
    let descendControl = inControl;

    if (kind && vis && shown(el) && !covered(el, vis)) {
      const name = nameOf(el);
      push(el, kind, role, { l: r.left, t: r.top, r: r.right, b: r.bottom }, { name, text: kind === 'field' ? norm(el.value ?? '') || null : (norm(el.innerText ?? el.textContent) || null) });
      descendControl = true;
    }

    // Pictures: <img>, a top-level <svg>, canvas, video, or a CSS background picture. Not inside a control (an icon belongs to its button).
    if (!inControl && !kind && vis && shown(el)) {
      const bg = cs.backgroundImage;
      const isPic = tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'video' || (bg && bg !== 'none' && /url\(/.test(bg));
      // A picture filling the whole window is the backdrop (wallpaper): the pixel pass sees it, a list entry would only be noise.
      const backdrop = r.width * r.height >= 0.9 * innerWidth * innerHeight;
      if (isPic && !backdrop && !covered(el, vis)) push(el, 'image', tag === 'img' || tag === 'svg' ? 'img' : null, { l: r.left, t: r.top, r: r.right, b: r.bottom }, { name: norm(el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title') || '') });
    }
    if (tag === 'svg' || tag === 'canvas' || tag === 'video' || tag === 'img' || tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // Words that belong to this element (its own text nodes), measured tightly with a range.
    if (!descendControl && !kind && vis && shown(el)) {
      const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && norm(n.nodeValue));
      if (nodes.length) {
        const rg = document.createRange(); let box = null;
        for (const n of nodes) { rg.selectNodeContents(n); for (const q of rg.getClientRects()) { if (q.width < 1 || q.height < 1) continue; box = box ? { l: Math.min(box.l, q.left), t: Math.min(box.t, q.top), r: Math.max(box.r, q.right), b: Math.max(box.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom }; } }
        const v2 = box && inter(myClip, box);
        if (v2 && !covered(el, v2)) { const text = norm(nodes.map((n) => n.nodeValue).join(' ')); push(el, 'text', null, v2, { name: text, text }); }
      }
    }
    for (const c of el.children) walk(c, myClip, descendControl);
  };
  walk(document.body, { l: 0, t: 0, r: innerWidth, b: innerHeight }, false);

  // WHY a second list (2026-11-07 release audit: a new section pushed "Saved sign-ins" below a dialog's edge and
  // the comparison called it removed): the controls and words that exist but are scrolled out of view inside a
  // scrolling area. Only scrolled-out ones — a piece behind a popup is not here (it is not outside any
  // scrolling ancestor), and neither is anything display:none or invisible. No box: it is not on the picture.
  const outOfView = [];
  const scrolledOut = (el, r) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (r.bottom <= ar.top || r.top >= ar.bottom || r.right <= ar.left || r.left >= ar.right) return { x: Math.round(ar.left), y: Math.round(ar.top), w: Math.round(ar.width), h: Math.round(ar.height) };
    }
    return r.bottom <= 0 || r.top >= innerHeight ? { x: 0, y: 0, w: innerWidth, h: innerHeight } : null;
  };
  const insideControl = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (kindOf(a, roleOf(a))) return true; return false; };
  for (const el of document.body.querySelectorAll('*')) {
    if (outOfView.length >= 1500) break;
    if (pushed.has(el) || SKIP_TAGS.has(el.tagName) || insideControl(el)) continue;
    const role = roleOf(el), kind = kindOf(el, role);
    const own = kind ? '' : norm([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' '));
    if (!kind && !own) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || !shown(el)) continue;
    // WHY covered too (2026-11-07 review: a chat that slid 12 px brought a row's buttons out from under the top bar,
    // and they read as new): a piece under another part of the screen exists but is out of sight
    const onScreen = inter({ l: 0, t: 0, r: innerWidth, b: innerHeight }, { l: r.left, t: r.top, r: r.right, b: r.bottom });
    const area = scrolledOut(el, r);
    if (!area && !(onScreen && covered(el, onScreen))) continue;
    // WHY `why` and `area` (what-changed run 9, 2026-11-08: a new paragraph below the fold of About's stats went
    // unreported): words that exist only out of view are compared too, but only when they are scrolled away inside
    // the screen's own panel. `area` is the box of the scrolling part that hides them; something covered is
    // usually the page behind a popup, which is not the popup's change.
    const base = kind ? { kind, role, name: nameOf(el), text: kind === 'field' ? null : norm(el.innerText ?? el.textContent) || null } : { kind: 'text', role: null, name: own, text: own };
    outOfView.push(area ? { ...base, why: 'scrolled', area } : { ...base, why: 'covered' });
  }
  return { elements: out, outOfView };
}

/** The text to hand to a page evaluate: runs `measure` and returns the element list. */
export const MEASURE_ELEMENTS = `(${measure.toString()})()`;
