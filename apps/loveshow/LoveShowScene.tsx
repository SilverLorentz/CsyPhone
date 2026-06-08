import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowCounterClockwise,
    Camera,
    CheckCircle,
    ChatCircleText,
    PaperPlaneTilt,
    Sparkle,
    UsersThree,
    X,
} from '@phosphor-icons/react';
import type { CharacterProfile, UserProfile } from '../../types';
import type { LoveShowScene as LoveShowSceneModel } from '../../types/loveshow';
import { LOVE_SHOW_COPY } from '../../utils/loveshowCopy';
import { getLoveShowSceneLocationGradient, getLoveShowSceneLocationWallpaper } from '../../utils/loveshowSceneVisuals';
import { parseLoveShowScript, stripQuotes } from '../../utils/loveshowScriptParser';

export interface LoveShowTurn {
    id: string;
    role: 'assistant' | 'user' | 'system';
    content: string;
    createdAt: number;
}

interface LoveShowSceneProps {
    scene: LoveShowSceneModel;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    turns: LoveShowTurn[];
    inputValue: string;
    isSending: boolean;
    isClosingScene: boolean;
    closingStatus: string | null;
    error: string | null;
    canRetry: boolean;
    showReadyToCutHint?: boolean;
    readyToCutHint?: string;
    finishButtonLabel?: string;
    finishButtonBusyLabel?: string;
    finishConfirmTitle?: string;
    finishConfirmDescription?: string;
    finishConfirmPrimaryLabel?: string;
    finishConfirmSecondaryLabel?: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onRetry: () => void;
    onCompleteScene: () => void;
}

function getInitial(name: string): string {
    return name.trim().slice(0, 1).toUpperCase() || 'L';
}

function normalizeSpeakerName(name: string): string {
    return name.trim().toLowerCase();
}

function renderAvatar(name: string, avatar?: string, className = 'ls-speaker-avatar') {
    return avatar ? (
        <img className={className} src={avatar} alt="" />
    ) : (
        <span className={`${className} ls-avatar-fallback`} aria-hidden="true">
            {getInitial(name)}
        </span>
    );
}

interface RenderContext {
    characterByName: Map<string, CharacterProfile>;
    userProfile: UserProfile;
    userName: string;
}

function getSpeakerCharacter(context: RenderContext, name: string): CharacterProfile | undefined {
    return context.characterByName.get(normalizeSpeakerName(name));
}

function renderUserSpeakerBadge(context: RenderContext, isActive = false) {
    return (
        <div className={`ls-vn-speaker ls-vn-speaker-user${isActive ? ' is-active' : ''}`}>
            <span>{context.userName}</span>
            {renderAvatar(context.userName, context.userProfile.avatar)}
        </div>
    );
}

type SceneFrame =
    | { id: string; turnId: string; kind: 'action' | 'system' | 'phone' | 'text'; content: string }
    | { id: string; turnId: string; kind: 'dialogue'; source: 'guest' | 'user'; speakerName: string; avatar?: string; content: string }
    | { id: string; turnId: string; kind: 'interview'; speakerName: string; content: string };

