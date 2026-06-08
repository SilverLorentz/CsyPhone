import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types';
import PhoneEvidenceCard from './PhoneEvidenceCard';

function makeMessage(metadata: Message['metadata']): Message {
    return {
        id: 1,
        charId: 'char-1',
        role: 'system',
        type: 'text',
        content: 'phone evidence',
        timestamp: Date.now(),
        metadata,
    };
}

describe('PhoneEvidenceCard', () => {
    it('renders legacy non-string metadata without throwing', () => {
        render(
            <PhoneEvidenceCard
                message={makeMessage({
                    source: 'phone',
                    phoneType: 'delivery',
                    phoneLabel: { label: '外卖APP' },
                    phoneTitle: { name: '深夜茶餐厅' },
                    phoneDetail: ['招牌奶茶×1', { content: '菠萝包×2' }],
                    phoneValue: { amount: '42' },
                    phoneShop: { status: '已完成' },
                    charName: { name: 'Sully' },
                })}
            />,
        );

        expect(screen.getByText('深夜茶餐厅')).toBeInTheDocument();
        expect(screen.getByText(/招牌奶茶/)).toBeInTheDocument();
        expect(screen.getByText(/42/)).toBeInTheDocument();
    });

    it('renders grouped Netease music evidence as a playlist page', () => {
        render(
            <PhoneEvidenceCard
                message={makeMessage({
                    source: 'phone',
                    phoneType: 'netease_music_page',
                    phoneLabel: '网易云音乐',
                    phoneProfileNickname: '夜航员',
                    phoneProfileLevel: 8,
                    phoneProfileSignature: '不解释，只循环。',
                    phoneProfilePlayCount: 4821,
                    phoneNeteaseTracks: [
                        {
                            title: '红豆',
                            artist: '王菲',
                            tag: '红心',
                            comment: '这首没有留下话，只是反复听。',
                            playlistName: '不会发出去的话',
                            playlistCount: 23,
                            playlistIndex: 0,
                            songIndex: 0,
                        },
                        {
                            title: 'Everybody’s Got to Learn Sometime',
                            artist: 'Beck',
                            comment: '像把一句话吞回去。',
                            playlistName: '不会发出去的话',
                            playlistCount: 23,
                            playlistIndex: 0,
                            songIndex: 1,
                        },
                    ],
                    charName: 'Sully',
                })}
            />,
        );

        expect(screen.getByText('夜航员')).toBeInTheDocument();
        expect(screen.getByText('不会发出去的话')).toBeInTheDocument();
        expect(screen.getByText('红豆')).toBeInTheDocument();
        expect(screen.getByText('王菲')).toBeInTheDocument();
        expect(screen.getByText('这首没有留下话，只是反复听。')).toBeInTheDocument();
    });

    it('renders Shiguang camera evidence as a polaroid with character comment', () => {
        const dataUrl = `data:image/jpeg;base64,${'a'.repeat(1800)}`;

        render(
            <PhoneEvidenceCard
                message={makeMessage({
                    source: 'phone',
                    phoneType: 'shiguang_camera',
                    phoneLabel: '相机',
                    phoneTitle: '相机 23:14',
                    phoneDetail: '拍摄时间: 2026/06/04 23:14\n图片摘要: 小鱼把深夜桌面拍给 Sully 看。',
                    phoneValue: '一张拍立得',
                    phoneComment: '你是不是又熬到这个点了？先把咖啡放下。',
                    phoneAlbumCover: dataUrl,
                    charName: 'Sully',
                    charAvatar: 'https://example.com/avatar.jpg',
                })}
            />,
        );

        expect(screen.getByText('相机 23:14')).toBeInTheDocument();
        expect(screen.getByAltText('相机 23:14')).toHaveAttribute('src', dataUrl);
        expect(screen.queryByText(/小鱼把深夜桌面/)).not.toBeInTheDocument();
        expect(screen.getByText('Sully 看见后说')).toBeInTheDocument();
        expect(screen.getByText('你是不是又熬到这个点了？先把咖啡放下。')).toBeInTheDocument();
    });
});
