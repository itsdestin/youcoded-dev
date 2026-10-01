// boards.js — "Say it" (bubble) territory: six 1440x900 boards for the round-2 brand deck.
// The idea: YouCoded is built by talking, so the character IS a speech bubble — its tail is
// one foot, a nub is the other. Headlines in a soft serif (Fraunces SOFT) to sound human,
// reading text in Figtree. Mascot + wordmark geometry is duplicated from gen.mjs so boards can
// recolour them inline (WHY: a theme skin needs any colour, not just the three exported files).
(() => {
  const C = { grape: '#6B3AD6', grapeDeep: '#4A22A8', gum: '#FF8CC6', mint: '#7ADFC0', butter: '#FFE08A', paper: '#FFFCF6', ink: '#1C1730', mute: '#6F6880' };
  const P = 't/bubble/png/', S = 't/bubble/svg/';
  const SERIF = "font-family:'Fraunces';font-variation-settings:'SOFT' 100,'opsz' 144;";
  const SERIF_TXT = "font-family:'Fraunces';font-variation-settings:'SOFT' 100,'opsz' 24;";
  const SANS = "font-family:'Figtree';";
  const MONO = "font-family:'JetBrains Mono';";
  let uid = 0;

  // ---------- mascot, any colour ----------
  const BODY = '<rect x="4" y="4" width="56" height="44" rx="18"/>';
  const FEET = '<path d="M8 36 L8 57 Q8 61.5 11.6 59 L30 46 Z"/><rect x="40" y="40" width="12" height="16" rx="5"/>';
  const FACES = {
    eyes: (c) => `<g fill="${c}"><rect x="20" y="16" width="8" height="14" rx="4"/><rect x="36" y="16" width="8" height="14" rx="4"/></g>`,
    dots: (c) => `<g fill="${c}"><circle cx="20" cy="26" r="4.4"/><circle cx="32" cy="26" r="4.4"/><circle cx="44" cy="26" r="4.4"/></g>`,
    check: (c) => `<path d="M20 26 L28 33 L44 18" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    happy: (c) => `<g fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"><path d="M19 25 Q24 18 29 25"/><path d="M35 25 Q40 18 45 25"/></g>`,
    wink: (c) => `<g fill="${c}"><rect x="20" y="16" width="8" height="14" rx="4"/></g><path d="M35 25 Q40 19 45 25" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
  };
  // `face` color is drawn (not punched) — callers pass the background they sit on.
  function mascot({ size = 120, fill = C.grape, face = 'eyes', faceColor = '#fff', stroke = null, sw = 3, extra = '', under = '', style = '', wave = false }) {
    const arm = wave ? `<rect x="56" y="10" width="9" height="16" rx="4.5" transform="rotate(30 60 18)"/>` : '';
    const outline = stroke ? `<g fill="${stroke}" stroke="${stroke}" stroke-width="${sw * 2}" stroke-linejoin="round">${arm}${FEET}${BODY}</g>` : '';
    return `<svg width="${size}" height="${size}" viewBox="-4 -6 72 72" style="display:block;overflow:visible;${style}">${under}
      ${outline}<g fill="${fill}">${arm}${FEET}${BODY}</g>${FACES[face](faceColor)}${extra}</svg>`;
  }

  // ---------- the wordmark, any colour (same letters as gen.mjs) ----------
  const L = {
    y: { w: 26, d: 'M0 0 V20 A13 13 0 0 0 26 20 M26 0 V44 A14 14 0 0 1 12 58 H8' },
    ob: { w: 42, d: 'M21 0 A20 20 0 1 1 7.6 34.9 L2.5 42.5 L13.2 38.2 A20 20 0 0 1 21 0 Z', bubble: true },
    u: { w: 26, d: 'M0 0 V20 A13 13 0 0 0 26 20 M26 0 V40' },
    c: { w: 37, d: 'M35.5 6.5 A19.5 19.5 0 1 0 35.5 33.5' },
    o: { w: 40, d: 'M20 0 A20 20 0 1 1 20 40 A20 20 0 1 1 20 0 Z' },
    d: { w: 40, d: 'M20 0 A20 20 0 1 0 20 40 A20 20 0 1 0 20 0 Z M40 -26 V40' },
    e: { w: 40, d: 'M2 20 H40 A20 20 0 1 0 35 33.5' },
  };
  const SEQ = [['y', 0], ['ob', 13], ['u', 13], ['c', 14], ['o', 10], ['d', 13], ['e', 13], ['d', 13]];
  // h = rendered height of the x-height+ascender+descender box; returns inline svg.
  function wordmark(h, color = C.grape, eye = null, sw = 9, plain = false) {
    let x = 0; const parts = [];
    for (const [k0, gap] of SEQ) {
      const k = plain && k0 === 'ob' ? 'o' : k0;
      x += gap; const g = L[k];
      parts.push(`<path transform="translate(${x} 0)" d="${g.d}"/>`);
      if (g.bubble) parts.push(`<g transform="translate(${x} 0)" fill="${eye || color}" stroke="none"><rect x="13" y="13" width="5" height="10" rx="2.5"/><rect x="24" y="13" width="5" height="10" rx="2.5"/></g>`);
      x += g.w;
    }
    const pad = sw / 2 + 1, W = x + pad * 2, top = -26 - pad, H = 84 + pad * 2;
    return `<svg height="${h}" width="${h * W / H}" viewBox="${-pad} ${top} ${W} ${H}" style="display:block;overflow:visible"><g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g></svg>`;
  }

  // ---------- a speech bubble (HTML) with the brand's tail ----------
  function bub(inner, { bg = '#fff', fg = C.ink, side = 'l', pad = '22px 26px', r = 30, w = 'auto', shadow = true, border = '', style = '' } = {}) {
    const tail = side === 'l'
      ? `<svg width="34" height="26" viewBox="0 0 34 26" style="position:absolute;left:22px;bottom:-20px"><path d="M0 0 L0 22 Q0 27 4 24 L34 0 Z" fill="${bg}"/></svg>`
      : `<svg width="34" height="26" viewBox="0 0 34 26" style="position:absolute;right:22px;bottom:-20px"><path d="M34 0 L34 22 Q34 27 30 24 L0 0 Z" fill="${bg}"/></svg>`;
    return `<div style="position:relative;background:${bg};color:${fg};border-radius:${r}px;padding:${pad};width:${w};${shadow ? 'box-shadow:0 18px 50px -18px rgba(40,20,90,.28);' : ''}${border}${style}">${inner}${side ? tail : ''}</div>`;
  }
  const kicker = (t, c = C.mute) => `<div style="${MONO}font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:${c}">${t}</div>`;

  // =====================================================================
  const boards = {};

  // ---------- 1. POSTER ----------
  boards.poster = () => `
  <div style="position:absolute;inset:0;background:${C.paper};${SANS}color:${C.ink}">
    <div style="position:absolute;right:-180px;top:-220px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle at 40% 40%,#EFE6FF,rgba(239,230,255,0) 70%)"></div>
    <div style="position:absolute;left:64px;top:52px;right:64px;display:flex;justify-content:space-between">${kicker('Territory B &nbsp;·&nbsp; Say it')}${kicker('YouCoded brand, round 2')}</div>

    <div style="position:absolute;left:64px;top:118px">${wordmark(178)}</div>
    <div style="position:absolute;left:68px;top:318px;width:640px;${SERIF}font-weight:400;font-size:58px;line-height:1.02;letter-spacing:-.02em">
      The conversation<br>is the <em style="font-style:italic;color:${C.grape}">character.</em></div>
    <div style="position:absolute;left:70px;top:462px;width:600px;font-size:18px;line-height:1.55;color:${C.mute}">
      You build YouCoded by talking to it, so its face is a speech bubble. The tail it speaks with is the foot it stands on. Every state the app is in, it can <em>say</em> with that one shape.</div>

    <!-- states strip -->
    <div style="position:absolute;left:64px;top:574px;display:flex;gap:30px;align-items:flex-end">
      ${[['eyes', 'Listening'], ['dots', 'Working'], ['check', 'Done'], ['happy', 'Glad'], ['wink', 'Hi there']].map(([f, n]) => `
        <div style="text-align:center">${mascot({ size: 92, face: f, wave: f === 'wink' })}<div style="${MONO}font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.mute};margin-top:10px">${n}</div></div>`).join('')}
    </div>

    <!-- signature moves -->
    <div style="position:absolute;left:64px;top:744px;width:690px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;border-top:1px solid #E9E1D3;padding-top:20px">
      ${[['01', 'Whatever speaks, has a tail', 'Notices and tips from the app carry the bubble\'s tail.'],
         ['02', 'One word in italic', 'Each headline leans on the single word that matters, in grape.'],
         ['03', 'Dots, not spinners', 'Anything that takes a moment shows the three typing dots.']].map(([n, t, d]) => `
        <div><div style="${MONO}font-size:11px;color:${C.grape};letter-spacing:.1em">${n}</div>
          <div style="${SERIF_TXT}font-size:18px;font-weight:600;margin-top:6px;line-height:1.2">${t}</div>
          <div style="font-size:13px;line-height:1.45;color:${C.mute};margin-top:6px">${d}</div></div>`).join('')}
    </div>

    <!-- right: the brand told as a conversation -->
    <div style="position:absolute;right:64px;top:120px;width:560px;display:flex;flex-direction:column;gap:34px">
      <div style="align-self:flex-end">${bub(`<div style="font-size:19px">So what do you look like?</div>`, { bg: C.ink, fg: '#fff', side: 'r', pad: '16px 24px' })}</div>
      ${bub(`<div style="display:flex;gap:18px;align-items:center">
          ${[[C.grape, 'Grape'], [C.gum, 'Bubblegum'], [C.mint, 'Mint'], [C.butter, 'Butter'], [C.ink, 'Ink'], [C.paper, 'Paper']].map(([c, n]) => `<div style="text-align:center"><div style="width:58px;height:58px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 3px rgba(255,255,255,.35)"></div><div style="${MONO}font-size:10.5px;margin-top:8px;color:#fff;opacity:.85">${n}<br>${c}</div></div>`).join('')}
        </div>`, { bg: C.grape, fg: '#fff', w: '540px', pad: '24px 28px' })}
      ${bub(`<div style="display:flex;gap:28px;align-items:flex-end">
          <div><div style="${SERIF}font-size:96px;line-height:.9;font-weight:500">Aa</div><div style="font-size:13px;margin-top:10px"><b>Fraunces Soft</b><br><span style="color:${C.mute}">headlines: warm, human</span></div></div>
          <div><div style="${SANS}font-size:96px;line-height:.9;font-weight:600">Aa</div><div style="font-size:13px;margin-top:10px"><b>Figtree</b><br><span style="color:${C.mute}">reading: clear, calm</span></div></div>
          <div><div style="${MONO}font-size:60px;line-height:1.2;font-weight:500">{}</div><div style="font-size:13px;margin-top:10px"><b>JetBrains Mono</b><br><span style="color:${C.mute}">paths, code</span></div></div>
        </div>`, { bg: '#fff', w: '540px' })}
      <div style="display:flex;gap:22px;align-items:center;margin-top:4px">
        ${KIT.img(P + 'icon-256.png', 132, 'filter:drop-shadow(0 18px 30px rgba(74,34,168,.35))')}
        ${bub(`<div style="font-size:15px;line-height:1.5">App icon, tray icon and favicon are<br>the same bubble, at every size.</div>
            <div style="display:flex;gap:14px;align-items:center;margin-top:12px">
              <div style="background:#1F1F23;border-radius:8px;padding:6px 8px;display:flex;gap:8px">${KIT.img(P + 'tray-white-16.png', 16)}${KIT.img(P + 'tray-white-dots-16.png', 16)}</div>
              <div style="background:#EEF0F5;border-radius:8px;padding:6px 8px;display:flex;gap:8px">${KIT.img(P + 'tray-black-16.png', 16)}${KIT.img(P + 'tray-black-check-16.png', 16)}</div>
              ${KIT.img(P + 'mark-32.png', 32)}</div>`, { bg: C.mint, side: 'l', pad: '18px 22px' })}
      </div>
    </div>

    <!-- palette stripe -->
    <div style="position:absolute;left:0;right:0;bottom:0;height:14px;display:flex">
      ${[C.grape, C.gum, C.mint, C.butter, C.ink].map((c, i) => `<div style="flex:${[5, 2, 2, 1, 3][i]};background:${c}"></div>`).join('')}</div>
  </div>`;

  // ---------- 2. ICON ----------
  boards.icon = () => `
  <div style="position:absolute;inset:0;background:${C.paper};${SANS}color:${C.ink}">
    <div style="position:absolute;left:64px;top:52px">${kicker('Say it &nbsp;·&nbsp; App icon and installer')}</div>
    <div style="position:absolute;left:64px;top:96px;width:560px;height:740px;border-radius:40px;background:radial-gradient(circle at 50% 38%,#EDE3FF,${C.paper} 72%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
      ${KIT.img(P + 'icon-512.png', 360, 'filter:drop-shadow(0 30px 50px rgba(74,34,168,.35))')}
      <div style="display:flex;gap:30px;align-items:flex-end">
        ${[64, 32, 24, 16].map(p => `<div style="text-align:center">${KIT.img(P + `${p <= 32 ? 'icon-sm' : 'icon'}-${p}.png`, p, 'margin:0 auto')}<div style="${MONO}font-size:11px;color:${C.mute};margin-top:8px">${p}px</div></div>`).join('')}
      </div>
      <div style="${SERIF_TXT}font-size:20px;font-style:italic;color:${C.mute};text-align:center;width:480px;line-height:1.4">A white bubble on grape. It reads as "someone to talk to" before you know the name.</div>
    </div>
    <div style="position:absolute;left:672px;top:84px;right:64px;display:flex;flex-direction:column;gap:16px">
      ${KIT.label('Windows taskbar, dark and light')}
      ${KIT.taskbar({ bg: '#1F1F23', ours: KIT.img(P + 'icon-sm-24.png', 24) })}
      ${KIT.taskbar({ bg: '#EEF0F5', ours: KIT.img(P + 'icon-sm-24.png', 24) })}
      ${KIT.label('Mac Dock')}
      <div style="height:150px;border-radius:22px;background:linear-gradient(135deg,#FFB8DE,#B9A4FF 50%,#8EE8CF);display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px">
        ${KIT.dock({ ours: KIT.img(P + 'icon-64.png', 60) })}</div>
      ${KIT.label('The installer, in your Downloads folder')}
      <div style="border-radius:18px;background:#fff;border:1px solid #ECE6F3;overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid #F0EBF6;font:500 13px 'Segoe UI','Figtree';color:#555">
          <span style="font-weight:600;color:${C.ink}">Downloads</span><span style="opacity:.5">›</span><span>Today</span></div>
        <div style="display:flex;gap:34px;padding:22px 28px;align-items:flex-start">
          <div style="width:128px;text-align:center;background:#E9E3FF;border-radius:10px;padding:12px 6px">${KIT.img(P + 'installer-64.png', 64, 'margin:0 auto')}<div style="font:400 12.5px 'Segoe UI','Figtree';margin-top:8px;line-height:1.3">YouCoded-Setup-1.3.1.exe</div></div>
          <div style="width:128px;text-align:center;padding:12px 6px;opacity:.55"><div style="width:64px;height:64px;margin:0 auto;border-radius:8px;background:#E8E8EC"></div><div style="font:400 12.5px 'Segoe UI','Figtree';margin-top:8px">notes.pdf</div></div>
          <div style="flex:1;align-self:center;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;gap:12px;align-items:center;font:400 13px 'Segoe UI','Figtree'">${KIT.img(P + 'installer-sm-32.png', 32)}YouCoded-Setup-1.3.1.exe</div>
            <div style="display:flex;gap:12px;align-items:center;font:400 13px 'Segoe UI','Figtree'">${KIT.img(P + 'installer-sm-16.png', 16)}YouCoded-Setup-1.3.1.exe</div>
            <div style="font-size:13px;color:${C.mute};line-height:1.45">The installer is the app icon with a little mint speech bubble saying "download".</div>
          </div>
        </div>
      </div>
      ${KIT.label('Browser tab')}
      <div style="background:#DEE1E6;border-radius:12px;padding:8px 10px 0;display:flex;gap:4px">
        <div style="background:#fff;border-radius:10px 10px 0 0;padding:10px 16px;display:flex;gap:10px;align-items:center;width:300px;font:400 13px 'Segoe UI','Figtree'">${KIT.img(P + 'mark-16.png', 16)}YouCoded — An assistant that's yours</div>
        <div style="padding:10px 16px;display:flex;gap:10px;align-items:center;width:220px;font:400 13px 'Segoe UI','Figtree';color:#555"><span style="width:16px;height:16px;border-radius:4px;background:#9AA0A6;display:block"></span>Inbox (3)</div></div>
    </div>
  </div>`;

  // ---------- 3. TRAY ----------
  boards.tray = () => {
    const strips = (state) => [
      KIT.tray({ label: 'Windows 11, dark', bg: '#1F1F23', fg: '#fff', ours: KIT.img(P + `tray-white${state}-16.png`, 16) }),
      KIT.tray({ label: 'Windows 11, light', bg: '#EEF0F5', fg: '#1A1A1A', ours: KIT.img(P + `tray-black${state}-16.png`, 16) }),
      KIT.tray({ label: 'Mac menu bar, light', bg: '#E9E8EE', fg: '#1A1A1A', h: 26, ours: KIT.img(P + `tray-black${state}-16.png`, 16) }),
      KIT.tray({ label: 'Mac menu bar, dark', bg: '#2B2A30', fg: '#fff', h: 26, ours: KIT.img(P + `tray-white${state}-16.png`, 16) }),
      KIT.tray({ label: 'Linux (KDE), high-res', bg: '#232029', fg: '#fff', h: 44, ours: KIT.img(P + `tray-white${state}-24.png`, 24) }),
    ].join('');
    return `
  <div style="position:absolute;inset:0;background:${C.paper};${SANS}color:${C.ink}">
    <div style="position:absolute;left:64px;top:52px">${kicker('Say it &nbsp;·&nbsp; Next to the clock')}</div>
    <div style="position:absolute;left:64px;top:92px;${SERIF}font-size:52px;line-height:1.02;letter-spacing:-.02em;width:620px">It tells you what it's doing <em style="color:${C.grape}">without a word.</em></div>
    <div style="position:absolute;left:64px;top:224px;width:600px;font-size:16.5px;line-height:1.55;color:${C.mute}">One colour, like Wi-Fi and volume beside it: white on dark bars, black on light. Drawn pixel by pixel, so it stays sharp. The face changes with what YouCoded is doing.</div>
    <div style="position:absolute;left:64px;top:330px;width:600px;display:flex;flex-direction:column;gap:22px">
      ${KIT.label('Idle — actual size')}${strips('')}</div>
    <div style="position:absolute;right:64px;top:92px;width:620px;display:flex;flex-direction:column;gap:22px">
      ${KIT.label('16px, magnified 12×')}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
        ${[['', 'Listening'], ['-dots', 'Working'], ['-check', 'Done']].map(([s, n]) => `<div>
          ${KIT.magnify(P + `tray-white${s}-16.png`, 16, 12, '#1F1F23')}
          <div style="height:10px"></div>${KIT.magnify(P + `tray-black${s}-16.png`, 16, 12, '#EEF0F5')}
          <div style="${MONO}font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.mute};margin-top:10px">${n}</div></div>`).join('')}
      </div>
      ${KIT.label('Working — actual size')}
      ${KIT.tray({ label: 'Windows 11, dark', bg: '#1F1F23', fg: '#fff', ours: KIT.img(P + 'tray-white-dots-16.png', 16) })}
      ${KIT.tray({ label: 'Mac menu bar, light', bg: '#E9E8EE', fg: '#1A1A1A', h: 26, ours: KIT.img(P + 'tray-black-dots-16.png', 16) })}
    </div>
  </div>`;
  };

  // ---------- 4. HERO ----------
  boards.hero = () => `
  <div style="position:absolute;inset:0;background:${C.paper};${SANS}color:${C.ink};overflow:hidden">
    <div style="position:absolute;right:-120px;top:-140px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,#F1E8FF 0%,rgba(241,232,255,0) 68%)"></div>
    <!-- nav -->
    <div style="position:absolute;left:64px;right:64px;top:30px;height:56px;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:12px">${mascot({ size: 44 })}${wordmark(40, C.ink, null, 9, true)}</div>
      <div style="display:flex;gap:34px;align-items:center;font-size:16px;font-weight:500">
        <span>Features</span><span>Themes</span><span>Skills</span><span>Help</span>
        <span style="background:${C.ink};color:#fff;padding:11px 20px;border-radius:999px;font-weight:600">Download</span></div>
    </div>
    <!-- copy -->
    <div style="position:absolute;left:64px;top:236px;width:640px">
      ${kicker('Free · Easy · Open source', C.grape)}
      <div style="${SERIF}font-weight:400;font-size:104px;line-height:.96;letter-spacing:-.035em;margin-top:22px">An assistant that's <em style="font-style:italic;color:${C.grape}">yours.</em></div>
      <div style="font-size:22px;line-height:1.5;color:#4C4560;margin-top:30px;width:540px">An AI agent you own and shape. Use any AI model from any provider to work and build your way.</div>
      <div style="display:flex;gap:14px;margin-top:38px;align-items:center">
        <span style="background:${C.grape};color:#fff;padding:18px 28px;border-radius:999px;font-size:18px;font-weight:600;box-shadow:0 14px 30px -10px rgba(107,58,214,.6)">Download for Windows</span>
        <span style="border:2px solid ${C.ink};padding:16px 26px;border-radius:999px;font-size:18px;font-weight:600">See it work</span></div>
      <div style="${MONO}font-size:12px;color:${C.mute};margin-top:20px;letter-spacing:.06em">Windows · Mac · Linux · Android</div>
    </div>
    <!-- the conversation -->
    <div style="position:absolute;left:790px;top:150px;width:560px;display:flex;flex-direction:column;gap:32px">
      <div style="align-self:flex-end">${bub(`<div style="font-size:18px">Plan my week around finals</div>`, { bg: C.ink, fg: '#fff', side: 'r', pad: '16px 22px' })}</div>
      <div style="display:flex;gap:14px;align-items:flex-end">
        <div style="margin-bottom:-14px">${mascot({ size: 54, face: 'happy' })}</div>
        ${bub(`<div style="font-size:17px;line-height:1.45;margin-bottom:14px">Here's your week. Exams first, Sunday kept free.</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:14px">
            ${[['Mon', 'Statistics exam', C.gum], ['Wed', 'Biology review', C.mint], ['Thu', 'History essay due', C.butter], ['Sun', 'Nothing. Rest.', '#EDE7F7']].map(([d, t, c]) => `<div style="display:flex;gap:12px;align-items:center;background:${c};border-radius:12px;padding:9px 14px"><b style="${MONO}font-size:12px;width:34px">${d}</b>${t}</div>`).join('')}
          </div>`, { bg: '#fff', w: '400px' })}
      </div>
      <div style="align-self:flex-end">${bub(`<div style="font-size:18px">Now make it feel calmer</div>`, { bg: C.ink, fg: '#fff', side: 'r', pad: '16px 22px' })}</div>
      <div style="display:flex;gap:14px;align-items:flex-end">
        <div style="margin-bottom:-14px">${mascot({ size: 54, face: 'dots' })}</div>
        ${bub(`<div style="display:flex;gap:8px;padding:4px 2px">${[0, 1, 2].map(i => `<span style="width:11px;height:11px;border-radius:50%;background:${C.grape};opacity:${[1, .6, .3][i]}"></span>`).join('')}</div>`, { bg: '#fff', pad: '16px 20px' })}
      </div>
    </div>
    <div style="position:absolute;right:92px;bottom:40px;width:170px;height:16px;border-radius:50%;background:rgba(28,23,48,.10);filter:blur(4px)"></div><div style="position:absolute;right:70px;bottom:44px">${mascot({ size: 200, fill: C.mint, faceColor: C.ink, face: 'wink', wave: true })}</div>
  </div>`;

  // ---------- 5. DOCS ----------
  boards.docs = () => `
  <div style="position:absolute;inset:0;background:#fff;${SANS}color:${C.ink}">
    <div style="height:68px;border-bottom:1px solid #EEEAF3;display:flex;align-items:center;padding:0 40px;gap:22px">
      ${wordmark(30, C.ink)}<span style="${SERIF_TXT}font-size:19px;color:${C.mute};font-style:italic;margin-left:-4px">help</span>
      <div style="margin-left:40px;flex:0 0 380px;height:38px;border-radius:999px;background:#F6F3FA;display:flex;align-items:center;padding:0 16px;font-size:14px;color:#9A93AA">Search help…<span style="margin-left:auto;${MONO}font-size:11px;border:1px solid #DDD6E8;border-radius:5px;padding:1px 6px">/</span></div>
      <span style="margin-left:auto;font-size:14px;font-weight:500">Back to youcoded</span>
    </div>
    <div style="position:absolute;left:0;top:68px;bottom:0;width:270px;background:${C.paper};border-right:1px solid #F1ECE4;padding:34px 34px;font-size:14.5px;line-height:2.25;color:#4C4560">
      <div style="${MONO}font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${C.mute};margin-bottom:6px">Help</div>
      Getting started<br>Models and providers<br>Themes<br>Skills<br>
      <span style="display:block;margin:2px -14px;padding:0 14px;border-radius:10px;background:#EDE5FF;color:${C.grapeDeep};font-weight:600">Privacy and data</span>
      Your files<br>Troubleshooting</div>
    <div style="position:absolute;left:350px;top:116px;width:700px">
      <div style="${MONO}font-size:12px;color:${C.mute};letter-spacing:.06em">Help &nbsp;/&nbsp; Privacy and data</div>
      <div style="${SERIF}font-size:60px;font-weight:400;letter-spacing:-.025em;line-height:1.05;margin-top:14px">Privacy and data</div>
      <div style="font-size:19px;line-height:1.6;color:#4C4560;margin-top:16px">Where your conversations are kept, and what leaves your computer when you send a message.</div>
      <div style="margin-top:30px;display:flex;gap:20px;align-items:flex-start;background:${C.paper};border:1px solid #EFE8DC;border-radius:22px;padding:22px 26px">
        ${mascot({ size: 46, fill: C.ink, face: 'eyes', faceColor: C.paper })}
        <div style="font-size:15.5px;line-height:1.65"><b>In short</b><br>Your conversations are stored on this device. A message goes to the AI provider <em>you</em> picked, when you send it.</div></div>
      <div style="${SERIF_TXT}font-size:27px;font-weight:500;margin-top:38px">Where your conversations live</div>
      <div style="font-size:16px;line-height:1.7;color:#3D3750;margin-top:10px">Conversations and settings are saved in a folder in your home directory. You can open it, back it up or delete it like any other folder.</div>
      <div style="${MONO}font-size:14px;background:#F6F3FA;border-radius:12px;padding:14px 18px;margin-top:14px;color:${C.ink}">~/.youcoded/</div>
      <div style="${SERIF_TXT}font-size:27px;font-weight:500;margin-top:34px">What leaves your device</div>
      <div style="display:flex;align-items:center;gap:18px;margin-top:16px;font-size:14.5px">
        <div style="border:1.5px solid ${C.ink};border-radius:16px;padding:12px 18px">Your computer</div>
        <svg width="150" height="24" viewBox="0 0 150 24"><path d="M2 12 H140" stroke="${C.grape}" stroke-width="2.5" stroke-dasharray="2 7" stroke-linecap="round"/><path d="M132 5 L142 12 L132 19" fill="none" stroke="${C.grape}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div style="background:${C.grape};color:#fff;border-radius:16px;padding:12px 18px">The AI provider you chose</div></div>
    </div>
    <div style="position:absolute;right:56px;top:150px;width:220px;font-size:13.5px;line-height:2.1;color:${C.mute}">
      <div style="${MONO}font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:4px">On this page</div>
      <span style="color:${C.grape};font-weight:600">In short</span><br>Where conversations live<br>What leaves your device<br>Deleting everything</div>
  </div>`;

  // ---------- 6. THEMES ----------
  // Pixel version of the mascot, sampled from the same geometry on a 16-grid (Terminal skin).
  function pixelMascot(size, on, off) {
    const inBody = (x, y) => { const rx = 18, x0 = 4, y0 = 4, x1 = 60, y1 = 48; if (x < x0 || x > x1 || y < y0 || y > y1) return false;
      const cx = Math.min(Math.max(x, x0 + rx), x1 - rx), cy = Math.min(Math.max(y, y0 + rx), y1 - rx); return (x - cx) ** 2 + (y - cy) ** 2 <= rx * rx; };
    const inTail = (x, y) => { const s = (ax, ay, bx, by) => (bx - ax) * (y - ay) - (by - ay) * (x - ax); const a = s(8, 36, 8, 59), b = s(8, 59, 30, 46), c = s(30, 46, 8, 36); return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0); };
    const inFoot = (x, y) => x >= 40 && x <= 52 && y >= 40 && y <= 56;
    const inEye = (x, y) => y >= 16 && y <= 30 && ((x >= 20 && x <= 28) || (x >= 36 && x <= 44));
    let r = '';
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const x = i * 4 + 2, y = j * 4 + 2;
      if ((inBody(x, y) || inTail(x, y) || inFoot(x, y)) && !inEye(x, y)) r += `<rect x="${i}" y="${j}" width=".92" height=".92" fill="${on}"/>`;
      else if (inEye(x, y)) r += `<rect x="${i}" y="${j}" width=".92" height=".92" fill="${off}"/>`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" style="display:block;filter:drop-shadow(0 0 10px ${on})">${r}</svg>`;
  }
  boards.themes = () => {
    const id = () => 'p' + (uid++);
    const dots = (pid, col) => `<defs><pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.25" fill="${col}"/></pattern></defs>`;
    const p1 = id(), p2 = id();
    const cards = [
      { name: 'Default', bg: '#EFE7FF', fg: C.ink, font: SERIF, art: mascot({ size: 170, face: 'eyes' }), msg: 'Hi! What are we making?', bub: '#fff' },
      { name: 'Midnight', bg: '#120E22', fg: '#E9E4FF', font: SERIF, art: mascot({ size: 170, fill: '#120E22', stroke: C.mint, sw: 3.5, face: 'eyes', faceColor: C.mint, style: `filter:drop-shadow(0 0 14px ${C.mint}88)` }), msg: 'Still up? Me too.', bub: '#231C3D', extra: `<div style="position:absolute;inset:0;background-image:radial-gradient(2px 2px at 12% 18%,#fff,transparent),radial-gradient(2px 2px at 48% 12%,#fffc,transparent),radial-gradient(1.5px 1.5px at 62% 82%,#fffa,transparent),radial-gradient(1.5px 1.5px at 30% 88%,#fffa,transparent),radial-gradient(2px 2px at 88% 70%,#fffc,transparent),radial-gradient(1.5px 1.5px at 8% 60%,#fff9,transparent)"></div>` },
      { name: 'Strawberry', bg: '#FFE1EA', fg: '#7A1532', font: "font-family:'Rubik';font-weight:700;", art: mascot({ size: 170, fill: '#F2365B', faceColor: '#fff', face: 'happy', extra: `<g fill="#FFD9A0">${[[14, 12], [50, 11], [10, 38], [54, 36], [30, 42]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.4"/>`).join('')}</g><path d="M32 6 C26 -4 18 -2 14 2 C20 2 26 4 32 6 C38 4 44 2 50 2 C46 -2 38 -4 32 6Z" fill="#2FA35B"/>` }), msg: 'berry nice to meet you', bub: '#fff' },
      { name: 'Comic', bg: '#FFE45C', fg: '#111', font: "font-family:'Rubik';font-weight:900;text-transform:uppercase;letter-spacing:.02em;", art: mascot({ size: 170, fill: '#fff', stroke: '#111', sw: 4, face: 'eyes', faceColor: '#111', under: dots(p1, '#FF5A7A'), extra: `<defs><clipPath id="${p2}"><rect x="4" y="4" width="56" height="44" rx="18"/></clipPath></defs><g clip-path="url(#${p2})"><circle cx="64" cy="52" r="30" fill="url(#${p1})"/></g>` }), msg: 'Pow! Done.', bub: '#fff', border: 'border:3px solid #111;' },
      { name: 'Notebook', bg: '#FDFBF4', fg: '#24408E', font: "font-family:'Fraunces';font-style:italic;font-variation-settings:'SOFT' 100,'opsz' 24;", art: mascot({ size: 170, fill: '#FDFBF4', stroke: '#2C4FB8', sw: 2.2, face: 'eyes', faceColor: '#2C4FB8', style: 'transform:rotate(-4deg)' }), msg: 'let me jot that down', bub: '#fff', extra: `<div style="position:absolute;inset:0;background:repeating-linear-gradient(#FDFBF4 0 27px,#C9D6F2 27px 28px)"></div><div style="position:absolute;left:44px;top:0;bottom:0;width:2px;background:#F3A6A6"></div>` },
      { name: 'Terminal', bg: '#07110B', fg: '#6DFF9C', font: "font-family:'JetBrains Mono';", art: pixelMascot(160, '#6DFF9C', '#07110B'), msg: '&gt; ready_', bub: '#0F2418' },
    ];
    return `
  <div style="position:absolute;inset:0;background:${C.paper};${SANS}color:${C.ink}">
    <div style="position:absolute;left:64px;top:52px">${kicker('Say it &nbsp;·&nbsp; With your themes')}</div>
    <div style="position:absolute;left:64px;top:90px;${SERIF}font-size:56px;letter-spacing:-.025em;line-height:1">Same voice. <em style="color:${C.grape}">Any outfit.</em></div>
    <div style="position:absolute;right:64px;top:96px;width:640px;font-size:15.5px;line-height:1.6;color:#4C4560">
      <b style="color:${C.ink}">Never changes:</b> the bubble, the tail it stands on, the nub foot, a face up top.<br>
      <b style="color:${C.ink}">Yours to change:</b> colour, texture, line, expression, accessories, and the font it speaks in.</div>
    <div style="position:absolute;left:64px;right:64px;top:210px;bottom:52px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:22px">
      ${cards.map(c => `<div style="position:relative;border-radius:26px;overflow:hidden;background:${c.bg};color:${c.fg};${c.border || ''}">
        ${c.extra || ''}
        <div style="position:absolute;left:30px;top:50%;transform:translateY(-50%)">${c.art}</div>
        <div style="position:absolute;right:26px;top:44px;max-width:200px">${bub(`<div style="${c.font}font-size:19px;line-height:1.2;color:${c.fg === '#E9E4FF' || c.fg === '#6DFF9C' ? c.fg : c.fg}">${c.msg}</div>`, { bg: c.bub, fg: c.fg, side: 'l', pad: '14px 18px', r: 22, shadow: c.name !== 'Terminal' && c.name !== 'Midnight', border: c.border || '' })}</div>
        <div style="position:absolute;right:26px;bottom:20px;${MONO}font-size:11.5px;letter-spacing:.16em;text-transform:uppercase;opacity:.7">${c.name}</div>
      </div>`).join('')}
    </div>
  </div>`;
  };

  window.TERR = { id: 'bubble', name: 'Say it', boards };
})();
