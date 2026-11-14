// Tasks page — screens, part A: shared helpers, which tasks each view shows, and drawing the
// three columns (lists on the left, tasks in the middle, one task on the right).
// build.mjs pastes ui-a.js, ui-b.js and ui-c.js into ONE function, so they share these names.
var C = TasksCore;
var api = window.youcoded || null;
var state = C.normalize(api && api.data);
var $ = function (id) { return document.getElementById(id); };

var ICONS = {
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z',
  today: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M12 16h.01',
  upcoming: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z M7 7h.01',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5L22 3z',
  done: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3',
  plus: 'M12 5v14 M5 12h14',
  more: 'M12 12h.01 M19 12h.01 M5 12h.01',
  x: 'M18 6 6 18 M6 6l12 12',
  chev: 'M9 5l7 7-7 7',
  left: 'M15 5l-7 7 7 7',
  repeat: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  comment: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  subs: 'M4 4v9a3 3 0 0 0 3 3h4 M4 9h7 M15 6h6v5h-6z M15 14h6v5h-6z',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
  move: 'M5 12h14 M12 5l7 7-7 7',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  board: 'M3 3h7v18H3z M14 3h7v10h-7z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  pick: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  archive: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  tick: 'M20 6 9 17l-5-5'
};
function icon(name, cls) { return '<svg class="t-icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>'; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
// Escaped text with web addresses turned into links. The app, not the page, opens them.
function linked(s) {
  return esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, function (u) { return '<a href="' + u + '" rel="noopener">' + u + '</a>'; });
}
function now() { var d = new Date(); return { day: C.ymd(d), time: C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()), iso: d.toISOString(), ms: +d }; }
function dot(color) { return '<span class="t-dot" style="--dot:' + (C.COLORS[color] || C.COLORS.grey) + '"></span>'; }
// Priorities read as plain words. 1-3 are still what is saved and what "p1" types.
var PRI = { 1: 'High', 2: 'Medium', 3: 'Low', 4: 'None' };
var PRI_TONE = { 1: 'danger', 2: 'warning', 3: 'info' };
function priName(p) { return p === 4 ? 'No priority' : PRI[p] + ' priority'; }
// A label's mark: the app's filled tag in the label's own colour; the word stays the text colour.
function tagIcon(color) { return '<svg class="t-tagicon" viewBox="0 0 24 24" aria-hidden="true" style="--dot:' + (C.COLORS[color] || C.COLORS.grey) + '"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/></svg>'; }
function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

// What is on screen right now. None of this is saved except through `state`.
var ui = {
  view: { kind: state.settings.startView },
  detailId: null,     // the task open on the right
  editor: null,       // the add-task box, wherever it is open
  selecting: false, picked: {},
  collapsed: {},      // parent tasks whose sub-tasks are folded away
  pop: null, modal: null, toastTimer: null,
  drag: null, fired: {}, snooze: {}, openedAt: Date.now()
};

// ── saving and undo ─────────────────────────────────────────────────────────────────────
var undoStack = [], saveTimer = null, renderTimer = null, lastSaved = '';
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; lastSaved = JSON.stringify(state); if (api && api.save) api.save(state); } }
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 150); }
// Every change to tasks goes through here: one step back is kept for Undo, the data is saved,
// and the screen is redrawn. WHY the redraw waits a tick: a change often comes from leaving a
// text box by clicking another; drawing at once would rebuild the box being clicked into.
function commit(fn, toastText) {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 30) undoStack.shift();
  fn();
  save();
  scheduleRender();
  if (toastText) toast(toastText, true);
}
// A change to how things are shown (sorting, a folded section): saved, but not an Undo step.
function quiet(fn) { fn(); save(); scheduleRender(); }
function undo() {
  var last = undoStack.pop();
  if (!last) return toast('Nothing to undo');
  state = JSON.parse(last);
  save(); render(); toast('Undone');
}
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 0); }

// ── looking things up ───────────────────────────────────────────────────────────────────
function task(id) { return C.byId(state.tasks, id); }
function project(id) { return id ? C.byId(state.projects, id) : null; }
function liveProjects() { return state.projects.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.order - b.order; }); }
function sections(p) { return p ? p.sections.slice().sort(function (a, b) { return a.order - b.order; }) : []; }
function whereText(t) {
  var p = project(t.projectId);
  if (!p) return 'Inbox';
  var s = t.sectionId ? C.byId(p.sections, t.sectionId) : null;
  return p.name + (s ? ' › ' + s.name : '');
}
function labelColor(name) { for (var i = 0; i < state.labels.length; i++) if (state.labels[i].name === name) return state.labels[i].color; return 'grey'; }
function hiddenProject(t) { var p = project(t.projectId); return !!(p && p.archived); }
function openTasks() { return state.tasks.filter(function (t) { return !t.done && !hiddenProject(t); }); }

var BUILTIN_FILTERS = [
  { id: 'b-p1', name: 'High priority', query: { priorities: [1] } },
  { id: 'b-week', name: 'Due in the next 7 days', query: { due: 'week' } },
  { id: 'b-nodate', name: 'No due date', query: { due: 'none' } }
];
function filterById(id) { return C.byId(BUILTIN_FILTERS, id) || C.byId(state.filters, id); }

