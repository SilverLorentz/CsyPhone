import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowBendUpLeft,
    Books,
    ChatCircleText,
    ClockCounterClockwise,
    FunnelSimple,
    MagnifyingGlass,
    PencilSimple,
    Star,
    TreeStructure,
} from '@phosphor-icons/react';
import type { CharacterProfile, MemoryFragment, Message, VectorMemory } from '../../types';
import { DB } from '../../utils/db';
import { formatMessageForContext } from '../../utils/messageContext';
import type { VectorMemoryEditableFields } from '../character/memoryCenterActions';

type BrowserMemoryKind = 'traditional' | 'core' | 'vector';
type BrowserTypeFilter = 'all' | BrowserMemoryKind;
type BrowserSortOrder = 'newest' | 'oldest' | 'importance';
type SourceContextMode = 'exact' | 'nearby' | 'missing';

interface BrowserMemoryItem {
    id: string;
    rawId: string;
    kind: BrowserMemoryKind;
    charId: string;
    charName: string;
    charAvatar: string;
    title: string;
    content: string;
    emotionalJourney?: string;
    importance: number;
    createdAt: number;
    dateLabel: string;
    sourceLabel: string;
    sourceMessageIds?: number[];
    dateRange?: { start: number; end: number };
    relatedRecordCount: number;
}

interface SourceContextState {
    loading: boolean;
    mode?: SourceContextMode;
    messages: Message[];
    sourceIds: Set<number>;
    targetMessageId?: number;
    note?: string;
}

interface MemoryBrowserProps {
    characters: CharacterProfile[];
    selectedCharId: string | null;
    onSelectedCharIdChange: (charId: string | null) => void;
    userName: string;
    addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    onOpenSourceInChat: (charId: string, messageId: number) => void;
    onUpdateVectorMemory?: (
        memoryId: string,
        updates: VectorMemoryEditableFields,
    ) => Promise<{ mode: 'cloud' | 'local_fallback'; reason?: string }>;
}

interface VectorMemoryEditDraft extends VectorMemoryEditableFields {
    itemId: string;
    rawId: string;
}

const KIND_LABELS: Record<BrowserMemoryKind, string> = {
    traditional: '传统记忆',
    core: '核心记忆',
    vector: '向量记忆',
};

const SOURCE_LABELS: Record<string, string> = {
    auto: '自动提取',
    manual: '手动记录',
    import: '外部导入',
    sync: '云端同步',
    call: '通话提取',
    distillation: '认知蒸馏',
    musing: '独处浮现',
};

const SOURCE_CONTEXT_SIDE_COUNT = 2;
const NEARBY_CONTEXT_LIMIT = 8;

function normalizeSearchText(value: string): string {
    return value.trim().toLowerCase();
}

function formatDate(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间待确认';
    return new Date(timestamp).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

function formatMonth(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '未归档';
    return new Date(timestamp).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
    });
}

