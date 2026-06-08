import React,{ useEffect,useState } from 'react';
import { useOS } from '../../context/OSContext';
import {
  readBackendRuntimeDebugSnapshot,
  runBackendDiagnostics,
  subscribeBackendRuntimeDebug,
  type BackendConfigSource,
  type BackendHealthStatus,
  type BackendRetrievalStatus,
  type BackendRuntimeDebugSnapshot,
} from '../../utils/backendClient';
import {
    fetchRemoteBuildInfo,
    getCurrentBuildId,
    shouldRefreshForBuild,
    type BuildInfo,
} from '../../utils/runtimeRecovery';

function formatSource(source: BackendConfigSource): string {
    switch (source) {
        case 'local_override':
            return '本地覆盖';
        case 'build_env':
            return '构建环境';
        case 'default_fallback':
            return '默认回退';
        default:
            return '缺失';
    }
}

function formatHealthStatus(status: BackendHealthStatus): string {
    switch (status) {
        case 'checking':
            return '检查中';
        case 'ok':
            return '已连通';
        case 'missing_config':
            return '缺少配置';
        case 'unavailable':
            return '不可用';
        case 'error':
            return '请求失败';
        default:
            return '未检查';
    }
}

function formatRetrievalStatus(status: BackendRetrievalStatus): string {
    switch (status) {
        case 'requesting':
            return '请求中';
        case 'backend_handled':
            return '后端已处理';
        case 'backend_unavailable':
            return '后端不可用';
        case 'backend_error':
            return '后端报错';
        default:
            return '暂无记录';
    }
}

function getStatusTone(status: BackendHealthStatus | BackendRetrievalStatus): string {
    if (status === 'ok' || status === 'backend_handled') {
        return 'bg-[#e6f5ee] text-[#4f7a63]';
    }
    if (status === 'checking' || status === 'requesting') {
        return 'bg-[#eef4ff] text-[#6078c4]';
    }
    if (status === 'missing_config' || status === 'unavailable' || status === 'backend_unavailable') {
        return 'bg-[#fdf3e8] text-[#b27b45]';
    }
    if (status === 'error' || status === 'backend_error') {
        return 'bg-[#fde7e7] text-[#c06767]';
    }
    return 'bg-[#f3ede3] text-[#9a8574]';
}

