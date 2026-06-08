// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterWeixinBindingCard from './CharacterWeixinBindingCard';

const {
    mockCheckWeixinQrStatus,
    mockEnsureWeixinSync,
    mockGenerateWeixinQr,
    mockGetWeixinReadiness,
    mockListWeixinBindings,
    mockRepairWeixinClientBinding,
    mockSyncPendingAgentMessagesForCharacter,
} = vi.hoisted(() => ({
    mockCheckWeixinQrStatus: vi.fn(),
    mockEnsureWeixinSync: vi.fn(),
    mockGenerateWeixinQr: vi.fn(),
    mockGetWeixinReadiness: vi.fn(),
    mockListWeixinBindings: vi.fn(),
    mockRepairWeixinClientBinding: vi.fn(),
    mockSyncPendingAgentMessagesForCharacter: vi.fn(),
}));

vi.mock('../../utils/backendClient', async () => {
    const actual = await vi.importActual<typeof import('../../utils/backendClient')>('../../utils/backendClient');
    return {
        ...actual,
        checkWeixinQrStatus: mockCheckWeixinQrStatus,
        ensureWeixinSync: mockEnsureWeixinSync,
        generateWeixinQr: mockGenerateWeixinQr,
        getWeixinReadiness: mockGetWeixinReadiness,
        listWeixinBindings: mockListWeixinBindings,
        repairWeixinClientBinding: mockRepairWeixinClientBinding,
    };
});

vi.mock('../../utils/autonomousAgent', () => ({
    syncPendingAgentMessagesForCharacter: mockSyncPendingAgentMessagesForCharacter,
}));

const mockAddToast = vi.fn();