function formatTime(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function parseDateRange(dateText: string): { start: number; end: number } | undefined {
    const match = String(dateText || '').match(/(\d{4})[-/年](\d{1,2})(?:[-/月](\d{1,2}))?/);
    if (!match) return undefined;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = match[3] ? Number(match[3]) : undefined;
    if (!Number.isFinite(year) || !Number.isFinite(month)) return undefined;

    if (day) {
        const start = new Date(year, month - 1, day).getTime();
        const end = new Date(year, month - 1, day + 1).getTime() - 1;
        return { start, end };
    }

    const start = new Date(year, month - 1, 1).getTime();
    const end = new Date(year, month, 1).getTime() - 1;
    return { start, end };
}

function createdAtFromRange(range?: { start: number; end: number }): number {
    if (!range) return 0;
    return range.start;
}

function titleFromMemory(memory: MemoryFragment): string {
    const mood = memory.mood?.trim();
    if (mood && mood !== 'archive') return mood;
    return memory.date || '旧日记忆';
}

function buildTraditionalItem(char: CharacterProfile, memory: MemoryFragment, relatedRecordCount: number): BrowserMemoryItem {
    const range = parseDateRange(memory.date);
    return {
        id: `traditional:${char.id}:${memory.id}`,
        rawId: memory.id,
        kind: 'traditional',
        charId: char.id,
        charName: char.name,
        charAvatar: char.avatar,
        title: titleFromMemory(memory),
        content: memory.summary || '',
        emotionalJourney: memory.mood && memory.mood !== 'archive' ? memory.mood : undefined,
        importance: 5,
        createdAt: createdAtFromRange(range),
        dateLabel: memory.date || '时间待确认',
        sourceLabel: '日记归档',
        dateRange: range,
        relatedRecordCount,
    };
}

function buildCoreItem(char: CharacterProfile, monthKey: string, content: string, relatedRecordCount: number): BrowserMemoryItem {
    const range = parseDateRange(monthKey);
    const [year, month] = monthKey.split('-');
    return {
        id: `core:${char.id}:${monthKey}`,
        rawId: monthKey,
        kind: 'core',
        charId: char.id,
        charName: char.name,
        charAvatar: char.avatar,
        title: `${year || ''}年${Number(month || 0) || ''}月核心记忆`,
        content,
        importance: 7,
        createdAt: createdAtFromRange(range),
        dateLabel: monthKey,
        sourceLabel: '月度精炼',
        dateRange: range,
        relatedRecordCount,
    };
}

function buildVectorItem(char: CharacterProfile, memory: VectorMemory, relatedRecordCount: number): BrowserMemoryItem {
    return {
        id: `vector:${memory.id}`,
        rawId: memory.id,
        kind: 'vector',
        charId: char.id,
        charName: char.name,
        charAvatar: char.avatar,
        title: memory.title || '未命名向量记忆',
        content: memory.content || '',
        emotionalJourney: memory.emotionalJourney,
        importance: memory.importance || 5,
        createdAt: memory.createdAt || 0,
        dateLabel: formatDate(memory.createdAt || 0),
        sourceLabel: SOURCE_LABELS[memory.source] || memory.source || '向量库',
        sourceMessageIds: memory.sourceMessageIds,
        relatedRecordCount,
    };
}

function countRelatedRecords(records: Awaited<ReturnType<typeof DB.getMemoryRecords>>): Map<string, number> {
    const counts = new Map<string, number>();
    for (const record of records || []) {
        const memoryIds = new Set([
            ...(record.seedMemoryIds || []),
            ...(record.selectedMemoryIds || []),
        ].filter(Boolean));
        for (const memoryId of memoryIds) {
            counts.set(memoryId, (counts.get(memoryId) || 0) + 1);
        }
    }
    return counts;
}

async function loadItemsForCharacter(char: CharacterProfile): Promise<BrowserMemoryItem[]> {
    const [vectorMemories, records] = await Promise.all([
        DB.getAllVectorMemories(char.id).catch(() => [] as VectorMemory[]),
        DB.getMemoryRecords(char.id).catch(() => []),
    ]);
    const relatedRecordCounts = countRelatedRecords(records);
    const items: BrowserMemoryItem[] = [];

    for (const memory of char.memories || []) {
        items.push(buildTraditionalItem(char, memory, relatedRecordCounts.get(memory.id) || 0));
    }

    for (const [monthKey, content] of Object.entries(char.refinedMemories || {})) {
        if (String(content || '').trim()) {
            items.push(buildCoreItem(char, monthKey, content, relatedRecordCounts.get(monthKey) || 0));
        }
    }

    for (const memory of vectorMemories || []) {
        items.push(buildVectorItem(char, memory, relatedRecordCounts.get(memory.id) || 0));
    }

    return items;
}

function filterMessagesForContext(messages: Message[], item: BrowserMemoryItem, sourceIds: Set<number>): Message[] {
    return messages.filter(message => {
        if (sourceIds.has(message.id)) return true;
        return Boolean(formatMessageForContext(message, {
            charName: item.charName,
            userName: '我',
            compact: true,
            maxContentChars: 180,
        }));
    });
}

async function loadSourceContext(item: BrowserMemoryItem): Promise<Omit<SourceContextState, 'loading'>> {
    const exactIds = (item.sourceMessageIds || [])
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));

    if (exactIds.length > 0) {
        const [sourceMessages, allMessages] = await Promise.all([
            DB.getMessagesByIds(exactIds).catch(() => [] as Message[]),
            DB.getMessagesByCharId(item.charId).catch(() => [] as Message[]),
        ]);
        const sourceIds = new Set(sourceMessages.map(message => message.id));
        const sourceIndexes = allMessages
            .map((message, index) => sourceIds.has(message.id) ? index : -1)
            .filter(index => index >= 0);

        if (sourceIndexes.length > 0) {
            const firstIndex = Math.min(...sourceIndexes);
            const lastIndex = Math.max(...sourceIndexes);
            const start = Math.max(0, firstIndex - SOURCE_CONTEXT_SIDE_COUNT);
            const end = Math.min(allMessages.length, lastIndex + SOURCE_CONTEXT_SIDE_COUNT + 1);
            return {
                mode: 'exact',
                messages: filterMessagesForContext(allMessages.slice(start, end), item, sourceIds),
                sourceIds,
                targetMessageId: allMessages[firstIndex]?.id,
                note: '精确来源',
            };
        }

        if (sourceMessages.length > 0) {
            return {
                mode: 'exact',
                messages: sourceMessages,
                sourceIds,
                targetMessageId: sourceMessages[0]?.id,
                note: '精确来源',
            };
        }
    }

    if (item.dateRange) {
        const allMessages = await DB.getMessagesByCharId(item.charId).catch(() => [] as Message[]);
        const nearby = allMessages
            .filter(message => message.timestamp >= item.dateRange!.start && message.timestamp <= item.dateRange!.end)
            .slice(0, NEARBY_CONTEXT_LIMIT);

        if (nearby.length > 0) {
            return {
                mode: 'nearby',
                messages: filterMessagesForContext(nearby, item, new Set()),
                sourceIds: new Set(),
                targetMessageId: nearby[0]?.id,
                note: item.kind === 'core' ? '月份附近' : '日期附近',
            };
        }
    }

    return {
        mode: 'missing',
        messages: [],
        sourceIds: new Set(),
        note: '暂无可追溯聊天',
    };
}

