(async () => {
  // Visual prototype ONLY, injected into isolated Workbench captures. The app does
  // not import this file. Derive from the actual wallpaper's covered header crop;
  // the registry average color cannot represent where a control is painted.
  const bg = document.querySelector('#theme-bg');
  const background = bg && getComputedStyle(bg).backgroundImage;
  if (!background?.startsWith('url(')) {
    window.__inkPreview = { sampled: false, reason: 'no image wallpaper' };
    return true;
  }
  const image = new Image();
  image.src = background.slice(5, -2);
  try { await image.decode(); } catch (error) {
    window.__inkPreview = { sampled: false, reason: String(error) };
    return false;
  }
  const width = innerWidth, height = innerHeight;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const paintedWidth = image.naturalWidth * scale;
  const paintedHeight = image.naturalHeight * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 40;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    context.drawImage(image, (width - paintedWidth) / 2, (height - paintedHeight) / 2,
      paintedWidth, paintedHeight);
  } catch (error) {
    window.__inkPreview = { sampled: false, reason: String(error) };
    return false;
  }
  const pixels = context.getImageData(0, 0, width, 40).data;
  const at = (x, y = 20) => {
    const i = (Math.max(0, Math.min(39, y)) * width + Math.max(0, Math.min(width - 1, x))) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };
  const luminance = color => {
    const p = color.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return p[0] * .2126 + p[1] * .7152 + p[2] * .0722;
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + .05) / (lo + .05);
  };
  const mix = (a, b, fraction) => a.map((v, i) => Math.round(v * (1 - fraction) + b[i] * fraction));
  const hex = s => (s.match(/[0-9a-f]{2}/gi) ?? []).slice(0, 3).map(v => parseInt(v, 16));
  const cssColor = rgb => `rgb(${rgb.map(Math.round).join(' ')})`;
  const tokens = getComputedStyle(document.documentElement);
  const fg2 = hex(tokens.getPropertyValue('--fg-2'));
  const panel = hex(tokens.getPropertyValue('--panel'));
  const header = document.querySelector('.header-bar')?.getBoundingClientRect();
  const samples = [];
  for (let x = 16; x < width; x += 24) samples.push(at(x, Math.max(4, Math.min(32, Math.round(header?.height / 2 ?? 20)))));
  const floor = candidate => Math.min(...samples.map(bg => ratio(candidate, bg)));
  const controlSamples = [...document.querySelectorAll('.header-bar > :first-child > button, .header-bar > :first-child > div:not(.wide-view-toggle) > button, .header-bar > :last-child > div > button, .header-bar .wide-view-toggle, .session-strip')]
    .filter(el => el.getBoundingClientRect().width > 10)
    .map(el => { const rect = el.getBoundingClientRect(); return at(Math.round(rect.left + rect.width / 2)); });
  const controlFloor = candidate => Math.min(...controlSamples.map(bg => ratio(candidate, bg)));
  const parseColor = value => {
    // Tailwind emits oklch for neutral gray, color(srgb ...) for semantic hues,
    // and older themes use rgb. Let Chromium itself convert them all to sRGB.
    const swatch = document.createElement('canvas');
    swatch.width = swatch.height = 1;
    const painter = swatch.getContext('2d', { willReadFrequently: true });
    painter.fillStyle = value;
    painter.fillRect(0, 0, 1, 1);
    return [...painter.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };

  // The previous design went almost white everywhere. Prefer a theme color
  // unchanged when it already clears 3:1 for icons; otherwise nudge the
  // theme's own panel color just enough toward its page color to clear 3:1.
  // A wallpaper spanning both light and dark patches may make a single ink
  // impossible; that case needs a local backing rather than a fake pass.
  let ink = fg2;
  let usedPanelInk = false;
  if (controlFloor(fg2) < 3.05) {
    usedPanelInk = true;
    // Keep the tint of the theme's panel instead of jumping to near-white
    // canvas. Raise only as far as the actual icon positions require.
    ink = panel;
    if (controlFloor(ink) < 3.05) {
      for (let step = 1; step <= 20; step++) {
        const candidate = mix(panel, [255, 255, 255], step / 20);
        if (controlFloor(candidate) >= 3.05) { ink = candidate; break; }
      }
    }
    // A wallpaper can place both very pale and very dark pixels in one bar;
    // no single ink can then pass. Keep the gentler panel tint for review.
  }

  const dotSamples = [...document.querySelectorAll('.session-strip .session-dot')]
    .map(dot => { const rect = dot.getBoundingClientRect(); return at(Math.round(rect.left + rect.width / 2)); });
  const dotFloor = candidate => Math.min(...dotSamples.map(bg => ratio(candidate, bg)));
  const rgbToHsl = rgb => {
    const [r, g, b] = rgb.map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s, l];
  };
  const hslToRgb = (h, s, l) => {
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - chroma / 2;
    const sectors = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
    return sectors[Math.min(5, Math.floor(h / 60))].map(v => Math.round((v + m) * 255));
  };
  if (usedPanelInk) {
    // At 3:1 the palette-derived panel tint can still look almost white.
    // Retain the panel's HUE and raise its chroma before the final contrast
    // check, rather than forcing a white icon on every blue wallpaper.
    const [h, saturation, initialLightness] = rgbToHsl(ink);
    for (let step = 0; step <= 20; step++) {
      const candidate = hslToRgb(h, Math.max(.58, saturation), Math.min(.98, initialLightness + step / 200));
      if (controlFloor(candidate) >= 3.05) { ink = candidate; break; }
    }
  }
  const statuses = {};
  for (const color of ['red', 'green', 'amber', 'blue']) {
    const dot = document.querySelector(`.session-dot[data-status='${color}']`);
    if (!dot) continue;
    const original = parseColor(getComputedStyle(dot).backgroundColor);
    if (!original) continue;
    let result = original;
    if (dotFloor(original) < 3.05) {
      const [h, s, l] = rgbToHsl(original);
      // Try both lighter and darker high-chroma hues; pick the smallest hue-
      // preserving lightness movement that actually clears the wallpaper.
      const options = [];
      // Over dark blue/purple wallpaper, pushing a status hue toward black
      // technically passes contrast but makes red/green look muddy. Prefer
      // a vivid lighter variant there; on pale wallpaper, go darker.
      const averageDotLum = dotSamples.reduce((sum, sample) => sum + luminance(sample), 0) / dotSamples.length;
      const preferredDirection = averageDotLum < .25 ? 1 : -1;
      for (const direction of [preferredDirection, -preferredDirection]) {
        for (let step = 0; step <= 50; step++) {
          const lightness = Math.max(.02, Math.min(.98, l + direction * step / 100));
          const candidate = hslToRgb(h, Math.max(.85, s), lightness);
          if (dotFloor(candidate) >= 3.05) { options.push(candidate); break; }
        }
        if (options.length) break;
      }
      if (options.length) result = options[0];
    }
    statuses[color] = { original, result, ratio: Number(dotFloor(result).toFixed(2)) };
  }
  const grayDot = document.querySelector(".session-dot[data-status='gray']");
  let gray = grayDot && parseColor(getComputedStyle(grayDot).backgroundColor);
  if (gray && dotFloor(gray) < 2.05) {
    // Idle is deliberately quieter than active dots and remains NEUTRAL gray.
    // Avoid the previous white idle dot; stop at 2:1 instead of active's 3:1.
    const bgLuminance = dotSamples.reduce((sum, sample) => sum + luminance(sample), 0) / dotSamples.length;
    const target = bgLuminance < .25 ? [38, 45, 50] : [185, 194, 193];
    for (let step = 1; step <= 20; step++) {
      const candidate = mix(gray, target, step / 20);
      if (dotFloor(candidate) >= 2.05) { gray = candidate; break; }
    }
  }
  const selector = "[data-header-lens='cushion'][data-chrome-style='float']";
  const marker = document.createElement('style');
  marker.id = 'wallpaper-ink-preview';
  marker.textContent = [
    `${selector} .header-bar button:not(.bg-accent), ${selector} .header-bar button:not([data-session-id]):not(.bg-accent) svg {color:${cssColor(ink)}; filter:drop-shadow(0 1px 2px rgba(0,0,0,.18))}`,
    // A selected name is TEXT, not an icon; its own darker local glass keeps
    // contrast without forcing icon ink to pure white across the whole header.
    `${selector} .session-strip [data-session-id].bg-panel {background-color:color-mix(in srgb,var(--panel) 35%,transparent)}`,
    `${selector} .session-strip [data-session-id].bg-panel .session-pill__label {color:${cssColor(ink)}}`,
    // WHY colors alone failed: `breathe` lowers active dots to 0.3 opacity,
    // compositing any passing hue back into its wallpaper at the low point.
    '@keyframes preview-status-breathe { 0%,100% {opacity:.8} 50% {opacity:1} }',
    ...Object.entries(statuses).map(([name, entry]) => `${selector} .session-dot[data-status='${name}'] {background-color:${cssColor(entry.result)};box-shadow:none;animation-name:preview-status-breathe !important}`),
    gray ? `${selector} .session-dot[data-status='gray'] {background-color:${cssColor(gray)};opacity:1 !important;box-shadow:none}` : '',
  ].join('\n');
  document.head.append(marker);
  window.__inkPreview = { sampled: true, theme: document.documentElement.dataset.theme,
    ink, inkRatio: Number(controlFloor(ink).toFixed(2)), barRatio: Number(floor(ink).toFixed(2)), statuses,
    gray: gray && { rgb: gray, ratio: Number(dotFloor(gray).toFixed(2)) } };
  return true;
})()
