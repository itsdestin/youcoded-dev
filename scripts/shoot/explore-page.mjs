// What `explore` asks the page after every step. Each function here runs INSIDE the app's
// page (serialised with `inPage`), so it may only use the DOM — no imports, no closures.
//
// The model never writes selectors: it reads a numbered list of what a person could click
// right now, and the stack of open layers, then picks a number. So "what counts as a
// control" and "what counts as a layer" live here, once, instead of in every reviewer's plan.

/** `fn` + its arguments → an expression for Runtime.evaluate. */
export const inPage = (fn, ...args) => `(${fn})(${args.map((a) => JSON.stringify(a)).join(',')})`;

/**
 * Everything a person could click, type in or drag right now, numbered top-to-bottom,
 * left-to-right. A control hidden behind an open dialog is left out (a person can't reach
 * it) and counted instead. The elements are kept on `window.__exploreEls` so `click 7`
 * means exactly the 7th line the model was shown.
 */
export function listControls({ all = false } = {}) {
  // Spinner frames (braille dots) and bare separators change from frame to frame; a label
  // that holds them would never match on replay.
  const t = (s) => (s || '').replace(/[\u2800-\u28ff]/g, '').replace(/\s+/g, ' ').trim().replace(/^[|·•]\s*/, '').trim();
  const SEL = 'button,a[href],input:not([type=hidden]),textarea,select,summary,[contenteditable=""],[contenteditable=true],'
    + '[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],'
    + '[role=checkbox],[role=radio],[role=switch],[role=slider],[role=combobox],[role=treeitem],[role=textbox],[role=spinbutton],'
    + '[tabindex]:not([tabindex="-1"])';
  const real = new Set(document.querySelectorAll(SEL));
  const found = new Set(real);
  // React click handlers leave no trace in the page, but they nearly always come with a
  // pointer cursor. Only the outermost such element counts (its children inherit the cursor).
  for (const e of document.querySelectorAll('div,span,li,img,svg,label,p,h1,h2,h3,h4,td,tr')) {
    if (found.has(e)) continue;
    const cs = getComputedStyle(e);
    if (cs.cursor !== 'pointer') continue;
    if (e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer') continue;
    found.add(e);
  }
  // A pointer-cursor element inside a real control (the icon in a button) is that control.
  const els = [...found].filter((e) => {
    if (real.has(e) && !e.matches('[tabindex]:not(button,a,input,textarea,select,[role])')) return true;
    for (let p = e.parentElement; p; p = p.parentElement) if (real.has(p)) return false;
    return true;
  });

  const role = (e) => {
    const r = e.getAttribute('role'); if (r) return r;
    const tag = e.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea' || e.isContentEditable) return 'textbox';
    if (tag === 'input') return { checkbox: 'checkbox', radio: 'radio', range: 'slider', button: 'button', submit: 'button', file: 'file picker', color: 'colour picker' }[e.type] || 'textbox';
    return 'clickable';
  };
  const name = (e) => {
    let v = e.getAttribute('aria-label'); if (t(v)) return t(v);
    const by = e.getAttribute('aria-labelledby');
    if (by) { v = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '); if (t(v)) return t(v); }
    if (e.labels && e.labels.length) { v = e.labels[0].textContent; if (t(v)) return t(v); }
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)) { v = e.innerText; if (t(v)) return t(v).slice(0, 70); }
    v = e.getAttribute('title') || e.getAttribute('placeholder') || e.getAttribute('alt')
      || e.querySelector?.('img[alt]')?.getAttribute('alt') || e.querySelector?.('svg title')?.textContent;
    return t(v);
  };
  const state = (e) => {
    const s = [];
    if (e.disabled || e.getAttribute('aria-disabled') === 'true') s.push('disabled');
    if (e.checked || e.getAttribute('aria-checked') === 'true') s.push('on');
    else if (e.getAttribute('aria-checked') === 'false' || (e.type === 'checkbox' && !e.checked)) s.push('off');
    if (e.getAttribute('aria-pressed') === 'true') s.push('pressed');
    if (e.getAttribute('aria-expanded') === 'true') s.push('open');
    if (e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') && e.getAttribute('aria-current') !== 'false') s.push('selected');
    if (e === document.activeElement) s.push('focused');
    if (/^(INPUT|TEXTAREA)$/.test(e.tagName) && !/^(checkbox|radio|button|submit)$/.test(e.type) && e.value) s.push(`holds "${t(e.value).slice(0, 40)}"`);
    if (e.tagName === 'SELECT') s.push(`shows "${t(e.selectedOptions[0]?.textContent)}"`);
    if (e.isContentEditable && t(e.innerText)) s.push(`holds "${t(e.innerText).slice(0, 40)}"`);
    const tip = e.getAttribute('title'); if (tip && t(tip) !== name(e)) s.push(`tooltip "${t(tip).slice(0, 50)}"`);
    return s;
  };

  let covered = 0; let offscreen = 0;
  const rows = [];
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || +cs.opacity === 0 && !/^(INPUT)$/.test(e.tagName)) continue;
    const onScreen = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    if (!onScreen) { offscreen++; if (!all) continue; }
    let off = false;
    if (onScreen) {
      // Hit-test the middle of the part that is on screen: covered by another layer = unreachable.
      const x = (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2;
      const y = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(e.contains(hit) || hit.contains(e) || (e.labels && [...e.labels].some((l) => l.contains(hit))))) {
        // A visually hidden checkbox under its styled label is reached through the label.
        if (!(hit && hit.tagName === 'LABEL' && hit.control === e)) { covered++; continue; }
      }
    } else off = true;
    rows.push({ e, role: role(e), label: name(e), state: state(e), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), off });
  }
  // The top layer's controls first (a menu's items are what a person looks at), each layer
  // in reading order: rows of 12 px, then left to right. Layers come from listLayers.
  const layers = window.__exploreLayers || [];
  const layerOf = (e) => { const i = layers.findIndex((l) => l.contains(e)); return i < 0 ? layers.length : i; };
  for (const r of rows) r.layer = layerOf(r.e);
  rows.sort((a, b) => a.layer - b.layer || Math.round((a.y - a.h / 2) / 12) - Math.round((b.y - b.h / 2) / 12) || a.x - b.x);
  window.__exploreEls = rows.map((r) => r.e);
  const seen = {};
  const controls = rows.map((r, i) => {
    const key = `${r.role}|${r.label}`; seen[key] = (seen[key] || 0) + 1;
    return { n: i + 1, role: r.role, label: r.label, nth: seen[key], state: r.state, x: r.x, y: r.y, w: r.w, h: r.h, off: r.off, layer: r.layer };
  });
  return { controls, covered, offscreen: all ? 0 : offscreen };
}