function formatSourceMessage(message: Message, item: BrowserMemoryItem, userName: string): string {
    return formatMessageForContext(message, {
        charName: item.charName,
        userName,
        includeSpeaker: true,
        maxContentChars: 220,
    }) || message.content || `[${message.type}]`;
}

const MemoryBrowser: React.FC<MemoryBrowserProps> = ({
    characters,
    selectedCharId,
    onSelectedCharIdChange,
    userName,
    addToast,
    onOpenSourceInChat,
    onUpdateVectorMemory,
}) => {
    const [items, setItems] = useState<BrowserMemoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<BrowserTypeFilter>('all');
    const [sortOrder, setSortOrder] = useState<BrowserSortOrder>('newest');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [sourceContexts, setSourceContexts] = useState<Record<string, SourceContextState>>({});
    const [editingVector, setEditingVector] = useState<VectorMemoryEditDraft | null>(null);
    const [savingVectorEdit, setSavingVectorEdit] = useState(false);

    const targetCharacters = useMemo(() => {
        if (!selectedCharId) return characters;
        return characters.filter(char => char.id === selectedCharId);
    }, [characters, selectedCharId]);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setExpandedId(null);
        setSourceContexts({});

        Promise.all(targetCharacters.map(loadItemsForCharacter))
            .then(groups => {
                if (!active) return;
                setItems(groups.flat());
            })
            .catch(error => {
                if (!active) return;
                console.error('[MemoryBrowser] Failed to load memories:', error);
                setItems([]);
                addToast('记忆浏览器载入失败', 'error');
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [targetCharacters, addToast]);

    const filteredItems = useMemo(() => {
        const normalizedQuery = normalizeSearchText(query);
        const filtered = items.filter(item => {
            if (typeFilter !== 'all' && item.kind !== typeFilter) return false;
            if (!normalizedQuery) return true;
            const haystack = [
                item.title,
                item.content,
                item.emotionalJourney || '',
                item.charName,
                item.sourceLabel,
                item.dateLabel,
            ].join(' ').toLowerCase();
            return haystack.includes(normalizedQuery);
        });

        return [...filtered].sort((a, b) => {
            if (sortOrder === 'oldest') return a.createdAt - b.createdAt;
            if (sortOrder === 'importance') return b.importance - a.importance || b.createdAt - a.createdAt;
            return b.createdAt - a.createdAt;
        });
    }, [items, query, sortOrder, typeFilter]);

    const groupedItems = useMemo(() => {
        const groups: { label: string; items: BrowserMemoryItem[] }[] = [];
        const groupMap = new Map<string, BrowserMemoryItem[]>();
        for (const item of filteredItems) {
            const label = formatMonth(item.createdAt);
            if (!groupMap.has(label)) groupMap.set(label, []);
            groupMap.get(label)!.push(item);
        }
        for (const [label, groupItems] of groupMap.entries()) {
            groups.push({ label, items: groupItems });
        }
        return groups;
    }, [filteredItems]);

    const counts = useMemo(() => ({
        all: items.length,
        traditional: items.filter(item => item.kind === 'traditional').length,
        core: items.filter(item => item.kind === 'core').length,
        vector: items.filter(item => item.kind === 'vector').length,
        traceable: items.filter(item => (item.sourceMessageIds?.length || 0) > 0 || item.dateRange).length,
    }), [items]);

    const toggleExpand = useCallback((item: BrowserMemoryItem) => {
        setExpandedId(prev => prev === item.id ? null : item.id);
        if (sourceContexts[item.id]?.mode || sourceContexts[item.id]?.loading) return;

        setSourceContexts(prev => ({
            ...prev,
            [item.id]: {
                loading: true,
                messages: [],
                sourceIds: new Set(),
            },
        }));

        loadSourceContext(item)
            .then(context => {
                setSourceContexts(prev => ({
                    ...prev,
                    [item.id]: {
                        ...context,
                        loading: false,
                    },
                }));
            })
            .catch(error => {
                console.error('[MemoryBrowser] Failed to load source context:', error);
                setSourceContexts(prev => ({
                    ...prev,
                    [item.id]: {
                        loading: false,
                        mode: 'missing',
                        messages: [],
                        sourceIds: new Set(),
                        note: '追溯失败',
                    },
                }));
            });
    }, [sourceContexts]);

    const beginEditVector = useCallback((item: BrowserMemoryItem) => {
        if (item.kind !== 'vector') return;
        setEditingVector({
            itemId: item.id,
            rawId: item.rawId,
            title: item.title,
            content: item.content,
            importance: item.importance,
        });
    }, []);

    const saveVectorEdit = useCallback(async () => {
        if (!editingVector || !onUpdateVectorMemory || savingVectorEdit) return;

        const title = editingVector.title.trim();
        const content = editingVector.content.trim();
        const importance = Math.min(10, Math.max(1, Math.round(Number(editingVector.importance) || 5)));

        if (!title || !content) {
            addToast('标题和内容不能为空', 'error');
            return;
        }

        setSavingVectorEdit(true);
        try {
            const result = await onUpdateVectorMemory(editingVector.rawId, { title, content, importance });
            setItems(prev => prev.map(item => item.id === editingVector.itemId
                ? { ...item, title, content, importance }
                : item,
            ));
            setEditingVector(null);
            addToast(
                result.mode === 'cloud'
                    ? '已保存并同步云端'
                    : result.reason === 'local_only'
                        ? '已保存到本地'
                        : '后端暂不可用，已先保存本地',
                result.mode === 'cloud' ? 'success' : 'info',
            );
        } catch (error) {
            console.error('[MemoryBrowser] Failed to update vector memory:', error);
            addToast('保存向量记忆失败，请重试', 'error');
        } finally {
            setSavingVectorEdit(false);
        }
    }, [addToast, editingVector, onUpdateVectorMemory, savingVectorEdit]);

    return (
        <div className="flex-1 overflow-y-auto no-scrollbar bg-[#0d0c11] text-[#fffaf0]">
            <div className="relative min-h-full overflow-hidden px-5 pb-24 pt-16">
                <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
                    <img src="/images/akashic-texture.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-[0.08]" />
                    <img src="/images/collage/lace-ribbon-butterfly.png" alt="" className="absolute -right-20 top-20 w-64 rotate-[10deg] opacity-[0.08]" style={{ filter: 'invert(1) brightness(1.45)' }} />
                    <img src="/images/decorations/postmark4.png" alt="" className="absolute -left-6 bottom-16 w-40 -rotate-12 opacity-[0.06]" style={{ filter: 'invert(1) brightness(1.5)' }} />
                </div>

                <div className="relative z-10 mx-auto max-w-[920px] space-y-5">
                    <section className="rounded-[18px] border border-[#d7b56c]/18 bg-[#171419]/88 p-5 shadow-[0_18px_44px_rgba(0,0,0,0.38)]">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold tracking-[0.32em] text-[#d7b56c]/60">MEMORY BROWSER</p>
                                <h1 className="mt-2 text-[28px] font-bold tracking-[0.18em] text-[#fffaf0]" style={{ fontFamily: "'Noto Serif SC', serif" }}>记忆浏览器</h1>
                                <p className="mt-3 text-[12px] leading-relaxed text-white/48">
                                    按角色和时间翻阅真实记忆，从一段回忆追到它出生的聊天现场。
                                </p>
                            </div>
                            <div className="hidden shrink-0 rounded-[14px] border border-[#e5d08f]/18 bg-black/20 px-4 py-3 text-right sm:block">
                                <p className="text-[9px] tracking-[0.2em] text-white/32">TRACEABLE</p>
                                <p className="mt-1 text-[24px] font-bold leading-none text-[#fff1bd]" style={{ fontFamily: 'Georgia, serif' }}>{counts.traceable}</p>
                            </div>
                        </div>

                        <div className="mt-5 flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button
                                type="button"
                                onClick={() => onSelectedCharIdChange(null)}
                                className={`shrink-0 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition-all ${
                                    !selectedCharId
                                        ? 'border-transparent bg-[#fffaf0] text-[#17151B]'
                                        : 'border-white/[0.08] bg-white/[0.045] text-white/48 hover:bg-white/[0.08]'
                                }`}
                            >
                                全部角色
                            </button>
                            {characters.map(char => (
                                <button
                                    key={char.id}
                                    type="button"
                                    onClick={() => onSelectedCharIdChange(char.id)}
                                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                                        selectedCharId === char.id
                                            ? 'border-transparent bg-[#fffaf0] text-[#17151B]'
                                            : 'border-white/[0.08] bg-white/[0.045] text-white/48 hover:bg-white/[0.08]'
                                    }`}
                                >
                                    <img src={char.avatar} alt={char.name} className="h-5 w-5 rounded-full object-cover" />
                                    {char.name}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="grid grid-cols-4 gap-2">
                        {[
                            { label: '全部', value: counts.all, icon: Books },
                            { label: '传统', value: counts.traditional, icon: ClockCounterClockwise },
                            { label: '核心', value: counts.core, icon: Star },
                            { label: '向量', value: counts.vector, icon: TreeStructure },
                        ].map(stat => {
                            const Icon = stat.icon;
                            return (
                                <div key={stat.label} className="rounded-[14px] border border-white/[0.06] bg-white/[0.04] px-3 py-3">
                                    <Icon weight="duotone" className="h-4 w-4 text-[#fff1bd]/70" />
                                    <p className="mt-2 text-[18px] font-bold leading-none text-white/90" style={{ fontFamily: 'Georgia, serif' }}>{stat.value}</p>
                                    <p className="mt-1 text-[9px] tracking-[0.18em] text-white/30">{stat.label}</p>
                                </div>
                            );
                        })}
                    </section>

                    <section className="rounded-[16px] border border-white/[0.06] bg-[#151319]/90 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.28)]">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <label className="relative flex min-w-0 flex-1 items-center">
                                <MagnifyingGlass className="pointer-events-none absolute left-3 h-4 w-4 text-white/28" />
                                <input
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder="搜索标题、内容、角色或来源..."
                                    className="h-10 w-full rounded-[12px] border border-white/[0.06] bg-white/[0.055] pl-9 pr-3 text-[12px] text-white/82 outline-none transition-colors placeholder:text-white/26 focus:border-[#d7b56c]/36 focus:bg-white/[0.075]"
                                />
                            </label>
                            <label className="relative flex items-center">
                                <FunnelSimple className="pointer-events-none absolute left-3 h-4 w-4 text-white/28" />
                                <select
                                    value={typeFilter}
                                    onChange={event => setTypeFilter(event.target.value as BrowserTypeFilter)}
                                    className="h-10 min-w-[128px] appearance-none rounded-[12px] border border-white/[0.06] bg-white/[0.055] pl-9 pr-8 text-[12px] font-semibold text-white/72 outline-none focus:border-[#d7b56c]/36"
                                >
                                    <option value="all">全部类型</option>
                                    <option value="traditional">传统记忆</option>
                                    <option value="core">核心记忆</option>
                                    <option value="vector">向量记忆</option>
                                </select>
                            </label>
                            <select
                                value={sortOrder}
                                onChange={event => setSortOrder(event.target.value as BrowserSortOrder)}
                                className="h-10 min-w-[126px] rounded-[12px] border border-white/[0.06] bg-white/[0.055] px-3 text-[12px] font-semibold text-white/72 outline-none focus:border-[#d7b56c]/36"
                            >
                                <option value="newest">最新优先</option>
                                <option value="oldest">最早优先</option>
                                <option value="importance">重要度优先</option>
                            </select>
                        </div>
                    </section>

                    {loading ? (
                        <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.035] py-16 text-center text-[12px] text-white/42">
                            正在翻找记忆索引...
                        </div>
                    ) : groupedItems.length === 0 ? (
                        <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-white/[0.025] px-6 py-16 text-center">
                            <p className="text-[13px] font-semibold text-white/62">没有找到匹配的记忆</p>
                            <p className="mt-2 text-[11px] text-white/34">换一个角色、类型或关键词试试。</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {groupedItems.map(group => (
                                <section key={group.label} className="space-y-3">
                                    <div className="flex items-center gap-3 px-1">
                                        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#d7b56c]/24 to-transparent" />
                                        <span className="text-[10px] font-semibold tracking-[0.24em] text-[#d7b56c]/54">{group.label}</span>
                                        <span className="h-px flex-1 bg-gradient-to-r from-[#d7b56c]/24 via-transparent to-transparent" />
                                    </div>

                                    <div className="space-y-3">
                                        {group.items.map(item => {
                                            const isExpanded = expandedId === item.id;
                                            const sourceContext = sourceContexts[item.id];
                                            return (
                                                <article key={item.id} className="overflow-hidden rounded-[16px] border border-white/[0.07] bg-[#171419]/88 shadow-[0_16px_34px_rgba(0,0,0,0.3)]">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(item)}
                                                        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.035]"
                                                    >
                                                        <img src={item.charAvatar} alt={item.charName} className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px] object-cover ring-1 ring-white/10" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="rounded-full border border-[#d7b56c]/22 bg-[#d7b56c]/10 px-2 py-0.5 text-[8px] font-bold tracking-[0.14em] text-[#fff1bd]/78">
                                                                    {KIND_LABELS[item.kind]}
                                                                </span>
                                                                <span className="text-[10px] text-white/36">{item.charName}</span>
                                                                {item.relatedRecordCount > 0 && (
                                                                    <span className="rounded-full bg-[#d99aae]/12 px-2 py-0.5 text-[8px] font-bold text-[#ffdce8]/74">
                                                                        关联回声唱片 {item.relatedRecordCount}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h3 className="mt-2 truncate text-[14px] font-semibold text-white/90">{item.title}</h3>
                                                            <p className={`mt-1 text-[11px] leading-relaxed text-white/48 ${isExpanded ? '' : 'line-clamp-2'}`}>{item.content}</p>
                                                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/30">
                                                                <span>{item.dateLabel}</span>
                                                                <span>{item.sourceLabel}</span>
                                                                <span>重要度 {item.importance}/10</span>
                                                            </div>
                                                        </div>
                                                        <span className={`mt-1 text-[#fff1bd]/50 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="border-t border-white/[0.06] bg-[#0f0d12]/58 px-4 pb-4 pt-3">
                                                            {item.kind === 'vector' && onUpdateVectorMemory && (
                                                                <div className="mb-3 flex justify-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => beginEditVector(item)}
                                                                        className="inline-flex items-center gap-1.5 rounded-full border border-[#d7b56c]/20 bg-[#d7b56c]/10 px-3 py-1.5 text-[10px] font-bold text-[#fff1bd]/74 transition-colors hover:bg-[#d7b56c]/16"
                                                                    >
                                                                        <PencilSimple weight="bold" className="h-3.5 w-3.5" />
                                                                        编辑记忆
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {item.emotionalJourney && (
                                                                <div className="mb-3 rounded-[12px] border border-[#d99aae]/18 bg-[#d99aae]/10 px-3 py-2">
                                                                    <p className="text-[9px] font-semibold tracking-[0.2em] text-[#ffdce8]/62">情绪上下文</p>
                                                                    <p className="mt-1 text-[11px] italic leading-relaxed text-[#ffe8f0]/70">{item.emotionalJourney}</p>
                                                                </div>
                                                            )}

                                                            <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.035] p-3">
                                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-[9px] font-semibold tracking-[0.2em] text-white/36">来源追溯</p>
                                                                        <p className="mt-1 text-[10px] text-[#fff1bd]/58">
                                                                            {sourceContext?.loading ? '正在定位聊天记录...' : sourceContext?.note || '等待展开'}
                                                                        </p>
                                                                    </div>
                                                                    {sourceContext?.targetMessageId && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => onOpenSourceInChat(item.charId, sourceContext.targetMessageId!)}
                                                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#fffaf0] px-3 py-1.5 text-[10px] font-bold text-[#17151B] transition-transform active:scale-[0.97]"
                                                                        >
                                                                            <ChatCircleText weight="bold" className="h-3.5 w-3.5" />
                                                                            回到聊天
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {sourceContext?.messages.length ? (
                                                                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1 no-scrollbar">
                                                                        {sourceContext.messages.map(message => {
                                                                            const isExactSource = sourceContext.sourceIds.has(message.id);
                                                                            return (
                                                                                <div
                                                                                    key={message.id}
                                                                                    className={`rounded-[10px] border px-3 py-2 text-[10px] leading-relaxed ${
                                                                                        isExactSource
                                                                                            ? 'border-[#fff1bd]/30 bg-[#fff1bd]/10 text-white/78'
                                                                                            : 'border-white/[0.05] bg-black/16 text-white/50'
                                                                                    }`}
                                                                                >
                                                                                    <div className="mb-1 flex items-center justify-between gap-2 text-[8px] text-white/28">
                                                                                        <span>{formatTime(message.timestamp)}</span>
                                                                                        {isExactSource && <span>精确来源</span>}
                                                                                    </div>
                                                                                    {formatSourceMessage(message, item, userName)}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                ) : sourceContext?.loading ? (
                                                                    <p className="py-4 text-center text-[10px] text-white/34">正在拾取上下文...</p>
                                                                ) : (
                                                                    <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.05] bg-black/14 px-3 py-3 text-[10px] text-white/38">
                                                                        <ArrowBendUpLeft className="h-4 w-4 text-white/28" />
                                                                        暂时没有可定位的聊天记录。
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {editingVector && (
                <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/58 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 backdrop-blur-[2px]">
                    <div className="w-full max-w-[520px] rounded-t-[24px] border border-white/[0.08] bg-[#121015]/[0.98] p-4 shadow-[0_-24px_70px_rgba(0,0,0,0.62)]">
                        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/18" />
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-semibold tracking-[0.24em] text-[#e5d08f]/68">VECTOR MEMORY</p>
                                <h3 className="mt-1 text-[20px] font-semibold text-[#fffaf0]" style={{ fontFamily: "'Noto Serif SC', serif" }}>编辑向量记忆</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingVector(null)}
                                disabled={savingVectorEdit}
                                className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/48 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                            >
                                取消
                            </button>
                        </div>

                        <div className="space-y-3">
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.18em] text-white/36">标题</span>
                                <input
                                    value={editingVector.title}
                                    onChange={event => setEditingVector({ ...editingVector, title: event.target.value })}
                                    className="h-11 w-full rounded-[13px] border border-white/[0.07] bg-white/[0.055] px-3 text-[12px] text-white/82 outline-none focus:border-[#d7b56c]/36"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.18em] text-white/36">内容</span>
                                <textarea
                                    value={editingVector.content}
                                    onChange={event => setEditingVector({ ...editingVector, content: event.target.value })}
                                    className="h-36 w-full resize-none rounded-[13px] border border-white/[0.07] bg-white/[0.055] p-3 text-[12px] leading-relaxed text-white/82 outline-none focus:border-[#d7b56c]/36"
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-[10px] font-semibold tracking-[0.18em] text-white/36">
                                    重要度 {Math.min(10, Math.max(1, Math.round(Number(editingVector.importance) || 5)))}
                                </span>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={Math.min(10, Math.max(1, Math.round(Number(editingVector.importance) || 5)))}
                                    onChange={event => setEditingVector({ ...editingVector, importance: Number(event.target.value) })}
                                    className="w-full accent-[#fff1bd]"
                                />
                            </label>
                        </div>

                        <button
                            type="button"
                            onClick={saveVectorEdit}
                            disabled={savingVectorEdit}
                            className="mt-4 w-full rounded-[14px] border border-[#e5d08f]/22 bg-[#FFFBF7] px-4 py-3.5 text-[12px] font-bold text-[#17151B] shadow-[0_12px_30px_rgba(255,251,247,0.12)] transition-all active:scale-[0.985] disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.08] disabled:text-white/30 disabled:shadow-none"
                        >
                            {savingVectorEdit ? '保存中...' : '保存修改'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MemoryBrowser;
export {
    buildCoreItem,
    buildTraditionalItem,
    buildVectorItem,
    loadSourceContext,
};
