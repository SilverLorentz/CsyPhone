import { beforeEach,describe,expect,it,vi } from 'vitest';
import {
    connectGithubBackup,
    GITHUB_BACKUP_CONFIG_KEY,
    GitHubBackupConfig,
    listGithubBackups,
    uploadGithubBackup,
} from '../utils/githubBackup';

function jsonResponse(status: number, data: unknown): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('githubBackup', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it('connects and creates a private backup repo when missing', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(200, { login: 'tester' }))
            .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
            .mockResolvedValueOnce(jsonResponse(201, { name: 'sully-backup' }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await connectGithubBackup('ghp_token', 'sully-backup');

        expect(result.ok).toBe(true);
        expect(result.config?.owner).toBe('tester');
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/github-api/user/repos',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"private":true'),
            }),
        );
        expect(localStorage.getItem(GITHUB_BACKUP_CONFIG_KEY)).toContain('ghp_token');
    });

    it('groups multipart release assets into one restore entry', async () => {
        const config: GitHubBackupConfig = {
            token: 'ghp_token',
            owner: 'tester',
            repo: 'sully-backup',
            connectedAt: 1,
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, [
            {
                id: 10,
                tag_name: 'sully-backup-1',
                created_at: '2026-05-22T00:00:00.000Z',
                html_url: 'https://github.com/tester/sully-backup/releases/tag/sully-backup-1',
                assets: [
                    { id: 2, name: 'Sully_Backup_full_1.part02of02.zip', size: 4, updated_at: '2026-05-22T00:00:02.000Z' },
                    { id: 1, name: 'Sully_Backup_full_1.part01of02.zip', size: 3, updated_at: '2026-05-22T00:00:01.000Z' },
                ],
            },
        ])));

        const files = await listGithubBackups(config);

        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({
            name: 'Sully_Backup_full_1.zip',
            size: 7,
            href: '10:1,2',
        });
    });

    it('uploads release assets through the same-origin upload proxy', async () => {
        const config: GitHubBackupConfig = {
            token: 'ghp_token',
            owner: 'tester',
            repo: 'sully-backup',
            connectedAt: 1,
        };
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, {
            id: 42,
            tag_name: 'sully-backup-42',
        }));
        vi.stubGlobal('fetch', fetchMock);

        const requests: Array<{ method: string; url: string; headers: Record<string, string>; body?: BodyInit }> = [];
        class FakeXHR {
            upload: { onprogress?: (event: ProgressEvent) => void } = {};
            status = 201;
            responseText = '';
            private method = '';
            private url = '';
            private headers: Record<string, string> = {};
            onload?: () => void;
            onerror?: () => void;
            onabort?: () => void;
            ontimeout?: () => void;

            open(method: string, url: string) {
                this.method = method;
                this.url = url;
            }

            setRequestHeader(name: string, value: string) {
                this.headers[name] = value;
            }

            send(body: BodyInit) {
                requests.push({ method: this.method, url: this.url, headers: this.headers, body });
                this.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 3 } as ProgressEvent);
                this.onload?.();
            }
        }
        vi.stubGlobal('XMLHttpRequest', FakeXHR);

        const result = await uploadGithubBackup(config, new Blob(['zip']), 'backup.zip');

        expect(result.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            '/github-api/repos/tester/sully-backup/releases',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(requests).toHaveLength(1);
        expect(requests[0]).toMatchObject({
            method: 'POST',
            url: '/github-upload/repos/tester/sully-backup/releases/42/assets?name=backup.zip',
            headers: {
                Authorization: 'Bearer ghp_token',
                'Content-Type': 'application/zip',
            },
        });
    });

    it('removes the just-created release when asset upload fails', async () => {
        const config: GitHubBackupConfig = {
            token: 'ghp_token',
            owner: 'tester',
            repo: 'sully-backup',
            connectedAt: 1,
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(jsonResponse(201, { id: 42, tag_name: 'sully-backup-42' }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        class FailedXHR {
            upload = {};
            status = 0;
            responseText = '';
            onerror?: () => void;
            open() {}
            setRequestHeader() {}
            send() {
                this.onerror?.();
            }
        }
        vi.stubGlobal('XMLHttpRequest', FailedXHR);

        const result = await uploadGithubBackup(config, new Blob(['zip']), 'backup.zip');

        expect(result.ok).toBe(false);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/github-api/repos/tester/sully-backup/releases/42',
            expect.objectContaining({ method: 'DELETE' }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/github-api/repos/tester/sully-backup/git/refs/tags/sully-backup-42',
            expect.objectContaining({ method: 'DELETE' }),
        );
    });
});
