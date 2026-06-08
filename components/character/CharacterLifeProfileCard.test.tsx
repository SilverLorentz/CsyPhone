// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterLifeProfileCard from './CharacterLifeProfileCard';
import {
    fetchAgentLifeProfile,
    generateAgentLifeProfile,
    updateAgentLifeProfileSection,
} from '../../utils/agentBackendClient';
import { buildLifeProfileContextSnapshot } from '../../utils/lifeProfileContextSnapshot';

vi.mock('../../utils/agentBackendClient', () => ({
    fetchAgentLifeProfile: vi.fn(),
    generateAgentLifeProfile: vi.fn(),
    updateAgentLifeProfileSection: vi.fn(),
}));

vi.mock('../../utils/lifeProfileContextSnapshot', () => ({
    buildLifeProfileContextSnapshot: vi.fn(),
}));

vi.mock('../../utils/runtimeConfig', () => ({
    getSecondaryApiConfig: vi.fn(() => ({
        baseUrl: 'https://llm.example.com',
        apiKey: 'sub-key',
        model: 'profile-model',
    })),
}));

const mockedFetchAgentLifeProfile = vi.mocked(fetchAgentLifeProfile);
const mockedGenerateAgentLifeProfile = vi.mocked(generateAgentLifeProfile);
const mockedUpdateAgentLifeProfileSection = vi.mocked(updateAgentLifeProfileSection);
const mockedBuildLifeProfileContextSnapshot = vi.mocked(buildLifeProfileContextSnapshot);

const addToast = vi.fn();
const character = {
    id: 'char-1',
    name: 'Sully',
    avatar: 'avatar.png',
    description: '城市里的温柔角色',
    systemPrompt: '角色人设',
    worldview: '现代城市',
    memories: [],
} as any;

const readyState = {
    status: 'ready' as const,
    updatedAt: 1,
    sourceFingerprint: 'abc123',
    sectionMeta: {
        identity: { source: 'generated' as const, updatedAt: 1 },
        activities: { source: 'generated' as const, updatedAt: 1 },
    },
    profile: {
        lifeIdentity: { currentRole: '已工作的城市居民', lifeStage: '稳定工作期' },
        weeklyRhythm: { workdays: '工作日有通勤和工作。' },
        timeRhythm: { sleepWake: '普通作息。', emotionalWindows: ['下班后更容易柔软下来'] },
        placeModel: {
            genericPlaces: ['住处', '工作地点'],
            specificPlaces: [{
                name: '旧书店',
                category: '休息点',
                evidence: '系统提示里提到固定地点',
                confidence: 0.8,
                usePolicy: '偶尔可以使用',
            }],
        },
        activityPalette: {
            stable: ['处理工作'],
            occasional: ['读书'],
            romanceUsable: ['短暂报备'],
            privateTexture: ['回家后不立刻开灯'],
            lowFrequencyTexture: ['咖啡'],
            avoidAsCore: [],
        },
        relationshipToUser: {
            contactStyle: '温和克制。',
            romanceEntryPoints: ['消息', '短暂见面'],
            tensionSources: ['工作忙碌'],
        },
        variationPolicy: { stableAnchors: ['工作日'] },
        uncertainties: [{ topic: '通勤', detail: '具体路线未确认。' }],
        evidence: [{ id: 'E1', quote: '已经工作', supports: '生活底色与工作相关。', source: 'charSystemPrompt', confidence: 0.9 }],
    },
};

const partialReadyState = {
    ...readyState,
    sectionMeta: {
        identity: { source: 'generated' as const, updatedAt: 1 },
        relationship: { source: 'generated' as const, updatedAt: 1 },
        rhythm: {
            source: 'generated' as const,
            updatedAt: 1,
            errorMessage: '这一段还没有稳定内容，可以手动补充或稍后重新整理。',
            debugCode: 'empty_section_rhythm',
        },
    },
    profile: {
        lifeIdentity: { currentRole: '已工作的城市居民', lifeStage: '稳定工作期' },
        weeklyRhythm: {},
        timeRhythm: {},
        placeModel: {
            genericPlaces: [],
            specificPlaces: [],
        },
        activityPalette: {
            stable: [],
            occasional: [],
            romanceUsable: [],
            privateTexture: [],
            lowFrequencyTexture: [],
            avoidAsCore: [],
        },
        relationshipToUser: {
            contactStyle: '温和克制。',
            romanceEntryPoints: ['消息'],
            tensionSources: ['工作忙碌'],
        },
        variationPolicy: {},
        uncertainties: [],
        evidence: [],
    },
};

