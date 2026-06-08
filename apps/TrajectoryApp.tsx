/**
 * TrajectoryApp — 人生轨迹 主入口
 * 三视图：角色选择 → 时间轴 → 独白演出 + 窃语
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import type { CharacterProfile } from '../types';
import { AppID } from '../types';
import type { TrajectoryNode, TrajectoryMood } from '../types/trajectory';
import { MOOD_COLORS } from '../types/trajectory';
import { getTrajectoryNodes, saveTrajectoryNode, deleteTrajectoryNode } from '../utils/db/trajectoryStore';
import {
    hasAnyMessages, initTrajectory, regenTrajectory, continueTrajectory, generateMonologue,
    generateAfterMonologue, generateWhisperResponse, createManualAfterNode, generateDreamEcho,
    WHISPER_MAX_ROUNDS,
} from '../utils/trajectoryEngine';
import { DB } from '../utils/db';
import { MinimaxTts } from '../utils/minimaxTts';
import { getTtsConfig } from '../utils/runtimeConfig';
import { withCharacterTtsVoice } from '../utils/characterTts';
import TrajectoryCollapseTransition from '../components/trajectory/TrajectoryCollapseTransition';
import '../styles/trajectory.css';

type View = 'select' | 'timeline' | 'monologue';

const TrajectoryApp: React.FC = () => {
    const { closeApp, characters, apiConfig, addToast, userProfile, openApp } = useOS();
    const [view, setView] = useState<View>('select');
    const [char, setChar] = useState<CharacterProfile | null>(null);
    const [nodes, setNodes] = useState<TrajectoryNode[]>([]);
    const [activeNode, setActiveNode] = useState<TrajectoryNode | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingPhase, setLoadingPhase] = useState<'before' | 'after' | ''>('');
    const [monoText, setMonoText] = useState('');
    const [isMonoGen, setIsMonoGen] = useState(false);
    const [whisperInput, setWhisperInput] = useState('');
    const [, setWhisperResp] = useState('');
    const [isWhisperGen, setIsWhisperGen] = useState(false);
    const [showWhisper, setShowWhisper] = useState(false);
    const [isCollapsePending, setIsCollapsePending] = useState(false);
    const [showCollapseTransition, setShowCollapseTransition] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addTitle, setAddTitle] = useState('');
    const [addKeywords, setAddKeywords] = useState('');
    const [showRegenConfirm, setShowRegenConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isTtsPlaying, setIsTtsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const collapseStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const api = apiConfig?.baseUrl && apiConfig?.apiKey && apiConfig?.model
        ? { baseUrl: apiConfig.baseUrl, apiKey: apiConfig.apiKey, model: apiConfig.model } : null;

    const clearCollapseStartTimer = useCallback(() => {
        if (collapseStartTimerRef.current) {
            clearTimeout(collapseStartTimerRef.current);
            collapseStartTimerRef.current = null;
        }
    }, []);

    // ── Character Selection ──
    const handleSelectChar = useCallback(async (c: CharacterProfile) => {
        if (!api) { addToast('请先配置主 API', 'error'); return; }
        const ok = await hasAnyMessages(c.id);
        if (!ok) { addToast(`还没和${c.name}聊过天，先去认识一下吧`, 'info'); return; }
        setChar(c);
        setIsLoading(true);
        setView('timeline');
        setLoadingPhase('before');
        try {
            let existing = getTrajectoryNodes(c.id);
            if (existing.length === 0) {
                setLoadingPhase('before');
                existing = await initTrajectory(c, api, userProfile.name);
            }
            setNodes(existing);
        } catch (e: any) {
            console.error('[Trajectory] init failed:', e);
            addToast('轨迹生成失败: ' + (e.message || e), 'error');
            setView('select');
        } finally {
            setIsLoading(false);
            setLoadingPhase('');
        }
    }, [api, addToast]);

    // ── Open Node ──
    const handleOpenNode = useCallback(async (node: TrajectoryNode) => {
        if (!char || !api) return;
        clearCollapseStartTimer();
        setActiveNode(node);
        setView('monologue');
        setShowWhisper(false);
        setIsCollapsePending(false);
        setShowCollapseTransition(false);
        setWhisperResp('');
        setWhisperInput('');

        if (node.monologue) { setMonoText(node.monologue); return; }
        setIsMonoGen(true);
        setMonoText('');
        try {
            const text = node.era === 'before_meeting'
                ? await generateMonologue(char, node, api)
                : await generateAfterMonologue(char, node, userProfile.name, api);
            setMonoText(text);
            const updated = { ...node, monologue: text, monologueGeneratedAt: Date.now() };
            saveTrajectoryNode(updated);
            setActiveNode(updated);
            setNodes(prev => prev.map(n => n.id === node.id ? updated : n));
        } catch (e: any) {
            addToast('独白生成失败', 'error');
            console.error('[Trajectory] monologue gen failed:', e);
        } finally {
            setIsMonoGen(false);
        }
    }, [char, api, userProfile, clearCollapseStartTimer]);

    // ── Whisper ──
    const handleWhisper = useCallback(async () => {
        if (!char || !api || !activeNode || !whisperInput.trim()) return;
        if (activeNode.whisperSealed) return;

        const currentHistory = activeNode.whisperHistory || [];
        const currentRound = currentHistory.length + 1;

        // Check if already at max rounds
        if (currentRound > WHISPER_MAX_ROUNDS) return;

        setIsWhisperGen(true);
        try {
            const resp = await generateWhisperResponse(char, activeNode, whisperInput.trim(), api, userProfile.name, currentHistory);
            setWhisperResp(resp);
            const record = { userWhisper: whisperInput.trim(), charResponse: resp, timestamp: Date.now() };
            const newHistory = [...currentHistory, record];
            const isLastRound = newHistory.length >= WHISPER_MAX_ROUNDS;

            const updated: TrajectoryNode = {
                ...activeNode,
                whisperHistory: newHistory,
                ...(isLastRound ? { whisperSealed: true } : {}),
            };
            saveTrajectoryNode(updated);
            setActiveNode(updated);
            setNodes(prev => prev.map(n => n.id === activeNode.id ? updated : n));
            setWhisperInput('');

            // Trigger time-space turbulence at round 10
            if (isLastRound) {
                setIsCollapsePending(true);
                clearCollapseStartTimer();
                // Short delay to let user read the last response
                collapseStartTimerRef.current = setTimeout(() => {
                    collapseStartTimerRef.current = null;
                    setIsCollapsePending(false);
                    setShowCollapseTransition(true);

                    // Generate dream echo and save to main chat
                    void (async () => {
                        try {
                            const dreamText = await generateDreamEcho(char, updated, api, userProfile.name);
                            await DB.saveMessage({
                                charId: char.id,
                                role: 'assistant',
                                type: 'text',
                                content: dreamText,
                                metadata: {
                                    source: 'trajectory_dream',
                                    nodeId: updated.id,
                                    nodeTitle: updated.title,
                                    nodeAge: updated.age,
                                    nodeEra: updated.era,
                                },
                            });
                        } catch (e) {
                            console.warn('[Trajectory] Dream echo generation failed:', e);
                        }
                    })();
                }, 1500);
            }
        } catch (e: any) {
            addToast('窃语回应失败', 'error');
        } finally {
            setIsWhisperGen(false);
        }
    }, [char, api, activeNode, whisperInput, addToast, userProfile, clearCollapseStartTimer]);

    // ── Regenerate Nodes ──
    const handleRegen = useCallback(async () => {
        if (!char || !api) return;
        setShowRegenConfirm(false);
        setIsLoading(true);
        setLoadingPhase('before');
        try {
            const fresh = await regenTrajectory(char, api, userProfile.name);
            setNodes(fresh);
            addToast('已重新生成轨迹节点（手动记忆已保留）', 'success');
        } catch (e: any) {
            addToast('重新生成失败', 'error');
        } finally {
            setIsLoading(false);
            setLoadingPhase('');
        }
    }, [char, api, addToast, userProfile.name]);

    // ── Continue (append new nodes) ──
    const handleContinue = useCallback(async () => {
        if (!char || !api) return;
        setIsLoading(true);
        setLoadingPhase('before');
        try {
            const updated = await continueTrajectory(char, api, userProfile.name);
            setNodes(updated);
            const newCount = updated.length - nodes.length;
            addToast(newCount > 0 ? `已补充 ${newCount} 个新节点` : '暂时没有新的轨迹可以补充', newCount > 0 ? 'success' : 'info');
        } catch (e: any) {
            addToast('继续追溯失败', 'error');
        } finally {
            setIsLoading(false);
            setLoadingPhase('');
        }
    }, [char, api, addToast, userProfile.name, nodes.length]);

    // ── Add Manual Node ──
    const handleAddNode = useCallback(() => {
        if (!char || !addTitle.trim()) return;
        const node = createManualAfterNode(char.id, addTitle.trim(), addKeywords.trim(), nodes.length);
        setNodes(prev => [...prev, node]);
        setShowAddModal(false);
        setAddTitle('');
        setAddKeywords('');
        addToast('已添加节点', 'success');
    }, [char, addTitle, addKeywords, nodes, addToast]);

    // ── TTS (only for after_meeting nodes) ──
    const stopTts = useCallback(() => {
        abortRef.current?.abort();
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
        setIsTtsPlaying(false);
    }, []);

    const handleTts = useCallback(async () => {
        if (!char || !monoText) return;
        if (isTtsPlaying) { stopTts(); return; }
        const baseCfg = getTtsConfig();
        if (!baseCfg.apiKey) { addToast('请先配置 TTS API Key', 'info'); return; }
        const cfg = withCharacterTtsVoice(baseCfg, char);
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setIsTtsPlaying(true);
        try {
            const result = await MinimaxTts.synthesizeSync(monoText, cfg, undefined, ctrl.signal);
            audioUrlRef.current = result.url;
            const audio = new Audio(result.url);
            audioRef.current = audio;
            audio.onended = () => setIsTtsPlaying(false);
            audio.onerror = () => setIsTtsPlaying(false);
            await audio.play();
        } catch (e: any) {
            if (e.name !== 'AbortError') addToast('语音合成失败', 'error');
            setIsTtsPlaying(false);
        }
    }, [char, monoText, isTtsPlaying, stopTts, addToast]);

    useEffect(() => () => {
        clearCollapseStartTimer();
        stopTts();
    }, [clearCollapseStartTimer, stopTts]);

    const handleCollapseComplete = useCallback(() => {
        clearCollapseStartTimer();
        setShowCollapseTransition(false);
        setIsCollapsePending(false);
        setShowWhisper(false);
        setWhisperResp('');
        setWhisperInput('');
        setShowDeleteConfirm(false);
        stopTts();
        setView('timeline');
        setActiveNode(null);
        setMonoText('');
    }, [clearCollapseStartTimer, stopTts]);

    // ── Regenerate Monologue ──
    const handleRegenMonologue = useCallback(async () => {
        if (!char || !api || !activeNode || isMonoGen) return;
        setIsMonoGen(true);
        setMonoText('');
        try {
            const text = activeNode.era === 'before_meeting'
                ? await generateMonologue(char, activeNode, api)
                : await generateAfterMonologue(char, activeNode, userProfile.name, api);
            setMonoText(text);
            const updated = { ...activeNode, monologue: text, monologueGeneratedAt: Date.now() };
            saveTrajectoryNode(updated);
            setActiveNode(updated);
            setNodes(prev => prev.map(n => n.id === activeNode.id ? updated : n));
        } catch { addToast('重写失败', 'error'); }
        finally { setIsMonoGen(false); }
    }, [char, api, activeNode, isMonoGen, userProfile]);

    // ── Delete Node ──
    const handleDeleteNode = useCallback(() => {
        if (!activeNode || !char) return;
        clearCollapseStartTimer();
        deleteTrajectoryNode(char.id, activeNode.id);
        setNodes(prev => prev.filter(n => n.id !== activeNode.id));
        setView('timeline');
        setActiveNode(null);
        setMonoText('');
        setShowCollapseTransition(false);
        setIsCollapsePending(false);
        setShowDeleteConfirm(false);
        addToast('节点已删除', 'info');
    }, [activeNode, char, addToast, clearCollapseStartTimer]);

    // ── Helpers ──
    /** Capitalize first letter for decorative display */
    const moodLabel = (mood: string) => {
        const m = mood as TrajectoryMood;
        return m.charAt(0).toUpperCase() + m.slice(1);
    };

    const getMoodStyle = (mood: string) => {
        const m = MOOD_COLORS[mood as keyof typeof MOOD_COLORS];
        const hue = m?.hue ?? 260;
        return {
            '--node-color': `hsla(${hue}, 65%, 65%, 0.75)`,
            '--node-glow': `hsla(${hue}, 60%, 55%, 0.28)`,
            '--mono-color': `hsla(${hue}, 50%, 55%, 0.3)`,
        } as React.CSSProperties;
    };

    const beforeNodes = nodes.filter(n => n.era === 'before_meeting');
    const afterNodes = nodes.filter(n => n.era === 'after_meeting');
    const hasMeetingPoint = beforeNodes.length > 0 && afterNodes.length > 0;

    // ── Per-character trajectory summary (for select page) ──
    const [charNodesMap, setCharNodesMap] = useState<Record<string, TrajectoryNode[]>>({});
    useEffect(() => {
        if (view !== 'select') return;
        const map: Record<string, TrajectoryNode[]> = {};
        for (const c of characters) {
            map[c.id] = getTrajectoryNodes(c.id);
        }
        setCharNodesMap(map);
    }, [view, characters]);

    /** Find the best "continue" candidate — character with the most nodes + unread monologues */
    const getContinueChar = () => {
        let best: CharacterProfile | null = null;
        let bestScore = -1;
        for (const c of characters) {
            const n = charNodesMap[c.id] || [];
            if (n.length === 0) continue;
            const unread = n.filter(nd => !nd.monologue).length;
            const score = n.length * 10 + unread * 5;
            if (score > bestScore) { bestScore = score; best = c; }
        }
        return best;
    };

    const getCharSummary = (c: CharacterProfile) => {
        const n = charNodesMap[c.id] || [];
        if (n.length === 0) return { status: 'empty' as const, nodes: n };
        const before = n.filter(nd => nd.era === 'before_meeting');
        const ages = before.map(nd => nd.age).sort((a, b) => a - b);
        const ageRange = ages.length > 1 ? `${ages[0]}—${ages[ages.length - 1]}岁` : ages.length === 1 ? `${ages[0]}岁` : '';
        const hasAfter = n.some(nd => nd.era === 'after_meeting');
        const phase = hasAfter ? '过去篇 + 相遇后' : '过去篇';
        const unread = n.filter(nd => !nd.monologue).length;
        const keywords = [...new Set(n.flatMap(nd => nd.keywords))].slice(0, 3);
        const lastNode = n[n.length - 1];
        const progress = Math.round(((n.length - unread) / Math.max(n.length, 1)) * 100);
        return { status: 'active' as const, nodes: n, ageRange, phase, unread, keywords, lastNode, progress };
    };

    // ══════════════════════════════════════════
    //  RENDER: Archive Index (Select)
    // ══════════════════════════════════════════
    if (view === 'select') {
        const continueChar = getContinueChar();
        const continueSummary = continueChar ? getCharSummary(continueChar) : null;

        return (
            <div className="trajectory-app traj-archive-page">
                {/* Header */}
                <div className="traj-archive-header">
                    <button className="traj-header-back" onClick={closeApp}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div className="traj-archive-header-text">
                        <div className="traj-archive-title">轨迹档案</div>
                        <div className="traj-archive-subtitle">Archive of Lives</div>
                    </div>
                </div>

                <div className="traj-archive-scroll">
                    {/* Intro */}
                    <div className="traj-archive-intro">记录他们在遇见你之前，已经走过的那些年。</div>

                    {characters.length === 0 ? (
                        /* Empty state */
                        <div className="traj-archive-empty">
                            <div className="traj-archive-empty-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                            </div>
                            <div className="traj-archive-empty-title">还没有轨迹档案</div>
                            <div className="traj-archive-empty-desc">为一个角色写入第一段人生节点后，<br/>他的过去会在这里慢慢显影。</div>
                        </div>
                    ) : (
                        <>
                            {/* Continue Card */}
                            {continueChar && continueSummary && continueSummary.status === 'active' && (
                                <div className="traj-continue-card" onClick={() => handleSelectChar(continueChar)}>
                                    <div className="traj-continue-header">
                                        <span className="traj-continue-label">
                                            {continueSummary.progress >= 100 ? '当前档案' : '继续追溯'}
                                        </span>
                                        <span className="traj-continue-status">
                                            {continueSummary.progress >= 100 ? '已完成' : '进行中'}
                                        </span>
                                    </div>
                                    <div className="traj-continue-name">{continueChar.name}</div>
                                    {continueSummary.lastNode && (
                                        <div className="traj-continue-last">
                                            {continueSummary.lastNode.era === 'before_meeting'
                                                ? `${continueSummary.lastNode.age}岁`
                                                : '相遇后'} · {continueSummary.lastNode.title}
                                        </div>
                                    )}
                                    <div className="traj-continue-remaining">
                                        {continueSummary.nodes.length} 个节点 · {continueSummary.ageRange ? `${continueSummary.ageRange}` : continueSummary.phase}
                                        {continueSummary.unread > 0 ? ` · 还有 ${continueSummary.unread} 段未读` : ''}
                                    </div>
                                    <div className="traj-continue-progress-bar">
                                        <div className="traj-continue-progress-fill" style={{ width: `${continueSummary.progress}%` }} />
                                    </div>
                                    <div className="traj-continue-progress-text">{continueSummary.progress}%</div>
                                </div>
                            )}

                            {/* Section title */}
                            <div className="traj-archive-section-title">人物轨迹</div>

                            {/* Character archive cards */}
                            <div className="traj-archive-list">
                                {characters.map(c => {
                                    const summary = getCharSummary(c);
                                    const isActive = summary.status === 'active';
                                    return (
                                        <div key={c.id} className="traj-archive-card" onClick={() => handleSelectChar(c)}>
                                            <img
                                                className="traj-archive-avatar"
                                                src={c.avatar || ''}
                                                alt=""
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                            />
                                            <div className="traj-archive-card-body">
                                                <div className="traj-archive-card-name">{c.name}</div>
                                                {isActive ? (
                                                    <>
                                                        <div className="traj-archive-card-meta">
                                                            已追溯 {summary.ageRange} · {summary.nodes.length} 个节点 · {summary.phase}
                                                        </div>
                                                        {summary.keywords.length > 0 && (
                                                            <div className="traj-archive-card-tags">
                                                                {summary.keywords.map((k, i) => (
                                                                    <span key={i} className="traj-archive-tag">{k}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div className="traj-archive-card-meta traj-archive-card-meta--empty">
                                                        记忆档案为空 · 等待写入关键节点
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`traj-archive-card-action ${isActive ? '' : 'traj-archive-card-action--empty'}`}>
                                                {isActive ? '继续' : '新建'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Crosstime Entry */}
                            <div className="traj-crosstime-entry-wrap">
                                <button
                                    type="button"
                                    className="traj-crosstime-entry"
                                    onClick={() => openApp(AppID.Crosstime)}
                                >
                                    <div className="traj-crosstime-entry-top">
                                        <div>
                                            <div className="traj-crosstime-title">对影</div>
                                            <div className="traj-crosstime-subtitle">举杯邀明月，对影成几人</div>
                                        </div>
                                        <span className="traj-crosstime-action">进入</span>
                                    </div>
                                    <div className="traj-crosstime-copy">
                                        让不同时期的他，在同一个空间里相遇。
                                    </div>
                                    <div className="traj-crosstime-axis" aria-hidden="true">
                                        <span>AGE 06</span>
                                        <i />
                                        <span>AGE 18</span>
                                        <i />
                                        <span>NOW</span>
                                        <i />
                                        <span>AFTER</span>
                                    </div>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ── Node type inference for visual differentiation (display only) ──
    const traumaKeywords = ['放逐', '破碎', '消失', '无情', '背叛', '崩塌', '葬礼', '死', '伤', '痛', '血', '冷暴力', '打', '骂'];
    const turningKeywords = ['转折', '离开', '搬家', '婚姻', '分离', '决裂', '逃', '抉择', '觉醒', '独立'];
    const gentleKeywords = ['爷爷', '奶奶', '书法', '庭院', '花', '温暖', '拥抱', '笑', '阳光', '歌', '猫', '雨'];
    const relatedKeywords = ['相遇', '你', '遇见', '关系', '在一起', '告白'];

    const inferNodeType = (node: TrajectoryNode): 'trauma' | 'turning' | 'gentle' | 'related' | 'normal' => {
        const text = `${node.title} ${node.keywords.join(' ')}`;
        if (node.era === 'after_meeting') return 'related';
        if (relatedKeywords.some(k => text.includes(k))) return 'related';
        if (traumaKeywords.some(k => text.includes(k))) return 'trauma';
        if (turningKeywords.some(k => text.includes(k))) return 'turning';
        if (gentleKeywords.some(k => text.includes(k))) return 'gentle';
        return 'normal';
    };

    const nodeTypeLabel: Record<string, string> = {
        trauma: '创伤记忆', turning: '关键转折', gentle: '温柔记忆', related: '与你有关', normal: '普通记忆'
    };

    const nodeMoodTone: Record<string, string> = {
        nostalgic: '微冷', melancholy: '压抑', hopeful: '温暖', rebellious: '灼热',
        peaceful: '平静', painful: '破裂', joyful: '明亮', anxious: '不安', lonely: '空旷'
    };

    const getNodeAccentColor = (type: string) => {
        switch (type) {
            case 'turning': return '#B8A27A';
            case 'trauma': return '#8A5D5D';
            case 'gentle': return '#8FA99A';
            case 'related': return '#C8D6E2';
            default: return '#5F7D96';
        }
    };

    // ── Timeline summary stats ──
    const tlAges = beforeNodes.map(n => n.age).sort((a, b) => a - b);
    const tlAgeRange = tlAges.length > 1 ? `${tlAges[0]}—${tlAges[tlAges.length - 1]}岁` : tlAges.length === 1 ? `${tlAges[0]}岁` : '';
    const tlUnread = nodes.filter(n => !n.monologue).length;
    const tlPhase = afterNodes.length > 0 ? '收录：过去篇 / 相遇后' : '收录：过去篇';

    // ══════════════════════════════════════════
    //  RENDER: Timeline
    // ══════════════════════════════════════════
    if (view === 'timeline') {
        return (
            <div className="trajectory-app traj-detail-page">
                {/* Header */}
                <div className="traj-archive-header">
                    <button className="traj-header-back" onClick={() => { setView('select'); setChar(null); setNodes([]); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <div className="traj-archive-header-text">
                        <div className="traj-archive-title">{char?.name}</div>
                        <div className="traj-archive-subtitle">Trajectory Archive</div>
                    </div>
                </div>

                <div className="traj-detail-scroll">
                    {isLoading ? (
                        <div className="traj-detail-loading"><div className="traj-loading-spinner" /><span>{loadingPhase === 'after' ? '正在从记忆中提炼相遇后的轨迹…' : '正在读取记忆档案…'}</span></div>
                    ) : nodes.length === 0 ? (
                        /* Empty state */
                        <div className="traj-archive-empty">
                            <div className="traj-archive-empty-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </div>
                            <div className="traj-archive-empty-title">还没有可读取的记忆节点</div>
                            <div className="traj-archive-empty-desc">写入第一段人生节点后，这份档案会开始显影。</div>
                        </div>
                    ) : (
                        <>
                            {/* Profile card */}
                            <div className="traj-profile-card">
                                <div className="traj-profile-name">{char?.name}</div>
                                <div className="traj-profile-desc">在遇见你之前，已经独自走过很多年。</div>
                                <div className="traj-profile-stats">
                                    已追溯 {tlAgeRange} · {nodes.length} 个节点 · {tlPhase}
                                </div>
                                <div className="traj-profile-stats" style={{ marginBottom: '12px', color: '#586272' }}>
                                    档案完整度 {nodes.length > 0 ? Math.round(((nodes.length - tlUnread) / nodes.length) * 100) : 0}% · {tlUnread > 0 ? `${tlUnread} 段待读取` : '全部已读'}
                                </div>
                                <div className="traj-profile-actions">
                                    <button className="traj-profile-action" onClick={handleContinue}>
                                        继续追溯
                                    </button>
                                    <button className="traj-profile-action traj-profile-action--secondary" onClick={() => setShowRegenConfirm(true)}>
                                        重新追溯
                                    </button>
                                </div>
                            </div>

                            {/* ── Unified Timeline ── */}
                            <div className="traj-chapter-intro">
                                <div className="traj-chapter-title">{char?.name}的时间线</div>
                                <div className="traj-chapter-subtitle">Life Trajectory</div>
                                <div className="traj-chapter-desc">
                                    {afterNodes.length > 0
                                        ? `从独自走过的那些年，到有你以后的每一刻。`
                                        : `那些尚未与你有关，却已经塑造了${char?.name}的时刻。`}
                                </div>
                            </div>

                            <div className="traj-spine">
                                {/* Before meeting nodes */}
                                {beforeNodes.map((node, idx) => {
                                    const ntype = inferNodeType(node);
                                    const accent = getNodeAccentColor(ntype);
                                    const isRead = !!node.monologue;
                                    return (
                                        <div key={node.id} className={`traj-spine-node traj-spine-node--${ntype} ${isRead ? 'traj-spine-node--read' : ''}`}
                                             style={{ '--spine-accent': accent, animationDelay: `${idx * 0.07}s` } as React.CSSProperties}
                                             onClick={() => handleOpenNode(node)}>
                                            <div className="traj-spine-dot" />
                                            <div className="traj-spine-card">
                                                <div className="traj-spine-card-top">
                                                    <span className="traj-spine-age">AGE {String(node.age).padStart(2, '0')}</span>
                                                    <span className="traj-spine-type" style={{ color: accent }}>{nodeTypeLabel[ntype]}</span>
                                                </div>
                                                <div className="traj-spine-title">{node.title}</div>
                                                <div className="traj-spine-excerpt">
                                                    {node.monologue
                                                        ? node.monologue.slice(0, 40).replace(/\n/g, ' ') + '…'
                                                        : '这段记忆仍在整理中。'}
                                                </div>
                                                <div className="traj-spine-tags">
                                                    {node.keywords.map((k, i) => <span key={i} className="traj-spine-tag">{k}</span>)}
                                                </div>
                                                <div className="traj-spine-footer">
                                                    {node.whisperHistory && node.whisperHistory.length > 0 && (
                                                        <span>残响 {node.whisperHistory.length}</span>
                                                    )}
                                                    <span>情绪底色：{nodeMoodTone[node.mood] || '微冷'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* ✦ Meeting Point Divider ✦ */}
                                {hasMeetingPoint && (
                                    <div className="traj-meeting-divider">
                                        <div className="traj-meeting-glow" />
                                        <div className="traj-meeting-dot" />
                                        <div className="traj-meeting-text">
                                            <span className="traj-meeting-label">遇 见 你</span>
                                            <span className="traj-meeting-label-en">The Meeting Point</span>
                                        </div>
                                    </div>
                                )}

                                {/* After meeting nodes */}
                                {afterNodes.map((node, idx) => {
                                    const ntype = inferNodeType(node);
                                    const accent = getNodeAccentColor(ntype);
                                    const isRead = !!node.monologue;
                                    const sourceLabel = node.memorySource === 'vector' ? '自动提炼' : '手动记录';
                                    return (
                                        <div key={node.id} className={`traj-spine-node traj-spine-node--related ${isRead ? 'traj-spine-node--read' : ''}`}
                                             style={{ '--spine-accent': accent, animationDelay: `${(beforeNodes.length + idx + 1) * 0.07}s` } as React.CSSProperties}
                                             onClick={() => handleOpenNode(node)}>
                                            <div className="traj-spine-dot" />
                                            <div className="traj-spine-card">
                                                <div className="traj-spine-card-top">
                                                    <span className="traj-spine-age">相遇后</span>
                                                    <span className="traj-spine-type" style={{ color: accent }}>{sourceLabel}</span>
                                                </div>
                                                <div className="traj-spine-title">{node.title}</div>
                                                <div className="traj-spine-excerpt">
                                                    {node.monologue
                                                        ? node.monologue.slice(0, 40).replace(/\n/g, ' ') + '…'
                                                        : '这段记忆仍在整理中。'}
                                                </div>
                                                <div className="traj-spine-tags">
                                                    {node.keywords.map((k, i) => <span key={i} className="traj-spine-tag">{k}</span>)}
                                                </div>
                                                <div className="traj-spine-footer">
                                                    {node.whisperHistory && node.whisperHistory.length > 0 && (
                                                        <span>残响 {node.whisperHistory.length}</span>
                                                    )}
                                                    <span>情绪底色：{nodeMoodTone[node.mood] || '微冷'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add node button */}
                            <button className="traj-detail-add-btn" onClick={() => setShowAddModal(true)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                留下一段记忆
                            </button>
                        </>
                    )}
                </div>

                {/* Regen confirm */}
                {showRegenConfirm && (
                    <div className="traj-regen-toast">
                        <span>将重新追溯时光，现有记忆会被覆盖</span>
                        <button className="traj-regen-toast-btn traj-regen-toast-btn--cancel" onClick={() => setShowRegenConfirm(false)}>取消</button>
                        <button className="traj-regen-toast-btn traj-regen-toast-btn--confirm" onClick={handleRegen}>确定</button>
                    </div>
                )}
                {/* Add modal */}
                {showAddModal && (
                    <div className="traj-modal-overlay" onClick={() => setShowAddModal(false)}>
                        <div className="traj-modal" onClick={e => e.stopPropagation()}>
                            <div className="traj-modal-title">留下一段记忆</div>
                            <div className="traj-modal-field">
                                <div className="traj-modal-label">标题</div>
                                <input className="traj-modal-input" placeholder="那段时间的关键记忆" value={addTitle} onChange={e => setAddTitle(e.target.value)} />
                            </div>
                            <div className="traj-modal-field">
                                <div className="traj-modal-label">关键词（逗号分隔）</div>
                                <input className="traj-modal-input" placeholder="第一次见面, 咖啡馆" value={addKeywords} onChange={e => setAddKeywords(e.target.value)} />
                            </div>
                            <div className="traj-modal-actions">
                                <button className="traj-modal-btn" onClick={() => setShowAddModal(false)}>取消</button>
                                <button className="traj-modal-btn traj-modal-btn--primary" onClick={handleAddNode}>添加</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ══════════════════════════════════════════
    //  RENDER: Monologue
    // ══════════════════════════════════════════
    const paragraphs = monoText.split(/\n+/).filter(Boolean);
    const verseText = activeNode?.moodVerse || '';

    return (
        <div className="trajectory-app">
            <div className="traj-monologue" style={activeNode ? getMoodStyle(activeNode.mood) : undefined}>
                <div className="traj-mono-bg" />
                {activeNode && <div className="traj-mono-watermark">{moodLabel(activeNode.mood)}</div>}
                <div className="traj-header" style={{ background: 'transparent', borderBottom: 'none' }}>
                    <button className="traj-header-back" onClick={() => { clearCollapseStartTimer(); stopTts(); setView('timeline'); setActiveNode(null); setMonoText(''); setShowWhisper(false); setIsCollapsePending(false); setShowCollapseTransition(false); setWhisperResp(''); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                </div>
                <div className="traj-mono-scroll">
                    <div className="traj-mono-header">
                        <div className="traj-mono-age">
                            {activeNode?.era === 'before_meeting' ? `${activeNode?.age}岁` : '在遇见你之后'}
                            <span className="traj-mono-age-en">
                                {activeNode?.era === 'before_meeting' ? `age ${activeNode?.age}` : 'After You'}
                            </span>
                        </div>
                        <div className="traj-mono-title">{activeNode?.title}</div>
                        {verseText && <div className="traj-mono-mood">{verseText}</div>}
                    </div>
                    {isMonoGen ? (
                        <div className="traj-mono-generating"><div className="traj-loading-spinner" style={{ margin: '0 auto 12px' }} /><span>Writing monologue...</span></div>
                    ) : (
                        <div className="traj-mono-text">
                            {paragraphs.map((p, i) => (
                                <div key={i} className="traj-mono-paragraph" style={{ animationDelay: `${i * 0.15}s` }}>{p}</div>
                            ))}
                        </div>
                    )}
                    {!isMonoGen && monoText && showWhisper && (
                        <div className={`traj-whisper-zone ${(() => {
                            const rounds = (activeNode?.whisperHistory || []).length;
                            if (rounds >= 9) return 'traj-whisper-signal-critical';
                            if (rounds >= 7) return 'traj-whisper-signal-weak';
                            return '';
                        })()}`}>
                            {/* Signal strength indicator */}
                            {!activeNode?.whisperSealed && (
                                <div className="traj-whisper-signal">
                                    <span className="traj-whisper-signal-label">连接强度</span>
                                    <div className="traj-whisper-signal-dots">
                                        {Array.from({ length: WHISPER_MAX_ROUNDS }, (_, i) => (
                                            <span key={i} className={`traj-whisper-signal-dot ${i < (WHISPER_MAX_ROUNDS - (activeNode?.whisperHistory || []).length) ? 'active' : ''}`} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Whisper conversation history */}
                            {(activeNode?.whisperHistory || []).length > 0 && (
                                <div className="traj-whisper-history">
                                    {(activeNode?.whisperHistory || []).map((record, i) => (
                                        <div key={i} className="traj-whisper-exchange">
                                            <div className="traj-whisper-bubble traj-whisper-bubble--user">
                                                {record.userWhisper}
                                            </div>
                                            <div className={`traj-whisper-bubble traj-whisper-bubble--char ${i >= 6 ? 'traj-whisper-glitch' : ''}`}>
                                                {record.charResponse}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Sealed state */}
                            {activeNode?.whisperSealed ? (
                                isCollapsePending ? (
                                    <div className="traj-whisper-collapse-pending">信号正在坍塌</div>
                                ) : (
                                <div className="traj-whisper-sealed">
                                    <div className="traj-whisper-sealed-icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <path d="M18.36 5.64a9 9 0 11-12.73 0" strokeLinecap="round"/>
                                            <line x1="12" y1="2" x2="12" y2="12" strokeLinecap="round"/>
                                        </svg>
                                    </div>
                                    <div className="traj-whisper-sealed-text">时空裂缝已关闭 · 连接已断开</div>
                                    <div className="traj-whisper-sealed-sub">这段跨时空的对话已被封存。但有些痕迹，会以梦的形式留下来。</div>
                                    <div className="traj-whisper-close" onClick={() => { setShowWhisper(false); setWhisperResp(''); setWhisperInput(''); }}>quietly leave</div>
                                </div>
                                )
                            ) : (
                                /* Input area */
                                <>
                                    <div className="traj-whisper-prompt">要对那时的{char?.name}说些什么吗</div>
                                    <div className="traj-whisper-input-row">
                                        <input className="traj-whisper-input" placeholder="leave a whisper..." value={whisperInput}
                                            onChange={e => setWhisperInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleWhisper()} disabled={isWhisperGen} />
                                        <button className="traj-whisper-send" onClick={handleWhisper} disabled={isWhisperGen}>
                                            {isWhisperGen
                                                ? <div className="traj-loading-spinner" style={{ width: 16, height: 16 }} />
                                                : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {showCollapseTransition && (
                        <TrajectoryCollapseTransition onComplete={handleCollapseComplete} />
                    )}
                </div>
                    {!isMonoGen && monoText && !showWhisper && !showCollapseTransition && (
                        <div className="traj-mono-bar">
                            {activeNode?.era === 'after_meeting' && (
                                <button className={`traj-mono-btn ${isTtsPlaying ? 'traj-mono-btn--playing' : ''}`} onClick={handleTts}>
                                    {isTtsPlaying ? (
                                        <><span className="traj-tts-wave"><span className="traj-tts-wave-bar"/><span className="traj-tts-wave-bar"/><span className="traj-tts-wave-bar"/><span className="traj-tts-wave-bar"/></span>listening...</>
                                    ) : (
                                        <>hear them</>
                                    )}
                                </button>
                            )}
                            {activeNode?.whisperSealed ? (
                                <button className="traj-mono-btn traj-mono-btn--sealed" disabled>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18.36 5.64a9 9 0 11-12.73 0" strokeLinecap="round"/>
                                        <line x1="12" y1="2" x2="12" y2="12" strokeLinecap="round"/>
                                    </svg>
                                    连接已断开
                                </button>
                            ) : (
                                <button className="traj-mono-btn traj-mono-btn--primary" onClick={() => setShowWhisper(true)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                                    whisper
                                </button>
                            )}
                            <button className="traj-mono-btn" onClick={handleRegenMonologue} disabled={isMonoGen}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>
                                rewrite
                            </button>
                            <button className="traj-mono-btn traj-mono-btn--danger" onClick={() => setShowDeleteConfirm(true)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                delete
                            </button>
                        </div>
                    )}
                    {/* Delete confirm */}
                    {showDeleteConfirm && (
                        <div className="traj-regen-toast">
                            <span>确定删除这个节点吗？独白和窃语记录都会丢失</span>
                            <button className="traj-regen-toast-btn traj-regen-toast-btn--cancel" onClick={() => setShowDeleteConfirm(false)}>取消</button>
                            <button className="traj-regen-toast-btn traj-regen-toast-btn--confirm" onClick={handleDeleteNode}>删除</button>
                        </div>
                    )}
            </div>
        </div>
    );
};

export default TrajectoryApp;
