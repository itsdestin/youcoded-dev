// Take 1C: the little app windows the quill makes, drawn in the book's own line art.
// WHY windows at all: the reviewer's main finding was that no frame showed what youcoded IS. A window that
// someone asks for in plain words, and that draws itself in, is the product idea in one picture: one open app
// that becomes what each person asks for. Every window has its own layout and palette, so "everyone's copy is
// different" reads without a word.
// WHY drawn, not filmed: the film is a hand-inked picture book; a screenshot would break the style, and the
// brand guide forbids drawing the app's real interface. These are deliberately generic storybook windows (no
// real chrome, no logo, none of the app's themes), standing for "a thing a person made by asking".
import React from 'react';
import { DMSANS } from '../brand';
import { Appear, Ink, lin, P, Shape, useT, Wash } from './take1c-ink';
import { MotifArt, Motif, Palette } from './take1c-motifs';

/** A rounded rectangle as a path that starts at the top-left corner and runs clockwise (so it "draws" round). */
export const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
  `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;

export type Chrome = 'sidebar' | 'tabs' | 'cards' | 'plain';
export type Content = Motif | 'plants';

/** The plant tracker: three pots, each with its name and how much water it has left. The film's one worked
 *  example, because "help me keep my plants alive" is something no shop sells in exactly your shape. */
const Plants: React.FC<{ x: number; y: number; w: number; h: number; a: number; pal: Palette }> = ({ x, y, w, h, a, pal }) => {
  const names = ['fern', 'basil', 'cactus'];
  const water = [0.75, 0.3, 0.9];
  const cw = w / 3;
  return (
    <>
      {names.map((n, i) => {
        const cx = x + cw * (i + 0.5);
        // WHY 190: pot, name and water bar together are ~190 units tall at scale 1; they must all fit above the request
        const s = Math.min(cw / 120, h / 190);
        const top = y + 4;
        const k = a + i * 0.14;
        return (
          <g key={n}>
            <g transform={`translate(${cx} ${top + 64 * s}) scale(${s})`}>
              <Shape d="M -24 0 L 24 0 L 18 40 L -18 40 Z" a={k} b={k + 0.3} fill={i === 1 ? pal.a : pal.bg} w={2.6} />
              {i === 0 && <Ink d="M 0 0 C -4 -20 -22 -30 -30 -44 M 0 0 C 2 -24 10 -38 4 -56 M 0 0 C 8 -18 24 -26 30 -40" a={k + 0.15} b={k + 0.45} w={3} c={P.ink} />}
              {i === 1 && <Shape d="M 0 0 C -18 -10 -20 -30 -6 -40 C 4 -30 6 -12 0 0 Z M 0 0 C 16 -8 26 -26 16 -36 C 4 -28 0 -12 0 0 Z" a={k + 0.15} b={k + 0.45} fill={pal.b} w={2.4} />}
              {i === 2 && <Shape d="M -10 0 L -10 -40 Q 0 -54 10 -40 L 10 0 Z M -10 -22 L -20 -22 L -20 -34 M 10 -16 L 20 -16 L 20 -28" a={k + 0.15} b={k + 0.45} fill={pal.b} w={2.4} />}
            </g>
            <Appear a={k + 0.3}>
              <text x={cx} y={top + 132 * s} textAnchor="middle" fontFamily={DMSANS} fontWeight={700} fontSize={17 * Math.max(0.8, s)} fill={P.ink}>{n}</text>
            </Appear>
            {/* how much water it has left: a drop and a short bar */}
            <g transform={`translate(${cx - 34 * s} ${top + 150 * s}) scale(${s})`}>
              <Shape d="M 0 -8 C 4 -2 7 2 7 5 A 7 7 0 0 1 -7 5 C -7 2 -4 -2 0 -8 Z" a={k + 0.35} b={k + 0.55} fill={pal.a} w={1.8} />
              <Shape d={rr(14, -2, 56, 10, 5)} a={k + 0.35} b={k + 0.6} fill={P.paper} w={1.8} />
              <Wash d={rr(14, -2, 56 * water[i], 10, 5)} a={k + 0.55} fill={water[i] < 0.4 ? P.sun : pal.a} />
            </g>
          </g>
        );
      })}
    </>
  );
};

type WinProps = {
  x: number; y: number; w: number; h: number;     // centre and size, in page units
  a: number;                                       // when its outline starts to draw
  draw?: number;                                   // how long the outline takes (the quill drawing it)
  pal: Palette; chrome?: Chrome; content: Content;
  contentAt?: number;                              // when the inside draws (defaults to just after the outline)
  request?: { text: string; at: number; dur: number };
  ea?: number;
};
/** One small app window: a rounded frame, a coloured title bar, a layout, and what it was asked to be. */
export const AppWindow: React.FC<WinProps> = ({ x, y, w, h, a, draw = 0.5, pal, chrome = 'plain', content, contentAt, request, ea }) => {
  const t = useT();
  const x0 = x - w / 2, y0 = y - h / 2;
  const bar = Math.max(20, h * 0.11);
  const r = Math.min(16, w * 0.06);
  const c = contentAt ?? a + draw * 0.9;
  // the request sits in a speech bubble at the foot of the window; the rest of the body is what it made
  const reqH = request ? Math.max(40, h * 0.17) : 0;
  const body = { x: x0 + 10, y: y0 + bar + 10, w: w - 20, h: h - bar - 20 - (request ? reqH + 10 : 0) };
  let inner = { ...body };
  const fade = ea == null ? 1 : 1 - lin(t, ea, ea + 0.4);
  if (fade <= 0.001) return null;
  const chromeEls: React.ReactNode[] = [];
  if (chrome === 'sidebar') {
    const sw = body.w * 0.26;
    chromeEls.push(<Wash key="s" d={rr(body.x, body.y, sw, body.h, 8)} a={c} fill={pal.bg} />);
    [0, 1, 2].forEach((i) => chromeEls.push(<Wash key={`r${i}`} d={rr(body.x + 8, body.y + 12 + i * 30, sw - 16, 16, 8)} a={c + 0.1 + i * 0.06} fill={i === 0 ? pal.a : P.paper} />));
    inner = { x: body.x + sw + 8, y: body.y, w: body.w - sw - 8, h: body.h };
  } else if (chrome === 'tabs') {
    [0, 1, 2].forEach((i) => chromeEls.push(<Wash key={`t${i}`} d={rr(body.x + i * (body.w / 3.2), body.y, body.w / 3.6, 18, 9)} a={c + i * 0.06} fill={i === 0 ? pal.a : pal.bg} />));
    inner = { x: body.x, y: body.y + 26, w: body.w, h: body.h - 26 };
  } else if (chrome === 'cards') {
    const ch = body.h * 0.26;
    [0, 1].forEach((i) => chromeEls.push(<Wash key={`c${i}`} d={rr(body.x + i * (body.w / 2 + 4), body.y + body.h - ch, body.w / 2 - 4, ch, 8)} a={c + 0.2 + i * 0.08} fill={i ? pal.bg : pal.a} o={0.85} />));
    inner = { x: body.x, y: body.y, w: body.w, h: body.h - ch - 8 };
  }
  // MotifArt drawings are about 260 x 240 at scale 1
  const ms = Math.min(inner.w / 270, inner.h / 250);
  const typed = request ? Math.floor(request.text.length * lin(t, request.at, request.at + request.dur, (v) => v)) : 0;
  return (
    <g opacity={fade}>
      <Wash d={rr(x0, y0, w, h, r)} a={a + draw * 0.6} fill={P.paper} />
      <Wash d={`M ${x0} ${y0 + bar} L ${x0} ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} L ${x0 + w - r} ${y0} Q ${x0 + w} ${y0} ${x0 + w} ${y0 + r} L ${x0 + w} ${y0 + bar} Z`} a={a + draw * 0.8} fill={pal.bg} />
      {chromeEls}
      {content === 'plants'
        ? <Plants x={inner.x} y={inner.y} w={inner.w} h={inner.h} a={c} pal={pal} />
        : <MotifArt kind={content} x={inner.x + inner.w / 2} y={inner.y + inner.h / 2 + 6 * ms} s={ms} a={c} pal={pal} />}
      <Ink d={`M ${x0} ${y0 + bar} L ${x0 + w} ${y0 + bar}`} a={a + draw * 0.7} b={a + draw} w={2.4} />
      <Appear a={a + draw * 0.8}><circle cx={x0 + bar * 0.7} cy={y0 + bar / 2} r={bar * 0.2} fill={pal.a} stroke={P.ink} strokeWidth={1.6} /></Appear>
      <Ink d={rr(x0, y0, w, h, r)} a={a} b={a + draw} w={3} />
      {request && (
        <g>
          <Shape d={rr(x0 + w * 0.12, y0 + h - reqH - 12, w * 0.84, reqH, reqH / 2)} a={request.at - 0.25} b={request.at} fill={pal.bg} w={2.2} />
          {typed > 0 && (
            <text x={x0 + w * 0.12 + reqH * 0.45} y={y0 + h - 12 - reqH / 2 + reqH * 0.15} fontFamily={DMSANS} fontWeight={500} fontSize={reqH * 0.42} fill={P.ink}>
              {request.text.slice(0, typed)}
              {typed < request.text.length && <tspan fill={P.purple}>|</tspan>}
            </text>
          )}
        </g>
      )}
    </g>
  );
};

/** A window seen small and finished, for crowds and flights: no drawing-in, just there. */
export const MiniWindow: React.FC<{ x: number; y: number; w: number; h: number; pal: Palette; chrome: Chrome; content: Content; r?: number; s?: number }> = ({ x, y, w, h, pal, chrome, content, r = 0, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <AppWindow x={0} y={0} w={w} h={h} a={-10} pal={pal} chrome={chrome} content={content} />
  </g>
);

