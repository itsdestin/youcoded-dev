// kit.js — shared staging for the round-2 brand territories. Every territory's boards.js
// calls these, so an app icon or a tray icon is judged on the SAME taskbar, Dock and clock
// for all four directions: only the brand changes, never the staging.
// Classic script (not a module) on purpose: Chrome refuses module scripts over file://.
window.KIT = (() => {
  const img = (src, w, style = '', h = w) => `<img src="${src}" width="${w}" height="${h}" style="display:block;${style}">`;
  // Generic neighbour icons, so ours is seen among others the way a user meets it.
  const OTHERS = [
    ['#2D7FF9', 'M7 8h10v2H7zM7 12h10v2H7z'], ['#E8453C', 'M12 6l6 10H6z'], ['#1DB954', 'M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0'],
    ['#F5A623', 'M7 7h10v10H7z'], ['#5865F2', 'M8 9h8v6H8z'], ['#6B6F76', 'M7 12h10'],
  ];
  const other = (i, s) => {
    const [c, d] = OTHERS[i % OTHERS.length];
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" style="display:block"><rect width="24" height="24" rx="5.5" fill="${c}"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const sysGlyphs = (c) => [
    '<path d="M2 6.5a9 9 0 0 1 12 0M4.3 9a5.5 5.5 0 0 1 7.4 0M6.6 11.5a2 2 0 0 1 2.8 0" fill="none" stroke="C" stroke-width="1.4" stroke-linecap="round"/>',
    '<path d="M2 6h3l4-3v10l-4-3H2z" fill="C"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="C" stroke-width="1.3" stroke-linecap="round"/>',
    '<rect x="1" y="4.5" width="12" height="7" rx="1.6" fill="none" stroke="C" stroke-width="1.2"/><rect x="2.6" y="6.1" width="7" height="3.8" rx=".6" fill="C"/><rect x="13.6" y="6.6" width="1.4" height="2.8" rx=".5" fill="C"/>',
  ].map(p => `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block">${p.replaceAll('"C"', `"${c}"`)}</svg>`).join('');

  return {
    img,
    other,
    // A clock-area strip at TRUE pixel size. `ours` is an <img>/<svg> html string already sized.
    tray: ({ label, bg, fg, ours, h = 44, clock = '9:41 AM' }) => `<div>
      <div style="font:500 11px 'JetBrains Mono';letter-spacing:.08em;opacity:.6;margin-bottom:6px">${label}</div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:0 16px;height:${h}px;border-radius:10px;background:${bg}">
        ${ours}${sysGlyphs(fg)}<span style="font:500 12.5px 'Segoe UI','Instrument Sans';color:${fg};margin-left:4px">${clock}</span></div></div>`,
    // Centred Windows-11-style taskbar with ours in the middle of six others.
    taskbar: ({ bg, ours, size = 24, h = 52 }) => `<div style="display:flex;align-items:center;justify-content:center;gap:${size * .75}px;height:${h}px;border-radius:10px;background:${bg}">
      ${[0, 1, 2].map(i => other(i, size)).join('')}${ours}${[3, 4, 5].map(i => other(i, size)).join('')}</div>`,
    dock: ({ ours, size = 60, bg = 'rgba(255,255,255,.55)' }) => `<div style="display:inline-flex;align-items:flex-end;gap:${size * .22}px;padding:${size * .18}px ${size * .26}px;border-radius:${size * .42}px;background:${bg};backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.6);box-shadow:0 10px 40px rgba(0,0,0,.18)">
      ${[0, 1, 2].map(i => other(i, size)).join('')}${ours}${[3, 4, 5].map(i => other(i, size)).join('')}</div>`,
    // A 16px raster blown up with hard pixels — how a tray icon REALLY looks.
    magnify: (src, px = 16, scale = 12, bg = '#1F1F23') =>
      `<img src="${src}" width="${px * scale}" height="${px * scale}" style="display:block;image-rendering:pixelated;background:${bg};border-radius:12px">`,
    label: (t, c = 'currentColor') => `<div style="font:500 11px 'JetBrains Mono';letter-spacing:.14em;text-transform:uppercase;color:${c};opacity:.6">${t}</div>`,
  };
})();
