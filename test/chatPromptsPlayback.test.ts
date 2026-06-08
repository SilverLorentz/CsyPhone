import { describe,expect,it,vi } from 'vitest';

vi.mock('../utils/context', () => ({
    ContextBuilder: {
        buildCoreContext: vi.fn(() => ''),
    },
}));

vi.mock('../utils/db', () => ({
    DB: {
        getGroupMessages: vi.fn(async () => []),
    },
}));

vi.mock('../utils/realtimeContext', () => ({
    RealtimeContextManager: {
        buildFullContext: vi.fn(async () => ''),
        getTimeContext: vi.fn(() => ({
            dateStr: '2026-04-10',
            dayOfWeek: '周五',
            isWeekend: false,
        })),
        checkSpecialDates: vi.fn(() => []),
    },
    NotionManager: {
        getRecentDiaries: vi.fn(async () => ({ success: false, entries: [] })),
        getUserNotes: vi.fn(async () => ({ success: false, entries: [] })),
    },
    FeishuManager: {
        getRecentDiaries: vi.fn(async () => ({ success: false, entries: [] })),
    },
    defaultRealtimeConfig: {},
}));

vi.mock('../utils/hotSearchContext', () => ({
    buildCharacterHotSearch: vi.fn(async () => ''),
}));

vi.mock('../utils/vectorMemoryRetriever', () => ({
    VectorMemoryRetriever: {
        retrieve: vi.fn(async () => ''),
    },
}));

vi.mock('../utils/temporalContext', () => ({
    buildTemporalContext: vi.fn(() => ''),
}));

import { ChatPrompts } from '../utils/chatPrompts';
import type { NeteaseSong } from '../types/music';
import type { PlaybackLyricSnapshot } from '../utils/playbackLyricsRuntime';

function createSong(): NeteaseSong {
    return {
        kind: 'song',
        id: 42,
        name: '晴天',
        artists: [{ id: 1, name: '周杰伦' }],
        album: {
            kind: 'album',
            id: 7,
            name: '叶惠美',
        },
        duration: 269000,
    };
}

function createLyricSnapshot(): PlaybackLyricSnapshot {
    return {
        songId: 42,
        currentIndex: 0,
        currentText: '故事的小黄花',
        currentTranslation: 'The little yellow flower in the story',
        currentTime: 15,
        lineStartTime: 13,
        nextLineTime: 18,
        updatedAt: 1000,
    };
}

describe('ChatPrompts.buildPlaybackContextPrompt', () => {
    it('injects shared listening context when a current song exists', () => {
        const prompt = ChatPrompts.buildPlaybackContextPrompt(
            '糯米',
            createSong(),
            true,
            null,
        );

        expect(prompt).toContain('糯米开启了线上一起听');
        expect(prompt).toContain('《晴天》- 周杰伦');
        expect(prompt).toContain('一起听着的声音');
    });

    it('appends lyric context when a lyric snapshot is available', () => {
        const prompt = ChatPrompts.buildPlaybackContextPrompt(
            '糯米',
            createSong(),
            true,
            createLyricSnapshot(),
        );

        expect(prompt).toContain('此刻正和糯米一起流进你耳边的是');
        expect(prompt).toContain('「故事的小黄花」');
        expect(prompt).toContain('The little yellow flower in the story');
    });

    it('keeps the shared listening context even when playback is currently paused', () => {
        const prompt = ChatPrompts.buildPlaybackContextPrompt(
            '糯米',
            createSong(),
            false,
            null,
        );

        expect(prompt).toContain('糯米开启了线上一起听');
        expect(prompt).toContain('刚刚还在听的');
        expect(prompt).toContain('一起听着的声音');
    });

    it('returns an empty string when there is no current song', () => {
        expect(
            ChatPrompts.buildPlaybackContextPrompt('糯米', null, false, null),
        ).toBe('');
    });
});
