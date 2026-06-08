import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StoryPhoneScreen, { PHONE_APPS } from './StoryPhoneScreen';

describe('StoryPhoneScreen home UI', () => {
    it('uses dynamic home copy and keeps the active app dot visible', () => {
        const musicApp = PHONE_APPS.find(app => app.id === 'music') || PHONE_APPS[0];
        const { container } = render(
            <StoryPhoneScreen
                charName="陈步青"
                activeAppId="home"
                spotlightApp={musicApp}
                currentTime="11:50"
                homeSurface={{
                    headline: '刚才的对话还没暗下去。',
                    stickyNote: '「她把伞留在玄关」',
                    spotlightDetail: '音乐会贴着刚才那一幕生成。',
                    spotlightFooter: '最近对话 · 11:50',
                }}
                onGenerateApp={() => undefined}
                onOpenApp={() => undefined}
            />,
        );

        expect(screen.getByText('刚才的对话还没暗下去。')).toBeInTheDocument();
        const stickyNote = screen.getByText('「她把伞留在玄关」');
        expect(stickyNote).toBeInTheDocument();
        expect(stickyNote.className).toContain('line-clamp-3');
        expect(stickyNote.className).toContain('break-words');
        expect(screen.getByText('音乐会贴着刚才那一幕生成。')).toBeInTheDocument();
        expect(screen.getByText('最近对话 · 11:50')).toBeInTheDocument();
        expect(screen.queryByText('记得按时吃饭。')).not.toBeInTheDocument();
        expect(container.innerHTML).not.toContain('d8d2c6');
        expect(container.innerHTML).not.toContain('ded8cb');
        const unreadDots = container.querySelectorAll('.story-phone-unread-dot');
        expect(unreadDots.length).toBeGreaterThan(0);
        unreadDots.forEach(dot => {
            expect(dot.parentElement?.className).not.toContain('overflow-hidden');
        });
    });

    it('renders generated clock clues with readable system colors', () => {
        const clockApp = PHONE_APPS.find(app => app.id === 'clock') || PHONE_APPS[0];
        render(
            <StoryPhoneScreen
                charName="陈步青"
                activeAppId="clock"
                spotlightApp={clockApp}
                apps={[clockApp]}
                currentTime="01:42"
                clue={{
                    appId: 'clock',
                    appName: '时钟',
                    title: '时钟',
                    subtitle: '屏幕亮起中',
                    timestamp: '22:52',
                    items: [
                        {
                            label: '醒来前别关',
                            value: '06:30 · 每天',
                            detail: '起床前再响一次',
                        },
                        {
                            label: '异常倒计时',
                            value: '剩余 00:07',
                            detail: '刚刚被暂停过',
                        },
                    ],
                    evidenceText: '时钟里有一组异常提醒。',
                    insertSummary: '用户看见了时钟里的异常提醒。',
                }}
            />,
        );

        expect(screen.getByText('异常提醒')).toBeInTheDocument();
        expect(screen.getByText('醒来前别关')).toBeInTheDocument();
        expect(screen.getByText(/06:30 · 每天/)).toBeInTheDocument();
        expect(screen.getByText(/起床前再响一次/)).toBeInTheDocument();

        const clockTime = screen.getAllByText('22:52').find(element => element.className.includes('text-5xl'));
        expect(clockTime).toBeTruthy();
        expect(clockTime?.className).not.toContain('text-white');
        expect(clockTime?.getAttribute('style')).toContain('var(--story-phone-text)');

        const alarmLabel = screen.getByText('醒来前别关');
        expect(alarmLabel.className).not.toContain('text-white');
        expect(alarmLabel.getAttribute('style')).toContain('var(--story-phone-text)');
    });

    it('opens a WeChat secondary chat screen from the generated clue list', () => {
        const wechatApp = PHONE_APPS.find(app => app.id === 'wechat') || PHONE_APPS[0];
        render(
            <StoryPhoneScreen
                charName="陈步青"
                activeAppId="wechat"
                spotlightApp={wechatApp}
                apps={[wechatApp]}
                currentTime="11:52"
                clue={{
                    appId: 'wechat',
                    appName: '微信',
                    title: '微信停在聊天页',
                    subtitle: '置顶会话有未读',
                    timestamp: '11:52',
                    items: [
                        {
                            label: '置顶好友',
                            value: '对方: 你刚刚是不是看见了？\n我: 没有，屏幕自己亮的。',
                            detail: '撤回过一条消息',
                        },
                    ],
                    evidenceText: '微信里有一段没来得及藏好的聊天。',
                    insertSummary: '用户看见了微信置顶好友的异常聊天。',
                }}
            />,
        );

        fireEvent.click(screen.getByText('置顶好友').closest('button') as HTMLButtonElement);

        expect(screen.getByText('置顶好友')).toBeInTheDocument();
        expect(screen.getByText('只读模式，不能发送消息')).toBeInTheDocument();
        expect(screen.getByText('你刚刚是不是看见了？')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('返回上一层'));

        expect(screen.getAllByText('微信').length).toBeGreaterThan(0);
        expect(screen.getByText('通讯录')).toBeInTheDocument();
        expect(screen.getByText('发现')).toBeInTheDocument();
    });

    it('renders QQ like a real message app and opens a readonly roaming chat', () => {
        const qqApp = PHONE_APPS.find(app => app.id === 'qq') || PHONE_APPS[0];
        render(
            <StoryPhoneScreen
                charName="陈步青"
                activeAppId="qq"
                spotlightApp={qqApp}
                apps={[qqApp]}
                currentTime="22:08"
                clue={{
                    appId: 'qq',
                    appName: 'QQ',
                    title: 'QQ',
                    subtitle: '消息、群聊和空间都还亮着',
                    timestamp: '22:08',
                    items: [
                        {
                            label: '高三旧群(34)',
                            value: '林野: 你头像怎么又换回来了？\n我: 手滑。\n林野: 别装，空间访客看得到。',
                            detail: '22:08 · 群聊',
                        },
                        {
                            label: 'QQ空间访客',
                            value: '昨晚 23:41 有人连续看了三条说说。',
                            detail: '仅好友可见',
                        },
                        {
                            label: '评论数',
                            value: '7',
                            detail: '空间互动',
                        },
                        {
                            label: '群文件',
                            value: '毕业照原图.zip 最近被重新下载。',
                            detail: '微云 · 148MB',
                        },
                    ],
                    evidenceText: 'QQ 停在消息页，群聊、空间、群文件都有痕迹。',
                    insertSummary: '用户看见了 QQ 里的旧群和空间访问记录。',
                }}
            />,
        );

        expect(screen.getAllByText('消息').length).toBeGreaterThan(0);
        expect(screen.getByText('搜索好友 / 群聊 / 聊天记录')).toBeInTheDocument();
        expect(screen.getByText('好友动态')).toBeInTheDocument();
        expect(screen.getByText('QQ空间')).toBeInTheDocument();
        expect(screen.getAllByText('群聊').length).toBeGreaterThan(0);
        expect(screen.getAllByText('文件').length).toBeGreaterThan(0);
        expect(screen.getAllByText('联系人').length).toBeGreaterThan(0);
        expect(screen.getByText('动态')).toBeInTheDocument();

        fireEvent.click(screen.getByText('QQ空间').closest('button') as HTMLButtonElement);

        expect(screen.getByText('留言')).toBeInTheDocument();
        expect(screen.getAllByText('访客').length).toBeGreaterThan(0);
        expect(screen.getAllByText('赞').length).toBeGreaterThan(0);
        expect(screen.getAllByText('评论').length).toBeGreaterThan(0);
        expect(screen.getAllByText('转发').length).toBeGreaterThan(0);
        expect(screen.queryByText('评论数')).not.toBeInTheDocument();
        expect(screen.getAllByText('7').length).toBeGreaterThan(0);

        fireEvent.click(screen.getByLabelText('返回上一层'));

        fireEvent.click(screen.getByText('高三旧群(34)').closest('button') as HTMLButtonElement);

        expect(screen.getAllByText(/QQ漫游记录/).length).toBeGreaterThan(0);
        expect(screen.getByText('只读漫游记录，不能发送消息')).toBeInTheDocument();
        expect(screen.getByText('你头像怎么又换回来了？')).toBeInTheDocument();
    });

    it('keeps WeChat contact buckets, sparse chats, me page, and moments populated from data', () => {
        const wechatApp = PHONE_APPS.find(app => app.id === 'wechat') || PHONE_APPS[0];
        render(
            <StoryPhoneScreen
                charName="祁寒川"
                activeAppId="wechat"
                spotlightApp={wechatApp}
                apps={[wechatApp]}
                currentTime="20:38"
                clue={{
                    appId: 'wechat',
                    appName: '微信',
                    title: '微信',
                    subtitle: '屏幕亮起中',
                    timestamp: '20:38',
                    items: [
                        {
                            label: '京海政务一号工作群(24)',
                            value: '今晚材料先发我。',
                            detail: '20:38',
                        },
                    ],
                    evidenceText: '微信里有工作群和朋友圈。',
                    insertSummary: '用户看见了微信里的工作群和朋友圈。',
                    wechatData: {
                        profile: {
                            id: 'owner',
                            nickname: '祁寒川',
                            wechatId: 'Qi_HC_1224',
                            statusText: '屏幕亮起中',
                        },
                        chats: [
                            {
                                id: 'group-1',
                                type: 'group',
                                title: '京海政务一号工作群(24)',
                                subtitle: '今晚材料先发我。',
                                time: '20:38',
                            },
                            {
                                id: 'private-shen',
                                type: 'private',
                                title: '沈度',
                                subtitle: '刚开完会，楼下的灯还亮着。',
                                time: '00:17',
                            },
                        ],
                        chatMessages: {
                            'group-1': {
                                id: 'group-1',
                                title: '京海政务一号工作群(24)',
                                messages: [
                                    {
                                        id: 'group-1-msg-1',
                                        sender: 'other',
                                        senderName: '沈度',
                                        type: 'text',
                                        text: '今晚材料先发我。明早会前我再核一下。',
                                        time: '20:38',
                                    },
                                ],
                            },
                            'private-shen': {
                                id: 'private-shen',
                                title: '沈度',
                                messages: [
                                    {
                                        id: 'private-shen-msg-1',
                                        sender: 'other',
                                        senderName: '沈度',
                                        type: 'text',
                                        text: '刚开完会，楼下的灯还亮着。',
                                        time: '00:17',
                                    },
                                ],
                            },
                        },
                        contacts: [
                            {
                                id: 'shen-du',
                                name: '沈度',
                                remark: '沈度',
                                groupKey: 'S',
                                tags: ['工作'],
                                source: '群聊',
                                bio: '政策研究',
                                relationshipHint: '转发文章：关于东南沿海自贸区产...',
                            },
                            {
                                id: 'mother',
                                name: '母亲',
                                remark: '母亲',
                                groupKey: 'M',
                                tags: ['家人'],
                                bio: '利益与家族纽带',
                                relationshipHint: '母亲，利益与家族纽带',
                            },
                        ],
                        moments: {
                            posts: [
                                {
                                    id: 'owner-post',
                                    authorId: 'owner',
                                    authorName: '祁寒川',
                                    text: '转发文章：关于东南沿海自贸区产...',
                                    time: '20:16',
                                },
                                {
                                    id: 'bad-profile-post',
                                    authorId: 'mother',
                                    authorName: '母亲',
                                    text: '母亲，利益与家族纽带',
                                    time: '昨天',
                                },
                            ],
                        },
                        enabledFeatures: ['moments'],
                    },
                }}
            />,
        );

        fireEvent.click(screen.getByText('京海政务一号工作群(24)').closest('button') as HTMLButtonElement);
        expect(screen.getByText('今晚材料先发我。')).toBeInTheDocument();
        expect(screen.getByText('明早会前我再核一下。')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('返回上一层'));
        fireEvent.click(screen.getByText('通讯录'));
        fireEvent.click(screen.getByText('群聊').closest('button') as HTMLButtonElement);
        expect(screen.getByText('京海政务一号工作群(24)')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('返回上一层'));
        fireEvent.click(screen.getByText('发现'));
        fireEvent.click(screen.getByText('朋友圈').closest('button') as HTMLButtonElement);
        expect(screen.getAllByText('沈度').length).toBeGreaterThan(0);
        expect(screen.getAllByText('刚开完会，楼下的灯还亮着。').length).toBeGreaterThan(0);
        expect(screen.getAllByText('转发文章：关于东南沿海自贸区产...').length).toBeGreaterThan(0);
        expect(screen.queryByText('母亲，利益与家族纽带')).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('返回上一层'));
        fireEvent.click(screen.getByText('我'));
        expect(screen.getAllByText('微信号：Qi_HC_1224').length).toBeGreaterThan(0);
        expect(screen.getByText('设置')).toBeInTheDocument();
    });
});
