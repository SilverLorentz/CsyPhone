/**
 * Cloud Backup SDK - frontend helpers.
 *
 * Reuses systemBackup.ts export/import formats so cloud backups
 * remain compatible with the local SullyOS backup flow.
 */

import { buildBackendHeaders,getBackendToken,getBackendUrl } from './backendClient';

type ViteEnvMap = Record<string, string | boolean | undefined>;

function getViteEnv(): ViteEnvMap {
    return ((import.meta as ImportMeta & { env?: ViteEnvMap }).env || {});
}

function readProcessEnv(key: string): string | undefined {
    if (typeof process === 'undefined') return undefined;
    return process.env?.[key];
}

function resolveCloudBackupMaxMB(): number {
    const env = getViteEnv();
    const configured = env.VITE_CSYOS_CLOUD_BACKUP_MAX_MB
        || readProcessEnv('VITE_CSYOS_CLOUD_BACKUP_MAX_MB');
    const configuredMB = typeof configured === 'string' ? Number(configured) : NaN;
    if (Number.isFinite(configuredMB) && configuredMB > 0) {
        return configuredMB;
    }

    const mode = readProcessEnv('MODE')
        || (typeof env.MODE === 'string' ? env.MODE : undefined);
    return mode === 'staging' ? 100 : 500;
}

export const CLOUD_BACKUP_MAX_MB = resolveCloudBackupMaxMB();
export const CLOUD_BACKUP_MAX_BYTES = CLOUD_BACKUP_MAX_MB * 1000 * 1000;
export const CLOUD_BACKUP_MAX_DISPLAY = `约${CLOUD_BACKUP_MAX_MB}MB`;

export interface CloudBackupMeta {
    key: string;
    size: number;
    uploaded: string;
    label?: string;
}

export type CloudBackupSource = 'auto' | 'manual';

export interface CloudBackupUploadResponse {
    key: string;
    size: number;
    uploaded: string;
    label?: string;
    source?: CloudBackupSource;
}

export interface CloudBackupListResponse {
    ok: boolean;
    backups: CloudBackupMeta[];
    count: number;
    maxCount: number;
    maxSizeMB?: number;
}

interface CloudBackupErrorPayload {
    ok?: boolean;
    code?: string;
    error?: string;
    latest?: CloudBackupMeta;
    retryAfterMs?: number;
}

export class CloudBackupApiError extends Error {
    status: number;
    body: string;
    payload?: CloudBackupErrorPayload;
    code?: string;
    retryAfterMs?: number;
    latest?: CloudBackupMeta;

    constructor(status: number, body: string, payload?: CloudBackupErrorPayload) {
        super(body ? `Backup API error ${status}: ${body}` : `Backup API error ${status}`);
        this.name = 'CloudBackupApiError';
        this.status = status;
        this.body = body;
        this.payload = payload;
        this.code = payload?.code;
        this.retryAfterMs = payload?.retryAfterMs;
        this.latest = payload?.latest;
    }
}

function formatBackupSizeMB(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
}

export function assertCloudBackupUploadSize(bytes: number): void {
    if (bytes <= CLOUD_BACKUP_MAX_BYTES) return;

    throw new Error(
        `云端备份文件约 ${formatBackupSizeMB(bytes)}MB，超过当前云端入口 ${CLOUD_BACKUP_MAX_DISPLAY} 上传上限。请先关闭通话录音备份、清理较大的音频/图片，或改用本地备份保存完整媒体。`,
    );
}

async function backupFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const backendUrl = getBackendUrl();
    const backendToken = getBackendToken();
    if (!backendUrl) {
        throw new Error('Backend URL is not configured.');
    }
    if (!backendToken) {
        throw new Error('Backend token is not configured.');
    }

    const headers = new Headers(buildBackendHeaders({ contentType: false }));
    for (const [key, value] of new Headers(options.headers || {})) {
        headers.set(key, value);
    }

    const res = await fetch(`${backendUrl}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok && res.status !== 200) {
        const body = await res.text();
        let payload: CloudBackupErrorPayload | undefined;
        try {
            payload = JSON.parse(body) as CloudBackupErrorPayload;
        } catch {
            payload = undefined;
        }
        throw new CloudBackupApiError(res.status, body, payload);
    }

    return res;
}

export async function uploadCloudBackup(
    zipBlob: Blob,
    label?: string,
    source: CloudBackupSource = 'manual',
): Promise<CloudBackupUploadResponse> {
    assertCloudBackupUploadSize(zipBlob.size);

    const headers: Record<string, string> = {
        'Content-Type': 'application/zip',
        'X-Backup-Source': source,
    };
    if (label) headers['X-Backup-Label'] = label;

    const res = await backupFetch('/api/backup/upload', {
        method: 'POST',
        headers,
        body: zipBlob,
    });

    return res.json();
}

export async function listCloudBackups(): Promise<CloudBackupListResponse> {
    const res = await backupFetch('/api/backup/list');
    return res.json();
}

export async function getLatestCloudBackup(): Promise<CloudBackupMeta | null> {
    const res = await backupFetch('/api/backup/latest');
    const data = await res.json();
    return data.latest || null;
}

export async function downloadCloudBackup(key: string): Promise<File> {
    const res = await backupFetch(`/api/backup/download?key=${encodeURIComponent(key)}`);
    const blob = await res.blob();
    const filename = key.split('/').pop() || 'backup.zip';
    return new File([blob], filename, { type: 'application/zip' });
}

export async function deleteCloudBackup(key: string): Promise<void> {
    await backupFetch(`/api/backup?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
    });
}

export async function isCloudBackupAvailable(): Promise<boolean> {
    try {
        if (!getBackendUrl()) return false;
        const res = await backupFetch('/api/backup/list');
        return res.ok;
    } catch {
        return false;
    }
}
