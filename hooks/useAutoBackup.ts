/**
 * useAutoBackup — 每日自动云端备份
 *
 * 触发时机:
 *   1. 应用启动（OSDataProvider 挂载后）
 *   2. 用户从后台切回前台（visibilitychange）
 *
 * 逻辑:
 *   - 调 GET /api/backup/latest 检查最后备份时间
 *   - 距上次备份 ≥ 24h → 生成 ZIP 并上传
 *   - 上传前预检大小 ≤ Cloudflare 入口上限
 *   - 静默运行，不阻塞 UI；失败仅 console.warn
 */

import { useEffect, useRef, useCallback } from 'react';
import {
    CLOUD_BACKUP_MAX_BYTES,
    CLOUD_BACKUP_MAX_DISPLAY,
    getLatestCloudBackup,
    uploadCloudBackup,
    isCloudBackupAvailable,
} from '../utils/cloudBackup';
import { readSystemBackupIncludeVoiceAudio, SystemBackupMode, SystemBackupOptions } from '../utils/systemBackup';
import { readJsonStorage, safeLocalStorageRemove, writeJsonStorage } from '../utils/storage';

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const AUTO_BACKUP_LOCK_TTL_MS = 60 * 60 * 1000;
const VISIBILITY_CHECK_DEBOUNCE_MS = 60 * 1000;
const AUTO_BACKUP_STATE_KEY = 'csyos_auto_backup_state';
const AUTO_BACKUP_LOCK_KEY = 'csyos_auto_backup_lock';
const RECENT_BACKUP_ERROR_CODE = 'recent_backup_exists';

type AutoBackupTrigger = 'startup' | 'visible';

interface AutoBackupState {
    lastAttemptAt?: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    lastFailureReason?: string;
    lastSize?: number;
    nextAllowedAt?: number;
}

interface AutoBackupLock {
    ownerId: string;
    startedAt: number;
    expiresAt: number;
}

interface RecentBackupConflict {
    latest?: {
        uploaded?: string;
        size?: number;
    };
    retryAfterMs?: number;
}

function readAutoBackupState(): AutoBackupState {
    return readJsonStorage<AutoBackupState>(AUTO_BACKUP_STATE_KEY) || {};
}

function writeAutoBackupState(patch: Partial<AutoBackupState>): AutoBackupState {
    const next = { ...readAutoBackupState(), ...patch };
    writeJsonStorage(AUTO_BACKUP_STATE_KEY, next);
    return next;
}

function readAutoBackupLock(): AutoBackupLock | null {
    const lock = readJsonStorage<AutoBackupLock>(AUTO_BACKUP_LOCK_KEY);
    if (!lock || !lock.ownerId || !lock.expiresAt) return null;
    return lock;
}

function createLockOwnerId(): string {
    const randomId = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return `${Date.now()}-${randomId}`;
}

function acquireAutoBackupLock(now: number): string | null {
    const existing = readAutoBackupLock();
    if (existing && existing.expiresAt > now) return null;

    const ownerId = createLockOwnerId();
    writeJsonStorage(AUTO_BACKUP_LOCK_KEY, {
        ownerId,
        startedAt: now,
        expiresAt: now + AUTO_BACKUP_LOCK_TTL_MS,
    } satisfies AutoBackupLock);

    return readAutoBackupLock()?.ownerId === ownerId ? ownerId : null;
}

function refreshAutoBackupLock(ownerId: string): void {
    const existing = readAutoBackupLock();
    if (existing?.ownerId !== ownerId) return;
    writeJsonStorage(AUTO_BACKUP_LOCK_KEY, {
        ...existing,
        expiresAt: Date.now() + AUTO_BACKUP_LOCK_TTL_MS,
    });
}

function releaseAutoBackupLock(ownerId: string): void {
    if (readAutoBackupLock()?.ownerId === ownerId) {
        safeLocalStorageRemove(AUTO_BACKUP_LOCK_KEY);
    }
}

