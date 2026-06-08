import { describe, expect, it } from 'vitest';
import type { CharacterProfile } from '../types';
import { getFiniteMessageIds, removePhoneRecordsLinkedToMessageIds } from './phoneRecordSync';

describe('phoneRecordSync', () => {
    it('deduplicates finite message ids', () => {
        expect(getFiniteMessageIds([12, Number.NaN, 12, 18, Infinity])).toEqual([12, 18]);
    });

    it('removes phone records linked to deleted chat messages', () => {
        const phoneState: CharacterProfile['phoneState'] = {
            records: [
                { id: 'keep', type: 'order', title: '保留', detail: '还在聊天里', timestamp: 1, systemMessageId: 100 },
                { id: 'drop', type: 'social', title: '删除', detail: '聊天卡片已删', timestamp: 2, systemMessageId: 101 },
                { id: 'legacy', type: 'chat', title: '旧数据', detail: '无绑定消息', timestamp: 3 },
            ],
            customApps: [
                { id: 'app-1', name: '测试', icon: 'T', color: '#111', prompt: '生成测试数据' },
            ],
        };

        const nextPhoneState = removePhoneRecordsLinkedToMessageIds(phoneState, [101]);

        expect(nextPhoneState?.records?.map(record => record.id)).toEqual(['keep', 'legacy']);
        expect(nextPhoneState?.customApps).toBe(phoneState.customApps);
    });

    it('returns null when no linked records are affected', () => {
        const phoneState: CharacterProfile['phoneState'] = {
            records: [
                { id: 'keep', type: 'order', title: '保留', detail: '还在', timestamp: 1, systemMessageId: 100 },
            ],
            customApps: [],
        };

        expect(removePhoneRecordsLinkedToMessageIds(phoneState, [999])).toBeNull();
    });
});
