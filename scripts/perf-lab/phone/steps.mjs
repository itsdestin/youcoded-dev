// scripts/perf-lab/phone/steps.mjs — what the phone speed lab does, one step at a time. Each step has:
//   prepare(ctx)  — puts the app where the step starts (not measured);
//   act(ctx)      — the one thing a person does (measured, from its first touch);
//   shows         — what the step waits to see on screen ({ sel, text }), for "time to show"; omitted for a motion;
//   settleMs      — how long to keep measuring after the act (an animation's length plus a little);
//   check         — optional page expression, true when the step really did its thing (the keyboard is up…);
//                   a run where it is false is reported as failed, not as a fast result;
//   undo(ctx)     — puts the app back for the next repeat (not measured).
// Touches are real (adb input), so the on-screen keyboard, scrolling and drags behave as under a finger.
// Steps never type text, send messages or open a conversation: an empty "New session" is the only chat they use.

const BOX = '.bottom-float textarea';

async function closeEverything(ctx) {
  // Back closes the topmost popup, menu or drawer. Never pressed with nothing open: on the plain chat, Back sends the
  // app to the background. A full screen (Projects, Pages) is left with its own "Back to chat".
  for (let i = 0; i < 5; i++) {
    const overlay = await ctx.page.evaluate(`!!(document.querySelector('[role=dialog]') || document.querySelector('[role=menu]') || document.querySelector('.command-drawer.translate-y-0'))`);
    if (overlay || await ctx.find('[aria-label="Close settings"]')) { ctx.key(4); await ctx.sleep(500); continue; }
    if (await ctx.find(null, 'Back to chat')) { await ctx.tapOn(null, 'Back to chat'); await ctx.sleep(700); continue; }
    break;
  }
  await ctx.page.evaluate(`document.activeElement?.blur?.()`);
}

/** A chat with a message box on screen: the open one, or a fresh empty session. */
async function ensureChat(ctx) {
  await closeEverything(ctx);
  if (await ctx.find(BOX)) return;
  if (!(await ctx.find(null, 'New session'))) {
    await ctx.tapOn(null, 'Open menu');
    await ctx.sleep(400);
  }
  await ctx.tapOn(null, 'New session');
  await ctx.sleep(900);
  await ctx.tapOn(null, 'Create session');
  if (!(await ctx.waitFor(BOX, null, 15000))) throw new Error('could not open an empty chat');
  await ctx.sleep(1500);
}

export const STEPS = [
  {
    name: 'keyboard-open', what: 'Tap the message box; the keyboard slides up',
    prepare: async (ctx) => { await ensureChat(ctx); await ctx.page.evaluate(`document.activeElement?.blur?.()`); await ctx.sleep(900); },
    act: (ctx) => ctx.tapOn(BOX), settleMs: 1200,
    check: `parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vvp-offset')) > 0`,
    undo: async (ctx) => { await ctx.page.evaluate(`document.activeElement?.blur?.()`); await ctx.sleep(900); },
  },
  {
    name: 'keyboard-close', what: 'Press Back; the keyboard slides down',
    prepare: async (ctx) => { await ensureChat(ctx); await ctx.tapOn(BOX); await ctx.sleep(1200); },
    act: (ctx) => ctx.key(4), settleMs: 1200,
    check: `!(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vvp-offset')) > 0)`,
    undo: async (ctx) => { await ctx.page.evaluate(`document.activeElement?.blur?.()`); await ctx.sleep(600); },
  },
  {
    name: 'menu-open', what: 'Tap ☰; the menu opens',
    prepare: ensureChat, act: (ctx) => ctx.tapOn(null, 'Open menu'),
    shows: { sel: '[role=menuitem]', text: 'Settings' }, settleMs: 700, undo: closeEverything,
  },
  {
    name: 'settings-open', what: 'Tap Settings in the ☰ menu; Settings opens',
    prepare: async (ctx) => { await ensureChat(ctx); await ctx.tapOn(null, 'Open menu'); await ctx.sleep(700); },
    act: (ctx) => ctx.tapOn('[role=menuitem]', 'Settings'),
    shows: { sel: '[aria-label="Close settings"]' }, settleMs: 900, undo: closeEverything,
  },
  {
    name: 'appearance-open', what: 'In Settings, tap Appearance; its popup opens',
    prepare: async (ctx) => { await ensureChat(ctx); await ctx.tapOn(null, 'Open menu'); await ctx.sleep(700); await ctx.tapOn('[role=menuitem]', 'Settings'); await ctx.sleep(1200); },
    act: (ctx) => ctx.tapOn(null, 'Appearance[\\s\\S]*'),
    shows: { sel: '[role=dialog][aria-label="Appearance"]' }, settleMs: 900, undo: closeEverything,
  },
  {
    name: 'skills-drawer-open', what: 'Tap the compass; the skills drawer slides up',
    prepare: ensureChat, act: (ctx) => ctx.tapOn('[title="Browse skills"]'),
    shows: { sel: '[role=separator]', text: 'Resize drawer.*' }, settleMs: 700, undo: closeEverything,
  },
  {
    name: 'skills-drawer-resize', what: 'Drag the drawer handle up to full height and back down',
    prepare: async (ctx) => { await ensureChat(ctx); await ctx.tapOn('[title="Browse skills"]'); await ctx.sleep(900); },
    act: async (ctx) => {
      const h = await ctx.find('[role=separator]', 'Resize drawer.*');
      if (!h) throw new Error('no drawer handle');
      const p = ctx.toScreen(h);
      ctx.swipe(p.x, p.y, p.x, p.y - 700, 600);
      await ctx.sleep(300);
      const h2 = await ctx.find('[role=separator]', 'Resize drawer.*');
      const q = ctx.toScreen(h2 || h);
      ctx.swipe(q.x, q.y, q.x, q.y + 500, 600);
    },
    settleMs: 800, undo: closeEverything,
  },
  {
    name: 'projects-open', what: 'Tap Projects in the ☰ menu; Projects opens with its files',
    prepare: async (ctx) => { await ensureChat(ctx); await ctx.tapOn(null, 'Open menu'); await ctx.sleep(700); },
    act: (ctx) => ctx.tapOn('[role=menuitem]', 'Projects'),
    shows: { sel: null, text: 'Back to chat' }, settleMs: 1200, undo: closeEverything,
  },
];
