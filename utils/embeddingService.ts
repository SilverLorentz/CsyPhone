/**
 * Embedding API Service (Multi-provider)
 *
 * Runtime config is normalized in runtimeConfig.ts so tools no longer read
 * storage keys directly.
 */

export {
    EMBEDDING_ENGINES,
    getEmbeddingConfig,
    inferEmbeddingEngineId,
    type EmbeddingEngineId,
    type EmbeddingProvider,
} from './runtimeConfig';

import { getEmbeddingConfig } from './runtimeConfig';

const MAX_RETRIES = 2;
const RETRY_DELAYS = [5000, 10000]; // 5s, then 10s

/** Fetch with automatic retry on rate-limit errors (403/429) */
async function fetchWithRetry(url: string, apiKey: string, body: string): Promise<any> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body,
        });

        if (resp.ok) {
            return await resp.json();
        }

        // Retry on rate limit
        if ((resp.status === 403 || resp.status === 429) && attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS[attempt];
            console.warn(`🧠 [Embedding] Rate limited (${resp.status}), retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
        }

        const err = await resp.text();
        throw new Error(`Embedding API error ${resp.status}: ${err}`);
    }
    throw new Error('Embedding API: max retries exceeded');
}

// ====== Keyword Matching (Sparse Retrieval) ======

/**
 * Chinese word segmenter — cached at module level.
 * Uses Intl.Segmenter (zero-dependency, native browser API).
 * Falls back to bigram splitting on unsupported browsers (Firefox).
 */
const ZH_SEGMENTER: any = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new (Intl as any).Segmenter('zh', { granularity: 'word' })
    : null;

/** High-frequency Chinese stop words to exclude from keyword matching */
const STOP_WORDS = new Set([
    '我', '你', '他', '她', '它', '我们', '你们', '他们', '自己', '大家', '人家',
    '的', '了', '在', '是', '和', '有', '就', '都', '也', '还', '又', '不', '没', '没有',
    '要', '会', '能', '可以', '应该', '可能', '需要',
    '说', '想', '做', '去', '来', '看', '知道', '觉得', '感觉', '认为', '告诉', '问',
    '很', '非常', '特别', '比较', '已经', '然后', '所以', '因为', '但是', '不过', '而且', '如果',
    '这', '那', '这个', '那个', '什么', '怎么', '哪里', '为什么', '多少',
    '嗯', '哦', '啊', '呢', '吧', '呀', '吗', '哈', '嘿', '哎', '喔',
    '现在', '时候', '今天', '昨天', '明天', '以后', '之前', '最近',
    '好', '好的', '对', '行', '其实', '还是', '一下', '一个', '一些',
]);

/**
 * Segment text into meaningful words.
 * Intl.Segmenter path: proper Chinese word segmentation.
 * Fallback path: bigram splitting for basic coverage.
 */
export function segmentWords(text: string): string[] {
    if (ZH_SEGMENTER) {
        const words: string[] = [];
        for (const { segment, isWordLike } of ZH_SEGMENTER.segment(text)) {
            if (isWordLike && segment.length >= 2 && !STOP_WORDS.has(segment)) {
                words.push(segment.toLowerCase());
            }
        }
        return words;
    }
    // Fallback: extract Chinese bigrams + ASCII words
    const words: string[] = [];
    // Chinese characters: extract bigrams
    const chinese = text.replace(/[^\u4e00-\u9fff]/g, '');
    for (let i = 0; i < chinese.length - 1; i++) {
        const gram = chinese.slice(i, i + 2);
        if (!STOP_WORDS.has(gram)) words.push(gram);
    }
    // ASCII words (e.g. brand names like "Starbucks")
    const asciiWords = text.match(/[a-zA-Z]{3,}/g);
    if (asciiWords) words.push(...asciiWords.map(w => w.toLowerCase()));
    return words;
}

export const EmbeddingService = {

    /**
     * Embed a single text string → float vector
     * Retries up to 2 times on rate limit errors (403/429) with exponential backoff.
     * 
     * @param taskType - Hint for Cohere's input_type:
     *   'RETRIEVAL_QUERY' → search_query (for retrieval queries)
     *   anything else / undefined → search_document (for stored documents)
     */
    async embed(text: string, taskType?: string, apiKeyOverride?: string): Promise<number[]> {
        const config = getEmbeddingConfig();
        const apiKey = apiKeyOverride || config.apiKey;
        const baseUrl = config.baseUrl.replace(/\/+$/, '');

        // ====== Cohere path ======
        if (config.provider === 'cohere') {
            const inputType = taskType === 'RETRIEVAL_QUERY' ? 'search_query' : 'search_document';
            const body = JSON.stringify({
                model: config.model,
                texts: [text],
                input_type: inputType,
                embedding_types: ['float'],
            });
            const data = await fetchWithRetry(`${baseUrl}/embed`, apiKey, body);
            return data.embeddings?.float?.[0] as number[];
        }

        // ====== OpenAI-compatible path (unchanged) ======
        const body = JSON.stringify({
            model: config.model,
            input: text,
            encoding_format: 'float',
            ...(typeof config.dimensions === 'number' ? { dimensions: config.dimensions } : {}),
        });

        const data = await fetchWithRetry(`${baseUrl}/embeddings`, apiKey, body);
        return data.data?.[0]?.embedding as number[];
    },

    /**
     * Batch embed multiple texts. Uses the API's native batch support.
     * Retries on rate limit errors.
     */
    async embedBatch(texts: string[], taskType?: string, apiKeyOverride?: string): Promise<number[][]> {
        const config = getEmbeddingConfig();
        const apiKey = apiKeyOverride || config.apiKey;
        const baseUrl = config.baseUrl.replace(/\/+$/, '');

        // ====== Cohere path ======
        if (config.provider === 'cohere') {
            const inputType = taskType === 'RETRIEVAL_QUERY' ? 'search_query' : 'search_document';
            const body = JSON.stringify({
                model: config.model,
                texts,
                input_type: inputType,
                embedding_types: ['float'],
            });
            const data = await fetchWithRetry(`${baseUrl}/embed`, apiKey, body);
            // Cohere returns embeddings.float as a 2D array, already in order
            return (data.embeddings?.float || []) as number[][];
        }

        // ====== OpenAI-compatible path (unchanged) ======
        const body = JSON.stringify({
            model: config.model,
            input: texts,
            encoding_format: 'float',
            ...(typeof config.dimensions === 'number' ? { dimensions: config.dimensions } : {}),
        });

        const data = await fetchWithRetry(`${baseUrl}/embeddings`, apiKey, body);
        // Sort by index to guarantee order
        const sorted = (data.data as any[]).sort((a, b) => a.index - b.index);
        return sorted.map((d: any) => d.embedding as number[]);
    },

    /**
     * Cosine similarity between two vectors.
     * Returns value in [-1, 1], higher = more similar.
     */
    cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    },

    /**
     * Keyword match score between query text and memory text.
     * Returns value in [0, 1]. Higher = more keyword overlap.
     * Long words (≥3 chars, likely proper nouns) get bonus weight.
     */
    keywordMatchScore(queryText: string, memoryText: string): number {
        const queryWords = segmentWords(queryText);
        if (queryWords.length === 0) return 0;

        const memLower = memoryText.toLowerCase();
        let hits = 0;
        let bonusHits = 0;

        for (const word of queryWords) {
            if (memLower.includes(word)) {
                hits++;
                if (word.length >= 3) bonusHits++; // proper nouns, place names, brands
            }
        }

        const baseScore = hits / queryWords.length;
        const bonus = bonusHits / queryWords.length * 0.3;
        return Math.min(1, baseScore + bonus);
    },

    /**
     * IDF-weighted keyword match score.
     * Uses inverse document frequency to boost rare words (proper nouns, places, brands)
     * and downweight common words (吃饭, 开心, etc.).
     * Returns value in [0, 1].
     */
    keywordMatchScoreWithIDF(queryText: string, memoryText: string, idfMap: Map<string, number>): number {
        const queryWords = segmentWords(queryText);
        if (queryWords.length === 0) return 0;

        const memLower = memoryText.toLowerCase();
        let weightedHits = 0;
        let totalWeight = 0;

        for (const word of queryWords) {
            const idf = idfMap.get(word) || 1; // default IDF=1 for unknown words
            totalWeight += idf;
            if (memLower.includes(word)) {
                weightedHits += idf;
            }
        }

        return totalWeight === 0 ? 0 : Math.min(1, weightedHits / totalWeight);
    },

    /**
     * Weighted relevance score combining semantic similarity, keyword match,
     * importance, recency, hormone resonance, and emotional salience.
     * Returns value in [0, 1].
     * 
     * With hormone data (hormoneResonance > 0 or salienceScore > 0):
     *   0.35×cosine + 0.20×keyword + 0.15×importance + 0.10×resonance + 0.10×salience + 0.10×freshness
     * 
     * Without hormone data (backward compatible):
     *   hybrid:  0.40×cosine + 0.25×keyword + 0.20×importance + 0.15×freshness
     *   pure:    0.60×cosine + 0.20×importance + 0.20×freshness
     * 
     * Dynamic half-life: salience-based (14d ~ 365d) instead of fixed 30d.
     */
    weightedScore(
        similarity: number, importance: number, createdAt: number,
        keywordScore: number = 0, lastMentioned: number = 0,
        salienceScore: number = 0, hormoneResonance: number = 0,
    ): number {
        const sim = Math.max(0, similarity);
        const imp = Math.min(importance, 10) / 10;

        // Dynamic half-life based on salience (range 0~7):
        // 高冲量记忆衰减慢（最长365天），低冲量记忆衰减快（最短14天）
        const referenceTime = lastMentioned > 0 ? Math.max(lastMentioned, createdAt) : createdAt;
        const ageMs = Date.now() - referenceTime;
        let halfLifeDays: number;
        if (salienceScore > 0) {
            const baseDays = 14;
            const maxDays = 365;
            // salience ≥ 3.5（7 维中半数满偏离）→ 半衰期封顶 365 天
            halfLifeDays = baseDays + (maxDays - baseDays) * Math.min(salienceScore / 3.5, 1.0);
        } else {
            halfLifeDays = 30; // 无冲量数据时用原来的 30 天
        }
        const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;
        const freshness = Math.exp(-0.693 * ageMs / halfLifeMs);

        // Hormone-aware scoring (when any hormone data is present)
        const hasHormoneData = hormoneResonance > 0 || salienceScore > 0;
        if (hasHormoneData && keywordScore > 0) {
            // Normalized salience: map 0~7 → 0~1，≥3.5 封顶
            const salienceNorm = Math.min(salienceScore / 3.5, 1.0);
            return sim * 0.35 + keywordScore * 0.20 + imp * 0.15
                 + hormoneResonance * 0.10 + salienceNorm * 0.10 + freshness * 0.10;
        }
        if (hasHormoneData) {
            const salienceNorm = Math.min(salienceScore / 3.5, 1.0);
            return sim * 0.40 + imp * 0.15
                 + hormoneResonance * 0.15 + salienceNorm * 0.10 + freshness * 0.20;
        }

        // Backward compatible: no hormone data
        if (keywordScore > 0) {
            return sim * 0.4 + keywordScore * 0.25 + imp * 0.2 + freshness * 0.15;
        }
        return sim * 0.6 + imp * 0.2 + freshness * 0.2;
    },

    /**
     * Rerank candidates using a cross-encoder model.
     * Sends query + documents to the Rerank API for fine-grained relevance scoring.
     * 
     * Cohere dual-key logic:
     *   1. If Trial Key is set → use it (free, limited to 1000/month)
     *   2. If Trial returns 429 → fire 'rerank-trial-exhausted' event, return null
     *   3. If user confirmed paid mode → use Production Key (apiKey) for rerank
     * 
     * Returns array of { index, relevance_score } sorted by relevance (highest first).
     * Returns null on failure (caller should fallback to original ranking).
     */
    async rerank(
        query: string,
        documents: string[],
        topN?: number,
        apiKeyOverride?: string
    ): Promise<{ index: number; relevance_score: number }[] | null> {
        if (documents.length === 0) return null;

        const config = getEmbeddingConfig();
        const baseUrl = config.baseUrl.replace(/\/+$/, '');
        const rerankModel = config.rerankModel;

        // Determine which API key to use for rerank
        let rerankKey: string;
        if (apiKeyOverride) {
            rerankKey = apiKeyOverride;
        } else if (config.provider === 'cohere') {
            // Cohere dual-key: check paid mode first, then Trial, then main key
            if (config.rerankUsePaid) {
                rerankKey = config.apiKey; // Production Key (paid)
                console.log('🧠 [Rerank] Using paid Production Key');
            } else if (config.rerankApiKey) {
                rerankKey = config.rerankApiKey; // Trial Key (free)
            } else {
                rerankKey = config.apiKey; // Fallback to main key
            }
        } else {
            rerankKey = config.apiKey;
        }

        const body = JSON.stringify({
            model: rerankModel,
            query,
            documents,
            top_n: topN || documents.length,
            return_documents: false,
        });

        // 3-second timeout to prevent blocking the pipeline
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);

        try {
            const resp = await fetch(`${baseUrl}/rerank`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${rerankKey}`,
                },
                body,
                signal: controller.signal,
            });

            if (!resp.ok) {
                // Cohere Trial Key exhausted: 429 Too Many Requests
                if (config.provider === 'cohere' && !config.rerankUsePaid && (resp.status === 429 || resp.status === 402)) {
                    console.warn('🧠 [Rerank] Trial Key quota exhausted (429), notifying UI...');
                    // Check if user already dismissed this month
                    const dismissedUntil = parseInt(localStorage.getItem('rerank_dismissed_until') || '0', 10);
                    if (Date.now() < dismissedUntil) {
                        console.log('🧠 [Rerank] User dismissed upgrade prompt this month, silently degrading');
                    } else {
                        // Fire event for UI to pick up and show confirmation dialog
                        window.dispatchEvent(new CustomEvent('rerank-trial-exhausted'));
                    }
                    return null;
                }
                console.warn(`🧠 [Rerank] API error ${resp.status}, falling back`);
                return null;
            }

            const data = await resp.json();
            const results = (data.results || []) as { index: number; relevance_score: number }[];
            // Already sorted by relevance_score descending from API
            return results;
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.warn('🧠 [Rerank] Timed out (3s), falling back');
            } else {
                console.warn('🧠 [Rerank] Failed, falling back:', err.message);
            }
            return null;
        } finally {
            clearTimeout(timer);
        }
    },
};
