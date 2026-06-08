/**
 * GitHub Releases backup client.
 *
 * This is a parallel destination for the existing system backup zip. It does
 * not replace the current backend cloud backup flow.
 */

export const GITHUB_BACKUP_CONFIG_KEY = 'os_github_backup_config';
export const DEFAULT_GITHUB_BACKUP_REPO = 'sully-backup';

const API_PROXY_BASE = '/github-api';
const UPLOAD_PROXY_BASE = '/github-upload';
const TAG_PREFIX = 'sully-backup-';
const RELEASE_NAME_PREFIX = 'Sully Backup ';
const MAX_PART_SIZE = 80 * 1024 * 1024;
const PART_FILENAME_RE = /^(.+)\.part(\d+)of(\d+)\.zip$/i;

export interface GitHubBackupConfig {
    token: string;
    owner: string;
    repo: string;
    connectedAt: number;
    lastBackupTime?: number;
    lastBackupSize?: number;
}

export interface GitHubBackupFile {
    name: string;
    size: number;
    lastModified: string;
    href: string;
    releaseUrl?: string;
}

type GhMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';
type GhResponse = {
    status: number;
    text: () => Promise<string>;
    json: () => Promise<any>;
    arrayBuffer: () => Promise<ArrayBuffer>;
};

function normalizeRepo(repo?: string): string {
    return (repo || DEFAULT_GITHUB_BACKUP_REPO).trim() || DEFAULT_GITHUB_BACKUP_REPO;
}

function proxyUrl(base: string, path: string): string {
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function githubApiUrl(path: string): string {
    return proxyUrl(API_PROXY_BASE, path);
}

function githubUploadUrl(path: string): string {
    return proxyUrl(UPLOAD_PROXY_BASE, path);
}

function authHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...extra,
    };
}

async function ghRequest(
    url: string,
    method: GhMethod,
    opts: { headers?: Record<string, string>; body?: BodyInit | null } = {},
): Promise<GhResponse> {
    const res = await fetch(url, {
        method,
        headers: opts.headers,
        body: opts.body ?? null,
        redirect: 'follow',
    });

    return {
        status: res.status,
        text: () => res.text(),
        json: () => res.json(),
        arrayBuffer: () => res.arrayBuffer(),
    };
}

export function readGithubBackupConfig(): GitHubBackupConfig | null {
    try {
        const raw = localStorage.getItem(GITHUB_BACKUP_CONFIG_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<GitHubBackupConfig>;
        if (!parsed.token || !parsed.owner) return null;
        return {
            token: parsed.token,
            owner: parsed.owner,
            repo: normalizeRepo(parsed.repo),
            connectedAt: typeof parsed.connectedAt === 'number' ? parsed.connectedAt : Date.now(),
            lastBackupTime: parsed.lastBackupTime,
            lastBackupSize: parsed.lastBackupSize,
        };
    } catch {
        return null;
    }
}

export function writeGithubBackupConfig(config: GitHubBackupConfig): void {
    localStorage.setItem(GITHUB_BACKUP_CONFIG_KEY, JSON.stringify({
        ...config,
        repo: normalizeRepo(config.repo),
    }));
}

export function clearGithubBackupConfig(): void {
    localStorage.removeItem(GITHUB_BACKUP_CONFIG_KEY);
}

export async function verifyGithubToken(token: string): Promise<{ ok: boolean; login?: string; message: string }> {
    try {
        const res = await ghRequest(githubApiUrl('/user'), 'GET', {
            headers: authHeaders(token),
        });
        if (res.status === 200) {
            const data = await res.json();
            return { ok: true, login: data.login, message: '已连接 GitHub' };
        }
        if (res.status === 401) return { ok: false, message: 'Token 无效或已过期' };
        if (res.status === 403) return { ok: false, message: '权限不足，请确认 Token 已勾选 repo' };
        return { ok: false, message: `GitHub 返回 ${res.status}` };
    } catch (e: any) {
        return { ok: false, message: `连接失败: ${e?.message || '网络错误'}` };
    }
}

export async function ensureGithubBackupRepo(
    token: string,
    owner: string,
    repo: string,
): Promise<{ ok: boolean; message: string }> {
    const repoName = normalizeRepo(repo);
    try {
        const get = await ghRequest(githubApiUrl(`/repos/${owner}/${repoName}`), 'GET', {
            headers: authHeaders(token),
        });
        if (get.status === 200) return { ok: true, message: '仓库已就绪' };
        if (get.status !== 404) return { ok: false, message: `检查仓库失败 (${get.status})` };

        const create = await ghRequest(githubApiUrl('/user/repos'), 'POST', {
            headers: authHeaders(token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                name: repoName,
                description: 'Sully 自动备份仓库',
                private: true,
                auto_init: true,
            }),
        });
        if (create.status === 201) return { ok: true, message: '已自动创建私有仓库' };
        if (create.status === 422) return { ok: false, message: `仓库名 "${repoName}" 已被占用，请换一个` };
        if (create.status === 403) return { ok: false, message: '权限不足，请确认 Token 已勾选 repo' };
        return { ok: false, message: `创建仓库失败 (${create.status})` };
    } catch (e: any) {
        return { ok: false, message: `连接失败: ${e?.message || '网络错误'}` };
    }
}

