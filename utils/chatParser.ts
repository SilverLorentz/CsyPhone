
import { DB } from './db';
import { LocalNotifications } from '@capacitor/local-notifications';
import { stripCoTResidual } from './thinkingExtractor';
import { enrichHotNewsItemIdentity } from './services/realtimeService';
import type { SongShareCard } from '../types/music';

// ═══════════════════════════════════════════════════════════════════════
//  Bilingual Marker — single source of truth for the %%BILINGUAL%% system
// ═══════════════════════════════════════════════════════════════════════

/** Canonical marker written into new messages (no spaces) */
export const BILINGUAL_MARKER = '%%BILINGUAL%%';

/**
 * Regex that matches BOTH old format `%% BILINGUAL %%` (with spaces)
 * and new format `%%BILINGUAL%%` (no spaces) for backward compatibility.
 * Use with `gi` flags for global/case-insensitive matching.
 */
export const BILINGUAL_RE = /%%\s*BILINGUAL\s*%%/gi;

export type ChatResponsePart =
    | { type: 'text'; content: string }
    | { type: 'emoji'; content: string }
    | { type: 'song'; content: SongShareCard };

function stripOuterTagJunk(value: string): string {
    return value
        .replace(/`+/g, '')
        .replace(/^[\s\[\]【】]+/, '')
        .replace(/[\s\[\]【】]+$/, '')
        .trim();
}

function isToolWrapperJunk(value: string): boolean {
    return /^[\s`[\]【】]+$/.test(value);
}

