import React,{ useEffect,useRef,useCallback } from 'react';
import { useOS } from '../context/OSContext';
import VoiceCallScreen from './voicecall/VoiceCallScreen';
import { CallDirection } from './voicecall/useVoiceCall';
import { DEFAULT_REPLY_CHANNEL,isVoiceCallReplyChannel } from './voicecall/voiceCallTypes';
import type { VoiceCallMode,VoiceCallReplyChannel } from './voicecall/voiceCallTypes';
import './voicecall/voicecall.css';

const VoiceCallApp: React.FC = () => {
    const {
        activeCharacterId, characters, closeApp, appParams, registerBackHandler,
        ttsConfig, sttConfig, apiConfig, addToast, userProfile,
    } = useOS();
    const endCallRef = useRef<(() => void) | null>(null);

    const direction: CallDirection = (appParams?.direction as CallDirection) || 'outgoing';
    const incomingMode: VoiceCallMode | undefined = appParams?.mode as VoiceCallMode | undefined;
    const incomingReplyChannel: VoiceCallReplyChannel = isVoiceCallReplyChannel(appParams?.replyChannel)
        ? appParams.replyChannel
        : DEFAULT_REPLY_CHANNEL;
    const callReason: string | undefined = appParams?.callReason as string | undefined;

    // 获取当前通话角色的信息
    const char = characters.find(c => c.id === activeCharacterId);

    useEffect(() => {
        if (!char) {
            closeApp();
        }
    }, [char, closeApp]);

    // 注册 Back 键处理：通话中先挂断，而不是直接退出
    useEffect(() => {
        const unregister = registerBackHandler(() => {
            const handler = endCallRef.current;
            if (handler) {
                handler();
                return true; // 已处理，阻止默认 closeApp
            }
            return false; // 允许默认 closeApp
        });
        return unregister;
    }, [registerBackHandler]);

    // 暴露 endCall 给 back handler
    const setEndCallHandler = useCallback((handler: (() => void) | null) => {
        endCallRef.current = handler;
    }, []);

    if (!char) return null;

    return (
        <VoiceCallScreen
            avatarUrl={char.avatar}
            name={char.name}
            char={char}
            userProfile={userProfile}
            direction={direction}
            onCloseApp={closeApp}
            onRegisterEndCall={setEndCallHandler}
            ttsConfig={ttsConfig}
            sttConfig={sttConfig}
            apiConfig={apiConfig}
            addToast={addToast}
            incomingMode={incomingMode}
            incomingReplyChannel={incomingReplyChannel}
            callReason={callReason}
        />
    );
};

export default VoiceCallApp;
