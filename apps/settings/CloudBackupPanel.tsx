
import React,{ useState,useEffect,useCallback } from 'react';
import { useOS } from '../../context/OSContext';
import Modal from '../../components/os/Modal';
import {
  uploadCloudBackup,
  getLatestCloudBackup,
  downloadCloudBackup,
  isCloudBackupAvailable,
  assertCloudBackupUploadSize,
  CLOUD_BACKUP_MAX_DISPLAY,
  CloudBackupMeta,
} from '../../utils/cloudBackup';
import {
    cleanupOldGithubBackups,
    clearGithubBackupConfig,
    connectGithubBackup,
    DEFAULT_GITHUB_BACKUP_REPO,
    downloadGithubBackup,
    getLatestGithubBackup,
    GitHubBackupConfig,
    GitHubBackupFile,
    listGithubBackups,
    readGithubBackupConfig,
    uploadGithubBackup,
} from '../../utils/githubBackup';
import {
    readSystemBackupIncludeVoiceAudio,
    type SystemBackupMode,
    type SystemBackupOptions,
} from '../../utils/systemBackup';

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatFullDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

const GITHUB_BACKUP_INCLUDE_MEMORY_RECORD_AUDIO_KEY = 'github_backup_include_memory_record_audio';

function readGithubBackupIncludeMemoryRecordAudio(): boolean {
    try {
        return localStorage.getItem(GITHUB_BACKUP_INCLUDE_MEMORY_RECORD_AUDIO_KEY) === 'true';
    } catch {
        return false;
    }
}

function writeGithubBackupIncludeMemoryRecordAudio(value: boolean): void {
    try {
        localStorage.setItem(GITHUB_BACKUP_INCLUDE_MEMORY_RECORD_AUDIO_KEY, String(value));
    } catch {
        // Backup preferences should never block the upload flow.
    }
}

// ─── Icons (pure SVG, no emoji) ──────────────────────────────────────────

const CloudIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 .75-7.425A4.502 4.502 0 0 0 13.5 7.5 4.5 4.5 0 0 0 9.075 9.75 3.75 3.75 0 0 0 2.25 15Z" />
    </svg>
);

const GitHubIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" clipRule="evenodd" />
    </svg>
);

const UploadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
);

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
);

const ShieldIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

const ClockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

type ExportSystemFn = (mode: SystemBackupMode, options?: SystemBackupOptions) => Promise<Blob>;
type ImportSystemFn = (fileOrJson: File | string) => Promise<void>;
type AddToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

interface GithubBackupCardProps {
    exportSystem: ExportSystemFn;
    importSystem: ImportSystemFn;
    addToast: AddToastFn;
    sysOperation: { status: 'idle' | 'processing'; message?: string; progress?: number };
}

