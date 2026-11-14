# Tasks — notes for this page's assistant

A to-do list: Inbox, Today, Upcoming, projects with sections (list or
board), priorities, labels, saved filters, sub-tasks, repeating tasks, comments, a finished log
and a daily goal. It reaches nothing outside the app (no connections).

## Changing the page

`page.html` is BUILT. In the YouCoded dev workspace the source is `pages/tasks/src/` (rules in
`core.js`, screens in `ui-a/b/c.js`, look in `styles.css`) and `node pages/tasks/build.mjs`
writes `page.html`. If only the installed copy is at hand, edit `page.html` directly: the same
code is inside it, in the same order.

## Changing the person's tasks (saved data)

You may add or edit tasks by writing the page's saved data; the open page redraws at once.
The page repairs anything loose, so only `title` is required on a new task.

```
{
  tasks: [{
    id, title, notes,
    projectId: project id | null (null = Inbox), sectionId: section id | null,
    parentId: task id | null      // a sub-task; one level only; lives where its parent lives
    order: number                 // position among its neighbours ("My order")
    priority: 1 | 2 | 3 | 4       // 1 = highest, 4 = none
    labels: ["errands"]           // label NAMES, no "@"
    due: { date: "YYYY-MM-DD", time: "HH:MM" | null } | null   // the person's local time
    repeat: { every: 2, unit: "day"|"week"|"month"|"year", days?: [0-6, 0 = Sunday],
              after?: true (count from the day it is finished), anchor?: day of month } | null
    remind: minutes before the due time | null   // only with a time; shown only while the page is open
    done, doneAt (ISO), createdAt (ISO),
    comments: [{ id, text, at (ISO) }]
  }],
  projects: [{ id, name, color, favorite, archived, layout: "list"|"board", order,
               sections: [{ id, name, order, collapsed }] }],
  labels:   [{ name, color }],
  filters:  [{ id, name, query: { priorities: [1-4], labels: [names], projects: [ids or "inbox"],
               due: "any"|"overdue"|"today"|"week"|"dated"|"none" } }],
  log:      [{ id, title, at, projectId }],   // each time a REPEATING task was ticked (it never becomes done)
  stats:    { days: { "YYYY-MM-DD": tasks finished that day } },   // the daily goal and streak
  settings: { weekStart: 0|1, h12, dailyGoal, startView, views: { "<view>": { sort, group, done } } }
}
```

Colours are names: grey red orange yellow green teal blue indigo purple pink.

Rules to keep:
- Always send the WHOLE object back; never drop the lists you did not touch.
- To finish a task set `done: true` and `doneAt`; for a repeating task move `due.date` to its
  next day instead and add a `log` line. Add 1 to `stats.days[today]` either way.
- A repeat or a reminder needs a `due`; a task without one loses both.
- Finished tasks beyond the newest 400 are dropped by the page to stay under the 1 MB limit.
