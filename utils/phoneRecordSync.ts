import { CharacterProfile } from '../types';

export const getFiniteMessageIds = (messageIds: Iterable<number>): number[] => {
    const ids = new Set<number>();
    for (const id of messageIds) {
        if (Number.isFinite(id)) ids.add(id);
    }
    return Array.from(ids);
};

export const removePhoneRecordsLinkedToMessageIds = (
    phoneState: CharacterProfile['phoneState'] | undefined,
    messageIds: Iterable<number>,
): CharacterProfile['phoneState'] | null => {
    const linkedMessageIds = new Set(getFiniteMessageIds(messageIds));
    if (linkedMessageIds.size === 0) return null;

    const currentRecords = phoneState?.records || [];
    const nextRecords = currentRecords.filter(record => (
        typeof record.systemMessageId !== 'number' || !linkedMessageIds.has(record.systemMessageId)
    ));

    if (nextRecords.length === currentRecords.length) return null;

    return {
        ...phoneState,
        records: nextRecords,
    };
};