/** Where control `n` (from the last list) is now, scrolled into view. `null` when it is gone. */
export function locate(n) {
  const e = (window.__exploreEls || [])[n - 1];
  if (!e || !e.isConnected) return null;
  let r = e.getBoundingClientRect();
  if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) { e.scrollIntoView({ block: 'center', inline: 'nearest' }); r = e.getBoundingClientRect(); }
  const x = (Math.max(r.left, 0) + Math.min(r.right, innerWidth)) / 2;
  const y = (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2;
  return { x: Math.round(x), y: Math.round(y), draggable: e.closest('[draggable=true]') !== null };
}

/** Is control `n` what is under the point (x, y) right now? False when the page moved under the pointer. */
export function hits(n, x, y) {
  const e = (window.__exploreEls || [])[n - 1];
  const hit = document.elementFromPoint(x, y);
  // Strict: the point must land ON the control (or its label) — never on something around it.
  return !!(e && hit && (e.contains(hit) || (hit.tagName === 'LABEL' && hit.control === e) || (e.labels && [...e.labels].some((l) => l.contains(hit)))));
}

/** Where every control sits, as one string: two equal readings apart = the page has stopped moving. */
export function layoutSignature() {
  return (window.__exploreEls || []).map((e) => { const r = e.getBoundingClientRect(); return `${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}`; }).join(';')
    + `|${document.querySelectorAll('button,a,input,textarea,[role]').length}`;
}

/**
 * The open layers, top first: dialogs, drawers, menus, lists, tooltips. Each is named the way
 * a person would name it (its label or heading), plus its screen name where the photo-only
 * build marks one. The base is the app itself, named by the screens marked outside any layer.
 */
