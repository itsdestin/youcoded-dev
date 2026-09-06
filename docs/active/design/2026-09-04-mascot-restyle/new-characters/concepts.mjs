// Nine candidate characters — three per theme with no mascot. Each is a palette handed to the
// theme-builder generator plus a little slot art; the body, limbs and eight faces are the
// shared contract and never move.
import { buildRig } from '/home/destin/youcoded-dev/worktrees/theme-builder/wecoded-themes-plugin/skills/theme-builder/scripts/build-mascot.mjs';

const decorate = (rig, { hat = '', eyewear = '', item = '', body = '' }) => {
  let s = rig;
  if (hat) s = s.replace('<g id="slot-hat"/>', `<g id="slot-hat">${hat}</g>`);
  if (eyewear) s = s.replace('<g id="slot-eyewear"/>', `<g id="slot-eyewear">${eyewear}</g>`);
  if (item) s = s.replace('<g id="slot-item"/>', `<g id="slot-item">${item}</g>`);
  // Body extras paint on the capsule, under the face.
  if (body) s = s.replace('      <g id="rig-face-idle">', `      ${body}\n      <g id="rig-face-idle">`);
  return s;
};

export const CONCEPTS = {
  'cotton-candy-sky': [
    { id: 'moon', label: 'A — Moonlet',
      cfg: { id: 'ccA', skin: 'outline', body: '#F7EFFB', line: '#4A2E63', shade: '#D5BCE0',
             face: { ink: '#3A2350' }, catchlight: 'pair', spark: ['#FFFFFF', '#FFFFFF'],
             sparkOpacity: [1, 0.85], accent: '#8B47B8' },
      art: { hat: '<path d="M12 3.4 A2.6 2.6 0 1 0 12 -1.2 A3.4 3.4 0 1 1 12 3.4 Z" fill="#8B47B8"/>'
                + '<circle cx="9.2" cy="0.4" r="0.3" fill="#C79BE0"/>',
             body: '<g fill="#C79BE0" opacity="0.75"><circle cx="6.6" cy="6.2" r="0.28"/><circle cx="17.4" cy="7" r="0.22"/><circle cx="7.4" cy="14.2" r="0.2"/></g>' } },
    { id: 'cloud', label: 'B — Cloudpuff',
      cfg: { id: 'ccB', skin: 'solid', body: '#C9A7E0', highlight: '#EFDFF8', shade: '#8B47B8',
             face: { ink: '#2C1740' }, catchlight: 'cluster',
             spark: ['#FFFFFF', '#F2E2FA', '#E0C8F0'], accent: '#8B47B8' },
      art: { hat: '<g fill="#FBF5FC" stroke="#B597C6" stroke-width="0.22">'
                + '<circle cx="9.6" cy="2.6" r="1.7"/><circle cx="12.4" cy="1.9" r="2.1"/><circle cx="15" cy="2.8" r="1.5"/></g>' } },
    { id: 'star', label: 'C — Stargazer',
      cfg: { id: 'ccC', skin: 'outline', body: '#F7EFFB', line: '#4A2E63', shade: '#D5BCE0',
             face: { ink: '#3A2350' }, catchlight: 'pair', spark: ['#FFFFFF', '#FFFFFF'],
             sparkOpacity: [1, 0.85], accent: '#8B47B8' },
      art: { eyewear: '<g fill="none" stroke="#8B47B8" stroke-width="0.4">'
                    + '<circle cx="9.3" cy="9.6" r="2.5"/><circle cx="14.7" cy="9.3" r="2.5"/><path d="M11.8 9.5 L12.2 9.4"/></g>',
             item: '<path d="M23.2 7.1 L23.9 8.5 L25.4 8.7 L24.3 9.8 L24.6 11.3 L23.2 10.6 L21.8 11.3 L22.1 9.8 L21 8.7 L22.5 8.5 Z" fill="#8B47B8"/>'
                 + '<path d="M23.2 11.1 L23.2 13.6" stroke="#B597C6" stroke-width="0.35" stroke-linecap="round"/>' } },
  ],
  'meadow-mist': [
    { id: 'sprout', label: 'A — Sprout',
      cfg: { id: 'mmA', skin: 'outline', body: '#F4FAF2', line: '#1E3426', shade: '#BAD0B6',
             face: { ink: '#132A1B' }, catchlight: 'pair', spark: ['#FFFFFF', '#FFFFFF'],
             sparkOpacity: [1, 0.85], accent: '#2F7D55' },
      art: { hat: '<path d="M12 4 L12 1.4" stroke="#2F7D55" stroke-width="0.45" stroke-linecap="round"/>'
                + '<path d="M12 2.4 Q9.4 2.2 9.6 0.2 Q11.9 0.4 12 2.4 Z" fill="#3F9A69"/>'
                + '<path d="M12 2 Q14.6 1.6 14.8 -0.4 Q12.2 -0.1 12 2 Z" fill="#2F7D55"/>' } },
    { id: 'toadstool', label: 'B — Toadstool',
      cfg: { id: 'mmB', skin: 'outline', body: '#FBF7EC', line: '#1E3426', shade: '#D9CDB4',
             face: { ink: '#1E3426' }, catchlight: 'pair', spark: ['#FFFFFF', '#FFFFFF'],
             sparkOpacity: [1, 0.85], accent: '#C0392B' },
      art: { hat: '<path d="M5.6 4 A6.4 4.6 0 0 1 18.4 4 Z" fill="#C0392B" stroke="#1E3426" stroke-width="0.4" stroke-linejoin="round"/>'
                + '<g fill="#FBF7EC"><ellipse cx="8.6" cy="2.5" rx="1" ry="0.72"/><ellipse cx="12.6" cy="1.3" rx="1.2" ry="0.85"/><ellipse cx="15.9" cy="2.8" rx="0.8" ry="0.6"/></g>' } },
    { id: 'fern', label: 'C — Fernkin',
      cfg: { id: 'mmC', skin: 'solid', body: '#A8C9A6', highlight: '#DCEBD8', shade: '#2F7D55',
             face: { ink: '#122A18' }, catchlight: 'cluster',
             spark: ['#FFFFFF', '#EAF5E6', '#C4DCBF'], accent: '#2F7D55', tail: true },
      art: { hat: '<g fill="none" stroke="#2F7D55" stroke-width="0.42" stroke-linecap="round">'
                + '<path d="M9 4 L7.6 0.6"/><path d="M8.5 2.6 L7 2.2"/><path d="M8.1 1.6 L6.9 1"/>'
                + '<path d="M15 4 L16.4 0.6"/><path d="M15.5 2.6 L17 2.2"/><path d="M15.9 1.6 L17.1 1"/></g>' } },
  ],
  'devils-garden': [
    { id: 'cactus', label: 'A — Saguaro',
      cfg: { id: 'dgA', skin: 'solid', body: '#2E6B63', highlight: '#4E9A8E', shade: '#123330',
             face: { ink: '#FFC627' }, catchlight: 'cluster',
             spark: ['#FFF4D0', '#FFC627', '#FF8FA8'], accent: '#FFC627' },
      art: { body: '<g stroke="#123330" stroke-width="0.3" stroke-opacity="0.55" stroke-linecap="round">'
                 + '<path d="M7.4 5.6 L7.4 14.6"/><path d="M16.6 5.6 L16.6 14.6"/></g>'
                 + '<g stroke="#8FD8CB" stroke-width="0.22" stroke-opacity="0.5" stroke-linecap="round">'
                 + '<path d="M6.2 7 L6.2 13.4"/><path d="M17.8 7 L17.8 13.4"/></g>',
             hat: '<g><path d="M12 4 L12 2.4" stroke="#3F7F76" stroke-width="0.4"/>'
                + '<circle cx="12" cy="1.7" r="1.25" fill="#FF8FA8"/><circle cx="12" cy="1.7" r="0.45" fill="#FFC627"/></g>' } },
    { id: 'bone', label: 'A — Bone',
      cfg: { id: 'dgBone', skin: 'solid', body: '#EAD7B4', highlight: '#FBEFD6', shade: '#9A7C52',
             face: { ink: '#241018' }, catchlight: 'cluster',
             spark: ['#FFF4D0', '#FFC627', '#E0BE86'], accent: '#8C3050' },
      art: { hat: '<path d="M4.6 3.9 Q12 5.4 19.4 3.9 Q19.4 3.2 16.8 2.9 L16.4 0.6 Q12 -0.5 7.6 0.6 L7.2 2.9 Q4.6 3.2 4.6 3.9 Z" fill="#7A3048" stroke="#4A1A2A" stroke-width="0.3" stroke-linejoin="round"/>'
                + '<path d="M7.4 2.4 Q12 3.3 16.6 2.4" fill="none" stroke="#FFC627" stroke-width="0.45"/>' } },
    { id: 'sandstone', label: 'B — Sandstone',
      cfg: { id: 'dgSand', skin: 'solid', body: '#C4703F', highlight: '#E8A472', shade: '#7A3C1E',
             face: { ink: '#2A1008' }, catchlight: 'cluster',
             spark: ['#FFE9C0', '#FFC627', '#FF9E6B'], accent: '#FFC627' },
      art: { hat: '<path d="M4.6 3.9 Q12 5.4 19.4 3.9 Q19.4 3.2 16.8 2.9 L16.4 0.6 Q12 -0.5 7.6 0.6 L7.2 2.9 Q4.6 3.2 4.6 3.9 Z" fill="#7A3048" stroke="#4A1A2A" stroke-width="0.3" stroke-linejoin="round"/>'
                + '<path d="M7.4 2.4 Q12 3.3 16.6 2.4" fill="none" stroke="#FFC627" stroke-width="0.45"/>' } },
    { id: 'plum', label: 'C — Plum',
      cfg: { id: 'dgPlum', skin: 'solid', body: '#3A1C33', highlight: '#5A3050', shade: '#160A14',
             face: { ink: '#FFC627', fill: '#1E0E1A', rim: '#FFC627', rimW: 0.3 },
             catchlight: 'cluster', spark: ['#FFF4D0', '#FF8FA8', '#FFC627'], accent: '#FFC627' },
      art: { hat: '<path d="M4.6 3.9 Q12 5.4 19.4 3.9 Q19.4 3.2 16.8 2.9 L16.4 0.6 Q12 -0.5 7.6 0.6 L7.2 2.9 Q4.6 3.2 4.6 3.9 Z" fill="#7A3048" stroke="#4A1A2A" stroke-width="0.3" stroke-linejoin="round"/>'
                + '<path d="M7.4 2.4 Q12 3.3 16.6 2.4" fill="none" stroke="#FFC627" stroke-width="0.45"/>' } },
    { id: 'ember', label: 'C — Ember',
      cfg: { id: 'dgC', skin: 'solid', body: '#2E1828', highlight: '#4A2840', shade: '#0E0610',
             face: { ink: '#FFC627', fill: '#1A0C18', rim: '#FFC627', rimW: 0.3 },
             catchlight: 'cluster', spark: ['#FFF4D0', '#FF8FA8', '#FFC627'],
             accent: '#FFC627', accent2: '#8C3050', tail: true },
      art: { hat: '<g fill="#8C3050" stroke="#FFC627" stroke-width="0.26">'
                + '<path d="M7.6 4 L6.4 0.8 L9.8 3.2 Z"/><path d="M16.4 4 L17.6 0.8 L14.2 3.2 Z"/></g>' } },
  ],
};

export function rigFor(slug, id) {
  const c = CONCEPTS[slug].find((x) => x.id === id);
  if (!c) throw new Error(`no concept ${slug}/${id}`);
  return decorate(buildRig(c.cfg), c.art);
}
