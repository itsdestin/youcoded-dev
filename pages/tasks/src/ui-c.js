// Tasks page — screens, part C: what each click, key and drag does, then start-up.
// Every clickable thing carries data-act="name"; ACT[name] is what it does. One listener on the
// document serves them all, so redrawing a list never has to re-attach anything.

function go(view) {
  ui.view = view;
  if (ui.editor && ui.editor.slot !== 'modal') ui.editor = null;
  ui.selecting = false; ui.picked = {};
  $('app').classList.remove('is-nav-open');
  closePop(); render();
  if ($('list')) $('list').scrollTop = 0;
}
function toggleTask(id) {
  var t = task(id), res;
  if (!t) return;
  if (t.done) { commit(function () { C.reopenTask(state, id); }); return; }
  commit(function () { res = C.completeTask(state, id, now()); });
  toast(res.repeated ? 'Done. Comes back ' + C.formatDay(res.next, now().day, true) : 'Task done', true);
}
function removeTask(id) {
  if (ui.detailId === id) ui.detailId = null;
  commit(function () { C.deleteTask(state, id); }, 'Task deleted');
}
function duplicateTask(id) {
  var t = task(id);
  if (!t) return;
  commit(function () {
    var copy = C.addTask(state, { title: t.title, notes: t.notes, projectId: t.projectId, sectionId: t.sectionId, parentId: t.parentId, priority: t.priority, labels: t.labels, due: t.due, repeat: t.repeat, remind: t.remind }, now().iso);
    C.children(state, id).forEach(function (k) { if (!k.done) C.addTask(state, { title: k.title, notes: k.notes, parentId: copy.id, priority: k.priority, labels: k.labels, due: k.due }, now().iso); });
  }, 'Task duplicated');
}
function setDue(ids, day) {
  commit(function () {
    ids.forEach(function (id) {
      var t = task(id);
      if (!t) return;
      if (!day) { t.due = null; t.repeat = null; t.remind = null; } else t.due = { date: day, time: t.due ? t.due.time : null };
    });
  });
}
function labelsTarget(id) {
  return { type: 'labels', title: 'Labels', get: function () { var t = task(id); return t ? t.labels : []; }, set: function (arr) { commit(function () { var t = task(id); if (t) t.labels = arr; }); } };
}
function taskMenu(anchor, id) {
  var t = task(id), n = now();
  if (!t) return;
  var items = [{ flags: t.priority, fn: function (p) { commit(function () { t.priority = p; }); } }, { sep: true },
    { label: 'Today', icon: 'today', fn: function () { setDue([id], n.day); } },
    { label: 'Tomorrow', icon: 'calendar', fn: function () { setDue([id], C.addDays(n.day, 1)); } },
    { label: 'Pick a date, time or repeat…', icon: 'upcoming', fn: function () { swapPop(taskDateTarget(id)); } }];
  if (t.due) items.push({ label: 'No date', icon: 'x', fn: function () { setDue([id], null); } });
  items.push({ sep: true });
  if (!t.parentId && !t.done) items.push({ label: 'Add a sub-task', icon: 'subs', fn: function () { ui.detailId = id; render(); if ($('d-sub')) $('d-sub').focus(); } });
  if (!t.parentId) items.push({ label: 'Move to…', icon: 'move', fn: function () { swapPop({ type: 'menu', title: 'Move to', items: [{ title: 'Move to' }].concat(destItems(function (pid, sid) { commit(function () { C.moveTask(state, id, { projectId: pid, sectionId: sid }); }, 'Moved to ' + whereText(task(id))); })) }); } });
  else items.push({ label: 'Make it a task of its own', icon: 'move', fn: function () { commit(function () { C.moveTask(state, id, { projectId: t.projectId, sectionId: t.sectionId, parentId: null }); }); } });
  items.push({ label: 'Labels…', icon: 'tag', fn: function () { swapPop(labelsTarget(id)); } },
    { label: 'Duplicate', icon: 'copy', fn: function () { duplicateTask(id); } }, { sep: true },
    { label: 'Delete', icon: 'trash', danger: true, fn: function () { removeTask(id); } });
  openPop(anchor, { type: 'menu', title: 'Task actions', items: items });
}
function pickedIds() { return Object.keys(ui.picked).filter(function (id) { return ui.picked[id] && task(id); }); }
function endSelecting() { ui.selecting = false; ui.picked = {}; }
function deleteProject(p) {
  var n = state.tasks.filter(function (t) { return t.projectId === p.id; }).length;
  confirmBox('Delete “' + p.name + '”?', n ? 'This also deletes its ' + plural(n, 'task') + ', finished ones included.' : 'The project is empty.', 'Delete project', function () {
    commit(function () {
      state.tasks = state.tasks.filter(function (t) { return t.projectId !== p.id; });
      state.projects = state.projects.filter(function (x) { return x !== p; });
      state.filters.forEach(function (f) { f.query.projects = f.query.projects.filter(function (x) { return x !== p.id; }); });
      ui.view = { kind: 'inbox' };
    }, 'Project deleted');
  });
}
function sectionOf(id) {
  for (var i = 0; i < state.projects.length; i++) { var s = C.byId(state.projects[i].sections, id); if (s) return { p: state.projects[i], s: s }; }
  return null;
}
function quickDefaults() {
  var v = ui.view;
  if (v.kind === 'project' && project(v.id) && !project(v.id).archived) return { projectId: v.id };
  if (v.kind === 'today') return { due: { date: now().day, time: null } };
  if (v.kind === 'label') return { labels: [v.id] };
  return {};
}

