// @vitest-environment jsdom

import React from 'react';
import { fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import AppIcon from './AppIcon';
import { AppID,type AppConfig } from '../../types';

vi.mock('../../utils/haptics', () => ({
  haptic: {
    medium: vi.fn(),
  },
}));

const testApp: AppConfig = {
  id: AppID.Settings,
  name: 'Settings',
  icon: 'Settings',
  color: 'from-slate-500 to-slate-700',
};

describe('AppIcon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders without an OS provider and opens on click', () => {
    const onClick = vi.fn();

    render(
      <AppIcon
        app={testApp}
        onClick={onClick}
        contentColor="#123456"
        customIconUrl="data:image/png;base64,abc"
      />,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText('Settings')).toBeInTheDocument();
  });

  it('fires long press without also opening the app', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();

    render(
      <AppIcon
        app={testApp}
        onClick={onClick}
        onLongPress={onLongPress}
        isLite
      />,
    );

    fireEvent.touchStart(screen.getByRole('button'), {
      touches: [{ clientX: 20, clientY: 20 }],
    });
    vi.advanceTimersByTime(500);
    fireEvent.touchEnd(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
