// boards.js — the six 1440x900 boards of territory "Built by you" (kit of parts).
// Loads geo.js first (board.html only loads this file), so every board is async.
(function () {
  const ready = new Promise((res) => {
    if (globalThis.BUILT) return res();
    const s = document.createElement('script'); s.src = 't/built/geo.js'; s.onload = res; document.head.append(s);
  });
  const P = 't/built/png/';

  const CSS = `<style>
  .bt{position:absolute;inset:0;font-family:'Instrument Sans';color:#16121F;background:#FFF6EC;overflow:hidden}
  .grid{background-image:linear-gradient(rgba(22,18,31,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(22,18,31,.055) 1px,transparent 1px);background-size:24px 24px;background-position:-1px -1px}
  .mono{font-family:'JetBrains Mono';letter-spacing:.1em;text-transform:uppercase}
  .disp{font-family:'Unbounded'}
  .ab{position:absolute}
  .tag{font:600 11px 'JetBrains Mono';letter-spacing:.12em;text-transform:uppercase}
  </style>`;

  // ---------- small builders ----------
  const markSvg = (c, w, vb = '0 1.6 24 22') => {
    const h = w * (+vb.split(' ')[3]) / (+vb.split(' ')[2]);
    return `<svg width="${w}" height="${h}" viewBox="${vb}" style="display:block;overflow:visible">${BUILT.mascot(c)}</svg>`;
  };
  const wordSvg = (h, o = {}) => {
    const { inner, vb } = BUILT.wordmark(o);
    return `<svg height="${h}" width="${h * vb[2] / vb[3]}" viewBox="${vb.join(' ')}" style="display:block">${inner}</svg>`;
  };
  // Lockup: mascot + wordmark, mascot height matched to the wordmark's x-height-plus-ascender.
  const lockup = (h, o = {}) => `<div style="display:flex;align-items:center;gap:${h * .32}px">${markSvg(o.m || {}, h * 1.18)}${wordSvg(h, o.w || {})}</div>`;

  // Exploded assembly diagram, drawn in px. Parts drift apart; leader lines name each part.
  function exploded({ lw = 200, k = 14, col = {}, line = '#16121F', text = '#16121F', sub = 'rgba(22,18,31,.62)', W = 820, Hh = 470, dot = '#FF7A2F', labels = true }) {
    const E = { head: [0, -3.4], armL: [-3.6, 0], armR: [3.6, 0], footL: [-.9, 3.4], footR: [.9, 3.4] };
    const ox = W / 2 - 12 * k, oy = 3.2 * k + 30;
    const pt = (ux, uy) => [ox + ux * k, oy + uy * k];
    const m = BUILT.mascot(Object.assign({ ex: E }, col));
    // anchors (units, including explode offsets)
    const A = {
      head: pt(15.5, 3.6 - 3.4), face: pt(15.3, 9.3 - 3.4), armL: pt(1.3 - 3.6, 10.7), footR: pt(16.7 + .9, 18.8 + 3.4), footL: pt(7.3 - .9, 18.8 + 3.4),
    };
    const L = [
      ['head', 'R', 'YC-01  Head', 'The model. Any provider,', 'cloud or on your machine.'],
      ['face', 'R', 'YC-02  Face', 'Its personality: how it', 'talks to you.'],
      ['footR', 'R', 'YC-04  Feet', 'Where it runs: desktop,', 'Android, or the web.'],
      ['armL', 'L', 'YC-03  Arms', 'Skills and tools, made by', 'you or the community.'],
      ['footL', 'L', 'YC-05  Colour', 'Any theme, or one', 'you make yourself.'],
    ];
    let lines = '', txt = '';
    if (labels) for (const [k2, side, t1, t2, t3] of L) {
      const [ax, ay] = A[k2];
      const lx = side === 'R' ? W - lw : lw;
      lines += `<circle cx="${ax}" cy="${ay}" r="4.5" fill="${dot}"/><path d="M${ax} ${ay}H${lx}" stroke="${line}" stroke-width="1.3" stroke-dasharray="5 4"/>` +
        `<circle cx="${lx}" cy="${ay}" r="2.5" fill="${line}"/>`;
      const tx = side === 'R' ? lx + 14 : lx - 14, an = side === 'R' ? 'start' : 'end';
      txt += `<text x="${tx}" y="${ay - 12}" text-anchor="${an}" font-family="JetBrains Mono" font-weight="700" font-size="13.5" letter-spacing="1.6" fill="${text}">${t1.toUpperCase()}</text>` +
        `<text x="${tx}" y="${ay + 9}" text-anchor="${an}" font-family="Instrument Sans" font-size="15" fill="${sub}">${t2}</text>` +
        `<text x="${tx}" y="${ay + 28}" text-anchor="${an}" font-family="Instrument Sans" font-size="15" fill="${sub}">${t3}</text>`;
    }
    // ghost outline of where the head sits when assembled
    const ghost = `<g transform="translate(${ox} ${oy}) scale(${k})"><path d="${BUILT.rr(5, 3.6, 14, 12.2, 3.6)}" fill="none" stroke="${line}" stroke-opacity=".28" stroke-width="${1.2 / k}" stroke-dasharray="${4 / k} ${4 / k}"/></g>`;
    // swatches on the colour label
    const sw = labels ? (() => { const [ax, ay] = A.footL; const sx = lw - 14; return ['#7B3FE4', '#FF7A2F', '#5CF2C0', '#FFD23F'].map((c, i) => `<rect x="${sx - 108 + i * 28}" y="${ay + 40}" width="22" height="14" rx="4" fill="${c}" stroke="${line}" stroke-opacity=".2"/>`).join(''); })() : '';
    return `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" style="display:block;overflow:visible">${lines}${ghost}<g transform="translate(${ox} ${oy}) scale(${k})">${m}</g>${txt}${sw}</svg>`;
  }

  const nav = (dark = false) => {
    const fg = dark ? '#FFF6EC' : '#16121F';
    return `<div class="ab" style="left:56px;right:56px;top:28px;height:52px;display:flex;align-items:center;justify-content:space-between">
      ${lockup(30, { w: dark ? { you: '#CDB8FF', coded: fg } : {} })}
      <div class="mono" style="display:flex;gap:34px;font-size:12.5px;color:${fg}"><span>Features</span><span>Parts</span><span>Themes</span><span>Docs</span><span>GitHub</span></div>
      <div style="display:flex;gap:10px;align-items:center"><span style="font:600 15px 'Instrument Sans';background:#16121F;color:#FFF6EC;padding:12px 20px;border-radius:12px">Download</span></div></div>`;
  };

  const boards = {
    // ================= 1. POSTER =================
    async poster() {
      await ready;
      const seq = [['head'], ['head', 'face'], ['head', 'face', 'armL', 'armR'], ['head', 'face', 'armL', 'armR', 'footL', 'footR'], null];
      const seqHtml = seq.map((show, i) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
          <div style="width:82px;height:74px;display:grid;place-items:center;background:${i === 4 ? '#7B3FE4' : '#fff'};border-radius:16px;border:1.5px solid ${i === 4 ? '#7B3FE4' : 'rgba(22,18,31,.12)'}">
          ${markSvg(i === 4 ? { head: '#FFF6EC', arm: '#FF7A2F', foot: '#FF7A2F', eye: '#16121F' } : { head: '#16121F', arm: '#16121F', foot: '#16121F', eye: '#FFF6EC', show: show.concat([]), ghost: 'rgba(22,18,31,.35)' } , 56)}</div>
          <div class="tag" style="font-size:10px;opacity:.6">${['01 Head', '02 Face', '03 Arms', '04 Feet', '05 Colour'][i]}</div></div>`).join('<div style="font:400 18px Unbounded;opacity:.35;margin-top:-24px">+</div>');
      const chip = (c, name, hex, fg, w = 132) => `<div style="width:${w}px;height:86px;border-radius:18px;background:${c};color:${fg};padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between;${c === '#FFF6EC' ? 'border:1.5px solid rgba(22,18,31,.14)' : ''}">
        <span class="tag" style="font-size:10px;opacity:.75">${name}</span><span class="tag" style="font-size:12px">${hex}</span></div>`;
      return `${CSS}<div class="bt grid">
        <div class="ab mono" style="left:56px;top:34px;font-size:11.5px;opacity:.55">YouCoded · Brand territory 01</div>
        <div class="ab mono" style="right:56px;top:34px;font-size:11.5px;opacity:.55">Sheet 1/6 · Kit of parts</div>
        <div class="ab" style="left:56px;top:96px">${lockup(92)}</div>
        <div class="ab" style="left:58px;top:262px;width:640px">
          <div class="disp" style="font-weight:800;font-size:46px;line-height:1.02;letter-spacing:-.035em">Built by you.</div>
          <div style="font-size:19px;line-height:1.5;margin-top:16px;opacity:.78;max-width:560px">Everything is made of one part: the rounded block. Five of them make the mascot. The same blocks spell the name. Swap any part and it's still YouCoded.</div>
        </div>
        <div class="ab" style="left:58px;top:574px;width:620px;font-size:14.5px;line-height:1.5;padding:14px 18px;border-left:4px solid #FF7A2F;background:rgba(255,122,47,.08);border-radius:0 12px 12px 0"><b>The one rule:</b> every mascot, in every theme, is these five blocks in this layout.</div>
        <div class="ab" style="left:58px;top:450px;width:640px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px">
          <div><div class="tag" style="opacity:.5;margin-bottom:8px">Display</div><div class="disp" style="font-weight:800;font-size:40px;letter-spacing:-.03em;line-height:1">Aa</div><div style="font-size:13px;margin-top:6px;opacity:.65">Unbounded</div></div>
          <div><div class="tag" style="opacity:.5;margin-bottom:8px">Reading</div><div style="font-weight:600;font-size:40px;line-height:1">Aa</div><div style="font-size:13px;margin-top:6px;opacity:.65">Instrument Sans</div></div>
          <div><div class="tag" style="opacity:.5;margin-bottom:8px">Parts &amp; specs</div><div style="font:500 36px 'JetBrains Mono';line-height:1.1">YC-01</div><div style="font-size:13px;margin-top:6px;opacity:.65">JetBrains Mono</div></div>
        </div>
        <div class="ab" style="right:30px;top:96px">${exploded({ k: 13, W: 780, Hh: 500, lw: 196 })}</div>
        <div class="ab" style="left:0;right:0;bottom:0;height:224px;background:#16121F;color:#FFF6EC"></div>
        <div class="ab" style="left:56px;bottom:46px;display:flex;gap:12px">
          ${chip('#7B3FE4', 'Signal purple', '#7B3FE4', '#FFF6EC')}${chip('#FF7A2F', 'Tangerine', '#FF7A2F', '#16121F')}${chip('#FFF6EC', 'Cream', '#FFF6EC', '#16121F')}${chip('#CDB8FF', 'Lilac', '#CDB8FF', '#16121F')}
        </div>
        <div class="ab tag" style="left:56px;bottom:150px;color:#FFF6EC;opacity:.55">Palette · four parts</div>
        <div class="ab tag" style="left:690px;bottom:150px;color:#FFF6EC;opacity:.55">Assembly · how every mascot is made</div>
        <div class="ab" style="left:690px;bottom:42px;display:flex;align-items:center;gap:10px;color:#FFF6EC">${seqHtml.replaceAll('#fff;border-radius', '#FFF6EC;border-radius')}</div>
        <div class="ab" style="right:56px;bottom:44px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.45))">${KIT.img(P + 'icon-256.png', 104)}</div>
        <div class="ab tag" style="right:56px;bottom:150px;width:104px;text-align:right;color:#FFF6EC;opacity:.55">App icon</div>
      </div>`;
    },

    // ================= 2. ICON =================
    async icon() {
      await ready;
      return `${CSS}<div class="bt grid">
        <div class="ab mono" style="left:56px;top:34px;font-size:11.5px;opacity:.55">Sheet 2/6 · App icon &amp; installer</div>
        <div class="ab" style="left:56px;top:78px;width:520px;height:520px;border-radius:40px;background:#16121F;display:grid;place-items:center">
          <div style="filter:drop-shadow(0 30px 50px rgba(123,63,228,.45))">${KIT.img(P + 'icon-512.png', 360)}</div></div>
        <div class="ab" style="left:56px;top:636px;width:520px">
          <div class="tag" style="opacity:.5;margin-bottom:12px">Real sizes · 16 and 24 are redrawn on the pixel grid</div>
          <div style="display:flex;align-items:flex-end;gap:26px">
            ${[64, 32, 24, 16].map(s => `<div style="text-align:center">${KIT.img(P + 'icon-' + s + '.png', s)}<div class="tag" style="font-size:10px;margin-top:6px;opacity:.55">${s}</div></div>`).join('')}
            <div style="width:1px;height:64px;background:rgba(22,18,31,.15);margin:0 4px"></div>
            <div style="display:flex;gap:14px;align-items:flex-end">
              <div style="text-align:center">${KIT.magnify(P + 'icon-naive-16.png', 16, 8, '#EEF0F5')}<div class="tag" style="font-size:9.5px;margin-top:6px;opacity:.55">Shrunk</div></div>
              <div style="text-align:center">${KIT.magnify(P + 'icon-16.png', 16, 8, '#EEF0F5')}<div class="tag" style="font-size:9.5px;margin-top:6px;opacity:.55">Redrawn</div></div>
            </div>
          </div>
        </div>
        <div class="ab" style="left:620px;top:78px;right:56px;display:flex;flex-direction:column;gap:14px">
          <div class="tag" style="opacity:.5">Windows taskbar · dark and light</div>
          ${KIT.taskbar({ bg: '#1F1F23', ours: KIT.img(P + 'icon-24.png', 24) })}
          ${KIT.taskbar({ bg: '#EEF0F5', ours: KIT.img(P + 'icon-24.png', 24) })}
          <div class="tag" style="opacity:.5;margin-top:14px">Mac Dock</div>
          <div style="height:206px;border-radius:20px;background:radial-gradient(120% 140% at 20% 0%,#FF9A5C 0%,#B65CF0 45%,#3B1E8F 100%);display:flex;align-items:flex-end;justify-content:center;padding-bottom:16px">${KIT.dock({ ours: KIT.img(P + 'icon-64.png', 60) })}</div>
          <div class="tag" style="opacity:.5;margin-top:14px">Installer · it arrives flat-packed</div>
          <div style="border-radius:16px;background:#fff;border:1px solid rgba(22,18,31,.1);overflow:hidden">
            <div style="height:38px;background:#F3EEE6;display:flex;align-items:center;gap:10px;padding:0 16px;font:500 13px 'Segoe UI','Instrument Sans';color:#444"><span style="opacity:.5">◂ ▸</span> Downloads</div>
            <div style="display:flex;gap:34px;padding:34px 30px 40px;align-items:flex-start">
              ${[['#E8453C', 'Report-Q3.pdf'], ['#F5A623', 'photos.zip']].map(([c, n]) => `<div style="width:120px;text-align:center"><div style="width:52px;height:64px;margin:0 auto;border-radius:6px;background:#fff;border:1.5px solid #ddd;position:relative"><span style="position:absolute;left:8px;right:8px;bottom:10px;height:12px;border-radius:3px;background:${c}"></span></div><div style="font:400 12.5px 'Segoe UI','Instrument Sans';margin-top:10px;color:#333">${n}</div></div>`).join('')}
              <div style="width:200px;text-align:center"><div style="width:96px;margin:-10px auto 0;border-radius:10px;background:#E6EEFF;outline:1.5px solid #9DB8F5;padding:6px 0 2px">${KIT.img(P + 'installer-128.png', 80, 'margin:0 auto')}</div><div style="font:400 12.5px 'Segoe UI','Instrument Sans';margin-top:8px;color:#333;background:#2D6BE0;color:#fff;border-radius:4px;padding:2px 4px;display:inline-block">YouCoded-Setup-1.3.1.exe</div></div>
              <div style="display:flex;gap:16px;align-items:flex-end;margin-left:auto;padding-top:20px">${[48, 32, 16].map(s => `<div style="text-align:center">${KIT.img(P + 'installer-' + s + '.png', s)}<div class="tag" style="font-size:9.5px;margin-top:6px;opacity:.5">${s}</div></div>`).join('')}</div>
            </div>
          </div>
        </div>
      </div>`;
    },

    // ================= 3. TRAY =================
    async tray() {
      await ready;
      const t = (n, s = 16) => KIT.img(P + n + '-' + s + '.png', s);
      const state = (n, label, bg) => `<div style="text-align:center">${KIT.magnify(P + n + '-16.png', 16, 6, bg)}<div class="tag" style="font-size:10px;margin-top:8px;opacity:.6">${label}</div></div>`;
      return `${CSS}<div class="bt grid">
        <div class="ab mono" style="left:56px;top:34px;font-size:11.5px;opacity:.55">Sheet 3/6 · Tray icon</div>
        <div class="ab" style="left:56px;top:76px;width:760px">
          <div class="disp" style="font-weight:800;font-size:34px;letter-spacing:-.03em;line-height:1.05">Next to the clock,<br>only the head.</div>
          <div style="font-size:16px;line-height:1.5;margin-top:12px;opacity:.72;max-width:620px">One part of the kit, in the system's own colour: white on dark bars, black on light ones. Drawn on whole pixels so it stays sharp at 16.</div>
        </div>
        <div class="ab" style="left:56px;top:250px;width:760px;display:flex;flex-direction:column;gap:16px">
          ${KIT.tray({ label: 'Windows 11 · dark taskbar', bg: '#1F1F23', fg: '#fff', ours: t('tray-white'), h: 48 })}
          ${KIT.tray({ label: 'Windows 11 · light taskbar', bg: '#EEF0F5', fg: '#1A1A1A', ours: t('tray-black'), h: 48 })}
          ${KIT.tray({ label: 'Mac menu bar · light', bg: '#E9E8EE', fg: '#1A1A1A', ours: t('tray-black'), h: 26 })}
          ${KIT.tray({ label: 'Mac menu bar · dark', bg: '#2B2A30', fg: '#fff', ours: t('tray-white'), h: 26 })}
          ${KIT.tray({ label: 'Linux (KDE) panel · high-res screen', bg: '#232029', fg: '#fff', ours: t('tray24-white', 24), h: 44 })}
          <div class="tag" style="opacity:.5;margin-top:18px">Notification · same head, same voice</div>
          <div style="display:flex;justify-content:flex-end"><div style="width:400px;border-radius:14px;background:#2B2A30;color:#fff;padding:16px 18px;display:flex;gap:14px;align-items:flex-start;box-shadow:0 18px 40px rgba(0,0,0,.25)">
            <div style="width:40px;height:40px;border-radius:10px;background:#7B3FE4;display:grid;place-items:center;flex:none">${KIT.img(P + 'tray24-white-24.png', 24)}</div>
            <div><div style="font:600 14px 'Segoe UI','Instrument Sans'">YouCoded</div><div style="font:400 14px/1.45 'Segoe UI','Instrument Sans';opacity:.8;margin-top:2px">Your assistant has a question before it carries on.</div></div></div></div>
        </div>
        <div class="ab" style="right:56px;top:76px;width:500px;height:770px;border-radius:28px;background:#16121F;color:#FFF6EC;padding:30px 34px">
          <div class="tag" style="opacity:.6">16 px · magnified 12×</div>
          <div style="display:flex;gap:18px;margin-top:16px">${KIT.magnify(P + 'tray-white-16.png', 16, 12, '#1F1F23')}${KIT.magnify(P + 'tray-black-16.png', 16, 12, '#EEF0F5')}</div>
          <div class="tag" style="opacity:.6;margin-top:34px">States · the eyes do the talking</div>
          <div style="display:flex;gap:18px;margin-top:16px">
            ${state('tray-white', 'Ready', '#2A2533')}${state('tray-white-left', 'Working ·', '#2A2533')}${state('tray-white-right', '· Working', '#2A2533')}
          </div>
          <div style="display:flex;gap:18px;margin-top:18px;align-items:flex-end">
            ${state('tray-white-alert', 'Needs you', '#2A2533')}
            <div style="font-size:14.5px;line-height:1.5;opacity:.75;max-width:230px;margin-left:6px;padding-bottom:28px">While it works, the eyes glance left and right. When it needs an answer, a tangerine dot appears.</div>
          </div>
          <div class="tag" style="opacity:.6;margin-top:30px">24 px · high-res screens</div>
          <div style="display:flex;gap:18px;margin-top:14px">${KIT.magnify(P + 'tray24-white-24.png', 24, 5, '#232029')}${KIT.magnify(P + 'tray24-black-24.png', 24, 5, '#EEF0F5')}</div>
        </div>
      </div>`;
    },

    // ================= 4. HERO =================
    async hero() {
      await ready;
      return `${CSS}<div class="bt grid">
        ${nav()}
        <div class="ab" style="left:56px;top:142px;width:620px">
          <div class="mono" style="font-size:13px;font-weight:700;color:#FF7A2F;letter-spacing:.2em">Free · Easy · Open source</div>
          <div class="disp" style="font-weight:800;font-size:122px;line-height:.92;letter-spacing:-.055em;margin-top:22px">Built<br>by <span style="color:#7B3FE4">you.</span></div>
          <div style="font-size:21px;line-height:1.5;margin-top:28px;opacity:.78;max-width:500px">An AI agent you own and shape. Use any AI model from any provider to work and build your way.</div>
          <div style="display:flex;gap:12px;margin-top:34px;align-items:center">
            <span style="font:600 17px 'Instrument Sans';background:#7B3FE4;color:#fff;padding:17px 26px;border-radius:16px;box-shadow:0 6px 0 #4A1FA6">Download for Windows</span>
            <span style="font:600 17px 'Instrument Sans';padding:15px 24px;border-radius:16px;border:2px solid #16121F">See the parts</span>
          </div>
          <div class="mono" style="font-size:11.5px;margin-top:22px;opacity:.5">v1.3.1 · Windows · Mac · Linux · Android</div>
        </div>
        <div class="ab" style="left:56px;bottom:40px;display:flex;align-items:center;gap:14px">
          <span class="tag" style="opacity:.5;margin-right:6px">Start from a kit</span>
          ${[{}, { head: '#16121F', arm: '#FF7A2F', foot: '#FF7A2F', eye: '#FF7A2F', face: 'visor' }, { head: '#2C2450', arm: '#7B3FE4', foot: '#7B3FE4', eye: '#5CF2C0', acc: 'antenna', accColor: '#5CF2C0' }, { head: '#FF8FB1', arm: '#16121F', foot: '#16121F', eye: '#5A1630', face: 'happy', acc: 'ears', accColor: '#FF8FB1' }, { head: '#FFD23F', arm: '#FF5A5F', foot: '#FF5A5F', eye: '#16121F', face: 'wink' }].map(m => `<div style="width:64px;height:64px;border-radius:16px;background:#fff;border:1.5px solid rgba(22,18,31,.1);display:grid;place-items:center">${markSvg(m, 44, '-.5 -2 25 24')}</div>`).join('')}
        </div>
        <div class="ab" style="left:700px;top:112px;width:800px;height:820px;border-radius:56px;background:#7B3FE4;overflow:hidden">
          <div class="ab" style="inset:0;background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:24px 24px"></div>
          <div class="ab mono" style="left:40px;top:34px;font-size:11.5px;color:#FFF6EC;opacity:.75">Assembly instructions · YC-00</div>
          <div class="ab mono" style="right:140px;top:34px;font-size:11.5px;color:#FFF6EC;opacity:.75">5 parts · 0 tools</div>
          <div class="ab" style="left:4px;top:196px">${exploded({ k: 12, W: 712, Hh: 520, lw: 186, col: { head: '#FFF6EC', arm: '#FF7A2F', foot: '#FF7A2F', eye: '#16121F' }, line: '#FFF6EC', text: '#FFF6EC', sub: 'rgba(255,246,236,.78)', dot: '#FF7A2F' })}</div>
        </div>
      </div>`;
    },

    // ================= 5. DOCS =================
    async docs() {
      await ready;
      const side = ['Getting started', 'Choosing a model', 'Skills', 'Themes', 'Privacy & data', 'Your files', 'Troubleshooting'];
      const row = (k, v) => `<div style="display:grid;grid-template-columns:210px 1fr;padding:13px 0;border-top:1px solid rgba(22,18,31,.1)"><span class="tag" style="opacity:.55;padding-top:2px">${k}</span><span style="font-size:15.5px">${v}</span></div>`;
      return `${CSS}<div class="bt" style="background:#FDFBF8">
        <div class="ab" style="left:0;right:0;top:0;height:68px;border-bottom:1px solid rgba(22,18,31,.1);display:flex;align-items:center;gap:22px;padding:0 40px;background:#FDFBF8">
          ${lockup(20)}<span class="mono" style="font-size:12px;opacity:.5">/ Docs</span>
          <div style="margin-left:auto;width:300px;height:36px;border-radius:10px;border:1px solid rgba(22,18,31,.14);display:flex;align-items:center;padding:0 12px;font-size:14px;color:rgba(22,18,31,.45)">Search the docs <span class="mono" style="margin-left:auto;font-size:11px">Ctrl K</span></div>
          <span style="font:600 14px 'Instrument Sans';background:#16121F;color:#FFF6EC;padding:9px 16px;border-radius:10px">Download</span>
        </div>
        <div class="ab" style="left:40px;top:108px;width:220px">
          <div class="tag" style="opacity:.45;margin-bottom:14px">Using YouCoded</div>
          ${side.map(s => `<div style="font-size:15px;padding:8px 12px;margin-left:-12px;border-radius:9px;display:flex;align-items:center;gap:10px;${s === 'Privacy & data' ? 'background:#F0E9FF;color:#4A1FA6;font-weight:600' : 'opacity:.72'}">${s === 'Privacy & data' ? '<span style="width:8px;height:14px;border-radius:3px;background:#7B3FE4"></span>' : ''}${s}</div>`).join('')}
        </div>
        <div class="ab" style="left:330px;top:108px;width:700px">
          <div class="mono" style="font-size:11.5px;opacity:.5">Docs / Trust / YC-DOC-07</div>
          <div class="disp" style="font-weight:600;font-size:44px;letter-spacing:-.035em;margin-top:16px">Privacy &amp; data</div>
          <div style="font-size:19px;line-height:1.55;margin-top:14px;opacity:.78">What YouCoded keeps, where it keeps it, and who sees your messages.</div>
          <div style="margin-top:28px;border-bottom:1px solid rgba(22,18,31,.1)">
            ${row('Conversations', 'Stored on this device.')}
            ${row('Your messages', 'Sent to the model provider you pick.')}
            ${row('Settings', 'In the <code style="font:500 14px JetBrains Mono;background:#F2EDE6;padding:2px 6px;border-radius:5px">~/.youcoded/</code> folder.')}
          </div>
          <div class="disp" style="font-weight:600;font-size:22px;letter-spacing:-.02em;margin-top:36px">Where your conversations live</div>
          <div style="font-size:16px;line-height:1.65;margin-top:10px;opacity:.82">Every conversation is saved on the computer or phone you had it on. You can find your settings in one folder in your home directory:</div>
          <div style="margin-top:14px;background:#16121F;color:#FFF6EC;border-radius:12px;padding:16px 18px;font:500 14px/1.6 'JetBrains Mono'"><span style="color:#CDB8FF">~/.youcoded/</span></div>
          <div class="disp" style="font-weight:600;font-size:22px;letter-spacing:-.02em;margin-top:36px">What leaves your device</div>
          <div style="font-size:16px;line-height:1.65;margin-top:10px;opacity:.82">When you send a message, it goes to the model provider you chose in Settings. Change provider, and the next message goes to the new one.</div>
          <div style="margin-top:40px;display:flex;justify-content:space-between;align-items:center;padding-top:20px;border-top:1px solid rgba(22,18,31,.1)">
            <div style="display:flex;gap:10px;align-items:center;font-size:14.5px;opacity:.8">Was this page useful? <span style="border:1px solid rgba(22,18,31,.18);border-radius:8px;padding:5px 12px">Yes</span><span style="border:1px solid rgba(22,18,31,.18);border-radius:8px;padding:5px 12px">No</span></div>
            <div style="border-radius:12px;border:1px solid rgba(22,18,31,.14);padding:10px 16px;text-align:right"><div class="tag" style="font-size:10px;opacity:.5">Next</div><div style="font-weight:600;font-size:15px;color:#4A1FA6">Your files →</div></div>
          </div>
        </div>
        <div class="ab" style="right:40px;top:108px;width:250px">
          <div class="tag" style="opacity:.45;margin-bottom:12px">On this page</div>
          ${['At a glance', 'Where your conversations live', 'What leaves your device'].map((s, i) => `<div style="font-size:14px;padding:6px 0 6px 14px;border-left:2px solid ${i === 0 ? '#7B3FE4' : 'rgba(22,18,31,.1)'};${i === 0 ? 'color:#4A1FA6;font-weight:600' : 'opacity:.65'}">${s}</div>`).join('')}
          <div style="margin-top:34px;border-radius:16px;background:#F4EFE7;padding:18px">
            <div style="display:flex;gap:12px;align-items:center">${markSvg({ head: '#16121F', arm: '#16121F', foot: '#16121F', eye: '#F4EFE7' }, 36)}<div class="tag" style="font-size:10.5px">Part YC-01 · Head</div></div>
            <div style="font-size:14px;line-height:1.5;margin-top:10px;opacity:.75">Which model reads your messages is the part you choose. See <span style="color:#4A1FA6;text-decoration:underline">Choosing a model</span>.</div>
          </div>
        </div>
      </div>`;
    },

    // ================= 6. THEMES =================
    async themes() {
      await ready;
      const C = BUILT.C;
      const kits = [
        { name: 'Factory', no: 'T-00', card: '#FFF6EC', fg: '#16121F', m: {}, parts: ['Head · Purple', 'Face · Pill eyes', 'Finish · Solid', 'Extra · None'] },
        { name: 'Garage', no: 'T-01', card: '#FF7A2F', fg: '#16121F', m: { head: '#16121F', arm: '#FFF6EC', foot: '#FFF6EC', eye: '#FF7A2F', face: 'visor' }, parts: ['Head · Ink', 'Face · Visor', 'Finish · Solid', 'Extra · None'] },
        { name: 'Night Shift', no: 'T-02', card: '#1A1530', fg: '#FFF6EC', m: { head: '#2C2450', arm: '#7B3FE4', foot: '#7B3FE4', eye: '#5CF2C0', acc: 'antenna', accColor: '#5CF2C0' }, parts: ['Head · Midnight', 'Face · Glow eyes', 'Finish · Solid', 'Extra · Antenna'] },
        { name: 'Strawberry', no: 'T-03', card: '#FFE1EA', fg: '#5A1630', m: { head: '#FF8FB1', arm: '#FFF6EC', foot: '#FFF6EC', eye: '#5A1630', face: 'happy', acc: 'ears', accColor: '#FF8FB1' }, parts: ['Head · Pink', 'Face · Happy', 'Finish · Solid', 'Extra · Ears'] },
        { name: 'Blueprint', no: 'T-04', card: '#1F4FD1', fg: '#EAF0FF', m: { head: '#EAF0FF', arm: '#EAF0FF', foot: '#EAF0FF', eye: '#EAF0FF', finish: 'outline', face: 'dot', sw: .7 }, parts: ['Head · Line', 'Face · Dots', 'Finish · Outline', 'Extra · None'] },
        { name: 'Pop', no: 'T-05', card: '#FFD23F', fg: '#16121F', m: { head: '#FFF6EC', arm: '#FF5A5F', foot: '#FF5A5F', eye: '#16121F', face: 'wink', finish: 'halftone', acc: 'sprout', accColor: '#16121F' }, parts: ['Head · Halftone', 'Face · Wink', 'Finish · Print', 'Extra · Sprout'] },
      ];
      const card = (k) => `<div style="width:206px;height:560px;border-radius:26px;background:${k.card};color:${k.fg};position:relative;padding:44px 18px 18px;box-shadow:0 18px 40px rgba(22,18,31,.14)">
          <div style="position:absolute;left:50%;top:14px;width:46px;height:12px;margin-left:-23px;border-radius:6px;background:#FFF6EC;box-shadow:inset 0 2px 3px rgba(0,0,0,.25)"></div>
          <div class="tag" style="font-size:10px;opacity:.7">Kit ${k.no}</div><div class="disp" style="font-weight:800;font-size:21px;letter-spacing:-.02em;margin-top:4px">${k.name}</div>
          <div style="margin-top:16px;height:210px;border-radius:22px;background:rgba(255,255,255,.22);border:1.5px solid rgba(255,255,255,.55);box-shadow:inset 0 0 0 1px rgba(0,0,0,.05),inset 8px 8px 20px rgba(255,255,255,.25);display:grid;place-items:center;position:relative;overflow:hidden">
            <div style="position:absolute;left:14px;top:10px;width:40px;height:120px;border-radius:20px;background:linear-gradient(180deg,rgba(255,255,255,.55),rgba(255,255,255,0));transform:rotate(18deg)"></div>
            ${markSvg(k.m, 150, '-.5 -2 25 24')}</div>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:0">${k.parts.map(p => `<div class="tag" style="font-size:10.5px;padding:8px 0;border-top:1px solid ${k.fg === '#16121F' || k.fg === '#5A1630' ? 'rgba(22,18,31,.15)' : 'rgba(255,255,255,.2)'};display:flex;justify-content:space-between"><span style="opacity:.6">${p.split(' · ')[0]}</span><span>${p.split(' · ')[1]}</span></div>`).join('')}</div>
          <div class="tag" style="position:absolute;left:18px;bottom:16px;font-size:9.5px;opacity:.55">Snaps onto any YouCoded</div>
        </div>`;
      return `${CSS}<div class="bt grid">
        <div class="ab mono" style="left:56px;top:34px;font-size:11.5px;opacity:.55">Sheet 6/6 · Themes</div>
        <div class="ab disp" style="left:56px;top:66px;font-weight:800;font-size:44px;letter-spacing:-.04em">One layout. Endless parts.</div>
        <div class="ab" style="left:56px;right:56px;top:150px;display:flex;justify-content:space-between">${kits.map(card).join('')}</div>
        <div class="ab" style="left:56px;right:56px;bottom:40px;display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div style="border-radius:18px;background:#16121F;color:#FFF6EC;padding:18px 22px;display:flex;gap:18px;align-items:center">
            <div class="tag" style="color:#FF7A2F;width:120px;flex:none">Always the same</div>
            <div style="font-size:16px;line-height:1.45">Five blocks in this layout · the gaps between them · the wordmark</div></div>
          <div style="border-radius:18px;border:2px dashed rgba(22,18,31,.35);padding:16px 22px;display:flex;gap:18px;align-items:center">
            <div class="tag" style="color:#7B3FE4;width:120px;flex:none">Yours to change</div>
            <div style="font-size:16px;line-height:1.45">Colour · face · finish · one extra on top of the head</div></div>
        </div>
      </div>`;
    },
  };

  window.TERR = { id: 'built', name: 'Built by you', boards };
})();