export function listLayers() {
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // A layer is what floats over the app: an element with a layer role, one the overlay
  // system placed on a layer (data-layer, never its scrim), or anything pinned to the window
  // above the page (position: fixed, z-index 30+ — drawers, toasts, pickers). NOT every
  // .layer-surface: cards use that look too (the skill tiles in the "/" drawer).
  const ROLE = '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tooltip],[aria-modal=true],[data-layer]:not(.layer-scrim),.settings-drawer';
  const floating = (e) => { const cs = getComputedStyle(e); return cs.position === 'fixed' && cs.zIndex !== 'auto' && +cs.zIndex >= 30 && !e.classList.contains('layer-scrim'); };
  const shown = (e) => {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    for (let p = e; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; }
    return true;
  };
  const cands = new Set(document.querySelectorAll(ROLE));
  for (const e of document.body.querySelectorAll('*')) if (!cands.has(e) && floating(e)) cands.add(e);
  // A full-window wrapper the pointer passes through (Dialog's centring box) is not a layer.
  let els = [...cands].filter(shown).filter((e) => getComputedStyle(e).pointerEvents !== 'none');
  // A layer inside a layer is its own layer (the marketplace's detail page over the
  // marketplace) — unless it fills its parent: then they are one popup (a menu in its frame).
  const box = (e) => e.getBoundingClientRect();
  const fills = (inner, outer) => { const a = box(inner), b = box(outer); return Math.abs(a.left - b.left) < 8 && Math.abs(a.top - b.top) < 8 && Math.abs(a.right - b.right) < 8 && Math.abs(a.bottom - b.bottom) < 8; };
  els = els.filter((e) => !els.some((o) => o !== e && o.contains(e) && fills(e, o)));
  // Stacking: the z-index chain from the root down, compared left to right; ties go to page order.
  const chain = (e) => { const z = []; for (let p = e; p && p !== document.documentElement; p = p.parentElement) { const v = getComputedStyle(p).zIndex; if (v !== 'auto') z.unshift(+v); } return z; };
  const cmp = (a, b) => {
    if (a.contains(b)) return -1;   // the inner one is on top
    if (b.contains(a)) return 1;
    const za = chain(a), zb = chain(b);
    for (let i = 0; i < Math.max(za.length, zb.length); i++) { const d = (za[i] ?? 0) - (zb[i] ?? 0); if (d) return d; }
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };
  els.sort(cmp).reverse();
  window.__exploreLayers = els;
  // A layer is named from its OWN content, never from a layer nested inside it (the
  // Projects view must not take the name of the Add-a-project dialog open over it).
  const own = (s, sel) => [...s.querySelectorAll(sel)].filter((x) => !els.some((o) => o !== s && s.contains(o) && o.contains(x)));
  const ownFirst = (s, sel) => (s.matches(sel) ? s : own(s, sel)[0]) || null;
  // A surface that wraps one menu or dialog is named by it.
  const inner = (s) => ownFirst(s, '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[role=tooltip]') || s;
  const nameOf = (s) => {
    const e = inner(s);
    let v = e.getAttribute('aria-label'); if (t(v)) return t(v);
    const by = e.getAttribute('aria-labelledby'); if (by) { v = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' '); if (t(v)) return t(v); }
    v = own(e, 'h1,h2,h3,[role=heading]')[0]?.textContent; if (t(v)) return t(v).slice(0, 50);
    // A menu with no title: its first items say what it is.
    const items = own(e, '[role=menuitem],[role=option],[role=menuitemcheckbox],[role=menuitemradio]').map((i) => t(i.textContent)).filter(Boolean);
    if (items.length) return items.slice(0, 3).join(' / ') + (items.length > 3 ? ' / …' : '');
    const mark = ownFirst(s, '[data-screen]')?.getAttribute('data-screen');
    return mark || t(e.innerText).slice(0, 40);
  };
  const kindOf = (s) => { const e = inner(s); return e.getAttribute('role') || (s.classList.contains('settings-drawer') ? 'drawer' : 'panel'); };
  const markOf = (s) => ownFirst(s, '[data-screen]')?.getAttribute('data-screen') || '';
  // Covered = a HIGHER layer sits over this one's middle. (Not "the hit is outside it": a
  // dialog's own full-window wrapper lets the pointer through to its scrim.)
  const layers = els.map((e, i) => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2));
    return { kind: kindOf(e), name: nameOf(e), screen: markOf(e), covered: !!hit && els.slice(0, i).some((o) => o.contains(hit)) };
  });
  const inLayer = (m) => els.some((e) => e.contains(m));
  const base = [...new Set([...document.querySelectorAll('[data-screen]')].filter((m) => !inLayer(m) && m.parentElement && shown(m.parentElement)).map((m) => m.getAttribute('data-screen')))];
  const a = document.activeElement;
  let focus = '';
  if (a && a !== document.body) {
    const label = t(a.getAttribute('aria-label') || a.getAttribute('placeholder') || a.innerText || a.getAttribute('title')).slice(0, 40);
    const at = els.findIndex((e) => e.contains(a));
    focus = `${(a.getAttribute('role') || a.tagName.toLowerCase())}${label ? ` "${label}"` : ''}${at >= 0 ? ` in ${layers[at].kind} "${layers[at].name}"` : ''}`;
  }
  return { layers, base, focus };
}

/** Numbered tags over every listed control, for the second picture. Nothing can click them. */
export function showTags(controls) {
  document.getElementById('__explore_tags')?.remove();
  const box = document.createElement('div');
  box.id = '__explore_tags';
  box.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:bold 11px/1 system-ui,sans-serif';
  for (const c of controls) {
    if (c.off) continue;
    const tag = document.createElement('div');
    tag.textContent = String(c.n);
    const left = Math.max(0, c.x - c.w / 2), top = Math.max(0, c.y - c.h / 2);
    tag.style.cssText = `position:absolute;left:${left}px;top:${top}px;padding:2px 3px;background:#ffe000;color:#000;border:1px solid #000;border-radius:3px`;
    const outline = document.createElement('div');
    outline.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${c.w}px;height:${c.h}px;outline:1px dashed #ffe000;outline-offset:-1px`;
    box.append(outline, tag);
  }
  document.documentElement.append(box);
}
export function hideTags() { document.getElementById('__explore_tags')?.remove(); }
