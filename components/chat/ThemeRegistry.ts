
/**
 * ThemeRegistry — Plugin Registry Pattern
 *
 * Maps theme IDs to their runtime-only behaviors (React components, audio URLs).
 * This keeps ChatTheme (types.ts) as pure serializable data for IndexedDB safety,
 * while allowing each theme to own its custom UI and sounds.
 */
import React from 'react';
import { Message } from '../../types';
import WeChatInputBar from './plugins/WeChatInputBar';
import WeChatTransferCard from './plugins/WeChatTransferCard';
import WeChatActionsPanel,{ ActionsPanelProps } from './plugins/WeChatActionsPanel';
import WeChatVoiceBubble from './plugins/WeChatVoiceBubble';
import type { VoiceBubbleProps } from './VoiceBubble';

/** Shared props for all transfer card plugins */
export interface TransferCardProps {
    message: Message;
    isUser: boolean;
    charName: string;
    selectionMode: boolean;
    onTransferAction?: (msg: Message) => void;
}

/** Runtime plugin interface — never stored in DB */
export interface ThemePlugin {
    id: string;
    /** Custom notification sound URL (undefined = no sound) */
    notificationSound?: string;
    /** Custom input bar component (undefined = use default pill layout) */
    InputBar?: React.FC<{
        input: string;
        setInput: (v: string) => void;
        showPanel: 'none' | 'actions' | 'emojis' | 'chars';
        setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
        onSend: () => void;
        // Voice Recording Support
        onVoiceMessage?: (blob: Blob, duration: number) => void;
        voiceRecorderState?: 'idle' | 'recording' | 'processing';
        voiceRecordingDuration?: number;
        onStartRecording?: () => Promise<boolean>;
        onStopRecording?: () => Promise<{ blob: Blob; duration: number } | null>;
        onCancelRecording?: () => void;
        voiceRecorderError?: string | null;
        isVoiceProcessing?: boolean;
        analyserNode?: AnalyserNode | null;
    }>;
    /** Custom transfer card component (undefined = use neutral fallback card) */
    TransferCard?: React.FC<TransferCardProps>;
    /** Custom actions panel (undefined = use default colored grid) */
    ActionsPanel?: React.FC<ActionsPanelProps>;
    /** Custom voice bubble for message rendering (undefined = use generic VoiceBubble) */
    VoiceBubble?: React.FC<VoiceBubbleProps>;
}

/**
 * Registry of theme plugins keyed by ChatTheme.id.
 * Only preset themes with custom behaviors need entries here.
 * Custom (DIY) themes automatically fall through to the default input bar.
 */
export const THEME_PLUGINS: Record<string, ThemePlugin> = {
    'default': {
        id: 'default',
        notificationSound: 'https://image2url.com/r2/default/audio/1771769870930-c9be8c96-c34e-4509-bc81-48619ad5406d.wav',
        InputBar: WeChatInputBar,
        TransferCard: WeChatTransferCard,
        ActionsPanel: WeChatActionsPanel,
        VoiceBubble: WeChatVoiceBubble
    },
    'waterdrop': {
        id: 'waterdrop',
        // No custom InputBar → falls back to the default pill layout
        // No notificationSound → no sound plays
    },
    'glassmorphism': {
        id: 'glassmorphism',
        // No custom InputBar → falls back to the default pill layout
        // No notificationSound → no sound plays
    },
};
