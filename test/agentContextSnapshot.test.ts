import { describe, expect, it } from 'vitest';

import {
    buildCoreMemoryDigest,
    buildMountedWorldbooksDigest,
    didCharacterContextRelevantFieldsChange,
} from '../utils/agentContextSnapshot';

const TEST_INTERNAL_STATE = {
    dopamine: 0.5,
    serotonin: 0.5,
    cortisol: 0.5,
    oxytocin: 0.5,
    norepinephrine: 0.5,
    endorphin: 0.5,
    energy: 0.5,
    innerVoice: '',
    surfaceEmotion: 'calm',
    roundCount: 1,
    updatedAt: 1,
};

describe('agentContextSnapshot', () => {
    it('prefers refinedMemories over topMemory fallback', () => {
        const digest = buildCoreMemoryDigest(
            {
                refinedMemories: {
                    '2026-03': 'March memory stays active.',
                    '2026-02': 'February memory is older.',
                },
                activeMemoryMonths: ['2026-03'],
            },
            'TopMemory: old fallback',
        );

        expect(digest).toContain('[2026-03]');
        expect(digest).toContain('March memory');
        expect(digest).not.toContain('TopMemory: old fallback');
    });

    it('falls back to topMemory when refinedMemories are unavailable', () => {
        const digest = buildCoreMemoryDigest(
            {
                refinedMemories: {},
                activeMemoryMonths: [],
            },
            'TopMemory: only high-weight memory',
        );

        expect(digest).toBe('TopMemory: only high-weight memory');
    });

    it('renders all mounted worldbooks without truncating content', () => {
        const longContent = `${'full-lore-line '.repeat(120)}\nsecond paragraph stays visible`;
        const digest = buildMountedWorldbooksDigest([
            ...Array.from({ length: 6 }, (_, index) => ({
                id: `wb-${index + 1}`,
                title: `Worldbook ${index + 1}`,
                category: 'world',
                content: index === 5 ? longContent : `content-${index + 1}`,
            })),
        ]);

        expect(digest).toContain('Worldbook 1');
        expect(digest).toContain('Worldbook 6');
        expect(digest).toContain(longContent);
        expect(digest).toContain('second paragraph stays visible');
        expect(digest!.length).toBeGreaterThan(1200);
    });

    it('ignores location-only changes when deciding whether to push context immediately', () => {
        const previous = {
            name: 'Sully',
            description: 'test character',
            systemPrompt: 'stay in character',
            worldview: 'modern city',
            cityOverride: 'Shanghai',
            cityAdcode: '310000',
            isFictionalCity: false,
            mountedWorldbooks: [],
            refinedMemories: {},
            activeMemoryMonths: [],
            moodState: TEST_INTERNAL_STATE,
        };
        const next = {
            ...previous,
            cityOverride: 'Hangzhou',
            cityAdcode: '330100',
        };

        expect(didCharacterContextRelevantFieldsChange(previous, next)).toBe(false);
    });

    it('detects prompt-relevant changes when deciding whether to push context immediately', () => {
        const previous = {
            name: 'Sully',
            description: 'test character',
            systemPrompt: 'stay in character',
            worldview: 'modern city',
            mountedWorldbooks: [],
            refinedMemories: {},
            activeMemoryMonths: [],
            moodState: TEST_INTERNAL_STATE,
        };
        const next = {
            ...previous,
            description: 'updated character description',
        };

        expect(didCharacterContextRelevantFieldsChange(previous, next)).toBe(true);
    });

    it('detects soft devotion mode changes when deciding whether to push context immediately', () => {
        const previous = {
            name: 'Sully',
            description: 'test character',
            systemPrompt: 'stay in character',
            softDevotionChatMode: false,
            worldview: 'modern city',
            mountedWorldbooks: [],
            refinedMemories: {},
            activeMemoryMonths: [],
            moodState: TEST_INTERNAL_STATE,
        };
        const next = {
            ...previous,
            softDevotionChatMode: true,
        };

        expect(didCharacterContextRelevantFieldsChange(previous, next)).toBe(true);
    });
});
