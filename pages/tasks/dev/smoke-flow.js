// Runs INSIDE the preview page (dev/smoke.mjs feeds it to scripts/ui-probe.mjs): clicks through
// the main journeys against the sample tasks and returns the checks that failed.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const el = (s) => { const e = typeof s === 'string' ? q(s) : s; if (!e) throw new Error('missing: ' + s); return e; };
  const click = async (s) => { el(s).click(); await sleep(40); };
  const type = async (s, text) => { const e = el(s); e.focus(); e.value = text; e.dispatchEvent(new Event('input', { bubbles: true })); await sleep(20); };
  const change = async (s, v) => { const e = el(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); await sleep(40); };
  const key = async (s, k, o = {}) => { (s ? el(s) : document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o })); await sleep(40); };
  const text = (sel, t) => qa(sel).find((e) => e.textContent.includes(t));
  const go = (name) => click(text('.t-navitem', name));
  const menu = (label) => click(text('.t-pop__item', label));
  const save = async () => { await sleep(220); return window.__saved; };
  const T = async (title) => (await save()).tasks.find((t) => t.title === title);
  const row = (id) => `.t-task[data-id="${id}"]`;
  const fails = [], ok = (name, cond, extra) => { if (!cond) fails.push(name + (extra !== undefined ? ' — got ' + JSON.stringify(extra) : '')); };
  const pad = (n) => String(n).padStart(2, '0'), ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  let step = 'start';
  try {
    step = 'today'; ok('Today lists 5 tasks', qa('.t-task').length === 5, qa('.t-task').length);
    ok('Overdue group shows', !!text('.t-group__title', 'Overdue'));

    step = 'quick add'; await key(null, 'q');
    ok('Q opens the add box', !!q('#modal #ed-title'));
    await type('#ed-title', 'Buy stamps tomorrow 5pm p1 @errands #Home');
    ok('five shortcuts are highlighted', qa('#ed-found .yc-status').length === 5, qa('#ed-found .yc-status').length);
    await key('#ed-title', 'Enter');
    let t = await T('Buy stamps');
    ok('quick add saved the task', !!t);
    ok('…with day and time', t && t.due && t.due.date === day(1) && t.due.time === '17:00', t && t.due);
    ok('…priority, project, label, reminder', t && t.priority === 1 && t.projectId === 'home' && t.labels[0] === 'errands' && t.remind === 0, t);
    ok('add box closed', !q('#modal .t-modal'));

    step = 'inline add'; await go('Inbox');
    await click('.t-add[data-act="add-here"]');
    await type('#ed-title', 'Inline one'); await key('#ed-title', 'Enter');
    ok('inline box stays open and empty', q('#ed-title') && q('#ed-title').value === '');
    await type('#ed-title', 'Inline two'); await key('#ed-title', 'Enter');
    ok('two inline tasks saved to Inbox', (await save()).tasks.filter((x) => /^Inline/.test(x.title) && !x.projectId).length === 2);
    await key('#ed-title', 'Escape');
    ok('Escape closes the inline box', !q('#ed-title'));

    step = 'tick and undo'; await click(row('p') + ' .t-check');
    ok('ticking marks done', (await T('Call the dentist')).done === true);
    ok('done task leaves the list', !q(row('p')));
    await click('#toast [data-act="undo"]');
    ok('Undo brings it back', (await T('Call the dentist')).done === false && !!q(row('p')));

    step = 'repeat'; await go('Today'); await click(row('d') + ' .t-check');
    t = await T('Water the plants');
    ok('a repeating task moves 3 days on and stays open', t.due.date === day(3) && !t.done, t.due);
    ok('…and is written to the finished log', (await save()).log.length === 1);

    step = 'detail'; await go('Lisbon trip'); await click(row('f'));
    ok('task panel opens', !q('#detail').hidden && qa('#detail .t-sub').length === 3, qa('#detail .t-sub').length);
    await type('#d-sub', 'Pack bags'); await key('#d-sub', 'Enter');
    ok('sub-task added', (await T('Pack bags')).parentId === 'f');
    await change('#d-priority', '2'); ok('priority changed', (await T('Book flights')).priority === 2);
    await change('#d-title', 'Book the flights'); ok('renamed', !!(await T('Book the flights')));
    await change('#d-notes', 'Window seat'); ok('notes saved', (await T('Book the flights')).notes === 'Window seat');
    await type('#d-comment', 'Booked!'); await click('[data-act="d-comment-add"]');
    ok('comment posted', (await T('Book the flights')).comments.length === 2);

    step = 'drafts'; await type('#d-comment', 'half typed'); await change('#d-priority', '3');
    ok('a half-typed comment survives a redraw', q('#d-comment').value === 'half typed', q('#d-comment').value);
    q('#d-comment').value = ''; q('#d-title').focus(); q('#d-title').value = 'Book all the flights'; await key('#d-title', 'Escape');
    ok('Escape closes the panel and keeps the renamed title', q('#detail').hidden && !!(await T('Book all the flights')));
    await change('[data-change="sort"]', 'manual'); await click(row('f')); await change('#d-title', 'Book the flights');

    step = 'date picker'; await click('[data-act="d-date"]');
    ok('date picker opens', !!q('.t-date'));
    await click(`.t-day[data-day="${day(5)}"]`);
    ok('picked a day', (await T('Book the flights')).due.date === day(5));
    await change('#dp-repeat', 'week'); ok('repeat set', (await T('Book the flights')).repeat.unit === 'week');
    await change('#dp-time', '08:15');
    t = await T('Book the flights'); ok('time set, reminder defaults on', t.due.time === '08:15' && t.remind === 0, t);
    await change('#dp-repeat', 'custom'); await change('#dp-every', '2'); await click('.t-weekdays [data-d="2"]');
    t = await T('Book the flights'); ok('custom repeat: every 2 weeks on Tue', t.repeat.every === 2 && t.repeat.days.join() === '2', t.repeat);
    await menu('No date');
    t = await T('Book the flights'); ok('No date clears day, repeat and reminder', t.due === null && t.repeat === null && t.remind === null, t);
    ok('picker closed', !q('.t-date'));
    await click('[data-act="detail-close"]'); ok('panel closes', q('#detail').hidden);

    step = 'row menu'; await click(row('o') + ' [data-act="row-more"]'); await menu('Duplicate');
    ok('duplicate', (await save()).tasks.filter((x) => x.title === 'Find a travel adapter').length === 2);
    await click(row('o') + ' [data-act="row-more"]'); await click('.t-flags [data-p="1"]');
    ok('priority from the menu', (await save()).tasks.find((x) => x.id === 'o').priority === 1);
    await click(row('o') + ' [data-act="row-more"]'); await menu('Move to'); await menu('Work › Doing');
    t = (await save()).tasks.find((x) => x.id === 'o'); ok('moved to Work › Doing', t.projectId === 'work' && t.sectionId === 'doing', t);
    await go('Work'); ok('Work opens as a board with 4 columns + add', qa('.t-col').length === 5, qa('.t-col').length);
    await click(row('o') + ' [data-act="row-more"]'); await menu('Delete');
    ok('deleted', !(await save()).tasks.find((x) => x.id === 'o'));

    step = 'project'; await click('[data-act="project-add"]'); await type('#m-name', 'Garden'); await click('[data-act="modal-ok"]');
    let s = await save(); ok('project added and opened', s.projects.some((p) => p.name === 'Garden') && q('.t-head h2').textContent.includes('Garden'));
    await click('[data-act="section-add"]'); await type('#m-name', 'Spring'); await key('#m-name', 'Enter');
    ok('section added', (await save()).projects.find((p) => p.name === 'Garden').sections.length === 1);
    await click('[data-act="set-layout"][data-layout="board"]'); ok('board layout', !!q('.t-board'));
    await click('[data-act="project-more"]'); await menu('Delete'); await click('[data-act="modal-ok"]');
    ok('project deleted after confirming', !(await save()).projects.some((p) => p.name === 'Garden'));

    step = 'filters'; await go('Filters & labels');
    ok('labels listed', qa('.yc-list-row').length >= 7, qa('.yc-list-row').length);
    await click('[data-act="filter-add"]'); await type('#m-name', 'Urgent'); await click('[data-group="priorities"] [data-v="1"]'); await click('[data-act="modal-ok"]');
    ok('filter saved and shown', (await save()).filters.length === 2 && qa('.t-task').length >= 2, qa('.t-task').length);
    await go('Filters & labels'); await click(text('.t-navitem', 'errands'));
    ok('label view lists its tasks', qa('.t-task').length === 3, qa('.t-task').length);

    step = 'search'; await type('#search', 'report');
    ok('search finds by name and notes', qa('.t-task').length === 2, qa('.t-task').length);
    await key('#search', 'Escape');

    step = 'completed'; await go('Completed'); ok('completed lists finished tasks and the repeat', qa('.t-task').length >= 3, qa('.t-task').length);
    step = 'upcoming'; await go('Upcoming'); ok('upcoming shows 14 days', qa('.t-group[data-drop-due]').length === 14, qa('.t-group[data-drop-due]').length);

    step = 'bulk'; await go('Inbox'); await click('[data-act="select-mode"]');
    await click(row('p')); await click(row('q'));
    ok('two selected', q('.t-bulk b').textContent === '2 selected', q('.t-bulk b').textContent);
    await click('[data-act="bulk-done"]');
    s = await save(); ok('both done at once', s.tasks.find((x) => x.id === 'p').done && s.tasks.find((x) => x.id === 'q').done);
    await key(null, 'z', { ctrlKey: true });
    s = await save(); ok('Ctrl+Z undoes the bulk change', !s.tasks.find((x) => x.id === 'p').done);

    step = 'drag'; const ids = () => qa('#list .t-task:not(.is-sub)').map((e) => e.getAttribute('data-id'));
    const before = ids(), last = before[before.length - 1], first = q(row(before[0])), dt = new DataTransfer();
    q(row(last)).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = first.getBoundingClientRect(), at = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 2 };
    first.dispatchEvent(new DragEvent('dragover', at)); first.dispatchEvent(new DragEvent('drop', at));
    await sleep(60); ok('dragging the last task onto the first puts it first', ids()[0] === last, ids());
    q(row(last)).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const nav = text('.t-navitem', 'Lisbon trip'); nav.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); nav.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    ok('dragging onto a project moves it there', (await save()).tasks.find((x) => x.id === last).projectId === 'trip');

    step = 'pop-ups'; await click('[data-act="progress"]'); ok('progress opens', !!q('.t-bars')); await click('[data-act="modal-cancel"]');
    await click('[data-act="settings"]'); ok('settings opens', !!q('#m-data')); await change('[data-change="set-week"]', '1');
    ok('setting saved', (await save()).settings.weekStart === 1); await key(null, 'Escape'); ok('Escape closes settings', !q('.t-modal'));

    step = 'outside change'; window.__push({ tasks: [{ title: 'From the assistant', due: day(0) }] }); await sleep(60); await go('Today');
    ok('data written from outside shows up', !!text('.t-task__title', 'From the assistant') && qa('.t-task').length === 1, qa('.t-task').length);
  } catch (e) { fails.push('STOPPED at "' + step + '": ' + e.message); }
  return JSON.stringify(fails);
})()
