import type { CharacterProfile, Message, RealtimeConfig, UserProfile } from '../../types';

export interface HandlerContext {
    char: CharacterProfile;
    userProfile: UserProfile;
    apiConfig: any;
    realtimeConfig?: RealtimeConfig;
    fullMessages: any[];
    historyMsgCount: number;
    baseUrl: string;
    headers: Record<string, string>;
    setMessages: (msgs: Message[]) => void;
    updateTokenUsage: (data: any, msgCount: number, pass: string) => void;
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setRecallStatus?: (s: string) => void;
    setSearchStatus?: (s: string) => void;
    setDiaryStatus?: (s: string) => void;
    setWeiboStatus?: (s: string) => void;
    setXhsStatus?: (s: string) => void;
    xsecTokenCache?: Map<string, string>;
    noteTitleCache?: Map<string, string>;
    commentUserIdCache?: Map<string, string>;
    commentAuthorNameCache?: Map<string, string>;
    commentParentIdCache?: Map<string, string>;
}