function viewKey(v) { return v.kind + (v.id ? ':' + v.id : ''); }
function viewOpts(v) {
  var tree = v.kind === 'inbox' || v.kind === 'project';
  var saved = state.settings.views[viewKey(v)] || {};
  return {
    sort: saved.sort || (tree ? 'manual' : 'due'),
    group: v.kind === 'inbox' || v.kind === 'label' || v.kind === 'filter' || v.kind === 'search' ? saved.group || 'none' : 'none',
    done: !!saved.done
  };
}
function setViewOpt(key, value) {
  quiet(function () {
    var k = viewKey(ui.view), o = state.settings.views[k] || (state.settings.views[k] = {});
    o[key] = value;
  });
}
function viewTitle(v) {
  if (v.kind === 'inbox') return 'Inbox';
  if (v.kind === 'today') return 'Today';
  if (v.kind === 'upcoming') return 'Upcoming';
  if (v.kind === 'labels') return 'Filters & labels';
  if (v.kind === 'completed') return 'Completed';
  if (v.kind === 'search') return 'Search';
  if (v.kind === 'project') { var p = project(v.id); return p ? p.name : 'Project'; }
  if (v.kind === 'label') return '@' + v.id;
  if (v.kind === 'filter') { var f = filterById(v.id); return f ? f.name : 'Filter'; }
  return 'Tasks';
}
function viewExists(v) {
  if (v.kind === 'project') return !!project(v.id);
  if (v.kind === 'label') return state.labels.some(function (l) { return l.name === v.id; });
  if (v.kind === 'filter') return !!filterById(v.id);
  return true;
}

// ── which tasks a view shows, in which groups ───────────────────────────────────────────
// A group: { id, title, hint, tasks, tree (show sub-tasks nested), add (what a task added here
// starts with), drop (where a dragged task lands) or dropDue (the day it is moved to), section }
function ordered(list, o) {
  var s = C.sortTasks(list, o.sort);
  return s.filter(function (t) { return !t.done; }).concat(s.filter(function (t) { return t.done; }));
}
function longDay(day, n) {
  var d = C.fromYmd(day), rel = C.formatDay(day, n.day, true), abs = C.DAY_SHORT[d.getDay()] + ' ' + C.MONTH_SHORT[d.getMonth()] + ' ' + d.getDate();
  return /^(Today|Tomorrow|Yesterday)$/.test(rel) ? { title: rel, hint: abs } : { title: C.DAY_NAMES[d.getDay()], hint: C.MONTH_SHORT[d.getMonth()] + ' ' + d.getDate() };
}
function userGroups(list, o, addBase) {
  var n = now(), groups = [], buckets = {}, order = [];
  function put(key, title, t, add, extra) {
    if (!buckets[key]) { buckets[key] = Object.assign({ id: 'u-' + key, title: title, tasks: [], add: Object.assign({}, addBase, add) }, extra || {}); order.push(key); }
    if (t) buckets[key].tasks.push(t);
  }
  if (o.group === 'priority') [1, 2, 3, 4].forEach(function (p) { put('p' + p, priName(p), null, { priority: p }); });
  if (o.group === 'due') [['late', 'Overdue'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'Next 7 days'], ['later', 'Later'], ['none', 'No due date']].forEach(function (x) { put(x[0], x[1], null, x[0] === 'today' ? { due: { date: n.day } } : x[0] === 'tomorrow' ? { due: { date: C.addDays(n.day, 1) } } : {}); });
  list.forEach(function (t) {
    if (o.group === 'project') put(t.projectId || 'inbox', project(t.projectId) ? project(t.projectId).name : 'Inbox', t, { projectId: t.projectId });
    else if (o.group === 'priority') put('p' + t.priority, '', t);
    else if (o.group === 'due') { var i = C.dueInfo(t.due, n); put(!i ? 'none' : i.tone === 'overdue' ? 'late' : i.tone, '', t); }
    else if (o.group === 'label') {
      if (!t.labels.length) put('~none', 'No label', t);
      t.labels.forEach(function (l) { put('l-' + l, '@' + l, t, { labels: [l] }); });
    }
  });
  if (o.group === 'label') order.sort();
  order.forEach(function (k) { var g = buckets[k]; if (g.tasks.length) { g.tasks = ordered(g.tasks, o); groups.push(g); } });
  return groups;
}
function buildGroups(v) {
  var n = now(), o = viewOpts(v), open = openTasks(), groups = [];
  function shown(t) { return (!t.done || o.done) && !hiddenProject(t); }
  if (v.kind === 'inbox' || v.kind === 'project') {
    var pid = v.kind === 'project' ? v.id : null, proj = project(pid);
    var top = state.tasks.filter(function (t) { return t.projectId === pid && !t.parentId && (!t.done || o.done); });
    if (o.group !== 'none') return userGroups(top, o, { projectId: pid }).map(function (g) { g.tree = true; return g; });
    groups.push({ id: 'none', title: '', tree: true, tasks: ordered(top.filter(function (t) { return !t.sectionId; }), o), add: { projectId: pid, sectionId: null }, drop: { projectId: pid, sectionId: null } });
    sections(proj).forEach(function (s) {
      groups.push({ id: s.id, title: s.name, section: s, tree: true, tasks: ordered(top.filter(function (t) { return t.sectionId === s.id; }), o), add: { projectId: pid, sectionId: s.id }, drop: { projectId: pid, sectionId: s.id } });
    });
    return groups;
  }
  if (v.kind === 'today' || v.kind === 'upcoming') {
    var late = open.filter(function (t) { return t.due && t.due.date < n.day; });
    if (late.length) groups.push({ id: 'overdue', title: 'Overdue', tasks: ordered(late, o), reschedule: true });
    var days = v.kind === 'today' ? 1 : 14;
    for (var i = 0; i < days; i++) {
      var day = C.addDays(n.day, i), names = longDay(day, n);
      groups.push({
        id: 'd' + day, title: names.title, hint: names.hint, dropDue: day, add: { due: { date: day, time: null } },
        tasks: ordered(open.filter(function (t) { return t.due && t.due.date === day; }), o), slim: v.kind === 'upcoming'
      });
    }
    if (v.kind === 'upcoming') {
      var last = C.addDays(n.day, days - 1), later = open.filter(function (t) { return t.due && t.due.date > last; });
      if (later.length) groups.push({ id: 'later', title: 'Later', tasks: ordered(later, o) });
    }
    return groups;
  }
  var list = [], add = {};
  if (v.kind === 'label') { list = state.tasks.filter(function (t) { return shown(t) && t.labels.indexOf(v.id) >= 0; }); add = { labels: [v.id] }; }
  if (v.kind === 'filter') {
    var f = filterById(v.id), q = f ? f.query : {};
    list = state.tasks.filter(function (t) { return shown(t) && C.matchesFilter(t, q, n); });
    if (q.priorities && q.priorities.length === 1) add.priority = q.priorities[0];
    if (q.labels && q.labels.length === 1) add.labels = q.labels.slice();
    if (q.due === 'today' || q.due === 'week') add.due = { date: n.day, time: null };
  }
  if (v.kind === 'search') list = C.searchTasks(state, v.q).filter(shown);
  if (o.group !== 'none') return userGroups(list, o, add);
  return [{ id: 'all', title: '', tasks: ordered(list, o), add: v.kind === 'search' ? null : add }];
}
function counts() {
  var n = now(), c = { inbox: 0, today: 0, late: 0, projects: {}, labels: {} };
  openTasks().forEach(function (t) {
    if (!t.parentId) { if (t.projectId) c.projects[t.projectId] = (c.projects[t.projectId] || 0) + 1; else c.inbox++; }
    if (t.due && t.due.date <= n.day) { c.today++; if (t.due.date < n.day) c.late++; }
    t.labels.forEach(function (l) { c.labels[l] = (c.labels[l] || 0) + 1; });
  });
  return c;
}

