import { beforeEach, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DB } from '../utils/db';
import type { MemoryRecord } from '../types';

function makeRecord(id = 'mrec-test'): MemoryRecord {
    return {
        id,
        charId: 'char-a',
        charName: 'Sully',
        userName: '我',
        mode: 'blind_box',
        status: 'draft',
        title: '雨后留声',
        albumName: '回忆唱片匣',
        artistName: 'Sully',
        monologueText: '这首歌，是我偷偷留下来的。',
        lyrics: '[Verse]\n雨停以后我还在',
        musicPrompt: 'warm intimate pop',
        coverGradient: 'linear-gradient(135deg, #fff, #000)',
        seedMemoryIds: ['vmem-a'],
        createdAt: 100,
        updatedAt: 100,
    };
}

describe('memory record store', () => {
    beforeEach(async () => {
        Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
        Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, configurable: true });
        Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, configurable: true });
    });

    it('persists records and audio blobs', async () => {
        const record = makeRecord();
        await DB.saveMemoryRecord(record);
        await DB.saveMemoryRecordAudio({
            id: `${record.id}:master`,
            recordId: record.id,
            kind: 'master',
            blob: new Blob(['mp3-data'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            durationMs: 120000,
            createdAt: 101,
        });

        const records = await DB.getMemoryRecords('char-a');
        const audio = await DB.getMemoryRecordAudio(`${record.id}:master`);

        expect(records).toHaveLength(1);
        expect(records[0].title).toBe('雨后留声');
        expect(audio).toBeInstanceOf(Blob);
        expect(await audio?.text()).toBe('mp3-data');
    });

    it('deletes record audio when deleting the record', async () => {
        const record = makeRecord('mrec-delete');
        await DB.saveMemoryRecord(record);
        await DB.saveMemoryRecordAudio({
            id: `${record.id}:music`,
            recordId: record.id,
            kind: 'music',
            blob: new Blob(['song'], { type: 'audio/mpeg' }),
            mimeType: 'audio/mpeg',
            createdAt: 102,
        });

        await DB.deleteMemoryRecord(record.id);

        expect(await DB.getMemoryRecordById(record.id)).toBeNull();
        expect(await DB.getMemoryRecordAudio(`${record.id}:music`)).toBeNull();
    });
});