const GithubBackupCard: React.FC<GithubBackupCardProps> = ({
    exportSystem,
    importSystem,
    addToast,
    sysOperation,
}) => {
    const [config, setConfig] = useState<GitHubBackupConfig | null>(() => readGithubBackupConfig());
    const [token, setToken] = useState(() => readGithubBackupConfig()?.token || '');
    const [repo, setRepo] = useState(() => readGithubBackupConfig()?.repo || DEFAULT_GITHUB_BACKUP_REPO);
    const [latestBackup, setLatestBackup] = useState<GitHubBackupFile | null>(null);
    const [backupFiles, setBackupFiles] = useState<GitHubBackupFile[]>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [restoreTarget, setRestoreTarget] = useState<GitHubBackupFile | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [connectResult, setConnectResult] = useState('');
    const [includeMemoryRecordAudio, setIncludeMemoryRecordAudio] = useState(readGithubBackupIncludeMemoryRecordAudio);

    const refreshGithubBackups = useCallback(async () => {
        if (!config) {
            setLatestBackup(null);
            setBackupFiles([]);
            return;
        }
        setLoading(true);
        try {
            const [latest, files] = await Promise.all([
                getLatestGithubBackup(config),
                listGithubBackups(config),
            ]);
            setLatestBackup(latest);
            setBackupFiles(files);
        } catch (e: any) {
            addToast(e?.message || '获取 GitHub 备份失败', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, config]);

    useEffect(() => {
        void refreshGithubBackups();
    }, [refreshGithubBackups]);

    const handleConnect = async () => {
        if (!token.trim()) {
            setConnectResult('请先填写 Token');
            return;
        }
        setConnecting(true);
        setConnectResult('');
        try {
            const result = await connectGithubBackup(token, repo);
            setConnectResult(result.message);
            if (result.ok && result.config) {
                setConfig(result.config);
                setToken(result.config.token);
                setRepo(result.config.repo);
                addToast('GitHub 备份已连接', 'success');
            }
        } catch (e: any) {
            setConnectResult(e?.message || '连接失败');
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = () => {
        clearGithubBackupConfig();
        setConfig(null);
        setLatestBackup(null);
        setBackupFiles([]);
        setConnectResult('');
        addToast('GitHub 备份已断开', 'info');
    };

    const toggleMemoryRecordAudioBackup = () => {
        const next = !includeMemoryRecordAudio;
        setIncludeMemoryRecordAudio(next);
        writeGithubBackupIncludeMemoryRecordAudio(next);
    };

    const handleGithubUpload = async () => {
        if (!config || uploading) return;
        setUploading(true);
        setProgress(null);
        try {
            addToast('正在生成备份...', 'info');
            const blob = await exportSystem('full', {
                includeVoiceAudio: readSystemBackupIncludeVoiceAudio(),
                includeMemoryRecordAudio,
            });
            const filename = `Sully_Backup_full_${Date.now()}.zip`;
            const audioNote = includeMemoryRecordAudio ? '包含回忆唱片歌曲音频' : '不含歌曲音频';
            addToast(`备份已生成（${formatBytes(blob.size)}，${audioNote}），正在上传到 GitHub...`, 'info');
            const result = await uploadGithubBackup(config, blob, filename, (percent) => {
                setProgress(percent);
            });
            if (!result.ok) throw new Error(result.message);
            if (result.config) setConfig(result.config);
            await cleanupOldGithubBackups(result.config || config, 5).catch(() => {});
            addToast('GitHub 备份上传成功', 'success');
            await refreshGithubBackups();
        } catch (e: any) {
            addToast(e?.message || 'GitHub 上传失败', 'error');
        } finally {
            setUploading(false);
            setProgress(null);
        }
    };

    const handleOpenGithubRestore = async () => {
        setShowRestoreModal(true);
        await refreshGithubBackups();
    };

    const handleGithubRestore = async () => {
        if (!config || !restoreTarget) return;
        setShowRestoreModal(false);
        setRestoreTarget(null);
        setDownloading(true);
        setProgress(null);
        try {
            addToast('正在从 GitHub 下载...', 'info');
            const blob = await downloadGithubBackup(config, restoreTarget, (percent) => {
                setProgress(percent);
            });
            if (!blob) throw new Error('下载失败');
            await importSystem(new File([blob], restoreTarget.name, { type: 'application/zip' }));
        } catch (e: any) {
            addToast(e?.message || 'GitHub 恢复失败', 'error');
        } finally {
            setDownloading(false);
            setProgress(null);
        }
    };

    const githubRepoUrl = config
        ? `https://github.com/${config.owner}/${config.repo}/releases`
        : '';

    return (
        <>
            <section className="bg-white/60 backdrop-blur-sm rounded-3xl shadow-sm border border-white/50 overflow-hidden">
                <div className="p-5 pb-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 bg-gradient-to-br from-slate-800 to-slate-950 rounded-2xl text-white shadow-sm">
                                <GitHubIcon />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-slate-700 tracking-wide">GitHub 备份</h2>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${config ? 'bg-emerald-400 animate-pulse' : 'bg-stone-300'}`} />
                                    <span className={`text-[10px] font-medium truncate ${config ? 'text-emerald-600' : 'text-stone-400'}`}>
                                        {config ? `已连接 · @${config.owner}` : '上传到我的私有仓库'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {config && (
                                <button
                                    onClick={refreshGithubBackups}
                                    disabled={loading}
                                    className="p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all active:scale-90"
                                >
                                    <RefreshIcon spinning={loading} />
                                </button>
                            )}
                            <button
                                onClick={() => setShowConfigModal(true)}
                                className="px-3 py-2 rounded-xl bg-stone-100 text-[11px] font-semibold text-slate-600 active:scale-95 transition-all"
                            >
                                {config ? '设置' : '连接'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-5 pb-4">
                    {config ? (
                        <div className="space-y-3">
                            {latestBackup ? (
                                <div className="bg-white/80 rounded-2xl border border-stone-100 p-4">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                                            <CheckCircleIcon />
                                            <span>最近备份</span>
                                        </div>
                                        <span className="text-[10px] text-stone-400">{formatBytes(latestBackup.size)}</span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-700 truncate">{latestBackup.name}</p>
                                    <p className="text-[10px] text-stone-400 mt-1">
                                        {latestBackup.lastModified ? formatFullDate(latestBackup.lastModified) : '未知时间'}
                                    </p>
                                    {githubRepoUrl && (
                                        <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer" className="block mt-2 text-[10px] text-slate-400 underline underline-offset-2 truncate">
                                            github.com/{config.owner}/{config.repo}/releases
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <div className="py-5 text-center">
                                    <div className="text-stone-300 mb-2 flex justify-center">
                                        <ShieldIcon />
                                    </div>
                                    <p className="text-xs text-stone-400">暂无 GitHub 备份</p>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={toggleMemoryRecordAudioBackup}
                                disabled={uploading}
                                aria-pressed={includeMemoryRecordAudio}
                                className="w-full px-4 py-3 bg-white/75 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all disabled:opacity-60"
                            >
                                <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-600">包含回忆唱片歌曲音频</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                                        打开后 GitHub 备份会带上可播放歌曲，文件会明显变大。
                                    </div>
                                </div>
                                <div className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${includeMemoryRecordAudio ? 'bg-slate-900' : 'bg-slate-200'}`}>
                                    <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${includeMemoryRecordAudio ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleGithubUpload}
                                    disabled={uploading || sysOperation.status !== 'idle'}
                                    className="py-3 bg-slate-900 rounded-2xl text-white text-xs font-bold shadow-lg shadow-slate-200 active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {uploading ? <RefreshIcon spinning /> : <UploadIcon />}
                                    <span>{uploading && progress !== null ? `${progress}%` : '备份到 GitHub'}</span>
                                </button>
                                <button
                                    onClick={handleOpenGithubRestore}
                                    disabled={downloading || backupFiles.length === 0}
                                    className="py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 shadow-sm active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {downloading ? <RefreshIcon spinning /> : <DownloadIcon />}
                                    <span>{downloading && progress !== null ? `${progress}%` : '从 GitHub 恢复'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-xs text-stone-400 leading-relaxed">
                                备份会上传到你自己的 GitHub 私有仓库。
                            </p>
                            <button
                                onClick={() => setShowConfigModal(true)}
                                className="w-full py-3 bg-gradient-to-r from-slate-800 to-slate-950 rounded-2xl text-white text-xs font-bold shadow-lg shadow-slate-200 active:scale-[0.97] transition-all flex items-center justify-center gap-2"
                            >
                                <GitHubIcon className="w-4 h-4" />
                                <span>连接 GitHub 备份</span>
                            </button>
                        </div>
                    )}
                </div>
            </section>

            <Modal isOpen={showConfigModal} title="GitHub 备份" onClose={() => setShowConfigModal(false)}>
                <div className="space-y-4 p-1">
                    <a
                        href="https://github.com/settings/tokens/new?scopes=repo&description=Sully%20%E5%A4%87%E4%BB%BD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full py-3 bg-gradient-to-br from-slate-800 to-slate-950 text-white rounded-xl text-xs font-bold text-center shadow-sm active:scale-95 transition-all"
                    >
                        创建 GitHub Token
                    </a>
                    <div>
                        <label className="text-[11px] text-slate-500 font-medium mb-1 block">Personal Access Token</label>
                        <input
                            type="password"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-mono focus:border-slate-500 focus:ring-1 focus:ring-slate-300 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-[11px] text-slate-500 font-medium mb-1 block">备份仓库名</label>
                        <input
                            type="text"
                            value={repo}
                            onChange={(event) => setRepo(event.target.value)}
                            placeholder={DEFAULT_GITHUB_BACKUP_REPO}
                            className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-mono focus:border-slate-500 focus:ring-1 focus:ring-slate-300 outline-none"
                        />
                    </div>
                    {connectResult && (
                        <p className={`text-[11px] text-center font-medium ${connectResult.startsWith('已连接') ? 'text-green-600' : 'text-red-500'}`}>
                            {connectResult}
                        </p>
                    )}
                    {config && (
                        <a href={githubRepoUrl} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-slate-500 font-mono break-all underline hover:text-slate-800">
                            github.com/{config.owner}/{config.repo}/releases
                        </a>
                    )}
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button onClick={() => setShowConfigModal(false)} className="py-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-500">关闭</button>
                        <button
                            onClick={handleConnect}
                            disabled={connecting || !token.trim()}
                            className="py-2.5 bg-slate-900 rounded-xl text-xs font-bold text-white disabled:opacity-40"
                        >
                            {connecting ? '连接中...' : '测试并连接'}
                        </button>
                    </div>
                    {config && (
                        <button onClick={handleDisconnect} className="w-full py-2 text-[11px] text-red-400 font-medium">断开 GitHub</button>
                    )}
                </div>
            </Modal>

            <Modal isOpen={showRestoreModal} title="从 GitHub 恢复" onClose={() => setShowRestoreModal(false)}>
                <div className="space-y-2 p-1">
                    {backupFiles.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-[11px] text-slate-400">{loading ? '正在加载 GitHub 备份列表...' : '暂无 GitHub 备份'}</p>
                        </div>
                    ) : (
                        <div className="max-h-[50vh] overflow-y-auto space-y-2">
                            {backupFiles.map((file) => (
                                <button
                                    key={file.href}
                                    onClick={() => setRestoreTarget(file)}
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-left hover:bg-slate-50 hover:border-slate-300 transition-colors active:scale-[0.98]"
                                >
                                    <p className="text-[11px] text-slate-700 font-medium truncate">{file.name}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-slate-400">{file.lastModified ? formatFullDate(file.lastModified) : '未知时间'}</span>
                                        <span className="text-[10px] text-slate-400">{formatBytes(file.size)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(restoreTarget)}
                title="恢复 GitHub 备份"
                onClose={() => setRestoreTarget(null)}
                footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setRestoreTarget(null)} className="flex-1 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl">取消</button>
                        <button onClick={handleGithubRestore} className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-2xl shadow-lg shadow-slate-200">确认恢复</button>
                    </div>
                }
            >
                <div className="flex flex-col items-center gap-3 py-2">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-700">
                        <DownloadIcon />
                    </div>
                    <p className="text-center text-sm text-slate-600 font-medium leading-relaxed">
                        将从 GitHub 下载备份并<span className="text-slate-900 font-bold">覆盖当前数据</span>，之后系统将自动重启。
                    </p>
                    {restoreTarget && (
                        <p className="text-center text-[10px] text-stone-400">
                            {restoreTarget.lastModified ? formatFullDate(restoreTarget.lastModified) : '未知时间'} · {formatBytes(restoreTarget.size)}
                        </p>
                    )}
                </div>
            </Modal>
        </>
    );
};


// ─── Component ───────────────────────────────────────────────────────────

const CloudBackupPanel: React.FC = () => {
    const { exportSystem, importSystem, addToast, sysOperation } = useOS();

    const [available, setAvailable] = useState<boolean | null>(null);
    const [latestBackup, setLatestBackup] = useState<CloudBackupMeta | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

    // Check availability on mount
    useEffect(() => {
        isCloudBackupAvailable().then(ok => {
            setAvailable(ok);
            if (ok) refreshLatest();
        });
    }, []);

    const refreshLatest = useCallback(async () => {
        setLoading(true);
        try {
            const latest = await getLatestCloudBackup();
            setLatestBackup(latest);
        } catch (e: any) {
            console.warn('Cloud backup check failed:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Upload ──────────────────────────────────────────────────────────

    const handleUpload = async () => {
        if (uploading) return;
        setUploading(true);
        try {
            addToast('正在生成备份...', 'info');
            const blob = await exportSystem('full', {
                includeVoiceAudio: readSystemBackupIncludeVoiceAudio(),
                includeMemoryRecordAudio: false,
            });
            assertCloudBackupUploadSize(blob.size);
            addToast(`备份已生成（${formatBytes(blob.size)}，不含歌曲音频），正在上传到云端...`, 'info');
            const label = new Date().toLocaleString('zh-CN', {
                month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
            });
            await uploadCloudBackup(blob, label, 'manual');
            addToast('云备份上传成功', 'success');
            await refreshLatest();
        } catch (e: any) {
            addToast(e.message || '上传失败', 'error');
        } finally {
            setUploading(false);
        }
    };

    // ── Download & Restore ───────────────────────────────────────────────

    const handleRestore = async () => {
        if (!latestBackup) return;
        setShowRestoreConfirm(false);
        setDownloading(true);
        try {
            addToast('正在从云端下载...', 'info');
            const file = await downloadCloudBackup(latestBackup.key);
            await importSystem(file);
        } catch (e: any) {
            addToast(e.message || '恢复失败', 'error');
        } finally {
            setDownloading(false);
        }
    };

    // ── Not Available ────────────────────────────────────────────────────

    if (available === false) {
        return (
            <>
                <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2.5 bg-stone-100 rounded-2xl text-stone-400">
                            <CloudIcon />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-stone-500 tracking-wide">云端备份</h2>
                            <p className="text-[10px] text-stone-400">未连接</p>
                        </div>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed">
                        当前版本不支持云备份或后端服务未响应，请稍后再试。
                    </p>
                </section>
                <GithubBackupCard exportSystem={exportSystem} importSystem={importSystem} addToast={addToast} sysOperation={sysOperation} />
            </>
        );
    }

    if (available === null) {
        return (
            <>
                <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-stone-100 rounded-2xl text-stone-400 animate-pulse">
                            <CloudIcon />
                        </div>
                        <span className="text-xs text-stone-400">正在检查云备份状态...</span>
                    </div>
                </section>
                <GithubBackupCard exportSystem={exportSystem} importSystem={importSystem} addToast={addToast} sysOperation={sysOperation} />
            </>
        );
    }

    // ── Backup Status ────────────────────────────────────────────────────

    const isRecent = latestBackup
        ? (Date.now() - new Date(latestBackup.uploaded).getTime()) < 24 * 60 * 60 * 1000
        : false;

    // ── Main UI ──────────────────────────────────────────────────────────

    return (
        <>
            <section className="bg-white/60 backdrop-blur-sm rounded-3xl shadow-sm border border-white/50 overflow-hidden">
                {/* Header */}
                <div className="p-5 pb-4">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-gradient-to-br from-green-50 to-emerald-100 rounded-2xl text-emerald-600 shadow-sm">
                                <CloudIcon />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-700 tracking-wide">云端备份</h2>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[10px] text-emerald-600 font-medium">已连接 · {CLOUD_BACKUP_MAX_DISPLAY}</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={refreshLatest}
                            disabled={loading}
                            className="p-2 rounded-xl text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-all active:scale-90"
                        >
                            <RefreshIcon spinning={loading} />
                        </button>
                    </div>
                </div>

                {/* Latest Backup Status Card */}
                <div className="px-5 pb-3">
                    {latestBackup ? (
                        <div className="bg-white/80 rounded-2xl border border-stone-100 p-4">
                            {/* Status Badge */}
                            <div className="flex items-center justify-between mb-3">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                                    isRecent
                                        ? 'bg-emerald-50 text-emerald-600'
                                        : 'bg-amber-50 text-amber-600'
                                }`}>
                                    {isRecent ? <CheckCircleIcon /> : <ClockIcon />}
                                    <span>{isRecent ? '已更新' : '待更新'}</span>
                                </div>
                                {latestBackup.label && (
                                    <span className="text-[10px] text-stone-400">{latestBackup.label}</span>
                                )}
                            </div>

                            {/* Info Row */}
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <div className="text-[10px] text-stone-400 mb-0.5">最近备份</div>
                                    <div className="text-xs font-semibold text-slate-700">
                                        {formatTime(latestBackup.uploaded)}
                                    </div>
                                    <div className="text-[10px] text-stone-400 mt-0.5">
                                        {formatFullDate(latestBackup.uploaded)}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <div className="text-[10px] text-stone-400 mb-0.5">备份大小</div>
                                    <div className="text-xs font-semibold text-slate-700">
                                        {formatBytes(latestBackup.size)}
                                    </div>
                                </div>
                            </div>

                            {/* Restore Button */}
                            <button
                                onClick={() => setShowRestoreConfirm(true)}
                                disabled={downloading}
                                className="w-full mt-3 py-2.5 bg-stone-50 hover:bg-stone-100 rounded-xl text-xs font-semibold text-slate-600 flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50"
                            >
                                {downloading ? (
                                    <>
                                        <RefreshIcon spinning />
                                        <span>正在恢复...</span>
                                    </>
                                ) : (
                                    <>
                                        <DownloadIcon />
                                        <span>从云端恢复</span>
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="py-6 text-center">
                            <div className="text-stone-300 mb-2 flex justify-center">
                                <ShieldIcon />
                            </div>
                            <p className="text-xs text-stone-400">暂无云端备份</p>
                            <p className="text-[10px] text-stone-300 mt-1">点击下方按钮创建第一个备份</p>
                        </div>
                    )}
                </div>

                {/* Upload Button */}
                <div className="px-5 pb-3">
                    <button
                        onClick={handleUpload}
                        disabled={uploading || sysOperation.status !== 'idle'}
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl text-white text-xs font-bold shadow-lg shadow-emerald-200/60 active:scale-[0.97] transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <RefreshIcon spinning />
                                <span>正在备份...</span>
                            </>
                        ) : (
                            <>
                                <UploadIcon />
                                <span>立即备份到云端</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Footer Tip */}
                <div className="px-5 pb-4">
                    <p className="text-[10px] text-stone-400 leading-relaxed">
                        自动备份当前暂时关闭，请需要时手动备份。云端备份会保留歌词和唱片记录，但不上传歌曲音频；完整歌曲请用本地备份保存。
                    </p>
                </div>
            </section>
            <GithubBackupCard exportSystem={exportSystem} importSystem={importSystem} addToast={addToast} sysOperation={sysOperation} />

            {/* ── Restore Confirm Modal ── */}
            <Modal
                isOpen={showRestoreConfirm}
                title="恢复云端备份"
                onClose={() => setShowRestoreConfirm(false)}
                footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setShowRestoreConfirm(false)} className="flex-1 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl">取消</button>
                        <button onClick={handleRestore} className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200">确认恢复</button>
                    </div>
                }
            >
                <div className="flex flex-col items-center gap-3 py-2">
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500">
                        <DownloadIcon />
                    </div>
                    <p className="text-center text-sm text-slate-600 font-medium leading-relaxed">
                        将从云端下载备份并<span className="text-emerald-600 font-bold">覆盖当前数据</span>，之后系统将自动重启。
                    </p>
                    {latestBackup && (
                        <p className="text-center text-[10px] text-stone-400">
                            备份时间: {formatFullDate(latestBackup.uploaded)} · {formatBytes(latestBackup.size)}
                        </p>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default CloudBackupPanel;
