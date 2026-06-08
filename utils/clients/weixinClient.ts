import { buildBackendUrl, buildHeaders, readBackendPayload } from './backendCore';
import { resolveCharacterContentId } from '../db/characterStore';

export type WeixinBindingStatus = 'active' | 'disconnected' | 'login_required' | 'disabled';
export type WeixinQrStatus = 'wait' | 'scaned' | 'confirmed' | 'expired';

export interface WeixinBinding {
    id: number;
    userId: string;
    charId: string;
    clientId?: string | null;
    weixinBotName: string | null;
    bridgeSessionId: string | null;
    status: WeixinBindingStatus;
    createdAt: number;
    updatedAt: number;
}

export interface WeixinBindingsResponse {
    bindings: WeixinBinding[];
}

export interface WeixinQrResponse {
    qrcode: string;
    qrcodeImgUrl: string;
}

export interface WeixinQrStatusResponse {
    status: WeixinQrStatus;
}

export interface WeixinClientRepairStatus {
    needed?: boolean;
    available?: boolean;
    conflict?: boolean;
    repaired?: boolean;
    reason?: string | null;
    message?: string | null;
}

export interface WeixinReadinessResponse {
    ready?: boolean;
    charId?: string;
    clientId?: string | null;
    binding?: WeixinBinding | null;
    repair?: WeixinClientRepairStatus;
}

export interface WeixinRepairClientResponse {
    ok?: boolean;
    repaired?: boolean;
    conflict?: boolean;
    imported?: number;
    importedCount?: number;
    synced?: number;
    syncedCount?: number;
    message?: string | null;
    binding?: WeixinBinding | null;
    repair?: WeixinClientRepairStatus;
}

export type WeixinSyncEnsureStatus = 'idle' | 'processing' | 'processed' | 'failed';

export interface WeixinSyncEnsureJob {
    id?: number | string;
    status?: string | null;
    attempts?: number;
    createdAt?: number;
    updatedAt?: number;
    startedAt?: number | null;
    completedAt?: number | null;
    lastError?: string | null;
}

export interface WeixinSyncEnsureResponse {
    status?: WeixinSyncEnsureStatus;
    processed?: boolean;
    remainingQueued?: number;
    clientIdBound?: boolean;
    repair?: WeixinClientRepairStatus & {
        performed?: boolean;
        repaired?: boolean;
        imported?: number;
        importedCount?: number;
        synced?: number;
        syncedCount?: number;
    };
    job?: WeixinSyncEnsureJob | null;
    outcome?: string;
    error?: string;
    message?: string | null;
}

function getRequiredBackendUrl(path: string, query?: Record<string, string>): string {
    const url = buildBackendUrl(path, query);
    if (!url || url === path) {
        throw new Error('当前没有可用的测试后端地址');
    }
    return url;
}

async function requestWeixin<T>(
    path: string,
    init: RequestInit = {},
    query?: Record<string, string>,
): Promise<T> {
    const response = await fetch(getRequiredBackendUrl(path, query), {
        ...init,
        headers: {
            ...buildHeaders({ contentType: init.body === undefined ? false : 'application/json' }),
            ...init.headers,
        },
    });

    const { detail, payload } = await readBackendPayload(response);
    if (!response.ok) {
        throw new Error(detail || `微信接口请求失败 (HTTP ${response.status})`);
    }

    return (payload || {}) as T;
}

function isClientIdConflictError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return /client_id_conflict|另一台设备|another client|another device/i.test(message);
}

export async function listWeixinBindings(): Promise<WeixinBinding[]> {
    const payload = await requestWeixin<WeixinBindingsResponse>('/api/weixin/bindings');
    return Array.isArray(payload.bindings) ? payload.bindings : [];
}

export async function generateWeixinQr(charId: string, charName: string): Promise<WeixinQrResponse> {
    const contentCharId = await resolveCharacterContentId(charId);
    return requestWeixin<WeixinQrResponse>('/api/weixin/qr', {
        method: 'POST',
        body: JSON.stringify({ charId: contentCharId, charName }),
    });
}

export async function checkWeixinQrStatus(qrcode: string): Promise<WeixinQrStatusResponse> {
    return requestWeixin<WeixinQrStatusResponse>(
        '/api/weixin/qr/status',
        {},
        { qrcode },
    );
}

export async function getWeixinReadiness(charId: string): Promise<WeixinReadinessResponse> {
    const contentCharId = await resolveCharacterContentId(charId);
    return requestWeixin<WeixinReadinessResponse>(
        `/api/weixin/readiness/${encodeURIComponent(contentCharId)}`,
    );
}

export async function repairWeixinClientBinding(
    charId: string,
    lookbackDays = 7,
): Promise<WeixinRepairClientResponse> {
    const contentCharId = await resolveCharacterContentId(charId);
    try {
        return await requestWeixin<WeixinRepairClientResponse>('/api/weixin/bindings/repair-client', {
            method: 'POST',
            body: JSON.stringify({ charId: contentCharId, lookbackDays }),
        });
    } catch (error) {
        if (isClientIdConflictError(error)) {
            return {
                ok: false,
                conflict: true,
                repair: {
                    needed: true,
                    available: false,
                    conflict: true,
                    message: error instanceof Error ? error.message : null,
                },
            };
        }

        throw error;
    }
}

export async function ensureWeixinSync(charId: string): Promise<WeixinSyncEnsureResponse> {
    const contentCharId = await resolveCharacterContentId(charId);
    return requestWeixin<WeixinSyncEnsureResponse>('/api/weixin/sync/ensure', {
        method: 'POST',
        body: JSON.stringify({ charId: contentCharId }),
    });
}
