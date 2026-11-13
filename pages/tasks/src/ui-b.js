// Tasks page — screens, part B: the add-task box, and everything that floats over the page
// (menus, the date picker, the label picker, pop-ups, the undo line, reminders).
// WHY the page draws its own pop-ups: a page's frame cannot show the browser's own
// confirm/prompt boxes, so "Delete this project?" has to be a box the page draws.

// ── the add-task box ────────────────────────────────────────────────────────────────────
function openEditor(slot, d) {
  d = d || {};
  ui.editor = {
    slot: slot, text: '', notes: '', due: d.due || null, repeat: null, remind: null, priority: d.priority || 4,
    projectId: d.projectId || null, sectionId: d.sectionId || null, parentId: d.parentId || null,
    labels: (d.labels || []).slice(), ignore: []
  };
}
// What the box would add right now: typed shortcuts first, then the buttons' choices.
function editorValue() {
  var e = ui.editor, p = C.parseQuickAdd(e.text, { today: now().day, projects: liveProjects(), ignore: e.ignore });
  var due = p.due || e.due, labels = e.labels.slice();
  p.labels.forEach(function (l) { if (labels.map(function (x) { return x.toLowerCase(); }).indexOf(l.toLowerCase()) < 0) labels.push(l); });
  var typedProject = p.projectId !== undefined && !e.parentId;
  return {
    title: p.title, notes: e.notes, due: due, repeat: due ? p.repeat || e.repeat : null,
    remind: due && due.time ? (e.remind != null ? e.remind : 0) : null,
    priority: p.priority !== 4 ? p.priority : e.priority,
    projectId: typedProject ? p.projectId : e.projectId, sectionId: typedProject ? null : e.sectionId,
    parentId: e.parentId, labels: labels, found: p.found
  };
}
function editorHtml() {
  var e = ui.editor, modal = e.slot === 'modal';
  return '<div class="t-editor" id="editor"' + (modal ? ' style="border:0;padding:0;background:none"' : '') + '>' +
    '<input class="t-plain" id="ed-title" autocomplete="off" placeholder="' + (e.parentId ? 'Sub-task name' : 'Task name') + '" aria-label="Task name" value="' + esc(e.text) + '">' +
    '<input class="t-plain" id="ed-notes" autocomplete="off" placeholder="Notes" aria-label="Notes" value="' + esc(e.notes) + '">' +
    '<div class="t-found" id="ed-found">' + editorFound() + '</div>' +
    '<div class="t-editor__row" id="ed-controls">' + editorControls() + '</div>' +
    '<div class="t-editor__foot"><span class="t-editor__hint">Try typing “tomorrow 5pm p1 @errands every week”</span>' +
    '<button class="yc-button yc-button--ghost" data-act="ed-cancel">Cancel</button>' +
    '<button class="yc-button' + (modal ? ' yc-button--primary' : '') + '" data-act="ed-submit">Add task</button></div></div>';
}
function editorFound() {
  var names = { date: 'calendar', time: 'calendar', repeat: 'repeat', priority: 'flag', project: 'move', label: 'tag' };
  return editorValue().found.map(function (f) {
    return '<button class="yc-chip" data-act="ed-ignore" data-text="' + esc(f.text) + '" title="Understood as a ' + f.kind + '. Click to keep these words in the name instead.">' + icon(names[f.kind]) + esc(f.text) + ' ' + icon('x') + '</button>';
  }).join('');
}
function editorControls() {
  var v = editorValue(), e = ui.editor, info = C.dueInfo(v.due, now(), state.settings.h12);
  var h = '<button class="yc-button yc-button--ghost yc-button--sm" data-act="ed-date"><span class="t-meta' + (info ? ' t-meta--' + info.tone : '') + '">' + icon(v.repeat ? 'repeat' : 'calendar') + (info ? esc(info.text) : 'Date') + '</span></button>' +
    '<select class="yc-select" data-change="ed-priority" aria-label="Priority">' + priorityOptions(v.priority) + '</select>';
  if (!e.parentId) h += '<select class="yc-select" data-change="ed-project" aria-label="Project">' + destOptions((v.projectId || '') + '|' + (v.sectionId || '')) + '</select>';
  h += '<button class="yc-button yc-button--ghost yc-button--sm" data-act="ed-labels">' + icon('tag') + (v.labels.length ? esc(v.labels.join(', ')) : 'Labels') + '</button>';
  return h;
}
function refreshEditor() {
  if (!ui.editor || !$('ed-found')) return;
  $('ed-found').innerHTML = editorFound();
  $('ed-controls').innerHTML = editorControls();
}
// A button's choice beats a typed shortcut of the same kind: the typed words go back to being
// part of the name, so the two never disagree.
function editorOverride(kinds) {
  editorValue().found.forEach(function (f) { if (kinds.indexOf(f.kind) >= 0 && ui.editor.ignore.indexOf(f.text) < 0) ui.editor.ignore.push(f.text); });
}
function closeEditor() {
  var wasModal = ui.editor && ui.editor.slot === 'modal';
  ui.editor = null;
  if (wasModal) closeModal(); else render();
}
function submitEditor() {
  if (!ui.editor) return;
  if ($('ed-title')) { ui.editor.text = $('ed-title').value; ui.editor.notes = $('ed-notes').value; }
  var v = editorValue(), e = ui.editor;
  if (!v.title) { if ($('ed-title')) $('ed-title').focus(); return; }
  var made;
  commit(function () { made = C.addTask(state, v, now().iso); });
  if (e.slot === 'modal') { ui.editor = null; closeModal(); toast('Added to ' + whereText(made)); return; }
  // The box stays open, cleared, for the next task: adding five things in a row is the common case.
  e.text = ''; e.notes = ''; e.ignore = [];
  render();
  if ($('ed-title')) { $('ed-title').value = ''; $('ed-title').focus(); refreshEditor(); }
}

