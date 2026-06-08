const VOICE_CALL_TRANSLATION_TAG_RE = /\[\[翻译\s*[：:]\s*[\s\S]*?\]\]/g;
const VOICE_CALL_TRANSLATION_TAG_SINGLE_RE = /\[\[翻译\s*[：:]\s*([\s\S]*?)\]\]/;
const BRACKETED_STAGE_DIRECTION_RE = /([（(【\[])([^（）()【】\[\]]{1,24})([）)】\]])/g;
const VOICE_CALL_SENTENCE_FRAGMENT_RE = /[^。！？.!?\n]+[。！？.!?\n]*/g;

const ENGLISH_STAGE_DIRECTION_HINTS = [
    'laugh',
    'chuckle',
    'sigh',
    'gasp',
    'emm',
    'hum',
    'cough',
    'cry',
    'snort',
    'yawn',
    'breath',
    'breathe',
    'whisper',
    'pause',
    'hesitate',
    'giggle',
];

const CHINESE_STAGE_DIRECTION_HINTS = [
    '轻笑',
    '低笑',
    '苦笑',
    '失笑',
    '偷笑',
    '闷笑',
    '哼笑',
    '冷笑',
    '嗤笑',
    '叹气',
    '叹息',
    '轻叹',
    '吸气',
    '倒吸',
    '屏息',
    '深呼吸',
    '呼吸',
    '喘息',
    '哽咽',
    '抽泣',
    '啜泣',
    '哭腔',
    '鼻音',
    '沉默',
    '顿了顿',
    '停顿',
    '犹豫',
    '迟疑',
    '轻声',
    '低声',
    '柔声',
    '小声',
    '压低声音',
    '清了清嗓子',
    '咳嗽',
    '打哈欠',
    '撒娇',
    '无奈',
    '委屈',
    '害羞',
    '认真',
    '温柔',
];

export type VoiceCallTtsEmotionTagFormat = 'strip' | 'minimax' | 'elevenlabs-v3';

const ELEVENLABS_V3_EMOTION_TAG_MAP: Record<string, string> = {
    chuckle: 'laughs',
    coughs: 'clears throat',
    breath: 'breathes',
    emm: 'hesitates',
    humming: 'hums',
};

const ENGLISH_META_OPERATION_RE = /\b(?:synthesiz(?:e|ing)|integrat(?:e|ing)|process(?:ing)?|analy[sz](?:e|ing)|generat(?:e|ing)|formulat(?:e|ing)|craft(?:ing)|compos(?:e|ing)|retriev(?:e|ing))\b/i;
const ENGLISH_META_OBJECT_RE = /\b(?:memory(?:\s+(?:database|bank|system))?|database|system\s+prompt|prompt|persona|character(?:\s+(?:aspects?|profile|details?))?|voice|response|reply|workflow|context|instructions?)\b/i;
const ENGLISH_META_PHRASE_RES = [
    /\bas an ai\b/i,
    /\bcarefully integrating\b/i,
    /\bauthentic and comforting response\b/i,
    /\bmemory database\b/i,
    /\bcharacter aspects?\b/i,
    /\bprocessing your request\b/i,
    /\bthinking about how to respond\b/i,
    /\bformulating (?:a )?response\b/i,
    /\bintegrating all the character\b/i,
];

function normalizeStageDirectionText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\s.,!?！？，。、“”"'`~:：;；\-_/\\|]/g, '');
}

function looksLikeVoiceCallStageDirection(text: string): boolean {
    const normalized = normalizeStageDirectionText(text);

    if (!normalized) {
        return false;
    }

    if (/^[a-z]+$/.test(normalized)) {
        return ENGLISH_STAGE_DIRECTION_HINTS.some((hint) => normalized.includes(hint));
    }

    if (/^[\u4e00-\u9fff]+$/.test(normalized)) {
        return CHINESE_STAGE_DIRECTION_HINTS.some((hint) => normalized.includes(hint));
    }

    return false;
}

function resolveVoiceCallEmotionTag(text: string): string | null {
    const normalized = normalizeStageDirectionText(text);

    if (!looksLikeVoiceCallStageDirection(text)) {
        return null;
    }

    if (normalized.includes('chuckle') || /轻笑|低笑|苦笑|失笑|偷笑|闷笑|哼笑|冷笑|嗤笑/.test(normalized)) return 'chuckle';
    if (normalized.includes('laugh') || normalized.includes('giggle') || normalized.includes('笑')) return 'laughs';
    if (normalized.includes('sigh') || normalized.includes('叹')) return 'sighs';
    if (normalized.includes('gasp') || /吸气|倒吸/.test(normalized)) return 'gasps';
    if (normalized.includes('cough') || /咳嗽|清了清嗓子/.test(normalized)) return 'coughs';
    if (normalized.includes('cry') || /哽咽|抽泣|啜泣|哭腔/.test(normalized)) return 'crying';
    if (normalized.includes('snort')) return 'snorts';
    if (normalized.includes('yawn') || normalized.includes('打哈欠')) return 'yawns';
    if (normalized.includes('hum')) return 'humming';
    if (normalized.includes('whisper') || /轻声|低声|柔声|小声|压低声音/.test(normalized)) return 'whispers';
    if (normalized.includes('breath') || normalized.includes('breathe') || /深呼吸|呼吸|屏息|喘息/.test(normalized)) return 'breath';
    if (normalized.includes('emm') || normalized.includes('hesitate') || /犹豫|迟疑|停顿|顿了顿/.test(normalized)) return 'emm';

    return null;
}

