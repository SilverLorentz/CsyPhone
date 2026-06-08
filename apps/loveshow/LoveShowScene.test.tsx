// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterProfile, UserProfile } from '../../types';
import type { LoveShowScene as LoveShowSceneModel } from '../../types/loveshow';
import LoveShowScene, { type LoveShowTurn } from './LoveShowScene';

function character(id: string, name: string): CharacterProfile {
    return {
        id,
        name,
        avatar: '',
        description: '',
        systemPrompt: '',
        memories: [],
    };
}

const characters = [
    character('a', '阿昊'),
    character('b', '白榆'),
    character('c', '程岚'),
    character('d', '渡也'),
    character('e', '恩慈'),
    character('f', '傅闻'),
];

const userProfile: UserProfile = {
    name: '莫',
    avatar: '',
    bio: '',
};

const scene: LoveShowSceneModel = {
    id: 'scene_1',
    dayNumber: 1,
    locationId: 'living_room',
    locationName: '合宿屋客厅',
    characterIds: ['a', 'b', 'c', 'd'],
    locationGuestIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    atmosphere: '全员集合，氛围热烈',
    status: 'active',
};

function renderScene(turns: LoveShowTurn[] = [], overrides: Partial<ComponentProps<typeof LoveShowScene>> = {}) {
    const props = {
        scene,
        characters,
        userProfile,
        turns,
        inputValue: '',
        isSending: false,
        isClosingScene: false,
        closingStatus: null,
        error: null,
        canRetry: false,
        onInputChange: vi.fn(),
        onSend: vi.fn(),
        onRetry: vi.fn(),
        onCompleteScene: vi.fn(),
        ...overrides,
    };

    return render(
        <LoveShowScene {...props} />,
    );
}

