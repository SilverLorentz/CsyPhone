// @vitest-environment jsdom

import React from 'react';
import { act,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { VirtualTimeProvider,useVirtualTime } from './VirtualTimeContext';

let renderCount = 0;

const TimeProbe: React.FC = () => {
  renderCount += 1;
  const time = useVirtualTime();
  return <div data-testid="time">{time.hours}:{time.minutes}</div>;
};

describe('VirtualTimeProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 27, 10, 12, 5));
    renderCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not publish a new value within the same minute', () => {
    render(
      <VirtualTimeProvider>
        <TimeProbe />
      </VirtualTimeProvider>,
    );

    expect(screen.getByTestId('time')).toHaveTextContent('10:12');
    expect(renderCount).toBe(1);

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.getByTestId('time')).toHaveTextContent('10:12');
    expect(renderCount).toBe(1);
  });

  it('publishes a new value when the minute changes', () => {
    render(
      <VirtualTimeProvider>
        <TimeProbe />
      </VirtualTimeProvider>,
    );

    act(() => {
      vi.advanceTimersByTime(55000);
    });

    expect(screen.getByTestId('time')).toHaveTextContent('10:13');
    expect(renderCount).toBe(2);
  });
});