describe('CharacterWeixinBindingCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetWeixinReadiness.mockResolvedValue({
            repair: {
                needed: false,
                available: false,
            },
        });
        mockRepairWeixinClientBinding.mockResolvedValue({
            repaired: true,
        });
        mockSyncPendingAgentMessagesForCharacter.mockResolvedValue({
            received: 0,
            saved: 0,
            acked: 0,
        });
        mockEnsureWeixinSync.mockResolvedValue({
            status: 'idle',
            processed: false,
            remainingQueued: 0,
            clientIdBound: true,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows the active binding state for the current character', async () => {
        mockListWeixinBindings.mockResolvedValue([
            {
                id: 1,
                userId: 'user-1',
                charId: 'char-1',
                weixinBotName: null,
                bridgeSessionId: null,
                status: 'active',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        ]);

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByText('真实微信已连接')).toBeInTheDocument();
        expect(screen.getByText('已连接')).toBeInTheDocument();
        expect(mockListWeixinBindings).toHaveBeenCalledTimes(1);
        expect(mockGetWeixinReadiness).toHaveBeenCalledWith('char-1');
        expect(mockSyncPendingAgentMessagesForCharacter).toHaveBeenCalledWith('char-1');
    });

    it('manually ensures Weixin jobs before pulling pending agent messages', async () => {
        mockListWeixinBindings.mockResolvedValue([
            {
                id: 1,
                userId: 'user-1',
                charId: 'char-1',
                weixinBotName: null,
                bridgeSessionId: null,
                status: 'active',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        ]);
        mockEnsureWeixinSync.mockResolvedValue({
            status: 'processed',
            processed: true,
            remainingQueued: 0,
            clientIdBound: true,
        });
        mockSyncPendingAgentMessagesForCharacter
            .mockResolvedValueOnce({
                received: 0,
                saved: 0,
                acked: 0,
            })
            .mockResolvedValueOnce({
                received: 2,
                saved: 2,
                acked: 2,
            });

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: '立即同步' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: '立即同步' }));

        await waitFor(() => {
            expect(mockEnsureWeixinSync).toHaveBeenCalledWith('char-1');
        });
        await waitFor(() => {
            expect(mockSyncPendingAgentMessagesForCharacter).toHaveBeenCalledTimes(2);
        });

        expect(mockEnsureWeixinSync).toHaveBeenCalledTimes(1);
        expect(mockAddToast).toHaveBeenCalledWith('已同步 2 条微信消息到小手机。', 'success');
        expect(screen.getByText('已同步 2 条微信消息到小手机。')).toBeInTheDocument();
    });

    it('automatically repairs an active binding that needs the current client id', async () => {
        mockListWeixinBindings
            .mockResolvedValueOnce([
                {
                    id: 1,
                    userId: 'user-1',
                    charId: 'char-1',
                    clientId: null,
                    weixinBotName: null,
                    bridgeSessionId: null,
                    status: 'active',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ])
            .mockResolvedValueOnce([
                {
                    id: 1,
                    userId: 'user-1',
                    charId: 'char-1',
                    clientId: 'client-1',
                    weixinBotName: null,
                    bridgeSessionId: null,
                    status: 'active',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ]);
        mockGetWeixinReadiness.mockResolvedValue({
            repair: {
                needed: true,
                available: true,
            },
        });

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await waitFor(() => {
            expect(mockRepairWeixinClientBinding).toHaveBeenCalledWith('char-1', 7);
        });

        expect(mockListWeixinBindings).toHaveBeenCalledTimes(2);
        expect(mockSyncPendingAgentMessagesForCharacter).toHaveBeenCalledWith('char-1');
        expect(mockAddToast).toHaveBeenCalledWith(
            '已把最近微信记录同步到这台小手机',
            'success',
        );
        expect(screen.getByText('已把最近微信记录同步到这台小手机')).toBeInTheDocument();
    });

    it('shows a conflict hint without repairing when the binding belongs to another client', async () => {
        mockListWeixinBindings.mockResolvedValue([
            {
                id: 1,
                userId: 'user-1',
                charId: 'char-1',
                clientId: null,
                weixinBotName: null,
                bridgeSessionId: null,
                status: 'active',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        ]);
        mockGetWeixinReadiness.mockResolvedValue({
            repair: {
                needed: true,
                available: false,
                conflict: true,
            },
        });

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await waitFor(() => {
            expect(mockGetWeixinReadiness).toHaveBeenCalledWith('char-1');
        });

        expect(mockRepairWeixinClientBinding).not.toHaveBeenCalled();
        expect(mockSyncPendingAgentMessagesForCharacter).not.toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith(
            '这条微信绑定已属于另一台设备，重新扫码可切换到当前设备',
            'info',
        );
        expect(screen.getByText('这条微信绑定已属于另一台设备，重新扫码可切换到当前设备')).toBeInTheDocument();
    });

    it('shows a conflict hint when repair detects a race-time client conflict', async () => {
        mockListWeixinBindings.mockResolvedValue([
            {
                id: 1,
                userId: 'user-1',
                charId: 'char-1',
                clientId: null,
                weixinBotName: null,
                bridgeSessionId: null,
                status: 'active',
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
        ]);
        mockGetWeixinReadiness.mockResolvedValue({
            repair: {
                needed: true,
                available: true,
            },
        });
        mockRepairWeixinClientBinding.mockResolvedValue({
            ok: false,
            conflict: true,
            repair: {
                conflict: true,
            },
        });

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await waitFor(() => {
            expect(mockRepairWeixinClientBinding).toHaveBeenCalledWith('char-1', 7);
        });

        expect(mockListWeixinBindings).toHaveBeenCalledTimes(1);
        expect(mockSyncPendingAgentMessagesForCharacter).not.toHaveBeenCalled();
        expect(mockAddToast).toHaveBeenCalledWith(
            '这条微信绑定已属于另一台设备，重新扫码可切换到当前设备',
            'info',
        );
        expect(screen.getByText('这条微信绑定已属于另一台设备，重新扫码可切换到当前设备')).toBeInTheDocument();
    });

    it('generates a QR code and marks the flow successful after confirmation polling', async () => {
        vi.useFakeTimers();
        mockListWeixinBindings
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    id: 2,
                    userId: 'user-1',
                    charId: 'char-1',
                    weixinBotName: null,
                    bridgeSessionId: null,
                    status: 'active',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ]);
        mockGenerateWeixinQr.mockResolvedValue({
            qrcode: 'qr-123',
            qrcodeImgUrl: 'https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=qr-123&bot_type=3',
        });
        mockCheckWeixinQrStatus.mockResolvedValue({
            status: 'confirmed',
        });

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByText('还没绑定真实微信')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: '打开扫码' }));

        await act(async () => {
            await Promise.resolve();
        });

        expect(screen.getByAltText('微信扫码二维码')).toHaveAttribute(
            'src',
            expect.stringContaining('quickchart.io/qr?text='),
        );
        expect(mockGenerateWeixinQr).toHaveBeenCalledWith('char-1', 'Sully');

        await act(async () => {
            vi.advanceTimersByTime(1600);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mockCheckWeixinQrStatus).toHaveBeenCalledWith('qr-123');
        expect(screen.getByText('绑定完成，这个角色已经接上真实微信。')).toBeInTheDocument();
        expect(mockListWeixinBindings).toHaveBeenCalledTimes(2);
        expect(mockAddToast).toHaveBeenCalledWith(
            '微信绑定成功，现在可以在 staging 里继续测试了',
            'success',
        );
    });

    it('runs repair after QR confirmation so recent history can be backfilled', async () => {
        vi.useFakeTimers();
        mockListWeixinBindings
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                {
                    id: 2,
                    userId: 'user-1',
                    charId: 'char-1',
                    clientId: null,
                    weixinBotName: null,
                    bridgeSessionId: null,
                    status: 'active',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ])
            .mockResolvedValueOnce([
                {
                    id: 2,
                    userId: 'user-1',
                    charId: 'char-1',
                    clientId: 'client-1',
                    weixinBotName: null,
                    bridgeSessionId: null,
                    status: 'active',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                },
            ]);
        mockGenerateWeixinQr.mockResolvedValue({
            qrcode: 'qr-123',
            qrcodeImgUrl: 'https://liteapp.weixin.qq.com/q/7GiQu1?qrcode=qr-123&bot_type=3',
        });
        mockCheckWeixinQrStatus.mockResolvedValue({
            status: 'confirmed',
        });
        mockGetWeixinReadiness.mockResolvedValue({
            repair: {
                needed: true,
                available: true,
            },
        });

        render(
            <CharacterWeixinBindingCard
                charId="char-1"
                charName="Sully"
                addToast={mockAddToast}
            />,
        );

        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByRole('button', { name: '打开扫码' }));

        await act(async () => {
            await Promise.resolve();
        });

        await act(async () => {
            vi.advanceTimersByTime(1600);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mockCheckWeixinQrStatus).toHaveBeenCalledWith('qr-123');
        expect(mockRepairWeixinClientBinding).toHaveBeenCalledWith('char-1', 7);
        expect(mockSyncPendingAgentMessagesForCharacter).toHaveBeenCalledWith('char-1');
        expect(mockAddToast).toHaveBeenCalledWith(
            '已把最近微信记录同步到这台小手机',
            'success',
        );
    });
});