function formatVoiceCallEmotionTag(tag: string, format: VoiceCallTtsEmotionTagFormat): string {
    if (format === 'minimax') return `(${tag})`;
    if (format === 'elevenlabs-v3') return `[${ELEVENLABS_V3_EMOTION_TAG_MAP[tag] || tag}]`;
    return '';
}

function cleanupVoiceCallSpacing(text: string): string {
    return text
        .replace(/\s+([,，。.!！？、;；:：])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s,，。.!！？、;；:：-]+/, '')
        .trim();
}

function looksLikeVoiceCallMetaNarration(text: string): boolean {
    const candidate = cleanupVoiceCallSpacing(text);

    if (!candidate) {
        return false;
    }

    const asciiWordCount = (candidate.match(/[A-Za-z]{3,}/g) || []).length;
    const cjkCount = (candidate.match(/[\u4e00-\u9fff]/g) || []).length;

    if (asciiWordCount === 0) {
        return false;
    }

    if (ENGLISH_META_PHRASE_RES.some((re) => re.test(candidate))) {
        return true;
    }

    return asciiWordCount >= 3
        && cjkCount <= 2
        && ENGLISH_META_OPERATION_RE.test(candidate)
        && ENGLISH_META_OBJECT_RE.test(candidate);
}

export function stripVoiceCallTranslationTags(text: string): string {
    return text.replace(VOICE_CALL_TRANSLATION_TAG_RE, '').trim();
}

export interface VoiceCallForeignSentenceParts {
    spokenText: string;
    translationText: string;
    hasTranslation: boolean;
}

export function hasCompleteVoiceCallTranslationTag(text: string): boolean {
    return VOICE_CALL_TRANSLATION_TAG_SINGLE_RE.test(text);
}

export function splitVoiceCallForeignSentence(text: string): VoiceCallForeignSentenceParts {
    const match = text.match(VOICE_CALL_TRANSLATION_TAG_SINGLE_RE);
    return {
        spokenText: stripVoiceCallTranslationTags(text),
        translationText: match?.[1]?.trim() || '',
        hasTranslation: !!match,
    };
}

export function stripVoiceCallStageDirections(text: string): string {
    return text.replace(BRACKETED_STAGE_DIRECTION_RE, (match, _open, inner: string) => (
        looksLikeVoiceCallStageDirection(inner.trim()) ? '' : match
    ));
}

export function preserveVoiceCallEmotionTagsForTts(
    text: string,
    format: VoiceCallTtsEmotionTagFormat,
): string {
    return text.replace(BRACKETED_STAGE_DIRECTION_RE, (match, _open, inner: string) => {
        const tag = resolveVoiceCallEmotionTag(inner.trim());
        if (!tag) {
            return looksLikeVoiceCallStageDirection(inner.trim()) ? '' : match;
        }
        return formatVoiceCallEmotionTag(tag, format);
    });
}

export function stripVoiceCallMetaNarration(text: string): string {
    const fragments = text.match(VOICE_CALL_SENTENCE_FRAGMENT_RE);

    if (!fragments || fragments.length === 0) {
        return looksLikeVoiceCallMetaNarration(text) ? '' : text;
    }

    return fragments
        .map((fragment) => (looksLikeVoiceCallMetaNarration(fragment) ? '' : fragment))
        .join(' ');
}

export function sanitizeVoiceCallAssistantText(text: string): string {
    return cleanupVoiceCallSpacing(
        stripVoiceCallMetaNarration(
            stripVoiceCallStageDirections(stripVoiceCallTranslationTags(text)),
        ),
    );
}

export function sanitizeVoiceCallAssistantTextForTts(
    text: string,
    emotionTagFormat: VoiceCallTtsEmotionTagFormat = 'strip',
): string {
    return cleanupVoiceCallSpacing(
        stripVoiceCallMetaNarration(
            preserveVoiceCallEmotionTagsForTts(
                stripVoiceCallTranslationTags(text),
                emotionTagFormat,
            ),
        ),
    );
}

export function getVoiceCallVisibleText(role: string, text: string): string {
    const withoutTranslation = stripVoiceCallTranslationTags(text);
    return role === 'assistant'
        ? sanitizeVoiceCallAssistantText(withoutTranslation)
        : withoutTranslation;
}
