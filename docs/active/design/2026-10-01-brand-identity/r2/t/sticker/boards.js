// boards.js — the six 1440x900 boards of the "Stick it anywhere" territory.
// Loads stk.js first (the shared drawing kit), so every board returns a Promise; board.html
// waits on it. Paths are relative to r2/, where board.html lives.
(function () {
  const ready = new Promise(r => { const s = document.createElement('script'); s.src = 't/sticker/stk.js'; s.onload = r; document.head.append(s); });
  const P = 't/sticker/png/';
  const mono = (t, c = '#17131F', o = .55, size = 11) => `<div style="font:500 ${size}px/1.3 'JetBrains Mono';letter-spacing:.14em;text-transform:uppercase;color:${c};opacity:${o}">${t}</div>`;
  const page = (inner, bg = '#FFF6E9', grain = true) => `<div style="position:absolute;inset:0;background:${bg};font-family:'Rubik',sans-serif;color:#17131F;overflow:hidden">${grain ? STK.grain(.5) : ''}${inner}</div>`;
  const at = (x, y, html, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;${extra}">${html}</div>`;

  // The six theme stickers every board draws from — the "collect them all" set.
  const THEMES = () => {
    const C = STK.C;
    return [
      { name: 'Grape Soda', note: 'the default', o: { body: C.grape, line: C.grapeDeep, kind: 'happy' } },
      { name: 'Sunbreak', note: 'Golden hour', o: { body: '#FFC531', line: '#B66A00', kind: 'shades', acc: 'sun', cheek: null } },
      { name: 'Midnight Arcade', note: 'Neon on black', o: { body: '#221B33', line: '#0B0812', kind: 'glow', acc: 'antenna', cheek: null } },
      { name: 'Strawberry Milk', note: 'Soft & sweet', o: { body: '#FF8FB1', line: '#C23A64', kind: 'heart', acc: 'leaf', cheek: null } },
      { name: 'Matcha', note: 'Slow mornings', o: { body: '#7BC67E', line: '#2F6B3A', kind: 'sleepy', acc: 'cap', cheek: '#F28B82' } },
      { name: 'Halftone', note: 'Comic print', o: { body: '#3EC1F3', line: '#0D5A85', kind: 'squint', acc: 'star', pattern: 'dots' } },
    ];
  };

  const boards = {
    // ------------------------------------------------------------------ POSTER
    poster: () => {
      const C = STK.C, T = THEMES();
      const sheet = `<div style="position:absolute;left:44px;top:46px;width:800px;height:808px;border-radius:22px;background:#FFFDF8;transform:rotate(-1.2deg);box-shadow:0 2px 0 #E8DCC6,0 30px 60px -20px rgba(80,50,20,.35);overflow:hidden">
          <div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent 0 10px,rgba(201,180,143,.10) 10px 11px)"></div>
          ${at(28, 24, mono('Sheet Nº 01 — YouCoded originals', C.ink, .5))}
          ${at(560, 24, mono('Peel · Stick · Repeat', C.ink, .5))}
          ${at(18, 40, STK.mascot({ size: 380, tilt: -4 }))}
          ${at(392, 104, STK.wordmark(74, { tilt: -5 }))}
          ${at(470, 236, STK.badge('FREE', { bg: C.sun, tilt: 8, r: 999, pad: '30px 22px', font: "900 30px/1 'Rubik'", rim: 7 }))}
          ${at(606, 250, STK.badge('OPEN SOURCE', { bg: C.coral, fg: '#fff', tilt: -7, font: "900 20px/1 'Rubik'", pad: '14px 20px', rim: 7 }))}
          ${at(430, 340, STK.badge('ANY MODEL · ANY PROVIDER', { bg: C.sky, fg: C.ink, tilt: 3, font: "800 17px/1 'Rubik'", pad: '13px 18px', rim: 7 }))}
          ${at(560, 400, `<div style="width:190px;height:190px;border:2.5px dashed rgba(23,19,31,.28);border-radius:58px 58px 46px 46px;transform:rotate(8deg);display:grid;place-items:center;text-align:center">${mono('this one\'s<br>on your<br>laptop', C.ink, .45, 11)}</div>`)}
          ${at(70, 410, STK.mascot({ ...T[1].o, size: 190, tilt: -9 }))}
          ${at(300, 470, STK.badge('MADE<br>BY YOU', { bg: C.grape, fg: '#fff', tilt: -8, r: 999, pad: '30px 22px', font: "900 22px/1.05 'Rubik'", rim: 7, extra: 'text-align:center' }))}
          ${T.slice(2).map((t, i) => at(26 + i * 152, 618, STK.mascot({ ...t.o, size: 150, tilt: [6, -5, 7, -8][i] }))).join('')}
          ${T.slice(2).map((t, i) => at(40 + i * 152, 772, mono(t.name, C.ink, .5, 10))).join('')}
          ${at(650, 640, STK.badge('★', { bg: C.sun, tilt: 14, font: "900 46px/1 'Rubik'", pad: '18px 22px', rim: 7 }))}
        </div>`;
      const sw = (hex, name, fg = '#17131F') => `<div style="text-align:center"><div style="width:74px;height:74px;border-radius:50%;background:${hex};box-shadow:0 0 0 5px #fff,0 6px 14px rgba(42,26,61,.25);margin:0 auto 12px"></div><div style="font:700 13px 'Rubik'">${name}</div><div style="font:400 11px 'JetBrains Mono';opacity:.55">${hex}</div></div>`;
      const right = `<div style="position:absolute;left:900px;top:58px;width:500px">
          ${mono('Direction 03 · Sticker')}
          <div style="font:900 74px/.95 'Rubik';letter-spacing:-.035em;margin:16px 0 18px">Stick it<br><span style="color:${C.grape}">anywhere.</span></div>
          <div style="font:400 18px/1.5 'Rubik';opacity:.82">YouCoded is yours the way your laptop is yours: covered in things you chose. The logo is a sticker. Every theme is another one — collect them, swap them, make your own.</div>
          <div style="display:flex;gap:22px;margin:34px 0 34px">${sw(C.grape, 'Grape')}${sw(C.sun, 'Sunshine')}${sw(C.coral, 'Coral')}${sw(C.sky, 'Sky')}${sw(C.ink, 'Ink')}</div>
          <div style="display:flex;gap:26px;align-items:flex-end;border-top:2px solid #17131F;padding-top:20px">
            <div style="font:900 104px/0.8 'Rubik';letter-spacing:-.04em">Aa</div>
            <div style="padding-bottom:4px"><div style="font:900 20px 'Rubik'">Rubik Black — headlines</div><div style="font:400 16px/1.5 'Rubik';opacity:.8">Rubik Regular for reading</div><div style="font:400 13px 'JetBrains Mono';opacity:.7;margin-top:4px">JetBrains Mono for code</div></div>
          </div>
          <div style="display:flex;gap:26px;align-items:center;margin-top:30px">
            <img src="${P}icon-256.png" width="150" height="150" style="transform:rotate(-6deg);filter:drop-shadow(0 10px 16px rgba(42,26,61,.25))">
            <div style="display:grid;grid-template-columns:auto 1fr;gap:9px 12px;font:500 15.5px 'Rubik'">
              ${[['01', 'A white die-cut edge'], ['02', 'One corner peeling up'], ['03', 'A little tilt, never straight'], ['04', 'Collect them all']].map(([n, t]) => `<span style="font:700 12px/1.6 'JetBrains Mono';color:${C.grape}">${n}</span><span>${t}</span>`).join('')}
            </div>
          </div>
        </div>`;
      return page(sheet + right);
    },

    // ------------------------------------------------------------------ ICON
    icon: () => {
      const C = STK.C;
      const left = `<div style="position:absolute;left:0;top:0;width:600px;height:900px;background:radial-gradient(circle at 50% 38%,#FFF1C9,#FFE08A 70%);overflow:hidden">
          ${STK.grain(.45)}
          ${at(48, 44, mono('App icon · 512px'))}
          ${at(80, 96, `<img src="${P}icon-512.png" width="440" height="440" style="display:block;filter:drop-shadow(0 26px 30px rgba(120,70,0,.28))">`)}
          ${at(48, 600, mono('Real sizes · 32px and under use a simpler drawing'))}
          <div style="position:absolute;left:48px;top:636px;display:flex;gap:30px;align-items:flex-end">
            ${[128, 64, 32, 24, 16].map(px => `<div style="text-align:center"><img src="${P}icon-${px}.png" width="${px}" height="${px}" style="display:block;margin:0 auto">${mono(px + 'px', C.ink, .5, 10)}</div>`).join('')}
          </div>
          ${at(48, 830, `<div style="font:400 15px/1.4 'Rubik';opacity:.75;width:500px">Sunshine yellow is rare in a taskbar — it is the one icon your eye finds first.</div>`)}
        </div>`;
      const wall = `<div style="position:absolute;left:600px;top:0;width:840px;height:330px;background:linear-gradient(135deg,#8E6CF0 0%,#D97AB8 55%,#FFB27A 100%);overflow:hidden">
          ${at(40, 34, mono('Mac Dock', '#fff', .8))}
          <div style="position:absolute;left:0;right:0;bottom:36px;display:flex;justify-content:center">${KIT.dock({ ours: KIT.img(P + 'icon-64.png', 60), size: 60 })}</div>
        </div>`;
      const right = `<div style="position:absolute;left:640px;top:360px;width:760px">
          ${mono('Windows taskbar — dark, then light')}
          <div style="display:flex;flex-direction:column;gap:12px;margin:12px 0 30px">
            ${KIT.taskbar({ bg: '#1F1F23', ours: KIT.img(P + 'icon-24.png', 24) })}
            ${KIT.taskbar({ bg: '#EEF0F5', ours: KIT.img(P + 'icon-24.png', 24) })}
          </div>
          ${mono('Installer, in Downloads — "peel to install"')}
          <div style="margin-top:12px;background:#fff;border-radius:12px;box-shadow:0 1px 0 #E9DFCF,0 18px 40px -18px rgba(60,40,10,.35);overflow:hidden">
            <div style="height:36px;background:#F3F1EE;display:flex;align-items:center;gap:8px;padding:0 14px;font:500 13px 'Segoe UI','Rubik'"><span style="opacity:.5">‹ ›</span><span style="margin-left:10px">Downloads</span></div>
            <div style="display:flex;gap:44px;padding:24px 34px 22px;align-items:flex-start">
              ${[['#E8453C', 'Lease-2026.pdf'], ['#F5A623', 'photos-june.zip']].map(([c, n]) => `<div style="width:120px;text-align:center"><div style="width:72px;height:88px;margin:8px auto 10px;border-radius:6px;background:#fff;border:1.5px solid #D9D6D0;position:relative"><div style="position:absolute;left:10px;bottom:12px;padding:3px 6px;border-radius:3px;background:${c};font:700 10px 'Segoe UI';color:#fff">${n.split('.').pop().toUpperCase()}</div></div><div style="font:400 12.5px 'Segoe UI','Rubik'">${n}</div></div>`).join('')}
              <div style="width:150px;text-align:center"><div style="background:#E6F0FB;border-radius:6px;padding:6px 6px 8px;outline:1px solid #B7D3F2"><img src="${P}installer-128.png" width="104" height="104" style="display:block;margin:0 auto 6px"><div style="font:400 12.5px 'Segoe UI','Rubik'">YouCoded-Setup-1.3.1.exe</div></div></div>
              <div style="display:flex;gap:16px;align-items:flex-end;margin-left:auto;align-self:center">${[64, 32, 16].map(px => `<div style="text-align:center">${KIT.img(P + 'installer-' + px + '.png', px, 'margin:0 auto')}${mono(px + 'px', C.ink, .45, 10)}</div>`).join('')}</div>
            </div>
          </div>
        </div>`;
      return page(left + wall + right, '#FFF6E9');
    },

    // ------------------------------------------------------------------ TRAY
    tray: () => {
      const C = STK.C;
      const ours = (c, px) => KIT.img(`${P}tray-${c}-${px}.png`, px);
      const strips = `<div style="position:absolute;left:60px;top:200px;width:800px;display:flex;flex-direction:column;gap:22px">
          ${KIT.tray({ label: 'Windows 11 · dark taskbar', bg: '#1F1F23', fg: '#fff', ours: ours('white', 16), h: 48 })}
          ${KIT.tray({ label: 'Windows 11 · light taskbar', bg: '#EEF0F5', fg: '#1A1A1A', ours: ours('black', 16), h: 48 })}
          ${KIT.tray({ label: 'Mac menu bar · light', bg: '#E9E8EE', fg: '#1A1A1A', ours: ours('black', 16), h: 26 })}
          ${KIT.tray({ label: 'Mac menu bar · dark', bg: '#2B2A30', fg: '#fff', ours: ours('white', 16), h: 26 })}
          ${KIT.tray({ label: 'Linux (KDE) · high-res, 24px', bg: '#232029', fg: '#fff', ours: ours('white', 24), h: 44 })}
        </div>`;
      const head = `<div style="position:absolute;left:60px;top:56px;width:800px">
          ${mono('Tray icon · next to the clock')}
          <div style="font:900 52px/1 'Rubik';letter-spacing:-.03em;margin-top:14px">Still waving at <span style="color:${C.grape}">16 pixels.</span></div>
        </div>`;
      const mag = `<div style="position:absolute;left:920px;top:0;width:520px;height:900px;background:#17131F;color:#fff;padding:56px 50px;overflow:hidden">
          ${mono('16px, magnified 12×', '#fff', .6)}
          <div style="display:flex;gap:18px;margin:16px 0 30px">${KIT.magnify(P + 'tray-white-16.png', 16, 12, '#2B2A30')}${KIT.magnify(P + 'tray-black-16.png', 16, 12, '#EEF0F5')}</div>
          ${mono('24px, magnified 8×', '#fff', .6)}
          <div style="display:flex;gap:18px;margin:16px 0 30px">${KIT.magnify(P + 'tray-white-24.png', 24, 8, '#2B2A30')}${KIT.magnify(P + 'tray-black-24.png', 24, 8, '#EEF0F5')}</div>
          <div style="font:400 16px/1.55 'Rubik';opacity:.82">Drawn square-by-square on the pixel grid — not the sticker shrunk. One colour, like Wi-Fi and volume beside it. The raised right arm is the wave; it survives at every size.</div>
          <div style="margin-top:44px;display:flex;align-items:flex-end;gap:22px">
            ${[['mascot-128', 112, 'Sticker'], ['icon-64', 64, 'App icon'], ['tray-white-16', 16, 'Tray']].map(([f, w, l], i) => `${i ? '<span style="font:300 26px Rubik;opacity:.4;margin-bottom:34px">→</span>' : ''}<div style="text-align:center">${KIT.img(P + f + '.png', w, 'margin:0 auto')}<div style="font:500 11px 'JetBrains Mono';letter-spacing:.12em;text-transform:uppercase;opacity:.6;margin-top:12px">${l}</div></div>`).join('')}
          </div>
        </div>`;
      // Two states at 4x: the plain glyph, and the same glyph with a coral dot when YouCoded needs you.
      const st = (dot, label) => `<div style="text-align:center"><div style="position:relative;width:96px;height:96px;margin:0 auto">${KIT.magnify(P + 'tray-white-24.png', 24, 4, '#1F1F23')}${dot ? `<span style="position:absolute;left:6px;top:6px;width:22px;height:22px;border-radius:50%;background:${C.coral};box-shadow:0 0 0 4px #1F1F23"></span>` : ''}</div><div style="font:600 14px 'Rubik';margin-top:10px">${label}</div></div>`;
      const states = at(60, 640, `${mono('States')}<div style="display:flex;gap:30px;margin-top:14px">${st(false, 'Ready')}${st(true, 'Needs you')}</div>`);
      const note = at(400, 690, `<div style="display:flex;gap:28px;align-items:center">${STK.mascot({ size: 96, tilt: -6 })}<div style="font:400 16px/1.5 'Rubik';width:340px;opacity:.8">The full-colour sticker stays on the taskbar and in the Dock. Next to the clock it becomes a plain silhouette — same body, same wave.</div></div>`);
      return page(head + strips + states + note + mag);
    },

    // ------------------------------------------------------------------ HERO
    hero: () => {
      const C = STK.C, T = THEMES();
      const nav = `<div style="position:absolute;left:0;right:0;top:0;height:92px;display:flex;align-items:center;padding:0 64px;gap:40px">
          <div style="display:flex;align-items:center;gap:6px">${STK.mascot({ size: 58, rim: 2, tilt: -6 })}${STK.wordmark(34, { tilt: 0, rim: 6 })}</div>
          <div style="display:flex;gap:34px;font:500 16.5px 'Rubik';margin-left:30px">${['Themes', 'Skills', 'Docs', 'GitHub'].map(l => `<span>${l}</span>`).join('')}</div>
          <span style="margin-left:auto;font:700 15.5px 'Rubik';background:#17131F;color:#fff;padding:13px 22px;border-radius:999px">Download</span>
        </div>`;
      const copy = `<div style="position:absolute;left:64px;top:170px;width:720px">
          <div style="font:600 13px 'JetBrains Mono';letter-spacing:.2em;opacity:.7">FREE · EASY · OPEN SOURCE</div>
          <div style="font:900 108px/.92 'Rubik';letter-spacing:-.045em;margin:22px 0 0">An assistant<br>that's</div>
          <div style="margin:4px 0 0 -6px">${STK.badge('yours.', { bg: C.coral, fg: '#fff', tilt: -4, r: 26, pad: '2px 26px 16px', font: "900 112px/1 'Rubik'", rim: 10, extra: 'letter-spacing:-.045em' })}</div>
          <div style="font:400 22px/1.5 'Rubik';opacity:.8;margin:36px 0 34px;width:600px">An AI agent you own and shape. Use any AI model from any provider to work and build your way.</div>
          <div style="display:flex;align-items:center;gap:30px">
            ${STK.badge('Download for Windows', { bg: C.grape, fg: '#fff', tilt: 0, font: "800 19px/1 'Rubik'", pad: '20px 30px', rim: 5 })}
            <span style="font:700 17px 'Rubik';border-bottom:3px solid ${C.sun};padding-bottom:3px">Browse themes →</span>
          </div>
          <div style="font:500 12.5px 'JetBrains Mono';letter-spacing:.08em;opacity:.5;margin-top:22px">MAC · WINDOWS · LINUX · ANDROID</div>
        </div>`;
      // The laptop lid, seen from behind — the territory's whole idea in one picture.
      const lid = `<div style="position:absolute;left:820px;top:150px;width:600px;height:640px;transform:rotate(5deg)">
          <div style="position:absolute;inset:0;border-radius:34px;background:linear-gradient(145deg,#4A4655,#2A2733 60%,#211E28);box-shadow:inset 0 2px 0 rgba(255,255,255,.12),0 50px 80px -30px rgba(30,20,40,.55)"></div>
          ${at(70, 40, STK.mascot({ size: 300, tilt: -8 }))}
          ${at(330, 60, STK.mascot({ ...T[3].o, size: 190, tilt: 12 }))}
          ${at(300, 260, STK.badge('ANY MODEL', { bg: C.sky, tilt: -10, font: "900 26px/1 'Rubik'", pad: '16px 22px', rim: 8 }))}
          ${at(40, 340, STK.wordmark(66, { tilt: 6 }))}
          ${at(350, 360, STK.mascot({ ...T[2].o, size: 200, tilt: -6 }))}
          ${at(60, 450, STK.mascot({ ...T[1].o, size: 170, tilt: 9 }))}
          ${at(230, 500, STK.badge('OPEN SOURCE', { bg: C.sun, tilt: 4, font: "900 22px/1 'Rubik'", pad: '14px 20px', rim: 8 }))}
          ${at(470, 560, STK.mascot({ ...T[5].o, size: 150, tilt: -14 }))}
        </div>`;
      return page(lid + nav + copy);
    },

    // ------------------------------------------------------------------ DOCS
    docs: () => {
      const C = STK.C;
      const nav = `<div style="position:absolute;left:0;right:0;top:0;height:66px;border-bottom:1px solid #EEE6D8;background:#FFFDF8;display:flex;align-items:center;padding:0 28px;gap:16px">
          <div style="display:flex;align-items:center;gap:4px">${STK.mascot({ size: 40, rim: 2, shadow: false })}<span style="font:800 21px 'Rubik';letter-spacing:-.02em"><span style="color:${C.grape}">You</span>Coded</span></div>
          <span style="font:500 12px 'JetBrains Mono';letter-spacing:.1em;padding:4px 8px;border-radius:6px;background:#F3ECDF;opacity:.8">DOCS</span>
          <div style="margin-left:60px;width:380px;height:38px;border-radius:10px;border:1px solid #E6DCCB;background:#fff;display:flex;align-items:center;padding:0 14px;font:400 14.5px 'Rubik';color:#8A8296">Search the docs<span style="margin-left:auto;font:500 11px 'JetBrains Mono';opacity:.7">Ctrl K</span></div>
          <span style="margin-left:auto;font:500 15px 'Rubik';opacity:.75">GitHub</span><span style="font:700 14.5px 'Rubik';background:#17131F;color:#fff;padding:10px 18px;border-radius:999px">Download</span>
        </div>`;
      const side = `<div style="position:absolute;left:0;top:66px;bottom:0;width:272px;background:#FBF6EE;border-right:1px solid #EEE6D8;padding:30px 22px">
          ${[['Get started', ['Install', 'Your first conversation', 'Choosing a model']], ['Make it yours', ['Themes', 'Skills', 'Your buddy']], ['Trust', ['Privacy & Data', 'Where your files live', 'Updates']]].map(([g, items]) =>
            `<div style="margin-bottom:26px">${mono(g, C.ink, .45, 10.5)}<div style="margin-top:10px;display:flex;flex-direction:column;gap:2px">${items.map(i => i === 'Privacy & Data'
              ? `<div style="font:600 15px 'Rubik';padding:8px 12px;border-radius:8px;background:#F0E7FF;color:${C.grapeDeep};box-shadow:inset 3px 0 0 ${C.grape}">${i}</div>`
              : `<div style="font:400 15px 'Rubik';padding:8px 12px;opacity:.78">${i}</div>`).join('')}</div></div>`).join('')}
        </div>`;
      const td = 'padding:13px 16px;border-bottom:1px solid #EEE6D8;vertical-align:top';
      const main = `<div style="position:absolute;left:340px;top:66px;width:700px;padding-top:36px">
          ${mono('Docs / Trust / Privacy & Data', C.ink, .5, 11)}
          <div style="font:800 50px/1.05 'Rubik';letter-spacing:-.03em;margin:16px 0 10px">Privacy &amp; Data</div>
          <div style="font:400 14px 'Rubik';opacity:.55">Updated 1 October 2026 · 3 min read</div>
          <div style="position:relative;margin:28px 0 30px;background:#FFF4D6;border-radius:14px;padding:22px 26px 20px;clip-path:polygon(0 0,100% 0,100% calc(100% - 26px),calc(100% - 26px) 100%,0 100%)">
            <div style="position:absolute;right:0;bottom:0;width:26px;height:26px;background:linear-gradient(315deg,transparent 50%,#E6D3A6 50%);border-radius:0 0 0 6px;box-shadow:-2px -2px 4px rgba(120,90,30,.15)"></div>
            <div style="font:700 16px 'Rubik';margin-bottom:10px">The short version</div>
            <ul style="font:400 15.5px/1.65 'Rubik';padding-left:20px;opacity:.88">
              <li>Your conversations are stored on this device.</li>
              <li>A message goes to the model provider you picked, when you send it.</li>
              <li>Your settings live in a folder you can open: <code style="font:500 13.5px 'JetBrains Mono';background:#fff;padding:2px 6px;border-radius:5px">~/.youcoded/</code></li>
            </ul>
          </div>
          <div style="font:700 25px 'Rubik';letter-spacing:-.015em;margin-bottom:10px">What stays on your device</div>
          <div style="font:400 16px/1.7 'Rubik';opacity:.85;margin-bottom:16px">Your conversations are saved on this computer. Your settings live in one folder you can open, back up or move like any other.</div>
          <div style="font:400 14px/1.7 'JetBrains Mono';background:#17131F;color:#EDE6F7;border-radius:12px;padding:16px 20px;margin-bottom:26px"><span style="opacity:.5"># your settings</span><br>~/.youcoded/</div>
          <div style="font:700 25px 'Rubik';letter-spacing:-.015em;margin-bottom:12px">Who sees what</div>
          <table style="width:100%;border-collapse:collapse;font:400 15px/1.5 'Rubik'">
            <tr style="text-align:left;font:600 12px 'JetBrains Mono';letter-spacing:.08em;text-transform:uppercase;opacity:.55"><th style="${td}">What</th><th style="${td}">Stored</th><th style="${td}">Sent to</th></tr>
            <tr><td style="${td};font-weight:600">Conversations</td><td style="${td}">This device</td><td style="${td}">The model provider you picked, when you send a message</td></tr>
            <tr><td style="${td};font-weight:600">Settings</td><td style="${td}"><code style="font:500 13px 'JetBrains Mono'">~/.youcoded/</code></td><td style="${td}">—</td></tr>
          </table>
        </div>`;
      const toc = `<div style="position:absolute;left:1110px;top:126px;width:270px">
          ${mono('On this page', C.ink, .5, 10.5)}
          <div style="margin-top:12px;border-left:2px solid #EEE6D8;display:flex;flex-direction:column;gap:10px;padding-left:16px;font:400 14.5px 'Rubik'">
            <span style="color:${C.grape};font-weight:600;margin-left:-18px;padding-left:16px;border-left:2px solid ${C.grape}">The short version</span><span style="opacity:.7">What stays on your device</span><span style="opacity:.7">Who sees what</span></div>
          <div style="margin-top:56px;display:flex;flex-direction:column;align-items:flex-start;gap:10px">
            ${STK.mascot({ size: 120, kind: 'happy', tilt: 7 })}
            <div style="font:400 14px/1.5 'Rubik';opacity:.65;width:230px">Something unclear? Open an issue on GitHub and we'll fix the page.</div>
          </div>
        </div>`;
      return page(nav + side + main + toc, '#FFFDF8', false);
    },

    // ------------------------------------------------------------------ THEMES
    themes: () => {
      const C = STK.C, T = THEMES();
      const sheet = `<div style="position:absolute;left:46px;top:50px;width:800px;height:800px;border-radius:22px;background:#FFFDF8;transform:rotate(-1deg);box-shadow:0 2px 0 #E8DCC6,0 30px 60px -20px rgba(80,50,20,.35);overflow:hidden">
          <div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent 0 10px,rgba(201,180,143,.10) 10px 11px)"></div>
          ${at(30, 26, mono('Sheet Nº 02 — community themes', C.ink, .5))}
          ${T.map((t, i) => {
            const x = 30 + (i % 3) * 250, y = 64 + Math.floor(i / 3) * 250;
            return at(x, y, `<div style="width:230px;text-align:center">${STK.mascot({ ...t.o, size: 200, tilt: [-5, 6, -3, 7, -7, 4][i], extraStyle: 'margin:0 auto' })}<div style="font:800 16px 'Rubik';margin-top:2px">${t.name}</div>${mono(t.note, C.ink, .5, 10)}</div>`);
          }).join('')}
          ${at(30, 580, `<div style="width:230px;height:190px;border:2.5px dashed rgba(23,19,31,.3);border-radius:28px;display:grid;place-items:center;text-align:center"><div><div style="font:300 54px/1 'Rubik';opacity:.4">+</div><div style="font:800 16px 'Rubik';margin-top:8px">Your theme</div>${mono('describe it, we draw it', C.ink, .5, 10)}</div></div>`)}
          ${at(300, 600, STK.badge('COLLECT THEM ALL', { bg: C.sun, tilt: -6, font: "900 24px/1 'Rubik'", pad: '18px 24px', rim: 8 }))}
          ${at(560, 590, STK.mascot({ body: '#fff', line: C.ink, kind: 'stars', acc: 'star', size: 190, tilt: 10 }))}
        </div>`;
      const ok = (t) => `<div style="display:flex;gap:12px;align-items:flex-start;font:500 16.5px/1.4 'Rubik'"><span style="flex:none;width:24px;height:24px;border-radius:50%;background:${C.grape};color:#fff;display:grid;place-items:center;font:900 13px 'Rubik'">✓</span>${t}</div>`;
      const free = (t) => `<div style="display:flex;gap:12px;align-items:flex-start;font:500 16.5px/1.4 'Rubik'"><span style="flex:none;width:24px;height:24px;border-radius:50%;background:${C.sun};display:grid;place-items:center;font:900 14px 'Rubik'">✦</span>${t}</div>`;
      const rule = `<div style="position:absolute;left:900px;top:58px;width:490px">
          ${mono('How the logo flexes')}
          <div style="font:900 56px/.98 'Rubik';letter-spacing:-.035em;margin:14px 0 26px">Every theme is a <span style="color:${C.grape}">new sticker.</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px">
            <div><div style="font:900 15px 'Rubik';letter-spacing:.08em;margin-bottom:14px">ALWAYS</div><div style="display:flex;flex-direction:column;gap:12px">${ok('Square head, two feet')}${ok('One arm out, one waving')}${ok('The white die-cut edge')}</div></div>
            <div><div style="font:900 15px 'Rubik';letter-spacing:.08em;margin-bottom:14px">YOURS</div><div style="display:flex;flex-direction:column;gap:12px">${free('Colour or pattern')}${free('The face')}${free('One accessory on top')}</div></div>
          </div>
          <div style="margin-top:40px;border-top:2px solid #17131F;padding-top:22px;display:flex;gap:26px;align-items:center">
            <div style="position:relative;flex:none">${STK.mascot({ body: '#B9B3C4', line: '#8E879C', rim: 0, wave: false, kind: 'happy', cheek: null, size: 130, shadow: false, gloss: false })}
              <svg width="130" height="130" viewBox="0 0 130 130" style="position:absolute;inset:0"><path d="M24 24 L106 106 M106 24 L24 106" stroke="${C.coral}" stroke-width="10" stroke-linecap="round"/></svg></div>
            <div><div style="font:800 18px 'Rubik';margin-bottom:6px">Not one of ours</div><div style="font:400 15.5px/1.5 'Rubik';opacity:.8">No die-cut edge, no wave. A theme can change everything about the buddy except the things that make it a YouCoded sticker.</div></div>
          </div>
          <div style="margin-top:34px;background:#fff;border-radius:18px;padding:22px 24px;box-shadow:0 18px 40px -22px rgba(60,40,10,.4);display:flex;gap:18px;align-items:center">
            <div style="flex:1">${mono('Make your own — describe it')}<div style="font:500 19px/1.4 'Rubik';margin-top:10px">“a rainy café at night, lo-fi, a little sleepy”</div><div style="font:700 14px 'Rubik';color:${C.grape};margin-top:12px">→ your sticker</div></div>
            ${STK.mascot({ body: '#4D5B8C', line: '#222A4A', kind: 'sleepy', acc: 'cap', cheek: '#F2A08B', size: 140, tilt: 8 })}
          </div>
        </div>`;
      return page(sheet + rule);
    },
  };

  window.TERR = {
    id: 'sticker', name: 'Stick it anywhere',
    boards: Object.fromEntries(Object.entries(boards).map(([k, f]) => [k, () => ready.then(f)])),
  };
})();