// ── drawing: the left column ────────────────────────────────────────────────────────────
function navItem(view, ic, name, count, extra) {
  var cur = viewKey(view) === viewKey(ui.view);
  return '<button class="t-navitem" data-act="go" data-view="' + esc(JSON.stringify(view)) + '"' + (cur ? ' aria-current="true"' : '') + (extra || '') + '>' +
    ic + '<span class="t-grow t-clip">' + esc(name) + '</span>' + (count ? '<span class="t-navitem__count">' + (count.late ? '<i class="t-latedot" title="Some are overdue"></i>' : '') + count.n + '</span>' : '') + '</button>';
}
function renderNav() {
  var c = counts(), n = now(), done = state.stats.days[n.day] || 0, goal = state.settings.dailyGoal;
  var frac = Math.min(1, done / goal), circ = 2 * Math.PI * 7;
  var projs = liveProjects(), favs = projs.filter(function (p) { return p.favorite; });
  function projItem(p) { return navItem({ kind: 'project', id: p.id }, dot(p.color), p.name, c.projects[p.id] ? { n: c.projects[p.id] } : null, ' data-drop-project="' + esc(p.id) + '"'); }
  var h = '<div class="t-nav__top"><h1>Tasks</h1>' +
    '<button class="yc-button yc-button--primary yc-button--full" data-act="quick-add">' + icon('plus') + 'Add task</button>' +
    '<label class="yc-search"><input type="search" id="search" data-keep placeholder="Search tasks" aria-label="Search tasks" value="' + esc(ui.view.kind === 'search' ? ui.view.q : '') + '"></label></div>' +
    '<div class="t-nav__group">' +
    navItem({ kind: 'inbox' }, icon('inbox'), 'Inbox', c.inbox ? { n: c.inbox } : null, ' data-drop-project=""') +
    navItem({ kind: 'today' }, icon('today'), 'Today', c.today ? { n: c.today, late: c.late > 0 } : null, ' data-drop-due="' + n.day + '"') +
    navItem({ kind: 'upcoming' }, icon('upcoming'), 'Upcoming') +
    navItem({ kind: 'labels' }, icon('tag'), 'Filters & labels') +
    navItem({ kind: 'completed' }, icon('done'), 'Completed') +
    '</div>';
  if (favs.length) h += '<div class="t-nav__group"><div class="t-nav__label"><span class="yc-eyebrow">Favorites</span></div>' + favs.map(projItem).join('') + '</div>';
  h += '<div class="t-nav__group"><div class="t-nav__label"><span class="yc-eyebrow">Projects</span>' +
    '<button class="t-iconbtn" data-act="project-add" aria-label="Add a project">' + icon('plus') + '</button></div>' +
    (projs.length ? projs.map(projItem).join('') : '<div class="yc-caption" style="padding:0 8px">Group related tasks in a project.</div>') + '</div>';
  h += '<div class="t-nav__foot">' +
    '<button class="yc-button yc-button--ghost t-goal" data-act="progress" aria-label="Your progress">' +
    '<svg class="t-ring" viewBox="0 0 18 18" aria-hidden="true"><circle class="t-ring__track" cx="9" cy="9" r="7"/><circle class="t-ring__fill" cx="9" cy="9" r="7" stroke-dasharray="' + (circ * frac).toFixed(2) + ' ' + circ.toFixed(2) + '"/></svg>' +
    '<span class="t-clip">' + done + ' of ' + goal + ' done today</span></button>' +
    '<button class="yc-button yc-button--ghost yc-button--icon" data-act="settings" aria-label="Settings">' + icon('sliders') + '</button></div>';
  $('nav').innerHTML = h;
}