var ACT = {
  go: function (el) { go(JSON.parse(el.getAttribute('data-view'))); },
  'nav-open': function () { $('app').classList.add('is-nav-open'); },
  'nav-close': function () { $('app').classList.remove('is-nav-open'); },
  undo: function () { undo(); },
  progress: function () { progressBox(); },
  settings: function () { settingsBox(); },

  // adding
  'quick-add': function () { $('app').classList.remove('is-nav-open'); openEditor('modal', quickDefaults()); openModal({ title: 'Add a task', editor: true, wide: true }); },
  'add-here': function (el) { openEditor(el.getAttribute('data-slot'), JSON.parse(el.getAttribute('data-defaults'))); render(); if ($('ed-title')) $('ed-title').focus(); },
  'ed-submit': function () { submitEditor(); },
  'ed-cancel': function () { closeEditor(); },
  'ed-ignore': function (el) { ui.editor.ignore.push(el.getAttribute('data-text')); refreshEditor(); $('ed-title').focus(); },
  'ed-date': function (el) {
    openPop(el, {
      type: 'date', title: 'Due date',
      get: function () { var v = editorValue(); return { due: v.due, repeat: v.repeat, remind: v.remind }; },
      set: function (v) { editorOverride(['date', 'time', 'repeat']); ui.editor.due = v.due; ui.editor.repeat = v.repeat; ui.editor.remind = v.remind; refreshEditor(); }
    });
  },
  'ed-labels': function (el) {
    openPop(el, { type: 'labels', title: 'Labels', get: function () { return ui.editor ? ui.editor.labels : []; }, set: function (arr) { if (ui.editor) { ui.editor.labels = arr; refreshEditor(); } } });
  },

  // a task row
  toggle: function (el) { toggleTask(el.getAttribute('data-id')); },
  open: function (el) {
    var id = el.getAttribute('data-id');
    if (ui.selecting) { ui.picked[id] = !ui.picked[id]; renderMain(); return; }
    ui.detailId = id; render();
  },
  pick: function (el) { ui.picked[el.getAttribute('data-id')] = el.checked; renderBulk(); },
  twisty: function (el) { var id = el.getAttribute('data-id'); ui.collapsed[id] = !ui.collapsed[id]; renderMain(); },
  'row-date': function (el) { openPop(el, taskDateTarget(el.getAttribute('data-id'))); },
  'row-more': function (el) { taskMenu(el, el.getAttribute('data-id')); },
  reschedule: function () {
    var n = now(), ids = openTasks().filter(function (t) { return t.due && t.due.date < n.day; }).map(function (t) { return t.id; });
    setDue(ids, n.day); toast(plural(ids.length, 'task') + ' moved to today', true);
  },

  // the list's own tools
  'toggle-done': function () { setViewOpt('done', !viewOpts(ui.view).done); },
  'select-mode': function () { ui.selecting = !ui.selecting; ui.picked = {}; renderMain(); },
  'set-layout': function (el) { var p = project(ui.view.id); if (p) quiet(function () { p.layout = el.getAttribute('data-layout'); }); },

  // several tasks at once
  'bulk-date': function (el) {
    var val = { due: null, repeat: null, remind: null };
    openPop(el, { type: 'date', title: 'Due date', get: function () { return val; }, set: function (v) { val = v; commit(function () { pickedIds().forEach(function (id) { var t = task(id); t.due = v.due ? { date: v.due.date, time: v.due.time } : null; t.repeat = v.repeat; t.remind = v.remind; }); }); } });
  },
  'bulk-priority': function (el) {
    openPop(el, { type: 'menu', title: 'Priority', items: [1, 2, 3, 4].map(function (p) { return { label: p === 4 ? 'No priority' : 'Priority ' + p, icon: 'flag', fn: function () { commit(function () { pickedIds().forEach(function (id) { task(id).priority = p; }); }); } }; }) });
  },
  'bulk-move': function (el) {
    openPop(el, { type: 'menu', title: 'Move to', items: [{ title: 'Move to' }].concat(destItems(function (pid, sid) {
      var ids = pickedIds();
      commit(function () { ids.forEach(function (id) { C.moveTask(state, id, { projectId: pid, sectionId: sid }); }); endSelecting(); }, plural(ids.length, 'task') + ' moved');
    })) });
  },
  'bulk-labels': function (el) {
    var ids = pickedIds(), common = state.labels.map(function (l) { return l.name; }).filter(function (n) { return ids.every(function (id) { return task(id).labels.indexOf(n) >= 0; }); });
    openPop(el, {
      type: 'labels', title: 'Labels', get: function () { return common; },
      set: function (arr) {
        var add = arr.filter(function (n) { return common.indexOf(n) < 0; }), drop = common.filter(function (n) { return arr.indexOf(n) < 0; });
        common = arr;
        commit(function () { pickedIds().forEach(function (id) { var t = task(id); t.labels = t.labels.filter(function (n) { return drop.indexOf(n) < 0; }); add.forEach(function (n) { if (t.labels.indexOf(n) < 0) t.labels.push(n); }); }); });
      }
    });
  },
  'bulk-done': function () {
    var ids = pickedIds();
    commit(function () { ids.forEach(function (id) { C.completeTask(state, id, now()); }); endSelecting(); }, plural(ids.length, 'task') + ' done');
  },
  'bulk-delete': function () {
    var ids = pickedIds();
    commit(function () { ids.forEach(function (id) { C.deleteTask(state, id); }); endSelecting(); }, plural(ids.length, 'task') + ' deleted');
  },

  // the open task
  'detail-close': function () { ui.detailId = null; render(); },
  'd-date': function (el) { openPop(el, taskDateTarget(ui.detailId)); },
  'd-labels': function (el) { openPop(el, labelsTarget(ui.detailId)); },
  'd-delete': function () { removeTask(ui.detailId); },
  'd-comment-add': function () {
    var box = $('d-comment'), text = box.value.trim(), t = task(ui.detailId);
    if (!text || !t) return box.focus();
    box.value = '';
    commit(function () { t.comments.push({ id: C.uid(), text: text.slice(0, 5000), at: now().iso }); });
  },
  'd-comment-del': function (el) {
    var t = task(ui.detailId), id = el.getAttribute('data-id');
    if (t) commit(function () { t.comments = t.comments.filter(function (c) { return c.id !== id; }); }, 'Comment deleted');
  },

  // projects and their sections
  'project-add': function () { projectBox(null); },
  'project-unarchive': function (el) { var p = project(el.getAttribute('data-id')); if (p) commit(function () { p.archived = false; }); },
  'project-more': function (el) {
    var p = project(el.getAttribute('data-id'));
    if (!p) return;
    openPop(el, { type: 'menu', title: 'Project actions', items: [
      { label: 'Edit name and colour', icon: 'edit', fn: function () { projectBox(p); } },
      { label: 'Add a section', icon: 'plus', fn: function () { ACT['section-add'](); } },
      { label: p.favorite ? 'Remove from Favorites' : 'Add to Favorites', icon: 'star', fn: function () { commit(function () { p.favorite = !p.favorite; }); } },
      { sep: true },
      { label: p.archived ? 'Bring back from the archive' : 'Archive', icon: 'archive', hint: p.archived ? '' : 'Hide, keep tasks', fn: function () { commit(function () { p.archived = !p.archived; if (p.archived) ui.view = { kind: 'inbox' }; }, p.archived ? 'Project brought back' : 'Project archived. Find it under Filters & labels.'); } },
      { label: 'Delete', icon: 'trash', danger: true, fn: function () { deleteProject(p); } }
    ] });
  },
  'section-add': function () {
    var p = project(ui.view.id);
    if (p) promptBox('Add a section', 'Section name', '', 'Add section', function (name) { commit(function () { p.sections.push({ id: C.uid(), name: name.slice(0, 120), order: p.sections.length ? Math.max.apply(null, p.sections.map(function (s) { return s.order; })) + 1 : 0, collapsed: false }); }); });
  },
  'section-fold': function (el) { var x = sectionOf(el.getAttribute('data-id')); if (x) quiet(function () { x.s.collapsed = !x.s.collapsed; }); },
  'section-more': function (el) {
    var x = sectionOf(el.getAttribute('data-id'));
    if (!x) return;
    function shift(by) {
      commit(function () {
        var list = sections(x.p), i = list.indexOf(x.s), j = i + by;
        if (j < 0 || j >= list.length) return;
        list.splice(i, 1); list.splice(j, 0, x.s);
        list.forEach(function (s, k) { s.order = k; });
      });
    }
    openPop(el, { type: 'menu', title: 'Section actions', items: [
      { label: 'Rename', icon: 'edit', fn: function () { promptBox('Rename section', 'Section name', x.s.name, 'Save', function (name) { commit(function () { x.s.name = name.slice(0, 120); }); }); } },
      { label: x.p.layout === 'board' ? 'Move left' : 'Move up', icon: 'left', fn: function () { shift(-1); } },
      { label: x.p.layout === 'board' ? 'Move right' : 'Move down', icon: 'chev', fn: function () { shift(1); } },
      { sep: true },
      { label: 'Delete section', icon: 'trash', danger: true, hint: 'Keeps its tasks', fn: function () {
        commit(function () {
          state.tasks.forEach(function (t) { if (t.sectionId === x.s.id) t.sectionId = null; });
          x.p.sections = x.p.sections.filter(function (s) { return s !== x.s; });
        }, 'Section deleted. Its tasks are still in the project.');
      } }
    ] });
  },

  // labels and filters
  'label-add': function () { labelBox(null); },
  'label-more': function (el) {
    var name = el.getAttribute('data-id'), l = state.labels.filter(function (x) { return x.name === name; })[0];
    if (!l) return;
    openPop(el, { type: 'menu', title: 'Label actions', items: [
      { label: 'Edit name and colour', icon: 'edit', fn: function () { labelBox(l); } },
      { label: 'Delete label', icon: 'trash', danger: true, hint: 'Keeps its tasks', fn: function () {
        commit(function () {
          state.labels = state.labels.filter(function (x) { return x !== l; });
          state.tasks.forEach(function (t) { t.labels = t.labels.filter(function (x) { return x !== name; }); });
          state.filters.forEach(function (f) { f.query.labels = f.query.labels.filter(function (x) { return x !== name; }); });
          if (ui.view.kind === 'label') ui.view = { kind: 'labels' };
        }, 'Label deleted');
      } }
    ] });
  },
  'filter-add': function () { filterBox(null); },
  'filter-more': function (el) {
    var f = C.byId(state.filters, el.getAttribute('data-id'));
    if (!f) return;
    openPop(el, { type: 'menu', title: 'Filter actions', items: [
      { label: 'Edit', icon: 'edit', fn: function () { filterBox(f); } },
      { label: 'Delete filter', icon: 'trash', danger: true, fn: function () { commit(function () { state.filters = state.filters.filter(function (x) { return x !== f; }); if (ui.view.kind === 'filter') ui.view = { kind: 'labels' }; }, 'Filter deleted'); } }
    ] });
  },

  // floating things
  'pop-item': function (el) { var p = ui.pop, it = p.items[+el.getAttribute('data-i')]; it.fn(); if (ui.pop === p) closePop(); },
  'pop-flag': function (el) { var p = ui.pop, it = p.items[+el.getAttribute('data-i')]; it.fn(+el.getAttribute('data-p')); if (ui.pop === p) closePop(); },
  'dp-quick': function (el) { var day = el.getAttribute('data-day'); dpChange(function (v) { v.due = day ? { date: day, time: v.due ? v.due.time : null } : null; }); closePop(); },
  'dp-day': function (el) { var day = el.getAttribute('data-day'); ui.pop.month = day.slice(0, 7) + '-01'; dpChange(function (v) { v.due = { date: day, time: v.due ? v.due.time : null }; }); },
  'dp-month': function (el) { ui.pop.month = C.addMonths(ui.pop.month, +el.getAttribute('data-step')); renderPop(); },
  'dp-wd': function (el) {
    var d = +el.getAttribute('data-d');
    dpChange(function (v) {
      v.wantDay = true;
      var r = v.repeat || (v.repeat = { every: 1, unit: 'week' }), days = (r.days || []).slice(), i = days.indexOf(d);
      if (i >= 0) days.splice(i, 1); else days.push(d);
      r.unit = 'week'; if (days.length) r.days = days; else delete r.days;
    });
  },
  'dp-close': function () { closePop(); },
  'lp-toggle': function (el) { lpToggle(el.getAttribute('data-name')); },
  'modal-cancel': function () { closeModal(); render(); },
  'modal-scrim': function (el, e) { if (e.target === el) { closeModal(); render(); } },
  'modal-ok': function () { var m = ui.modal; if (m.ok && m.ok() === false) return; if (ui.modal === m) closeModal(); },
  press: function (el) { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); },
  swatch: function (el) {
    Array.prototype.forEach.call(el.parentNode.children, function (s) { s.classList.remove('yc-swatch--on'); s.setAttribute('aria-pressed', 'false'); });
    el.classList.add('yc-swatch--on'); el.setAttribute('aria-pressed', 'true');
  },
  'import': function () {
    var parsed, text = $('m-data').value, old = $('modal').querySelector('.yc-notice--danger');
    if (old) old.remove();
    try { parsed = JSON.parse(text); if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) throw new Error('The text has no list of tasks in it.'); }
    catch (err) {
      $('m-data').insertAdjacentHTML('afterend', '<div class="yc-notice yc-notice--danger" style="margin-top:8px" role="alert"><div class="yc-notice__text">That text could not be read as a Tasks backup. Nothing was changed.</div><details class="yc-fold yc-notice__details"><summary>Details</summary><code>' + esc(err.message) + '</code></details></div>');
      return;
    }
    confirmBox('Replace all your tasks?', 'Everything in Tasks now is replaced by the ' + plural(parsed.tasks.length, 'task') + ' in the pasted text. You can undo this until you close the page.', 'Replace', function () {
      commit(function () { state = C.normalize(parsed); ui.detailId = null; ui.view = { kind: 'inbox' }; }, 'Tasks replaced');
    });
  },
  'clear-done': function () {
    confirmBox('Delete finished tasks?', 'Everything under Completed is removed. Your progress numbers stay.', 'Delete', function () {
      commit(function () {
        var drop = {};
        state.tasks.forEach(function (t) { if (t.done && !t.parentId) drop[t.id] = 1; });
        state.tasks = state.tasks.filter(function (t) { return !drop[t.id] && !drop[t.parentId] && !(t.done && t.parentId && !task(t.parentId)); });
        state.tasks = state.tasks.filter(function (t) { return !t.done || t.parentId; });
        state.log = [];
      }, 'Finished tasks deleted');
    });
  },
  'alert-close': function (el) { ui.fired[el.getAttribute('data-key')].closed = true; renderAlerts(); },
  'alert-snooze': function (el) { var k = el.getAttribute('data-key'); delete ui.fired[k]; ui.snooze[k] = Date.now() + 10 * 60000; renderAlerts(); toast('Reminding you again in 10 minutes'); },
  'alert-done': function (el) { var f = ui.fired[el.getAttribute('data-key')]; f.closed = true; toggleTask(f.id); renderAlerts(); }
};

