import React, { memo, useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, Check, PencilSimple, WarningCircle, X } from '@phosphor-icons/react';
import type { CharacterProfile } from '../../types';
import {
    fetchAgentLifeProfile,
    generateAgentLifeProfile,
    updateAgentLifeProfileSection,
    type AgentApiConfig,
    type AgentLifePatternProfile,
    type AgentLifeProfileSection,
    type AgentLifeProfileState,
} from '../../utils/agentBackendClient';
import { buildLifeProfileContextSnapshot } from '../../utils/lifeProfileContextSnapshot';
import { getSecondaryApiConfig } from '../../utils/runtimeConfig';

interface CharacterLifeProfileCardProps {
    character: CharacterProfile;
    userName?: string;
    addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type FieldKind = 'text' | 'array' | 'number' | 'specificPlaces' | 'uncertainties';

type FieldDef = {
    label: string;
    path: string[];
    kind: FieldKind;
    placeholder?: string;
};

type SectionDef = {
    id: AgentLifeProfileSection;
    title: string;
    eyebrow: string;
    description: string;
    fields: FieldDef[];
};

const SECTION_DEFS: SectionDef[] = [
    {
        id: 'identity',
        title: '身份牵引',
        eyebrow: 'identity',
        description: 'ta 被什么身份、职责和生活阶段牵引。',
        fields: [
            { label: '当前身份', path: ['lifeIdentity', 'currentRole'], kind: 'text' },
            { label: '生活阶段', path: ['lifeIdentity', 'lifeStage'], kind: 'text' },
            { label: '稳定职责', path: ['lifeIdentity', 'stableObligations'], kind: 'array' },
            { label: '时间自由度', path: ['lifeIdentity', 'freedomLevel'], kind: 'text' },
            { label: '公开程度', path: ['lifeIdentity', 'publicVisibility'], kind: 'text' },
            { label: '身份关键词', path: ['lifeIdentity', 'identityKeywords'], kind: 'array' },
            { label: '置信度', path: ['lifeIdentity', 'confidence'], kind: 'number' },
        ],
    },
    {
        id: 'rhythm',
        title: '时间节奏',
        eyebrow: 'rhythm',
        description: '周节奏、日内节奏，以及更容易松动的情感窗口。',
        fields: [
            { label: '工作日', path: ['weeklyRhythm', 'workdays'], kind: 'text' },
            { label: '周末', path: ['weeklyRhythm', 'weekends'], kind: 'text' },
            { label: '固定锚点', path: ['weeklyRhythm', 'anchors'], kind: 'array' },
            { label: '例外情况', path: ['weeklyRhythm', 'exceptions'], kind: 'array' },
            { label: '睡眠/清醒', path: ['timeRhythm', 'sleepWake'], kind: 'text' },
            { label: '活跃时段', path: ['timeRhythm', 'activeWindows'], kind: 'array' },
            { label: '专注时段', path: ['timeRhythm', 'focusBlocks'], kind: 'array' },
            { label: '低能量时段', path: ['timeRhythm', 'lowEnergyWindows'], kind: 'array' },
            { label: '情感窗口', path: ['timeRhythm', 'emotionalWindows'], kind: 'array' },
        ],
    },
    {
        id: 'places',
        title: '生活空间',
        eyebrow: 'places',
        description: '抽象生活空间和更具体的活动地点。',
        fields: [
            { label: '私人基点', path: ['placeModel', 'homeBase'], kind: 'text' },
            { label: '工作/学习基点', path: ['placeModel', 'workStudyBase'], kind: 'text' },
            { label: '移动方式', path: ['placeModel', 'mobilityPattern'], kind: 'text' },
            { label: '抽象空间', path: ['placeModel', 'genericPlaces'], kind: 'array' },
            { label: '具体地点', path: ['placeModel', 'specificPlaces'], kind: 'specificPlaces' },
        ],
    },
    {
        id: 'activities',
        title: '活动与私生活',
        eyebrow: 'activities',
        description: '稳定活动、偶发纹理、情感入口和私人小动作。',
        fields: [
            { label: '稳定活动', path: ['activityPalette', 'stable'], kind: 'array' },
            { label: '偶发活动', path: ['activityPalette', 'occasional'], kind: 'array' },
            { label: '情感入口', path: ['activityPalette', 'romanceUsable'], kind: 'array' },
            { label: '私人纹理', path: ['activityPalette', 'privateTexture'], kind: 'array' },
            { label: '低频纹理', path: ['activityPalette', 'lowFrequencyTexture'], kind: 'array' },
            { label: '不作为核心', path: ['activityPalette', 'avoidAsCore'], kind: 'array' },
        ],
    },
    {
        id: 'relationship',
        title: '关系入口',
        eyebrow: 'relationship',
        description: '用户如何自然进入 ta 的日常，以及关系张力和边界。',
        fields: [
            { label: '可用/不可用模式', path: ['relationshipToUser', 'availabilityPattern'], kind: 'text' },
            { label: '联系风格', path: ['relationshipToUser', 'contactStyle'], kind: 'text' },
            { label: '情感位置', path: ['relationshipToUser', 'emotionalPosition'], kind: 'text' },
            { label: '自然入口', path: ['relationshipToUser', 'romanceEntryPoints'], kind: 'array' },
            { label: '张力来源', path: ['relationshipToUser', 'tensionSources'], kind: 'array' },
            { label: '边界', path: ['relationshipToUser', 'boundaries'], kind: 'array' },
        ],
    },
    {
        id: 'rules',
        title: '变化规则',
        eyebrow: 'rules',
        description: '未来日程如何稳定、变化、保持情绪连续。',
        fields: [
            { label: '稳定锚点', path: ['variationPolicy', 'stableAnchors'], kind: 'array' },
            { label: '允许变化', path: ['variationPolicy', 'allowedVariations'], kind: 'array' },
            { label: '恋爱频率', path: ['variationPolicy', 'romanceFrequencyRules'], kind: 'array' },
            { label: '情绪连续', path: ['variationPolicy', 'emotionalContinuityRules'], kind: 'array' },
            { label: '避免重复', path: ['variationPolicy', 'avoidRepeating'], kind: 'array' },
            { label: '低频规则', path: ['variationPolicy', 'lowFrequencyRules'], kind: 'array' },
        ],
    },
];

const DISPLAY_SECTION_DEFS = SECTION_DEFS;

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        if (/signal timed out|timeout|timed out|abort/i.test(error.message)) {
            return '整理耗时有点久，可以稍后刷新看看是否已经完成，或再试一次。';
        }
        if (/llm_error|no_parseable|insufficient_life_profile_content|invalid_profile|empty_profile|unusable_profile/i.test(error.message)) {
            return '这次没有稳定整理出生活底稿，可以稍后再试。';
        }
        return error.message;
    }
    return '这次没有稳定整理出生活底稿，可以稍后再试。';
}