// ── drawing: one task row ───────────────────────────────────────────────────────────────
// The short facts under a task's name, each the app's small pill. Colour is only ever the
// pill's tint (overdue, today, priority) or a label's tag mark — never the words.
function pill(tone, inner, title) { return '<span class="yc-status' + (tone ? ' yc-status--' + tone : '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + inner + '</span>'; }
function duePill(t) {
  var info = C.dueInfo(t.due, now(), state.settings.h12);
  if (!info) return '';
  return pill(info.tone === 'overdue' ? 'danger yc-status--dot' : info.tone === 'today' ? 'info' : '', (t.repeat ? icon('repeat') : '') + esc(info.text), (info.tone === 'overdue' ? 'Overdue. ' : '') + (t.repeat ? C.describeRepeat(t.repeat) : ''));
}
function metaHtml(t, ctx) {
  var m = duePill(t);
  if (t.priority < 4) m += pill(PRI_TONE[t.priority], PRI[t.priority], priName(t.priority));
  if (ctx.tree && !t.parentId) {
    var kids = C.children(state, t.id);
    if (kids.length) m += pill('', icon('subs') + kids.filter(function (k) { return k.done; }).length + '/' + kids.length, 'Sub-tasks done');
  }
  if (t.comments.length) m += pill('', icon('comment') + t.comments.length, 'Comments');
  t.labels.forEach(function (l) { m += pill('', tagIcon(labelColor(l)) + esc(l)); });
  var where = ctx.where ? '<span class="t-where t-clip">' + esc(whereText(t)) + (t.parentId && task(t.parentId) ? ' › ' + esc(task(t.parentId).title.slice(0, 30)) : '') + '</span>' : '';
  return (m ? '<div class="yc-chips">' + m + '</div>' : where ? '<span class="t-grow"></span>' : '') + where;
}
function checkHtml(t) {
  return '<button class="t-check" data-act="toggle" data-id="' + t.id + '" aria-pressed="' + (t.done ? 'true' : 'false') + '" aria-label="' + (t.done ? 'Mark as not done: ' : 'Mark as done: ') + esc(t.title) + '"></button>';
}
function taskRow(t, ctx) {
  var kids = ctx.tree && !t.parentId ? C.children(state, t.id) : [];
  var cls = 't-task' + (t.done ? ' is-done' : '') + (ctx.sub ? ' is-sub' : '') + (kids.length ? ' has-kids' : '') + (ui.detailId === t.id ? ' is-open' : '');
  var h = '<div class="' + cls + '" data-act="open" data-id="' + t.id + '" role="button" tabindex="0"' + (ui.selecting ? '' : ' draggable="true"') + '>';
  if (ui.selecting) h += '<input type="checkbox" class="t-pick" data-act="pick" data-id="' + t.id + '"' + (ui.picked[t.id] ? ' checked' : '') + ' aria-label="Select ' + esc(t.title) + '">';
  // WHY the name and the note share one inner box: on a wide screen the row is a single line —
  // name (and the start of its note) at the left, pills and project at the right. The pills
  // only drop to a second line when there is no room (a phone, a board card, a long name).
  h += checkHtml(t) + '<div class="t-task__body"><div class="t-task__main"><div class="t-task__title">' + linked(t.title) + '</div>';
  if (t.notes && !ctx.card) h += '<div class="t-task__notes">' + linked(t.notes.split('\n')[0]) + '</div>';
  h += '</div>';
  var meta = metaHtml(t, ctx);
  if (meta) h += '<div class="t-task__meta">' + meta + '</div>';
  h += '</div>';
  if (kids.length) h += '<button class="t-iconbtn t-twisty" data-act="twisty" data-id="' + t.id + '" aria-expanded="' + (ui.collapsed[t.id] ? 'false' : 'true') + '" aria-label="Show or hide sub-tasks">' + icon('chev') + '</button>';
  h += '<div class="t-task__actions">' +
    '<button class="t-iconbtn" data-act="row-date" data-id="' + t.id + '" aria-label="Set due date">' + icon('calendar') + '</button>' +
    '<button class="t-iconbtn" data-act="row-more" data-id="' + t.id + '" aria-label="More actions">' + icon('more') + '</button></div></div>';
  if (kids.length && !ui.collapsed[t.id] && !ctx.card) {
    var o = viewOpts(ui.view);
    kids.forEach(function (k) { if (!k.done || o.done) h += taskRow(k, { tree: true, sub: true, where: false }); });
  }
  return h;
}
function addButton(g, label) {
  if (!g.add) return '';
  var slot = 'g:' + g.id;
  if (ui.editor && ui.editor.slot === slot) return editorHtml();
  return '<button class="t-add" data-act="add-here" data-slot="' + esc(slot) + '" data-defaults="' + esc(JSON.stringify(g.add)) + '">' + icon('plus') + (label || 'Add task') + '</button>';
}
function groupHtml(g, where) {
  var folded = g.section && g.section.collapsed, n = g.tasks.filter(function (t) { return !t.done; }).length;
  var attrs = g.drop ? ' data-drop="' + esc(JSON.stringify(g.drop)) + '"' : g.dropDue ? ' data-drop-due="' + g.dropDue + '"' : '';
  var h = '<section class="t-group' + (folded ? '' : ' is-open') + '"' + attrs + '>';
  if (g.title) {
    var words = esc(g.title) + (g.hint ? ' · ' + esc(g.hint) : '') + (n ? ' <span class="t-group__count">' + n + '</span>' : '');
    h += '<div class="t-group__head">';
    if (g.section) h += '<button class="t-group__title" data-act="section-fold" data-id="' + g.section.id + '" aria-expanded="' + (folded ? 'false' : 'true') + '">' + icon('chev', 't-chev') + '<span>' + words + '</span></button>';
    else h += '<span class="t-group__title">' + words + '</span>';
    h += '<span class="t-grow"></span>';
    if (g.reschedule) h += '<button class="yc-button yc-button--ghost yc-button--sm" data-act="reschedule">Move all to today</button>';
    if (g.section) h += '<button class="t-iconbtn" data-act="section-more" data-id="' + g.section.id + '" aria-label="Section actions">' + icon('more') + '</button>';
    h += '</div>';
  }
  if (!folded) {
    g.tasks.forEach(function (t) { h += taskRow(t, { tree: g.tree, where: where }); });
    h += addButton(g);
  }
  return h + '</section>';
}
function emptyText(v) {
  if (v.kind === 'inbox') return 'Your Inbox is empty. Add anything on your mind, and sort it into projects later.';
  if (v.kind === 'today') return 'Nothing due today. Enjoy it, or add something.';
  if (v.kind === 'search') return v.q ? 'No tasks match “' + v.q + '”.' : 'Type in the search box to find a task by its name, notes or @label.';
  if (v.kind === 'label') return 'No open tasks have this label.';
  if (v.kind === 'filter') return 'No open tasks match this filter.';
  return 'No tasks here yet.';
}
function headHtml(v, total) {
  var o = viewOpts(v), p = v.kind === 'project' ? project(v.id) : null, tools = '';
  var tree = v.kind === 'inbox' || v.kind === 'project', lists = v.kind !== 'labels' && v.kind !== 'completed';
  function sel(name, value, opts) {
    return '<select class="yc-select" data-change="' + name + '" aria-label="' + (name === 'sort' ? 'Sort tasks' : 'Group tasks') + '">' +
      opts.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === value ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>';
  }
  if (p) tools += '<button class="yc-filter" data-act="set-layout" data-layout="list" aria-pressed="' + (p.layout === 'list') + '">' + icon('list') + 'List</button>' +
    '<button class="yc-filter" data-act="set-layout" data-layout="board" aria-pressed="' + (p.layout === 'board') + '">' + icon('board') + 'Board</button>';
  if (lists) {
    if (v.kind === 'inbox' || v.kind === 'label' || v.kind === 'filter' || v.kind === 'search')
      tools += sel('group', o.group, [['none', 'No groups'], ['project', 'Group by project'], ['priority', 'Group by priority'], ['due', 'Group by due date'], ['label', 'Group by label']].filter(function (x) { return !(v.kind === 'inbox' && x[0] === 'project'); }));
    tools += sel('sort', o.sort, (tree ? [['manual', 'My order']] : []).concat([['due', 'By due date'], ['priority', 'By priority'], ['name', 'By name'], ['added', 'Newest first']]));
    if (v.kind !== 'today' && v.kind !== 'upcoming') tools += '<button class="yc-filter" data-act="toggle-done" aria-pressed="' + o.done + '">Show done</button>';
    tools += '<button class="yc-button yc-button--ghost yc-button--icon" data-act="select-mode" aria-pressed="' + ui.selecting + '" aria-label="Select several tasks" title="Select several tasks">' + icon('pick') + '</button>';
  }
  if (p) tools += '<button class="yc-button yc-button--ghost yc-button--icon" data-act="project-more" data-id="' + p.id + '" aria-label="Project actions">' + icon('more') + '</button>';
  if (v.kind === 'label') tools += '<button class="yc-button yc-button--ghost yc-button--icon" data-act="label-more" data-id="' + esc(v.id) + '" aria-label="Label actions">' + icon('more') + '</button>';
  if (v.kind === 'filter' && C.byId(state.filters, v.id)) tools += '<button class="yc-button yc-button--ghost yc-button--icon" data-act="filter-more" data-id="' + esc(v.id) + '" aria-label="Filter actions">' + icon('more') + '</button>';
  return '<header class="t-head' + (p && p.layout === 'board' ? ' t-head--wide' : '') + '"><button class="t-iconbtn t-menu-btn" data-act="nav-open" aria-label="Show lists">' + icon('menu') + '</button>' +
    '<h2>' + (p ? dot(p.color) : '') + '<span class="t-clip">' + esc(viewTitle(v)) + '</span>' +
    '</h2>' +
    '<div class="t-head__tools">' + tools + '</div></header>';
}
function renderMain() {
  var v = ui.view;
  if (!viewExists(v)) v = ui.view = { kind: 'inbox' };
  var body;
  if (v.kind === 'labels') body = headHtml(v) + labelsScreen();
  else if (v.kind === 'completed') body = headHtml(v) + completedScreen();
  else {
    var groups = buildGroups(v), total = 0, seen = {};
    groups.forEach(function (g) { g.tasks.forEach(function (t) { if (!t.done && !seen[t.id]) { seen[t.id] = 1; total++; } }); });
    var p = v.kind === 'project' ? project(v.id) : null;
    body = headHtml(v, total);
    if (p && p.archived) body += '<div style="padding:0 20px 8px"><div class="yc-notice yc-notice--slim"><div class="yc-notice__text">This project is archived. Its tasks are hidden from Today, Upcoming and search.</div><div class="yc-notice__actions"><button class="yc-button yc-button--sm" data-act="project-unarchive" data-id="' + p.id + '">Bring it back</button></div></div></div>';
    if (p && p.layout === 'board') {
      body += '<div class="t-board" id="list">' + groups.map(function (g) {
        var n = g.tasks.filter(function (t) { return !t.done; }).length;
        return '<section class="t-col" data-drop="' + esc(JSON.stringify(g.drop)) + '"><div class="t-group__head"><span class="t-group__title">' + esc(g.title || 'No section') + ' <span class="t-group__count">' + n + '</span></span><span class="t-grow"></span>' +
          (g.section ? '<button class="t-iconbtn" data-act="section-more" data-id="' + g.section.id + '" aria-label="Section actions">' + icon('more') + '</button>' : '') + '</div>' +
          g.tasks.map(function (t) { return taskRow(t, { tree: true, card: true }); }).join('') + addButton(g) + '</section>';
      }).join('') + '<section class="t-col t-col--new"><button class="t-add" data-act="section-add">' + icon('plus') + 'Add section</button></section></div>';
    } else {
      var where = !(v.kind === 'inbox' || v.kind === 'project');
      var any = groups.some(function (g) { return g.tasks.length; });
      var inner = groups.map(function (g) { return groupHtml(g, where); }).join('');
      // Two jobs, two looks (the app's rule): never used -> a card with one filled button;
      // nothing here right now -> one quiet grey line.
      if (!state.tasks.length && !ui.editor) inner = '<div class="yc-card t-first"><div class="yc-title">Start your list</div><p class="yc-muted yc-small">Write down anything you need to do. Type it the way you would say it, such as <span class="yc-kbd">Pay rent tomorrow 5pm</span>, and the day and time are filled in for you. Sort things into projects whenever you like.</p><button class="yc-button yc-button--primary yc-button--full" data-act="add-first">Add your first task</button></div>';
      else if (!any && v.kind !== 'upcoming') inner = '<div class="t-quiet">' + esc(emptyText(v)) + '</div>' + inner;
      if (p) inner += '<button class="t-add" data-act="section-add">' + icon('plus') + 'Add section</button>';
      body += '<div class="t-list" id="list"><div class="t-list__inner">' + inner + '</div></div>';
    }
  }
  body += '<div id="bulk"></div><button class="yc-button yc-button--primary t-fab" data-act="quick-add" aria-label="Add task">' + icon('plus') + '</button>';
  // WHY in the page's flow, above the list: a reminder that floats ends up covering a button.
  body = body.replace('</header>', '</header><div class="t-alerts" id="alerts"></div>');
  var list = $('list'), top = list ? list.scrollTop : 0, left = list ? list.scrollLeft : 0, sameView = $('main').getAttribute('data-view') === viewKey(v);
  $('main').innerHTML = body;
  $('main').setAttribute('data-view', viewKey(v));
  // Redrawing must not jump the list back to the top while the person is working in it.
  if (sameView && $('list')) { $('list').scrollTop = top; $('list').scrollLeft = left; }
  renderBulk(); renderAlerts();
}

function labelsScreen() {
  var c = counts(), n = now();
  function row(view, ic, name, count, act, id) {
    return '<div class="yc-list-row"><button class="t-navitem" style="flex:1;min-width:0" data-act="go" data-view="' + esc(JSON.stringify(view)) + '">' + ic + '<span class="t-grow t-clip">' + esc(name) + '</span><span class="t-navitem__count">' + count + '</span></button>' +
      (act ? '<button class="t-iconbtn" data-act="' + act + '" data-id="' + esc(id) + '" aria-label="Actions for ' + esc(name) + '">' + icon('more') + '</button>' : '') + '</div>';
  }
  function fcount(f) { return openTasks().filter(function (t) { return C.matchesFilter(t, f.query, n); }).length; }
  var h = '<div class="t-list" id="list"><div class="t-list__inner">';
  h += '<section class="t-group"><div class="t-group__head"><span class="t-group__title">Filters</span><span class="t-grow"></span><button class="yc-button yc-button--ghost yc-button--sm" data-act="filter-add">Add filter</button></div><div class="yc-list">' +
    BUILTIN_FILTERS.map(function (f) { return row({ kind: 'filter', id: f.id }, icon('filter'), f.name, fcount(f)); }).join('') +
    state.filters.map(function (f) { return row({ kind: 'filter', id: f.id }, icon('filter'), f.name, fcount(f), 'filter-more', f.id); }).join('') + '</div></section>';
  h += '<section class="t-group"><div class="t-group__head"><span class="t-group__title">Labels</span><span class="t-grow"></span><button class="yc-button yc-button--ghost yc-button--sm" data-act="label-add">Add label</button></div>' +
    (state.labels.length ? '<div class="yc-list">' + state.labels.slice().sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; }).map(function (l) {
      return row({ kind: 'label', id: l.name }, tagIcon(l.color), l.name, c.labels[l.name] || 0, 'label-more', l.name);
    }).join('') + '</div>' : '<div class="t-quiet">Labels cut across projects: @errands, @5-minutes, @waiting. Type @name while adding a task to make one.</div>') + '</section>';
  var gone = state.projects.filter(function (p) { return p.archived; });
  if (gone.length) h += '<section class="t-group"><div class="t-group__head"><span class="t-group__title">Archived projects</span></div><div class="yc-list">' + gone.map(function (p) {
    return '<div class="yc-list-row"><button class="t-navitem" style="flex:1;min-width:0" data-act="go" data-view="' + esc(JSON.stringify({ kind: 'project', id: p.id })) + '">' + dot(p.color) + '<span class="t-grow t-clip">' + esc(p.name) + '</span></button>' +
      '<button class="yc-button yc-button--sm" data-act="project-unarchive" data-id="' + p.id + '">Bring back</button></div>';
  }).join('') + '</div></section>';
  return h + '</div></div>';
}
function completedScreen() {
  var n = now(), items = [];
  state.tasks.forEach(function (t) { if (t.done && t.doneAt && !(t.parentId && task(t.parentId) && task(t.parentId).done)) items.push({ id: t.id, title: t.title, at: t.doneAt, projectId: t.projectId, task: t }); });
  state.log.forEach(function (l) { items.push({ id: l.id, title: l.title, at: l.at, projectId: l.projectId, repeat: true }); });
  items.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  var h = '<div class="t-list" id="list"><div class="t-list__inner">';
  if (!items.length) return h + '<div class="t-quiet">Tasks you finish show up here, newest first.</div></div></div>';
  var lastDay = null, shown = items.slice(0, 200);
  shown.forEach(function (it) {
    var d = new Date(it.at), day = C.ymd(d);
    if (day !== lastDay) {
      if (lastDay) h += '</section>';
      var names = longDay(day, n), far = C.diffDays(n.day, day) > 1;
      h += '<section class="t-group"><div class="t-group__head"><span class="t-group__title">' + esc(far ? C.formatDay(day, n.day) : names.title) + ' · ' + esc(far ? C.DAY_NAMES[d.getDay()] : names.hint) + '</span></div>';
      lastDay = day;
    }
    var time = C.formatTime(C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()), state.settings.h12);
    var where = project(it.projectId) ? project(it.projectId).name : 'Inbox';
    h += '<div class="t-task is-done"' + (it.task ? ' data-act="open" data-id="' + it.id + '" role="button" tabindex="0"' : ' style="cursor:default"') + '>' +
      (it.task ? checkHtml(it.task) : '<span class="t-check is-static" aria-pressed="true"></span>') +
      '<div class="t-task__body"><div class="t-task__title">' + esc(it.title) + '</div><div class="t-task__meta"><div class="yc-chips">' + pill('', esc(time)) +
      (it.repeat ? pill('', icon('repeat') + 'Repeats') : '') + '</div><span class="t-where t-clip">' + esc(where) + '</span></div></div></div>';
  });
  h += '</section>';
  if (items.length > shown.length) h += '<div class="yc-caption" style="text-align:center">Showing the newest 200.</div>';
  return h + '</div></div>';
}

