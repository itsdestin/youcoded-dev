// boards.js — territory "pixel": CHOOSE YOUR PLAYER. Six 1440x900 boards for the round-2 deck.
// Every sprite/icon comes from gen.mjs (pixel grids); this file only stages them. Sprites are
// always scaled by WHOLE numbers with image-rendering:pixelated, so a pixel never smears.
(() => {
  const B = 't/pixel/';
  const sv = (n) => `${B}svg/${n}.svg`, pn = (n, px) => `${B}png/${n}-${px}.png`;
  const P = { night: '#120E2A', deep: '#1E1747', dusk: '#2A1F66', rim: '#4B3A9E', volt: '#A970FF', voltD: '#7A3FF2', lime: '#C6FF4D', pink: '#FF6AD5', paper: '#F6F3EC', ink: '#15122B', mist: '#C9C2E8' };
  const SKINS = [
    ['volt', 'Volt', 'DEFAULT', '#2A1F66'], ['sunbreak', 'Sunbreak', 'INSTALLED', '#FFD97A'], ['matcha', 'Matcha', 'COMMUNITY', '#D9F2C4'], ['kitty', 'Strawberry Kitty', 'COMMUNITY', '#FFD3E1'],
    ['visor', 'Midnight Visor', 'NEW', '#0B1030'], ['chrome', 'Chrome', 'COMMUNITY', '#C9D0DB'], ['pocket', 'Pocket', 'RETRO', '#9BBC0F'], ['royal', 'Royal', 'RARE', '#3B0E3A'],
  ];
  const px = 'image-rendering:pixelated;display:block';
  const sprite = (name, scale, grid = 32, extra = '') => `<img src="${sv(name)}" width="${grid * scale}" height="${grid * scale}" style="${px};${extra}">`;
  // Wordmark grid is 82x12.
  const wm = (v, s, extra = '') => `<img src="${sv('wordmark-' + v)}" width="${82 * s}" height="${12 * s}" style="${px};${extra}">`;
  // Pixel-chamfer corners: two 1-unit steps, the territory's card shape.
  const step = (u) => `clip-path:polygon(0 ${2 * u}px,${u}px ${2 * u}px,${u}px ${u}px,${2 * u}px ${u}px,${2 * u}px 0,calc(100% - ${2 * u}px) 0,calc(100% - ${2 * u}px) ${u}px,calc(100% - ${u}px) ${u}px,calc(100% - ${u}px) ${2 * u}px,100% ${2 * u}px,100% calc(100% - ${2 * u}px),calc(100% - ${u}px) calc(100% - ${2 * u}px),calc(100% - ${u}px) calc(100% - ${u}px),calc(100% - ${2 * u}px) calc(100% - ${u}px),calc(100% - ${2 * u}px) 100%,${2 * u}px 100%,${2 * u}px calc(100% - ${u}px),${u}px calc(100% - ${u}px),${u}px calc(100% - ${2 * u}px),0 calc(100% - ${2 * u}px))`;
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  // An ordered-dither band from colour A (top) to B (bottom), drawn in `cell`-px pixels.
  function dither(w, h, cell, a, b, from = 0, to = 1) {
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    let r = '';
    for (let y = 0; y < rows; y++) {
      const v = (y / (rows - 1) - from) / (to - from);
      let x = 0;
      while (x < cols) {
        const on = (xx) => v > (BAYER[y % 4][xx % 4] + .5) / 16;
        if (!on(x)) { x++; continue; }
        let e = x; while (e + 1 < cols && on(e + 1)) e++;
        r += `<rect x="${x * cell}" y="${y * cell}" width="${(e - x + 1) * cell}" height="${cell}"/>`;
        x = e + 1;
      }
    }
    return `<svg width="${w}" height="${h}" style="display:block" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="${a}"/><g fill="${b}">${r}</g></svg>`;
  }
  // Deterministic pixel stars.
  // `avoid`: [x0,y0,x1,y1] zones kept clear — a star inside a word reads as a typo.
  function stars(w, h, n, seed = 7, avoid = [], colors = ['#fff', P.lime, P.pink, P.volt]) {
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let r = '';
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * w / 4) * 4, y = Math.floor(rnd() * h / 4) * 4, c = colors[Math.floor(rnd() * colors.length)], z = rnd() > .85 ? 8 : 4;
      if (avoid.some(([a, b, c2, d]) => x >= a && x <= c2 && y >= b && y <= d)) continue;
      r += `<rect x="${x}" y="${y}" width="${z}" height="${z}" fill="${c}" opacity="${(.35 + rnd() * .6).toFixed(2)}"/>`;
    }
    return `<svg width="${w}" height="${h}" style="position:absolute;inset:0;display:block" shape-rendering="crispEdges">${r}</svg>`;
  }
  // Character-select corner brackets around a positioned box.
  const brackets = (c = P.lime, len = 28, t = 6, pad = 0) => ['top:0;left:0', 'top:0;right:0', 'bottom:0;left:0', 'bottom:0;right:0'].map(pos => {
    const [v, h] = pos.split(';').map(p => p.split(':')[0]);
    return `<span style="position:absolute;${pos.replaceAll(':0', `:${-pad}px`)};width:${len}px;height:${len}px;border-${v}:${t}px solid ${c};border-${h}:${t}px solid ${c}"></span>`;
  }).join('');
  // A pixel ellipse the selected player stands on, in 6px cells.
  function pedestal(w, cell = 6) {
    const cols = Math.floor(w / cell), rows = 5; let r = '';
    for (let y = 0; y < rows; y++) {
      const t = (y + .5) / rows * 2 - 1, half = Math.round(cols / 2 * Math.sqrt(1 - t * t));
      const x0 = Math.floor(cols / 2) - half;
      r += `<rect x="${x0 * cell}" y="${y * cell}" width="${half * 2 * cell}" height="${cell}" fill="${y < 2 ? '#5B3FD0' : '#2E2180'}"/>`;
      if (y < 2) r += `<rect x="${x0 * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${P.lime}"/><rect x="${(x0 + half * 2 - 1) * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${P.lime}"/>`;
    }
    return `<svg width="${cols * cell}" height="${rows * cell}" style="display:block" shape-rendering="crispEdges">${r}</svg>`;
  }
  const sk = (t, c = P.lime, size = 12) => `<span style="font:400 ${size}px 'Silkscreen';letter-spacing:.06em;color:${c}">${t}</span>`;
  const chip = (t, bg, fg) => `<span style="display:inline-block;font:400 10px 'Silkscreen';letter-spacing:.06em;padding:5px 8px 4px;background:${bg};color:${fg};${step(2)}">${t}</span>`;
  const gridTex = (c = 'rgba(255,255,255,.035)', s = 16) => `background-image:linear-gradient(${c} 1px,transparent 1px),linear-gradient(90deg,${c} 1px,transparent 1px);background-size:${s}px ${s}px`;
  const pxBtn = (t, bg, fg, extra = '') => `<span style="display:inline-flex;align-items:center;gap:10px;font:700 17px 'Space Grotesk';padding:16px 24px;background:${bg};color:${fg};${step(4)};box-shadow:none;${extra}">${t}</span>`;

  const boards = {
    // ------------------------------------------------------------------ POSTER
    poster: () => `<div style="position:absolute;inset:0;background:radial-gradient(1100px 700px at 75% 40%,#2B1F6E 0%,${P.night} 70%);color:#fff;font-family:'Space Grotesk'">
      ${stars(1440, 640, 90, 11, [[60, 30, 780, 640], [770, 130, 1250, 650], [1260, 130, 1400, 600]])}
      <div style="position:absolute;inset:0;${gridTex()}"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;opacity:.95">${dither(1440, 180, 8, 'rgba(0,0,0,0)', '#0A0718', 0, .9)}</div>
      <div style="position:absolute;left:72px;top:46px;right:72px;display:flex;justify-content:space-between">${sk('YOUCODED · BRAND TERRITORY', P.mist)}${sk('CHOOSE YOUR PLAYER  ▸  P1', P.lime)}</div>

      <div style="position:absolute;left:72px;top:118px">${wm('dark', 8)}</div>
      <div style="position:absolute;left:72px;top:250px;width:640px;font:500 40px/1.12 'Space Grotesk';letter-spacing:-.02em">Your assistant is a character you <span style="color:${P.lime}">pick, dress and make your own.</span></div>
      <div style="position:absolute;left:72px;top:372px;width:600px;font:400 17px/1.55 'IBM Plex Sans';color:${P.mist}">The mascot is drawn on a 16-pixel grid, so it is sharp at every size, from the clock to a billboard. Themes are skins. The outline never changes.</div>

      <div style="position:absolute;left:72px;top:488px;display:flex;gap:12px">
        ${[['NIGHT', P.night, '#fff', 1], ['DUSK', P.dusk, '#fff'], ['VOLT', P.volt, P.night], ['LIME', P.lime, P.night], ['PINK', P.pink, P.night], ['PAPER', P.paper, P.night]].map(([n, c, f, border]) => `
          <div style="width:96px;height:112px;background:${c};${step(4)};padding:12px 10px;display:flex;flex-direction:column;justify-content:flex-end;color:${f};${border ? 'outline:2px solid #3A2F78;outline-offset:-2px' : ''}">
            <div style="font:400 11px 'Silkscreen'">${n}</div><div style="font:500 11px 'JetBrains Mono';opacity:.75">${c}</div></div>`).join('')}
      </div>

      <div style="position:absolute;left:72px;top:640px;display:flex;gap:44px;align-items:flex-end">
        <div><div style="font:700 92px/0.9 'Space Grotesk';letter-spacing:-.04em">Aa</div><div style="margin-top:10px">${sk('SPACE GROTESK · HEADLINES', P.mist, 10)}</div></div>
        <div><div style="font:400 64px/0.9 'IBM Plex Sans'">Aa</div><div style="margin-top:12px">${sk('IBM PLEX · READING', P.mist, 10)}</div></div>
        <div><div style="font:400 28px/1.15 'Silkscreen';color:${P.lime}">PLAYER 1<br>READY</div><div style="margin-top:12px">${sk('SILKSCREEN · LABELS', P.mist, 10)}</div></div>
      </div>

      <div style="position:absolute;left:820px;top:150px;width:416px;height:470px">
        <div style="position:absolute;left:0;top:0;width:416px;height:416px">${brackets(P.lime, 40, 8, 6)}
          <div style="position:absolute;left:24px;top:24px">${sprite('sprite32', 11)}</div></div>
        <div style="position:absolute;left:0;top:440px;width:416px;display:flex;justify-content:space-between;align-items:center">
          <span style="font:700 30px 'Space Grotesk';letter-spacing:-.01em">Volt</span>${chip('DEFAULT SKIN', P.lime, P.night)}</div>
      </div>

      <div style="position:absolute;left:1274px;top:150px;display:flex;flex-direction:column;gap:22px;align-items:center">
        ${KIT.img(pn('icon', 128), 96, px)}${sk('APP', P.mist, 10)}
        ${KIT.img(pn('installer', 128), 96, px)}${sk('INSTALLER', P.mist, 10)}
        <div style="background:#000;padding:8px;${step(3)}">${KIT.img(pn('tray-idle-white', 16), 64, px)}</div>${sk('TRAY 16PX', P.mist, 10)}
      </div>

      <div style="position:absolute;left:820px;bottom:56px;right:72px;display:flex;gap:18px">
        ${[['HARD SHADOW', `<span style="font:700 34px/1 'Space Grotesk';color:#fff;text-shadow:4px 4px 0 #5B3FD0">Aa</span>`],
           ['SELECT FRAME', `<span style="position:relative;display:block;width:34px;height:34px">${brackets(P.lime, 12, 3)}</span>`],
           ['DITHER', `<span style="display:block;${step(2)}">${dither(56, 34, 4, P.volt, P.night, 0, 1)}</span>`],
           ['16 GRID', `<span style="display:block;padding:2px;${gridTex('rgba(198,255,77,.35)', 4)}">${KIT.img(pn('tray-idle-white', 16), 32, px)}</span>`]].map(([n, h]) => `
          <div style="flex:1;height:96px;background:rgba(255,255,255,.04);${step(3)};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">${h}${sk(n, P.mist, 9)}</div>`).join('')}
      </div>
    </div>`,

    // ------------------------------------------------------------------ ICON
    icon: () => `<div style="position:absolute;inset:0;background:${P.paper};color:${P.ink};font-family:'Space Grotesk'">
      <div style="position:absolute;inset:0;${gridTex('rgba(21,18,43,.045)', 16)}"></div>
      <div style="position:absolute;left:64px;top:44px;right:64px;display:flex;justify-content:space-between">${sk('APP ICON & INSTALLER', P.voltD)}${sk('EVERY SIZE IS A WHOLE-NUMBER ZOOM OF ITS OWN GRID', '#8A85A3', 11)}</div>
      <div style="position:absolute;left:64px;top:96px">${KIT.img(pn('icon', 512), 512, px)}</div>
      <div style="position:absolute;left:64px;top:630px;width:512px;font:500 22px/1.3 'Space Grotesk'">The tile and the player are both pixel art: a 32×32 drawing, zoomed ×16 here. Nothing is ever shrunk.</div>
      <div style="position:absolute;left:64px;top:722px;display:flex;gap:24px;align-items:center">
        ${KIT.img(pn('installer', 128), 128, px)}
        <div style="width:360px"><div style="font:700 22px 'Space Grotesk'">Installer: a cartridge.</div><div style="font:400 15.5px/1.5 'IBM Plex Sans';color:#555;margin-top:6px">The same player on the label, gold contacts at the bottom. Double-click to plug it in.</div></div>
      </div>

      <div style="position:absolute;left:640px;top:96px;right:64px;display:flex;flex-direction:column;gap:20px">
        <div style="display:flex;gap:30px;align-items:flex-end;background:#fff;padding:20px 24px;${step(4)}">
          ${[64, 48, 32, 24, 16].map(p => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px">${KIT.img(pn('icon', p), p, px)}${sk(p + 'PX', '#8A85A3', 10)}</div>`).join('')}
          <div style="margin-left:auto;font:400 13.5px/1.45 'IBM Plex Sans';color:#555;width:240px">At 24 and 16 the player is redrawn on a smaller grid, not shrunk, so eyes stay two clean pixels.</div>
        </div>
        ${KIT.label('Windows taskbar · dark, then light', P.ink)}
        ${KIT.taskbar({ bg: '#1F1F23', ours: KIT.img(pn('icon', 24), 24, px) })}
        ${KIT.taskbar({ bg: '#EEF0F5', ours: KIT.img(pn('icon', 24), 24, px) })}
        ${KIT.label('Mac Dock', P.ink)}
        <div style="position:relative;height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden;${step(4)}">
          <div style="position:absolute;inset:0">${dither(736, 150, 6, '#7B5BE8', '#2A1F66', 0, 1)}</div>
          <div style="position:relative">${KIT.dock({ ours: KIT.img(pn('icon', 64), 64, px), size: 64 })}</div>
        </div>
        ${KIT.label('Installer, in Downloads', P.ink)}
        <div style="background:#fff;${step(4)};padding:16px 22px;display:flex;align-items:center;gap:18px">
          ${KIT.img(pn('installer', 64), 64, px)}
          <div><div style="font:500 15px 'Segoe UI','IBM Plex Sans'">YouCoded-Setup-1.3.1.exe</div><div style="font:400 13px 'IBM Plex Sans';color:#888">Application</div></div>
          <div style="margin-left:auto;display:flex;gap:18px;align-items:flex-end">${KIT.img(pn('installer', 32), 32, px)}${KIT.img(pn('installer', 24), 24, px)}${KIT.img(pn('installer', 16), 16, px)}</div>
        </div>
      </div>
    </div>`,

    // ------------------------------------------------------------------ TRAY
    tray: () => `<div style="position:absolute;inset:0;background:${P.paper};color:${P.ink};font-family:'Space Grotesk'">
      <div style="position:absolute;inset:0;${gridTex('rgba(21,18,43,.045)', 16)}"></div>
      <div style="position:absolute;left:64px;top:44px;right:64px;display:flex;justify-content:space-between">${sk('TRAY ICON', P.voltD)}${sk('DRAWN AT 16×16 — NOT SHRUNK FROM ANYTHING', '#8A85A3', 11)}</div>
      <div style="position:absolute;left:64px;top:92px;width:700px;font:700 40px/1.08 'Space Grotesk';letter-spacing:-.025em">The one place pixels win outright: <span style="color:${P.voltD}">the clock.</span></div>
      <div style="position:absolute;left:64px;top:222px;width:700px;display:flex;flex-direction:column;gap:26px">
        ${KIT.tray({ label: 'Windows 11 · dark', bg: '#1F1F23', fg: '#fff', ours: KIT.img(pn('tray-idle-white', 16), 16, px) })}
        ${KIT.tray({ label: 'Windows 11 · light', bg: '#EEF0F5', fg: '#1A1A1A', ours: KIT.img(pn('tray-idle-black', 16), 16, px) })}
        ${KIT.tray({ label: 'Mac menu bar · light', bg: '#E9E8EE', fg: '#1A1A1A', h: 26, ours: KIT.img(pn('tray-idle-black', 16), 16, px) })}
        ${KIT.tray({ label: 'Mac menu bar · dark', bg: '#2B2A30', fg: '#fff', h: 26, ours: KIT.img(pn('tray-idle-white', 16), 16, px) })}
        ${KIT.tray({ label: 'Linux (KDE) · high-res, 24px', bg: '#232029', fg: '#fff', ours: KIT.img(pn('tray24-white', 24), 24, px) })}
      </div>
      <div style="position:absolute;left:64px;top:660px;width:700px">
        ${KIT.label('High-res screen at 200% — the same 16 pixels, each doubled', P.ink)}
        <div style="margin-top:10px;width:350px;zoom:2">${KIT.tray({ label: '', bg: '#2B2A30', fg: '#fff', h: 26, ours: KIT.img(pn('tray-idle-white', 16), 16, px) })}</div>
      </div>

      <div style="position:absolute;left:820px;top:92px;right:64px">
        ${KIT.label('16px, magnified 12×', P.ink)}
        <div style="display:flex;gap:20px;margin-top:12px">${KIT.magnify(pn('tray-idle-white', 16), 16, 12, '#1F1F23')}${KIT.magnify(pn('tray-idle-black', 16), 16, 12, '#EEF0F5')}</div>
        <div style="margin-top:40px">${KIT.label('While it works · two-frame states', P.ink)}</div>
        <div style="display:flex;gap:12px;margin-top:12px">
          ${[['idle', 'IDLE'], ['blink', 'BLINK'], ['bob', 'THINKING'], ['wave', 'DONE'], ['alert', 'NEEDS YOU']].map(([f, n]) => `
            <div style="display:flex;flex-direction:column;gap:8px;align-items:center">${KIT.magnify(pn('tray-' + f + '-white', 16), 16, 6, '#1F1F23')}${sk(n, P.ink, 10)}</div>`).join('')}
        </div>
        <div style="margin-top:40px;font:700 22px/1.3 'Space Grotesk';width:540px">One colour, like the Wi-Fi and volume beside it.</div>
        <div style="margin-top:8px;font:400 15px/1.55 'IBM Plex Sans';color:#555;width:540px">The eyes are holes, so it reads white on dark bars and black on light ones.</div>
        <div style="margin-top:22px;font:400 15px/1.55 'IBM Plex Sans';color:#555;width:540px">While it works, the player bobs one pixel and blinks. A raised hand means the job is done; the corner square means it is waiting for you. Each state is one or two hand-placed pixels, so nothing blurs.</div>
      </div>
    </div>`,

    // ------------------------------------------------------------------ HERO
    hero: () => `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#22195A 0%,${P.night} 78%);color:#fff;font-family:'Space Grotesk';overflow:hidden">
      ${stars(1440, 700, 90, 3, [[50, 20, 1400, 90], [80, 180, 760, 660], [800, 110, 1360, 700]])}
      <div style="position:absolute;left:0;right:0;bottom:0">${dither(1440, 220, 8, 'rgba(0,0,0,0)', '#0A0718', 0, .95)}</div>
      <nav style="position:absolute;left:64px;right:64px;top:28px;height:52px;display:flex;align-items:center">
        <div style="display:flex;align-items:center;gap:14px">${KIT.img(sv('sprite16-idle'), 32, px)}${wm('dark', 3)}</div>
        <div style="margin-left:72px;display:flex;gap:34px;font:500 16px 'Space Grotesk';color:${P.mist}"><span>Features</span><span>Skins</span><span>Docs</span><span>GitHub</span></div>
        <div style="margin-left:auto">${pxBtn('Download', P.lime, P.night, 'padding:12px 20px;font-size:15px')}</div>
      </nav>

      <div style="position:absolute;left:96px;top:196px;width:640px">
        <div>${sk('FREE · EASY · OPEN SOURCE', P.lime, 14)}</div>
        <h1 style="margin-top:22px;font:700 90px/0.96 'Space Grotesk';letter-spacing:-.045em">An assistant that's <span style="color:${P.lime};text-shadow:6px 6px 0 #4B2BB0">yours.</span></h1>
        <p style="margin-top:28px;width:520px;font:400 21px/1.5 'IBM Plex Sans';color:${P.mist}">An AI agent you own and shape. Use any AI model from any provider to work and build your way.</p>
        <div style="margin-top:36px;display:flex;gap:16px">${pxBtn('▼ &nbsp;Download for Windows', P.lime, P.night)}${pxBtn('Browse skins ▸', 'rgba(255,255,255,.08)', '#fff')}</div>
        <div style="margin-top:28px">${sk('WINDOWS · MAC · LINUX · ANDROID', '#8B83B8', 11)}</div>
      </div>

      <div style="position:absolute;left:830px;top:116px;width:500px">
        <div style="display:flex;justify-content:space-between;align-items:center">${sk('◀', P.mist, 16)}${sk('CHOOSE YOUR PLAYER', '#fff', 15)}${sk('▶', P.mist, 16)}</div>
        <div style="position:relative;margin:20px auto 0;width:336px;height:336px">
          ${brackets(P.lime, 34, 7, 6)}
          <div style="position:absolute;left:8px;top:8px">${sprite('skin-volt', 10)}</div>
        </div>
        <div style="margin:-6px auto 0;width:264px">${pedestal(264)}</div>
        <div style="margin-top:22px;background:rgba(255,255,255,.06);${step(4)};padding:16px 22px">
          <div style="display:flex;justify-content:space-between;align-items:center"><span style="font:700 24px 'Space Grotesk'">Volt</span>${chip('P1 · READY', P.lime, P.night)}</div>
          <div style="margin-top:10px;display:grid;grid-template-columns:96px 1fr;row-gap:7px;align-items:center;font:400 15px 'IBM Plex Sans';color:${P.mist}">
            ${sk('MODEL', '#8B83B8', 11)}<span>Any provider you choose</span>${sk('SKIN', '#8B83B8', 11)}<span>Volt, or any skin you like</span>${sk('SKILLS', '#8B83B8', 11)}<span>Yours to add</span></div>
        </div>
      </div>

      <div style="position:absolute;left:0;right:0;bottom:40px;display:flex;gap:16px;justify-content:center">
        ${SKINS.map(([id, n, , bg], i) => `<div style="position:relative;width:88px;height:88px">${i === 0 ? brackets(P.lime, 20, 5, 7) : ''}<div style="width:88px;height:88px;background:${bg};${step(3)};display:grid;place-items:center">${sprite('skin-' + id, 2)}</div></div>`).join('')}
      </div>
    </div>`,

    // ------------------------------------------------------------------ DOCS
    docs: () => `<div style="position:absolute;inset:0;background:${P.paper};color:${P.ink};font-family:'IBM Plex Sans'">
      <header style="position:absolute;left:0;right:0;top:0;height:68px;background:#fff;border-bottom:2px solid rgba(21,18,43,.08);display:flex;align-items:center;padding:0 48px">
        <div style="display:flex;align-items:center;gap:12px">${KIT.img(sv('sprite16-idle'), 32, px)}${wm('light', 2)}</div>
        <span style="margin-left:18px;padding-left:18px;border-left:2px solid rgba(21,18,43,.1);font:500 16px 'Space Grotesk';color:#555">Help Center</span>
        <div style="margin-left:auto;width:340px;height:40px;background:${P.paper};${step(3)};display:flex;align-items:center;padding:0 14px;font-size:14.5px;color:#888">Search help<span style="margin-left:auto;font:500 12px 'JetBrains Mono'">Ctrl K</span></div>
      </header>

      <aside style="position:absolute;left:48px;top:108px;width:250px;font-size:15px;line-height:1">
        ${[['GETTING STARTED', ['Install', 'Pick a model', 'Your first session']], ['PRIVACY & SAFETY', ['Privacy & Data', 'Permissions', 'Backups']], ['MAKE IT YOURS', ['Skins & themes', 'Skills', 'Settings file']]].map(([g, items]) => `
          <div style="margin-bottom:28px">${sk(g, '#8A85A3', 10)}<div style="margin-top:12px;display:flex;flex-direction:column;gap:4px">
          ${items.map(it => it === 'Privacy & Data'
            ? `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;background:#EAE3FF;${step(2)};font-weight:600;color:${P.ink}"><span style="width:8px;height:8px;background:${P.voltD}"></span>${it}</div>`
            : `<div style="padding:9px 10px 9px 28px;color:#4A4760">${it}</div>`).join('')}</div></div>`).join('')}
      </aside>

      <main style="position:absolute;left:346px;top:104px;width:700px">
        <div style="font-size:14px;color:#8A85A3">Help › Privacy &amp; Safety</div>
        <h1 style="margin-top:14px;font:700 54px/1 'Space Grotesk';letter-spacing:-.035em">Privacy &amp; Data</h1>
        <p style="margin-top:18px;font-size:20px;line-height:1.5;color:#3A3752">What YouCoded keeps on your computer, what it sends, and who receives it.</p>
        <div style="margin-top:12px;font-size:13.5px;color:#8A85A3">Updated 1 October 2026 · 4 min read</div>
        <div style="margin-top:34px">${sk('01 — WHERE YOUR CONVERSATIONS LIVE', P.voltD, 11)}</div>
        <h2 style="margin-top:10px;font:700 26px 'Space Grotesk';letter-spacing:-.015em">On this device</h2>
        <p style="margin-top:10px;font-size:16.5px;line-height:1.65;color:#2E2B45">Your conversations are stored on the device you use YouCoded on. Your settings live in one folder in your home directory, which you can open, copy or back up like any other folder.</p>
        <div style="margin-top:16px;background:${P.night};color:#E9E4FF;${step(4)};padding:18px 22px;font:400 14px/1.75 'JetBrains Mono'">
          <span style="color:${P.lime}">~/.youcoded/</span><br>&nbsp;&nbsp;├─ settings.json<br>&nbsp;&nbsp;└─ sessions/</div>
        <div style="margin-top:34px">${sk('02 — WHAT IS SENT, AND TO WHOM', P.voltD, 11)}</div>
        <h2 style="margin-top:10px;font:700 26px 'Space Grotesk';letter-spacing:-.015em">To the model provider you pick</h2>
        <div style="margin-top:16px;display:flex;align-items:center;gap:14px">
          <div style="background:#fff;${step(3)};padding:14px 18px;display:flex;align-items:center;gap:12px;border:0">${KIT.img(sv('sprite16-idle'), 32, px)}<span style="font:600 15px 'Space Grotesk'">This device</span></div>
          <svg width="120" height="16" shape-rendering="crispEdges"><g fill="${P.voltD}"><rect x="0" y="6" width="100" height="4"/><rect x="100" y="2" width="4" height="12"/><rect x="104" y="4" width="4" height="8"/><rect x="108" y="6" width="4" height="4"/></g></svg>
          <div style="background:#fff;${step(3)};padding:14px 18px;font:600 15px 'Space Grotesk'">The model provider you chose</div>
        </div>
        <p style="margin-top:16px;font-size:16.5px;line-height:1.65;color:#2E2B45">A message leaves your device only when you send it, and only to the provider you picked in Settings.</p>
        <div style="margin-top:34px">${sk('03 — REMOVING YOUR DATA', P.voltD, 11)}</div>
        <h2 style="margin-top:10px;font:700 26px 'Space Grotesk';letter-spacing:-.015em">What you can remove, and how</h2>
      </main>

      <aside style="position:absolute;left:1110px;top:108px;width:282px">
        ${sk('ON THIS PAGE', '#8A85A3', 10)}
        <div style="margin-top:14px;display:flex;flex-direction:column;gap:12px;font-size:14.5px;color:#4A4760;border-left:2px solid rgba(21,18,43,.1);padding-left:14px">
          <span style="color:${P.ink};font-weight:600;margin-left:-16px;padding-left:14px;border-left:2px solid ${P.voltD}">Where conversations live</span><span>What is sent, and to whom</span><span>Removing your data</span><span>Questions</span></div>
        <div style="margin-top:38px;background:#fff;${step(4)};padding:20px;position:relative">
          <div style="display:flex;align-items:center;gap:10px">${KIT.img(sv('sprite16-idle'), 32, px)}<span style="font:700 16px 'Space Grotesk'">Good to know</span></div>
          <p style="margin-top:10px;font-size:14.5px;line-height:1.55;color:#3A3752">When you send a message, it goes to the provider you picked in Settings. Their own privacy terms apply to what you send them.</p>
        </div>
      </aside>
    </div>`,

    // ------------------------------------------------------------------ THEMES
    themes: () => `<div style="position:absolute;inset:0;background:${P.night};color:#fff;font-family:'Space Grotesk'">
      <div style="position:absolute;inset:0;${gridTex()}"></div>
      <div style="position:absolute;left:64px;top:56px;width:380px">
        ${sk('SKINS · THE COLLECTION', P.lime, 13)}
        <h2 style="margin-top:18px;font:700 44px/1.02 'Space Grotesk';letter-spacing:-.035em">Every skin is still the same player.</h2>
        <div style="margin-top:30px;display:flex;gap:22px;align-items:flex-start">
          <div style="width:160px;height:160px;position:relative;background:${P.deep};${step(3)}">
            <div style="position:absolute;inset:0;${gridTex('rgba(198,255,77,.18)', 10)}"></div>
            <img src="${pn('tray-idle-white', 16)}" width="160" height="160" style="${px};position:relative;filter:drop-shadow(0 0 0 ${P.lime})">
          </div>
          <div style="font:400 14px/1.5 'IBM Plex Sans';color:${P.mist};padding-top:4px">The 16×16 outline: square head, two arms, two feet, eyes in place.</div>
        </div>
        <div style="margin-top:28px">${chip('FIXED', P.lime, P.night)}<div style="margin-top:10px;font:400 16px/1.55 'IBM Plex Sans';color:#E9E4FF">The outline and where the eyes sit.</div></div>
        <div style="margin-top:20px">${chip('FREE', P.pink, P.night)}<div style="margin-top:10px;font:400 16px/1.55 'IBM Plex Sans';color:#E9E4FF">Colour, face, hats, ears, visors, effects. Anything that fits on the grid.</div></div>
        <div style="margin-top:34px;padding-top:24px;border-top:2px dashed rgba(255,255,255,.12);display:flex;gap:16px;align-items:center">
          <div style="display:grid;grid-template-columns:repeat(4,18px);gap:4px">${['#A970FF', '#FFB52E', '#8BD46A', '#FF8FB1', '#3149A0', '#B9C0CC', '#9BBC0F', '#E04FB2'].map(c => `<span style="width:18px;height:18px;background:${c}"></span>`).join('')}</div>
          <div style="font:400 14.5px/1.5 'IBM Plex Sans';color:${P.mist}">Make one yourself on the 32×32 grid, or pick one someone else made.</div>
        </div>
      </div>
      <div style="position:absolute;right:64px;top:56px">${sk('8 / ∞', P.mist, 13)}</div>
      <div style="position:absolute;left:480px;top:96px;width:896px;display:grid;grid-template-columns:repeat(4,206px);gap:24px">
        ${SKINS.map(([id, n, tag, bg], i) => `
          <div style="position:relative;height:362px">
            <div style="height:362px;background:${P.deep};${step(4)};display:flex;flex-direction:column">
              <div style="height:270px;background:${bg};display:grid;place-items:center">${sprite('skin-' + id, 6)}</div>
              <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px"><span style="font:700 18px 'Space Grotesk';white-space:nowrap">${n}</span>
                <span>${chip(tag, i === 0 ? P.lime : 'rgba(255,255,255,.1)', i === 0 ? P.night : P.mist)}</span></div>
            </div>
            ${i === 0 ? brackets(P.lime, 26, 6, 8) : ''}
          </div>`).join('')}
      </div>
    </div>`,
  };

  window.TERR = { id: 'pixel', name: 'Choose Your Player', boards };
})();
