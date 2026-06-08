/**
 * Trajectory Engine — 人生轨迹 核心逻辑
 * LLM 调用、节点生成、独白生成、窃语回应
 */

import type { CharacterProfile } from '../types';
import type { TrajectoryNode, TrajectoryMood } from '../types/trajectory';
import { buildNodeExtractionPrompt, buildContinueNodeExtractionPrompt, buildMonologuePrompt, buildWhisperResponsePrompt, buildAfterMeetingMonologuePrompt, parseNodeExtractionResponse, buildAfterMeetingNodeExtractionPrompt, parseAfterNodeExtractionResponse, SIGNAL_DECAY_HINT, buildDreamEchoPrompt } from './trajectoryPrompts';
import type { WhisperRecord } from '../types/trajectory';
import { safeResponseJson } from './safeApi';
import { extractThinking } from './thinkingExtractor';
import { saveAllTrajectoryNodes, saveTrajectoryNode, saveTrajectoryMeta, getTrajectoryNodes, getTrajectoryMeta } from './db/trajectoryStore';
import { DB } from './db';
import { safeUUID } from './safeUUID';
import { DREAMWEAVER_SYSTEM } from './dreamweaver';

interface ApiConfig { baseUrl: string; apiKey: string; model: string; }


/** 为「叙事设计」类任务构建 system message（结构化输出） */
const NARRATOR_SYSTEM = DREAMWEAVER_SYSTEM + '在这场梦里，你是一个沉浸在角色世界中的叙事设计师。你的任务是为角色编织真实的人生脉络。只输出JSON数组，不要其他文字。';

/** 为「角色独白」类任务构建 system message（第一人称沉浸） */
const MONOLOGUE_SYSTEM = DREAMWEAVER_SYSTEM + '在这场梦里，你就是这个角色本身。你拥有他所有的记忆、性格和情感。直接输出独白正文，不要跳出角色。';

/** 为「窃语回应」类任务构建 system message（即时反应） */
const WHISPER_SYSTEM = DREAMWEAVER_SYSTEM + `你就是这个角色。有人在跟你说话。

写法要求：
- 禁止文学腔：不用"仿佛""宛如""似乎在诉说""沉淀""萦绕"这类词
- 禁止排比句、长难句、形容词堆砌
- 禁止直接表白心意或说教——情绪要藏在细节里，不要摊开讲
- 话可以说一半就停住，可以欲言又止，可以岔开话题
- 嘴上逞强没关系，但话尾要能让人感觉到一点点柔软或在意
- 一两句话就够，短的

你的回应要让人想反复看，不是因为辞藻华丽，而是因为那种"他好像在意但没说出口"的感觉。
直接输出回应，不加引号。`;



async function callLLM(api: ApiConfig, system: string, user: string, temp = 0.8): Promise<string> {
    return callLLMMultiTurn(api, [{ role: 'system', content: system }, { role: 'user', content: user }], temp);
}