function renderBulk() {
  var ids = Object.keys(ui.picked).filter(function (id) { return task(id); });
  if (!ui.selecting) { $('bulk').innerHTML = ''; return; }
  var off = ids.length ? '' : ' disabled';
  $('bulk').innerHTML = '<div class="t-bulk" role="toolbar" aria-label="Actions for selected tasks"><b>' + ids.length + ' selected</b>' +
    '<button class="yc-button yc-button--sm" data-act="bulk-date"' + off + '>' + icon('calendar') + 'Date</button>' +
    '<button class="yc-button yc-button--sm" data-act="bulk-priority"' + off + '>' + icon('flag') + 'Priority</button>' +
    '<button class="yc-button yc-button--sm" data-act="bulk-move"' + off + '>' + icon('move') + 'Move</button>' +
    '<button class="yc-button yc-button--sm" data-act="bulk-labels"' + off + '>' + icon('tag') + 'Labels</button>' +
    '<button class="yc-button yc-button--sm" data-act="bulk-done"' + off + '>' + icon('tick') + 'Done</button>' +
    '<button class="yc-button yc-button--sm yc-button--danger" data-act="bulk-delete"' + off + '>' + icon('trash') + 'Delete</button>' +
    '<button class="yc-button yc-button--sm yc-button--ghost" data-act="select-mode">Cancel</button></div>';
}

