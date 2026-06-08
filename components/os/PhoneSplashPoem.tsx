import React from 'react';
import './PhoneSplashPoem.css';

type SplashLineId = 'wake' | 'reason' | 'heart' | 'birds' | 'migrate' | 'escape';

interface SplashCharConfig {
  char: string;
  className?: string;
  x?: string;
  y?: string;
  r?: string;
  s?: number;
  delayOffset?: number;
  finalOpacity?: number;
}

interface SplashLineConfig {
  id: SplashLineId;
  text: string;
  className: string;
  baseDelay: number;
  finalOpacity: number;
  chars?: SplashCharConfig[];
}

interface SplashGlyph extends Required<Omit<SplashCharConfig, 'className'>> {
  className: string;
  index: number;
  style: React.CSSProperties & Record<`--${string}`, string | number>;
}

const RHYTHM: Array<Pick<SplashCharConfig, 'x' | 'y' | 'r' | 's' | 'finalOpacity' | 'delayOffset'>> = [
  { x: '-1px', y: '1px', r: '-0.8deg', s: 0.99, delayOffset: 0 },
  { x: '0px', y: '-2px', r: '0.4deg', s: 1.03, delayOffset: 0.02 },
  { x: '1px', y: '0px', r: '-0.2deg', s: 1, delayOffset: 0.01 },
  { x: '-1px', y: '2px', r: '0.7deg', s: 0.98, delayOffset: 0.03 },
  { x: '0px', y: '-1px', r: '-0.5deg', s: 1.01, delayOffset: 0 },
  { x: '1px', y: '1px', r: '0.2deg', s: 0.99, delayOffset: 0.02 },
];

const SPLASH_LINES: SplashLineConfig[] = [
  {
    id: 'wake',
    text: '我醒来',
    className: 'splash-line splash-line--wake',
    baseDelay: 0.45,
    finalOpacity: 0.85,
    chars: [
      { char: '我', className: 'splash-char--soft', x: '-1px', y: '1px', r: '-1deg', s: 0.98, finalOpacity: 0.9 },
      { char: '醒', className: 'splash-char--bright', x: '0px', y: '-2px', r: '0.6deg', s: 1.06, finalOpacity: 0.95, delayOffset: 0.02 },
      { char: '来', className: 'splash-char--soft', x: '-1px', y: '1px', r: '-0.4deg', s: 1, finalOpacity: 0.9 },
    ],
  },
  {
    id: 'reason',
    text: '是因为',
    className: 'splash-line splash-line--reason',
    baseDelay: 0.75,
    finalOpacity: 0.9,
  },
  {
    id: 'heart',
    text: '睡在你心上的',
    className: 'splash-line splash-line--heart',
    baseDelay: 1.05,
    finalOpacity: 0.9,
  },
  {
    id: 'birds',
    text: '鸟群',
    className: 'splash-line splash-line--birds',
    baseDelay: 1.42,
    finalOpacity: 1,
    chars: [
      { char: '鸟', className: 'splash-char--hollow splash-char--moon splash-char--key', x: '-2px', y: '-3px', r: '-1.6deg', s: 1, finalOpacity: 0.96 },
      { char: '群', className: 'splash-char--hollow splash-char--moon splash-char--flock splash-char--key', x: '-6px', y: '3px', r: '1deg', s: 1.02, finalOpacity: 0.96, delayOffset: 0.05 },
    ],
  },
  {
    id: 'migrate',
    text: '时时 要迁徙',
    className: 'splash-line splash-line--migrate',
    baseDelay: 1.95,
    finalOpacity: 0.92,
  },
  {
    id: 'escape',
    text: '时时 要逃避',
    className: 'splash-line splash-line--escape',
    baseDelay: 2.35,
    finalOpacity: 0.9,
  },
];

const POEM_TEXT = SPLASH_LINES.map(line => line.text).join('\n');

function getGeneratedClass(lineId: SplashLineId, char: string, index: number): string {
  if (char === ' ') return 'splash-char--space';
  if ((lineId === 'migrate' || lineId === 'escape') && index < 2) return 'splash-char--small';
  if ((lineId === 'migrate' || lineId === 'escape') && char === '要') return 'splash-char--bridge';
  if (lineId === 'migrate' && index >= 4) return 'splash-char--drift splash-char--key';
  if (lineId === 'escape' && index >= 4) return 'splash-char--fade-edge splash-char--key';
  if (lineId === 'reason' || lineId === 'heart') return 'splash-char--soft';
  return 'splash-char--plain';
}

function getGeneratedChar(line: SplashLineConfig, char: string, index: number, order: number): SplashCharConfig {
  const rhythm = RHYTHM[(order + index) % RHYTHM.length];

  return {
    char,
    className: getGeneratedClass(line.id, char, index),
    x: rhythm.x,
    y: rhythm.y,
    r: rhythm.r,
    s: rhythm.s,
    delayOffset: rhythm.delayOffset,
    finalOpacity: line.finalOpacity,
  };
}

function buildSplashGlyphs(): Array<SplashLineConfig & { glyphs: SplashGlyph[] }> {
  let order = 0;

  return SPLASH_LINES.map(line => {
    const sourceChars = line.chars ?? Array.from(line.text).map((char, index) => getGeneratedChar(line, char, index, order));
    const glyphs = sourceChars.map((source, index) => {
      const delay = line.baseDelay + index * 0.056 + (source.delayOffset ?? 0);
      const style: SplashGlyph['style'] = {
        '--i': index,
        '--x': source.x ?? '0px',
        '--y': source.y ?? '0px',
        '--r': source.r ?? '0deg',
        '--s': source.s ?? 1,
        '--delay': `${delay.toFixed(2)}s`,
        '--final-opacity': source.finalOpacity ?? 0.88,
      };

      order += 1;

      return {
        char: source.char,
        className: source.className ?? getGeneratedClass(line.id, source.char, index),
        x: source.x ?? '0px',
        y: source.y ?? '0px',
        r: source.r ?? '0deg',
        s: source.s ?? 1,
        delayOffset: source.delayOffset ?? 0,
        finalOpacity: source.finalOpacity ?? 0.88,
        index,
        style,
      };
    });

    return { ...line, glyphs };
  });
}

const SPLASH_GLYPH_LINES = buildSplashGlyphs();

const PhoneSplashPoem: React.FC = () => (
  <div className="phone-splash-poem splash-moon-mist" aria-label={POEM_TEXT}>
    <div className="splash-orbit-layer" aria-hidden="true">
      <span className="splash-orbit splash-orbit--main" />
      <span className="splash-orbit splash-orbit--secondary" />
      <span className="splash-orbit splash-orbit--inner" />
      <span className="splash-orbit-line" />
    </div>

    <div className="splash-copy">
      {SPLASH_GLYPH_LINES.map(line => (
        <div key={line.id} className={line.className} aria-label={line.text}>
          {line.glyphs.map(glyph => (
            <span
              key={`${line.id}-${glyph.index}-${glyph.char}`}
              aria-hidden="true"
              className={`splash-char ${glyph.className}`}
              data-char={glyph.char}
              style={glyph.style}
            >
              {glyph.char === ' ' ? '' : glyph.char}
            </span>
          ))}
        </div>
      ))}
    </div>

    <div className="splash-deco-layer" aria-hidden="true">
      <span className="silver-mist" />
      <span className="splash-star splash-star--bird" />
      <span className="splash-star splash-star--migrate" />
      <span className="splash-star splash-star--line" />
      <span className="splash-star splash-star--edge" />
      <span className="splash-script">between the moon and the migrating birds</span>
    </div>
  </div>
);

export default PhoneSplashPoem;