export async function connectGithubBackup(
    token: string,
    repo = DEFAULT_GITHUB_BACKUP_REPO,
): Promise<{ ok: boolean; message: string; config?: GitHubBackupConfig }> {
    const cleanToken = token.trim();
    const repoName = normalizeRepo(repo);
    if (!cleanToken) return { ok: false, message: '请先填写 Token' };

    const verified = await verifyGithubToken(cleanToken);
    if (!verified.ok || !verified.login) return { ok: false, message: verified.message };

    const repoReady = await ensureGithubBackupRepo(cleanToken, verified.login, repoName);
    if (!repoReady.ok) return { ok: false, message: repoReady.message };

    const config: GitHubBackupConfig = {
        token: cleanToken,
        owner: verified.login,
        repo: repoName,
        connectedAt: Date.now(),
    };
    writeGithubBackupConfig(config);
    return { ok: true, message: `已连接 @${verified.login} → ${repoName}`, config };
}

async function deleteReleaseAndTag(config: GitHubBackupConfig, releaseId: number, tagName?: string): Promise<void> {
    if (!releaseId) return;

    await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/releases/${releaseId}`), 'DELETE', {
        headers: authHeaders(config.token),
    }).catch(() => {});

    if (tagName) {
        await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/git/refs/tags/${tagName}`), 'DELETE', {
            headers: authHeaders(config.token),
        }).catch(() => {});
    }
}

function uploadOneAsset(
    config: GitHubBackupConfig,
    releaseId: number,
    blob: Blob,
    assetName: string,
    onFraction?: (fraction: number) => void,
): Promise<{ ok: boolean; message: string }> {
    return new Promise((resolve) => {
        const url = githubUploadUrl(`/repos/${config.owner}/${config.repo}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${config.token}`);
        xhr.setRequestHeader('Accept', 'application/vnd.github+json');
        xhr.setRequestHeader('X-GitHub-Api-Version', '2022-11-28');
        xhr.setRequestHeader('Content-Type', 'application/zip');
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onFraction?.(event.loaded / event.total);
        };
        xhr.onload = () => {
            onFraction?.(1);
            if (xhr.status === 201) {
                resolve({ ok: true, message: '上传成功' });
            } else {
                resolve({ ok: false, message: `上传失败 (${xhr.status}): ${(xhr.responseText || '').slice(0, 120)}` });
            }
        };
        xhr.onerror = () => resolve({ ok: false, message: '上传失败: 网络错误' });
        xhr.onabort = () => resolve({ ok: false, message: '上传已取消' });
        xhr.ontimeout = () => resolve({ ok: false, message: '上传超时' });
        xhr.send(blob);
    });
}

