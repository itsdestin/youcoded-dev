// promo-market: put the just-installed plugin's quick chip on screen.
//
// The workbench's skills.install (dev-only) adds a chip to the mock's chip
// list, but the composer's chip row reads that list ONCE, when the app
// mounts (state/skill-context.tsx loads getChips in a mount effect and has
// no refresh path — in the real app chips only change through the chip
// editor). So after the marketplace closes, this hands the mock's current
// list to the app's own setChips action — the exact call the pencil editor
// makes — by reaching the SkillProvider's context value through React's
// fiber tree from the editor button. Nothing in the app changes; the scene
// does what a click on the editor's "add" would do, without the editor on
// camera. Resolves with the chip count, or throws if the provider is not
// found (a silent no-op would film a missing chip).
(async () => {
  const el = document.querySelector("[title='Edit quick chips']");
  if (!el) throw new Error('no chip editor button');
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  let f = el[key];
  while (f && !(f.memoizedProps && f.memoizedProps.value && typeof f.memoizedProps.value.setChips === 'function')) f = f.return;
  if (!f) throw new Error('SkillProvider not found above the chip editor');
  const chips = await window.claude.skills.getChips();
  await f.memoizedProps.value.setChips(chips);
  return chips.length;
})();