// What a changed box or dropdown does (data-change="name").
var CHANGE = {
  sort: function (el) { setViewOpt('sort', el.value); },
  group: function (el) { setViewOpt('group', el.value); },
  'ed-priority': function (el) { editorOverride(['priority']); ui.editor.priority = +el.value; refreshEditor(); },
  'ed-project': function (el) { var v = el.value.split('|'); editorOverride(['project']); ui.editor.projectId = v[0] || null; ui.editor.sectionId = v[1] || null; refreshEditor(); },
  'd-title': function (el) {
    var t = task(ui.detailId), v = el.value.replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (!v) { el.value = t.title; return; }
    if (v !== t.title) commit(function () { t.title = v.slice(0, 500); });
  },
  'd-notes': function (el) { var t = task(ui.detailId); if (t && el.value !== t.notes) commit(function () { t.notes = el.value.slice(0, 20000); }); },
  'd-priority': function (el) { var t = task(ui.detailId); if (t) commit(function () { t.priority = +el.value; }); },
  'd-project': function (el) { var v = el.value.split('|'), id = ui.detailId; commit(function () { C.moveTask(state, id, { projectId: v[0] || null, sectionId: v[1] || null }); }); },
  'dp-time': function (el) { var time = C.isTime(el.value) ? el.value : null; dpChange(function (v) { if (v.due) v.due.time = time; else if (time) { v.wantDay = true; v.wantTime = time; } }); },
  'dp-repeat': function (el) {
    var k = el.value;
    ui.pop.custom = k === 'custom';
    dpChange(function (v) {
      v.wantDay = !!k;
      if (k === 'custom') { if (!v.repeat) v.repeat = { every: 1, unit: 'week' }; return; }
      v.repeat = !k ? null : k === 'weekday' ? { every: 1, unit: 'week', days: [1, 2, 3, 4, 5] } : k === '2week' ? { every: 2, unit: 'week' } : { every: 1, unit: k };
    });
  },
  'dp-every': function (el) { dpChange(function (v) { if (v.repeat) v.repeat.every = Math.max(1, Math.round(+el.value) || 1); }); },
  'dp-unit': function (el) { dpChange(function (v) { if (v.repeat) { v.repeat.unit = el.value; delete v.repeat.days; } }); },
  'dp-after': function (el) { var on = el.getAttribute('aria-checked') === 'true'; dpChange(function (v) { if (v.repeat) { if (on) v.repeat.after = true; else delete v.repeat.after; } }); },
  'dp-remind': function (el) { dpChange(function (v) { v.remind = el.value === '' ? null : +el.value; }); },
  'set-start': function (el) { quiet(function () { state.settings.startView = el.value; }); },
  'set-week': function (el) { quiet(function () { state.settings.weekStart = +el.value; }); },
  'set-h12': function (el) { quiet(function () { state.settings.h12 = el.value === '1'; }); },
  'set-goal': function (el) { quiet(function () { state.settings.dailyGoal = Math.max(1, Math.min(99, Math.round(+el.value) || 5)); }); progressBox(); }
};