function formatTimestamp(timestamp?: number): string {
    if (!timestamp) return '未记录';
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatBuildTimestamp(timestamp?: string): string {
    if (!timestamp) return '未记录';
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return timestamp;
    return parsed.toLocaleString([], {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

const BackendDiagnosticsCard: React.FC = () => {
    const { addToast } = useOS();
    const [snapshot, setSnapshot] = useState<BackendRuntimeDebugSnapshot>(() => readBackendRuntimeDebugSnapshot());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [remoteBuildInfo, setRemoteBuildInfo] = useState<BuildInfo | null>(null);
    const [buildInfoCheckedAt, setBuildInfoCheckedAt] = useState<number | null>(null);
    const [buildInfoError, setBuildInfoError] = useState<string | null>(null);
    const currentBuildId = getCurrentBuildId();

    const refreshBuildInfo = async (): Promise<BuildInfo | null> => {
        try {
            const nextBuildInfo = await fetchRemoteBuildInfo();
            setRemoteBuildInfo(nextBuildInfo);
            setBuildInfoCheckedAt(Date.now());
            setBuildInfoError(nextBuildInfo ? null : '未能从 build-info.json 读取版本信息');
            return nextBuildInfo;
        } catch (err: any) {
            setRemoteBuildInfo(null);
            setBuildInfoCheckedAt(Date.now());
            setBuildInfoError(err?.message || '读取 build-info.json 失败');
            return null;
        }
    };

    useEffect(() => {
        let alive = true;
        const unsubscribe = subscribeBackendRuntimeDebug((nextSnapshot) => {
            if (!alive) return;
            setSnapshot(nextSnapshot);
        });

        if (!snapshot.healthCheckedAt) {
            void (async () => {
                const nextSnapshot = await runBackendDiagnostics();
                if (alive) {
                    setSnapshot(nextSnapshot);
                }
            })();
        }

        void (async () => {
            const nextBuildInfo = await fetchRemoteBuildInfo();
            if (!alive) return;
            setRemoteBuildInfo(nextBuildInfo);
            setBuildInfoCheckedAt(Date.now());
            setBuildInfoError(nextBuildInfo ? null : '未能从 build-info.json 读取版本信息');
        })();

        return () => {
            alive = false;
            unsubscribe();
        };
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            const [nextSnapshot, nextBuildInfo] = await Promise.all([
                runBackendDiagnostics(),
                refreshBuildInfo(),
            ]);
            setSnapshot(nextSnapshot);
            if (nextBuildInfo) {
                setRemoteBuildInfo(nextBuildInfo);
            }
            addToast('后端诊断已刷新', 'success');
        } catch (err: any) {
            addToast(err?.message || '后端诊断刷新失败', 'error');
        } finally {
            setIsRefreshing(false);
        }
    };

    const isBuildStale = shouldRefreshForBuild(remoteBuildInfo, currentBuildId);
    const buildInfoUrl = typeof window !== 'undefined'
        ? new URL('build-info.json', window.location.href).toString()
        : 'build-info.json';

    return (
        <section className="bg-[#fff9f2]/75 backdrop-blur-sm p-5 rounded-3xl border border-[#ecdcc8]/70 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-bold text-[#806a55]">连接诊断</div>
                    <p className="text-[10px] text-[#a7917b] mt-1">
                        这里会直接显示当前页面实际解析到的 backend 配置，不需要再靠控制台猜。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={isRefreshing}
                    className="px-3 py-2 rounded-2xl text-[11px] font-bold bg-white/80 border border-[#ecdcc8] text-[#806a55] active:scale-95 transition-all disabled:opacity-60"
                >
                    {isRefreshing ? '检查中...' : '刷新诊断'}
                </button>
            </div>

            <div className="rounded-2xl bg-white/70 border border-[#efe5d8] p-4 text-[11px] text-[#7b6959] leading-relaxed">
                如果这里显示“构建环境”，说明 beta 包已经内置了 staging 地址或 token。
                即使 `localStorage` 里是空的，也属于正常情况。
            </div>

            {isBuildStale && (
                <div className="rounded-2xl bg-[#fde7e7] border border-[#f2b6b6] px-4 py-3 text-[11px] text-[#a95353] leading-relaxed">
                    当前页面的构建版本和线上 `build-info.json` 不一致，这通常表示你命中了旧缓存包。
                    先清缓存或强刷，再判断正式环境是否还在报旧问题。
                </div>
            )}

            <div className="grid grid-cols-1 gap-2 text-[11px]">
                <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3">
                    <div className="text-[#a7917b]">Backend URL</div>
                    <div className="text-[#6d5948] font-mono mt-1 break-all">{snapshot.backendUrl || '未解析到 URL'}</div>
                    <div className="text-[10px] text-[#b29b84] mt-1">来源：{formatSource(snapshot.backendUrlSource)}</div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3">
                        <div className="text-[#a7917b]">Backend Token</div>
                        <div className="text-[#6d5948] font-bold mt-1">{snapshot.hasBackendToken ? '已检测到' : '缺失'}</div>
                        <div className="text-[10px] text-[#b29b84] mt-1">来源：{formatSource(snapshot.backendTokenSource)}</div>
                    </div>
                    <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3">
                        <div className="text-[#a7917b]">Embedding Key</div>
                        <div className="text-[#6d5948] font-bold mt-1">{snapshot.hasEmbeddingKey ? '已检测到' : '缺失'}</div>
                        <div className="text-[10px] text-[#b29b84] mt-1">来自本地设置</div>
                    </div>
                </div>

                <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[#a7917b]">健康检查</span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${getStatusTone(snapshot.healthStatus)}`}>
                            {formatHealthStatus(snapshot.healthStatus)}
                        </span>
                    </div>
                    <div className="text-[#6d5948] mt-2">{snapshot.healthDetail || '还没有执行健康检查'}</div>
                    <div className="text-[10px] text-[#b29b84] mt-1">最近检查：{formatTimestamp(snapshot.healthCheckedAt)}</div>
                </div>

                <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[#a7917b]">最近一次 Retrieval</span>
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${getStatusTone(snapshot.retrievalStatus)}`}>
                            {formatRetrievalStatus(snapshot.retrievalStatus)}
                        </span>
                    </div>
                    <div className="text-[#6d5948] mt-2">{snapshot.retrievalDetail || '还没有记录到检索请求'}</div>
                    <div className="text-[10px] text-[#b29b84] mt-1">最近时间：{formatTimestamp(snapshot.retrievalAt)}</div>
                </div>

                <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3">
                    <div className="text-[#a7917b]">当前 Embedding 配置</div>
                    <div className="text-[#6d5948] font-mono mt-1 break-all">
                        {snapshot.embeddingModel || '未设置模型'}
                    </div>
                    <div className="text-[10px] text-[#b29b84] mt-1 break-all">
                        Base URL：{snapshot.embeddingBaseUrl || '未设置'}
                    </div>
                </div>

                <div className="rounded-2xl bg-white/70 border border-[#efe5d8] px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[#a7917b]">构建版本检查</span>
                        <a
                            href={buildInfoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-bold text-[#8b6f57] underline underline-offset-2"
                        >
                            打开 build-info.json
                        </a>
                    </div>
                    <div className="text-[#6d5948]">
                        当前页面 Build ID：<span className="font-mono break-all">{currentBuildId}</span>
                    </div>
                    <div className="text-[#6d5948]">
                        线上 build-info Build ID：
                        <span className="font-mono break-all ml-1">{remoteBuildInfo?.buildId || '未读取到'}</span>
                    </div>
                    <div className="text-[10px] text-[#b29b84]">
                        线上 build-info 时间：{formatBuildTimestamp(remoteBuildInfo?.builtAt)}
                    </div>
                    <div className="text-[10px] text-[#b29b84]">
                        最近检查：{formatTimestamp(buildInfoCheckedAt || undefined)}
                    </div>
                    {buildInfoError && (
                        <div className="text-[10px] text-[#c06767]">{buildInfoError}</div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default BackendDiagnosticsCard;
