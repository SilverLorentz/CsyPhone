import type {
    NianNianChoiceOption,
    NianNianEventWeights,
    NianNianStatusField,
    NianNianWorldBible,
    NianNianWorldOpeningStep,
} from '../types/niannian';
import { createEmptyWorldBible, parseNianNianStatusBlock } from './niannianEngine';

export const DEFAULT_NIANNIAN_WORLD_PACK_URL = '/worldpacks/ancient-china.md';

const HEADING_PREFIX_RE = /^#{1,6}\s+/;

function normalizeHeading(value: string): string {
    return value
        .replace(HEADING_PREFIX_RE, '')
        .replace(/[（(].*?[）)]/g, '')
        .trim()
        .toLowerCase();
}

function extractHeadingSection(markdown: string, headingName: string): string {
    const lines = markdown.split(/\r?\n/);
    const target = headingName.toLowerCase();
    let start = -1;
    let level = 0;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (!headingMatch) continue;

        if (start >= 0 && headingMatch[1].length <= level) {
            return lines.slice(start + 1, index).join('\n').trim();
        }

        if (normalizeHeading(line) === target) {
            start = index;
            level = headingMatch[1].length;
        }
    }

    return start >= 0 ? lines.slice(start + 1).join('\n').trim() : '';
}

function extractFencedBlock(markdown: string, headingName: string): string {
    const section = extractHeadingSection(markdown, headingName);
    const match = section.match(/```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)```/);
    return (match?.[1] || section).trim();
}

function extractFirstHeadingSection(markdown: string, headingNames: string[]): string {
    for (const headingName of headingNames) {
        const section = extractHeadingSection(markdown, headingName);
        if (section) return section;
    }
    return '';
}

function cleanMarkdownText(value: string): string {
    return value
        .split(/\r?\n/)
        .map(line => line.replace(/^>\s?/, '').trim())
        .filter(line => line && !line.startsWith('---') && !line.startsWith('```'))
        .join('\n')
        .replace(/\*\*/g, '')
        .trim();
}

function parseJsonObject(raw: string): Record<string, any> | null {
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parseOpeningStep(raw: string): NianNianWorldOpeningStep | undefined {
    const parsed = parseJsonObject(raw);
    if (!parsed || typeof parsed.sceneText !== 'string' || !Array.isArray(parsed.options)) return undefined;

    const options: NianNianChoiceOption[] = parsed.options
        .filter((option: any) => option && typeof option.id === 'string' && typeof option.label === 'string')
        .map((option: any) => ({
            id: option.id,
            label: option.label,
            hint: typeof option.hint === 'string' ? option.hint : undefined,
            directorHint: typeof option.directorHint === 'string' ? option.directorHint : undefined,
        }));

    return {
        sceneText: parsed.sceneText.trim(),
        options,
        allowFreeInput: typeof parsed.allowFreeInput === 'boolean' ? parsed.allowFreeInput : true,
    };
}

function parseHiddenVarsSeed(raw: string): Record<string, number> {
    const parsed = parseJsonObject(raw);
    if (!parsed) return {};

    return Object.fromEntries(
        Object.entries(parsed)
            .map(([key, value]) => [key, Number(value)] as const)
            .filter(([, value]) => Number.isFinite(value)),
    );
}

function parseStatusSchema(markdown: string): NianNianStatusField[] {
    const section = extractHeadingSection(markdown, 'status_schema');
    const fields: NianNianStatusField[] = [];

    for (const line of section.split(/\r?\n/)) {
        const match = line.match(/world\.([^\s`\[]+)\[\s*([+-]?\d+)\s*[–~-]\s*([+-]?\d+)\s*\]/);
        if (!match) continue;
        fields.push({
            key: match[1],
            label: match[1],
            type: 'number',
            min: Number(match[2]),
            max: Number(match[3]),
        });
    }

    return fields;
}

function parseEventWeights(markdown: string): NianNianEventWeights {
    const raw = extractFencedBlock(markdown, 'event_weights');
    if (!raw) return {};

    const parsed = parseJsonObject(raw);
    if (parsed) {
        const weights: NianNianEventWeights = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                weights[key] = value;
                continue;
            }
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const stageWeights: Record<string, number> = {};
                for (const [eventName, eventWeight] of Object.entries(value)) {
                    const numeric = Number(eventWeight);
                    if (Number.isFinite(numeric)) stageWeights[eventName] = numeric;
                }
                weights[key] = stageWeights;
            }
        }
        return weights;
    }

    const weights: NianNianEventWeights = {};
    for (const sourceLine of raw.split(/\r?\n/)) {
        const line = sourceLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('```')) continue;
        const match = line.match(/^([^:：|]+)\s*[:：|]\s*([+-]?\d+(?:\.\d+)?)$/);
        if (!match) continue;
        weights[match[1].trim()] = Number(match[2]);
    }
    return weights;
}

export function parseNianNianWorldBibleMarkdown(markdown: string): NianNianWorldBible {
    const seedStatus = parseNianNianStatusBlock(extractFencedBlock(markdown, 'seedStatus'))?.statusPatch;
    const openingStep = parseOpeningStep(extractFencedBlock(markdown, 'openingStep'));
    const hiddenVarsSeed = parseHiddenVarsSeed(extractFencedBlock(markdown, 'hiddenVarsSeed'));
    const opening = openingStep?.sceneText || cleanMarkdownText(extractHeadingSection(markdown, 'opening'));
    const worldStyle = cleanMarkdownText(extractFirstHeadingSection(markdown, ['world_style', '文风']));

    return {
        ...createEmptyWorldBible(),
        theme: cleanMarkdownText(extractHeadingSection(markdown, 'genre')),
        tone: cleanMarkdownText(extractHeadingSection(markdown, 'tone')),
        charIdentity: cleanMarkdownText(extractHeadingSection(markdown, 'char_identity')),
        protagonistIdentity: cleanMarkdownText(extractHeadingSection(markdown, 'mc_identity')),
        opening,
        statusSchema: parseStatusSchema(markdown),
        eventWeights: parseEventWeights(markdown),
        customPrompt: worldStyle,
        worldStyle,
        seedStatus,
        openingStep,
        hiddenVarsSeed,
    };
}

export async function loadNianNianWorldBibleFromMarkdown(
    url = DEFAULT_NIANNIAN_WORLD_PACK_URL,
): Promise<NianNianWorldBible> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load NianNian world pack: ${response.status}`);
    }

    return parseNianNianWorldBibleMarkdown(await response.text());
}