// ── listening ───────────────────────────────────────────────────────────────────────────
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t.closest) return;
  // A click anywhere else puts a floating menu away and does nothing more.
  if (ui.pop && !t.closest('#pop') && !t.closest('.yc-menu')) { closePop(); e.preventDefault(); return; }
  // A link inside a task is the app's to open; it must not also open the task.
  if (t.closest('a[href]')) return;
  var el = t.closest('[data-act]');
  if (!el || el.disabled) return;
  var fn = ACT[el.getAttribute('data-act')];
  if (fn) fn(el, e);
});
document.addEventListener('change', function (e) {
  var el = e.target.closest ? e.target.closest('[data-change]') : null;
  if (el && CHANGE[el.getAttribute('data-change')]) CHANGE[el.getAttribute('data-change')](el);
});
document.addEventListener('input', function (e) {
  var id = e.target.id;
  if (id === 'ed-title') { ui.editor.text = e.target.value; refreshEditor(); }
  else if (id === 'ed-notes') ui.editor.notes = e.target.value;
  else if (id === 'd-title') growTitle();
  else if (id === 'search') {
    var q = e.target.value;
    if (q || ui.view.kind === 'search') { ui.view = { kind: 'search', q: q }; ui.selecting = false; render(); }
  }
});
document.addEventListener('keydown', function (e) {
  var t = e.target, id = t.id, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (e.key === 'Escape') {
    // The app's own dropdown list (an open <select>) closes itself first.
    if (document.querySelector('.yc-menu[role="listbox"]')) return;
    var used = true;
    if (ui.pop) closePop();
    else if (ui.modal) { closeModal(); render(); }
    else if (ui.editor) closeEditor();
    else if ($('app').classList.contains('is-nav-open')) $('app').classList.remove('is-nav-open');
    else if (ui.selecting) { endSelecting(); renderMain(); }
    else if (ui.detailId) { ui.detailId = null; render(); }
    else if (ui.view.kind === 'search') go({ kind: state.settings.startView });
    else used = false;
    // WHY preventDefault: the app treats an unused Escape as "leave this page".
    if (used) e.preventDefault();
    return;
  }
  if (e.key === 'Enter' && !e.isComposing) {
    if (id === 'ed-title' || id === 'ed-notes') { e.preventDefault(); submitEditor(); }
    else if (id === 'd-title') { e.preventDefault(); t.blur(); }
    else if (id === 'd-sub') {
      var title = t.value.trim(), parent = ui.detailId;
      if (title) { t.value = ''; commit(function () { C.addTask(state, { title: title, parentId: parent }, now().iso); }); }
    }
    else if (id === 'd-comment' && (e.ctrlKey || e.metaKey)) ACT['d-comment-add']();
    else if (id === 'lp-new') {
      var p = ui.pop, name, raw = t.value;
      if (!raw.trim() || !p) return;
      commit(function () { name = C.ensureLabel(state, raw); });
      var on = p.get().slice();
      if (name && on.indexOf(name) < 0) { on.push(name); p.set(on); }
      if (ui.pop === p) { renderPop(); if ($('lp-new')) $('lp-new').focus(); }
    }
    else if (t.hasAttribute && t.hasAttribute('data-enter')) { e.preventDefault(); ACT['modal-ok'](); }
    else if (t.classList && (t.classList.contains('t-task') || t.classList.contains('t-sub'))) ACT.open(t);
    return;
  }
  if (e.key === ' ' && t.classList && (t.classList.contains('t-task') || t.classList.contains('t-sub'))) { e.preventDefault(); ACT.open(t); return; }
  if (typing || ui.modal || ui.pop || e.altKey) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey || e.metaKey) return;
  if (e.key === 'q' || e.key === 'n') { e.preventDefault(); ACT['quick-add'](); }
  else if (e.key === '/') { e.preventDefault(); $('app').classList.add('is-nav-open'); $('search').focus(); }
});