function hasCompleteApiConfig(value: unknown): value is AgentApiConfig {
    if (!value || typeof value !== 'object') return false;
    const config = value as Partial<AgentApiConfig>;
    return Boolean(config.baseUrl?.trim() && config.apiKey?.trim() && config.model?.trim());
}

function pickSecondaryApiConfig(): AgentApiConfig | undefined {
    const config = getSecondaryApiConfig();
    if (!hasCompleteApiConfig(config)) return undefined;
    return {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
    };
}

function formatDate(timestamp?: number): string {
    if (!timestamp) return '';
    try {
        return new Date(timestamp).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
}

function cloneRecord<T>(value: T): T {
    return JSON.parse(JSON.stringify(value || {})) as T;
}

function stringifyValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join('、');
    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).map(stringifyValue).filter(Boolean).join('、');
    }
    return '';
}

function getPathValue(root: Record<string, unknown>, path: string[]): unknown {
    let current: unknown = root;
    for (const key of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function setPathValue(root: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
    const next = cloneRecord(root);
    let current: Record<string, unknown> = next;
    for (let index = 0; index < path.length - 1; index += 1) {
        const key = path[index];
        const existing = current[key];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    current[path[path.length - 1]] = value;
    return next;
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map(item => stringifyValue(item).trim()).filter(Boolean);
}

function arrayToText(value: unknown): string {
    return readStringArray(value).join('\n');
}

function textToArray(value: string): string[] {
    return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function buildSectionValue(section: AgentLifeProfileSection, profile: AgentLifePatternProfile): Record<string, unknown> {
    switch (section) {
        case 'identity':
            return { lifeIdentity: cloneRecord(profile.lifeIdentity) };
        case 'rhythm':
            return {
                weeklyRhythm: cloneRecord(profile.weeklyRhythm),
                timeRhythm: cloneRecord(profile.timeRhythm),
            };
        case 'places':
            return { placeModel: cloneRecord(profile.placeModel) };
        case 'activities':
            return { activityPalette: cloneRecord(profile.activityPalette) };
        case 'relationship':
            return { relationshipToUser: cloneRecord(profile.relationshipToUser) };
        case 'rules':
            return { variationPolicy: cloneRecord(profile.variationPolicy) };
        case 'notes':
            return {
                uncertainties: cloneRecord(profile.uncertainties),
                evidence: cloneRecord(profile.evidence),
            };
        default:
            return {};
    }
}

function formatObjectListItem(item: unknown, kind: FieldKind): string {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return stringifyValue(item);
    const record = item as Record<string, unknown>;
    if (kind === 'specificPlaces') {
        return [record.name, record.category, record.usePolicy].map(stringifyValue).filter(Boolean).join(' / ');
    }
    if (kind === 'uncertainties') {
        return [record.topic, record.detail].map(stringifyValue).filter(Boolean).join(' / ');
    }
    return stringifyValue(item);
}

function getVisibleRows(definition: SectionDef, payload: Record<string, unknown>) {
    return definition.fields
        .map(field => ({
            field,
            value: getPathValue(payload, field.path),
        }))
        .filter(({ value }) => {
            if (Array.isArray(value)) return value.length > 0;
            return Boolean(stringifyValue(value).trim());
        });
}

function hasSectionContent(definition: SectionDef, payload: Record<string, unknown>): boolean {
    return getVisibleRows(definition, payload).length > 0;
}

function SummaryChip({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm shadow-rose-100/30 ring-1 ring-rose-50">
            {children}
        </span>
    );
}

function SectionSourceBadge({
    state,
    section,
    hasContent,
}: {
    state: AgentLifeProfileState;
    section: AgentLifeProfileSection;
    hasContent: boolean;
}) {
    const meta = state.sectionMeta?.[section];
    if (meta?.source === 'manual') {
        return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">手动调整</span>;
    }
    if (meta?.errorMessage) {
        return hasContent
            ? <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400">本次未更新</span>
            : <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-400">待补充</span>;
    }
    if (meta?.source === 'generated') {
        return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">自动整理</span>;
    }
    return <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400">待补充</span>;
}

function SectionPreview({
    definition,
    payload,
}: {
    definition: SectionDef;
    payload: Record<string, unknown>;
}) {
    const rows = getVisibleRows(definition, payload);

    if (rows.length === 0) {
        return (
            <div className="rounded-2xl bg-white/70 px-3 py-3 text-[11px] leading-relaxed text-slate-400 ring-1 ring-white/80">
                这一段还没有稳定内容，可以手动补充或稍后重新整理。
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {rows.map(({ field, value }) => (
                <div key={field.path.join('.')} className="rounded-2xl bg-white/75 px-3 py-2.5 shadow-sm shadow-rose-100/25 ring-1 ring-white/80">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400/90">{field.label}</div>
                    {Array.isArray(value) ? (
                        <div className="mt-1 flex flex-wrap gap-1.5">
                            {value.slice(0, 8).map((item, index) => (
                                <SummaryChip key={`${field.path.join('.')}-${index}`}>
                                    {formatObjectListItem(item, field.kind)}
                                </SummaryChip>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-1 text-xs leading-relaxed text-slate-600">{stringifyValue(value)}</div>
                    )}
                </div>
            ))}
        </div>
    );
}

function TextOrArrayEditor({
    field,
    value,
    onChange,
}: {
    field: FieldDef;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    if (field.kind === 'number') {
        return (
            <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={typeof value === 'number' ? value : ''}
                onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
                className="mt-1 w-full rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
        );
    }

    if (field.kind === 'array') {
        return (
            <textarea
                value={arrayToText(value)}
                onChange={event => onChange(textToArray(event.target.value))}
                rows={3}
                placeholder={field.placeholder || '一行一条'}
                className="mt-1 w-full resize-y rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
            />
        );
    }

    return (
        <textarea
            value={stringifyValue(value)}
            onChange={event => onChange(event.target.value)}
            rows={2}
            placeholder={field.placeholder}
            className="mt-1 w-full resize-y rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
        />
    );
}

type ObjectArrayKind = 'specificPlaces' | 'uncertainties';

const OBJECT_ARRAY_FIELDS: Record<ObjectArrayKind, Array<{ key: string; label: string; type?: 'number' }>> = {
    specificPlaces: [
        { key: 'name', label: '名称' },
        { key: 'category', label: '类别' },
        { key: 'confidence', label: '置信度', type: 'number' },
        { key: 'usePolicy', label: '使用规则' },
    ],
    uncertainties: [
        { key: 'topic', label: '主题' },
        { key: 'detail', label: '说明' },
        { key: 'impact', label: '影响' },
    ],
};

function createObjectArrayItem(kind: ObjectArrayKind): Record<string, unknown> {
    if (kind === 'specificPlaces') return { name: '', category: '', confidence: 0.5, usePolicy: '' };
    return { topic: '', detail: '', impact: '' };
}

function ObjectArrayEditor({
    kind,
    value,
    onChange,
}: {
    kind: ObjectArrayKind;
    value: unknown;
    onChange: (value: Array<Record<string, unknown>>) => void;
}) {
    const items = Array.isArray(value)
        ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>>
        : [];
    const fields = OBJECT_ARRAY_FIELDS[kind];

    const updateItem = (index: number, key: string, nextValue: unknown) => {
        const next = items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: nextValue } : item));
        onChange(next);
    };

    return (
        <div className="mt-2 space-y-2">
            {items.map((item, index) => (
                <div key={index} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-slate-400">第 {index + 1} 条</span>
                        <button
                            type="button"
                            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
                            className="rounded-full p-1 text-slate-300 transition-colors hover:bg-slate-50 hover:text-red-400"
                            aria-label="删除条目"
                        >
                            <X size={13} weight="bold" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                        {fields.map(field => (
                            <label key={field.key} className="text-[10px] font-semibold text-slate-400">
                                {field.label}
                                <input
                                    type={field.type === 'number' ? 'number' : 'text'}
                                    min={field.type === 'number' ? 0 : undefined}
                                    max={field.type === 'number' ? 1 : undefined}
                                    step={field.type === 'number' ? 0.05 : undefined}
                                    value={stringifyValue(item[field.key])}
                                    onChange={event => updateItem(
                                        index,
                                        field.key,
                                        field.type === 'number' ? Number(event.target.value) : event.target.value,
                                    )}
                                    className="mt-1 w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
                                />
                            </label>
                        ))}
                    </div>
                </div>
            ))}
            <button
                type="button"
                onClick={() => onChange([...items, createObjectArrayItem(kind)])}
                className="w-full rounded-2xl border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-400"
            >
                添加一条
            </button>
        </div>
    );
}

function FieldEditor({
    field,
    value,
    onChange,
}: {
    field: FieldDef;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    return (
        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {field.label}
            {field.kind === 'specificPlaces' || field.kind === 'uncertainties' ? (
                <ObjectArrayEditor kind={field.kind} value={value} onChange={onChange as (value: Array<Record<string, unknown>>) => void} />
            ) : (
                <TextOrArrayEditor field={field} value={value} onChange={onChange} />
            )}
        </label>
    );
}

function SectionEditor({
    definition,
    draft,
    onDraftChange,
}: {
    definition: SectionDef;
    draft: Record<string, unknown>;
    onDraftChange: (next: Record<string, unknown>) => void;
}) {
    return (
        <div className="space-y-3 rounded-2xl bg-white/60 p-3 ring-1 ring-white/80">
            {definition.fields.map(field => (
                <FieldEditor
                    key={field.path.join('.')}
                    field={field}
                    value={getPathValue(draft, field.path)}
                    onChange={value => onDraftChange(setPathValue(draft, field.path, value))}
                />
            ))}
        </div>
    );
}

function LifeProfileSectionCard({
    definition,
    state,
    profile,
    isEditing,
    isSaving,
    draft,
    onStartEdit,
    onCancelEdit,
    onDraftChange,
    onSave,
}: {
    definition: SectionDef;
    state: AgentLifeProfileState;
    profile: AgentLifePatternProfile;
    isEditing: boolean;
    isSaving: boolean;
    draft: Record<string, unknown>;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onDraftChange: (next: Record<string, unknown>) => void;
    onSave: () => void;
}) {
    const payload = isEditing ? draft : buildSectionValue(definition.id, profile);
    const displayPayload = buildSectionValue(definition.id, profile);
    const hasContent = hasSectionContent(definition, displayPayload);
    const meta = state.sectionMeta?.[definition.id];

    return (
        <details open className="rounded-[1.35rem] bg-white/70 p-3 shadow-[0_12px_28px_rgba(148,163,184,0.10)] ring-1 ring-white/80">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-rose-300/90">{definition.eyebrow}</span>
                        <SectionSourceBadge state={state} section={definition.id} hasContent={hasContent} />
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-700">{definition.title}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{definition.description}</div>
                    {meta?.errorMessage && (
                        <div className="mt-2 text-[11px] leading-relaxed text-amber-500">{meta.errorMessage}</div>
                    )}
                </div>
            </summary>

            <div className="mt-3 space-y-3">
                {isEditing ? (
                    <SectionEditor definition={definition} draft={draft} onDraftChange={onDraftChange} />
                ) : (
                    <SectionPreview definition={definition} payload={payload} />
                )}

                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <button
                                type="button"
                                onClick={onSave}
                                disabled={isSaving}
                                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-200"
                            >
                                <Check size={14} weight="bold" />
                                {isSaving ? '保存中...' : '保存'}
                            </button>
                            <button
                                type="button"
                                onClick={onCancelEdit}
                                disabled={isSaving}
                                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-400 ring-1 ring-slate-100 disabled:text-slate-200"
                            >
                                <X size={14} weight="bold" />
                                取消
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={onStartEdit}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-100"
                            aria-label={`编辑${definition.title}`}
                        >
                            <PencilSimple size={14} weight="bold" />
                            编辑
                        </button>
                    )}
                </div>
            </div>
        </details>
    );
}

function hasIncompleteProfileSections(state: AgentLifeProfileState): boolean {
    if (state.status !== 'ready' || !state.profile) return false;
    return DISPLAY_SECTION_DEFS.some((definition) => {
        const payload = buildSectionValue(definition.id, state.profile!);
        return !hasSectionContent(definition, payload) || Boolean(state.sectionMeta?.[definition.id]?.errorMessage);
    });
}

const CharacterLifeProfileCard: React.FC<CharacterLifeProfileCardProps> = memo(({
    character,
    userName,
    addToast,
}) => {
    const [state, setState] = useState<AgentLifeProfileState>({ status: 'missing' });
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [editingSection, setEditingSection] = useState<AgentLifeProfileSection | null>(null);
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const [savingSection, setSavingSection] = useState<AgentLifeProfileSection | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setLoadError('');

        fetchAgentLifeProfile(character.id)
            .then((nextState) => {
                if (!cancelled) setState(nextState);
            })
            .catch((error) => {
                if (!cancelled) {
                    setLoadError(getErrorMessage(error));
                    setState({ status: 'missing' });
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [character.id]);

    const handleGenerate = useCallback(async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        setLoadError('');
        setEditingSection(null);

        try {
            const contextSnapshot = await buildLifeProfileContextSnapshot(character, userName);
            const nextState = await generateAgentLifeProfile(
                character.id,
                contextSnapshot as unknown as Record<string, unknown>,
                pickSecondaryApiConfig(),
            );
            setState(nextState);

            if (nextState.status === 'ready') {
                addToast(hasIncompleteProfileSections(nextState) ? '已先整理出可用部分' : '生活底稿已整理好', 'success');
            } else {
                addToast(nextState.errorMessage || '这次没有稳定整理出生活底稿，可以稍后再试。', 'error');
            }
        } catch (error) {
            const message = getErrorMessage(error);
            setState({
                status: 'failed',
                updatedAt: Date.now(),
                errorMessage: message,
            });
            addToast(message, 'error');
        } finally {
            setIsGenerating(false);
        }
    }, [addToast, character, isGenerating, userName]);

    const handleStartEdit = useCallback((section: AgentLifeProfileSection) => {
        if (!state.profile) return;
        setEditingSection(section);
        setDraft(buildSectionValue(section, state.profile));
    }, [state.profile]);

    const handleSaveSection = useCallback(async (section: AgentLifeProfileSection) => {
        if (!state.profile || savingSection) return;
        setSavingSection(section);
        try {
            const contextSnapshot = await buildLifeProfileContextSnapshot(character, userName);
            const nextState = await updateAgentLifeProfileSection(
                character.id,
                section,
                draft,
                contextSnapshot as unknown as Record<string, unknown>,
            );
            setState(nextState);
            setEditingSection(null);
            setDraft({});
            addToast('这一段生活底稿已保存', 'success');
        } catch (error) {
            addToast(getErrorMessage(error), 'error');
        } finally {
            setSavingSection(null);
        }
    }, [addToast, character, draft, savingSection, state.profile, userName]);

    const updatedAt = formatDate(state.updatedAt);
    const isReady = state.status === 'ready' && state.profile;
    const isFailed = state.status === 'failed';
    const hasIncompleteSections = hasIncompleteProfileSections(state);
    const buttonLabel = isGenerating
        ? '整理中...'
        : isReady
            ? (hasIncompleteSections ? '继续整理生活底稿' : '重新整理生活底稿')
            : '整理生活底稿';

    return (
        <section className="rounded-[1.75rem] border border-white/80 bg-gradient-to-br from-white via-rose-50/50 to-slate-50/70 p-5 shadow-[0_18px_45px_rgba(148,163,184,0.14)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
                        角色生活侧写
                    </label>
                    <h2 className="mt-1 text-sm font-semibold text-slate-800">生活底稿</h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        给未来日程使用的长期侧写：生活重心、情感缝隙和私人纹理。
                    </p>
                </div>
                {updatedAt && <span className="shrink-0 text-[10px] text-slate-400">{updatedAt}</span>}
            </div>

            <div className="mt-4 space-y-3">
                {isLoading && (
                    <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-slate-400 ring-1 ring-white/80">
                        正在读取生活底稿...
                    </div>
                )}

                {isGenerating && (
                    <div className="rounded-2xl bg-rose-50 px-4 py-3 text-xs text-rose-500 ring-1 ring-rose-100">
                        正在分段整理生活惯性、情感入口和私人纹理，可能需要一两分钟。
                    </div>
                )}

                {!isLoading && loadError && (
                    <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-700 ring-1 ring-amber-100">
                        <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
                        <span>暂时读不到云端底稿，仍可以直接重新整理。</span>
                    </div>
                )}

                {!isLoading && !isReady && !isFailed && (
                    <div className="rounded-2xl bg-white/70 px-4 py-4 text-xs leading-relaxed text-slate-500 ring-1 ring-white/80">
                        还没有整理过。点下面的按钮后，会生成一份可分区微调的角色生活底稿。
                    </div>
                )}

                {isFailed && (
                    <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-500 ring-1 ring-red-100">
                        <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
                        <span>{getErrorMessage(new Error(state.errorMessage || ''))}</span>
                    </div>
                )}

                {isReady && (
                    <div className="space-y-3">
                        {DISPLAY_SECTION_DEFS.map(definition => (
                            <LifeProfileSectionCard
                                key={definition.id}
                                definition={definition}
                                state={state}
                                profile={state.profile!}
                                isEditing={editingSection === definition.id}
                                isSaving={savingSection === definition.id}
                                draft={editingSection === definition.id ? draft : {}}
                                onStartEdit={() => handleStartEdit(definition.id)}
                                onCancelEdit={() => {
                                    setEditingSection(null);
                                    setDraft({});
                                }}
                                onDraftChange={setDraft}
                                onSave={() => handleSaveSection(definition.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || Boolean(savingSection)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-slate-200 transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:active:scale-100"
            >
                <ArrowsClockwise size={15} weight="bold" className={isGenerating ? 'animate-spin' : ''} />
                {buttonLabel}
            </button>
        </section>
    );
}, (prev, next) => (
    prev.character.id === next.character.id
    && prev.character.name === next.character.name
    && prev.character.description === next.character.description
    && prev.character.systemPrompt === next.character.systemPrompt
    && prev.character.worldview === next.character.worldview
    && prev.character.cityOverride === next.character.cityOverride
    && prev.character.cityAdcode === next.character.cityAdcode
    && prev.character.isFictionalCity === next.character.isFictionalCity
    && prev.character.cityReferenceReal === next.character.cityReferenceReal
    && prev.character.mountedWorldbooks === next.character.mountedWorldbooks
    && prev.character.refinedMemories === next.character.refinedMemories
    && prev.character.activeMemoryMonths === next.character.activeMemoryMonths
    && prev.userName === next.userName
    && prev.addToast === next.addToast
));

CharacterLifeProfileCard.displayName = 'CharacterLifeProfileCard';

export default CharacterLifeProfileCard;
