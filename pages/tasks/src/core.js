// Tasks page — the rules, with no screen in them (dates, typed shortcuts, repeats, saved shape).
// WHY separate from ui.js: everything here runs in plain Node, so tests/core.test.mjs can prove
// "every 2 weeks" or "tomorrow 5pm p1" without opening a browser. build.mjs pastes both files
// into page.html, because a page must be one document with no outside files.
var TasksCore = (function () {
  'use strict';

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Content colours (a project's or label's own dot). Hard-coded on purpose: they identify a
  // thing, like a chart series, and must stay the same in every theme.
  var COLORS = {
    grey: '#8a8f98', red: '#e5484d', orange: '#f2762e', yellow: '#e2a400', green: '#3fa34d',
    teal: '#12a594', blue: '#3b82f6', indigo: '#6366f1', purple: '#9b59d0', pink: '#e0569b'
  };

  // ── dates: a day is always the text 'YYYY-MM-DD' in the person's own time zone ──────────────
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function isYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(fromYmd(s)); }
  function isTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function addDays(s, n) { var d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  // WHY anchorDay: a task due on the 31st that repeats monthly lands on Feb 28, and without the
  // remembered 31 it would stay on the 28th for ever after.
  function addMonths(s, n, anchorDay) {
    var d = fromYmd(s), day = anchorDay || d.getDate();
    var y = d.getFullYear(), m = d.getMonth() + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return ymd(new Date(y, m, Math.min(day, daysInMonth(y, m))));
  }
  function diffDays(a, b) { return Math.round((fromYmd(a) - fromYmd(b)) / 86400000); }
  function dow(s) { return fromYmd(s).getDay(); }
  function startOfWeek(s, weekStart) { return addDays(s, -((dow(s) - (weekStart || 0) + 7) % 7)); }

  var seq = 0;
  function uid() { seq += 1; return Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6); }

  // ── repeats ─────────────────────────────────────────────────────────────────────────────
  // { every: 2, unit: 'day'|'week'|'month'|'year', days?: [0..6] (week only), after?: true
  //   (count from the day it was done, not the day it was due), anchor?: day of month }
  function stepRepeat(base, r) {
    var n = Math.max(1, r.every || 1);
    if (r.unit === 'day') return addDays(base, n);
    if (r.unit === 'week') {
      if (!r.days || !r.days.length) return addDays(base, 7 * n);
      var week0 = startOfWeek(base, 0);
      for (var i = 1; i <= 7 * n + 7; i++) {
        var c = addDays(base, i);
        var weeks = Math.round(diffDays(startOfWeek(c, 0), week0) / 7);
        if (r.days.indexOf(dow(c)) >= 0 && weeks % n === 0) return c;
      }
      return addDays(base, 7 * n);
    }
    if (r.unit === 'month') return addMonths(base, n, r.anchor);
    if (r.unit === 'year') return addMonths(base, 12 * n, r.anchor);
    return addDays(base, n);
  }
  // The next due day after finishing a repeating task on `doneDay`.
  // WHY the loop: a daily task left three days overdue should come back tomorrow, not three
  // days ago; one finished early should still skip to the occurrence after its own due day.
  function nextDue(dueDay, r, doneDay) {
    if (r.after) return stepRepeat(doneDay, r);
    var next = stepRepeat(dueDay, r), guard = 0;
    while (next <= doneDay && guard++ < 5000) next = stepRepeat(next, r);
    return next;
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function describeRepeat(r) {
    if (!r) return '';
    var n = Math.max(1, r.every || 1), out;
    if (r.unit === 'week' && r.days && r.days.length) {
      var d = r.days.slice().sort();
      if (n === 1 && d.join() === '1,2,3,4,5') out = 'Every weekday';
      else out = (n === 1 ? 'Every ' : 'Every ' + n + ' weeks on ') + d.map(function (x) { return DAY_SHORT[x]; }).join(', ');
    } else {
      out = n === 1 ? 'Every ' + r.unit : 'Every ' + n + ' ' + r.unit + 's';
      if (r.unit === 'month' && r.anchor) out += ' on the ' + ordinal(r.anchor);
    }
    if (r.after) out += ', after it is done';
    return out;
  }

  // ── how a due day reads ────────────────────────────────────────────────────────────────
  function formatTime(t, h12) {
    if (!t) return '';
    var h = +t.slice(0, 2), m = t.slice(3);
    if (!h12) return pad(h) + ':' + m;
    return ((h % 12) || 12) + (m === '00' ? '' : ':' + m) + (h < 12 ? ' AM' : ' PM');
  }
  function formatDay(day, today, long) {
    var diff = diffDays(day, today), d = fromYmd(day);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return long ? DAY_NAMES[d.getDay()] : DAY_SHORT[d.getDay()];
    var out = MONTH_SHORT[d.getMonth()] + ' ' + d.getDate();
    if (d.getFullYear() !== fromYmd(today).getFullYear()) out += ', ' + d.getFullYear();
    return out;
  }
  // now: { day: 'YYYY-MM-DD', time: 'HH:MM' }
  function dueInfo(due, now, h12) {
    if (!due || !due.date) return null;
    var diff = diffDays(due.date, now.day);
    var late = diff < 0 || (diff === 0 && due.time && now.time && due.time < now.time);
    var tone = late ? 'overdue' : diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff < 7 ? 'week' : 'later';
    return { text: formatDay(due.date, now.day) + (due.time ? ' ' + formatTime(due.time, h12) : ''), tone: tone, diff: diff };
  }
  function isOverdue(t, now) { var i = dueInfo(t.due, now); return !!i && i.tone === 'overdue'; }

  // ── typed shortcuts: "Pay rent tomorrow 5pm p1 #Home @bills every month" ────────────────────
  var MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  var DAY_RE = 'mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';
  function monthIndex(w) { return MONTH_SHORT.map(function (m) { return m.toLowerCase(); }).indexOf(w.slice(0, 3).toLowerCase()); }
  function dayIndex(w) { return DAY_SHORT.map(function (m) { return m.toLowerCase(); }).indexOf(w.slice(0, 3).toLowerCase()); }
  function nextWeekday(today, idx, allowToday) {
    var d = (idx - dow(today) + 7) % 7;
    if (d === 0 && !allowToday) d = 7;
    return addDays(today, d);
  }

  // ctx: { today, projects: [{id,name}], ignore: ['words the person un-picked'] }
  // Returns { title, due, repeat, priority, projectId, labels, found: [{start,end,kind,text}] }.
  function parseQuickAdd(text, ctx) {
    var today = ctx.today, found = [], src = String(text || '');
    var ignore = (ctx.ignore || []).map(function (s) { return s.toLowerCase(); });
    var out = { title: '', due: null, repeat: null, priority: 4, projectId: undefined, labels: [] };
    var date = null, time = null;

    function free(start, end) {
      for (var i = 0; i < found.length; i++) if (start < found[i].end && end > found[i].start) return false;
      return true;
    }
    // Runs one pattern over the text; `use` returns false to leave a match as plain words.
    function scan(kind, re, use, many) {
      var m, r = new RegExp(re, 'gi');
      while ((m = r.exec(src))) {
        if (m[0] === '') { r.lastIndex++; continue; }
        // A pattern may start with (^|\s): keep that space out of the highlighted span.
        var lead = m[0].length - m[0].replace(/^\s+/, '').length;
        var start = m.index + lead, end = m.index + m[0].length, word = src.slice(start, end);
        if (!free(start, end) || ignore.indexOf(word.toLowerCase()) >= 0) continue;
        if (use(m) === false) continue;
        found.push({ start: start, end: end, kind: kind, text: word });
        if (!many) return;
      }
    }

    // 1. repeats (before dates: "every monday" must not also read as "monday")
    scan('repeat', '\\bevery(!)?\\s+(other\\s+)?(?:(\\d{1,3})\\s+)?(days?|weekdays?|weeks?|months?|years?|(?:(?:' + DAY_RE + ')(?:\\s*(?:,|and|&)\\s*|\\s+)?)+)(?![a-z])', function (m) {
      var n = m[3] ? +m[3] : m[2] ? 2 : 1, w = m[4].toLowerCase().trim(), r;
      if (n < 1) return false;
      if (/^day/.test(w)) r = { every: n, unit: 'day' };
      else if (/^weekday/.test(w)) r = { every: 1, unit: 'week', days: [1, 2, 3, 4, 5] };
      else if (/^week/.test(w)) r = { every: n, unit: 'week' };
      else if (/^month/.test(w)) r = { every: n, unit: 'month' };
      else if (/^year/.test(w)) r = { every: n, unit: 'year' };
      else {
        var days = [];
        w.split(/\s*(?:,|and|&|\s)\s*/).forEach(function (x) { var i = x ? dayIndex(x) : -1; if (i >= 0 && days.indexOf(i) < 0) days.push(i); });
        if (!days.length) return false;
        r = { every: n, unit: 'week', days: days.sort() };
      }
      if (m[1]) r.after = true;
      out.repeat = r;
    });
    if (!out.repeat) scan('repeat', '\\b(daily|weekly|monthly|yearly|annually)\\b', function (m) {
      var w = m[1].toLowerCase();
      out.repeat = { every: 1, unit: w === 'daily' ? 'day' : w === 'weekly' ? 'week' : w === 'monthly' ? 'month' : 'year' };
    });

    // 2. the day
    function setDate(d) { if (date) return false; date = d; }
    // WHY no "tod"/"tom": they are people's names far more often than days.
    scan('date', '\\b(today|tonight|tomorrow|tmrw|tmr)\\b(?![\'’])', function (m) {
      var w = m[1].toLowerCase();
      if (date) return false;
      date = /^to(day|night)$/.test(w) ? today : addDays(today, 1);
      if (w === 'tonight' && !time) time = '20:00';
    });
    scan('date', '\\bnext\\s+(week|month|weekend)\\b', function (m) {
      var w = m[1].toLowerCase();
      if (w === 'week') return setDate(addDays(startOfWeek(today, 1), 7));
      if (w === 'weekend') return setDate(addDays(nextWeekday(today, 6, true), 7));
      var d = fromYmd(today); return setDate(ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1)));
    });
    scan('date', '\\b(?:this\\s+)?weekend\\b', function () { return setDate(nextWeekday(today, 6, true)); });
    scan('date', '\\bin\\s+(\\d{1,3})\\s+(days?|weeks?|months?)\\b', function (m) {
      var n = +m[1], u = m[2].toLowerCase();
      return setDate(/^day/.test(u) ? addDays(today, n) : /^week/.test(u) ? addDays(today, 7 * n) : addMonths(today, n));
    });
    function monthDay(mi, day, year) {
      if (mi < 0 || day < 1 || day > 31) return false;
      var y = year || fromYmd(today).getFullYear();
      if (day > daysInMonth(y, mi)) return false;
      var d = ymd(new Date(y, mi, day));
      // No year typed and the day has passed: the person means next year.
      if (!year && d < today) d = ymd(new Date(y + 1, mi, day));
      return setDate(d);
    }
    scan('date', '\\b(' + MONTH_RE + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', function (m) { return monthDay(monthIndex(m[1]), +m[2], m[3] ? +m[3] : 0); });
    scan('date', '\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(' + MONTH_RE + ')(?:,?\\s+(\\d{4}))?\\b', function (m) { return monthDay(monthIndex(m[2]), +m[1], m[3] ? +m[3] : 0); });
    // "2/3 cup" is a fraction: without a year, 12/25 is a date only at the end of the text or
    // just before another shortcut (a time, p1, #project, @label).
    scan('date', '(?:^|\\s)(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4})(?=\\s|$)|(?=\\s*$|\\s+(?:at\\b|\\d|noon\\b|p[1-4]\\b|[#@])))', function (m) {
      var y = m[3] ? +m[3] : 0; if (y && y < 100) y += 2000;
      return monthDay(+m[1] - 1, +m[2], y);
    });
    // A full day name counts anywhere. A short one ("sun", "sat", "wed") is also an ordinary word,
    // so it counts only after next/this/on, at the end of the text, or just before a time.
    scan('date', '\\b(?:(next|this|on)\\s+)?(' + DAY_RE + ')\\b(?![\'’])', function (m) {
      var full = /day$/i.test(m[2]), after = src.slice(m.index + m[0].length);
      if (!full && !m[1] && !/^\s*$|^\s+(?:at\b|\d|noon\b|midnight\b)/i.test(after)) return false;
      return setDate(nextWeekday(today, dayIndex(m[2]), false));
    });

    // 3. the time
    scan('time', '(?:\\bat\\s+|@\\s?)?\\b(\\d{1,2})(?::([0-5]\\d))?\\s?(am|pm|a\\.m\\.|p\\.m\\.)(?![a-z])', function (m) {
      var h = +m[1]; if (h < 1 || h > 12 || time) return false;
      var pm = /^p/i.test(m[3]); h = (h % 12) + (pm ? 12 : 0);
      time = pad(h) + ':' + (m[2] || '00');
    });
    scan('time', '(?:\\bat\\s+)?\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b', function (m) { if (time) return false; time = pad(+m[1]) + ':' + m[2]; });
    scan('time', '\\b(?:at\\s+)?(noon|midnight)\\b', function (m) { if (time) return false; time = m[1].toLowerCase() === 'noon' ? '12:00' : '00:00'; });

    // 4. priority, project, labels
    scan('priority', '(?:^|\\s)p([1-4])(?=\\s|$)', function (m) { out.priority = +m[1]; });
    var projects = (ctx.projects || []).slice().sort(function (a, b) { return b.name.length - a.name.length; });
    (function () {
      var r = /(^|\s)#/g, m;
      while ((m = r.exec(src))) {
        var at = m.index + m[1].length, rest = src.slice(at + 1).toLowerCase();
        for (var i = 0; i < projects.length; i++) {
          var name = projects[i].name.toLowerCase(), tail = rest.charAt(name.length);
          var compact = name.replace(/\s+/g, ''), tail2 = rest.charAt(compact.length);
          var len = rest.indexOf(name) === 0 && (tail === '' || /\s/.test(tail)) ? name.length
            : rest.indexOf(compact) === 0 && (tail2 === '' || /\s/.test(tail2)) ? compact.length : 0;
          var word = src.slice(at, at + 1 + len);
          if (len && free(at, at + 1 + len) && ignore.indexOf(word.toLowerCase()) < 0) {
            out.projectId = projects[i].id;
            found.push({ start: at, end: at + 1 + len, kind: 'project', text: word });
            return;
          }
        }
        if (rest.indexOf('inbox') === 0 && free(at, at + 6)) { out.projectId = null; found.push({ start: at, end: at + 6, kind: 'project', text: src.slice(at, at + 6) }); return; }
      }
    })();
    scan('label', '(?:^|\\s)@([A-Za-z][\\w-]{0,30})(?=\\s|$)', function (m) {
      var name = m[1]; if (out.labels.map(function (l) { return l.toLowerCase(); }).indexOf(name.toLowerCase()) < 0) out.labels.push(name);
    }, true);

    // A repeat or a time with no day typed still needs a day to start from.
    if (!date && out.repeat) {
      date = out.repeat.unit === 'week' && out.repeat.days ? nextWeekday(addDays(today, -1), out.repeat.days.filter(function (d) { return d >= dow(today); })[0] !== undefined ? out.repeat.days.filter(function (d) { return d >= dow(today); })[0] : out.repeat.days[0], false) : today;
    }
    if (!date && time) date = today;
    if (date) out.due = { date: date, time: time || null };
    if (out.repeat && out.repeat.unit === 'month' && date) out.repeat.anchor = fromYmd(date).getDate();
    if (out.repeat && out.repeat.unit === 'year' && date) out.repeat.anchor = fromYmd(date).getDate();

    found.sort(function (a, b) { return a.start - b.start; });
    var title = '', pos = 0;
    found.forEach(function (f) { title += src.slice(pos, f.start); pos = f.end; });
    out.title = (title + src.slice(pos)).replace(/\s+/g, ' ').trim();
    out.found = found;
    return out;
  }

  // ── the saved shape ─────────────────────────────────────────────────────────────────────
  function emptyState() {
    return {
      v: 1, tasks: [], projects: [], labels: [], filters: [], log: [],
      settings: { weekStart: 0, h12: true, dailyGoal: 5, startView: 'today', views: {}, navOpen: {} },
      stats: { days: {} }
    };
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 2000) : ''; }
  function cleanRepeat(r) {
    if (!r || typeof r !== 'object' || ['day', 'week', 'month', 'year'].indexOf(r.unit) < 0) return null;
    var o = { every: Math.max(1, Math.min(999, Math.round(+r.every) || 1)), unit: r.unit };
    if (r.unit === 'week' && Array.isArray(r.days)) {
      var d = r.days.filter(function (x) { return x === (x | 0) && x >= 0 && x <= 6; });
      if (d.length) o.days = d.sort();
    }
    if (r.after) o.after = true;
    if (+r.anchor >= 1 && +r.anchor <= 31) o.anchor = Math.round(+r.anchor);
    return o;
  }
  function cleanDue(d) {
    if (typeof d === 'string') d = { date: d };
    if (!d || !isYmd(d.date)) return null;
    return { date: d.date, time: isTime(d.time) ? d.time : null };
  }
  // WHY so forgiving: the app's assistant can write this page's saved data directly (and so can
  // an older copy on another device). Whatever arrives — a task with only a title, an unknown
  // project, a missing list — becomes a valid state instead of a broken page.
  function normalize(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    var ids = {};
    // WHY the pattern: ids are written into the page's markup; an id with a quote or a space
    // (hand-written data) would break its row, so anything unusual gets a fresh id.
    function freshId(v) { var id = typeof v === 'string' && /^[\w.:-]{1,64}$/.test(v) && !ids[v] ? v : uid(); ids[id] = 1; return id; }
    var set = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    s.settings.weekStart = set.weekStart === 1 ? 1 : 0;
    s.settings.h12 = set.h12 !== false;
    s.settings.dailyGoal = Math.max(1, Math.min(99, Math.round(+set.dailyGoal) || 5));
    s.settings.startView = ['inbox', 'today', 'upcoming'].indexOf(set.startView) >= 0 ? set.startView : 'today';
    s.settings.views = set.views && typeof set.views === 'object' ? set.views : {};
    s.settings.navOpen = set.navOpen && typeof set.navOpen === 'object' ? set.navOpen : {};

    var projectIds = {}, sectionIds = {};
    (Array.isArray(raw.projects) ? raw.projects : []).forEach(function (p, i) {
      if (!p || typeof p !== 'object' || !str(p.name).trim()) return;
      var proj = {
        id: freshId(p.id), name: str(p.name, 120).trim(), color: COLORS[p.color] ? p.color : 'grey',
        favorite: !!p.favorite, archived: !!p.archived, layout: p.layout === 'board' ? 'board' : 'list',
        order: isFinite(p.order) ? +p.order : i, sections: []
      };
      (Array.isArray(p.sections) ? p.sections : []).forEach(function (sec, j) {
        if (!sec || !str(sec.name).trim()) return;
        var so = { id: freshId(sec.id), name: str(sec.name, 120).trim(), order: isFinite(sec.order) ? +sec.order : j, collapsed: !!sec.collapsed };
        sectionIds[so.id] = proj.id; proj.sections.push(so);
      });
      projectIds[proj.id] = proj; s.projects.push(proj);
    });

    var labelSeen = {};
    function addLabel(name, color) {
      name = str(name, 40).trim().replace(/^@/, '').replace(/\s+/g, '-');
      if (!name) return null;
      var key = name.toLowerCase();
      if (!labelSeen[key]) { labelSeen[key] = { name: name, color: COLORS[color] ? color : 'grey' }; s.labels.push(labelSeen[key]); }
      return labelSeen[key].name;
    }
    (Array.isArray(raw.labels) ? raw.labels : []).forEach(function (l) { if (l) addLabel(typeof l === 'string' ? l : l.name, l.color); });

    var taskIds = {};
    (Array.isArray(raw.tasks) ? raw.tasks : []).forEach(function (t, i) {
      if (!t || typeof t !== 'object' || !str(t.title).trim()) return;
      var task = {
        id: freshId(t.id), title: str(t.title, 500).trim(), notes: str(t.notes, 20000),
        projectId: projectIds[t.projectId] ? t.projectId : null, sectionId: null,
        parentId: typeof t.parentId === 'string' ? t.parentId : null,
        order: isFinite(t.order) ? +t.order : i,
        priority: [1, 2, 3, 4].indexOf(+t.priority) >= 0 ? +t.priority : 4,
        labels: [], due: cleanDue(t.due), repeat: cleanRepeat(t.repeat),
        remind: isFinite(t.remind) && t.remind !== null && +t.remind >= 0 ? Math.round(+t.remind) : null,
        done: !!t.done, doneAt: typeof t.doneAt === 'string' ? t.doneAt : null,
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
        comments: []
      };
      if (sectionIds[t.sectionId] && sectionIds[t.sectionId] === task.projectId) task.sectionId = t.sectionId;
      (Array.isArray(t.labels) ? t.labels : []).forEach(function (l) { var n = addLabel(l); if (n && task.labels.indexOf(n) < 0) task.labels.push(n); });
      (Array.isArray(t.comments) ? t.comments : []).forEach(function (c) {
        if (c && str(c.text).trim()) task.comments.push({ id: freshId(c.id), text: str(c.text, 5000), at: typeof c.at === 'string' ? c.at : new Date().toISOString() });
      });
      if (!task.due) { task.repeat = null; task.remind = null; }
      if (task.done && !task.doneAt) task.doneAt = new Date().toISOString();
      taskIds[task.id] = task; s.tasks.push(task);
    });
    // One level of sub-tasks: a sub-task whose parent is missing, or is itself a sub-task,
    // becomes an ordinary task; a sub-task always lives where its parent lives.
    s.tasks.forEach(function (t) {
      var p = t.parentId ? taskIds[t.parentId] : null;
      if (!p || p === t || p.parentId) { t.parentId = null; return; }
      t.projectId = p.projectId; t.sectionId = p.sectionId;
    });

    (Array.isArray(raw.filters) ? raw.filters : []).forEach(function (f) {
      if (!f || !str(f.name).trim()) return;
      var q = f.query && typeof f.query === 'object' ? f.query : {};
      s.filters.push({
        id: freshId(f.id), name: str(f.name, 80).trim(),
        query: {
          priorities: (Array.isArray(q.priorities) ? q.priorities : []).filter(function (p) { return [1, 2, 3, 4].indexOf(p) >= 0; }),
          labels: (Array.isArray(q.labels) ? q.labels : []).map(function (l) { return str(l, 40); }).filter(Boolean),
          projects: (Array.isArray(q.projects) ? q.projects : []).filter(function (p) { return p === 'inbox' || projectIds[p]; }),
          due: ['any', 'overdue', 'today', 'week', 'none', 'dated'].indexOf(q.due) >= 0 ? q.due : 'any'
        }
      });
    });
    (Array.isArray(raw.log) ? raw.log : []).slice(-300).forEach(function (l) {
      if (l && str(l.title) && typeof l.at === 'string') s.log.push({ id: freshId(l.id), title: str(l.title, 500), at: l.at, projectId: projectIds[l.projectId] ? l.projectId : null });
    });
    var days = raw.stats && raw.stats.days && typeof raw.stats.days === 'object' ? raw.stats.days : {};
    Object.keys(days).sort().slice(-120).forEach(function (d) { if (isYmd(d) && +days[d] > 0) s.stats.days[d] = Math.round(+days[d]); });
    return s;
  }

  // ── changes ─────────────────────────────────────────────────────────────────────────────
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function children(state, id) { return state.tasks.filter(function (t) { return t.parentId === id; }).sort(function (a, b) { return a.order - b.order; }); }
  function bump(state, day, n) {
    var v = (state.stats.days[day] || 0) + n;
    if (v > 0) state.stats.days[day] = v; else delete state.stats.days[day];
  }
  // Ticks a task. A repeating one moves to its next day instead of leaving the list.
  // now: { day, iso }. Returns { repeated: true|false, next?: day }.
  function completeTask(state, id, now) {
    var t = byId(state.tasks, id);
    if (!t || t.done) return { repeated: false };
    bump(state, now.day, 1);
    if (t.repeat && t.due && !t.parentId) {
      state.log.push({ id: uid(), title: t.title, at: now.iso, projectId: t.projectId });
      if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
      t.due = { date: nextDue(t.due.date, t.repeat, now.day), time: t.due.time };
      // The checklist under a repeating task starts fresh each time it comes back.
      children(state, id).forEach(function (c) { c.done = false; c.doneAt = null; });
      return { repeated: true, next: t.due.date };
    }
    t.done = true; t.doneAt = now.iso;
    children(state, id).forEach(function (c) { if (!c.done) { c.done = true; c.doneAt = now.iso; } });
    pruneDone(state);
    return { repeated: false };
  }
  function reopenTask(state, id) {
    var t = byId(state.tasks, id);
    if (!t || !t.done) return;
    if (t.doneAt) bump(state, ymd(new Date(t.doneAt)), -1);
    t.done = false; t.doneAt = null;
    // A sub-task cannot be open under a finished parent.
    var p = t.parentId ? byId(state.tasks, t.parentId) : null;
    if (p && p.done) { p.done = false; p.doneAt = null; }
  }
  // WHY: saved data must stay well under the app's 1 MB limit; the oldest finished tasks go first.
  function pruneDone(state) {
    var done = state.tasks.filter(function (t) { return t.done && !t.parentId; });
    if (done.length <= 400) return;
    done.sort(function (a, b) { return String(a.doneAt) < String(b.doneAt) ? -1 : 1; });
    var drop = {};
    done.slice(0, done.length - 400).forEach(function (t) { drop[t.id] = 1; });
    state.tasks = state.tasks.filter(function (t) { return !drop[t.id] && !drop[t.parentId]; });
  }
  function deleteTask(state, id) { state.tasks = state.tasks.filter(function (t) { return t.id !== id && t.parentId !== id; }); }
  function nextOrder(state, where) {
    var max = -1;
    state.tasks.forEach(function (t) {
      if (t.projectId === where.projectId && t.sectionId === (where.sectionId || null) && t.parentId === (where.parentId || null) && t.order > max) max = t.order;
    });
    return max + 1;
  }
  function addTask(state, fields, nowIso) {
    var parent = fields.parentId ? byId(state.tasks, fields.parentId) : null;
    var t = {
      id: uid(), title: String(fields.title || '').trim().slice(0, 500), notes: fields.notes || '',
      projectId: parent ? parent.projectId : fields.projectId || null,
      sectionId: parent ? parent.sectionId : fields.sectionId || null,
      parentId: parent && !parent.parentId ? parent.id : null,
      order: 0, priority: fields.priority || 4, labels: (fields.labels || []).slice(),
      due: fields.due ? { date: fields.due.date, time: fields.due.time || null } : null,
      repeat: fields.due && fields.repeat ? cleanRepeat(fields.repeat) : null,
      remind: fields.due && fields.remind != null ? fields.remind : null,
      done: false, doneAt: null, createdAt: nowIso, comments: []
    };
    t.order = nextOrder(state, t);
    t.labels = t.labels.map(function (l) { return ensureLabel(state, l); }).filter(Boolean);
    state.tasks.push(t);
    return t;
  }
  function ensureLabel(state, name) {
    name = String(name || '').trim().replace(/^@/, '').replace(/\s+/g, '-').slice(0, 40);
    if (!name) return null;
    for (var i = 0; i < state.labels.length; i++) if (state.labels[i].name.toLowerCase() === name.toLowerCase()) return state.labels[i].name;
    var keys = Object.keys(COLORS);
    state.labels.push({ name: name, color: keys[1 + (state.labels.length % (keys.length - 1))] });
    return name;
  }
  // Moves a task (with its sub-tasks) to a project/section, placed before `beforeId` or last.
  function moveTask(state, id, where, beforeId) {
    var t = byId(state.tasks, id);
    if (!t) return;
    // WHY only when asked: a caller that says nothing about the parent (moving several picked
    // tasks) must not turn a sub-task into a task of its own.
    if (where.parentId !== undefined) t.parentId = where.parentId;
    t.projectId = where.projectId || null; t.sectionId = where.sectionId || null;
    children(state, id).forEach(function (c) { c.projectId = t.projectId; c.sectionId = t.sectionId; });
    var sibs = state.tasks.filter(function (x) {
      return x !== t && x.projectId === t.projectId && x.sectionId === t.sectionId && x.parentId === t.parentId;
    }).sort(function (a, b) { return a.order - b.order; });
    var at = sibs.length;
    for (var i = 0; i < sibs.length; i++) if (sibs[i].id === beforeId) { at = i; break; }
    sibs.splice(at, 0, t);
    sibs.forEach(function (x, i) { x.order = i; });
  }

  // ── finding and ordering ────────────────────────────────────────────────────────────────
  function matchesFilter(t, q, now, weekStart) {
    if (q.priorities && q.priorities.length && q.priorities.indexOf(t.priority) < 0) return false;
    if (q.labels && q.labels.length && !q.labels.some(function (l) { return t.labels.indexOf(l) >= 0; })) return false;
    if (q.projects && q.projects.length && q.projects.indexOf(t.projectId || 'inbox') < 0) return false;
    var due = q.due || 'any';
    if (due === 'none') return !t.due;
    if (due === 'dated') return !!t.due;
    if (due === 'any') return true;
    if (!t.due) return false;
    var diff = diffDays(t.due.date, now.day);
    if (due === 'overdue') return isOverdue(t, now);
    if (due === 'today') return diff <= 0;
    if (due === 'week') return diff < 7;
    return true;
  }
  function searchTasks(state, text) {
    var words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return state.tasks.filter(function (t) {
      var hay = (t.title + ' ' + t.notes + ' ' + t.labels.map(function (l) { return '@' + l; }).join(' ')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  function dueKey(t) { return t.due ? t.due.date + ' ' + (t.due.time || '99:99') : '9999-99-99'; }
  function sortTasks(list, mode) {
    var cmp = {
      manual: function (a, b) { return a.order - b.order; },
      due: function (a, b) { return dueKey(a) < dueKey(b) ? -1 : dueKey(a) > dueKey(b) ? 1 : a.priority - b.priority || a.order - b.order; },
      priority: function (a, b) { return a.priority - b.priority || (dueKey(a) < dueKey(b) ? -1 : dueKey(a) > dueKey(b) ? 1 : a.order - b.order); },
      name: function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : a.title.toLowerCase() > b.title.toLowerCase() ? 1 : 0; },
      added: function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; }
    }[mode] || null;
    return cmp ? list.slice().sort(cmp) : list.slice();
  }
  // Days in a row, ending today (or yesterday if nothing is done yet today), with the goal met.
  function streak(state, today) {
    var goal = state.settings.dailyGoal, n = 0, d = today;
    if ((state.stats.days[d] || 0) < goal) d = addDays(d, -1);
    while ((state.stats.days[d] || 0) >= goal && n < 1000) { n++; d = addDays(d, -1); }
    return n;
  }

  return {
    DAY_NAMES: DAY_NAMES, DAY_SHORT: DAY_SHORT, MONTH_NAMES: MONTH_NAMES, MONTH_SHORT: MONTH_SHORT, COLORS: COLORS,
    pad: pad, ymd: ymd, fromYmd: fromYmd, isYmd: isYmd, isTime: isTime, addDays: addDays, addMonths: addMonths, diffDays: diffDays, dow: dow,
    startOfWeek: startOfWeek, daysInMonth: daysInMonth, uid: uid, ordinal: ordinal,
    stepRepeat: stepRepeat, nextDue: nextDue, describeRepeat: describeRepeat, cleanRepeat: cleanRepeat,
    formatTime: formatTime, formatDay: formatDay, dueInfo: dueInfo, isOverdue: isOverdue,
    parseQuickAdd: parseQuickAdd, emptyState: emptyState, normalize: normalize,
    byId: byId, children: children, completeTask: completeTask, reopenTask: reopenTask, deleteTask: deleteTask,
    addTask: addTask, ensureLabel: ensureLabel, moveTask: moveTask, nextOrder: nextOrder,
    matchesFilter: matchesFilter, searchTasks: searchTasks, sortTasks: sortTasks, streak: streak
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TasksCore;