// ── floating menus ──────────────────────────────────────────────────────────────────────
function openPop(anchor, pop) {
  var r = anchor.getBoundingClientRect();
  pop.rect = { l: r.left, t: r.top, b: r.bottom };
  ui.pop = pop; renderPop();
}
function swapPop(pop) { pop.rect = ui.pop.rect; ui.pop = pop; renderPop(); }
function closePop() { ui.pop = null; $('pop').innerHTML = ''; }
function renderPop() {
  var p = ui.pop;
  if (!p) return closePop();
  var a = document.activeElement, focusId = a && a.id && $('pop').contains(a) ? a.id : null;
  var html = p.type === 'menu' ? menuHtml(p) : p.type === 'date' ? dateHtml(p) : labelsHtml(p);
  $('pop').innerHTML = '<div class="t-pop yc-no-fade' + (p.type === 'date' ? ' t-date' : '') + '" id="pop-box" role="dialog" aria-label="' + esc(p.title || 'Menu') + '">' + html + '</div>';
  var box = $('pop-box'), w = box.offsetWidth, h = box.offsetHeight;
  var left = Math.max(8, Math.min(p.rect.l, window.innerWidth - w - 8));
  var top = p.rect.b + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, p.rect.t - h - 4 > 8 ? p.rect.t - h - 4 : window.innerHeight - h - 8);
  box.style.left = left + 'px'; box.style.top = top + 'px';
  if (focusId && $(focusId)) $(focusId).focus();
}
// items: { label, icon, color, hint, checked, danger, fn } | { sep: true } | { title } | { flags: current, fn(p) }
function menuHtml(p) {
  return p.items.map(function (it, i) {
    if (it.sep) return '<hr class="yc-divider">';
    if (it.title) return '<div class="t-pop__title">' + esc(it.title) + '</div>';
    if (it.flags) return '<div class="t-flags" role="group" aria-label="Priority">' + [1, 2, 3, 4].map(function (n) {
      return '<button class="t-iconbtn t-flag-' + n + '" data-act="pop-flag" data-i="' + i + '" data-p="' + n + '" aria-pressed="' + (it.flags === n) + '" aria-label="' + (n === 4 ? 'No priority' : 'Priority ' + n) + '" title="' + (n === 4 ? 'No priority' : 'Priority ' + n) + '">' + icon('flag') + '</button>';
    }).join('') + '</div>';
    return '<button class="t-pop__item' + (it.danger ? ' is-danger' : '') + '" data-act="pop-item" data-i="' + i + '">' +
      (it.color ? dot(it.color) : it.icon ? icon(it.icon) : '') + '<span>' + esc(it.label) + '</span>' +
      (it.hint ? '<span class="t-pop__hint">' + esc(it.hint) + '</span>' : '') + (it.checked ? icon('tick', 't-tick') : '') + '</button>';
  }).join('');
}
function destItems(fn) {
  var items = [{ label: 'Inbox', icon: 'inbox', fn: function () { fn(null, null); } }];
  liveProjects().forEach(function (p) {
    items.push({ label: p.name, color: p.color, fn: function () { fn(p.id, null); } });
    sections(p).forEach(function (s) { items.push({ label: p.name + ' › ' + s.name, color: p.color, fn: function () { fn(p.id, s.id); } }); });
  });
  return items;
}