function stripOuterCodeFence(value: string): string {
    const trimmed = value.trim();
    const fenceMatch = trimmed.match(/^```(?:json|JSON|text|markdown|md)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/);
    return fenceMatch ? fenceMatch[1].trim() : value;
}

function getJsonTextCandidate(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    for (const key of ['content', 'text', 'reply', 'response', 'answer']) {
        if (typeof record[key] === 'string') return record[key] as string;
    }

    const message = record.message;
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object' && !Array.isArray(message)) {
        const messageRecord = message as Record<string, unknown>;
        if (typeof messageRecord.content === 'string') return messageRecord.content;
    }

    return null;
}

function normalizeChatTextEnvelope(text: string): string {
    let result = stripOuterCodeFence(text);

    for (let i = 0; i < 2; i++) {
        const trimmed = stripOuterCodeFence(result).trim();
        const looksJsonWrapped =
            (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith('{') && trimmed.endsWith('}'));
        if (!looksJsonWrapped) break;

        try {
            const candidate = getJsonTextCandidate(JSON.parse(trimmed));
            if (candidate === null) break;
            result = stripOuterCodeFence(candidate);
        } catch {
            break;
        }
    }

    return result
        .replace(/\\r\\n|\\n|\\r/g, '\n')
        .replace(/\\t/g, '\t');
}

function stripLeakedChatLinePrefixes(text: string): string {
    return text
        .replace(/^[ \t]*[\[【(（][ \t]*(?:\d{4}[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?[ \t]*)?(?:[上下]午[ \t]*)?\d{1,2}[：:]\d{2}(?:[ \t]*(?:AM|PM))?[ \t]*[\]】)）][ \t]*(?:[\w\u4e00-\u9fa5·•._ -]{1,40}[：:][ \t]*)?/gim, '')
        .replace(/^[ \t]*(?:\d{4}[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?[ T\t]+(?:[上下]午[ \t]*)?\d{1,2}[：:]\d{2}(?:[ \t]*(?:AM|PM))?[ \t]+(?:[\w\u4e00-\u9fa5·•._ -]{1,40}[：:][ \t]*)?|(?:[上下]午[ \t]*)?\d{1,2}[：:]\d{2}(?:[ \t]*(?:AM|PM))?[ \t]+[\w\u4e00-\u9fa5·•._ -]{1,40}[：:][ \t]*)/gim, '');
}

function stripLeakedVoiceHistoryLabels(text: string): string {
    return text
        .replace(/[【\[]\s*(?:你上一条语音|你上一條語音|上一条语音|上一條語音|你刚才的语音|你剛才的語音|你发出的语音|你發出的語音)(?:消息)?(?:[（(]\s*\d+\s*秒\s*[）)])?\s*[】\]]\s*/g, '');
}

const LEAKED_REPLY_CONTEXT_LABEL_RE = /(?:引用回复上下文[：:]\s*)?这条消息正在回复[^「」\r\n]{0,60}的消息「[^」\r\n]{1,220}」[。.]?\s*本条消息正文[：:]\s*/g;

function stripLeakedReplyContextLabels(text: string): string {
    return text.replace(LEAKED_REPLY_CONTEXT_LABEL_RE, '');
}

const PHOTO_DIRECTOR_LEAK_LINE_RE = /^\s*(?:[-*+]\s*)?(?:配文|连续性|画面|镜头|氛围|视觉标签|生成意图|正向提示词|负向提示词|positive\s+prompt|negative\s+prompt|final\s+prompt|prompt|scene|camera|mood)\s*[：:]/i;
const STRONG_PHOTO_DIRECTOR_LEAK_LINE_RE = /^\s*(?:[-*+]\s*)?(?:视觉标签|生成意图|正向提示词|负向提示词|positive\s+prompt|negative\s+prompt|final\s+prompt|prompt)\s*[：:]/i;

function stripLeakedPhotoDirectorSummary(text: string): string {
    const lines = text.split(/\r?\n/);
    const labeledLines = lines.filter(line => PHOTO_DIRECTOR_LEAK_LINE_RE.test(line));
    const hasStrongLeakLabel = lines.some(line => STRONG_PHOTO_DIRECTOR_LEAK_LINE_RE.test(line));
    if (labeledLines.length < 2 && !hasStrongLeakLabel) return text;

    return lines
        .filter(line => !PHOTO_DIRECTOR_LEAK_LINE_RE.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSongShareTags(text: string): string {
    let result = text.replace(
        /(?:\[\[|\[|【)\s*(?:分享(?:歌曲|音乐)|(?:share[-_]?)?song)\s*[:：]\s*([\s\S]*?)\s*(?:\]\]|]|】)/gi,
        (_fullMatch, content: string) => `[[SHARE_SONG: ${stripOuterTagJunk(content)}]]`,
    );

    result = result.replace(
        /(?:\[\[|\[|【)\s*SHARE_SONG\s*[:：]\s*([\s\S]*?)\s*(?:\]\]|]|】)/gi,
        (_fullMatch, content: string) => `[[SHARE_SONG: ${stripOuterTagJunk(content)}]]`,
    );

    if (/\[\[(?:SEND_EMOJI|SHARE_SONG):/i.test(result)) {
        result = result
            .split(/(?:\r\n|\r|\n)/)
            .filter((line) => !isToolWrapperJunk(line))
            .join('\n')
            .trim();
    }

    return result;
}

const SPEAKER_PREFIX_RE = String.raw`(?:(?:\{\{char\}\}|[\w\u4e00-\u9fa5·•._ -]{1,40})\s*)?`;
const TO_USER_RE = String.raw`(?:(?:向|给|給)\s*你\s*)?`;
const MONEY_RE = String.raw`[¥￥]?\s*(\d+(?:\.\d{1,2})?)`;

function normalizeDegradedActionTags(text: string): string {
    return text
        .replace(
            new RegExp(String.raw`[【\[]\s*${SPEAKER_PREFIX_RE}${TO_USER_RE}(?:发送|發送|发|發|送)?(?:了)?(?:一个|一個)?\s*(?:表情包?|貼圖|贴图)\s*[：:]\s*([^】\]]+?)\s*[】\]]`, 'g'),
            (_match, name: string) => `[[SEND_EMOJI: ${stripOuterTagJunk(name)}]]`,
        )
        .replace(
            new RegExp(String.raw`[【\[]\s*${SPEAKER_PREFIX_RE}${TO_USER_RE}(?:发送|發送|发|發|送)?(?:了)?\s*(?:转账|轉帳|转帐|轉账)\s*[：:]\s*${MONEY_RE}\s*[】\]]`, 'g'),
            (_match, amount: string) => `[[ACTION:TRANSFER:${amount}]]`,
        )
        .replace(
            new RegExp(String.raw`[【\[]\s*${SPEAKER_PREFIX_RE}(?:收取|接收|接受|收下|领取|領取)(?:了)?(?:你|用户|用戶)?(?:的)?\s*(?:转账|轉帳|转帐|轉账)\s*[】\]]`, 'g'),
            '[[ACTION:RECEIVE_TRANSFER]]',
        )
        .replace(
            new RegExp(String.raw`[【\[]\s*${SPEAKER_PREFIX_RE}(?:退还|退還|返还|返還|拒收|拒绝|拒絕)(?:了)?(?:你|用户|用戶)?(?:的)?\s*(?:转账|轉帳|转帐|轉账)\s*[】\]]`, 'g'),
            '[[ACTION:RETURN_TRANSFER]]',
        );
}

function normalizeDegradedNewsCardTags(text: string): string {
    const toNewsCardTag = (_match: string, sourceOrTitle: string, maybeTitle?: string) => {
        const hasSource = typeof maybeTitle === 'string';
        const source = hasSource ? stripOuterTagJunk(sourceOrTitle).replace(/\s+/g, '') : '';
        const title = stripOuterTagJunk(hasSource ? maybeTitle : sourceOrTitle)
            .replace(/\s+/g, ' ')
            .replace(/^(?:热点|标题)\s*[：:]\s*/i, '')
            .trim();
        if (!title) return _match;
        return `[[NEWS_CARD: ${source ? `${source}|` : ''}${title}]]`;
    };

    return text
        .replace(
            /[【\[]\s*(?:你|我|用户|用戶|User)?\s*分享了?\s*(?:一个|一個|一条|一條)?\s*热点\s*[：:]\s*(?:[「《“"]\s*)?([\s\S]{1,220}?)(?:\s*[」》”"])\s*(?:[（(]\s*来源\s*[：:]\s*([^）)\]】\r\n]{1,40})\s*[）)])?\s*[】\]]/g,
            (_match, title: string, source: string | undefined) => toNewsCardTag(_match, source || '', title),
        )
        .replace(
            /[【\[]\s*(?:你|我|用户|用戶|User)?\s*分享了?\s*(?:一个|一個|一条|一條)?\s*热点\s*[：:]\s*([^\n\r（(】\]]{1,180}?)(?:[（(]\s*来源\s*[：:]\s*([^）)\]】\r\n]{1,40})\s*[）)])?\s*[】\]]/g,
            (_match, title: string, source: string | undefined) => toNewsCardTag(_match, source || '', title),
        )
        .replace(
            /[【\[]\s*热点分享\s*[：:]\s*([^|｜\n\r】\]]{1,40})\s*[|｜]\s*([^】\]]{1,220}?)\s*[】\]]/g,
            toNewsCardTag,
        );
}

function parseSongShareContent(content: string): SongShareCard | null {
    const cleaned = stripOuterTagJunk(content)
        .replace(/^(?:SHARE_SONG|分享(?:歌曲|音乐)|(?:share[-_]?)?song)\s*[:：]\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    const rawParts = cleaned.includes('|') || cleaned.includes('｜')
        ? cleaned.split(/[|｜]/)
        : cleaned.split(/\s+(?:-|—|－)\s+/);
    const parts = rawParts.map((part) => stripOuterTagJunk(part));

    const songName = parts[0]?.replace(/^(?:歌名|歌曲名|歌曲|song(?:\s*name)?)\s*[:：]\s*/i, '').trim() || '';
    const artist = parts[1]?.replace(/^(?:歌手|歌手名|artist)\s*[:：]\s*/i, '').trim() || '';
    if (!songName || !artist) return null;

    const songIdText = parts[2]?.replace(/^(?:(?:歌曲)?ID|song\s*id)\s*[:：]\s*/i, '') || '0';
    const rawSongId = Number(songIdText.match(/\d+/)?.[0] || '0');
    const songId = Number.isFinite(rawSongId) ? Math.max(0, Math.trunc(rawSongId)) : 0;

    return {
        songId,
        songName,
        artist,
    };
}

/**
 * Parse a content string that may contain a %%BILINGUAL%% marker.
 * Returns { hasBilingual, langA, langB }
 *   - langA = original text (before marker)
 *   - langB = translated text (after marker), empty string if no marker
 *
 * @param raw  The raw message content
 * @param clean  Optional cleanup function to apply to each half (e.g. stripJunk)
 */
export function parseBilingual(
    raw: string,
    clean?: (s: string) => string,
): { hasBilingual: boolean; langA: string; langB: string } {
    const match = raw.match(/%%\s*BILINGUAL\s*%%/i);
    if (!match) {
        const a = clean ? clean(raw) : raw;
        return { hasBilingual: false, langA: a, langB: '' };
    }
    const idx = match.index!;
    const markerLen = match[0].length;
    const a = clean ? clean(raw.substring(0, idx)) : raw.substring(0, idx).trim();
    const b = clean ? clean(raw.substring(idx + markerLen)) : raw.substring(idx + markerLen).trim();
    return { hasBilingual: true, langA: a, langB: b };
}

// ═══════════════════════════════════════════════════════════════════════
//  Translation XML Utilities — 见面/剧场翻译标签工具
//  Philosophy: 先救再杀 — rescue content first, strip tags second.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Strip `<翻译><原文>...<译文>...</翻译>` XML tags, keeping ONLY 原文 content.
 * Tolerant of:
 *   - Extra whitespace / newlines between tags
 *   - Missing closing tags (unclosed `<翻译>` blocks)
 *   - Stray orphan tags after extraction
 * Safe to call on content that has no translation tags (returns unchanged).
 */
export function stripTranslationTags(content: string): string {
    if (!content) return content;
    // Fast path: no tags at all
    if (!content.includes('<翻译>') && !content.includes('<原文>') && !content.includes('<译文>')) {
        return content;
    }

    let result = content;

    // 1. Well-formed blocks: extract 原文 only
    result = result.replace(
        /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g,
        '$1'
    );

    // 2. Partially formed: <原文>content</原文> without outer <翻译> wrapper
    result = result.replace(/<原文>([\s\S]*?)<\/原文>\s*(?:<译文>[\s\S]*?<\/译文>)?/g, '$1');

    // 3. Unclosed <翻译> with 原文 inside (AI got cut off)
    result = result.replace(/<翻译>\s*<原文>([\s\S]*?)(?:<\/原文>)?[\s\S]*$/g, '$1');

    // 4. Kill any orphaned tags that survived
    result = result.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '');

    return result.trim();
}

/**
 * Extract structured { original, translated } pairs from `<翻译>` XML blocks.
 * Tolerant of:
 *   - Multiple blocks in one string
 *   - Blocks with only 原文 (no 译文) — translated defaults to ''
 *   - Blocks with only 译文 (no 原文) — original defaults to the 译文 (rescue)
 *   - Non-translation text between blocks — returned as { original: text, translated: '' }
 *   - Completely malformed input — returns single { original: rawInput, translated: '' }
 */
export function extractTranslationPairs(
    content: string
): { original: string; translated: string }[] {
    if (!content) return [];

    // Fast path: no translation tags
    if (!content.includes('<翻译>') && !content.includes('<原文>')) {
        return [{ original: content, translated: '' }];
    }

    const pairs: { original: string; translated: string }[] = [];

    // Well-formed pattern (tolerant whitespace)
    const re = /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*(?:<译文>([\s\S]*?)<\/译文>)?\s*<\/翻译>/g;
    let lastIndex = 0;
    let m;

    while ((m = re.exec(content)) !== null) {
        // Rescue any plain text before this block
        const textBefore = content.slice(lastIndex, m.index).trim();
        if (textBefore) {
            // Strip orphan tags from inter-block text
            const cleaned = textBefore.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim();
            if (cleaned) pairs.push({ original: cleaned, translated: '' });
        }

        const original = m[1]?.trim() || '';
        const translated = m[2]?.trim() || '';

        if (original) {
            pairs.push({ original, translated });
        } else if (translated) {
            // Rescue: no 原文 but has 译文 — use 译文 as display content
            pairs.push({ original: translated, translated: '' });
        }

        lastIndex = m.index + m[0].length;
    }

    // Rescue any trailing text after the last block
    const trailing = content.slice(lastIndex).trim();
    if (trailing) {
        const cleaned = trailing.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim();
        if (cleaned) pairs.push({ original: cleaned, translated: '' });
    }

    // Fallback: if regex matched nothing, return entire content as single pair
    if (pairs.length === 0) {
        const fallback = content.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim();
        return [{ original: fallback || content, translated: '' }];
    }

    return pairs;
}

export const ChatParser = {
    // Return cleaned content and perform side effects
    parseAndExecuteActions: async (
        aiContent: string,
        charId: string,
        charName: string,
        addToast: (msg: string, type: 'info' | 'success' | 'error') => void
    ) => {
        let content = ChatParser.cleanAiSecondPass(aiContent);

        // POKE
        const pokeMatch = content.match(/(?:\[{1,2}|【|\()(?:ACTION\s*[:：]\s*)?POKE(?:\]{1,2}|】|\))/i);
        if (pokeMatch) {
            await DB.saveMessage({ charId, role: 'assistant', type: 'interaction', content: '[戳一戳]' });
            content = content.replace(pokeMatch[0], '').trim();
        }

        // TRANSFER (AI initiates a transfer to the user)
        const transferMatch = content.match(/(?:\[{1,2}|【|\()ACTION\s*[:：]\s*TRANSFER\s*[:：]\s*(\d+(?:\.\d{1,2})?)(?:\]{1,2}|】|\))/i);
        if (transferMatch) {
            await DB.saveMessage({ charId, role: 'assistant', type: 'transfer', content: '[转账]', metadata: { amount: transferMatch[1], status: 'pending' } });
            content = content.replace(transferMatch[0], '').trim();
        }

        // RECEIVE_TRANSFER (AI accepts a pending user transfer)
        const receiveTransferMatch = content.match(/(?:\[{1,2}|【|\()ACTION\s*[:：]\s*RECEIVE_TRANSFER(?:\]{1,2}|】|\))/i);
        if (receiveTransferMatch) {
            try {
                const recentMsgs = await DB.getRecentMessagesByCharId(charId, 50);
                const pendingUserTransfer = recentMsgs.slice().reverse().find(
                    m => m.role === 'user' && m.type === 'transfer' && m.metadata?.status === 'pending'
                );
                if (pendingUserTransfer) {
                    await DB.updateMessageMetadata(pendingUserTransfer.id, { status: 'accepted' });
                    addToast(`${charName} 已收取 ¥${pendingUserTransfer.metadata?.amount}`, 'success');
                }
            } catch (e) { console.error('RECEIVE_TRANSFER failed:', e); }
            content = content.replace(receiveTransferMatch[0], '').trim();
        }

        // RETURN_TRANSFER (AI returns/rejects a pending user transfer)
        const returnTransferMatch = content.match(/(?:\[{1,2}|【|\()ACTION\s*[:：]\s*RETURN_TRANSFER(?:\]{1,2}|】|\))/i);
        if (returnTransferMatch) {
            try {
                const recentMsgs = await DB.getRecentMessagesByCharId(charId, 50);
                const pendingUserTransfer = recentMsgs.slice().reverse().find(
                    m => m.role === 'user' && m.type === 'transfer' && m.metadata?.status === 'pending'
                );
                if (pendingUserTransfer) {
                    await DB.updateMessageMetadata(pendingUserTransfer.id, { status: 'returned' });
                    addToast(`${charName} 退还了 ¥${pendingUserTransfer.metadata?.amount}`, 'info');
                }
            } catch (e) { console.error('RETURN_TRANSFER failed:', e); }
            content = content.replace(returnTransferMatch[0], '').trim();
        }

        // NEWS_CARD_ID — char 主动把某条热点当作新闻卡片分享
        //   [[NEWS_CARD_ID: cardId]] 优先使用稳定 ID；旧格式 NEWS_CARD 继续兼容
        const newsCardIdMatch = content.match(/\[\[NEWS_CARD_ID\s*[:：]\s*([^\]]*?)\s*\]\]/i);
        if (newsCardIdMatch) {
            const rawCardId = (newsCardIdMatch[1] || '').trim();
            if (rawCardId) {
                try {
                    const snapshot = await DB.getLatestHotNewsSnapshot();
                    const items = (snapshot?.items || []).map((item: any, index: number) =>
                        enrichHotNewsItemIdentity(item, snapshot?.id || 'latest', index + 1, snapshot?.fetchedAt)
                    );
                    const hit = items.find(item => item.cardId === rawCardId || item.id === rawCardId);
                    if (hit?.title) {
                        const source = hit.source || '';
                        const desc = hit.desc && hit.desc !== hit.title ? hit.desc : undefined;
                        await DB.saveMessage({
                            charId,
                            role: 'assistant',
                            type: 'news_card',
                            content: `[你分享了一个热点：「${hit.title}」${source ? `（来源：${source}）` : ''}${desc ? `——${desc}` : ''}]`,
                            metadata: {
                                source,
                                title: hit.title,
                                url: hit.url,
                                desc,
                                platform: hit.platform,
                                rank: hit.rank,
                                cardId: hit.cardId || hit.id || rawCardId,
                            },
                        });
                        addToast(`${charName} 分享了一条热点`, 'info');
                    }
                } catch { /* 没有快照时无法解析稳定 ID，直接移除标签 */ }
            }
            content = content.replace(/\[\[NEWS_CARD_ID\s*[:：][^\]]*\]\]/gi, '').trim();
        }

        // NEWS_CARD — 兼容旧格式
        //   [[NEWS_CARD: 来源|标题]]，来源可省略为 [[NEWS_CARD: 标题]]
        const newsCardMatch = content.match(/\[\[NEWS_CARD\s*[:：]\s*([^\]]*?)\s*\]\]/i);
        if (newsCardMatch) {
            const raw = (newsCardMatch[1] || '').trim();
            if (raw) {
                const segments = raw.split(/[|｜]/).map(part => part.trim()).filter(Boolean);
                let source = '';
                let title = raw;
                if (segments.length >= 2) {
                    source = segments[0];
                    title = segments.slice(1).join('|').trim();
                }

                let url: string | undefined;
                let desc: string | undefined;
                let platform: string | undefined;
                let rank: number | undefined;
                let cardId: string | undefined;
                try {
                    const snapshot = await DB.getLatestHotNewsSnapshot();
                    const items = (snapshot?.items || []).map((item: any, index: number) =>
                        enrichHotNewsItemIdentity(item, snapshot?.id || 'latest', index + 1, snapshot?.fetchedAt)
                    );
                    const hit = items.find(item => item.title === title)
                        || items.find(item => !!title && (item.title.includes(title) || title.includes(item.title)));
                    if (hit) {
                        url = hit.url;
                        desc = hit.desc;
                        platform = hit.platform;
                        rank = hit.rank;
                        cardId = hit.cardId || hit.id;
                        if (!source && hit.source) source = hit.source;
                    }
                } catch { /* 没有快照时仍然可以生成无链接卡片 */ }

                if (title) {
                    await DB.saveMessage({
                        charId,
                        role: 'assistant',
                        type: 'news_card',
                        content: `[你分享了一个热点：「${title}」${source ? `（来源：${source}）` : ''}${desc ? `——${desc}` : ''}]`,
                        metadata: { source, title, url, desc, platform, rank, cardId },
                    });
                    addToast(`${charName} 分享了一条热点`, 'info');
                }
            }
            content = content.replace(/\[\[NEWS_CARD\s*[:：][^\]]*\]\]/gi, '').trim();
        }

        // ADD_EVENT
        const eventMatch = content.match(/(?:\[{1,2}|【|\()ACTION\s*[:：]\s*ADD_EVENT\s*[|｜]\s*(.*?)\s*[|｜]\s*(.*?)(?:\]{1,2}|】|\))/i);
        if (eventMatch) {
            const title = eventMatch[1].trim();
            const date = eventMatch[2].trim();
            if (title && date) {
                const anni: any = { id: `anni-${Date.now()}`, title: title, date: date, charId };
                await DB.saveAnniversary(anni);
                addToast(`${charName} 添加了新日程: ${title}`, 'success');
                await DB.saveMessage({ charId, role: 'system', type: 'text', content: `[系统: ${charName} 新增了日程 "${title}" (${date})]`, metadata: { source: 'schedule', scheduleEvent: 'add_event' } });
            }
            content = content.replace(eventMatch[0], '').trim();
        }

        // SCHEDULE
        const scheduleRegex = /\[schedule_message \| (.*?) \| fixed \| (.*?)\]/g;
        let match;
        while ((match = scheduleRegex.exec(content)) !== null) {
            const timeStr = match[1].trim();
            const msgContent = match[2].trim();
            const dueTime = new Date(timeStr).getTime();
            if (!isNaN(dueTime) && dueTime > Date.now()) {
                await DB.saveScheduledMessage({ id: `sched-${Date.now()}-${Math.random()}`, charId, content: msgContent, dueAt: dueTime, createdAt: Date.now() });
                try {
                    const hasPerm = await LocalNotifications.checkPermissions();
                    if (hasPerm.display === 'granted') {
                        await LocalNotifications.schedule({ notifications: [{ title: charName, body: msgContent, id: Math.floor(Math.random() * 100000), schedule: { at: new Date(dueTime) }, smallIcon: 'ic_stat_icon_config_sample' }] });
                    }
                } catch (e) { console.log("Notification schedule skipped (web mode)"); }
                addToast(`${charName} 似乎打算一会儿找你...`, 'info');
            }
        }
        content = content.replace(scheduleRegex, '').trim();

        // RECALL tag removal (handling done in main loop logic, but cleaning here just in case)
        content = content.replace(/\[\[RECALL:.*?\]\]/g, '').trim();

        return content;
    },

    /**
     * Post-API-call cleanup for AI output.
     * Strips leaked timestamps, name prefixes, and normalises sticker tags.
     * Called after every API completion (initial + re-calls from search/diary/xhs).
     */
    cleanAiSecondPass: (text: string): string => {
        let result = stripLeakedPhotoDirectorSummary(stripLeakedChatLinePrefixes(normalizeChatTextEnvelope(text)))
            // ══════════════════════════════════════════════════════════════
            // Layer 1: TIMESTAMP STRIPPING
            // ══════════════════════════════════════════════════════════════
            .replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '')       // [2026-05-09 10:44] full year
            .replace(/\[\d{1,2}[-/月]\d{1,2}日?\s+\d{1,2}[：:]\d{2}\]/g, '') // [05/09 10:44] [5月9日 10:44]
            .replace(/\[\d{1,2}[：:]\d{2}(?:\s*(?:AM|PM))?\]\s*/gi, '')    // [10:44] [10:44 AM]
            .replace(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}[：:]\d{2}\s*/gm, '') // 2026-05-09 10:44
            .replace(/^\d{1,2}[-/]\d{1,2}\s+\d{1,2}[：:]\d{2}\s*/gm, '')  // 05/09 10:44

            // ══════════════════════════════════════════════════════════════
            // Layer 2: NAME PREFIX STRIPPING
            // ══════════════════════════════════════════════════════════════
            .replace(/^[\w\u4e00-\u9fa5·•._ -]{1,40}\s*[:：]\s*/, '')

            // ══════════════════════════════════════════════════════════════
            // Layer 3: EMOJI TAG RESCUE — normalize variants → [[SEND_EMOJI: name]]
            // Order: most specific first, then progressively broader
            // ══════════════════════════════════════════════════════════════
            // 3a. AI mimics history log: [你 发送了表情包: xxx] [夏以昼发送了表情包: xxx] [{{char}}向你發送表情包：xxx]
            .replace(/[【\[](?:(?:你|我|User|用户|System|系统)\s*)?发送了?(?:一个)?表情包?[：:]\s*(.+?)[】\]]/g, '[[SEND_EMOJI: $1]]')
            // 3b. Shortened: [表情包: xxx] 【表情包：xxx】 [表情: xxx] 【表情：xxx】
            .replace(/[【\[]表情包?\s*[：:]\s*(.+?)[】\]]/g, '[[SEND_EMOJI: $1]]')
            // 3c. English variants: [emoji: xxx] [sticker: xxx]
            .replace(/[【\[](?:emoji|sticker)\s*[：:]\s*(.+?)[】\]]/gi, '[[SEND_EMOJI: $1]]')
            // 3d. Bracket normalization: [SEND_EMOJI: xxx] 【SEND_EMOJI：xxx】→ [[SEND_EMOJI: xxx]]
            .replace(/(?:\[{1,2}|【)\s*SEND_EMOJI\s*[：:]\s*([\s\S]*?)\s*(?:\]{1,2}|】)/gi, '[[SEND_EMOJI: $1]]')

            // 3e. ACTION normalization: [发送转账: 50] -> [[ACTION:TRANSFER:50]], [戳一戳] -> [[ACTION:POKE]]
            .replace(/[【\[](?:发送)?转账\s*[：:]\s*(\d+)[】\]]/g, '[[ACTION:TRANSFER:$1]]')
            .replace(/[【\[](?:发送)?戳一戳[】\]]/g, '[[ACTION:POKE]]')
            .replace(/[【\[](?:收取|接收)转账[】\]]/g, '[[ACTION:RECEIVE_TRANSFER]]')
            .replace(/[【\[]退还转账[】\]]/g, '[[ACTION:RETURN_TRANSFER]]')

            // ══════════════════════════════════════════════════════════════
            // Layer 4: VOICE TAG RESCUE — normalize variants → 【语音消息：content】
            // so downstream VOICE_WRAP_RE can detect them
            // ══════════════════════════════════════════════════════════════
            // 4a. [语音: content] [语音：content] — missing "消息"
            .replace(/[【\[]\s*语音\s*[：:]\s*([\s\S]+?)\s*[】\]]/g, '【语音消息：$1】')
            // 4b. (语音消息：content) （语音消息：content）— parenthetical
            .replace(/[（(]\s*语音(?:消息)?\s*[：:]\s*([\s\S]+?)\s*[）)]/g, '【语音消息：$1】')
            // 4c. [voice: content] — English
            .replace(/[【\[]\s*voice\s*[：:]\s*([\s\S]+?)\s*[】\]]/gi, '【语音消息：$1】')
            // 4d. Normalize [语音消息：content] half-width brackets → full-width 【】
            //     (VOICE_WRAP_RE already catches both, but this ensures consistency)

            // ══════════════════════════════════════════════════════════════
            // Layer 5: KILL SYSTEM LOG MIMICRY — AI copies internal formats
            // ══════════════════════════════════════════════════════════════
            // 5a. [🎤用户语音] [🎤语音] — history voice marker
            .replace(/[【\[]\s*🎤\s*(?:用户)?语音\s*[】\]]\s*/g, '')
            // 5a.1 [你上一条语音] — assistant voice history marker
            .replace(/[【\[]\s*(?:你上一条语音|你上一條語音|上一条语音|上一條語音|你刚才的语音|你剛才的語音|你发出的语音|你發出的語音)(?:消息)?(?:[（(]\s*\d+\s*秒\s*[）)])?\s*[】\]]\s*/g, '')
            // 5b. [用户发送了一条语音消息（N秒）] — history voice description
            .replace(/[【\[](?:用户|你|我)?(?:发送了?)?一?条?语音(?:消息)?[（(]?\d*\s*秒?[）)]?[】\]]/g, '')
            // 5c. [语音通话] [图片] [视频] [文件] [位置] — bare media type tags
            .replace(/[【\[](?:语音通话|图片|视频|文件|位置|联系人|名片|红包)[】\]]/g, '')
            // 5d. [系统: xxx] [系统提示: xxx] [System: xxx] — leaked system tags
            .replace(/[【\[]\s*(?:系统|System)\s*(?:提示|消息|通知)?\s*[：:]\s*[^\]】]*[】\]]\s*/gi, '')
            // 5e. [时间感知] [情境补充] [系统功能] — leaked internal prompt section tags
            .replace(/[【\[]\s*(?:时间感知|情境补充|系统功能|思考链格式锁定|Reminder)\s*[：:]?\s*[^\]】]*[】\]]\s*/gi, '')
            // 5f. [用户 发送了xxx] [你 发送了xxx] — any remaining log-style action description
            .replace(/[【\[](?:用户|你|我|User)\s*发送了[\s\S]*?[】\]]/g, '');

        result = normalizeDegradedActionTags(result);
        result = normalizeDegradedNewsCardTags(result);
        result = normalizeSongShareTags(result);
        // Strip any CoT protocol residual that leaked through (e.g. from Gemini native thinking)
        result = stripCoTResidual(result);
        return stripLeakedPhotoDirectorSummary(stripLeakedVoiceHistoryLabels(stripLeakedChatLinePrefixes(result)));
    },

    /**
     * Comprehensive sanitizer for AI output before saving to DB.
     * Removes AI-specific artifacts that should never appear in chat bubbles.
     * Safe to call multiple times (idempotent). Preserves %%BILINGUAL%% markers.
     * Preserves [[SEND_EMOJI:]] and [[SHARE_SONG:]] for downstream splitResponse.
     */
    sanitize: (text: string): string => {
        const normalized = stripLeakedReplyContextLabels(stripLeakedPhotoDirectorSummary(stripLeakedVoiceHistoryLabels(stripLeakedChatLinePrefixes(normalizeChatTextEnvelope(text)))));
        return stripLeakedReplyContextLabels(stripLeakedPhotoDirectorSummary(normalized
            // ── Strip leaked timestamps ──
            .replace(/\[\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}[：:]\d{2}\]\s*/g, '')
            .replace(/\[\d{1,2}[-/]\d{1,2}\s+\d{1,2}[：:]\d{2}\]\s*/g, '')
            .replace(/\[\d{1,2}月\d{1,2}日?\s+\d{1,2}[：:]\d{2}\]\s*/g, '')
            .replace(/\[\d{1,2}[：:]\d{2}(?:\s*(?:AM|PM))?\]\s*/gi, '')
            .replace(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}[：:]\d{2}\s*/gm, '')
            .replace(/^\d{1,2}[-/]\d{1,2}\s+\d{1,2}[：:]\d{2}\s*/gm, '')
            .replace(/（[上下]午\d{1,2}[：:]\d{2}）/g, '')
            .replace(/\(\d{1,2}:\d{2}\s*[AP]M\)/gi, '')
            .replace(/\(\d{1,2}[：:]\d{2}\)/g, '')
            // ── Strip markdown headers ──
            .replace(/^#{1,6}\s+/gm, '')
            // ── Strip residual action/system tags ──
            .replace(/\[\[(?:ACTION|NEWS_CARD_ID|NEWS_CARD|RECALL|SEARCH|DIARY|READ_DIARY|FS_DIARY|FS_READ_DIARY|DIARY_START|DIARY_END|FS_DIARY_START|FS_DIARY_END|CALL|WEIBO_SEARCH|CANVA_CREATE|CANVA_SEARCH|CANVA_EXPORT|XHS_SEARCH|XHS_BROWSE|XHS_POST|XHS_SHARE|XHS_COMMENT|XHS_LIKE|XHS_FAV|XHS_DETAIL|XHS_REPLY|XHS_MY_PROFILE|READ_NOTE)[:\s][\s\S]*?\]\]/g, '')
            .replace(/\[\[(?:ACTION|CALL)[:\s]\w*\]\]/g, '')
            .replace(/\[schedule_message[^\]]*\]/g, '')
            .replace(/\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g, '')
            .replace(/\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g, '')
            .replace(/\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g, '')
            // ── Kill system log mimicry that escaped cleanAiSecondPass ──
            .replace(/[【\[]\s*🎤\s*(?:用户)?语音\s*[】\]]\s*/g, '')
            .replace(/[【\[]\s*(?:你上一条语音|你上一條語音|上一条语音|上一條語音|你刚才的语音|你剛才的語音|你发出的语音|你發出的語音)(?:消息)?(?:[（(]\s*\d+\s*秒\s*[）)])?\s*[】\]]\s*/g, '')
            .replace(/[【\[](?:用户|你|我|User)\s*发送了[\s\S]*?[】\]]/g, '')
            .replace(/[【\[](?:语音通话|图片|视频|文件|位置|联系人|名片|红包)[】\]]/g, '')
            .replace(/[【\[]\s*(?:系统|System)\s*(?:提示|消息|通知)?\s*[：:]\s*[^\]】]*[】\]]\s*/gi, '')
            // ── Kill leaked internal prompt/protocol tags ──
            .replace(/<\/?(?:rp_core|speech_soul|cot_protocol|dreamweaver|soft_devotion_chat_mode|character_depth|behavior|no_nagging|no_deify|ability_boundary|anti_template|dynamics|equality|subtlety|CRITICAL_OUTPUT_FORMAT|think)>/gi, '')
            // ── Strip backtick artifacts ──
            .replace(/`(\[\[[\s\S]*?\]\])`/g, '$1')
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2')
            // ── Strip markdown links → keep text ──
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // ── Strip orphaned bold markers ──
            .replace(/\*{2,}/g, '')
            // ── Strip separators and bullets ──
            .replace(/^\s*---\s*$/gm, '')
            .replace(/^\s*[-*+]\s*$/gm, '')
            // ── Strip legacy translation marker ──
            .replace(/%%TRANS%%[\s\S]*/gi, '')
            // ── Collapse excessive whitespace ──
            .replace(/\n{3,}/g, '\n\n')
            .trim()));
    },

    /**
     * Check if text has meaningful display content after stripping all markers/junk.
     * Used to decide whether a chunk is worth saving as a message.
     */
    hasDisplayContent: (text: string): boolean => {
        const stripped = text
            .replace(LEAKED_REPLY_CONTEXT_LABEL_RE, '')
            .replace(/%%\s*BILINGUAL\s*%%/gi, '')
            .replace(/%%TRANS%%[\s\S]*/gi, '')
            .replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '')
            .replace(/^\s*---\s*$/gm, '')
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2')
            .replace(/\[\[[\s\S]*?\]\]/g, '')
            .replace(/\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g, '')
            .replace(/\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g, '')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s*$/gm, '')
            .trim();
        return stripped.length > 0;
    },

    // Split text into bubbles (text and emojis)
    parseSongShareContent,

    splitResponse: (content: string): ChatResponsePart[] => {
        content = normalizeSongShareTags(content);
        const tokenPattern = /\[\[(SEND_EMOJI|SHARE_SONG):\s*([\s\S]*?)\]\]/g;
        const parts: ChatResponsePart[] = [];
        let lastIndex = 0;
        let tokenMatch: RegExpExecArray | null;

        while ((tokenMatch = tokenPattern.exec(content)) !== null) {
            if (tokenMatch.index > lastIndex) {
                const textBefore = content.slice(lastIndex, tokenMatch.index).trim();
                if (textBefore && !isToolWrapperJunk(textBefore)) parts.push({ type: 'text', content: textBefore });
            }

            if (tokenMatch[1] === 'SEND_EMOJI') {
                parts.push({ type: 'emoji', content: tokenMatch[2].trim() });
            } else {
                const songCard = parseSongShareContent(tokenMatch[2]);
                if (songCard) {
                    parts.push({ type: 'song', content: songCard });
                } else {
                    const rawTag = tokenMatch[0].trim();
                    if (rawTag) parts.push({ type: 'text', content: rawTag });
                }
            }

            lastIndex = tokenMatch.index + tokenMatch[0].length;
        }

        if (lastIndex < content.length) {
            const remaining = content.slice(lastIndex).trim();
            if (remaining && !isToolWrapperJunk(remaining)) parts.push({ type: 'text', content: remaining });
        }

        if (parts.length === 0 && content.trim()) parts.push({ type: 'text', content: content.trim() });
        return parts;
    },

    // Chunking text for typing effect - splits into separate chat bubbles
    // Primary: split on line breaks (AI decides where to break)
    // Secondary: within each chunk, convert spaces between CJK characters to separate bubbles
    //   (Chinese text normally has no spaces, so spaces between CJK chars = AI intended a line break)
    chunkText: (text: string): string[] => {
        // Try line breaks first
        let chunks = text.split(/(?:\r\n|\r|\n|\u2028|\u2029)+/)
            .map(c => c.trim())
            .filter(c => c.length > 0);

        // Split on spaces that sit between CJK characters/punctuation
        // NOTE: We avoid regex lookbehind (?<=...) because Safari <= 16.3 does not
        // support it and would throw a SyntaxError at module parse time, killing the
        // entire app.  Instead, we use a capture-group approach: match the CJK char
        // before + space + CJK char after, then reconstruct by keeping surrounding
        // characters with their respective halves.
        const CJK_SPACE_CJK_RE = /([\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2000-\u206f\u2e80-\u2eff\u3001-\u3003\u2018-\u201f\u300a-\u300f\uff01-\uff0f\uff1a-\uff20])\s+([\u4e00-\u9fff\u3400-\u4dbf])/g;

        /**
         * Split a single text segment on CJK-space-CJK boundaries.
         * Short segments (<=15 chars) are kept as-is to avoid over-splitting.
         */
        const splitCjkSpaces = (segment: string): string[] => {
            const visibleLength = segment.replace(/\s+/g, '').length;
            if (visibleLength <= 15) {
                return [segment];
            }

            const parts: string[] = [];
            let lastIdx = 0;
            CJK_SPACE_CJK_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = CJK_SPACE_CJK_RE.exec(segment)) !== null) {
                const splitPos = m.index + m[1].length;
                parts.push(segment.slice(lastIdx, splitPos));
                lastIdx = splitPos;
                const spaceLen = m[0].length - m[1].length - m[2].length;
                lastIdx += spaceLen;
                CJK_SPACE_CJK_RE.lastIndex = m.index + m[1].length + spaceLen;
            }
            if (lastIdx < segment.length) parts.push(segment.slice(lastIdx));
            const result = parts.map(c => c.trim()).filter(c => c.length > 0);
            return result.length > 0 ? result : [segment];
        };

        // Apply CJK space splitting to each chunk individually.
        // This handles cases where AI uses spaces instead of newlines within a line.
        const expanded: string[] = [];
        for (const chunk of chunks) {
            expanded.push(...splitCjkSpaces(chunk));
        }

        return expanded;
    }
}