function getLocalSkipReason(state: AutoBackupState, now: number): string | null {
    if (state.nextAllowedAt && state.nextAllowedAt > now) {
        return `冷却中，${new Date(state.nextAllowedAt).toLocaleString()} 后再试`;
    }
    if (state.lastSuccessAt && now - state.lastSuccessAt < TWENTY_FOUR_HOURS) {
        return '本机 24h 内已有成功备份';
    }
    if (state.lastAttemptAt && now - state.lastAttemptAt < RETRY_COOLDOWN_MS) {
        return '距离上次尝试不足 6h';
    }
    return null;
}

function recordAutoBackupFailure(reason: string, cooldownMs = RETRY_COOLDOWN_MS, size?: number): void {
    const now = Date.now();
    writeAutoBackupState({
        lastFailureAt: now,
        lastFailureReason: reason.slice(0, 200),
        lastSize: size,
        nextAllowedAt: now + cooldownMs,
    });
}

function getRecentBackupConflict(error: unknown): RecentBackupConflict | null {
    const candidate = error as {
        status?: unknown;
        code?: unknown;
        message?: unknown;
        retryAfterMs?: unknown;
        latest?: RecentBackupConflict['latest'];
        payload?: {
            code?: unknown;
            error?: unknown;
            retryAfterMs?: unknown;
            latest?: RecentBackupConflict['latest'];
        };
    };
    const status = typeof candidate?.status === 'number' ? candidate.status : 0;
    const code = typeof candidate?.code === 'string' ? candidate.code : candidate?.payload?.code;
    const message = [
        typeof candidate?.message === 'string' ? candidate.message : '',
        typeof candidate?.payload?.error === 'string' ? candidate.payload.error : '',
    ].join(' ');

    if (
        status !== 409
        || (
            code !== RECENT_BACKUP_ERROR_CODE
            && !/recent backup already exists/i.test(message)
        )
    ) {
        return null;
    }

    const retryAfterMs = typeof candidate.retryAfterMs === 'number'
        ? candidate.retryAfterMs
        : candidate.payload?.retryAfterMs;
    return {
        latest: candidate.latest || candidate.payload?.latest,
        retryAfterMs: typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)
            ? Math.max(0, retryAfterMs)
            : undefined,
    };
}

function recordRecentBackupConflict(conflict: RecentBackupConflict): void {
    const now = Date.now();
    const uploadedAt = conflict.latest?.uploaded
        ? new Date(conflict.latest.uploaded).getTime()
        : NaN;
    const latestUploadedAt = Number.isFinite(uploadedAt) ? uploadedAt : now;
    const nextAllowedAt = typeof conflict.retryAfterMs === 'number'
        ? now + conflict.retryAfterMs
        : latestUploadedAt + TWENTY_FOUR_HOURS;

    writeAutoBackupState({
        lastSuccessAt: latestUploadedAt,
        lastFailureAt: undefined,
        lastFailureReason: undefined,
        lastSize: conflict.latest?.size,
        nextAllowedAt,
    });
}

/**
 * @param exportSystem  OSContext 的 exportSystem('full') — 返回 Blob
 * @param isDataLoaded  数据是否加载完毕
 */