// ── the date picker: day, time, repeat, reminder ────────────────────────────────────────
// p.get() -> { due, repeat, remind }; p.set(value) stores it wherever it belongs (a task, the
// add box, or several selected tasks).
function repeatKey(r) {
  if (!r) return '';
  if (r.after) return 'custom';
  if (r.unit === 'week' && r.days) return r.every === 1 && r.days.join() === '1,2,3,4,5' ? 'weekday' : 'custom';
  if (r.every === 1) return r.unit;
  return r.every === 2 && r.unit === 'week' ? '2week' : 'custom';
}
function dateHtml(p) {
  var v = p.get(), n = now(), picked = v.due ? v.due.date : null, ws = state.settings.weekStart;
  if (!p.month) p.month = (picked || n.day).slice(0, 7) + '-01';
  var sat = C.addDays(n.day, (6 - C.dow(n.day) + 7) % 7), mon = C.addDays(C.startOfWeek(n.day, 1), 7);
  function quick(label, day, ic) {
    var d = day ? C.fromYmd(day) : null;
    return '<button class="t-pop__item" data-act="dp-quick" data-day="' + (day || '') + '">' + icon(ic) + '<span>' + label + '</span>' + (d ? '<span class="t-pop__hint">' + C.DAY_SHORT[d.getDay()] + ' ' + C.MONTH_SHORT[d.getMonth()] + ' ' + d.getDate() + '</span>' : '') + '</button>';
  }
  var h = quick('Today', n.day, 'today') + quick('Tomorrow', C.addDays(n.day, 1), 'calendar') +
    quick(sat === n.day ? 'Next weekend' : 'This weekend', sat === n.day ? C.addDays(sat, 7) : sat, 'calendar') + quick('Next week', mon, 'upcoming') +
    (v.due ? quick('No date', '', 'x') : '') + '<hr class="yc-divider">';
  var first = C.fromYmd(p.month), busy = {};
  openTasks().forEach(function (t) { if (t.due) busy[t.due.date] = 1; });
  h += '<div class="t-cal__head"><button class="t-iconbtn" data-act="dp-month" data-step="-1" aria-label="Previous month">' + icon('left') + '</button>' +
    '<span>' + C.MONTH_NAMES[first.getMonth()] + ' ' + first.getFullYear() + '</span>' +
    '<button class="t-iconbtn" data-act="dp-month" data-step="1" aria-label="Next month">' + icon('chev') + '</button></div><div class="t-cal">';
  for (var i = 0; i < 7; i++) h += '<span>' + C.DAY_SHORT[(i + ws) % 7].slice(0, 2) + '</span>';
  var day = C.startOfWeek(p.month, ws);
  for (var c = 0; c < 42; c++) {
    var d = C.fromYmd(day), cls = 't-day' + (day.slice(0, 7) !== p.month.slice(0, 7) ? ' is-out' : '') + (day < n.day ? ' is-past' : '') + (day === n.day ? ' is-today' : '') + (day === picked ? ' is-picked' : '') + (busy[day] ? ' has-tasks' : '');
    h += '<button class="' + cls + '" data-act="dp-day" data-day="' + day + '" aria-label="' + C.MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + '"' + (day === picked ? ' aria-pressed="true"' : '') + '>' + d.getDate() + '</button>';
    day = C.addDays(day, 1);
    if (c >= 34 && day.slice(0, 7) !== p.month.slice(0, 7) && C.dow(day) === ws) break;
  }
  h += '</div><hr class="yc-divider" style="margin:6px 0"><div class="t-pop__pad">';
  h += '<div class="t-date__row"><label for="dp-time">Time</label><input type="time" class="yc-input" id="dp-time" data-change="dp-time" value="' + (v.due && v.due.time ? v.due.time : '') + '"></div>';
  var rk = p.custom ? 'custom' : repeatKey(v.repeat);
  h += '<div class="t-date__row"><label for="dp-repeat">Repeat</label><select class="yc-select" id="dp-repeat" data-change="dp-repeat">' +
    [['', 'Does not repeat'], ['day', 'Every day'], ['weekday', 'Every weekday (Mon–Fri)'], ['week', 'Every week'], ['2week', 'Every 2 weeks'], ['month', 'Every month'], ['year', 'Every year'], ['custom', 'Custom…']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === rk ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
  if (rk === 'custom') {
    var r = v.repeat || { every: 1, unit: 'week' };
    h += '<div class="yc-box t-date__custom"><div class="yc-row"><span>Every</span><input type="number" min="1" max="999" class="yc-input" id="dp-every" data-change="dp-every" value="' + r.every + '" aria-label="How many">' +
      '<select class="yc-select" id="dp-unit" data-change="dp-unit" aria-label="Unit">' + ['day', 'week', 'month', 'year'].map(function (u) { return '<option value="' + u + '"' + (u === r.unit ? ' selected' : '') + '>' + u + (r.every === 1 ? '' : 's') + '</option>'; }).join('') + '</select></div>';
    if (r.unit === 'week') h += '<div class="t-weekdays" role="group" aria-label="On these days">' + [0, 1, 2, 3, 4, 5, 6].map(function (x) { var dd = (x + ws) % 7; return '<button class="yc-filter" data-act="dp-wd" data-d="' + dd + '" aria-pressed="' + (!!r.days && r.days.indexOf(dd) >= 0) + '">' + C.DAY_SHORT[dd].slice(0, 2) + '</button>'; }).join('') + '</div>';
    h += '<div class="yc-row yc-row--between"><span>Count from the day I finish it</span><button class="yc-switch" id="dp-after" role="switch" data-change="dp-after" aria-checked="' + !!r.after + '" aria-label="Count from the day I finish it"></button></div></div>';
  }
  if (v.due && v.due.time) h += '<div class="t-date__row"><label for="dp-remind">Remind</label><select class="yc-select" id="dp-remind" data-change="dp-remind">' +
    [['', 'No reminder'], ['0', 'At the time it is due'], ['10', '10 minutes before'], ['30', '30 minutes before'], ['60', '1 hour before'], ['1440', '1 day before']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (String(v.remind == null ? '' : v.remind) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
    '<div class="yc-caption">Reminders appear while Tasks is open in YouCoded.</div>';
  if (v.repeat) h += '<div class="yc-caption">' + icon('repeat') + ' ' + esc(C.describeRepeat(v.repeat)) + '</div>';
  return h + '<div class="yc-row yc-row--end"><button class="yc-button yc-button--sm" data-act="dp-close">Done</button></div></div>';
}
function dpChange(fn) {
  var p = ui.pop;
  if (!p || p.type !== 'date') return;
  var cur = p.get(), v = { due: cur.due ? { date: cur.due.date, time: cur.due.time } : null, repeat: cur.repeat ? JSON.parse(JSON.stringify(cur.repeat)) : null, remind: cur.remind };
  var hadTime = !!(v.due && v.due.time);
  fn(v);
  // A time or a repeat needs a day to hang on: today, unless one is picked.
  if (!v.due && v.wantDay) v.due = { date: now().day, time: v.wantTime || null };
  delete v.wantDay; delete v.wantTime;
  if (!v.due) { v.repeat = null; v.remind = null; }
  else {
    if (!v.due.time) v.remind = null;
    else if (!hadTime && v.remind == null) v.remind = 0;
    if (v.repeat) {
      v.repeat = C.cleanRepeat(v.repeat);
      if (v.repeat && (v.repeat.unit === 'month' || v.repeat.unit === 'year')) v.repeat.anchor = C.fromYmd(v.due.date).getDate(); else if (v.repeat) delete v.repeat.anchor;
    }
  }
  p.set(v);
  if (ui.pop === p) renderPop();
}
function taskDateTarget(id) {
  return {
    type: 'date', title: 'Due date',
    get: function () { var t = task(id) || {}; return { due: t.due || null, repeat: t.repeat || null, remind: t.remind == null ? null : t.remind }; },
    set: function (v) { commit(function () { var t = task(id); if (t) { t.due = v.due; t.repeat = v.repeat; t.remind = v.remind; } }); }
  };
}

// ── the label picker ────────────────────────────────────────────────────────────────────
function labelsHtml(p) {
  var on = p.get();
  var h = '<div class="t-pop__title">Labels</div>' + state.labels.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; }).map(function (l) {
    return '<button class="t-pop__item" data-act="lp-toggle" data-name="' + esc(l.name) + '" aria-pressed="' + (on.indexOf(l.name) >= 0) + '">' + dot(l.color) + '<span>' + esc(l.name) + '</span>' + (on.indexOf(l.name) >= 0 ? icon('tick', 't-tick') : '') + '</button>';
  }).join('');
  return h + '<div class="t-pop__pad"><input class="yc-input" id="lp-new" placeholder="New label, then Enter" aria-label="New label" style="font-size:13px"></div>';
}
function lpToggle(name) {
  var p = ui.pop, on = p.get().slice(), i = on.indexOf(name);
  if (i >= 0) on.splice(i, 1); else on.push(name);
  p.set(on);
  if (ui.pop === p) renderPop();
}

// ── pop-up boxes ────────────────────────────────────────────────────────────────────────
// { title, body, okText, ok() -> false keeps it open, danger, wide, hideFoot, editor }
function openModal(m) { closePop(); ui.modal = m; renderModal(); var f = $('modal').querySelector('[data-first]') || $('ed-title'); if (f) { f.focus(); if (f.select && f.type !== 'checkbox') f.select(); } }
function closeModal() { ui.modal = null; if (ui.editor && ui.editor.slot === 'modal') ui.editor = null; $('modal').innerHTML = ''; }
function renderModal() {
  var m = ui.modal;
  if (!m) return;
  $('modal').innerHTML = '<div class="t-modal yc-no-fade" data-act="modal-scrim"><div class="yc-card t-modal__box' + (m.wide ? ' t-modal__box--wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(m.title) + '">' +
    '<h2><span>' + esc(m.title) + '</span><button class="t-iconbtn" data-act="modal-cancel" aria-label="Close">' + icon('x') + '</button></h2>' +
    (m.editor ? editorHtml() : m.body) +
    (m.hideFoot || m.editor ? '' : '<div class="t-modal__foot"><button class="yc-button yc-button--ghost" data-act="modal-cancel">' + (m.cancelText || 'Cancel') + '</button>' +
      '<button class="yc-button ' + (m.danger ? 'yc-button--danger' : 'yc-button--primary') + '" data-act="modal-ok">' + esc(m.okText || 'Save') + '</button></div>') + '</div></div>';
}
function confirmBox(title, text, okText, fn) {
  openModal({ title: title, body: '<p class="yc-dim">' + esc(text) + '</p>', okText: okText, danger: true, ok: fn });
}
function promptBox(title, label, value, okText, fn) {
  openModal({
    title: title, okText: okText,
    body: '<div><label class="yc-label" for="m-name">' + esc(label) + '</label><input class="yc-input" id="m-name" data-first data-enter value="' + esc(value) + '"></div>',
    ok: function () { var v = $('m-name').value.trim(); if (!v) return false; fn(v); }
  });
}
function swatches(sel) {
  return '<div class="t-swatches" role="group" aria-label="Colour">' + Object.keys(C.COLORS).map(function (k) {
    return '<button class="yc-swatch' + (k === sel ? ' yc-swatch--on' : '') + '" data-act="swatch" data-color="' + k + '" style="background:' + C.COLORS[k] + '" aria-label="' + k + '" aria-pressed="' + (k === sel) + '"></button>';
  }).join('') + '</div>';
}
function pickedSwatch() { var s = $('modal').querySelector('.yc-swatch--on'); return s ? s.getAttribute('data-color') : 'grey'; }
function projectBox(p) {
  openModal({
    title: p ? 'Edit project' : 'Add a project', okText: p ? 'Save' : 'Add project',
    body: '<div><label class="yc-label" for="m-name">Name</label><input class="yc-input" id="m-name" data-first data-enter value="' + esc(p ? p.name : '') + '"></div>' +
      '<div><div class="yc-label">Colour</div>' + swatches(p ? p.color : 'blue') + '</div>' +
      '<div class="t-setting"><div>Favorite<small>Also listed at the top, under Favorites.</small></div><button class="yc-switch" id="m-fav" role="switch" aria-checked="' + !!(p && p.favorite) + '" aria-label="Favorite"></button></div>',
    ok: function () {
      var name = $('m-name').value.trim(), color = pickedSwatch(), fav = $('m-fav').getAttribute('aria-checked') === 'true';
      if (!name) return false;
      commit(function () {
        if (p) { p.name = name; p.color = color; p.favorite = fav; }
        else {
          var np = { id: C.uid(), name: name, color: color, favorite: fav, archived: false, layout: 'list', order: state.projects.length, sections: [] };
          state.projects.push(np); ui.view = { kind: 'project', id: np.id };
        }
      });
    }
  });
}
function renameLabel(old, name) {
  state.tasks.forEach(function (t) { var i = t.labels.indexOf(old); if (i >= 0) { if (t.labels.indexOf(name) >= 0) t.labels.splice(i, 1); else t.labels[i] = name; } });
  state.filters.forEach(function (f) { f.query.labels = f.query.labels.map(function (l) { return l === old ? name : l; }); });
}
function labelBox(l) {
  openModal({
    title: l ? 'Edit label' : 'Add a label', okText: l ? 'Save' : 'Add label',
    body: '<div><label class="yc-label" for="m-name">Name</label><input class="yc-input" id="m-name" data-first data-enter value="' + esc(l ? l.name : '') + '"></div>' +
      '<div><div class="yc-label">Colour</div>' + swatches(l ? l.color : 'teal') + '</div>',
    ok: function () {
      var name = $('m-name').value.trim().replace(/^@/, '').replace(/\s+/g, '-').slice(0, 40), color = pickedSwatch();
      if (!name) return false;
      var clash = state.labels.filter(function (x) { return x !== l && x.name.toLowerCase() === name.toLowerCase(); })[0];
      commit(function () {
        if (!l) { if (clash) clash.color = color; else state.labels.push({ name: name, color: color }); return; }
        var old = l.name;
        if (clash) { state.labels.splice(state.labels.indexOf(l), 1); clash.color = color; name = clash.name; } else { l.name = name; l.color = color; }
        if (old !== name) renameLabel(old, name);
        if (ui.view.kind === 'label' && ui.view.id === old) ui.view = { kind: 'label', id: name };
      });
    }
  });
}
function filterBox(f) {
  var q = f ? f.query : { priorities: [], labels: [], projects: [], due: 'any' };
  function chips(group, list) {
    return '<div class="yc-chips" data-group="' + group + '">' + list.map(function (x) { return '<button class="yc-filter" data-act="press" data-v="' + esc(x[0]) + '" aria-pressed="' + x[2] + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
  }
  function read(group) { return Array.prototype.map.call($('modal').querySelectorAll('[data-group="' + group + '"] [aria-pressed="true"]'), function (b) { return b.getAttribute('data-v'); }); }
  openModal({
    title: f ? 'Edit filter' : 'Add a filter', okText: f ? 'Save' : 'Add filter', wide: true,
    body: '<div><label class="yc-label" for="m-name">Name</label><input class="yc-input" id="m-name" data-first value="' + esc(f ? f.name : '') + '" placeholder="Quick wins"></div>' +
      '<p class="yc-caption">A filter is a saved search. It shows open tasks that match every row you set; leave a row empty to ignore it.</p>' +
      '<div><div class="yc-label">Priority</div>' + chips('priorities', [1, 2, 3, 4].map(function (p) { return [String(p), p === 4 ? 'No priority' : 'Priority ' + p, q.priorities.indexOf(p) >= 0]; })) + '</div>' +
      '<div><label class="yc-label" for="m-due">Due</label><select class="yc-select" id="m-due">' +
      [['any', 'Any time, or no date'], ['overdue', 'Overdue'], ['today', 'Today or overdue'], ['week', 'In the next 7 days, or overdue'], ['dated', 'Has a due date'], ['none', 'No due date']].map(function (o) { return '<option value="' + o[0] + '"' + (q.due === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      (state.labels.length ? '<div><div class="yc-label">Has any of these labels</div>' + chips('labels', state.labels.map(function (l) { return [l.name, l.name, q.labels.indexOf(l.name) >= 0]; })) + '</div>' : '') +
      '<div><div class="yc-label">In any of these</div>' + chips('projects', [['inbox', 'Inbox', q.projects.indexOf('inbox') >= 0]].concat(liveProjects().map(function (p) { return [p.id, p.name, q.projects.indexOf(p.id) >= 0]; }))) + '</div>',
    ok: function () {
      var name = $('m-name').value.trim();
      if (!name) { $('m-name').focus(); return false; }
      var query = { priorities: read('priorities').map(Number), labels: read('labels'), projects: read('projects'), due: $('m-due').value };
      commit(function () {
        if (f) { f.name = name; f.query = query; }
        else { var nf = { id: C.uid(), name: name, query: query }; state.filters.push(nf); ui.view = { kind: 'filter', id: nf.id }; }
      });
    }
  });
}
function progressBox() {
  var n = now(), goal = state.settings.dailyGoal, days = [], week = 0, all = 0, max = goal;
  for (var i = 6; i >= 0; i--) { var d = C.addDays(n.day, -i), c = state.stats.days[d] || 0; days.push({ d: d, c: c }); week += c; if (c > max) max = c; }
  Object.keys(state.stats.days).forEach(function (k) { all += state.stats.days[k]; });
  var today = state.stats.days[n.day] || 0, run = C.streak(state, n.day);
  openModal({
    title: 'Your progress', hideFoot: true,
    body: '<div class="yc-notice yc-notice--slim"><div class="yc-notice__text">' + (today >= goal ? 'Daily goal reached: ' + today + ' of ' + goal + ' done today.' : today + ' of ' + goal + ' done today. ' + plural(goal - today, 'task') + ' to go.') + '</div></div>' +
      '<div class="t-stats"><div class="yc-box t-stat"><b>' + run + '</b>' + (run === 1 ? 'day' : 'days') + ' in a row</div><div class="yc-box t-stat"><b>' + week + '</b>done in 7 days</div><div class="yc-box t-stat"><b>' + all + '</b>done in 4 months</div></div>' +
      '<div class="t-bars" role="img" aria-label="Tasks finished on each of the last 7 days">' + days.map(function (x) {
        return '<div class="t-bar' + (x.c >= goal ? ' is-met' : '') + '"><span>' + x.c + '</span><i style="height:' + Math.round(100 * x.c / max) + '%"></i><span>' + C.DAY_SHORT[C.dow(x.d)] + '</span></div>';
      }).join('') + '</div>' +
      '<div class="t-setting"><div>Daily goal<small>Tasks to finish each day. Filled bars reached it.</small></div><input type="number" min="1" max="99" class="yc-input" data-change="set-goal" value="' + goal + '" aria-label="Daily goal"></div>'
  });
}
function exportText() {
  var copy = JSON.parse(JSON.stringify(state));
  return JSON.stringify(copy, null, 1);
}
function settingsBox() {
  var s = state.settings;
  function sel(name, value, opts) { return '<select class="yc-select" data-change="' + name + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(value) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
  var doneCount = state.tasks.filter(function (t) { return t.done; }).length + state.log.length;
  openModal({
    title: 'Settings', hideFoot: true, wide: true,
    body: '<div class="t-setting"><div>Open on<small>The list you see first.</small></div>' + sel('set-start', s.startView, [['today', 'Today'], ['inbox', 'Inbox'], ['upcoming', 'Upcoming']]) + '</div>' +
      '<div class="t-setting"><div>Week starts on</div>' + sel('set-week', s.weekStart, [['0', 'Sunday'], ['1', 'Monday']]) + '</div>' +
      '<div class="t-setting"><div>Time</div>' + sel('set-h12', s.h12 ? '1' : '0', [['1', '5:30 PM'], ['0', '17:30']]) + '</div>' +
      '<details class="yc-fold"><summary>Keyboard shortcuts</summary><div class="t-keys">' +
      [['Q', 'Add a task from anywhere'], ['/', 'Search'], ['Enter', 'Save the task you are typing'], ['Esc', 'Close what is open'], ['Ctrl Z', 'Undo the last change']].map(function (k) { return '<span><span class="yc-kbd">' + k[0] + '</span></span><span>' + k[1] + '</span>'; }).join('') + '</div></details>' +
      '<details class="yc-fold"><summary>Typing shortcuts <span class="yc-fold__hint">Words the add box understands</span></summary><div class="t-keys">' +
      [['today, tomorrow, fri, dec 5, 12/25, in 3 days', 'The due day'], ['5pm, 17:30, noon', 'The time'], ['every day, every mon and thu, every 2 weeks', 'Repeats'], ['every! 3 days', 'Repeats, counted from the day you finish it'], ['p1, p2, p3', 'Priority'], ['#Project', 'Puts it in that project'], ['@label', 'Adds a label (a new one is made if needed)']].map(function (k) { return '<span class="yc-mono yc-small">' + k[0] + '</span><span>' + k[1] + '</span>'; }).join('') + '</div></details>' +
      '<details class="yc-fold"><summary>Back up or move your tasks <span class="yc-fold__hint">Copy everything as text, or load a copy</span></summary>' +
      '<textarea class="yc-textarea yc-mono yc-small" id="m-data" rows="6" aria-label="Your tasks as text" style="margin-top:4px">' + esc(exportText()) + '</textarea>' +
      '<div class="yc-row yc-row--end" style="margin-top:8px"><span class="yc-caption t-grow">Select all and copy to keep a backup. To restore, paste a backup here first.</span><button class="yc-button yc-button--sm yc-button--danger" data-act="import">Replace my tasks with this text</button></div></details>' +
      '<div class="t-setting"><div>Finished tasks<small>' + doneCount + ' kept in Completed.</small></div><button class="yc-button yc-button--danger"' + (doneCount ? '' : ' disabled') + ' data-act="clear-done">Delete finished tasks</button></div>'
  });
}

// ── the line at the bottom, and reminders ───────────────────────────────────────────────
function toast(text, undoable) {
  clearTimeout(ui.toastTimer);
  $('toast').innerHTML = '<div class="t-toast" role="status"><span>' + esc(text) + '</span>' + (undoable ? '<button class="yc-button yc-button--sm" data-act="undo">Undo</button>' : '<span></span>') + '</div>';
  ui.toastTimer = setTimeout(function () { $('toast').innerHTML = ''; }, undoable ? 7000 : 2500);
}
// WHY only while open: a page has no way to notify when it is closed — that needs the app.
function checkReminders() {
  var n = now(), changed = false;
  openTasks().forEach(function (t) {
    if (!t.due || !t.due.time || t.remind == null) return;
    var key = t.id + '|' + t.due.date + t.due.time + '|' + t.remind;
    var d = C.fromYmd(t.due.date); d.setHours(+t.due.time.slice(0, 2), +t.due.time.slice(3), 0, 0);
    var at = ui.snooze[key] || (+d - t.remind * 60000);
    // Something that came due long before the page was opened is already in Overdue; no pop-up.
    if (ui.fired[key] || n.ms < at || at < ui.openedAt - 5 * 60000) return;
    ui.fired[key] = { id: t.id, key: key }; changed = true;
  });
  if (changed) renderAlerts();
}
function renderAlerts() {
  var h = '';
  Object.keys(ui.fired).forEach(function (key) {
    var f = ui.fired[key], t = f && f.id ? task(f.id) : null;
    if (!t || t.done || f.closed) return;
    var info = C.dueInfo(t.due, now(), state.settings.h12);
    h += '<div class="yc-notice yc-notice--warning" role="alert"><div class="yc-notice__text"><span class="yc-notice__title">' + esc(t.title) + '</span>' + (info ? 'Due ' + esc(info.text) : '') + '</div>' +
      '<div class="yc-notice__actions"><button class="yc-button yc-button--sm yc-button--ghost" data-act="alert-close" data-key="' + esc(key) + '">Dismiss</button>' +
      '<button class="yc-button yc-button--sm yc-button--ghost" data-act="alert-snooze" data-key="' + esc(key) + '">In 10 minutes</button>' +
      '<button class="yc-button yc-button--sm" data-act="alert-done" data-key="' + esc(key) + '">Mark done</button></div></div>';
  });
  $('alerts').innerHTML = h;
}
