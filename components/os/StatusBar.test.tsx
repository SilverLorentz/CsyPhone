import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StatusBar from './StatusBar';
import { VirtualTimeProvider } from '../../context/VirtualTimeContext';
import { useOS } from '../../context/OSContext';

vi.mock('../../context/OSContext', () => ({
  useOS: vi.fn(),
}));

const mockedUseOS = vi.mocked(useOS);

describe('StatusBar', () => {
  beforeEach(() => {
    mockedUseOS.mockReturnValue({
      theme: { contentColor: '#ffffff' },
      systemLogs: [],
      clearLogs: vi.fn(),
    } as any);
  });

  it('renders below the top safe area', () => {
    render(
      <VirtualTimeProvider>
        <StatusBar />
      </VirtualTimeProvider>,
    );

    const statusBar = screen.getByTestId('system-status-bar');

    expect(statusBar.style.paddingTop).toBe('calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 8px)');
    expect(statusBar.style.minHeight).toBe('calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 2rem)');
  });
});
