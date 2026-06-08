// ==================== 小红书 Types ====================

export interface XhsNote {
    noteId: string;
    title: string;
    desc: string;
    likes: number;
    author: string;
    authorId: string;
    xsecToken?: string;
    coverUrl?: string;
    type?: string;  // 'normal' | 'video'
}
// XhsManager removed — all XHS ops go through xhsMcpClient.ts