const INLINE_ACTION_RE = /\*([\s\S]+?)\*/g;
const INTERNAL_FRAME_PATTERNS = [
    /导演提示：[^。！？\n]*(?:[。！？]|$)/g,
    /心动片段余波：[^。！？\n]*(?:[。！？]|$)/g,
    /三人片段的张力必须[^。！？\n]*(?:[。！？]|$)/g,
    /这段单独约会必须[^。！？\n]*(?:[。！？]|$)/g,
    /嘉宾之间只能较劲、观察、误会或助攻[^。！？\n]*(?:[。！？]|$)/g,
    /不允许互相心动、互选或组\s*CP[^。！？\n]*(?:[。！？]|$)/g,
    /不能互相心动、互选或组\s*CP[^。！？\n]*(?:[。！？]|$)/g,
];
const INTERNAL_FRAME_LINE_RE = /^(?:#{1,6}\s*)?(?:当前导演镜头卡|当前小拍安排|DirectorBeat|beatId|sceneType|镜头焦点|明显发言安排|只做动作\/表情反应|用户位置|停顿方式|导演备注|本拍目标|演出要求|秘密潜台词嘉宾|差点露馅 secretId)[：:：\s]/i;

function cleanVisibleFrameText(raw: string): string {
    return raw
        .split(/\r?\n/)
        .map(line => INTERNAL_FRAME_PATTERNS.reduce(
            (text, pattern) => text.replace(pattern, ''),
            line,
        ).trimEnd())
        .filter(line => !INTERNAL_FRAME_LINE_RE.test(line.trim()))
        .join('\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSpokenContent(text: string): string {
    return stripQuotes(text.replace(/\s+/g, ' ').trim());
}

function splitDialogueFrame(
    baseId: string,
    turnId: string,
    source: 'guest' | 'user',
    speakerName: string,
    content: string,
    avatar?: string,
): SceneFrame[] {
    INLINE_ACTION_RE.lastIndex = 0;
    const matches = Array.from(content.matchAll(INLINE_ACTION_RE));

    if (matches.length === 0) {
        const spoken = normalizeSpokenContent(content);
        return spoken
            ? [{ id: baseId, turnId, kind: 'dialogue', source, speakerName, avatar, content: spoken }]
            : [];
    }

    const frames: SceneFrame[] = [];
    let cursor = 0;
    let partIndex = 0;

    const pushDialogue = (raw: string) => {
        const spoken = normalizeSpokenContent(raw);
        if (!spoken) return;
        frames.push({
            id: `${baseId}:dialogue:${partIndex}`,
            turnId,
            kind: 'dialogue',
            source,
            speakerName,
            avatar,
            content: spoken,
        });
        partIndex += 1;
    };

    const pushAction = (raw: string) => {
        const action = raw.trim();
        if (!action) return;
        frames.push({
            id: `${baseId}:action:${partIndex}`,
            turnId,
            kind: 'action',
            content: action,
        });
        partIndex += 1;
    };

    for (const match of matches) {
        pushDialogue(content.slice(cursor, match.index));
        pushAction(match[1]);
        cursor = match.index + match[0].length;
    }

    pushDialogue(content.slice(cursor));
    return frames;
}

function buildSceneFrames(turns: LoveShowTurn[], userName: string, userAvatar?: string): SceneFrame[] {
    return turns.flatMap((turn) => {
        if (turn.role === 'user') {
            return splitDialogueFrame(`${turn.id}:user`, turn.id, 'user', userName, turn.content, userAvatar);
        }

        if (turn.role === 'system') {
            const content = cleanVisibleFrameText(turn.content);
            if (!content) return [];
            return [{
                id: `${turn.id}:system`,
                turnId: turn.id,
                kind: 'system',
                content,
            } satisfies SceneFrame];
        }

        const visibleContent = cleanVisibleFrameText(turn.content);
        if (!visibleContent) return [];

        return parseLoveShowScript(visibleContent).nodes.map((node, index) => {
            const frameId = `${turn.id}:${index}`;
            switch (node.type) {
                case 'narration':
                    return { id: frameId, turnId: turn.id, kind: 'action', content: node.content } satisfies SceneFrame;
                case 'dialogue':
                    return splitDialogueFrame(frameId, turn.id, 'guest', node.character, node.content);
                case 'interview':
                    return {
                        id: frameId,
                        turnId: turn.id,
                        kind: 'interview',
                        speakerName: node.character,
                        content: node.content,
                    } satisfies SceneFrame;
                case 'phone':
                    return { id: frameId, turnId: turn.id, kind: 'phone', content: node.content } satisfies SceneFrame;
                case 'text':
                default:
                    return { id: frameId, turnId: turn.id, kind: 'text', content: node.content } satisfies SceneFrame;
            }
        }).flat();
    });
}

function renderAdvanceIndicator(hasNextFrame: boolean) {
    return <span className={hasNextFrame ? 'ls-vn-advance is-active' : 'ls-vn-advance'} aria-hidden="true" />;
}

function renderDialogueFrame(frame: Extract<SceneFrame, { kind: 'dialogue' }>, context: RenderContext, hasNextFrame: boolean) {
    const isUser = frame.source === 'user';
    const speaker = isUser ? undefined : getSpeakerCharacter(context, frame.speakerName);
    const speakerName = isUser ? context.userName : speaker?.name || frame.speakerName;
    const avatar = speaker?.avatar;

    return (
        <div className={`ls-vn-dialogue ${isUser ? 'ls-vn-dialogue-user' : 'ls-vn-dialogue-guest'}`}>
            {!isUser && (
                <div className="ls-vn-speaker ls-vn-speaker-guest">
                    {renderAvatar(speakerName, avatar)}
                    <span>{speakerName}</span>
                </div>
            )}
            {renderUserSpeakerBadge(context, isUser)}
            <p className="ls-vn-text">{frame.content}</p>
            {renderAdvanceIndicator(hasNextFrame)}
        </div>
    );
}

function renderCardFrame(
    className: string,
    icon: React.ReactNode,
    label: string | null,
    content: string,
    hasNextFrame: boolean,
) {
    return (
        <div className={className}>
            {icon}
            <div className="ls-vn-card-copy">
                {label && <span className="ls-vn-card-label">{label}</span>}
                <span>{content}</span>
            </div>
            {renderAdvanceIndicator(hasNextFrame)}
        </div>
    );
}

function renderVnFrame(frame: SceneFrame, context: RenderContext, hasNextFrame: boolean) {
    switch (frame.kind) {
        case 'dialogue':
            return renderDialogueFrame(frame, context, hasNextFrame);
        case 'interview': {
            const speaker = getSpeakerCharacter(context, frame.speakerName);
            const speakerName = speaker?.name || frame.speakerName;
            return (
                <div className="ls-vn-dialogue ls-vn-dialogue-interview">
                    <div className="ls-vn-speaker ls-vn-speaker-guest">
                        {renderAvatar(speakerName, speaker?.avatar)}
                        <span>{speakerName}</span>
                        <Camera size={14} weight="bold" />
                    </div>
                    {renderUserSpeakerBadge(context)}
                    <p className="ls-vn-text">{frame.content}</p>
                    {renderAdvanceIndicator(hasNextFrame)}
                </div>
            );
        }
        case 'action':
            return renderCardFrame(
                'ls-vn-action-card',
                <Sparkle size={16} weight="fill" />,
                null,
                frame.content,
                hasNextFrame,
            );
        case 'system':
            return renderCardFrame(
                'ls-vn-system-card',
                <Sparkle size={16} weight="fill" />,
                null,
                frame.content,
                hasNextFrame,
            );
        case 'phone':
            return renderCardFrame(
                'ls-vn-phone-card',
                <ChatCircleText size={16} weight="bold" />,
                null,
                frame.content,
                hasNextFrame,
            );
        case 'text':
        default:
            return renderCardFrame('ls-vn-action-card', null, null, frame.content, hasNextFrame);
    }
}

const LoveShowScene: React.FC<LoveShowSceneProps> = ({
    scene,
    characters,
    userProfile,
    turns,
    inputValue,
    isSending,
    isClosingScene,
    closingStatus,
    error,
    canRetry,
    showReadyToCutHint = false,
    readyToCutHint = '这一拍已经足够被剪进正片了。',
    finishButtonLabel = '收束',
    finishButtonBusyLabel = '收束中',
    finishConfirmTitle = '结束本段吗？',
    finishConfirmDescription = '结束后会保存本段。',
    finishConfirmPrimaryLabel = '确认结束',
    finishConfirmSecondaryLabel = '继续本场',
    onInputChange,
    onSend,
    onRetry,
    onCompleteScene,
}) => {
    const [isGuestDrawerOpen, setIsGuestDrawerOpen] = useState(false);
    const [activeFrameIndex, setActiveFrameIndex] = useState(0);
    const [isFinishConfirmOpen, setIsFinishConfirmOpen] = useState(false);
    const previousFrameCountRef = useRef(0);
    const previousSceneIdRef = useRef(scene.id);
    const characterMap = useMemo(() => new Map(characters.map(char => [char.id, char])), [characters]);
    const characterByName = useMemo(
        () => new Map(characters.map(char => [normalizeSpeakerName(char.name), char])),
        [characters],
    );
    const userName = userProfile.name?.trim() || '你';
    const sceneFrames = useMemo(
        () => buildSceneFrames(turns, userName, userProfile.avatar),
        [turns, userName, userProfile.avatar],
    );
    const activeFrame = sceneFrames[activeFrameIndex];
    const hasNextFrame = activeFrameIndex < sceneFrames.length - 1;
    const locationGuestIds = scene.locationGuestIds && scene.locationGuestIds.length > 0
        ? scene.locationGuestIds
        : scene.characterIds;
    const locationCharacters = locationGuestIds
        .map(id => characterMap.get(id))
        .filter((char): char is CharacterProfile => Boolean(char));
    const focusIdSet = useMemo(() => new Set(scene.characterIds), [scene.characterIds]);
    const locationGuestCount = locationGuestIds.length || locationCharacters.length;
    const renderContext = useMemo(
        () => ({ characterByName, userProfile, userName }),
        [characterByName, userProfile, userName],
    );
    const sceneVisualStyle = {
        '--ls-location-gradient': getLoveShowSceneLocationGradient(scene.locationId),
        '--ls-location-image': `url("${getLoveShowSceneLocationWallpaper(scene.locationId)}")`,
    } as React.CSSProperties;

    useEffect(() => {
        const previousFrameCount = previousFrameCountRef.current;
        const didSceneChange = previousSceneIdRef.current !== scene.id;

        if (didSceneChange) {
            previousSceneIdRef.current = scene.id;
            previousFrameCountRef.current = 0;
        }

        if (sceneFrames.length === 0) {
            setActiveFrameIndex(0);
            previousFrameCountRef.current = 0;
            return;
        }

        setActiveFrameIndex(currentIndex => {
            if (didSceneChange || previousFrameCount === 0) return 0;
            if (sceneFrames.length > previousFrameCount) return previousFrameCount;
            return Math.min(currentIndex, sceneFrames.length - 1);
        });
        previousFrameCountRef.current = sceneFrames.length;
    }, [scene.id, sceneFrames.length]);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        onSend();
    };

    const handleAdvanceFrame = () => {
        if (!hasNextFrame) return;
        setActiveFrameIndex(index => Math.min(index + 1, sceneFrames.length - 1));
    };

    const handleConfirmCompleteScene = () => {
        setIsFinishConfirmOpen(false);
        onCompleteScene();
    };

    return (
        <section className="ls-scene" aria-label="心动放送场景">
            <div className="ls-scene-wallpaper" style={sceneVisualStyle} aria-hidden="true" />
            <div className="ls-scene-backdrop" />
            <header className="ls-scene-header">
                <div className="ls-live-mark">
                    <span className="ls-live-dot" />
                    {LOVE_SHOW_COPY.liveStatus}
                </div>
                <div className="ls-scene-title">
                    <span>Day {scene.dayNumber}</span>
                    <h1>{scene.locationName}</h1>
                </div>
            </header>

            <button
                type="button"
                className="ls-presence-trigger"
                onClick={() => setIsGuestDrawerOpen(true)}
                aria-label={`打开${scene.locationName}在场嘉宾列表`}
            >
                <span className="ls-presence-count">
                    <UsersThree size={15} weight="fill" />
                    在场 {locationGuestCount}
                </span>
            </button>

            {isGuestDrawerOpen && (
                <div className="ls-location-drawer-layer" role="presentation" onClick={() => setIsGuestDrawerOpen(false)}>
                    <section
                        className="ls-location-drawer"
                        role="dialog"
                        aria-label={`${scene.locationName}在场嘉宾`}
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="ls-location-drawer-header">
                            <div>
                                <span>{scene.locationName}</span>
                                <strong>在场嘉宾 {locationGuestCount}</strong>
                            </div>
                            <button type="button" onClick={() => setIsGuestDrawerOpen(false)} aria-label="关闭在场嘉宾列表" title="关闭">
                                <X size={18} weight="bold" />
                            </button>
                        </div>
                        <div className="ls-location-guest-list">
                            {locationCharacters.length > 0 ? locationCharacters.map(char => (
                                <div key={char.id} className="ls-location-guest-row">
                                    {renderAvatar(char.name, char.avatar, 'ls-location-guest-avatar')}
                                    <div>
                                        <strong>{char.name}</strong>
                                        <span>{focusIdSet.has(char.id) ? '本拍入镜' : '在场旁观'}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="ls-location-guest-row">
                                    <span className="ls-location-guest-avatar ls-avatar-fallback">L</span>
                                    <div>
                                        <strong>节目现场</strong>
                                        <span>镜头等待嘉宾入场</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}

            <main className="ls-transcript ls-vn-layer" aria-live="polite">
                {activeFrame ? (
                    <button
                        type="button"
                        className="ls-vn-frame-button"
                        onClick={handleAdvanceFrame}
                        disabled={!hasNextFrame}
                        aria-label={hasNextFrame ? '继续下一句' : '当前对话'}
                    >
                        {renderVnFrame(activeFrame, renderContext, hasNextFrame)}
                    </button>
                ) : (
                    <div className="ls-empty-transcript">
                        <Sparkle size={22} weight="fill" />
                        <span>镜头已开启。</span>
                    </div>
                )}
            </main>

            {error && (
                <div className="ls-error" role="status">
                    <span>{error}</span>
                    {canRetry && (
                        <button type="button" onClick={onRetry} className="ls-icon-text-btn">
                            <ArrowCounterClockwise size={16} weight="bold" />
                            重试
                        </button>
                    )}
                </div>
            )}

            {isClosingScene && closingStatus && (
                <div className="ls-closing-status" role="status">
                    {closingStatus}
                </div>
            )}

            {showReadyToCutHint && (
                <div className="ls-ready-cut-hint" role="status">
                    <Sparkle size={14} weight="fill" />
                    <span>{readyToCutHint}</span>
                </div>
            )}

            <form className="ls-input-bar" onSubmit={handleSubmit}>
                <textarea
                    value={inputValue}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            onSend();
                        }
                    }}
                    placeholder="写下你的回应..."
                    aria-label="心动放送发言"
                    rows={1}
                    disabled={isSending}
                />
                <button
                    type="submit"
                    className="ls-round-btn ls-send-btn"
                    disabled={isSending || !inputValue.trim()}
                    aria-label="发送"
                    title="发送"
                >
                    <PaperPlaneTilt size={20} weight="fill" />
                </button>
                <button
                    type="button"
                    className="ls-round-btn ls-finish-btn"
                    onClick={() => setIsFinishConfirmOpen(true)}
                    disabled={isClosingScene}
                    aria-label={finishButtonLabel}
                    title={finishButtonLabel}
                >
                    <CheckCircle size={20} weight="bold" />
                    <span>{isClosingScene ? finishButtonBusyLabel : finishButtonLabel}</span>
                </button>
            </form>

            {isFinishConfirmOpen && (
                <div className="ls-confirm-layer" role="presentation" onClick={() => setIsFinishConfirmOpen(false)}>
                    <section
                        className="ls-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="确认结束本场"
                        onClick={event => event.stopPropagation()}
                    >
                        <div className="ls-confirm-icon">
                            <CheckCircle size={22} weight="bold" />
                        </div>
                        <div className="ls-confirm-copy">
                            <strong>{finishConfirmTitle}</strong>
                            <span>{finishConfirmDescription}</span>
                        </div>
                        <div className="ls-confirm-actions">
                            <button type="button" className="ls-secondary-action" onClick={() => setIsFinishConfirmOpen(false)}>
                                {finishConfirmSecondaryLabel}
                            </button>
                            <button type="button" className="ls-primary-action" onClick={handleConfirmCompleteScene}>
                                {finishConfirmPrimaryLabel}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
};

export default LoveShowScene;