// ── drawing: the right column (one task) ────────────────────────────────────────────────
function destOptions(sel) {
  var h = '<option value="|"' + (sel === '|' ? ' selected' : '') + '>Inbox</option>';
  liveProjects().forEach(function (p) {
    h += '<option value="' + p.id + '|"' + (sel === p.id + '|' ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    sections(p).forEach(function (s) { var v = p.id + '|' + s.id; h += '<option value="' + v + '"' + (sel === v ? ' selected' : '') + '>' + esc(p.name + ' › ' + s.name) + '</option>'; });
  });
  return h;
}
function priorityOptions(sel) {
  return [1, 2, 3, 4].map(function (p) { return '<option value="' + p + '"' + (p === sel ? ' selected' : '') + '>' + priName(p) + '</option>'; }).join('');
}
function dueButtonText(due, repeat) {
  var info = C.dueInfo(due, now(), state.settings.h12);
  return info ? esc(info.text) + (repeat ? ' · ' + esc(C.describeRepeat(repeat)) : '') : 'No date';
}
function stamp(iso) {
  var d = new Date(iso), n = now();
  return C.formatDay(C.ymd(d), n.day) + ' ' + C.formatTime(C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()), state.settings.h12);
}
function renderDetail() {
  var el = $('detail'), t = ui.detailId ? task(ui.detailId) : null;
  if (!t) { ui.detailId = null; el.hidden = true; el.innerHTML = ''; return; }
  var parent = t.parentId ? task(t.parentId) : null, kids = C.children(state, t.id);
  var h = '<div class="t-detail__head"><span class="t-grow t-clip">' + esc(whereText(t)) + '</span>' +
    '<button class="t-iconbtn" data-act="row-more" data-id="' + t.id + '" aria-label="More actions">' + icon('more') + '</button>' +
    '<button class="t-iconbtn" data-act="detail-close" aria-label="Close task">' + icon('x') + '</button></div><div class="t-detail__body">';
  if (parent) h += '<button class="yc-button yc-button--ghost yc-button--sm" style="align-self:flex-start" data-act="open" data-id="' + parent.id + '">' + icon('left') + '<span class="t-clip" style="max-width:240px">' + esc(parent.title) + '</span></button>';
  // The card about the panel's own subject: the name and its notes belong together, so one box.
  h += '<div class="yc-box t-subject"><div class="t-detail__title">' + checkHtml(t) + '<textarea class="t-plain" id="d-title" rows="1" data-keep data-change="d-title" aria-label="Task name">' + esc(t.title) + '</textarea></div>' +
    '<textarea class="t-plain t-notes" id="d-notes" data-keep data-change="d-notes" placeholder="Add notes" aria-label="Notes" rows="3">' + esc(t.notes) + '</textarea></div>';
  h += '<div class="t-block"><div class="yc-eyebrow">Details</div><div class="yc-box t-fields">' +
    '<div class="t-field"><span>Due</span><button class="yc-button yc-button--ghost" data-act="d-date">' + icon(t.repeat ? 'repeat' : 'calendar') + '<span class="t-clip">' + dueButtonText(t.due, t.repeat) + '</span></button></div>';
  if (t.due && t.due.time && t.remind != null) h += '<div class="t-field"><span>Reminder</span><span class="t-field__value">' + esc(remindText(t.remind)) + '</span></div>';
  h += '<div class="t-field"><label for="d-priority">Priority</label><select class="yc-select" id="d-priority" data-change="d-priority">' + priorityOptions(t.priority) + '</select></div>';
  if (!parent) h += '<div class="t-field"><label for="d-project">Project</label><select class="yc-select" id="d-project" data-change="d-project">' + destOptions((t.projectId || '') + '|' + (t.sectionId || '')) + '</select></div>';
  h += '<div class="t-field"><span>Labels</span><div class="t-labels">' + t.labels.map(function (l) { return pill('', tagIcon(labelColor(l)) + esc(l)); }).join('') +
    '<button class="yc-button yc-button--ghost yc-button--sm" data-act="d-labels">' + (t.labels.length ? 'Change' : 'Add label') + '</button></div></div></div></div>';
  if (!parent) {
    h += '<div class="t-block"><div class="yc-eyebrow">Sub-tasks' + (kids.length ? ' <span class="t-group__count">' + kids.filter(function (k) { return k.done; }).length + ' of ' + kids.length + ' done</span>' : '') + '</div><div class="yc-box t-subs">' +
      kids.map(function (k) {
        return '<div class="t-sub' + (k.done ? ' is-done' : '') + '" data-act="open" data-id="' + k.id + '" role="button" tabindex="0">' + checkHtml(k) + '<span class="t-grow">' + esc(k.title) + '</span>' + duePill(k) + '</div>';
      }).join('') +
      '<input class="yc-input" id="d-sub" data-keep data-draft placeholder="Add a sub-task, then press Enter" aria-label="Add a sub-task"></div></div>';
  }
  h += '<div class="t-block"><div class="yc-eyebrow">Comments</div><div class="yc-box t-comments">' +
    t.comments.map(function (c) {
      return '<div class="t-comment"><div class="t-comment__meta"><span>' + esc(stamp(c.at)) + '</span><button class="t-iconbtn t-bin" data-act="d-comment-del" data-id="' + c.id + '" aria-label="Delete comment">' + icon('trash') + '</button></div>' + linked(c.text) + '</div>';
    }).join('') +
    '<div class="yc-row" style="align-items:flex-end"><textarea class="yc-textarea" id="d-comment" data-keep data-draft rows="1" placeholder="Write a comment" aria-label="Write a comment"></textarea>' +
    '<button class="yc-button" data-act="d-comment-add">Post</button></div></div></div>';
  h += '</div><div class="t-detail__foot"><span class="t-grow">Added ' + esc(stamp(t.createdAt)) + (t.done && t.doneAt ? ' · Done ' + esc(stamp(t.doneAt)) : '') + '</span>' +
    '<button class="yc-button yc-button--sm yc-button--danger" data-act="d-delete">' + icon('trash') + 'Delete</button></div>';
  el.hidden = false; el.innerHTML = h;
  growTitle();
}
function growTitle() { var ta = $('d-title'); if (ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; } }
function remindText(m) { return m === 0 ? 'At the time it is due' : m < 60 ? m + ' minutes before' : m === 60 ? '1 hour before' : m === 1440 ? '1 day before' : Math.round(m / 60) + ' hours before'; }

