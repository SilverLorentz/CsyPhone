import { setApiRequestRetry,trackedApiRequest,type ApiRequestTraceMeta } from './apiRequestLedger';

/**
 * Safe API response parsing utilities.
 *
 * Prevents "Unexpected token <" crashes that happen when API proxies
 * return HTML error pages (CloudFlare, nginx 502/503, rate limits)
 * instead of JSON responses.
 */

/** Parse a fetch Response as JSON safely (text-first, then JSON.parse) */
export async function safeResponseJson(response: Response): Promise<any> {
    const text = await response.text();

    // Detect HTML / XML responses
    const trimmed = text.trimStart();
    if (trimmed.startsWith('<')) {
        // Extract useful info from HTML error pages
        const titleMatch = trimmed.match(/<title>(.*?)<\/title>/i);
        const hint = titleMatch ? titleMatch[1] : trimmed.slice(0, 120);
        throw new Error(
            `API返回了HTML而非JSON (HTTP ${response.status}): ${hint}`
        );
    }

    // Empty body
    if (!trimmed) {
        throw new Error(`API返回了空响应 (HTTP ${response.status})`);
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        // Show a snippet of what we got for debugging
        const preview = text.slice(0, 200);
        throw new Error(
            `API返回了无效JSON (HTTP ${response.status}): ${preview}`
        );
    }
}

/**
 * Fetch with automatic retry for transient errors.
 * Retries on: 429, 500, 502, 503, 504 and network failures.
 * Returns the parsed JSON data directly.
 */