/** Multi-turn LLM call — accepts full messages array */
async function callLLMMultiTurn(api: ApiConfig, messages: { role: string; content: string }[], temp = 0.8): Promise<string> {
    const res = await fetch(`${api.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
        body: JSON.stringify({
            model: api.model,
            messages,
            temperature: temp,
        }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await safeResponseJson(res);
    return extractThinking(data.choices?.[0]?.message?.content || '').content.trim();
}

/** Check if character has at least 1 message (admission gate) */
export async function hasAnyMessages(charId: string): Promise<boolean> {
    const result = await DB.getRecentMessagesWithCount(charId, 1);
    return result.messages.length > 0;
}

/** Get the timestamp of the first message (meeting point) */
export async function getFirstMessageTimestamp(charId: string): Promise<number | undefined> {
    const msgs = await DB.getMessagesByCharId(charId);
    const sorted = msgs.filter(m => m.role === 'user' || m.role === 'assistant').sort((a, b) => a.timestamp - b.timestamp);
    return sorted[0]?.timestamp;
}

/** Generate "before meeting" nodes from character profile */
export async function generateBeforeNodes(char: CharacterProfile, api: ApiConfig): Promise<TrajectoryNode[]> {
    const prompt = buildNodeExtractionPrompt(char);
    const raw = await callLLM(api, NARRATOR_SYSTEM, prompt, 0.7);
    const parsed = parseNodeExtractionResponse(raw, char.id);
    const now = Date.now();
    return parsed.map((p, i) => ({
        ...p,
        id: safeUUID(),
        createdAt: now,
        updatedAt: now,
        sortOrder: i,
    }));
}

/** Generate supplementary "before meeting" nodes that fill age gaps in existing timeline */
export async function generateContinueBeforeNodes(
    char: CharacterProfile, existingBefore: TrajectoryNode[], api: ApiConfig,
): Promise<TrajectoryNode[]> {
    const existingSummary = existingBefore.map(n => ({ age: n.age, title: n.title }));
    const prompt = buildContinueNodeExtractionPrompt(char, existingSummary);
    const raw = await callLLM(api, NARRATOR_SYSTEM, prompt, 0.7);
    const parsed = parseNodeExtractionResponse(raw, char.id);
    const now = Date.now();
    // Filter out any that accidentally repeat existing ages
    const existingAges = new Set(existingBefore.map(n => n.age));
    return parsed
        .filter(p => !existingAges.has(p.age))
        .map((p, i) => ({
            ...p,
            id: safeUUID(),
            createdAt: now,
            updatedAt: now,
            sortOrder: i, // will be renumbered later
        }));
}

/** Generate monologue for a "before meeting" node */
export async function generateMonologue(char: CharacterProfile, node: TrajectoryNode, api: ApiConfig): Promise<string> {
    const prompt = buildMonologuePrompt(char, node);
    return callLLM(api, MONOLOGUE_SYSTEM, prompt, 0.85);
}

/** Generate monologue for an "after meeting" node */
export async function generateAfterMonologue(
    char: CharacterProfile, node: TrajectoryNode, userName: string, api: ApiConfig,
): Promise<string> {
    let memories = '';
    if (node.memorySource === 'vector' && node.memoryTimeRange) {
        try {
            const headers = await DB.getVectorMemoryHeaders(char.id);
            const inRange = headers.filter((h: any) =>
                h.createdAt >= node.memoryTimeRange!.start && h.createdAt <= node.memoryTimeRange!.end
            ).sort((a: any, b: any) => (b.importance || 0) - (a.importance || 0)).slice(0, 5);
            if (inRange.length > 0) {
                const full = await DB.getVectorMemoriesByIds(inRange.map((h: any) => h.id));
                memories = full.map((m: any) => m.content || m.summary || '').filter(Boolean).join('\n---\n');
            }
        } catch (e) { console.warn('[Trajectory] vector memory retrieval failed:', e); }
    }
    const prompt = buildAfterMeetingMonologuePrompt(char, node, userName, memories);
    return callLLM(api, MONOLOGUE_SYSTEM, prompt, 0.85);
}

/** Maximum whisper rounds before time-space turbulence */
export const WHISPER_MAX_ROUNDS = 10;

/** Generate whisper response with multi-turn context */
export async function generateWhisperResponse(
    char: CharacterProfile, node: TrajectoryNode, whisper: string, api: ApiConfig, userName?: string,
    history?: WhisperRecord[],
): Promise<string> {
    const messages: { role: string; content: string }[] = [{ role: 'system', content: WHISPER_SYSTEM }];

    if (history && history.length > 0) {
        // First turn: full scene setup + first whisper
        messages.push({ role: 'user', content: buildWhisperResponsePrompt(char, node, history[0].userWhisper, userName) });
        messages.push({ role: 'assistant', content: history[0].charResponse });
        // Subsequent turns: pure dialogue
        for (let i = 1; i < history.length; i++) {
            messages.push({ role: 'user', content: history[i].userWhisper });
            messages.push({ role: 'assistant', content: history[i].charResponse });
        }
        // Current whisper (round = history.length + 1)
        const currentRound = history.length + 1;
        const currentMsg = currentRound === 9
            ? `${SIGNAL_DECAY_HINT}\n${whisper}`
            : whisper;
        messages.push({ role: 'user', content: currentMsg });
    } else {
        // First whisper ever on this node
        messages.push({ role: 'user', content: buildWhisperResponsePrompt(char, node, whisper, userName) });
    }

    return callLLMMultiTurn(api, messages, 0.8);
}

/** Generate dream echo message for main chat after time-space turbulence */
export async function generateDreamEcho(
    char: CharacterProfile, node: TrajectoryNode, api: ApiConfig, userName: string,
): Promise<string> {
    const prompt = buildDreamEchoPrompt(char, node, userName);
    return callLLM(api, WHISPER_SYSTEM, prompt, 0.85);
}

/** Minimum number of high-importance memories required to trigger after-node generation */
const AFTER_NODE_MEMORY_THRESHOLD = 5;

/** Generate "after meeting" nodes from vector memories */
export async function generateAfterNodes(
    char: CharacterProfile, userName: string, beforeNodeCount: number, api: ApiConfig,
): Promise<TrajectoryNode[]> {
    // Phase 1: Collect top-importance memories
    let headers: { id: string; importance: number; content?: string; title?: string }[] = [];
    try {
        headers = await DB.getVectorMemoryHeaders(char.id);
    } catch (e) {
        console.warn('[Trajectory] Failed to get vector memory headers:', e);
        return [];
    }

    // Sort by importance, take top 15-20
    const sorted = headers
        .filter((h: any) => (h.importance ?? 0) > 0)
        .sort((a: any, b: any) => (b.importance || 0) - (a.importance || 0))
        .slice(0, 20);

    if (sorted.length < AFTER_NODE_MEMORY_THRESHOLD) {
        console.log(`[Trajectory] Only ${sorted.length} memories, below threshold ${AFTER_NODE_MEMORY_THRESHOLD}. Skipping after-node generation.`);
        return [];
    }

    // Phase 1b: Get full content
    let memorySummaries = '';
    try {
        const full = await DB.getVectorMemoriesByIds(sorted.map((h: any) => h.id));
        memorySummaries = full
            .map((m: any, i: number) => `[${i + 1}] ${m.content || m.summary || m.title || ''}`)
            .filter((s: string) => s.length > 5)
            .join('\n---\n');
    } catch (e) {
        console.warn('[Trajectory] Failed to get full memories:', e);
        return [];
    }

    if (!memorySummaries.trim()) return [];

    // Phase 2: LLM structured extraction
    const prompt = buildAfterMeetingNodeExtractionPrompt(char, userName, memorySummaries);
    const raw = await callLLM(api, NARRATOR_SYSTEM, prompt, 0.7);
    const parsed = parseAfterNodeExtractionResponse(raw, char.id, beforeNodeCount);
    const now = Date.now();
    return parsed.map((p, i) => ({
        ...p,
        id: safeUUID(),
        createdAt: now,
        updatedAt: now,
        sortOrder: beforeNodeCount + 100 + i,
    }));
}

/**
 * Initialize trajectory for a character (first visit).
 * Also auto-generates after_meeting nodes if enough vector memories exist.
 */
export async function initTrajectory(
    char: CharacterProfile, api: ApiConfig, userName?: string,
): Promise<TrajectoryNode[]> {
    const beforeNodes = await generateBeforeNodes(char, api);

    // Try to generate after-meeting nodes from vector memories
    let afterNodes: TrajectoryNode[] = [];
    if (userName) {
        try {
            afterNodes = await generateAfterNodes(char, userName, beforeNodes.length, api);
        } catch (e) {
            console.warn('[Trajectory] After-node generation failed (non-fatal):', e);
        }
    }

    const allNodes = [...beforeNodes, ...afterNodes];
    saveAllTrajectoryNodes(char.id, allNodes);
    const meetTs = await getFirstMessageTimestamp(char.id);
    saveTrajectoryMeta({
        charId: char.id,
        lastGeneratedAt: Date.now(),
        meetingPointTimestamp: meetTs,
        totalNodes: allNodes.length,
    });
    return allNodes;
}

/**
 * Regenerate trajectory: re-generate before nodes + vector-sourced after nodes,
 * but preserve user's manually-added after nodes.
 */
export async function regenTrajectory(
    char: CharacterProfile, api: ApiConfig, userName?: string,
): Promise<TrajectoryNode[]> {
    // Preserve manual after nodes
    const existing = getTrajectoryNodes(char.id);
    const manualAfterNodes = existing.filter(
        (n: TrajectoryNode) => n.era === 'after_meeting' && n.memorySource === 'manual'
    );

    const beforeNodes = await generateBeforeNodes(char, api);

    let vectorAfterNodes: TrajectoryNode[] = [];
    if (userName) {
        try {
            vectorAfterNodes = await generateAfterNodes(char, userName, beforeNodes.length, api);
        } catch (e) {
            console.warn('[Trajectory] After-node regen failed (non-fatal):', e);
        }
    }

    // Re-number manual nodes to come after vector ones
    const manualStart = beforeNodes.length + 100 + vectorAfterNodes.length;
    const renumberedManual = manualAfterNodes.map((n: TrajectoryNode, i: number) => ({
        ...n, sortOrder: manualStart + i, updatedAt: Date.now(),
    }));

    const allNodes = [...beforeNodes, ...vectorAfterNodes, ...renumberedManual];
    saveAllTrajectoryNodes(char.id, allNodes);
    const meetTs = await getFirstMessageTimestamp(char.id);
    saveTrajectoryMeta({
        charId: char.id,
        lastGeneratedAt: Date.now(),
        meetingPointTimestamp: meetTs,
        totalNodes: allNodes.length,
    });
    return allNodes;
}

/**
 * Continue trajectory: keep all existing nodes, append supplementary ones.
 * - before_meeting: fill in age gaps the existing timeline hasn't covered
 * - after_meeting: extract from vector memories created after lastGeneratedAt
 */
export async function continueTrajectory(
    char: CharacterProfile, api: ApiConfig, userName?: string,
): Promise<TrajectoryNode[]> {
    const existing = getTrajectoryNodes(char.id);
    const existingBefore = existing.filter(n => n.era === 'before_meeting');
    const existingAfter = existing.filter(n => n.era === 'after_meeting');

    // 1. Supplement before_meeting nodes
    let newBeforeNodes: TrajectoryNode[] = [];
    try {
        newBeforeNodes = await generateContinueBeforeNodes(char, existingBefore, api);
    } catch (e) {
        console.warn('[Trajectory] Continue before-node generation failed (non-fatal):', e);
    }

    // 2. Supplement after_meeting nodes from new memories
    let newAfterNodes: TrajectoryNode[] = [];
    if (userName) {
        const meta = getTrajectoryMeta(char.id);
        const sinceTs = meta?.lastGeneratedAt || 0;

        try {
            // Get vector memories newer than last generation
            let headers: { id: string; importance: number; createdAt?: number }[] = [];
            try { headers = await DB.getVectorMemoryHeaders(char.id); } catch { /* ignore */ }

            const newHeaders = headers
                .filter((h: any) => (h.importance ?? 0) > 0 && (h.createdAt ?? 0) > sinceTs)
                .sort((a: any, b: any) => (b.importance || 0) - (a.importance || 0))
                .slice(0, 15);

            if (newHeaders.length >= 3) {
                const full = await DB.getVectorMemoriesByIds(newHeaders.map((h: any) => h.id));
                const memorySummaries = full
                    .map((m: any, i: number) => `[${i + 1}] ${m.content || m.summary || m.title || ''}`)
                    .filter((s: string) => s.length > 5)
                    .join('\n---\n');

                if (memorySummaries.trim()) {
                    const prompt = buildAfterMeetingNodeExtractionPrompt(char, userName, memorySummaries);
                    const raw = await callLLM(api, NARRATOR_SYSTEM, prompt, 0.7);
                    const parsed = parseAfterNodeExtractionResponse(raw, char.id, existingBefore.length + newBeforeNodes.length);
                    const now = Date.now();
                    // Deduplicate against existing after-node titles
                    const existingTitles = new Set(existingAfter.map(n => n.title));
                    newAfterNodes = parsed
                        .filter(p => !existingTitles.has(p.title))
                        .map((p) => ({
                            ...p,
                            id: safeUUID(),
                            createdAt: now,
                            updatedAt: now,
                            sortOrder: p.sortOrder,
                        }));
                }
            }
        } catch (e) {
            console.warn('[Trajectory] Continue after-node generation failed (non-fatal):', e);
        }
    }

    // 3. Merge: existing + new before (sorted by age) + new after (appended)
    const allBefore = [...existingBefore, ...newBeforeNodes].sort((a, b) => a.age - b.age);
    const allAfter = [...existingAfter, ...newAfterNodes];

    // Renumber sortOrder
    allBefore.forEach((n, i) => { n.sortOrder = i; });
    allAfter.forEach((n, i) => { n.sortOrder = allBefore.length + 100 + i; });

    const allNodes = [...allBefore, ...allAfter];
    saveAllTrajectoryNodes(char.id, allNodes);
    const meetTs = await getFirstMessageTimestamp(char.id);
    saveTrajectoryMeta({
        charId: char.id,
        lastGeneratedAt: Date.now(),
        meetingPointTimestamp: meetTs,
        totalNodes: allNodes.length,
    });
    return allNodes;
}

/** Create a manual "after meeting" node */
export function createManualAfterNode(
    charId: string, title: string, keywords: string, existingCount: number,
): TrajectoryNode {
    const now = Date.now();
    const node: TrajectoryNode = {
        id: safeUUID(),
        charId,
        age: 0,
        title,
        era: 'after_meeting',
        mood: 'nostalgic' as TrajectoryMood,
        keywords: keywords.split(/[,，、\s]+/).filter(Boolean),
        memorySource: 'manual',
        memoryKeywords: keywords,
        sortOrder: existingCount + 100,
        createdAt: now,
        updatedAt: now,
    };
    saveTrajectoryNode(node);
    return node;
}