describe('LoveShowScene', () => {
    it('shows full location guest count and opens the complete guest drawer', () => {
        renderScene();

        expect(screen.getByText('在场 6')).toBeTruthy();
        expect(screen.queryByText('+2')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '打开合宿屋客厅在场嘉宾列表' }));

        const drawer = screen.getByRole('dialog', { name: '合宿屋客厅在场嘉宾' });
        expect(within(drawer).getByText('在场嘉宾 6')).toBeTruthy();
        expect(within(drawer).getByText('阿昊')).toBeTruthy();
        expect(within(drawer).getByText('傅闻')).toBeTruthy();
        expect(within(drawer).getAllByText('本拍入镜')).toHaveLength(4);
        expect(within(drawer).getAllByText('在场旁观')).toHaveLength(2);
    });

    it('does not render scene atmosphere copy in the header', () => {
        renderScene([], {
            scene: {
                ...scene,
                atmosphere: '三人片段正式开机。灯光很近。导演提示：下一轮镜头会更容易把阿昊推到你身边。三人片段的张力必须围绕用户的注意力落点；嘉宾之间只能较劲、观察、误会或助攻，不允许互相心动、互选或组 CP。',
            },
        });

        expect(screen.getByText('合宿屋客厅')).toBeTruthy();
        expect(screen.queryByText('三人片段正式开机。灯光很近。')).toBeNull();
        expect(screen.queryByText('Love stays on air')).toBeNull();
        expect(screen.queryByText(/导演提示/)).toBeNull();
        expect(screen.queryByText(/互选/)).toBeNull();
        expect(screen.queryByText(/CP/)).toBeNull();
    });

    it('uses theater location visuals instead of falling back to the default living room', () => {
        const { container } = renderScene([], {
            scene: {
                ...scene,
                id: 'theater_scene_arcade',
                locationId: 'ls_arcade_corner',
                locationName: '街机角落',
            },
        });

        const wallpaper = container.querySelector<HTMLElement>('.ls-scene-wallpaper');

        expect(screen.getByText('街机角落')).toBeTruthy();
        expect(wallpaper?.style.getPropertyValue('--ls-location-image')).toContain('theater-arcade-corner.jpg');
        expect(wallpaper?.style.getPropertyValue('--ls-location-image')).not.toContain('house-living-room.jpg');
    });

    it('cleans internal direction from historical assistant text', () => {
        renderScene([
            {
                id: 'assistant_leak',
                role: 'assistant',
                content: '*灯光靠近露台。导演提示：下一轮镜头会更容易把阿昊推到你身边。*阿昊：「风有点大。」',
                createdAt: 1,
            },
        ]);

        expect(screen.getByText('灯光靠近露台。')).toBeTruthy();
        expect(screen.queryByText(/导演提示/)).toBeNull();
    });

    it('renders user identity on the right side and advances to a separate system prompt frame', () => {
        renderScene([
            { id: 'user_1', role: 'user', content: '我先坐这里。', createdAt: 1 },
            { id: 'system_1', role: 'system', content: '系统提示：镜头切到客厅全景。', createdAt: 2 },
        ]);

        expect(screen.getAllByText('莫').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('莫').some(node => Boolean(node.closest('.ls-vn-speaker-user')))).toBe(true);
        expect(screen.getByText('我先坐这里。').closest('.ls-vn-dialogue-user')).toBeTruthy();
        expect(screen.queryByText('系统提示：镜头切到客厅全景。')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));

        expect(screen.getByText('系统提示：镜头切到客厅全景。').closest('.ls-vn-system-card')).toBeTruthy();
        expect(screen.queryByText('系统提示')).toBeNull();
    });

    it('splits action narration from guest dialogue across click-through VN frames', () => {
        renderScene([
            { id: 'assistant_1', role: 'assistant', content: '*他低头笑了一下* 阿昊：「你来了」', createdAt: 1 },
        ]);

        expect(screen.getByText('他低头笑了一下').closest('.ls-vn-action-card')).toBeTruthy();
        expect(screen.queryByText('动作描写')).toBeNull();
        expect(screen.queryByText('你来了')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '继续下一句' }));

        expect(screen.getByText('阿昊')).toBeTruthy();
        expect(screen.getByText('阿昊').closest('.ls-vn-speaker-guest')).toBeTruthy();
        expect(screen.getByText('你来了').closest('.ls-vn-dialogue-guest')).toBeTruthy();
    });

    it('renders fallback narration text without a visible narration label', () => {
        renderScene([
            { id: 'assistant_1', role: 'assistant', content: '灯光落在沙发边缘，所有人的声音都低了一点。', createdAt: 1 },
        ]);

        expect(screen.getByText('灯光落在沙发边缘，所有人的声音都低了一点。').closest('.ls-vn-action-card')).toBeTruthy();
        expect(screen.queryByText('旁白')).toBeNull();
    });

    it('renders phone script content without a visible source label', () => {
        renderScene([
            { id: 'assistant_1', role: 'assistant', content: '📱 傅闻发来一条镜头之外消息。', createdAt: 1 },
        ]);

        expect(screen.getByText('傅闻发来一条镜头之外消息。').closest('.ls-vn-phone-card')).toBeTruthy();
        expect(screen.queryByText('小手机')).toBeNull();
    });

    it('asks for confirmation before completing the current scene', () => {
        const onCompleteScene = vi.fn();
        renderScene([], { onCompleteScene });

        fireEvent.click(screen.getByRole('button', { name: '收束' }));

        const dialog = screen.getByRole('dialog', { name: '确认结束本场' });
        expect(within(dialog).getByText('结束本段吗？')).toBeTruthy();
        expect(onCompleteScene).not.toHaveBeenCalled();

        fireEvent.click(within(dialog).getByRole('button', { name: '确认结束' }));

        expect(onCompleteScene).toHaveBeenCalledTimes(1);
    });

    it('supports theater cut copy and lets the user keep the fragment rolling', () => {
        const onCompleteScene = vi.fn();
        renderScene([], {
            onCompleteScene,
            showReadyToCutHint: true,
            finishButtonLabel: '收束片段',
            finishButtonBusyLabel: '收束中',
            finishConfirmTitle: '收束这段？',
            finishConfirmDescription: '收束后会生成心动回声。',
            finishConfirmPrimaryLabel: '确认收束',
            finishConfirmSecondaryLabel: '再留一拍',
        });

        expect(screen.getByText('这一拍已经足够被剪进正片了。')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: '收束片段' }));
        const dialog = screen.getByRole('dialog', { name: '确认结束本场' });
        expect(within(dialog).getByText('收束这段？')).toBeTruthy();
        expect(within(dialog).getByText('收束后会生成心动回声。')).toBeTruthy();

        fireEvent.click(within(dialog).getByRole('button', { name: '再留一拍' }));

        expect(screen.queryByRole('dialog', { name: '确认结束本场' })).toBeNull();
        expect(onCompleteScene).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '收束片段' }));
        fireEvent.click(within(screen.getByRole('dialog', { name: '确认结束本场' })).getByRole('button', { name: '确认收束' }));

        expect(onCompleteScene).toHaveBeenCalledTimes(1);
    });
});
