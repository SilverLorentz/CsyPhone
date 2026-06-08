import { afterEach, describe, expect, it, vi } from 'vitest';

const CLOUD_BACKUP_IMPORT_TIMEOUT_MS = 15_000;

async function importCloudBackup() {
    vi.resetModules();
    return import('../utils/cloudBackup');
}

describe('cloud backup upload limits', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        delete process.env.MODE;
        vi.resetModules();
    });

    it('honors an explicit backup size limit from env', async () => {
        vi.stubEnv('VITE_CSYOS_CLOUD_BACKUP_MAX_MB', '250');

        const mod = await importCloudBackup();

        expect(mod.CLOUD_BACKUP_MAX_MB).toBe(250);
        expect(mod.CLOUD_BACKUP_MAX_BYTES).toBe(250 * 1000 * 1000);
        expect(mod.CLOUD_BACKUP_MAX_DISPLAY).toBe('约250MB');
    }, CLOUD_BACKUP_IMPORT_TIMEOUT_MS);

    it('uses the lower default for staging builds', async () => {
        process.env.MODE = 'staging';

        const mod = await importCloudBackup();

        expect(mod.CLOUD_BACKUP_MAX_MB).toBe(100);
    }, CLOUD_BACKUP_IMPORT_TIMEOUT_MS);

    it('keeps the backend-sized default outside staging', async () => {
        process.env.MODE = 'production';

        const mod = await importCloudBackup();

        expect(mod.CLOUD_BACKUP_MAX_MB).toBe(500);
    }, CLOUD_BACKUP_IMPORT_TIMEOUT_MS);
});
