import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoBackup } from '../hooks/useAutoBackup';
import {
    getLatestCloudBackup,
    isCloudBackupAvailable,
    uploadCloudBackup,
} from '../utils/cloudBackup';
import { SystemBackupMode, SystemBackupOptions } from '../utils/systemBackup';

vi.mock('../utils/cloudBackup', () => ({
    CLOUD_BACKUP_MAX_BYTES: 100 * 1000 * 1000,
    CLOUD_BACKUP_MAX_DISPLAY: '约100MB',
    getLatestCloudBackup: vi.fn(),
    isCloudBackupAvailable: vi.fn(),
    uploadCloudBackup: vi.fn(),
}));

type ExportSystemMock = (
    mode: SystemBackupMode,
    options?: SystemBackupOptions,
) => Promise<Blob>;

function AutoBackupHarness({
    exportSystem,
    isDataLoaded = true,
    enabled = true,
}: {
    exportSystem: ExportSystemMock;
    isDataLoaded?: boolean;
    enabled?: boolean;
}) {
    useAutoBackup(exportSystem, isDataLoaded, enabled);
    return null;
}

async function advanceStartupTimer() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
    });
}

describe('useAutoBackup', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-29T00:00:00.000Z'));
        vi.clearAllMocks();
        vi.mocked(isCloudBackupAvailable).mockResolvedValue(true);
        vi.mocked(getLatestCloudBackup).mockResolvedValue(null);
        vi.mocked(uploadCloudBackup).mockResolvedValue({
            key: 'user/1777420800000.zip',
            size: 3,
            uploaded: '2026-04-29T00:00:00.000Z',
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('does not schedule automatic cloud backup when disabled', async () => {
        const exportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip']));

        render(<AutoBackupHarness exportSystem={exportSystem} enabled={false} />);
        await advanceStartupTimer();

        expect(isCloudBackupAvailable).not.toHaveBeenCalled();
        expect(exportSystem).not.toHaveBeenCalled();
        expect(uploadCloudBackup).not.toHaveBeenCalled();
    });

    it('does not schedule another upload when OSContext rerenders with a new export function', async () => {
        const firstExportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip']));
        const secondExportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip2']));

        const { rerender } = render(<AutoBackupHarness exportSystem={firstExportSystem} />);

        await advanceStartupTimer();

        expect(firstExportSystem).toHaveBeenCalledTimes(1);
        expect(firstExportSystem).toHaveBeenCalledWith('full', {
            includeVoiceAudio: false,
            includeMemoryRecordAudio: false,
        });
        expect(uploadCloudBackup).toHaveBeenCalledTimes(1);
        expect(uploadCloudBackup).toHaveBeenCalledWith(
            expect.any(Blob),
            'auto-2026-04-29',
            'auto',
        );

        rerender(<AutoBackupHarness exportSystem={secondExportSystem} />);
        await advanceStartupTimer();

        expect(secondExportSystem).not.toHaveBeenCalled();
        expect(uploadCloudBackup).toHaveBeenCalledTimes(1);
    });

    it('skips work when another tab owns the backup lock', async () => {
        localStorage.setItem('csyos_auto_backup_lock', JSON.stringify({
            ownerId: 'other-tab',
            startedAt: Date.now(),
            expiresAt: Date.now() + 60_000,
        }));
        const exportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip']));

        render(<AutoBackupHarness exportSystem={exportSystem} />);
        await advanceStartupTimer();

        expect(isCloudBackupAvailable).not.toHaveBeenCalled();
        expect(exportSystem).not.toHaveBeenCalled();
    });

    it('persists a cooldown after backend is unavailable', async () => {
        vi.mocked(isCloudBackupAvailable).mockResolvedValue(false);
        const firstExportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip']));
        const secondExportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip2']));

        const firstRender = render(<AutoBackupHarness exportSystem={firstExportSystem} />);
        await advanceStartupTimer();
        firstRender.unmount();

        render(<AutoBackupHarness exportSystem={secondExportSystem} />);
        await advanceStartupTimer();

        expect(isCloudBackupAvailable).toHaveBeenCalledTimes(1);
        expect(firstExportSystem).not.toHaveBeenCalled();
        expect(secondExportSystem).not.toHaveBeenCalled();
    });

    it('persists a daily cooldown when the backend reports a recent automatic backup', async () => {
        vi.mocked(uploadCloudBackup).mockRejectedValue(Object.assign(
            new Error('Backup API error 409: Recent backup already exists'),
            {
                status: 409,
                code: 'recent_backup_exists',
                retryAfterMs: 2 * 60 * 60 * 1000,
                latest: {
                    key: 'user/recent.zip',
                    size: 5,
                    uploaded: '2026-04-28T23:00:00.000Z',
                },
            },
        ));
        const firstExportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip']));
        const secondExportSystem = vi.fn<ExportSystemMock>(async () => new Blob(['zip2']));

        const firstRender = render(<AutoBackupHarness exportSystem={firstExportSystem} />);
        await advanceStartupTimer();
        firstRender.unmount();

        const state = JSON.parse(localStorage.getItem('csyos_auto_backup_state') || '{}');
        expect(state.lastSuccessAt).toBe(Date.parse('2026-04-28T23:00:00.000Z'));
        expect(state.lastSize).toBe(5);
        expect(state.nextAllowedAt).toBe(Date.parse('2026-04-29T02:00:10.000Z'));
        expect(state.lastFailureReason).toBeUndefined();

        render(<AutoBackupHarness exportSystem={secondExportSystem} />);
        await advanceStartupTimer();

        expect(firstExportSystem).toHaveBeenCalledTimes(1);
        expect(secondExportSystem).not.toHaveBeenCalled();
        expect(uploadCloudBackup).toHaveBeenCalledTimes(1);
        expect(isCloudBackupAvailable).toHaveBeenCalledTimes(1);
    });
});