export async function uploadGithubBackup(
    config: GitHubBackupConfig,
    blob: Blob,
    filename: string,
    onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; message: string; config?: GitHubBackupConfig }> {
    try {
        onProgress?.(2);
        const ts = Date.now();
        const releaseRes = await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/releases`), 'POST', {
            headers: authHeaders(config.token, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                tag_name: `${TAG_PREFIX}${ts}`,
                name: `${RELEASE_NAME_PREFIX}${new Date(ts).toISOString()}`,
                body: `自动备份 · ${new Date(ts).toLocaleString('zh-CN')}`,
                draft: false,
                prerelease: true,
            }),
        });
        if (releaseRes.status !== 201) {
            const msg = await releaseRes.text();
            return { ok: false, message: `创建 release 失败 (${releaseRes.status}): ${msg.slice(0, 120)}` };
        }

        const release = await releaseRes.json();
        const releaseId = Number(release.id);
        const tagName = String(release.tag_name || `${TAG_PREFIX}${ts}`);
        onProgress?.(5);

        if (blob.size <= MAX_PART_SIZE) {
            const result = await uploadOneAsset(config, releaseId, blob, filename, (fraction) => {
                onProgress?.(5 + Math.floor(fraction * 94));
            });
            onProgress?.(100);
            if (!result.ok) {
                await deleteReleaseAndTag(config, releaseId, tagName);
                return result;
            }
            const nextConfig = { ...config, lastBackupTime: Date.now(), lastBackupSize: blob.size };
            writeGithubBackupConfig(nextConfig);
            return { ...result, config: nextConfig };
        }

        const totalParts = Math.ceil(blob.size / MAX_PART_SIZE);
        const baseName = filename.replace(/\.zip$/i, '');
        const padWidth = String(totalParts).length;
        const span = 95 / totalParts;

        for (let i = 0; i < totalParts; i++) {
            const start = i * MAX_PART_SIZE;
            const end = Math.min(start + MAX_PART_SIZE, blob.size);
            const partBlob = blob.slice(start, end, 'application/zip');
            const partNum = String(i + 1).padStart(padWidth, '0');
            const totalNum = String(totalParts).padStart(padWidth, '0');
            const partName = `${baseName}.part${partNum}of${totalNum}.zip`;
            const base = 5 + i * span;

            const result = await uploadOneAsset(config, releaseId, partBlob, partName, (fraction) => {
                onProgress?.(Math.min(99, Math.floor(base + fraction * span)));
            });
            if (!result.ok) {
                await deleteReleaseAndTag(config, releaseId, tagName);
                return { ok: false, message: `第 ${i + 1}/${totalParts} 片失败: ${result.message}` };
            }
        }

        onProgress?.(100);
        const nextConfig = { ...config, lastBackupTime: Date.now(), lastBackupSize: blob.size };
        writeGithubBackupConfig(nextConfig);
        return { ok: true, message: `分片上传成功（${totalParts} 片）`, config: nextConfig };
    } catch (e: any) {
        return { ok: false, message: `上传失败: ${e?.message || '未知错误'}` };
    }
}

export async function listGithubBackups(config: GitHubBackupConfig): Promise<GitHubBackupFile[]> {
    try {
        const res = await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/releases?per_page=50`), 'GET', {
            headers: authHeaders(config.token),
        });
        if (res.status !== 200) return [];
        const releases: any[] = await res.json();
        const files: GitHubBackupFile[] = [];

        for (const release of releases) {
            if (!String(release.tag_name || '').startsWith(TAG_PREFIX)) continue;
            const assets = Array.isArray(release.assets) ? release.assets : [];
            type PartInfo = { idx: number; asset: any };
            const groups = new Map<string, { parts: PartInfo[]; total: number }>();

            for (const asset of assets) {
                if (!String(asset.name || '').endsWith('.zip')) continue;
                const match = String(asset.name).match(PART_FILENAME_RE);
                if (match) {
                    const display = `${match[1]}.zip`;
                    const idx = parseInt(match[2], 10);
                    const total = parseInt(match[3], 10);
                    if (!groups.has(display)) groups.set(display, { parts: [], total });
                    groups.get(display)!.parts.push({ idx, asset });
                } else {
                    groups.set(asset.name, { parts: [{ idx: 1, asset }], total: 1 });
                }
            }

            for (const [name, group] of groups) {
                if (group.parts.length !== group.total) continue;
                group.parts.sort((a, b) => a.idx - b.idx);
                const totalSize = group.parts.reduce((sum, part) => sum + (part.asset.size || 0), 0);
                const ids = group.parts.map(part => part.asset.id).join(',');
                const lastModified = group.parts[group.parts.length - 1].asset.updated_at || release.created_at || '';
                files.push({
                    name,
                    size: totalSize,
                    lastModified,
                    href: `${release.id}:${ids}`,
                    releaseUrl: release.html_url,
                });
            }
        }

        files.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
        return files;
    } catch {
        return [];
    }
}