describe('CharacterLifeProfileCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedBuildLifeProfileContextSnapshot.mockResolvedValue({
            charId: 'char-1',
            charName: 'Sully',
            charSystemPrompt: '角色人设',
            charPersonality: '城市里的温柔角色',
            moodState: null,
            updatedAt: 1,
        });
    });

    it('shows the missing state and organize button', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue({ status: 'missing' });

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        expect(await screen.findByText('还没有整理过。点下面的按钮后，会生成一份可分区微调的角色生活底稿。')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /整理生活底稿/ })).toBeEnabled();
    });

    it('disables the button while generating and then shows sectioned profile', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue({ status: 'missing' });
        mockedGenerateAgentLifeProfile.mockResolvedValue(readyState);

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        fireEvent.click(await screen.findByRole('button', { name: /整理生活底稿/ }));

        expect(screen.getByRole('button', { name: /整理中/ })).toBeDisabled();
        expect(await screen.findByText('身份牵引')).toBeInTheDocument();
        expect(screen.getByText('活动与私生活')).toBeInTheDocument();
        expect(screen.queryByText('证据与不确定项')).not.toBeInTheDocument();
        expect(screen.queryByText('证据')).not.toBeInTheDocument();
        expect(screen.queryByText('原文 JSON')).not.toBeInTheDocument();
        expect(screen.queryByText('已经工作')).not.toBeInTheDocument();
        expect(screen.queryByText('生活底色与工作相关。')).not.toBeInTheDocument();
        expect(screen.queryByText('系统提示里提到固定地点')).not.toBeInTheDocument();
        expect(screen.queryByText('她的生活以稳定工作和安静休息为底色。')).not.toBeInTheDocument();
        expect(screen.getAllByText('自动整理').length).toBeGreaterThan(0);
        expect(addToast).toHaveBeenCalledWith('生活底稿已整理好', 'success');
    });

    it('shows partial ready content gently without technical errors', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue(partialReadyState);

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        expect(await screen.findByText('身份牵引')).toBeInTheDocument();
        expect(screen.getByText('已工作的城市居民')).toBeInTheDocument();
        expect(screen.getAllByText('待补充').length).toBeGreaterThan(0);
        expect(screen.getAllByText('这一段还没有稳定内容，可以手动补充或稍后重新整理。').length).toBeGreaterThan(0);
        expect(screen.queryByText('empty_section_rhythm')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /继续整理生活底稿/ })).toBeEnabled();
    });

    it('edits and saves one section as manual content', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue(readyState);
        mockedUpdateAgentLifeProfileSection.mockResolvedValue({
            ...readyState,
            sectionMeta: {
                ...readyState.sectionMeta,
                activities: { source: 'manual' as const, updatedAt: 2 },
            },
            profile: {
                ...readyState.profile,
                activityPalette: {
                    ...readyState.profile.activityPalette,
                    stable: ['手动稳定活动'],
                },
            },
        });

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        fireEvent.click(await screen.findByLabelText('编辑活动与私生活'));
        fireEvent.change(screen.getByLabelText('稳定活动'), { target: { value: '手动稳定活动' } });
        fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));

        await waitFor(() => expect(mockedUpdateAgentLifeProfileSection).toHaveBeenCalledTimes(1));
        expect(mockedUpdateAgentLifeProfileSection).toHaveBeenCalledWith(
            'char-1',
            'activities',
            expect.objectContaining({
                activityPalette: expect.objectContaining({ stable: ['手动稳定活动'] }),
            }),
            expect.objectContaining({ charName: 'Sully' }),
        );
        expect(await screen.findByText('手动调整')).toBeInTheDocument();
        expect(screen.getByText('手动稳定活动')).toBeInTheDocument();
        expect(addToast).toHaveBeenCalledWith('这一段生活底稿已保存', 'success');
    });

    it('keeps raw evidence hidden when editing place details', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue(readyState);

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        fireEvent.click(await screen.findByLabelText('编辑生活空间'));

        expect(screen.queryByText('证据')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('系统提示里提到固定地点')).not.toBeInTheDocument();
    });

    it('keeps retry available when failed', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue({
            status: 'failed',
            errorMessage: 'insufficient_life_profile_content',
            updatedAt: 1,
        });

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        expect(await screen.findByText('这次没有稳定整理出生活底稿，可以稍后再试。')).toBeInTheDocument();
        expect(screen.queryByText('insufficient_life_profile_content')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /整理生活底稿/ })).toBeEnabled();
    });

    it('shows a gentle message when the browser request times out', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue({ status: 'missing' });
        mockedGenerateAgentLifeProfile.mockRejectedValue(new Error('signal timed out'));

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        fireEvent.click(await screen.findByRole('button', { name: /整理生活底稿/ }));

        expect(await screen.findByText('整理耗时有点久，可以稍后刷新看看是否已经完成，或再试一次。')).toBeInTheDocument();
        expect(addToast).toHaveBeenCalledWith('整理耗时有点久，可以稍后刷新看看是否已经完成，或再试一次。', 'error');
    });

    it('passes the secondary API config when regenerating', async () => {
        mockedFetchAgentLifeProfile.mockResolvedValue({ status: 'missing' });
        mockedGenerateAgentLifeProfile.mockResolvedValue(readyState);

        render(<CharacterLifeProfileCard character={character} userName="Tester" addToast={addToast} />);

        fireEvent.click(await screen.findByRole('button', { name: /整理生活底稿/ }));

        await waitFor(() => expect(mockedGenerateAgentLifeProfile).toHaveBeenCalledTimes(1));
        expect(mockedGenerateAgentLifeProfile).toHaveBeenCalledWith(
            'char-1',
            expect.objectContaining({ charName: 'Sully' }),
            {
                baseUrl: 'https://llm.example.com',
                apiKey: 'sub-key',
                model: 'profile-model',
            },
        );
    });
});
