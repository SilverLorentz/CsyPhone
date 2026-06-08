// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CognitiveNetworkApp from './CognitiveNetworkApp';
import { useOS } from '../context/OSContext';

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('../utils/haptics', () => ({
    haptic: {
        light: vi.fn(),
        medium: vi.fn(),
    },
}));

vi.mock('../utils/backendClient', () => ({
    buildBackendHeaders: vi.fn(() => ({})),
    getBackendUrl: vi.fn(() => ''),
    getUserId: vi.fn(() => 'test-user'),
    listCloudChars: vi.fn(),
    migrateCloudCharacterInstance: vi.fn(),
    pullMemories: vi.fn(),
    pushMemories: vi.fn(),
    sanitizeBackendHeader: vi.fn((value: string) => value),
    setUserId: vi.fn(),
    updateCloudMemory: vi.fn(),
}));

vi.mock('../utils/db', () => ({
    DB: {
        getAllVectorMemories: vi.fn(),
        getVectorMemoriesByIds: vi.fn(),
        getVectorMemoryById: vi.fn(),
        migrateLocalCharacterContentToInstance: vi.fn(),
        replaceVectorMemories: vi.fn(),
        resolveCharacterContentId: vi.fn(),
        saveVectorMemory: vi.fn(),
    },
}));

vi.mock('../utils/runtimeConfig', () => ({
    getEmbeddingConfig: vi.fn(() => ({
        apiKey: '',
        baseUrl: '',
        model: '',
        provider: 'openai',
        rerankApiKey: '',
        rerankUsePaid: false,
    })),
    getSecondaryApiConfig: vi.fn(() => undefined),
    hasCloudSyncTarget: vi.fn(() => false),
}));

vi.mock('../utils/safeTimeout', () => ({
    safeTimeoutSignal: vi.fn(() => undefined),
}));

vi.mock('../components/cognitive/MemoryBrowser', () => ({
    default: () => <div>MemoryBrowser</div>,
}));

vi.mock('../components/character/memoryCenterActions', () => ({
    updateVectorMemoryManaged: vi.fn(),
}));

const mockedUseOS = vi.mocked(useOS);

function makeCharacters(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        id: `char-${index + 1}`,
        name: `Role ${String(index + 1).padStart(2, '0')}`,
        avatar: `avatar-${index + 1}.png`,
    }));
}

describe('CognitiveNetworkApp workshop character scroller', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseOS.mockReturnValue({
            addToast: vi.fn(),
            characters: makeCharacters(8),
            closeApp: vi.fn(),
            openApp: vi.fn(),
            setActiveCharacterId: vi.fn(),
            userProfile: {
                name: 'Tester',
            },
        } as any);
    });

    it('keeps the workshop role strip centered without hiding the first overflowing role', () => {
        render(<CognitiveNetworkApp />);

        fireEvent.click(screen.getByLabelText('打开认知网络菜单'));
        fireEvent.click(screen.getByText('拾念'));

        expect(screen.getByText('时光编织')).toBeInTheDocument();

        const firstChip = screen.getByText('Role 01').closest('button');
        expect(firstChip).not.toBeNull();

        const innerList = firstChip?.parentElement;
        const scroller = innerList?.parentElement;

        expect(innerList?.className).toContain('w-max');
        expect(innerList?.className).toContain('min-w-full');
        expect(innerList?.className).toContain('justify-center');
        expect(scroller?.className).toContain('overflow-x-auto');
        expect(scroller?.className).not.toContain('justify-center');
    });
});
