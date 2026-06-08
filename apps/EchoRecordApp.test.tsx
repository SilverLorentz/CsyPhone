// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EchoRecordApp from './EchoRecordApp';
import { useOS } from '../context/OSContext';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { DB } from '../utils/db';
import { checkLyricSingability, generateLyrics } from '../utils/memoryRecordService';
import type { CharacterProfile, MemoryRecord } from '../types';

vi.mock('../context/OSContext', () => ({
    useOS: vi.fn(),
}));

vi.mock('../hooks/useAudioPlayer', () => ({
    useAudioPlayer: vi.fn(),
}));

vi.mock('../utils/db', () => ({
    DB: {
        deleteMemoryRecord: vi.fn(),
        deleteMemoryRecordAudio: vi.fn(),
        getMemoryRecords: vi.fn(),
        getVectorMemoryHeaders: vi.fn(),
        saveMemoryRecord: vi.fn(),
    },
}));

vi.mock('../utils/haptics', () => ({
    haptic: {
        light: vi.fn(),
        medium: vi.fn(),
    },
}));

vi.mock('../utils/memoryRecordService', () => ({
    COVER_GRADIENTS: ['linear-gradient(135deg,#111,#333)'],
    MEMORY_RECORD_MODE_COPY: {
        blind_box: { label: '暗格来信', detail: '随机挑选回忆' },
        relationship_theme: { label: '长镜头', detail: '关系主题' },
        selected_memory: { label: '折进信里', detail: '指定片段' },
        char_to_user: { label: '他的独白诗', detail: '他的视角' },
        dream_mix: { label: '未醒混音', detail: '梦境混剪' },
    },
    checkLyricSingability: vi.fn(),
    createRecordId: vi.fn(() => 'record-new'),
    generateLyrics: vi.fn(),
    generateStylePrompt: vi.fn(),
    optimizeLyrics: vi.fn(),
    produceMemoryRecordAudio: vi.fn(),
    shouldGenerateMemoryRecordMonologue: vi.fn(() => false),
}));

vi.mock('../utils/memoryRecordCovers', () => ({
    getMemoryRecordCoverImage: vi.fn((record: MemoryRecord) => record.coverImageUrl),
}));

vi.mock('../utils/memoryRecordPlayable', () => ({
    hasPlayableMemoryRecordAudio: vi.fn((record: MemoryRecord) => Boolean(record.masterAudioId || record.musicAudioId)),
    memoryRecordToPlayable: vi.fn((record: MemoryRecord) => ({
        kind: 'memoryRecord',
        id: 850000001,
        recordId: record.id,
        name: record.title,
        artistName: record.artistName,
        albumName: record.albumName,
        duration: record.durationMs || 120000,
        lyrics: record.lyrics,
        audioId: record.masterAudioId || record.musicAudioId,
        requiresMasterAudio: Boolean(record.masterAudioId),
    })),
}));

vi.mock('../utils/memoryRecordShare', () => ({
    buildMemoryRecordSharePreview: vi.fn((playable) => ({
        albumName: playable.albumName,
        artistName: playable.artistName,
        durationMs: playable.duration,
        lyricLines: [],
        title: playable.name,
    })),
    formatMemoryRecordShareDuration: vi.fn(() => '2:00'),
    generateWaveformHeights: vi.fn(() => [12, 18, 24, 16, 20, 14]),
    shareMemoryRecordPoster: vi.fn(),
}));

const mockedUseOS = vi.mocked(useOS);
const mockedUseAudioPlayer = vi.mocked(useAudioPlayer);
const mockedGetMemoryRecords = vi.mocked(DB.getMemoryRecords);
const mockedGetVectorMemoryHeaders = vi.mocked(DB.getVectorMemoryHeaders);
const mockedSaveMemoryRecord = vi.mocked(DB.saveMemoryRecord);
const mockedGenerateLyrics = vi.mocked(generateLyrics);
const mockedCheckLyricSingability = vi.mocked(checkLyricSingability);

const sampleCharacter: CharacterProfile = {
    id: 'char-sully',
    name: 'Sully',
    avatar: 'avatar.png',
    description: '',
    systemPrompt: '',
    memories: [],
};

function buildRecord(patch: Partial<MemoryRecord>): MemoryRecord {
    return {
        id: 'record-1',
        charId: 'char-sully',
        charName: 'Sully',
        userName: '你',
        mode: 'blind_box',
        status: 'ready',
        title: '星河私语',
        albumName: '回声唱片',
        artistName: 'Sully',
        monologueText: '',
        lyrics: '第一句\n第二句',
        musicPrompt: 'dream pop',
        coverGradient: 'linear-gradient(135deg,#111,#333)',
        seedMemoryIds: [],
        createdAt: 100,
        updatedAt: 200,
        masterAudioId: 'record-1:master',
        durationMs: 120000,
        ...patch,
    };
}

