import { describe,it,expect } from 'vitest';
import { extractJson,extractJsonTyped } from '../utils/safeApi';

describe('extractJson', () => {
    // ─── Stage 0: Think tag stripping ────────────────────────

    it('strips <think> tags and parses inner JSON', () => {
        const raw = '<think>Let me analyze this...</think>\n{"excitement": "+low", "stability": "stable"}';
        const result = extractJson(raw);
        expect(result).toEqual({ excitement: '+low', stability: 'stable' });
    });

    it('strips <thinking> tags (alternate form)', () => {
        const raw = '<thinking>Some reasoning here</thinking>{"key": "value"}';
        const result = extractJson(raw);
        expect(result).toEqual({ key: 'value' });
    });

    it('handles unclosed <think> tag at end (truncated thinking)', () => {
        const raw = '<think>Still thinking about this but got cut off... {"key": "value"}';
        // The entire unclosed think tag gets stripped, leaving empty → null
        // Actually let me reconsider: the regex strips <think>...$ so it strips everything
        const result = extractJson(raw);
        expect(result).toBeNull();
    });

    // ─── Stage 1-2: Code fences & direct parse ───────────────

    it('parses clean JSON directly', () => {
        const raw = '{"innerVoice": "明天还有个会议要准备"}';
        expect(extractJson(raw)).toEqual({ innerVoice: '明天还有个会议要准备' });
    });

    it('strips markdown ```json code fences', () => {
        const raw = '```json\n{"event": "外卖", "estimatedMinutes": 30}\n```';
        expect(extractJson(raw)).toEqual({ event: '外卖', estimatedMinutes: 30 });
    });

    it('strips ```JSON (uppercase) code fences', () => {
        const raw = '```JSON\n{"a": 1}\n```';
        expect(extractJson(raw)).toEqual({ a: 1 });
    });

    // ─── Stage 3-4: Extract from prose ───────────────────────

    it('extracts JSON from surrounding prose', () => {
        const raw = 'Here is the result:\n{"hasEvent": true, "event": "开会"}\nHope this helps!';
        const result = extractJson(raw);
        expect(result).toEqual({ hasEvent: true, event: '开会' });
    });

    it('extracts array from surrounding prose', () => {
        const raw = 'The memories are:\n[{"action": "create", "title": "test"}]\nDone.';
        const result = extractJson(raw);
        expect(result).toEqual([{ action: 'create', title: 'test' }]);
    });

    // ─── Stage 5: Common AI formatting fixes ─────────────────

    it('fixes trailing commas', () => {
        const raw = '{"excitement": "+low", "stability": "stable", }';
        expect(extractJson(raw)).toEqual({ excitement: '+low', stability: 'stable' });
    });

    it('fixes single-quoted strings', () => {
        const raw = "{'key': 'value', 'num': 42}";
        expect(extractJson(raw)).toEqual({ key: 'value', num: 42 });
    });

    it('fixes unquoted keys', () => {
        const raw = '{excitement: "+high", stability: "stable"}';
        expect(extractJson(raw)).toEqual({ excitement: '+high', stability: 'stable' });
    });

    // ─── Stage 6: Truncated JSON repair ──────────────────────

    it('repairs truncated JSON with unclosed brace', () => {
        // Simulates max_tokens cutting off mid-response
        const raw = '{"excitement": "+low", "stability": "stable", "pressure": "+medium"';
        const result = extractJson(raw);
        expect(result).not.toBeNull();
        expect(result.excitement).toBe('+low');
        expect(result.stability).toBe('stable');
        expect(result.pressure).toBe('+medium');
    });

    it('repairs truncated JSON with nested objects', () => {
        const raw = '{"style": {"textColor": "#eee", "accent": "#ff0"';
        const result = extractJson(raw);
        expect(result).not.toBeNull();
        expect(result.style.textColor).toBe('#eee');
        expect(result.style.accent).toBe('#ff0');
    });

    it('repairs truncated JSON mid-string-value', () => {
        // Cut off in the middle of a string value
        const raw = '{"innerVoice": "明天那个会还没准备';
        const result = extractJson(raw);
        expect(result).not.toBeNull();
        expect(result.innerVoice).toContain('明天那个会还没准备');
    });

    it('repairs truncated JSON cutting off a trailing key-value pair', () => {
        // The last key-value is incomplete — should be stripped and braces closed
        const raw = '{"excitement": "+low", "stability": "stable", "press';
        const result = extractJson(raw);
        expect(result).not.toBeNull();
        expect(result.excitement).toBe('+low');
        expect(result.stability).toBe('stable');
    });

    // ─── Stage 7: Multi-object extraction ────────────────────

    it('extracts the largest object when multiple are present', () => {
        const raw = 'First: {"a": 1} and then {"b": 2, "c": 3}';
        const result = extractJson(raw);
        // Should prefer the larger object
        expect(result).toEqual({ b: 2, c: 3 });
    });

    // ─── Edge cases ──────────────────────────────────────────

    it('returns null for empty input', () => {
        expect(extractJson('')).toBeNull();
        expect(extractJson(null as any)).toBeNull();
        expect(extractJson(undefined as any)).toBeNull();
    });

    it('returns null for completely non-JSON text', () => {
        expect(extractJson('Hello, how are you?')).toBeNull();
    });

    it('handles combined think tags + code fences + trailing comma', () => {
        const raw = `<thinking>Let me analyze...</thinking>
\`\`\`json
{"innerVoice": "困了但还不想睡", }
\`\`\``;
        const result = extractJson(raw);
        expect(result).toEqual({ innerVoice: '困了但还不想睡' });
    });
});

describe('extractJsonTyped', () => {
    it('returns validated typed result', () => {
        const raw = '{"innerVoice": "明天还有个会议", "extra": "ignored"}';
        const result = extractJsonTyped<{ innerVoice: string }>(raw, (obj) => {
            if (obj.innerVoice && typeof obj.innerVoice === 'string') {
                return { innerVoice: obj.innerVoice.slice(0, 80) };
            }
            return null;
        });
        expect(result).toEqual({ innerVoice: '明天还有个会议' });
    });

    it('returns null when validate rejects the parsed object', () => {
        const raw = '{"wrongField": "value"}';
        const result = extractJsonTyped<{ innerVoice: string }>(raw, (obj) => {
            if (obj.innerVoice && typeof obj.innerVoice === 'string') {
                return { innerVoice: obj.innerVoice };
            }
            return null;
        });
        expect(result).toBeNull();
    });

    it('returns null when JSON itself cannot be parsed', () => {
        const raw = 'not json at all';
        const result = extractJsonTyped(raw, (obj) => obj);
        expect(result).toBeNull();
    });

    it('works with truncated JSON + validation', () => {
        const raw = '{"hasEvent": true, "event": "外卖", "estimatedMinutes": 30';
        const result = extractJsonTyped<{ hasEvent: boolean; event: string }>(raw, (obj) => {
            if (typeof obj.hasEvent === 'boolean') {
                return { hasEvent: obj.hasEvent, event: String(obj.event || '') };
            }
            return null;
        });
        expect(result).not.toBeNull();
        expect(result!.hasEvent).toBe(true);
        expect(result!.event).toBe('外卖');
    });
});
