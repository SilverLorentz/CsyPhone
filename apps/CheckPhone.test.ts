import { describe, expect, it } from 'vitest';
import type { PhoneEvidence } from '../types';
import {
    MAX_PHONE_DETAIL_CHARS,
    MAX_PHONE_CHAT_DETAIL_CHARS,
    MAX_PHONE_RECORDS_PER_APP,
    MAX_PHONE_RECORDS_TOTAL,
    buildNeteaseMusicProfileViewModel,
    buildPhoneSystemMessageDraft,
    normalizeGeneratedNeteaseMusicProfilePayload,
    normalizeGeneratedPhoneItem,
    normalizeGeneratedNeteaseMusicTrace,
    normalizePhoneState,
    normalizeStoredPhoneRecord,
    parseNeteaseMusicProfileJson,
    parseNeteaseMusicTraceJson,
    phoneRecordToNeteaseSong,
    phoneStateNeedsNormalization,
    prunePhoneRecords,
    unlinkPhoneRecordFromContext
} from './CheckPhone';

describe('CheckPhone phone record normalization', () => {
    it('normalizes nested AI output into render-safe strings', () => {
        const item = normalizeGeneratedPhoneItem({
            title: { name: '楼下便利店' },
            detail: ['矿泉水×1', { content: '饭团×2' }],
            value: 18.5,
            shop: { status: '已完成' }
        });

        expect(item).toEqual({
            title: '楼下便利店',
            detail: '矿泉水×1; 饭团×2',
            value: '18.5',
            shop: '已完成'
        });
    });

    it('parses fenced Netease music trace JSON and falls back to an empty array', () => {
        expect(parseNeteaseMusicTraceJson('```json\n[{ "song": "红豆", "artist": "王菲", "tag": "红心", "comment": "" }]\n```')).toEqual([
            { song: '红豆', artist: '王菲', tag: '红心', comment: '' }
        ]);
        expect(parseNeteaseMusicTraceJson('不是 JSON')).toEqual([]);
    });

    it('parses and normalizes a Netease profile payload', () => {
        const parsed = parseNeteaseMusicProfileJson('```json\n{"profile":{"nickname":"夜航员","level":12,"signature":"不解释。","playCount":"4821"},"playlists":[{"name":"不会发出去的话","count":23,"songs":[{"song":"红豆","artist":"王菲","tag":"红心","comment":""}]}]}\n```');
        const payload = normalizeGeneratedNeteaseMusicProfilePayload(parsed);

        expect(payload).toEqual({
            profile: {
                nickname: '夜航员',
                level: 10,
                signature: '不解释。',
                playCount: 4821
            },
            playlists: [{
                name: '不会发出去的话',
                count: 23,
                songs: [{ song: '红豆', artist: '王菲', tag: '红心', comment: '' }]
            }]
        });
        expect(parseNeteaseMusicProfileJson('不是 JSON')).toBeNull();
    });

    it('normalizes Netease music trace fields for safe rendering', () => {
        const item = normalizeGeneratedNeteaseMusicTrace({
            song: { title: '暧昧' },
            artist: ['王菲'],
            tag: { status: '单曲循环 32 次' },
            comment: { content: '有些话只敢留在评论区。' }
        });

        expect(item).toEqual({
            song: '暧昧',
            artist: '王菲',
            tag: '单曲循环 32 次',
            comment: '有些话只敢留在评论区。'
        });
        expect(normalizeGeneratedNeteaseMusicTrace({ song: '孤独患者' })).toBeNull();
    });

    it('normalizes malformed persisted records before rendering', () => {
        const record = normalizeStoredPhoneRecord({
            id: 123,
            type: 'order',
            title: { label: '订单标题' },
            detail: { content: '规格 | 已发货' },
            timestamp: '1710000000000',
            systemMessageId: 'bad-id',
            value: { amount: '42' },
            shop: ['旗舰店']
        } as unknown as PhoneEvidence);

        expect(record).toMatchObject({
            id: '123',
            type: 'order',
            title: '订单标题',
            detail: '规格 | 已发货',
            timestamp: 1710000000000,
            value: '42',
            shop: '旗舰店'
        });
        expect('systemMessageId' in record).toBe(false);
    });

    it('preserves optional Netease playback fields on stored records', () => {
        const record = normalizeStoredPhoneRecord({
            id: 'music-1',
            type: 'netease_music',
            title: '红豆',
            detail: '王菲\n还没好好地感受。',
            timestamp: 1710000000000,
            value: '红心',
            artist: '王菲',
            comment: '还没好好地感受。',
            songId: 25638273,
            songUrl: 'https://music.163.com/song/media/outer/url?id=25638273.mp3',
            albumCover: 'https://p1.music.126.net/cover.jpg',
            profileNickname: '夜航员',
            profileLevel: 8,
            profileSignature: '把没说出口的话都放进播放列表。',
            profilePlayCount: 4821,
            playlistName: '不会发出去的话',
            playlistCount: 23,
            playlistIndex: 1,
            songIndex: 3
        } as PhoneEvidence);

        expect(record).toMatchObject({
            artist: '王菲',
            comment: '还没好好地感受。',
            songId: 25638273,
            songUrl: 'https://music.163.com/song/media/outer/url?id=25638273.mp3',
            albumCover: 'https://p1.music.126.net/cover.jpg',
            profileNickname: '夜航员',
            profileLevel: 8,
            profileSignature: '把没说出口的话都放进播放列表。',
            profilePlayCount: 4821,
            playlistName: '不会发出去的话',
            playlistCount: 23,
            playlistIndex: 1,
            songIndex: 3
        });
    });

    it('unlinks a phone record from chat context without changing its visible evidence', () => {
        const record = {
            id: 'order-1',
            type: 'order',
            title: '深夜便利店',
            detail: '薄荷糖×1',
            value: '¥12.00',
            timestamp: 1710000000000,
            systemMessageId: 42
        } as PhoneEvidence;

        expect(unlinkPhoneRecordFromContext(record)).toEqual({
            id: 'order-1',
            type: 'order',
            title: '深夜便利店',
            detail: '薄荷糖×1',
            value: '¥12.00',
            timestamp: 1710000000000
        });
        expect(record.systemMessageId).toBe(42);
    });

    it('converts a Netease phone record into an Emo Cloud playable song', () => {
        expect(phoneRecordToNeteaseSong({
            id: 'music-1',
            type: 'netease_music',
            title: '红豆',
            detail: '王菲\n还没好好地感受。',
            timestamp: 1710000000000,
            artist: '王菲 / 陈奕迅',
            songId: 25638273,
            albumCover: 'https://p1.music.126.net/cover.jpg'
        } as PhoneEvidence)).toEqual({
            kind: 'song',
            id: 25638273,
            name: '红豆',
            artists: [
                { id: 0, name: '王菲' },
                { id: 0, name: '陈奕迅' }
            ],
            album: {
                kind: 'album',
                id: 0,
                name: '',
                picUrl: 'https://p1.music.126.net/cover.jpg'
            },
            duration: 0
        });

        expect(phoneRecordToNeteaseSong({
            id: 'music-2',
            type: 'netease_music',
            title: '未匹配',
            detail: '未知歌手',
            timestamp: 1710000000000
        } as PhoneEvidence)).toBeNull();
    });

    it('groups Netease phone records into profile playlists for rendering', () => {
        const viewModel = buildNeteaseMusicProfileViewModel([
            {
                id: 'song-2',
                type: 'netease_music',
                title: '山丘',
                detail: '李宗盛',
                timestamp: 2,
                profileNickname: '夜航员',
                profileLevel: 8,
                profileSignature: '不解释。',
                profilePlayCount: 4821,
                playlistName: '不会发出去的话',
                playlistCount: 23,
                playlistIndex: 1,
                songIndex: 0
            },
            {
                id: 'song-1',
                type: 'netease_music',
                title: '红豆',
                detail: '王菲',
                timestamp: 1,
                playlistName: '我喜欢的音乐',
                playlistCount: 88,
                playlistIndex: 0,
                songIndex: 0
            }
        ] as PhoneEvidence[], 'Fallback');

        expect(viewModel.profile).toEqual({
            nickname: '夜航员',
            level: 8,
            signature: '不解释。',
            playCount: 4821
        });
        expect(viewModel.playlists.map(playlist => ({
            name: playlist.name,
            count: playlist.count,
            records: playlist.records.map(record => record.title)
        }))).toEqual([
            { name: '我喜欢的音乐', count: 88, records: ['红豆'] },
            { name: '不会发出去的话', count: 23, records: ['山丘'] }
        ]);
    });

    it('trims overlong generated fields before they are stored', () => {
        const item = normalizeGeneratedPhoneItem({
            title: '一'.repeat(200),
            detail: '内容'.repeat(2000),
            value: '9'.repeat(400)
        });

        expect(item.title.length).toBeLessThanOrEqual(99);
        expect(item.detail.length).toBeLessThanOrEqual(MAX_PHONE_DETAIL_CHARS + 3);
        expect(item.value?.length).toBeLessThanOrEqual(163);
    });

    it('keeps recent phone records within each app storage limit', () => {
        const bankRecords = Array.from({ length: MAX_PHONE_RECORDS_PER_APP + 12 }, (_, index) => ({
            id: `bank-${index}`,
            type: 'bank',
            title: `bank ${index}`,
            detail: `detail ${index}`,
            timestamp: index + 1
        }));

        const pruned = prunePhoneRecords(bankRecords as PhoneEvidence[]);
        const bankPruned = pruned.filter(record => record.type === 'bank');

        expect(bankPruned.length).toBe(MAX_PHONE_RECORDS_PER_APP);
        expect(bankPruned.some(record => record.id === 'bank-0')).toBe(false);
        expect(bankPruned.some(record => record.id === `bank-${MAX_PHONE_RECORDS_PER_APP + 11}`)).toBe(true);
    });

    it('keeps the total phone record count within the mobile-safe cap', () => {
        const manyCustomRecords = Array.from({ length: MAX_PHONE_RECORDS_TOTAL + 20 }, (_, index) => ({
            id: `custom-${index}`,
            type: `custom-${index}`,
            title: `custom ${index}`,
            detail: `detail ${index}`,
            timestamp: 10_000 + index
        }));

        const pruned = prunePhoneRecords(manyCustomRecords as PhoneEvidence[]);

        expect(pruned.length).toBeLessThanOrEqual(MAX_PHONE_RECORDS_TOTAL);
        expect(pruned.some(record => record.id === 'custom-0')).toBe(false);
        expect(pruned.some(record => record.id === `custom-${MAX_PHONE_RECORDS_TOTAL + 19}`)).toBe(true);
    });

    it('normalizes legacy phone state before it is mounted into the phone app', () => {
        const records = Array.from({ length: MAX_PHONE_RECORDS_PER_APP + 2 }, (_, index) => ({
            id: `chat-${index}`,
            type: 'chat',
            title: index === 0 ? ({ label: '旧联系人' } as unknown as string) : `联系人 ${index}`,
            detail: '长内容'.repeat(2000),
            timestamp: index + 1,
            ...(index === 10 ? { largeLegacyPayload: { nested: '不会被继续带入手机记录' } } : {})
        }));

        const phoneState = { records: records as PhoneEvidence[], customApps: [] };
        const normalized = normalizePhoneState(phoneState);

        expect(phoneStateNeedsNormalization(phoneState, normalized)).toBe(true);
        expect(normalized.records.length).toBe(MAX_PHONE_RECORDS_PER_APP);
        expect(normalized.records[0].title).toBe('联系人 2');
        expect(normalized.records[0].detail.length).toBeLessThanOrEqual(MAX_PHONE_CHAT_DETAIL_CHARS + 3);
        expect('largeLegacyPayload' in (normalized.records.find(record => record.id === 'chat-10') as unknown as Record<string, unknown>)).toBe(false);
    });

    it('keeps chat timeline phone evidence detailed without exceeding record safety limits', () => {
        const longDetail = '招牌奶茶×1; '.repeat(500);
        const draft = buildPhoneSystemMessageDraft({
            type: 'delivery',
            charName: 'Sully',
            charAvatar: 'avatar.png',
            logPrefix: '外卖APP',
            title: '深夜茶餐厅',
            detail: longDetail,
            value: '¥42.00',
            shop: '已完成'
        });

        expect(draft.content).toContain('招牌奶茶');
        expect(String(draft.metadata.phoneDetail).length).toBeLessThanOrEqual(MAX_PHONE_DETAIL_CHARS + 3);
        expect(draft.metadata.phoneTitle).toBe('深夜茶餐厅');
        expect(draft.metadata.phoneValue).toBe('¥42.00');
    });
});