// ── dragging a task: onto another to reorder, into a section, a project, or a day ───────
function clearDropMarks() {
  Array.prototype.forEach.call(document.querySelectorAll('.drop-before, .drop-after, .is-drop'), function (el) { el.classList.remove('drop-before', 'drop-after', 'is-drop'); });
}
function dropTarget(e) {
  var t = e.target.closest ? e.target : e.target.parentNode;
  if (!t || !t.closest) return null;
  var nav = t.closest('.t-navitem[data-drop-project], .t-navitem[data-drop-due]');
  if (nav) return { el: nav, projectId: nav.hasAttribute('data-drop-project') ? nav.getAttribute('data-drop-project') || null : undefined, due: nav.getAttribute('data-drop-due') };
  var zone = t.closest('[data-drop], [data-drop-due]');
  if (!zone) return null;
  if (zone.hasAttribute('data-drop-due')) return { el: zone, due: zone.getAttribute('data-drop-due') };
  var row = t.closest('.t-task'), out = { el: zone, where: JSON.parse(zone.getAttribute('data-drop')) };
  if (row && row.getAttribute('data-id') !== ui.drag.id) {
    var r = row.getBoundingClientRect();
    out.row = row; out.before = e.clientY < r.top + r.height / 2;
  }
  return out;
}
document.addEventListener('dragstart', function (e) {
  var row = e.target.closest ? e.target.closest('.t-task[draggable="true"]') : null;
  if (!row) return;
  ui.drag = { id: row.getAttribute('data-id') };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', task(ui.drag.id).title); } catch (err) {}
  setTimeout(function () { row.classList.add('is-dragging'); }, 0);
});
document.addEventListener('dragover', function (e) {
  if (!ui.drag) return;
  var d = dropTarget(e);
  clearDropMarks();
  if (!d) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  if (d.row) d.row.classList.add(d.before ? 'drop-before' : 'drop-after'); else d.el.classList.add('is-drop');
});
document.addEventListener('drop', function (e) {
  if (!ui.drag) return;
  var d = dropTarget(e), id = ui.drag.id, t = task(id);
  clearDropMarks(); ui.drag = null;
  if (!d || !t) return;
  e.preventDefault();
  if (d.due) { setDue([id], d.due); toast('Due ' + C.formatDay(d.due, now().day, true), true); return; }
  if (d.projectId !== undefined) { commit(function () { C.moveTask(state, id, { projectId: d.projectId, sectionId: null }); }, 'Moved to ' + (project(d.projectId) ? project(d.projectId).name : 'Inbox')); return; }
  var where = { projectId: d.where.projectId || null, sectionId: d.where.sectionId || null, parentId: null }, beforeId;
  if (d.row) {
    var over = task(d.row.getAttribute('data-id')), hasKids = C.children(state, id).length > 0;
    // Dropped among another task's sub-tasks: it joins them (unless it has sub-tasks itself).
    if (over && over.parentId && !hasKids && over.parentId !== id) where.parentId = over.parentId;
    else if (over && over.parentId) over = task(over.parentId);
    if (over) {
      var sibs = state.tasks.filter(function (x) { return x.id !== id && x.projectId === over.projectId && x.sectionId === over.sectionId && x.parentId === over.parentId; }).sort(function (a, b) { return a.order - b.order; });
      var i = sibs.indexOf(over);
      beforeId = d.before ? over.id : sibs[i + 1] ? sibs[i + 1].id : undefined;
    }
  }
  commit(function () {
    C.moveTask(state, id, where, beforeId);
    // Dragging into place is choosing an order: show it, whatever the list was sorted by.
    var k = viewKey(ui.view), o = state.settings.views[k];
    if (o && o.sort && o.sort !== 'manual') o.sort = 'manual';
  });
});
document.addEventListener('dragend', function () { ui.drag = null; clearDropMarks(); Array.prototype.forEach.call(document.querySelectorAll('.is-dragging'), function (el) { el.classList.remove('is-dragging'); }); });

// ── start ───────────────────────────────────────────────────────────────────────────────
if (api && api.onData) api.onData(function (data) {
  // The saved data changed outside this page (the assistant added a task, or another device
  // synced). Take it, unless it is just this page's own last save coming back.
  var next = C.normalize(data);
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  state = next; undoStack = [];
  render();
});
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
var lastMinute = '';
setInterval(function () {
  checkReminders();
  var n = now(), a = document.activeElement, busy = ui.pop || ui.modal || ui.editor || ui.drag || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  // Once a minute, quietly: "Today" becomes "Yesterday" at midnight, 5 PM turns overdue at 5:01.
  if (n.day + n.time !== lastMinute && !busy) { lastMinute = n.day + n.time; render(); }
}, 20000);
render();
checkReminders();
