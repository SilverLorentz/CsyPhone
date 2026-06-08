import React,{ useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { YesterdayNewspaperContent,YesterdayNewspaperPeriodType,YesterdayNewspaperRecord } from '../../../types';
import { downloadBlob,exportElementToPngBlob } from '../../../utils/domImageExport';
import './YesterdayNewspaper.css';

interface NewspaperCardProps {
    report: YesterdayNewspaperContent;
    charName: string;
    userName: string;
    exportMode?: boolean;
}

interface NewspaperModalProps {
    report: YesterdayNewspaperContent;
    charName: string;
    userName: string;
    onClose: () => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onSaved?: () => void;
    onSaveFailed?: () => void;
}

interface DeliveryNoticeProps {
    record: YesterdayNewspaperRecord | null;
    onOpen: () => void;
    onRetry: () => void;
}

interface DeliveryStackProps {
    records: YesterdayNewspaperRecord[];
    onOpen: (record: YesterdayNewspaperRecord) => void;
    onRetry: (record: YesterdayNewspaperRecord) => void;
}

interface PublicationMeta {
    key: YesterdayNewspaperPeriodType;
    kicker: string;
    name: string;
    subtitle: string;
    readyTitle: string;
    readyBody: string;
}

const PUBLICATION_META: Record<YesterdayNewspaperPeriodType, PublicationMeta> = {
    daily: {
        key: 'daily',
        kicker: 'YESTERDAY LETTER',
        name: '昨日来信',
        subtitle: '昨天的小事',
        readyTitle: '昨日来信已送达',
        readyBody: '昨天的小事已经放进信箱了。',
    },
    weekly: {
        key: 'weekly',
        kicker: 'PRIVATE WEEKLY',
        name: '回望·周章',
        subtitle: '前七天的回顾',
        readyTitle: '回望·周章已送达',
        readyBody: '前七天的回顾已经压好版了。',
    },
    monthly: {
        key: 'monthly',
        kicker: 'PRIVATE MONTHLY',
        name: '回望·月章',
        subtitle: '前三十天的回顾',
        readyTitle: '回望·月章已送达',
        readyBody: '前三十天的纸面小档案已经装订好。',
    },
};

function fallback(value: string | undefined, text: string): string {
    return value?.trim() || text;
}

function formatDateLabel(date: string): string {
    const parts = date.split('-');
    if (parts.length !== 3) return date;
    return `${parts[1]}.${parts[2]}`;
}

function formatIssueLabel(date: string): string {
    const code = date.replace(/\D/g, '');
    return code ? `NO. ${code}` : 'NO. DAILY';
}

function resolvePeriodType(report?: Pick<YesterdayNewspaperContent, 'periodType'> | null, record?: YesterdayNewspaperRecord | null): YesterdayNewspaperPeriodType {
    return report?.periodType || record?.periodType || 'daily';
}

function getPublicationMeta(report?: YesterdayNewspaperContent | null, record?: YesterdayNewspaperRecord | null): PublicationMeta {
    const type = resolvePeriodType(report, record);
    const base = PUBLICATION_META[type];
    return {
        ...base,
        name: report?.publicationName || report?.masthead || base.name,
        subtitle: report?.publicationSubtitle || base.subtitle,
    };
}

function getIssueLabel(report: YesterdayNewspaperContent): string {
    return report.issueLabel || formatIssueLabel(report.date);
}

function getDisplayDateLabel(report: YesterdayNewspaperContent): string {
    return report.periodLabel || formatDateLabel(report.date);
}

function safeFileName(value: string): string {
    return value
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}

function displayUserName(userName: string): string {
    const name = userName.trim();
    if (!name || name.toLowerCase() === 'user' || name === '用户') return '你';
    return name;
}

function resolveNameVariables(value: string, charName: string, userLabel: string): string {
    return value
        .replace(/\{\{\s*charName\s*\}\}/g, charName)
        .replace(/\{\{\s*userName\s*\}\}/g, userLabel)
        .replace(/\bUser\b/g, userLabel)
        .replace(/用户/g, userLabel);
}

export const NewspaperCard: React.FC<NewspaperCardProps> = ({
    report,
    charName,
    userName,
    exportMode = false,
}) => {
    const layout = report.layoutType || 'morning';
    const userLabel = displayUserName(userName);
    const line = (value: string | undefined, text: string) => resolveNameVariables(fallback(value, text), charName, userLabel);
    const leadText = report.lead || report.leadStory;
    const memories = (report.extraNotes?.length ? report.extraNotes : report.memoryHighlights || [])
        .filter(Boolean)
        .map(item => resolveNameVariables(item, charName, userLabel));
    const tags = (report.moodTags || []).filter(Boolean).slice(0, 4);
    const meta = getPublicationMeta(report);
    const isDaily = meta.key === 'daily';
    const sideCards = report.sideCards?.length
        ? report.sideCards.map(card => ({
            title: resolveNameVariables(card.title, charName, userLabel),
            content: resolveNameVariables(card.content, charName, userLabel),
        })).filter(card => card.title && card.content)
        : [
            { title: `${isDaily ? '昨日' : meta.key === 'weekly' ? '近七天' : '近三十天'}心声`, content: report.voiceSnippet || report.cornerNote || '' },
            { title: '门口状态', content: report.statusSnapshot || report.relationshipWeather || '' },
            { title: '随信小广告', content: report.cardEcho || '' },
        ].map(card => ({
            title: resolveNameVariables(card.title, charName, userLabel),
            content: resolveNameVariables(card.content, charName, userLabel),
        })).filter(card => card.content);
    const issueLabel = getIssueLabel(report);
    const dateLabel = getDisplayDateLabel(report);
    const textWeight = [
        report.headline,
        report.subheadline,
        leadText,
        report.heartGraphNote,
        report.cornerNote,
        report.tomorrowHint,
        report.closingLine,
        report.voiceSnippet,
        report.statusSnapshot,
        report.cardEcho,
        ...(report.sideCards || []).flatMap(card => [card.title, card.content]),
        ...(report.extraNotes || []),
        ...(report.memoryHighlights || []),
    ].join('').length;
    const isLongEdition = meta.key !== 'daily' && textWeight > 260;

    return (
        <article
            className={`yn-newspaper-card ${exportMode ? 'yn-newspaper-card--export' : ''} ${isLongEdition ? 'yn-newspaper-card--long' : ''}`}
            data-layout={layout}
            data-period={meta.key}
            data-yesterday-newspaper-card
            aria-label={`${meta.name} ${dateLabel}`}
        >
            <div className="yn-card__inner">
                <header className="yn-card__masthead">
                    <div className="yn-card__daily">
                        <p className="yn-card__kicker">{meta.kicker}</p>
                        <p className="yn-card__name">{meta.name}</p>
                        <p className="yn-card__edition-note">{meta.subtitle}</p>
                    </div>
                    <div className="yn-card__stamp">
                        <span className="yn-card__issue">{issueLabel}</span>
                        <span className="yn-card__stamp-date">{dateLabel}</span>
                        <span className="yn-card__stamp-names">{charName} / {userLabel}</span>
                    </div>
                </header>

                <section className="yn-card__headline">
                    <div className="yn-headline__copy">
                        <h1>{line(report.headline, '昨天被折成一小版')}</h1>
                        <p>{line(report.subheadline, '有些小事没有大声说，但还是被排进了版面。')}</p>
                    </div>
                    <div className="yn-weather">
                        {line(report.relationshipWeather, '关系天气：微风')}
                    </div>
                </section>

                <section className="yn-lead">
                    <h2 className="yn-section-title">{isDaily ? '现场直击' : '头版故事'}</h2>
                    <p>{line(leadText, '昨天的内容很轻，来信只把真实留下的部分收好，剩下的地方留给空白。')}</p>
                </section>

                <aside className="yn-side">
                    {sideCards.map((card, index) => (
                        <div
                            key={`${card.title}-${index}`}
                            className={`yn-note ${index === 0 ? 'yn-note--voice' : index === 1 ? 'yn-note--status' : 'yn-note--card'}`}
                        >
                            <p className="yn-note__label">{card.title}</p>
                            <p className="yn-note__text">{card.content}</p>
                        </div>
                    ))}
                </aside>

                <section className="yn-memory">
                    <h2 className="yn-section-title">{isDaily ? '边角短讯' : '随信新增档案'}</h2>
                    {memories.length > 0 ? (
                        <ul>
                            {memories.map((item, index) => (
                                <li key={`${item}-${index}`}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <ul>
                            <li>这一页暂时留白，等下一次细节落款。</li>
                        </ul>
                    )}
                </section>

                <section className="yn-graph">
                    <h2 className="yn-section-title">心意地图</h2>
                    <p>{line(report.heartGraphNote, '心意地图暂时安静，像一张还没盖上邮戳的空白页。')}</p>
                </section>

                <section className="yn-corner">
                    <p className="yn-corner__note">{line(report.cornerNote, '角落留白，等下一阵风。')}</p>
                    <p className="yn-tomorrow">{line(report.closingLine || report.tomorrowHint, '下一封信还没落款。')}</p>
                </section>

                <footer className="yn-footer">
                    <span>{line(report.footer, `${charName} / ${userLabel} · ${report.date}`)}</span>
                    {tags.length > 0 && (
                        <span className="yn-tags">
                            {tags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}
                        </span>
                    )}
                </footer>
            </div>
        </article>
    );
};

async function waitForCardRender(): Promise<void> {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function exportYesterdayNewspaperImage(
    report: YesterdayNewspaperContent,
    charName: string,
    userName: string,
): Promise<void> {
    const host = document.createElement('div');
    host.style.cssText = [
        'position:fixed',
        'left:-12000px',
        'top:0',
        'width:1080px',
        'background:transparent',
        'pointer-events:none',
        'z-index:-1',
    ].join(';');
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
        root.render(<NewspaperCard report={report} charName={charName} userName={userName} exportMode />);
        await waitForCardRender();
        const card = host.querySelector<HTMLElement>('[data-yesterday-newspaper-card]');
        if (!card) throw new Error('没有找到来信卡片');
        const blob = await exportElementToPngBlob(card, { scale: 1, backgroundColor: null });
        const meta = getPublicationMeta(report);
        const filename = safeFileName(`${meta.name}_${charName}_${report.periodLabel || report.date}.png`);
        downloadBlob(blob, filename);
    } finally {
        root.unmount();
        document.body.removeChild(host);
    }
}

export const YesterdayNewspaperModal: React.FC<NewspaperModalProps> = ({
    report,
    charName,
    userName,
    onClose,
    onRefresh,
    isRefreshing,
    onSaved,
    onSaveFailed,
}) => {
    const [isExporting, setIsExporting] = useState(false);
    const meta = getPublicationMeta(report);
    const issueLabel = getIssueLabel(report);
    const dateLabel = getDisplayDateLabel(report);

    const handleExport = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            await exportYesterdayNewspaperImage(report, charName, userName);
            onSaved?.();
        } catch (error) {
            console.error('[YesterdayNewspaper] Export failed:', error);
            onSaveFailed?.();
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="yn-modal" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="yn-modal__sheet" onClick={event => event.stopPropagation()}>
                <div className="yn-modal__bar">
                    <div>
                        <h3 className="yn-modal__heading">{meta.name}存档</h3>
                        <p className="yn-modal__meta">{issueLabel} · {dateLabel} · {charName}</p>
                    </div>
                    <div className="yn-modal__actions">
                        {onRefresh && (
                            <button
                                type="button"
                                className="yn-modal__button"
                                onClick={onRefresh}
                                disabled={isRefreshing}
                                title="重新生成"
                                aria-label="重新生成昨日来信"
                            >
                                {isRefreshing ? '刷新中' : '刷新'}
                            </button>
                        )}
                        <button
                            type="button"
                            className="yn-modal__button yn-modal__button--primary"
                            onClick={handleExport}
                            disabled={isExporting}
                        >
                            {isExporting ? '印刷中...' : '保存图片'}
                        </button>
                        <button
                            type="button"
                            className="yn-modal__close"
                            onClick={onClose}
                            aria-label={`关闭${meta.name}`}
                        >
                            ×
                        </button>
                    </div>
                </div>
                <div className="yn-modal__body">
                    <div className="yn-card-wrap">
                        <NewspaperCard report={report} charName={charName} userName={userName} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const YesterdayNewspaperDeliveryNotice: React.FC<DeliveryNoticeProps> = ({
    record,
    onOpen,
    onRetry,
}) => {
    if (!record || record.status === 'failed' && !record.error) return null;

    const isReady = record.status === 'ready' && record.content;
    const meta = getPublicationMeta(record.content, record);
    const title = isReady
        ? meta.readyTitle
        : record.status === 'failed'
            ? '来信卡在门缝里了'
            : '投递员正在送来信';
    const body = isReady
        ? meta.readyBody
        : record.status === 'failed'
            ? (record.error || `${meta.name}刚才没送进去，可以重新投递一次。`)
            : `投递员正在把${meta.subtitle}放进信封里，先别急着关门。`;

    const notice = (
        <div
            className={`yn-delivery ${record.status === 'generating' ? 'yn-delivery--generating' : ''}`}
            data-status={record.status}
            role="status"
        >
            <div className="yn-delivery__mark" aria-hidden="true">
                <span className="yn-delivery__dot" />
            </div>
            <div className="yn-delivery__text">
                <p className="yn-delivery__title">{title}</p>
                <p className="yn-delivery__body">{body}</p>
            </div>
            {isReady ? (
                <button type="button" className="yn-delivery__action" onClick={onOpen}>
                    打开
                </button>
            ) : record.status === 'failed' ? (
                <button type="button" className="yn-delivery__action" onClick={onRetry}>
                    重试
                </button>
            ) : null}
        </div>
    );

    if (record.status === 'generating') {
        return (
            <div className="yn-delivery-modal" aria-live="polite">
                {notice}
            </div>
        );
    }

    return notice;
};

export const YesterdayNewspaperDeliveryStack: React.FC<DeliveryStackProps> = ({
    records,
    onOpen,
    onRetry,
}) => {
    const visibleRecords = records.filter(record => record && !(record.status === 'failed' && !record.error));
    if (visibleRecords.length === 0) return null;

    const generatingRecords = visibleRecords.filter(record => record.status === 'generating');
    const settledRecords = visibleRecords.filter(record => record.status !== 'generating');

    const generatingModal = generatingRecords.length > 0 ? (() => {
        const names = generatingRecords.map(record => getPublicationMeta(record.content, record).name);
        const uniqueNames = Array.from(new Set(names));
        return (
            <div className="yn-delivery-modal" aria-live="polite">
                <div className="yn-delivery yn-delivery--generating" data-status="generating" role="status">
                    <div className="yn-delivery__mark" aria-hidden="true">
                        <span className="yn-delivery__dot" />
                    </div>
                    <div className="yn-delivery__text">
                        <p className="yn-delivery__title">投递员正在送来信</p>
                        <p className="yn-delivery__body">
                            {uniqueNames.join('、')}正在排版，先别急着关门。
                        </p>
                    </div>
                </div>
            </div>
        );
    })() : null;

    return (
        <>
            {generatingModal}
            {settledRecords.length > 0 && (
                <div className="yn-delivery-stack">
                    {settledRecords.map(record => (
                        <YesterdayNewspaperDeliveryNotice
                            key={record.id}
                            record={record}
                            onOpen={() => onOpen(record)}
                            onRetry={() => onRetry(record)}
                        />
                    ))}
                </div>
            )}
        </>
    );
};
