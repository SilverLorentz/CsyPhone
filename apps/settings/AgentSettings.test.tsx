// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentSettings from './AgentSettings';
import { getAgentConfig } from '../../utils/autonomousAgent';
import { haptic } from '../../utils/haptics';

vi.mock('../../utils/haptics', () => ({
    haptic: {
        light: vi.fn(),
        medium: vi.fn(),
    },
}));

vi.mock('../../utils/pushSubscription', () => ({
    forceResubscribe: vi.fn(() => Promise.resolve()),
    getPushDebugInfo: vi.fn(() => ({
        endpoint: '',
        error: '',
        status: '',
    })),
}));

describe('AgentSettings', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('saves the autonomous agent enabled toggle and notifies the runtime', () => {
        const listener = vi.fn();
        window.addEventListener('agent-config-changed', listener);

        try {
            render(<AgentSettings />);

            const enabledToggle = screen.getByLabelText('启用自律代理') as HTMLInputElement;
            expect(enabledToggle.checked).toBe(true);

            fireEvent.click(enabledToggle);

            expect(getAgentConfig().enabled).toBe(false);
            expect(haptic.medium).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener('agent-config-changed', listener);
        }
    });
});
