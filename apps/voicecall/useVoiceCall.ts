import { useState,useEffect,useCallback,useRef } from 'react';

export type CallState = 'mode-select' | 'dialing' | 'ringing' | 'connecting' | 'active' | 'ended';
export type CallDirection = 'outgoing' | 'incoming';

export const useVoiceCall = (direction: CallDirection = 'outgoing') => {
    // outgoing: mode-select → dialing → active → ended
    // incoming: ringing → connecting → active → ended
    const [callState, setCallState] = useState<CallState>(
        direction === 'outgoing' ? 'mode-select' : 'ringing'
    );
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // 🔴 Fix #1: 用 ref 持有所有内部 timer，unmount 时统一清理
    const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 清理函数：组件卸载时清除所有 timer
    useEffect(() => {
        return () => {
            if (connectTimerRef.current) {
                clearTimeout(connectTimerRef.current);
                connectTimerRef.current = null;
            }
        };
    }, []);

    // Outgoing: char 自动接听（模拟 2~3 声嘟嘟后接听）
    useEffect(() => {
        if (direction === 'outgoing' && callState === 'dialing') {
            const rings = 2 + Math.floor(Math.random() * 2); // 2 or 3 rings
            const delay = rings * 5000 + Math.random() * 1000; // 每声 ~5s + 随机偏移
            const timeout = setTimeout(() => {
                console.log(`[VoiceCall] Char answered after ${rings} rings (outgoing)`);
                setCallState('active');
            }, delay);
            return () => clearTimeout(timeout);
        }
    }, [direction, callState]);

    // Incoming: 来电超时自动挂断（30s 无人接听 → 未接来电）
    useEffect(() => {
        if (direction === 'incoming' && callState === 'ringing') {
            const timeout = setTimeout(() => {
                console.log('[VoiceCall] Incoming call timed out (30s), auto-ending');
                setCallState('ended');
            }, 30000);
            return () => clearTimeout(timeout);
        }
    }, [direction, callState]);

    // active 通话计时器
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (callState === 'active') {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [callState]);

    // isSpeaking 现在由外部 engine 的 onAISpeakingChange 回调驱动，
    // 不再用 Math.random() 模拟
    // （callState 不为 active 时重置为 false）
    useEffect(() => {
        if (callState !== 'active') {
            setIsSpeaking(false);
        }
    }, [callState]);

    // Incoming: 用户按接听后 → connecting → active
    // 🔴 Fix #1: setTimeout 通过 ref 管理，unmount 时自动清理
    const startCall = useCallback(() => {
        console.log('[VoiceCall] startCall (incoming accepted)');
        setCallState('connecting');
        // 清理之前可能存在的 timer
        if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
        connectTimerRef.current = setTimeout(() => {
            console.log('[VoiceCall] Call connected');
            setCallState('active');
            connectTimerRef.current = null;
        }, 4500); // 4.5s：足够引擎预热 (mic+VAD+LLM+TTS)，同时展示"翻通讯录"动画
    }, []);

    const endCall = useCallback(() => {
        console.log('[VoiceCall] endCall clicked');
        // 清理 connecting timer（如果正在 connecting 阶段挂断）
        if (connectTimerRef.current) {
            clearTimeout(connectTimerRef.current);
            connectTimerRef.current = null;
        }
        setCallState('ended');
    }, []);

    const toggleMute = useCallback(() => {
        console.log('[VoiceCall] toggleMute');
        setIsMuted(prev => !prev);
    }, []);



    /** mode-select → dialing（用户选择完模式后调用） */
    const confirmMode = useCallback(() => {
        console.log('[VoiceCall] confirmMode → dialing');
        setCallState('dialing');
    }, []);

    return {
        callState,
        callDuration,
        isMuted,
        isSpeaking,
        setIsSpeaking,
        startCall,
        endCall,
        toggleMute,
        confirmMode,
    };
};