export function useAutoBackup(
    exportSystem: (mode: SystemBackupMode, options?: SystemBackupOptions) => Promise<Blob>,
    isDataLoaded: boolean,
    enabled = true,
) {
    const runningRef = useRef(false);
    const exportSystemRef = useRef(exportSystem);
    const lastVisibilityCheckRef = useRef(0);

    useEffect(() => {
        exportSystemRef.current = exportSystem;
    }, [exportSystem]);

    const checkAutoBackup = useCallback(async (trigger: AutoBackupTrigger) => {
        // 防止并发
        if (runningRef.current) return;
        runningRef.current = true;
        let lockOwnerId: string | null = null;

        try {
            const initialNow = Date.now();
            const initialSkipReason = getLocalSkipReason(readAutoBackupState(), initialNow);
            if (initialSkipReason) {
                console.log(`[AutoBackup] ${initialSkipReason}，跳过 (${trigger})`);
                return;
            }

            lockOwnerId = acquireAutoBackupLock(initialNow);
            if (!lockOwnerId) {
                console.log('[AutoBackup] 其他窗口/实例正在备份，跳过');
                return;
            }

            const lockedNow = Date.now();
            const lockedSkipReason = getLocalSkipReason(readAutoBackupState(), lockedNow);
            if (lockedSkipReason) {
                console.log(`[AutoBackup] ${lockedSkipReason}，跳过 (${trigger})`);
                return;
            }

            writeAutoBackupState({
                lastAttemptAt: lockedNow,
                nextAllowedAt: lockedNow + RETRY_COOLDOWN_MS,
            });

            // 0. 后端可达？
            const ok = await isCloudBackupAvailable();
            if (!ok) {
                console.log('[AutoBackup] 后端不可达，跳过');
                recordAutoBackupFailure('backend_unavailable');
                return;
            }

            // 1. 查最近一次备份
            const latest = await getLatestCloudBackup();
            const now = Date.now();
            const parsedLastBackupTime = latest ? new Date(latest.uploaded).getTime() : 0;
            const lastBackupTime = Number.isFinite(parsedLastBackupTime) ? parsedLastBackupTime : 0;
            const localLastSuccessAt = readAutoBackupState().lastSuccessAt || 0;
            const effectiveLastBackupTime = Math.max(lastBackupTime, localLastSuccessAt);

            if (now - effectiveLastBackupTime < TWENTY_FOUR_HOURS) {
                console.log('[AutoBackup] 24h 内已有备份，跳过');
                writeAutoBackupState({
                    lastSuccessAt: effectiveLastBackupTime,
                    nextAllowedAt: effectiveLastBackupTime + TWENTY_FOUR_HOURS,
                });
                return;
            }

            // 2. 生成 ZIP
            console.log('[AutoBackup] 开始生成备份...');
            const blob = await exportSystemRef.current('full', {
                includeVoiceAudio: readSystemBackupIncludeVoiceAudio(),
                includeMemoryRecordAudio: false,
            });
            refreshAutoBackupLock(lockOwnerId);

            // 3. 预检大小
            if (blob.size > CLOUD_BACKUP_MAX_BYTES) {
                console.warn(`[AutoBackup] 数据 ${(blob.size / 1024 / 1024).toFixed(1)}MB 超过 ${CLOUD_BACKUP_MAX_DISPLAY}，跳过`);
                recordAutoBackupFailure('backup_too_large', TWENTY_FOUR_HOURS, blob.size);
                return;
            }

            // 4. 上传
            const label = `auto-${new Date().toISOString().slice(0, 10)}`;
            const uploaded = await uploadCloudBackup(blob, label, 'auto');
            const uploadedAt = new Date(uploaded.uploaded).getTime() || Date.now();
            writeAutoBackupState({
                lastSuccessAt: uploadedAt,
                lastSize: uploaded.size,
                nextAllowedAt: uploadedAt + TWENTY_FOUR_HOURS,
            });
            console.log('[AutoBackup] ✅ 自动备份完成');

        } catch (error: any) {
            const recentConflict = getRecentBackupConflict(error);
            if (recentConflict) {
                recordRecentBackupConflict(recentConflict);
                console.log('[AutoBackup] 云端 24h 内已有备份，进入冷却');
                return;
            }

            const message = error?.message || String(error);
            recordAutoBackupFailure(message);
            console.warn('[AutoBackup] 自动备份失败 (非致命):', message);
        } finally {
            if (lockOwnerId) releaseAutoBackupLock(lockOwnerId);
            runningRef.current = false;
        }
    }, []);

    useEffect(() => {
        if (!enabled || !isDataLoaded) return;

        // 启动时延迟 10s 执行，避免阻塞初始化
        const timer = setTimeout(() => {
            checkAutoBackup('startup');
        }, 10_000);

        // visibilitychange: 用户从后台切回前台
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                const now = Date.now();
                if (now - lastVisibilityCheckRef.current < VISIBILITY_CHECK_DEBOUNCE_MS) return;
                lastVisibilityCheckRef.current = now;
                checkAutoBackup('visible');
            }
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled, isDataLoaded, checkAutoBackup]);
}
