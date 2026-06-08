/**
 * CrosstimeApp — 跨时空对话
 * 视图: setup → room → history(只读)
 */
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import type { TrajectoryNode } from '../../types/trajectory';
import type { CrosstimeParticipant, CrosstimeRoom, CrosstimeMessage } from '../../types/crosstime';
import { getTrajectoryNodes } from '../../utils/db/trajectoryStore';
import {
    getCrosstimeRooms, saveCrosstimeRoom, deleteCrosstimeRoom,
    getCrosstimeMessages, saveCrosstimeMessage, deleteCrosstimeMessagesByIds,
} from '../../utils/db/crosstimeStore';
import {
    buildGroupedParticipantContexts, buildCrosstimeDirectorPrompt,
    formatCrosstimeMessages, findSameCharCollisions,
    checkNeedsSummary, buildCrosstimeSummaryPrompt,
    CROSSTIME_SUMMARY_PARTICIPANT_ID, parseSummaryContent,
    buildWhisperReplyPrompt,
} from '../../utils/crosstimePrompts';
import { safeResponseJson } from '../../utils/safeApi';
import { selectSecondaryApiConfig } from '../../utils/runtimeConfig';
import { extractThinking } from '../../utils/thinkingExtractor';
import { safeUUID } from '../../utils/safeUUID';
import { DREAMWEAVER_SYSTEM } from '../../utils/dreamweaver';
import './crosstime.css';

type View = 'setup' | 'room' | 'history';
type ModalStep = 'none' | 'pick_char' | 'pick_slice';
type UserInputKind = 'speech' | 'action';
interface CrosstimeInputSegment {
    id: string;
    kind: UserInputKind;
    text: string;
}

const MAX_PARTICIPANTS = 5;
const CROSSTIME_MAX_TOKENS = 65536;
const getUserInputKindLabel = (kind?: UserInputKind): string =>
    kind === 'action' ? '动作' : '发言';