export async function safeFetchJson(
    url: string,
    options: RequestInit,
    maxRetries: number = 2,
    trace?: ApiRequestTraceMeta,
): Promise<any> {
    const retryableStatuses = new Set([429, 500, 502, 503, 504]);
    const inferredTrace = (): ApiRequestTraceMeta | undefined => {
        if (!url.includes('/chat/completions')) return undefined;
        let model: string | undefined;
        if (typeof options.body === 'string') {
            try {
                const body = JSON.parse(options.body) as { model?: unknown };
                if (typeof body.model === 'string') model = body.model;
            } catch {
                // Ignore body parse failures; the ledger must never affect requests.
            }
        }
        return {
            feature: 'unknown',
            reason: '未标注 AI 请求',
            model,
            userInitiated: false,
        };
    };

    const execute = async (requestId?: string): Promise<any> => {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    // For retryable status codes, retry before giving up
                    if (retryableStatuses.has(response.status) && attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
                        console.warn(`[SafeAPI] HTTP ${response.status}, retry ${attempt + 1}/${maxRetries} in ${delay}ms...`);
                        if (requestId) setApiRequestRetry(requestId, attempt + 1, `自动重试: HTTP ${response.status}`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    // Non-retryable or last attempt: parse body for error details
                    const data = await safeResponseJson(response);
                    // If we somehow got valid JSON with error info, wrap it
                    const errMsg = data?.error?.message || data?.error || `HTTP ${response.status}`;
                    throw new Error(`API Error ${response.status}: ${errMsg}`);
                }

                return await safeResponseJson(response);
            } catch (e: any) {
                lastError = e;

                // Network errors (fetch itself failed) are retryable
                if (e.name === 'TypeError' && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`[SafeAPI] Network error, retry ${attempt + 1}/${maxRetries} in ${delay}ms:`, e.message);
                    if (requestId) setApiRequestRetry(requestId, attempt + 1, '自动重试: 网络错误');
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                // For HTML/parse errors on non-ok responses during retry, continue
                if (attempt < maxRetries && e.message?.includes('API返回了HTML')) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.warn(`[SafeAPI] HTML response, retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                    if (requestId) setApiRequestRetry(requestId, attempt + 1, '自动重试: HTML 响应');
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }

                throw e;
            }
        }

        throw lastError || new Error('API请求失败');
    };

    const effectiveTrace = trace || inferredTrace();
    if (!effectiveTrace) return execute();
    return trackedApiRequest({ ...effectiveTrace, url }, ({ requestId }) => execute(requestId));
}

/**
 * Safely extract the AI content string from an OpenAI-compatible response.
 * Returns '' instead of crashing when the structure is unexpected.
 */
export function extractContent(data: any): string {
    return data?.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Robustly extract a JSON object from AI-generated text.
 *
 * Handles common AI format instabilities:
 *  - `<think>` / `<thinking>` reasoning tags (DeepSeek-R1, etc.)
 *  - JSON wrapped in ```json ... ``` code blocks
 *  - Extra prose before/after the JSON ("Here is the result: { ... }")
 *  - Trailing commas in arrays/objects  (common Claude habit)
 *  - Single-quoted strings
 *  - Unquoted keys
 *  - **Truncated JSON** (max_tokens cutoff) — auto-closes unclosed braces/brackets
 *
 * Returns parsed object on success, null on total failure.
 */
export function extractJson(
    raw: string,
    options: { logFailure?: boolean } = {},
): any | null {
    if (!raw) return null;

    // 0. Strip <think>/<thinking> reasoning tags (DeepSeek-R1, some Claude models)
    let text = raw
        .replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/g, '')
        .replace(/<think(?:ing)?>([\s\S]*)$/g, '')  // unclosed think tag at end
        .trim();

    // 1. Strip markdown code fences
    text = text
        .replace(/^```(?:json|JSON)?\s*\n?/gm, '')
        .replace(/\n?```\s*$/gm, '')
        .trim();

    // 2. Try direct parse first (fast path)
    try { return JSON.parse(text); } catch {}

    // 3. Extract the outermost { ... } or [ ... ]
    const objMatch = text.match(/(\{[\s\S]*\})/);
    const arrMatch = text.match(/(\[[\s\S]*\])/);
    // Prefer whichever starts earlier in the text
    let jsonStr = '';
    if (objMatch && arrMatch) {
        jsonStr = (text.indexOf(objMatch[1]) <= text.indexOf(arrMatch[1]))
            ? objMatch[1] : arrMatch[1];
    } else {
        jsonStr = objMatch?.[1] || arrMatch?.[1] || '';
    }

    // 4. Try parsing the extracted substring
    if (jsonStr) {
        try { return JSON.parse(jsonStr); } catch {}
    }

    // 5. Fix common AI formatting issues and retry
    if (jsonStr) {
        const fixed = jsonStr
            // Trailing commas: ,} or ,]
            .replace(/,\s*([}\]])/g, '$1')
            // Single quotes → double quotes
            .replace(/'/g, '"')
            // Unquoted keys:  { foo: "bar" } → { "foo": "bar" }
            .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

        try { return JSON.parse(fixed); } catch {}
    }

    // 6. Truncated JSON repair — auto-close unclosed braces/brackets
    //    This handles the common case where max_tokens cuts off the response mid-JSON.
    //    Uses two strategies: (1) close brackets directly, (2) strip last incomplete entry then close.
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const startIdx = (firstBrace >= 0 && firstBracket >= 0)
        ? Math.min(firstBrace, firstBracket)
        : Math.max(firstBrace, firstBracket);

    if (startIdx >= 0) {
        // Helper: count unclosed brackets, close them, try parse
        const tryRepairClose = (s: string): any | null => {
            let openBraces = 0, openBrackets = 0;
            let inStr = false, esc = false;
            for (const ch of s) {
                if (esc) { esc = false; continue; }
                if (ch === '\\') { esc = true; continue; }
                if (ch === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (ch === '{') openBraces++;
                if (ch === '}') openBraces--;
                if (ch === '[') openBrackets++;
                if (ch === ']') openBrackets--;
            }
            if (openBraces <= 0 && openBrackets <= 0) return null;
            let repaired = s;
            if (inStr) repaired += '"';
            for (let b = 0; b < openBrackets; b++) repaired += ']';
            for (let b = 0; b < openBraces; b++) repaired += '}';
            repaired = repaired.replace(/,\s*([}\]])/g, '$1');
            try { return JSON.parse(repaired); } catch { return null; }
        };

        const rawSlice = text.slice(startIdx);

        // Strategy 1: Close brackets directly (works when JSON is complete except for closing brackets)
        const r1 = tryRepairClose(rawSlice);
        if (r1 !== null) {
            console.warn('[extractJson] Recovered truncated JSON via bracket repair');
            return r1;
        }

        // Strategy 2: Strip from last comma (the last entry is likely incomplete), then close
        const lastComma = rawSlice.lastIndexOf(',');
        if (lastComma > 0) {
            const stripped = rawSlice.slice(0, lastComma);
            const r2 = tryRepairClose(stripped);
            if (r2 !== null) {
                console.warn('[extractJson] Recovered truncated JSON via strip-last + bracket repair');
                return r2;
            }
        }
    }

    // 7. Last resort: try to extract individual JSON objects if there are multiple
    // (AI sometimes outputs two JSON blocks, take the larger one)
    const allObjects = [...text.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)];
    if (allObjects.length > 0) {
        // Sort by length, try the longest first (most likely the full response)
        const sorted = allObjects.sort((a, b) => b[0].length - a[0].length);
        for (const m of sorted) {
            try {
                return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1'));
            } catch {}
        }
    }

    if (options.logFailure !== false) {
        console.error('[extractJson] All attempts failed. Raw:', raw.slice(0, 300));
    }
    return null;
}

/**
 * Type-safe variant of extractJson.
 *
 * Parses AI text into JSON, then runs a user-supplied `validate` function
 * that either returns a typed result or null (if the structure doesn't match).
 *
 * This is the recommended entry point for all AI-output JSON extraction
 * where you need guaranteed structure (e.g. sense output, inner voice, events).
 *
 * @example
 * ```ts
 * const result = extractJsonTyped(aiText, (obj) => {
 *     if (obj.innerVoice && typeof obj.innerVoice === 'string') {
 *         return { innerVoice: obj.innerVoice.slice(0, 80) };
 *     }
 *     return null;
 * });
 * ```
 */
export function extractJsonTyped<T>(
    raw: string,
    validate: (obj: any) => T | null,
    options: { logFailure?: boolean } = {},
): T | null {
    const parsed = extractJson(raw, options);
    if (parsed === null) return null;
    return validate(parsed);
}