export async function getLatestGithubBackup(config: GitHubBackupConfig): Promise<GitHubBackupFile | null> {
    const files = await listGithubBackups(config);
    return files[0] || null;
}

export async function downloadGithubBackup(
    config: GitHubBackupConfig,
    file: GitHubBackupFile,
    onProgress?: (percent: number) => void,
): Promise<Blob | null> {
    const [, idsStr] = file.href.split(':');
    const assetIds = (idsStr || '').split(',').map(id => Number(id)).filter(id => id > 0);
    if (assetIds.length === 0) return null;

    try {
        onProgress?.(2);
        const buffers: ArrayBuffer[] = [];
        const span = 96 / assetIds.length;
        for (let i = 0; i < assetIds.length; i++) {
            const res = await ghRequest(
                githubApiUrl(`/repos/${config.owner}/${config.repo}/releases/assets/${assetIds[i]}`),
                'GET',
                {
                    headers: authHeaders(config.token, { Accept: 'application/octet-stream' }),
                },
            );
            if (res.status !== 200 && res.status !== 206) return null;
            buffers.push(await res.arrayBuffer());
            onProgress?.(Math.min(99, Math.floor(2 + (i + 1) * span)));
        }
        onProgress?.(100);
        return new Blob(buffers, { type: 'application/zip' });
    } catch {
        return null;
    }
}

export async function deleteGithubBackup(config: GitHubBackupConfig, file: GitHubBackupFile): Promise<boolean> {
    const [releaseIdStr] = file.href.split(':');
    const releaseId = Number(releaseIdStr);
    if (!releaseId) return false;

    try {
        let tagName = '';
        const meta = await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/releases/${releaseId}`), 'GET', {
            headers: authHeaders(config.token),
        });
        if (meta.status === 200) {
            const data = await meta.json();
            tagName = data.tag_name || '';
        }

        const deleted = await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/releases/${releaseId}`), 'DELETE', {
            headers: authHeaders(config.token),
        });
        const ok = deleted.status === 204;
        if (ok && tagName) {
            await ghRequest(githubApiUrl(`/repos/${config.owner}/${config.repo}/git/refs/tags/${tagName}`), 'DELETE', {
                headers: authHeaders(config.token),
            }).catch(() => {});
        }
        return ok;
    } catch {
        return false;
    }
}

export async function cleanupOldGithubBackups(config: GitHubBackupConfig, keepCount = 5): Promise<number> {
    const files = await listGithubBackups(config);
    if (files.length <= keepCount) return 0;
    let deleted = 0;
    for (const file of files.slice(keepCount)) {
        if (await deleteGithubBackup(config, file)) deleted++;
    }
    return deleted;
}