// Redraws everything, keeping the cursor (and any half-typed words) in a box marked data-keep.
function render() {
  clearTimeout(renderTimer);
  var a = document.activeElement, keep = a && a.id && a.hasAttribute && a.hasAttribute('data-keep') ? { id: a.id, value: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
  if (ui.editor && $('ed-title')) { ui.editor.text = $('ed-title').value; ui.editor.notes = $('ed-notes').value; }
  var edFocus = a && (a.id === 'ed-title' || a.id === 'ed-notes') ? a.id : null;
  // WHY drafts are kept separately: a comment or sub-task being typed is not in `state` yet, and
  // any redraw (ticking another task, the minute timer) would otherwise wipe it — even unfocused.
  var drafts = {}, draftsFor = ui.detailId;
  Array.prototype.forEach.call(document.querySelectorAll('[data-draft]'), function (el) { if (el.id && el.value) drafts[el.id] = el.value; });
  renderNav(); renderMain(); renderDetail(); checkReminders();
  if (draftsFor === ui.detailId) Object.keys(drafts).forEach(function (id) { if ($(id)) $(id).value = drafts[id]; });
  if (ui.modal && ui.modal.editor) renderModal();
  if (keep && $(keep.id)) { var el = $(keep.id); el.value = keep.value; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} if (keep.id === 'd-title') growTitle(); }
  if (edFocus && $(edFocus)) { $(edFocus).focus(); var len = $(edFocus).value.length; try { $(edFocus).setSelectionRange(len, len); } catch (e) {} }
}
