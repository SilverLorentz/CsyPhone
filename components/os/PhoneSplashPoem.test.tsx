import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PhoneSplashPoem from './PhoneSplashPoem';

const EXPECTED_LINES = [
  '我醒来',
  '是因为',
  '睡在你心上的',
  '鸟群',
  '时时 要迁徙',
  '时时 要逃避',
];

describe('PhoneSplashPoem moon mist layout', () => {
  it('renders the fixed six-line splash poem without image artwork', () => {
    const { container } = render(<PhoneSplashPoem />);
    const root = container.querySelector('.splash-moon-mist');
    const lines = Array.from(container.querySelectorAll('.splash-line'));

    expect(root?.getAttribute('aria-label')).toBe(EXPECTED_LINES.join('\n'));
    expect(lines).toHaveLength(EXPECTED_LINES.length);
    expect(lines.map(line => line.getAttribute('aria-label'))).toEqual(EXPECTED_LINES);
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the bird-group title and moon-mist decorations in DOM/CSS layers', () => {
    const { container } = render(<PhoneSplashPoem />);
    const bird = container.querySelector('[data-char="鸟"]');
    const group = container.querySelector('[data-char="群"]');
    const spaces = container.querySelectorAll('.splash-char--space');

    expect(bird?.classList.contains('splash-char--hollow')).toBe(true);
    expect(bird?.classList.contains('splash-char--moon')).toBe(true);
    expect(group?.classList.contains('splash-char--hollow')).toBe(true);
    expect(group?.classList.contains('splash-char--moon')).toBe(true);
    expect(group?.classList.contains('splash-char--flock')).toBe(true);
    expect(group?.classList.contains('splash-char--key')).toBe(true);
    expect(spaces).toHaveLength(2);
    expect(container.querySelectorAll('.splash-orbit')).toHaveLength(3);
    expect(container.querySelector('.splash-orbit-line')).not.toBeNull();
    expect(container.querySelector('.silver-mist')).not.toBeNull();
    expect(container.querySelector('.splash-script')?.textContent).toBe('between the moon and the migrating birds');
  });

  it('keeps Chinese copy opacity above the readability floor', () => {
    const { container } = render(<PhoneSplashPoem />);
    const chars = Array.from(container.querySelectorAll<HTMLElement>('.splash-char:not(.splash-char--space)'));
    const opacities = chars.map(char => Number(char.style.getPropertyValue('--final-opacity')));
    const bird = container.querySelector<HTMLElement>('[data-char="鸟"]');
    const group = container.querySelector<HTMLElement>('[data-char="群"]');

    expect(Math.min(...opacities)).toBeGreaterThanOrEqual(0.76);
    expect(Number(bird?.style.getPropertyValue('--final-opacity'))).toBeGreaterThanOrEqual(0.96);
    expect(Number(group?.style.getPropertyValue('--final-opacity'))).toBeGreaterThanOrEqual(0.96);
  });
});