const createInputSegment = (kind: UserInputKind = 'speech'): CrosstimeInputSegment => ({
    id: `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    text: '',
});

const sanitizeInputSegments = (segments: CrosstimeInputSegment[]): Array<Omit<CrosstimeInputSegment, 'id'>> =>
    segments
        .map(segment => ({
            kind: segment.kind,
            text: segment.text.trim(),
        }))
        .filter(segment => segment.text.length > 0);

const getParticipantSliceKey = (participant: CrosstimeParticipant): string =>
    participant.timeSlice === 'current'
        ? 'current'
        : `trajectory:${participant.trajectoryNodeId || ''}`;

const getTrajectorySliceLabel = (node: TrajectoryNode): string =>
    node.era === 'after_meeting'
        ? `世界线 · ${node.title}`
        : `相遇前 · ${node.title}`;

const getTrajectorySliceDetail = (node: TrajectoryNode): string =>
    node.era === 'after_meeting'
        ? '相遇后 · 认识你'
        : `${node.age}岁 · 不认识你`;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const stripCodeFence = (value: string): string =>
    value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

const stripWrappingQuotes = (value: string): string => {
    let output = value.trim();
    const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['“', '”'], ['「', '」']];
    let changed = true;
    while (changed) {
        changed = false;
        for (const [left, right] of pairs) {
            if (output.startsWith(left) && output.endsWith(right) && output.length >= left.length + right.length) {
                output = output.slice(left.length, -right.length).trim();
                changed = true;
            }
        }
    }
    return output;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readWhisperText = (value: unknown): string | null => {
    if (typeof value === 'string') return value;
    if (!isRecord(value)) return null;
    for (const key of ['content', 'text', 'message', 'reply']) {
        const fieldValue = value[key];
        if (typeof fieldValue === 'string') return fieldValue;
    }
    return null;
};

const cleanWhisperBubble = (value: string, prefixes: string[]): string => {
    let output = stripWrappingQuotes(stripCodeFence(value));
    for (const prefix of prefixes.filter(Boolean)) {
        output = output.replace(new RegExp(`^\\s*${escapeRegExp(prefix)}\\s*[：:]\\s*`), '');
    }
    output = output.replace(/^\s*[-*•]\s*/, '');
    return stripWrappingQuotes(output).trim();
};

const parseWhisperReplyBubbles = (raw: string, prefixes: string[]): string[] => {
    const source = stripCodeFence(raw);
    const candidates: string[] = [];
    const arrayStart = source.indexOf('[');
    const arrayEnd = source.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        candidates.push(source.slice(arrayStart, arrayEnd + 1));
    }
    const objectStart = source.indexOf('{');
    const objectEnd = source.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        candidates.push(source.slice(objectStart, objectEnd + 1));
    }

    for (const candidate of candidates) {
        try {
            const parsed: unknown = JSON.parse(candidate);
            let items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            if (isRecord(parsed)) {
                for (const key of ['messages', 'replies', 'output']) {
                    if (Array.isArray(parsed[key])) {
                        items = parsed[key] as unknown[];
                        break;
                    }
                }
            }
            const bubbles = items
                .map(item => readWhisperText(item))
                .filter((item): item is string => Boolean(item?.trim()))
                .map(item => cleanWhisperBubble(item, prefixes))
                .filter(Boolean);
            if (bubbles.length > 0) return bubbles;
        } catch {
            // Fall through to plain text splitting.
        }
    }

    return stripWrappingQuotes(source)
        .split(/\n+/)
        .map(line => cleanWhisperBubble(line, prefixes))
        .filter(Boolean);
};

const CrosstimeApp: React.FC = () => {
    const { closeApp, characters, apiConfig, addToast, userProfile } = useOS();

    // ── View ──
    const [view, setView] = useState<View>('setup');

    // ── Setup State ──
    const [participants, setParticipants] = useState<CrosstimeParticipant[]>([]);
    const [modalStep, setModalStep] = useState<ModalStep>('none');
    const [pickedChar, setPickedChar] = useState<CharacterProfile | null>(null);
    const [pickedCharNodes, setPickedCharNodes] = useState<TrajectoryNode[]>([]);

    // ── Room State ──
    const [room, setRoom] = useState<CrosstimeRoom | null>(null);
    const [messages, setMessages] = useState<CrosstimeMessage[]>([]);
    const [inputSegments, setInputSegments] = useState<CrosstimeInputSegment[]>(() => [createInputSegment('speech')]);
    const [whisperInput, setWhisperInput] = useState('');
    const [whisperInputKind, setWhisperInputKind] = useState<UserInputKind>('speech');
    const [isTyping, setIsTyping] = useState(false);
    const [privateTarget, setPrivateTarget] = useState<CrosstimeParticipant | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── History State ──
    const [historyRooms, setHistoryRooms] = useState<CrosstimeRoom[]>([]);
    const [viewingRoom, setViewingRoom] = useState<CrosstimeRoom | null>(null);
    const [viewingMessages, setViewingMessages] = useState<CrosstimeMessage[]>([]);

    // Load history on setup view
    useEffect(() => {
        if (view === 'setup') setHistoryRooms(getCrosstimeRooms());
    }, [view]);

    // Auto scroll
    useLayoutEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages.length, isTyping]);

    // ── Helpers ──
    const getCharForParticipant = (p: CrosstimeParticipant) => characters.find(c => c.id === p.charId);
    const getNodeForParticipant = (p: CrosstimeParticipant): TrajectoryNode | undefined => {
        if (p.timeSlice !== 'trajectory' || !p.trajectoryNodeId) return undefined;
        return getTrajectoryNodes(p.charId).find(n => n.id === p.trajectoryNodeId);
    };
    const getTimelineLabel = (p?: CrosstimeParticipant | null): string => {
        if (!p) return '?';
        if (p.timeSlice === 'current') return '现在';
        const node = getNodeForParticipant(p);
        if (node) return getTrajectorySliceLabel(node);
        if (p.label.startsWith('相遇后 · ')) return p.label.replace('相遇后 · ', '世界线 · ');
        if (/^\d+岁 · /.test(p.label)) return p.label.replace(/^\d+岁 · /, '相遇前 · ');
        return p.label || (p.era === 'before_meeting' ? '相遇前' : '世界线');
    };
    const getTimelineDetail = (p?: CrosstimeParticipant | null): string => {
        if (!p) return '';
        if (p.timeSlice === 'current') return '完整记忆 · 认识你';
        const node = getNodeForParticipant(p);
        if (node) return getTrajectorySliceDetail(node);
        return p.era === 'before_meeting' ? '不认识你' : '认识你';
    };
    const openWhisperTarget = (target: CrosstimeParticipant) => {
        setPrivateTarget(target);
        setWhisperInput('');
        setWhisperInputKind('speech');
    };
    const closeWhisper = () => {
        setPrivateTarget(null);
        setWhisperInput('');
        setWhisperInputKind('speech');
    };
    const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    const whisperPlaceholder = whisperInputKind === 'action'
        ? '只让他察觉的小动作...'
        : '贴近他耳边说...';
    const sendableInputSegments = sanitizeInputSegments(inputSegments);
    const hasPublicInput = sendableInputSegments.length > 0;
    const updateInputSegment = (id: string, updates: Partial<Omit<CrosstimeInputSegment, 'id'>>) => {
        setInputSegments(prev => prev.map(segment => (
            segment.id === id ? { ...segment, ...updates } : segment
        )));
    };
    const addInputSegment = (kind: UserInputKind) => {
        setInputSegments(prev => [...prev, createInputSegment(kind)]);
    };
    const removeInputSegment = (id: string) => {
        setInputSegments(prev => (
            prev.length <= 1
                ? [{ ...prev[0], text: '' }]
                : prev.filter(segment => segment.id !== id)
        ));
    };
    const selectedBaseCharId = participants[0]?.charId;
    const selectedBaseChar = selectedBaseCharId
        ? characters.find(c => c.id === selectedBaseCharId)
        : null;
    const isSliceAlreadySelected = (charId: string, slice: 'current' | TrajectoryNode): boolean => {
        const sliceKey = slice === 'current' ? 'current' : `trajectory:${slice.id}`;
        return participants.some(p => p.charId === charId && getParticipantSliceKey(p) === sliceKey);
    };
    const canAddMoreSlices = selectedBaseChar
        ? !isSliceAlreadySelected(selectedBaseChar.id, 'current')
            || getTrajectoryNodes(selectedBaseChar.id).some(node => !isSliceAlreadySelected(selectedBaseChar.id, node))
        : true;
    const canSelectMoreSlices = participants.length < MAX_PARTICIPANTS && canAddMoreSlices;
    const setupSliceCount = selectedBaseChar ? getTrajectoryNodes(selectedBaseChar.id).length + 1 : 0;
    const setupAccessText = selectedBaseChar
        ? `${setupSliceCount} 条时间切片可接入`
        : '相遇前 · 相遇后 · NOW 可接入';
    const startDisabled = participants.length < 2 || !apiConfig?.apiKey;

    // ── Setup: Add Participant ──
    const openAddParticipant = () => {
        if (selectedBaseChar) {
            setPickedChar(selectedBaseChar);
            setPickedCharNodes(getTrajectoryNodes(selectedBaseChar.id));
            setModalStep('pick_slice');
            return;
        }
        setModalStep('pick_char');
    };

    const handlePickChar = (c: CharacterProfile) => {
        if (selectedBaseCharId && c.id !== selectedBaseCharId) {
            addToast('对影会围绕同一个角色展开', 'info');
            return;
        }
        setPickedChar(c);
        const nodes = getTrajectoryNodes(c.id);
        setPickedCharNodes(nodes);
        setModalStep('pick_slice');
    };

    const handlePickSlice = (slice: 'current' | TrajectoryNode) => {
        if (!pickedChar) return;
        if (isSliceAlreadySelected(pickedChar.id, slice)) {
            addToast('这条时间线已经在房间里了', 'info');
            return;
        }
        const p: CrosstimeParticipant = slice === 'current'
            ? {
                id: safeUUID(),
                charId: pickedChar.id,
                timeSlice: 'current',
                label: '现在',
            }
            : {
                id: safeUUID(),
                charId: pickedChar.id,
                timeSlice: 'trajectory',
                trajectoryNodeId: slice.id,
                age: slice.age,
                label: getTrajectorySliceLabel(slice),
                era: slice.era,
            };
        setParticipants(prev => [...prev, p]);
        setModalStep('none');
        setPickedChar(null);
    };

    const removeParticipant = (id: string) => {
        setParticipants(prev => prev.filter(p => p.id !== id));
    };

    // ── Start Room ──
    const handleStartRoom = () => {
        if (participants.length < 2) { addToast('至少需要 2 条时间线', 'error'); return; }
        if (!apiConfig?.apiKey) { addToast('请先配置 API', 'error'); return; }
        const uniqueCharIds = new Set(participants.map(p => p.charId));
        if (uniqueCharIds.size > 1) {
            addToast('请只保留同一个角色的不同时间线', 'error');
            return;
        }

        // Auto-generate room name
        const baseChar = characters.find(ch => ch.id === participants[0]?.charId);
        const roomName = `${baseChar?.name || '角色'} · ${participants.map(p => getTimelineLabel(p)).join(' × ')}`;

        const newRoom: CrosstimeRoom = {
            id: safeUUID(),
            name: roomName,
            participants: [...participants],
            userMode: 'online',
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
        };
        setRoom(newRoom);
        setMessages([]);
        setView('room');
        saveCrosstimeRoom(newRoom);
    };

    // ── Toggle Mode ──
    const toggleMode = () => {
        if (!room) return;
        const newMode = room.userMode === 'online' ? 'invisible' : 'online';
        const updated = { ...room, userMode: newMode as 'online' | 'invisible' };
        setRoom(updated);
        saveCrosstimeRoom(updated);
        setPrivateTarget(null);
        setWhisperInput('');
        setWhisperInputKind('speech');
    };

    // ── Send Message ──
    const handleSend = async () => {
        if (!room || isTyping) return;

        if (privateTarget) {
            if (!whisperInput.trim()) return;
            const text = whisperInput.trim();
            const activeInputKind = whisperInputKind;
            setWhisperInput('');

            saveCrosstimeMessage({
                roomId: room.id,
                participantId: 'user',
                charId: 'user',
                role: 'user',
                content: text,
                userInputKind: activeInputKind,
                isPrivate: true,
                privateTargetId: privateTarget.id,
                timestamp: Date.now(),
            });

            setMessages(getCrosstimeMessages(room.id));
            // 悄悄话 → 只触发目标角色单独回复
            const target = privateTarget;
            await triggerWhisperReply(room, target, text, activeInputKind);
            return;
        }

        const publicSegments = sanitizeInputSegments(inputSegments);
        if (publicSegments.length === 0) return;
        const batchId = publicSegments.length > 1 ? safeUUID() : undefined;
        const now = Date.now();
        setInputSegments([createInputSegment('speech')]);

        publicSegments.forEach((segment, index) => {
            saveCrosstimeMessage({
                roomId: room.id,
                participantId: 'user',
                charId: 'user',
                role: 'user',
                content: segment.text,
                userInputKind: segment.kind,
                ...(batchId ? {
                    userInputBatchId: batchId,
                    userInputBatchIndex: index + 1,
                    userInputBatchSize: publicSegments.length,
                } : {}),
                timestamp: now + index,
            });
        });

        setMessages(getCrosstimeMessages(room.id));
        // 公开输入 → 多个气泡作为同一轮现场刺激，再触发导演
        await triggerDirector(room);
    };

    // ── Whisper Reply (1-on-1 private response) ──
    const triggerWhisperReply = useCallback(async (
        currentRoom: CrosstimeRoom, target: CrosstimeParticipant, whisperText: string, whisperKind: UserInputKind = 'speech',
    ) => {
        if (!apiConfig?.apiKey) return;
        setIsTyping(true);

        try {
            const char = characters.find(c => c.id === target.charId);
            if (!char) throw new Error('Character not found');

            const displayName = `${char.name}·${target.label}`;

            // Build single-participant context
            const participantContext = buildGroupedParticipantContexts(
                [target], characters, userProfile,
                getNodeForParticipant, {},
            );

            // Collect whisper history between user and this target
            const allMsgs = getCrosstimeMessages(currentRoom.id);
            const whisperHistory = allMsgs.filter(m =>
                m.isPrivate && (
                    (m.role === 'user' && m.privateTargetId === target.id) ||
                    (m.role === 'assistant' && m.participantId === target.id && m.privateTargetId === 'user')
                ),
            ).slice(-20); // Keep last 20 whisper messages for context

            // Exclude the message we just sent (it's the current whisper)
            const historyWithoutCurrent = whisperHistory.slice(0, -1);

            const prompt = buildWhisperReplyPrompt(
                participantContext, historyWithoutCurrent, whisperText, userProfile, displayName, whisperKind,
            );

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [
                        {
                            role: 'system',
                            content: DREAMWEAVER_SYSTEM + `你现在是${displayName}。
有人靠近你，压低声音，只对你说了一句话。
按这一刻的本能反应输出 JSON 数组。
不要解释，不要总结，不要加角色名前缀，不要输出 JSON 以外的任何内容。`,
                        },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.85,
                    max_tokens: CROSSTIME_MAX_TOKENS,
                }),
            });

            if (!response.ok) throw new Error('Whisper reply failed');
            const data = await safeResponseJson(response);
            let replyText = data.choices?.[0]?.message?.content || '';
            if (data.choices?.[0]?.finish_reason === 'length') {
                console.warn('[Crosstime] Whisper reply reached max token limit:', CROSSTIME_MAX_TOKENS);
            }

            // Strip thinking tags if present
            const extracted = extractThinking(replyText);
            replyText = extracted.content.trim();

            const replyBubbles = parseWhisperReplyBubbles(replyText, [displayName, char.name, target.label]);

            for (const bubble of replyBubbles) {
                saveCrosstimeMessage({
                    roomId: currentRoom.id,
                    participantId: target.id,
                    charId: target.charId,
                    role: 'assistant',
                    content: bubble,
                    isPrivate: true,
                    privateTargetId: 'user',
                    timestamp: Date.now(),
                });
                await new Promise(resolve => setTimeout(resolve, 35));
            }

            setMessages(getCrosstimeMessages(currentRoom.id));
        } catch (e: any) {
            console.error('[Crosstime] Whisper reply error:', e);
            addToast('悄悄话回复失败: ' + (e.message || ''), 'error');
        } finally {
            setIsTyping(false);
        }
    }, [apiConfig, characters, userProfile, addToast]);

    // ── Director ──
    const triggerDirector = useCallback(async (currentRoom: CrosstimeRoom) => {
        if (!apiConfig?.apiKey) return;
        setIsTyping(true);

        try {
            const allMsgs = getCrosstimeMessages(currentRoom.id);

            // Read per-participant summaries from latest summary message
            const latestSummaryMsg = allMsgs.filter(m => m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID).pop();
            const summaryMap = latestSummaryMsg ? parseSummaryContent(latestSummaryMsg.content) : {};

            // Build grouped participant contexts (same char shares base, only deltas per slice)
            const participantContexts = buildGroupedParticipantContexts(
                currentRoom.participants, characters, userProfile,
                getNodeForParticipant, summaryMap,
            );
            const participantList = currentRoom.participants
                .map(p => {
                    const char = characters.find(c => c.id === p.charId);
                    return char ? { pid: p.id, displayName: `${char.name}·${p.label}`, charId: p.charId } : null;
                })
                .filter(Boolean) as { pid: string; displayName: string; charId: string }[];

            const recentMsgsStr = formatCrosstimeMessages(allMsgs, currentRoom.participants, characters, userProfile);
            const collisions = findSameCharCollisions(currentRoom.participants);

            const prompt = buildCrosstimeDirectorPrompt(
                participantContexts, participantList, recentMsgsStr,
                userProfile, currentRoom.userMode, collisions, characters,
            );

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [
                        { role: 'system', content: DREAMWEAVER_SYSTEM + '你是跨时空对话的导演。严格输出 JSON。' },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.9,
                    max_tokens: CROSSTIME_MAX_TOKENS,
                }),
            });

            if (!response.ok) throw new Error('Director Failed');
            const data = await safeResponseJson(response);
            if (data.choices?.[0]?.finish_reason === 'length') {
                console.warn('[Crosstime] Director reached max token limit:', CROSSTIME_MAX_TOKENS);
            }
            let jsonStr = data.choices[0].message.content;

            // Parse JSON
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            const fb = jsonStr.indexOf('[');
            const lb = jsonStr.lastIndexOf(']');
            if (fb !== -1 && lb !== -1) jsonStr = jsonStr.substring(fb, lb + 1);

            let actions: { participantId: string; content: string }[] = [];
            try {
                actions = JSON.parse(jsonStr);
                if (!Array.isArray(actions)) actions = [];
            } catch {
                // Fallback: regex 逐个提取 JSON 对象
                const regex = /"participantId"\s*:\s*"([^"]+)"[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
                let match;
                while ((match = regex.exec(jsonStr)) !== null) {
                    actions.push({ participantId: match[1], content: match[2].replace(/\\n/g, '\n').replace(/\\"/g, '"') });
                }
                if (actions.length > 0) console.warn('[Crosstime] JSON parse failed, regex fallback extracted', actions.length, 'actions');
                else console.error('[Crosstime] Both JSON and regex parse failed:', jsonStr);
            }

            // Execute actions
            for (const action of actions) {
                const targetP = currentRoom.participants.find(p => p.id === action.participantId);
                if (!targetP) continue;

                // Split by newlines for bubble splitting
                const lines = action.content.split('\n').map((l: string) => l.trim()).filter(Boolean);
                for (const line of lines) {
                    saveCrosstimeMessage({
                        roomId: currentRoom.id,
                        participantId: targetP.id,
                        charId: targetP.charId,
                        role: 'assistant',
                        content: line,
                        timestamp: Date.now(),
                    });
                    await new Promise(r => setTimeout(r, 50)); // Slight delay for timestamp ordering
                }
            }

            setMessages(getCrosstimeMessages(currentRoom.id));

            // Update room
            const updatedRoom = { ...currentRoom, lastActiveAt: Date.now() };
            setRoom(updatedRoom);
            saveCrosstimeRoom(updatedRoom);

            // Trigger auto-summary in background
            void maybeTriggerSummary(updatedRoom);
        } catch (e: any) {
            console.error('[Crosstime] Director error:', e);
            addToast('对话生成失败: ' + (e.message || ''), 'error');
        } finally {
            setIsTyping(false);
        }
    }, [apiConfig, characters, userProfile, addToast]);

    // ── Auto Summary ──
    const summaryRunningRef = useRef(false);
    const maybeTriggerSummary = useCallback(async (currentRoom: CrosstimeRoom) => {
        if (summaryRunningRef.current) return;
        const allMsgs = getCrosstimeMessages(currentRoom.id);
        const check = checkNeedsSummary(allMsgs);
        if (!check) return;

        const secondaryConfig = selectSecondaryApiConfig();
        const summaryApi = (secondaryConfig?.baseUrl && secondaryConfig?.apiKey)
            ? secondaryConfig
            : apiConfig;
        if (!summaryApi?.baseUrl || !summaryApi?.apiKey) return;

        summaryRunningRef.current = true;
        try {
            const prompt = buildCrosstimeSummaryPrompt(
                check.messagesToSummarize,
                currentRoom.participants, characters, userProfile,
                check.existingSummaries,
            );

            const response = await fetch(`${summaryApi.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${summaryApi.apiKey}` },
                body: JSON.stringify({
                    model: summaryApi.model || apiConfig?.model,
                    messages: [
                        { role: 'system', content: '你负责为跨时空对话中的每个参与者分别整理回忆。严格输出 JSON。' },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.4,
                    max_tokens: CROSSTIME_MAX_TOKENS,
                }),
            });

            if (!response.ok) throw new Error('Summary API failed');
            const data = await safeResponseJson(response);
            if (data.choices?.[0]?.finish_reason === 'length') {
                console.warn('[Crosstime] Summary reached max token limit:', CROSSTIME_MAX_TOKENS);
            }
            const raw = data.choices?.[0]?.message?.content || '';
            const extracted = extractThinking(raw);
            let jsonStr = extracted.content.trim();

            // Parse JSON from response
            jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
            const fb = jsonStr.indexOf('{');
            const lb = jsonStr.lastIndexOf('}');
            if (fb !== -1 && lb !== -1) jsonStr = jsonStr.substring(fb, lb + 1);

            // Validate it's a proper per-participant map
            const parsed = JSON.parse(jsonStr);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error('Summary output is not a valid JSON object');
            }

            saveCrosstimeMessage({
                roomId: currentRoom.id,
                participantId: CROSSTIME_SUMMARY_PARTICIPANT_ID,
                charId: '__system__',
                role: 'system',
                content: JSON.stringify(parsed),
                timestamp: Date.now(),
            });
            // 释放已被总结的旧消息
            const idsToDelete = check.messagesToSummarize.map(m => m.id);
            deleteCrosstimeMessagesByIds(currentRoom.id, idsToDelete);
            console.log('[Crosstime] Per-participant summary saved:', Object.keys(parsed), '| cleaned', idsToDelete.length, 'old messages');
        } catch (e) {
            console.warn('[Crosstime] Auto-summary failed:', e);
        } finally {
            summaryRunningRef.current = false;
        }
    }, [apiConfig, characters, userProfile]);

    // ── Exit Room ──
    const handleExitRoom = () => {
        setView('setup');
        setRoom(null);
        setMessages([]);
        setParticipants([]);
        setPrivateTarget(null);
        setInputSegments([createInputSegment('speech')]);
        setWhisperInput('');
        setWhisperInputKind('speech');
    };

    // ── View History ──
    const handleViewHistory = (r: CrosstimeRoom) => {
        setViewingRoom(r);
        setViewingMessages(getCrosstimeMessages(r.id));
        setView('history');
    };

    const handleDeleteHistory = (e: React.MouseEvent, roomId: string) => {
        e.stopPropagation();
        deleteCrosstimeRoom(roomId);
        setHistoryRooms(prev => prev.filter(r => r.id !== roomId));
        addToast('记录已删除', 'info');
    };

    // ═══════════════════════════════
    //  RENDER: History (readonly)
    // ═══════════════════════════════
    if (view === 'history' && viewingRoom) {
        return (
            <div className="crosstime-app">
                <div className="crosstime-header">
                    <button className="crosstime-header-back" onClick={() => { setView('setup'); setViewingRoom(null); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div className="crosstime-header-text">
                        <div className="crosstime-header-title">{viewingRoom.name}</div>
                        <div className="crosstime-header-subtitle">{new Date(viewingRoom.createdAt).toLocaleDateString()} · 只读</div>
                    </div>
                </div>
                <div className="crosstime-chat-scroll">
                    {viewingMessages.map(m => {
                        if (m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID) return null;
                        if (m.isPrivate) return null;
                        const p = viewingRoom.participants.find(pp => pp.id === m.participantId);
                        const char = p ? characters.find(c => c.id === p.charId) : null;
                        const isUser = m.role === 'user';
                        const userKind = isUser ? getUserInputKindLabel(m.userInputKind) : '';
                        return (
                            <div key={m.id} className={`crosstime-msg ${isUser ? 'crosstime-msg--user' : ''} ${m.userInputKind === 'action' ? 'crosstime-msg--user-action' : ''} ${m.isPrivate ? 'crosstime-msg--private' : ''}`}>
                                <img className={`crosstime-msg-avatar ${p?.timeSlice === 'trajectory' ? 'crosstime-msg-avatar--past' : ''}`}
                                     src={isUser ? userProfile.avatar : (char?.avatar || '')} alt="" />
                                <div className="crosstime-msg-body">
                                    <div className="crosstime-msg-name">{isUser ? userProfile.name : getTimelineLabel(p)}{isUser && <span className="crosstime-msg-kind"> · {userKind}</span>}</div>
                                    <div className="crosstime-msg-bubble">{m.content}</div>
                                </div>
                            </div>
                        );
                    })}
                    {viewingMessages.length === 0 && (
                        <div className="crosstime-empty">
                            <div className="crosstime-empty-title">没有对话记录</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ═══════════════════════════════
    //  RENDER: Room
    // ═══════════════════════════════
    if (view === 'room' && room) {
        const isInvisible = room.userMode === 'invisible';
        const whisperTargetChar = privateTarget ? getCharForParticipant(privateTarget) : null;
        const whisperMessages = privateTarget ? messages.filter(m =>
            m.isPrivate && (
                (m.role === 'user' && m.privateTargetId === privateTarget.id) ||
                (m.role === 'assistant' && m.participantId === privateTarget.id && m.privateTargetId === 'user')
            ),
        ) : [];
        return (
            <div className="crosstime-app">
                {/* Header */}
                <div className="crosstime-header">
                    <button className="crosstime-header-back" onClick={handleExitRoom}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div className="crosstime-header-text">
                        <div className="crosstime-header-title">对影</div>
                        <div className="crosstime-header-subtitle crosstime-header-subtitle--script">举杯邀明月，对影成几人</div>
                    </div>
                    <button className={`crosstime-header-mode-btn ${isInvisible ? 'crosstime-header-mode-btn--invisible' : ''}`} onClick={toggleMode}>
                        {isInvisible ? '隐身中' : '现身中'}
                    </button>
                </div>

                {/* Timeline bar */}
                <div className="crosstime-timeline-rail">
                    <div className="crosstime-timeline-track" />
                    {room.participants.map((p, index) => {
                        const char = getCharForParticipant(p);
                        return (
                            <button key={p.id}
                                    type="button"
                                    className={`crosstime-timeline-node ${privateTarget?.id === p.id ? 'crosstime-timeline-node--active' : ''}`}
                                    onClick={() => !isInvisible && !isTyping && openWhisperTarget(p)}
                                    disabled={isInvisible || isTyping}>
                                <span className="crosstime-timeline-avatar-wrap">
                                    <img className={`crosstime-timeline-avatar ${p.timeSlice === 'trajectory' ? 'crosstime-timeline-avatar--past' : ''}`}
                                         src={char?.avatar || ''} alt="" />
                                    <span className="crosstime-timeline-index">{index + 1}</span>
                                </span>
                                <span className="crosstime-timeline-label">{getTimelineLabel(p)}</span>
                                <span className="crosstime-timeline-detail">{getTimelineDetail(p)}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Invisible banner */}
                {isInvisible && (
                    <div className="crosstime-invisible-banner">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        你正在隐身，char 不能发现你的存在。
                    </div>
                )}

                {/* Chat */}
                <div className="crosstime-chat-scroll" ref={scrollRef}>
                    {messages.map(m => {
                        // Skip internal summary messages
                        if (m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID) return null;
                        if (m.isPrivate) return null;
                        const p = room.participants.find(pp => pp.id === m.participantId);
                        const char = p ? characters.find(c => c.id === p.charId) : null;
                        const isUser = m.role === 'user';
                        const userKind = isUser ? getUserInputKindLabel(m.userInputKind) : '';
                        return (
                            <div key={m.id} className={`crosstime-msg ${isUser ? 'crosstime-msg--user' : ''} ${m.userInputKind === 'action' ? 'crosstime-msg--user-action' : ''} ${m.isPrivate ? 'crosstime-msg--private' : ''}`}>
                                <img className={`crosstime-msg-avatar ${p?.timeSlice === 'trajectory' ? 'crosstime-msg-avatar--past' : ''}`}
                                     src={isUser ? userProfile.avatar : (char?.avatar || '')} alt="" />
                                <div className="crosstime-msg-body">
                                    <div className="crosstime-msg-name">{isUser ? userProfile.name : getTimelineLabel(p)}{isUser && <span className="crosstime-msg-kind"> · {userKind}</span>}</div>
                                    <div className="crosstime-msg-bubble">{m.content}</div>
                                </div>
                            </div>
                        );
                    })}
                    {isTyping && !privateTarget && (
                        <div className="crosstime-typing">
                            <div className="crosstime-typing-dots"><span/><span/><span/></div>
                            对话生成中…
                        </div>
                    )}
                </div>

                {/* Bottom bar */}
                {isInvisible ? (
                    <div className="crosstime-invisible-bar">
                        <button className="crosstime-invisible-btn" onClick={() => triggerDirector(room)} disabled={isTyping}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h11" />
                                <path d="m13 7 5 5-5 5" />
                                <path d="M4 5.5c4.8-2 11.2-2 16 0" opacity="0.45" />
                            </svg>
                            推进对话
                        </button>
                        <button className="crosstime-invisible-btn crosstime-invisible-btn--appear" onClick={toggleMode}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                                <circle cx="12" cy="12" r="2.5" />
                            </svg>
                            现身
                        </button>
                    </div>
                ) : (
                    <div className="crosstime-bottom-bar">
                        <div className="crosstime-composer">
                            <div className="crosstime-input-segment-list">
                                {inputSegments.map(segment => (
                                    <div key={segment.id} className={`crosstime-input-segment crosstime-input-segment--${segment.kind}`}>
                                        <div className="crosstime-input-segment-head">
                                            <div className="crosstime-input-mode" role="tablist" aria-label="输入类型">
                                                <button
                                                    type="button"
                                                    className={`crosstime-input-mode-btn ${segment.kind === 'speech' ? 'crosstime-input-mode-btn--active' : ''}`}
                                                    onClick={() => updateInputSegment(segment.id, { kind: 'speech' })}
                                                    disabled={isTyping}>
                                                    说话
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`crosstime-input-mode-btn ${segment.kind === 'action' ? 'crosstime-input-mode-btn--active' : ''}`}
                                                    onClick={() => updateInputSegment(segment.id, { kind: 'action' })}
                                                    disabled={isTyping}>
                                                    动作
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                className="crosstime-input-remove"
                                                onClick={() => removeInputSegment(segment.id)}
                                                disabled={isTyping}
                                                aria-label={inputSegments.length > 1 ? '删除这一段' : '清空这一段'}
                                                title={inputSegments.length > 1 ? '删除这一段' : '清空这一段'}>
                                                ×
                                            </button>
                                        </div>
                                        <textarea className="crosstime-input"
                                                  placeholder={segment.kind === 'action' ? '描述一个动作...' : '说一句话...'}
                                                  value={segment.text}
                                                  onChange={e => updateInputSegment(segment.id, { text: e.target.value })}
                                                  onKeyDown={handleComposerKeyDown}
                                                  disabled={isTyping}
                                                  rows={1} />
                                    </div>
                                ))}
                            </div>
                            <div className="crosstime-input-actions">
                                <button type="button" className="crosstime-input-add-btn" onClick={() => addInputSegment('speech')} disabled={isTyping}>
                                    + 说话
                                </button>
                                <button type="button" className="crosstime-input-add-btn" onClick={() => addInputSegment('action')} disabled={isTyping}>
                                    + 动作
                                </button>
                            </div>
                        </div>
                        {hasPublicInput ? (
                            <button className="crosstime-send-btn" onClick={handleSend} disabled={isTyping}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                            </button>
                        ) : (
                            <button className="crosstime-director-btn" onClick={() => triggerDirector(room)} disabled={isTyping} title="让现场自然推进一轮">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h11" />
                                    <path d="m13 7 5 5-5 5" />
                                </svg>
                                推进现场
                            </button>
                        )}
                    </div>
                )}

                {privateTarget && !isInvisible && (
                    <div className="crosstime-whisper-overlay" onClick={closeWhisper}>
                        <div className="crosstime-whisper-panel" onClick={e => e.stopPropagation()}>
                            <div className="crosstime-whisper-header">
                                <div>
                                    <div className="crosstime-whisper-title">悄悄话</div>
                                    <div className="crosstime-whisper-desc">这里只有你和这条时间线。</div>
                                </div>
                                <button className="crosstime-whisper-close" onClick={closeWhisper}>×</button>
                            </div>

                            <div className="crosstime-whisper-pair">
                                <div className="crosstime-whisper-person">
                                    <img src={userProfile.avatar} alt="" />
                                    <span>{userProfile.name}</span>
                                </div>
                                <div className="crosstime-whisper-link" />
                                <div className="crosstime-whisper-person">
                                    <img className={privateTarget.timeSlice === 'trajectory' ? 'crosstime-timeline-avatar--past' : ''}
                                         src={whisperTargetChar?.avatar || ''} alt="" />
                                    <span>{getTimelineLabel(privateTarget)}</span>
                                </div>
                            </div>

                            <div className="crosstime-whisper-log">
                                {whisperMessages.length === 0 ? (
                                    <div className="crosstime-whisper-empty">还没有悄悄话。</div>
                                ) : whisperMessages.map(m => {
                                    const isUserWhisper = m.role === 'user';
                                    const userKind = isUserWhisper ? getUserInputKindLabel(m.userInputKind) : '';
                                    return (
                                        <div key={m.id} className={`crosstime-whisper-msg ${isUserWhisper ? 'crosstime-whisper-msg--user' : ''} ${m.userInputKind === 'action' ? 'crosstime-whisper-msg--action' : ''}`}>
                                            <div className="crosstime-whisper-msg-name">
                                                {isUserWhisper ? userProfile.name : getTimelineLabel(privateTarget)}{isUserWhisper && ` · ${userKind}`}
                                            </div>
                                            <div className="crosstime-whisper-msg-bubble">{m.content}</div>
                                        </div>
                                    );
                                })}
                                {isTyping && (
                                    <div className="crosstime-whisper-typing">正在回复悄悄话…</div>
                                )}
                            </div>

                            <div className="crosstime-whisper-input-row">
                                <div className="crosstime-whisper-composer">
                                    <div className="crosstime-input-mode crosstime-input-mode--whisper" role="tablist" aria-label="悄悄话输入类型">
                                        <button
                                            type="button"
                                            className={`crosstime-input-mode-btn ${whisperInputKind === 'speech' ? 'crosstime-input-mode-btn--active' : ''}`}
                                            onClick={() => setWhisperInputKind('speech')}
                                            disabled={isTyping}>
                                            低语
                                        </button>
                                        <button
                                            type="button"
                                            className={`crosstime-input-mode-btn ${whisperInputKind === 'action' ? 'crosstime-input-mode-btn--active' : ''}`}
                                            onClick={() => setWhisperInputKind('action')}
                                            disabled={isTyping}>
                                            动作
                                        </button>
                                    </div>
                                    <textarea className="crosstime-whisper-input"
                                              value={whisperInput}
                                              onChange={e => setWhisperInput(e.target.value)}
                                              onKeyDown={handleComposerKeyDown}
                                              placeholder={whisperPlaceholder}
                                              disabled={isTyping}
                                              rows={1} />
                                </div>
                                <button className="crosstime-send-btn" onClick={handleSend} disabled={isTyping || !whisperInput.trim()}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ═══════════════════════════════
    //  RENDER: Setup
    // ═══════════════════════════════
    return (
        <div className="crosstime-app">
            <div className="crosstime-header">
                <button className="crosstime-header-back" onClick={closeApp}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div className="crosstime-header-text">
                    <div className="crosstime-header-title">对影</div>
                    <div className="crosstime-header-subtitle crosstime-header-subtitle--script">举杯邀明月，对影成几人</div>
                </div>
            </div>

            <div className="crosstime-setup-scroll">
                <section className="crosstime-setup-hero" aria-label="对影入口">
                    <div className="crosstime-setup-hero-top">
                        <div>
                            <div className="crosstime-setup-hero-title">对影</div>
                            <div className="crosstime-setup-hero-subtitle">举杯邀明月，对影成几人</div>
                        </div>
                        <span className="crosstime-setup-hero-signal">SIGNAL</span>
                    </div>
                    <div className="crosstime-setup-hero-copy">
                        <span>让不同时期的他，</span>
                        <span>在同一个空间里相遇。</span>
                    </div>
                    <div className="crosstime-setup-hero-meta">{setupAccessText}</div>
                    <div className="crosstime-setup-axis" aria-hidden="true">
                        <span className="crosstime-setup-axis-point">AGE 06</span>
                        <span className="crosstime-setup-axis-line" />
                        <span className="crosstime-setup-axis-point">AGE 18</span>
                        <span className="crosstime-setup-axis-line" />
                        <span className="crosstime-setup-axis-point crosstime-setup-axis-point--now">NOW</span>
                        <span className="crosstime-setup-axis-line" />
                        <span className="crosstime-setup-axis-point">AFTER</span>
                    </div>
                    <div className="crosstime-setup-hero-actions">
                        <button
                            type="button"
                            className="crosstime-setup-hero-btn crosstime-setup-hero-btn--primary"
                            onClick={openAddParticipant}
                            disabled={!canSelectMoreSlices}>
                            选择时间线
                        </button>
                        <button
                            type="button"
                            className="crosstime-setup-hero-btn crosstime-setup-hero-btn--secondary"
                            onClick={handleStartRoom}
                            disabled={startDisabled}>
                            进入对话
                        </button>
                    </div>
                </section>

                <div className="crosstime-section-title">已选择的时间线</div>
                {selectedBaseChar && (
                    <div className="crosstime-locked-char-note">
                        当前角色：{selectedBaseChar.name}。接下来只添加他的其他时间线。
                    </div>
                )}
                <div className="crosstime-selected-list">
                    {participants.map(p => {
                        const char = getCharForParticipant(p);
                        return (
                            <div key={p.id} className="crosstime-selected-item">
                                <img src={char?.avatar || ''} alt=""
                                     style={p.timeSlice === 'trajectory' ? { filter: 'grayscale(0.3) sepia(0.15)' } : undefined} />
                                <div className="crosstime-selected-item-info">
                                    <div className="crosstime-selected-item-name">{getTimelineLabel(p)}</div>
                                    <div className="crosstime-selected-item-label">{char?.name || '?'} · {getTimelineDetail(p)}</div>
                                </div>
                                <button className="crosstime-selected-item-remove" onClick={() => removeParticipant(p.id)}>×</button>
                            </div>
                        );
                    })}
                </div>

                {/* History */}
                {historyRooms.length > 0 && (
                    <div className="crosstime-history-section">
                        <div className="crosstime-section-title">过往记录</div>
                        {historyRooms.map(r => (
                            <div key={r.id} className="crosstime-history-item" onClick={() => handleViewHistory(r)}>
                                <div>
                                    <div className="crosstime-history-name">{r.name}</div>
                                    <div className="crosstime-history-meta">{new Date(r.createdAt).toLocaleDateString()}</div>
                                </div>
                                <button className="crosstime-history-delete" onClick={e => handleDeleteHistory(e, r.id)}>×</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Modal: Pick Character ── */}
            {modalStep === 'pick_char' && (
                <div className="crosstime-modal-overlay" onClick={() => setModalStep('none')}>
                    <div className="crosstime-modal" onClick={e => e.stopPropagation()}>
                        <div className="crosstime-modal-title">选择角色</div>
                        <div className="crosstime-char-list">
                            {characters.map(c => (
                                <div key={c.id} className="crosstime-char-option" onClick={() => handlePickChar(c)}>
                                    <img src={c.avatar} alt="" />
                                    <div>
                                        <div className="crosstime-char-option-name">{c.name}</div>
                                        <div className="crosstime-char-option-desc">{c.description || '暂无描述'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Pick Time Slice ── */}
            {modalStep === 'pick_slice' && pickedChar && (
                <div className="crosstime-modal-overlay" onClick={() => setModalStep('none')}>
                    <div className="crosstime-modal" onClick={e => e.stopPropagation()}>
                        <div className="crosstime-modal-title">选择{pickedChar.name}的时间线</div>
                        <div className="crosstime-timeslice-list">
                            <div
                                className={`crosstime-timeslice-option ${isSliceAlreadySelected(pickedChar.id, 'current') ? 'crosstime-timeslice-option--disabled' : ''}`}
                                onClick={() => !isSliceAlreadySelected(pickedChar.id, 'current') && handlePickSlice('current')}
                            >
                                <div className="crosstime-timeslice-label">现在</div>
                                <div className="crosstime-timeslice-detail">
                                    {pickedChar.name} · 完整记忆 · 认识你{isSliceAlreadySelected(pickedChar.id, 'current') ? ' · 已添加' : ''}
                                </div>
                            </div>
                            {pickedCharNodes.map(node => {
                                const isSelected = isSliceAlreadySelected(pickedChar.id, node);
                                return (
                                <div
                                    key={node.id}
                                    className={`crosstime-timeslice-option ${isSelected ? 'crosstime-timeslice-option--disabled' : ''}`}
                                    onClick={() => !isSelected && handlePickSlice(node)}
                                >
                                    <div className="crosstime-timeslice-label">
                                        {getTrajectorySliceLabel(node)}
                                    </div>
                                    <div className="crosstime-timeslice-detail">
                                        {getTrajectorySliceDetail(node)}{node.keywords.length ? ` · ${node.keywords.join('、')}` : ''}{isSelected ? ' · 已添加' : ''}
                                    </div>
                                </div>
                                );
                            })}
                            {pickedCharNodes.length === 0 && (
                                <div className="crosstime-empty">
                                    <div className="crosstime-empty-desc">
                                        {isSliceAlreadySelected(pickedChar.id, 'current')
                                            ? '这个角色还没有轨迹节点。先去轨迹档案生成时间线，再回来让不同时间线的他对话。'
                                            : '这个角色还没有轨迹节点，只能先选择「现在」版本。'}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CrosstimeApp;