describe('EchoRecordApp', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mockedUseOS.mockReturnValue({
            addToast: vi.fn(),
            apiConfig: { apiKey: '', baseUrl: '', model: '' },
            characters: [sampleCharacter],
            closeApp: vi.fn(),
            ttsConfig: {},
            userProfile: { name: '你', avatar: '', bio: '' },
        } as any);
        mockedUseAudioPlayer.mockReturnValue({
            playSong: vi.fn(),
        } as any);
        mockedGetVectorMemoryHeaders.mockResolvedValue([]);
        mockedSaveMemoryRecord.mockResolvedValue(undefined);
        mockedGetMemoryRecords.mockResolvedValue([
            buildRecord({ id: 'record-ready', title: '星河私语', status: 'ready', masterAudioId: 'record-ready:master' }),
            buildRecord({ id: 'record-draft', title: '半成的梦', status: 'draft', musicPrompt: '', masterAudioId: undefined, musicAudioId: undefined }),
        ]);
    });

    it('renders record, studio, and archive tabs with local memory records', async () => {
        render(<EchoRecordApp />);

        expect(await screen.findByText('星河私语')).toBeTruthy();
        expect(screen.getByText('唱片')).toBeTruthy();

        fireEvent.click(screen.getByText('制作'));
        expect(screen.getByText('唱片归属')).toBeTruthy();

        fireEvent.click(screen.getByText('我的'));
        expect(screen.getByText('草稿与失败记录')).toBeTruthy();
        expect(screen.getAllByText('半成的梦').length).toBeGreaterThan(0);
    });

    it('plays a ready memory record through the shared audio player', async () => {
        const player = { playSong: vi.fn() };
        mockedUseAudioPlayer.mockReturnValue(player as any);

        render(<EchoRecordApp />);

        await screen.findByText('星河私语');
        fireEvent.click(screen.getAllByText('播放')[0]);

        await waitFor(() => {
            expect(player.playSong).toHaveBeenCalledWith(
                expect.objectContaining({ recordId: 'record-ready', name: '星河私语' }),
                expect.any(Array),
            );
        });
    });

    it('restores the currently edited ready record prompt after remounting', async () => {
        mockedGetMemoryRecords.mockResolvedValue([
            buildRecord({
                id: 'record-ready',
                title: '星河私语',
                status: 'ready',
                stylePrompt: 'cinematic dream pop, warm vocal, soft vinyl texture',
                negativeStylePrompt: 'no harsh drums, no metallic vocal',
                masterAudioId: 'record-ready:master',
            }),
        ]);

        const first = render(<EchoRecordApp />);

        await screen.findByText('星河私语');
        fireEvent.click(screen.getByText('继续编辑'));

        expect(await screen.findByDisplayValue('cinematic dream pop, warm vocal, soft vinyl texture')).toBeTruthy();
        expect(screen.getByDisplayValue('no harsh drums, no metallic vocal')).toBeTruthy();

        first.unmount();
        render(<EchoRecordApp />);

        expect(await screen.findByDisplayValue('cinematic dream pop, warm vocal, soft vinyl texture')).toBeTruthy();
        expect(screen.getByDisplayValue('no harsh drums, no metallic vocal')).toBeTruthy();
    });

    it('guides a loaded lyric draft from finalizing lyrics into arrangement', async () => {
        render(<EchoRecordApp />);

        await screen.findByText('星河私语');
        fireEvent.click(screen.getByText('我的'));
        expect(await screen.findByText('草稿与失败记录')).toBeTruthy();
        fireEvent.click(screen.getAllByText('继续编辑')[0]);

        expect(await screen.findByDisplayValue('半成的梦')).toBeTruthy();
        expect(screen.getByText((_, node) => node?.textContent === '当前任务：写词定稿')).toBeTruthy();
        expect(screen.getByText('下一步：曲风制作')).toBeTruthy();
        expect(screen.getByText('确认歌词定稿')).toBeTruthy();

        fireEvent.click(screen.getByText('确认歌词定稿'));

        await waitFor(() => {
            expect(DB.saveMemoryRecord).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'record-draft',
                    lyricsConfirmedAt: expect.any(Number),
                }),
            );
        });
        expect(await screen.findByText('当前任务：曲风制作')).toBeTruthy();
        expect(screen.getByText('生成曲风提示词')).toBeTruthy();
    });

    it('returns from lyric editing to needle drop without auto-reopening the same draft', async () => {
        mockedGetMemoryRecords.mockResolvedValue([
            buildRecord({ id: 'record-ready', title: '星河私语', status: 'ready', masterAudioId: 'record-ready:master' }),
            buildRecord({
                id: 'record-draft',
                title: '半成的梦',
                status: 'draft',
                musicPrompt: '',
                masterAudioId: undefined,
                musicAudioId: undefined,
                inspirationReference: '90 年代港风',
                songRequest: {
                    theme: '雨夜重逢',
                    mood: '克制但心动',
                    style: 'R&B',
                    perspective: '我唱给你听',
                    voicePreference: '气声女声',
                    extraRequirements: '副歌轻一点',
                },
            }),
        ]);

        render(<EchoRecordApp />);

        await screen.findByText('星河私语');
        fireEvent.click(screen.getByText('我的'));
        fireEvent.click(screen.getAllByText('继续编辑')[0]);
        expect(await screen.findByDisplayValue('半成的梦')).toBeTruthy();

        fireEvent.click(screen.getByText('重新落针'));

        expect((await screen.findAllByText('唱片归属')).length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('雨夜重逢')).toBeTruthy();
        expect(screen.getByDisplayValue('90 年代港风')).toBeTruthy();
        await waitFor(() => {
            expect(screen.queryByDisplayValue('半成的梦')).toBeNull();
        });
    });

    it('keeps needle drop fields after lyric generation fails and restores them on reopen', async () => {
        mockedGetMemoryRecords.mockResolvedValue([]);
        mockedGenerateLyrics.mockRejectedValueOnce(new Error('网络断开'));

        const first = render(<EchoRecordApp />);

        fireEvent.click(screen.getByText('制作'));
        fireEvent.change(screen.getByPlaceholderText(/雨夜重逢/), { target: { value: '秘密恋爱' } });
        fireEvent.change(screen.getByPlaceholderText(/暧昧/), { target: { value: '暧昧、克制' } });
        fireEvent.change(screen.getByPlaceholderText(/我唱给你听/), { target: { value: '我唱给你听' } });
        fireEvent.change(screen.getByPlaceholderText(/R&B/), { target: { value: 'city pop' } });
        fireEvent.change(screen.getByPlaceholderText(/女声/), { target: { value: '低沉男声' } });
        fireEvent.change(screen.getByPlaceholderText(/歌手、歌曲/), { target: { value: '复古 synth' } });
        fireEvent.change(screen.getByPlaceholderText(/副歌更有 Hook/), { target: { value: '不要太伤感' } });
        fireEvent.click(screen.getByText('生成歌词草稿'));

        expect(await screen.findByText('网络断开')).toBeTruthy();
        expect(screen.getByDisplayValue('秘密恋爱')).toBeTruthy();

        first.unmount();
        render(<EchoRecordApp />);

        fireEvent.click(screen.getByText('制作'));
        expect(await screen.findByDisplayValue('秘密恋爱')).toBeTruthy();
        expect(screen.getByDisplayValue('暧昧、克制')).toBeTruthy();
        expect(screen.getByDisplayValue('city pop')).toBeTruthy();
        expect(screen.getByDisplayValue('复古 synth')).toBeTruthy();
        expect(screen.getByDisplayValue('不要太伤感')).toBeTruthy();
    });

    it('shows full singability issues instead of truncated chips', async () => {
        mockedCheckLyricSingability.mockResolvedValue({
            score: 42,
            summary: '结构还需要再整理。',
            shouldOptimize: true,
            issues: [
                {
                    type: '句长',
                    severity: 'high',
                    problem: '全篇句子过长且缺乏长短句错落，几乎每行都在16-21字之间，导致旋律落点很拥挤。',
                    example: '我把所有回忆都塞进同一段月光里面',
                    suggestion: '拆短副歌句子，给 Hook 留出更清晰的重复位置。',
                },
                {
                    type: 'Hook',
                    severity: 'medium',
                    problem: '副歌缺乏核心记忆点，Chorus 1 和 Chorus 2 的情绪推进不够明确。',
                    example: '还是想你，还是等你',
                    suggestion: '补一到两句更容易被记住的短句。',
                },
            ],
        });

        render(<EchoRecordApp />);

        await screen.findByText('星河私语');
        fireEvent.click(screen.getByText('我的'));
        fireEvent.click(screen.getAllByText('继续编辑')[0]);
        fireEvent.click(await screen.findByText('可唱性检查'));

        expect(await screen.findByText(/几乎每行都在16-21字之间/)).toBeTruthy();
        expect(screen.getByText(/拆短副歌句子/)).toBeTruthy();
        expect(screen.getByText(/Chorus 1 和 Chorus 2/)).toBeTruthy();
        expect(screen.getByText('重点处理')).toBeTruthy();
    });
});
