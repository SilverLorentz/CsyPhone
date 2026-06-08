import React,{ useEffect,useState } from 'react';
import { useOS } from '../../context/OSContext';
import BackendDiagnosticsCard from './BackendDiagnosticsCard';
import {
  cancelMemoryEngineReindex,
  getMemoryEmbeddingEngineStatus,
  retryFailedMemoryEngineReindex,
  switchMemoryEmbeddingEngine,
  type MemoryEmbeddingEngineId,
  type MemoryEmbeddingEngineStatus,
} from '../../utils/backendClient';
import { getGuardedInputProps } from '../../utils/inputGuards';
import {
    EMBEDDING_ENGINES,
    getEmbeddingConfig,
    inferEmbeddingEngineId,
    setEmbeddingConfig,
    type EmbeddingRuntimeConfig,
} from '../../utils/runtimeConfig';

const ENGINE_COPY: Record<MemoryEmbeddingEngineId, {
    title: string;
    badge: string;
    summary: string;
    cost: string;
    fit: string;
}> = {
    standard: {
        title: '标准版',
        badge: '免费',
        summary: 'bge-m3 + bge-reranker，全免费、稳定。',
        cost: '免费',
        fit: '适合预算敏感或"够用就好"的记忆检索。',
    },
    enhanced: {
        title: '增强版',
        badge: '更强',
        summary: 'Qwen3-Embedding + Qwen3-Reranker，深度理解，召回最强。',
        cost: '向量 + 重排序均为付费（极低费用）',
        fit: '适合追求最佳记忆召回和更强语义理解。',
    },
};

function getStoredEmbeddingState(): {
    config: EmbeddingRuntimeConfig;
    engineId: MemoryEmbeddingEngineId;
} {
    const config = getEmbeddingConfig();
    return {
        config,
        engineId: inferEmbeddingEngineId(config.model) as MemoryEmbeddingEngineId,
    };
}

function getDefaultBaseUrl(engineId: MemoryEmbeddingEngineId): string {
    return EMBEDDING_ENGINES[engineId].baseUrl;
}

function buildEmbeddingConfigForEngine(
    engineId: MemoryEmbeddingEngineId,
    currentConfig: EmbeddingRuntimeConfig,
    baseUrlOverride?: string,
): EmbeddingRuntimeConfig {
    const engine = EMBEDDING_ENGINES[engineId];
    return {
        ...currentConfig,
        provider: 'openai',
        baseUrl: baseUrlOverride?.trim() || currentConfig.baseUrl || engine.baseUrl,
        model: engine.model,
    };
}

function persistEmbeddingEngine(engineId: MemoryEmbeddingEngineId, baseUrlOverride?: string): EmbeddingRuntimeConfig {
    const nextConfig = buildEmbeddingConfigForEngine(engineId, getEmbeddingConfig(), baseUrlOverride);
    setEmbeddingConfig(nextConfig);
    return nextConfig;
}

function isTerminalJob(status?: string | null): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function formatJobProgress(job: MemoryEmbeddingEngineStatus['reindexJob']) {
    if (!job || job.totalItems <= 0) return null;
    const finished = job.completedItems + job.failedItems + job.cancelledItems;
    const percent = Math.max(0, Math.min(100, Math.round((finished / job.totalItems) * 100)));
    return {
        finished,
        percent,
    };
}

const EmbeddingSettings: React.FC = () => {
    const { addToast } = useOS();
    const [engineId, setEngineId] = useState<MemoryEmbeddingEngineId>(() => getStoredEmbeddingState().engineId);
    const [embeddingKey, setEmbeddingKey] = useState(() => getStoredEmbeddingState().config.apiKey);
    const [embeddingUrl, setEmbeddingUrl] = useState(() => {
        const stored = getStoredEmbeddingState();
        return stored.config.baseUrl || getDefaultBaseUrl(stored.engineId);
    });
    const [embeddingTestStatus, setEmbeddingTestStatus] = useState('');
    const [cloudStatus, setCloudStatus] = useState<MemoryEmbeddingEngineStatus | null>(null);
    const [isStatusLoading, setIsStatusLoading] = useState(true);
    const [isSwitching, setIsSwitching] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isRetryingFailed, setIsRetryingFailed] = useState(false);

    const selectedEngine = EMBEDDING_ENGINES[engineId];
    const activeJob = cloudStatus?.reindexJob || null;
    const hasActiveJob = Boolean(activeJob && !isTerminalJob(activeJob.status));
    const canCancelActiveJob = activeJob?.status === 'queued' || activeJob?.status === 'processing';
    const canRetryFailedItems = Boolean(activeJob && isTerminalJob(activeJob.status) && activeJob.failedItems > 0);
    const progress = formatJobProgress(activeJob);

    const refreshCloudStatus = async () => {
        const status = await getMemoryEmbeddingEngineStatus();
        if (!status) return;

        setCloudStatus(status);
        setEngineId(status.engineId);
        persistEmbeddingEngine(status.engineId);
    };

    useEffect(() => {
        let alive = true;

        const load = async () => {
            const status = await getMemoryEmbeddingEngineStatus();
            if (!alive) return;

            if (status) {
                setCloudStatus(status);
                setEngineId(status.engineId);
                persistEmbeddingEngine(status.engineId);
            }

            setIsStatusLoading(false);
        };

        void load();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        if (!activeJob || isTerminalJob(activeJob.status)) return;

        const timer = window.setInterval(() => {
            void refreshCloudStatus();
        }, 2500);

        return () => {
            window.clearInterval(timer);
        };
    }, [activeJob?.id, activeJob?.status]);

    const handleSaveCredentials = () => {
        const trimmedKey = embeddingKey.trim();
        const nextBaseUrl = embeddingUrl.trim() || getDefaultBaseUrl(engineId);
        const nextConfig = buildEmbeddingConfigForEngine(engineId, {
            ...getEmbeddingConfig(),
            apiKey: trimmedKey,
        }, nextBaseUrl);

        setEmbeddingConfig(nextConfig);
        setEmbeddingKey(nextConfig.apiKey);
        setEmbeddingUrl(nextConfig.baseUrl);
        addToast('记忆引擎凭证已保存', 'success');
    };

    const handleTest = async () => {
        const apiKey = embeddingKey.trim();
        if (!apiKey) {
            setEmbeddingTestStatus('请先填写 Embedding API Key');
            return;
        }

        setEmbeddingTestStatus('测试中...');
        try {
            const baseUrl = (embeddingUrl.trim() || getDefaultBaseUrl(engineId)).replace(/\/+$/, '');
            const resp = await fetch(`${baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: selectedEngine.model,
                    input: '测试记忆引擎连接',
                    encoding_format: 'float',
                    ...(typeof selectedEngine.dimensions === 'number' ? { dimensions: selectedEngine.dimensions } : {}),
                }),
            });

            if (!resp.ok) {
                const errorText = await resp.text();
                setEmbeddingTestStatus(`连接失败：HTTP ${resp.status} ${errorText.slice(0, 100)}`);
                return;
            }

            const data = await resp.json();
            const dim = data.data?.[0]?.embedding?.length || '?';
            setEmbeddingTestStatus(`连接成功：${selectedEngine.model}（维度 ${dim}）`);
        } catch (err: any) {
            setEmbeddingTestStatus(`网络错误：${err.message}`);
        }
    };

    const handleSwitchEngine = async (nextEngineId: MemoryEmbeddingEngineId) => {
        if (isSwitching) return;

        if (hasActiveJob) {
            addToast('旧记忆正在后台重建，先等这一轮完成', 'info');
            return;
        }

        if (nextEngineId === engineId) {
            if (canRetryFailedItems) {
                addToast(`当前已经是${ENGINE_COPY[nextEngineId].title}，失败项可用下方按钮单独重试`, 'info');
            } else {
                addToast(`当前已经是${ENGINE_COPY[nextEngineId].title}`, 'info');
            }
            return;
        }

        setIsSwitching(true);
        const result = await switchMemoryEmbeddingEngine(nextEngineId);

        if (result.ok && result.status) {
            setCloudStatus(result.status);
            setEngineId(result.status.engineId);
            persistEmbeddingEngine(result.status.engineId, embeddingUrl.trim() || getDefaultBaseUrl(result.status.engineId));

            if (result.status.reindexJob) {
                addToast(`${ENGINE_COPY[result.status.engineId].title}已启用，旧记忆正在后台重建`, 'success');
            } else {
                addToast(`${ENGINE_COPY[result.status.engineId].title}已启用`, 'success');
            }
        } else if (result.reason === 'backend_unavailable') {
            setEngineId(nextEngineId);
            persistEmbeddingEngine(nextEngineId, embeddingUrl.trim() || getDefaultBaseUrl(nextEngineId));
            addToast('本地引擎已切换；云端后端当前不可用，旧记忆不会自动重建', 'info');
        } else if (result.reason === 'switch_in_progress') {
            if (result.status) {
                setCloudStatus(result.status);
                setEngineId(result.status.engineId);
                persistEmbeddingEngine(result.status.engineId, embeddingUrl.trim() || getDefaultBaseUrl(result.status.engineId));
            }
            addToast('已有一轮旧记忆重建任务在进行中，请稍候', 'info');
        } else {
            addToast(result.detail || '切换记忆引擎失败', 'error');
        }

        setIsSwitching(false);
    };

    const handleCancelReindex = async () => {
        if (!activeJob || !canCancelActiveJob || isCancelling) return;

        setIsCancelling(true);
        try {
            const ok = await cancelMemoryEngineReindex(activeJob.id);
            if (!ok) {
                addToast('取消重建失败，请稍后重试', 'error');
                return;
            }

            await refreshCloudStatus();
            addToast('重建任务已取消，已处理的记忆会保留', 'success');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleRetryFailedReindex = async () => {
        if (!activeJob || !canRetryFailedItems || isRetryingFailed) return;

        setIsRetryingFailed(true);
        try {
            const result = await retryFailedMemoryEngineReindex(activeJob.id);
            if (result.ok && result.status) {
                setCloudStatus(result.status);
                setEngineId(result.status.engineId);
                persistEmbeddingEngine(result.status.engineId, embeddingUrl.trim() || getDefaultBaseUrl(result.status.engineId));
                addToast(`已重新排队 ${result.retriedItems ?? activeJob.failedItems} 条失败记忆`, 'success');
                return;
            }

            if (result.reason === 'no_failed_items') {
                await refreshCloudStatus();
                addToast('当前没有可重试的失败项', 'info');
                return;
            }

            if (result.reason === 'switch_in_progress') {
                if (result.status) {
                    setCloudStatus(result.status);
                    setEngineId(result.status.engineId);
                    persistEmbeddingEngine(result.status.engineId, embeddingUrl.trim() || getDefaultBaseUrl(result.status.engineId));
                }
                addToast('已有一轮旧记忆重建任务在进行中，请稍候', 'info');
                return;
            }

            addToast(result.detail || '失败项重试启动失败', 'error');
        } finally {
            setIsRetryingFailed(false);
        }
    };

    return (
        <div className="space-y-5">
            <section className="relative overflow-hidden bg-[#f0f7ee]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#d4e8d0]/60">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#c8e8c0]/30 to-[#d4e4f7]/30 blur-2xl pointer-events-none" />
                <div className="relative flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-gradient-to-br from-[#c8e8c0]/60 to-[#d4e8d0]/60 backdrop-blur-sm rounded-2xl text-[#6b9b60]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-[#5a7a52] tracking-wider">多模型记忆引擎</h2>
                        <p className="text-[10px] text-[#8bab82]">点一下就切换标准版 / 增强版，系统会自动重建旧记忆。</p>
                    </div>
                </div>

                <p className="text-xs text-[#8bab82] leading-relaxed">
                    标准版走免费 `bge-m3`，增强版走 `Qwen3-Embedding-8B`。切换时会复用后台队列，把旧记忆一条条重新向量化。
                </p>
            </section>

            <section className="bg-[#fefcf7]/70 backdrop-blur-sm p-5 rounded-3xl border border-[#ece4d7]/70 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-[#7b6959]">引擎切换</div>
                        <p className="text-[10px] text-[#a08f80] mt-1">切换后，新记忆提取和检索都会走当前引擎；旧记忆由后台慢慢补齐。</p>
                    </div>
                    <div className="text-[10px] font-bold px-3 py-1 rounded-full bg-white/70 text-[#7b6959] border border-[#e7ded1]">
                        当前：{ENGINE_COPY[engineId].title}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {(['standard', 'enhanced'] as MemoryEmbeddingEngineId[]).map((id) => {
                        const copy = ENGINE_COPY[id];
                        const active = engineId === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => void handleSwitchEngine(id)}
                                disabled={isSwitching || hasActiveJob}
                                className={`rounded-2xl p-4 text-left transition-all border ${
                                    active
                                        ? 'bg-[#f0f7ee] border-[#7faa95]/40 shadow-sm'
                                        : 'bg-white/70 border-[#ece4d7]/70 hover:border-[#d8ccb9]'
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-sm font-bold ${active ? 'text-[#4f7a63]' : 'text-[#7b6959]'}`}>{copy.title}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${active ? 'bg-[#dff1e7] text-[#4f7a63]' : 'bg-[#f3ede3] text-[#9a8574]'}`}>
                                        {copy.badge}
                                    </span>
                                </div>
                                <p className="text-[11px] text-[#7b6959] leading-relaxed">{copy.summary}</p>
                                <div className="mt-3 text-[10px] text-[#a08f80] leading-relaxed">
                                    <div>费用：{copy.cost}</div>
                                    <div className="mt-1">适合：{copy.fit}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="bg-white/65 backdrop-blur-sm p-5 rounded-3xl border border-white/60 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-bold text-[#6b7f73]">后台重建状态</div>
                        <p className="text-[10px] text-[#93a197] mt-1">
                            {isStatusLoading ? '正在读取云端状态…' : '如果有旧记忆重建任务，这里会显示实时进度。'}
                        </p>
                    </div>
                    {activeJob && (
                        <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                            activeJob.status === 'completed'
                                ? 'bg-[#e6f5ee] text-[#4f7a63]'
                                : activeJob.status === 'failed'
                                    ? 'bg-[#fde7e7] text-[#c06767]'
                                    : activeJob.status === 'cancelled'
                                        ? 'bg-[#f3ede3] text-[#9a8574]'
                                        : 'bg-[#eef4ff] text-[#6078c4]'
                        }`}>
                            {activeJob.status === 'queued' && '排队中'}
                            {activeJob.status === 'processing' && '重建中'}
                            {activeJob.status === 'completed' && '已完成'}
                            {activeJob.status === 'failed' && '失败'}
                            {activeJob.status === 'cancelled' && '已取消'}
                        </span>
                    )}
                </div>

                {activeJob ? (
                    <div className="rounded-2xl bg-[#f7faf8] border border-[#e5efea] p-4 space-y-3">
                        {progress && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-[#6b7f73] font-bold">旧记忆重建进度</span>
                                    <div className="flex items-center gap-3">
                                        <span className="text-[#93a197]">{progress.finished} / {activeJob.totalItems}</span>
                                        {canCancelActiveJob && (
                                            <button
                                                type="button"
                                                onClick={() => void handleCancelReindex()}
                                                disabled={isCancelling}
                                                className="text-[10px] text-[#c06767] transition-colors hover:text-[#ab5656] disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {isCancelling ? '取消中...' : '取消重建'}
                                            </button>
                                        )}
                                        {canRetryFailedItems && (
                                            <button
                                                type="button"
                                                onClick={() => void handleRetryFailedReindex()}
                                                disabled={isRetryingFailed}
                                                className="text-[10px] text-[#6078c4] transition-colors hover:text-[#4761b2] disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {isRetryingFailed ? '补跑中...' : '只重试失败项'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="h-2 rounded-full bg-[#e8efeb] overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-[#7faa95] to-[#94c6af]" style={{ width: `${progress.percent}%` }} />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-[10px] text-[#7b6959]">
                            <div>已完成：{activeJob.completedItems}</div>
                            <div>处理中：{activeJob.processingItems}</div>
                            <div>排队中：{activeJob.queuedItems}</div>
                            <div>失败：{activeJob.failedItems}</div>
                        </div>

                        {canRetryFailedItems && (
                            <p className="text-[10px] text-[#6078c4] leading-relaxed">
                                已成功的旧记忆会保留，点击“只重试失败项”只补跑失败那一批。
                            </p>
                        )}

                        {activeJob.error && (
                            <p className="text-[10px] text-[#c06767] leading-relaxed">错误：{activeJob.error}</p>
                        )}
                    </div>
                ) : (
                    <div className="rounded-2xl bg-[#f7faf8] border border-[#e5efea] p-4 text-[11px] text-[#93a197]">
                        当前没有进行中的旧记忆重建任务。
                    </div>
                )}
            </section>

            <section className="bg-[#f0f7ee]/60 backdrop-blur-sm p-5 rounded-3xl border border-[#d4e8d0]/60 space-y-4">
                <div>
                    <div className="text-sm font-bold text-[#5a7a52]">当前引擎详情</div>
                    <p className="text-[10px] text-[#8bab82] mt-1">标准版用免费重排序 (bge-reranker)，增强版用付费重排序 (Qwen3-Reranker-8B)。</p>
                </div>

                <div className="grid grid-cols-1 gap-2 text-[11px]">
                    <div className="rounded-2xl bg-white/70 border border-[#d4e8d0]/60 px-4 py-3">
                        <span className="text-[#8bab82]">Embedding 模型</span>
                        <div className="text-[#5a7a52] font-mono mt-1 break-all">{selectedEngine.model}</div>
                    </div>
                    <div className="rounded-2xl bg-white/70 border border-[#d4e8d0]/60 px-4 py-3">
                        <span className="text-[#8bab82]">Reranker</span>
                        <div className="text-[#5a7a52] font-mono mt-1">{selectedEngine.rerankModel}</div>
                    </div>
                    <div className="rounded-2xl bg-white/70 border border-[#d4e8d0]/60 px-4 py-3">
                        <span className="text-[#8bab82]">Vectorize 索引</span>
                        <div className="text-[#5a7a52] font-mono mt-1">{cloudStatus?.engine.vectorizeBinding || (engineId === 'enhanced' ? 'VECTOR_INDEX' : 'LEGACY_VECTOR_INDEX')}</div>
                    </div>
                </div>
            </section>

            <BackendDiagnosticsCard />

            <section className="bg-[#f8fbff]/70 backdrop-blur-sm p-5 rounded-3xl border border-[#d9e7f6]/60 space-y-4">
                <div>
                    <div className="text-sm font-bold text-[#5e7890]">API 凭证</div>
                    <p className="text-[10px] text-[#8da3b7] mt-1">这里只保存 Embedding Key 和 Base URL；具体模型由上面的两个按钮决定。</p>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-[#8da3b7] uppercase tracking-widest mb-1.5 block pl-1">Base URL</label>
                    <input
                        type="text"
                        value={embeddingUrl}
                        onChange={(event) => setEmbeddingUrl(event.target.value)}
                        placeholder={getDefaultBaseUrl(engineId)}
                        className="w-full bg-white/70 border border-[#d9e7f6]/70 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                        {...getGuardedInputProps({ kind: 'url', field: 'embedding-base-url' })}
                    />
                </div>

                <div>
                    <label className="text-[10px] font-bold text-[#8da3b7] uppercase tracking-widest mb-1.5 block pl-1">API Key</label>
                    <input
                        type="text"
                        value={embeddingKey}
                        onChange={(event) => setEmbeddingKey(event.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-white/70 border border-[#d9e7f6]/70 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                        {...getGuardedInputProps({ kind: 'secret', field: 'embedding-api-key' })}
                    />
                    <a
                        href="https://cloud.siliconflow.cn/account/ak"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#5e7890] hover:underline mt-1.5 inline-block pl-1"
                    >
                        → 获取 SiliconFlow API Key
                    </a>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleSaveCredentials}
                        className="flex-1 py-3 rounded-2xl font-bold text-white shadow-lg shadow-[#6f92b8]/20 bg-gradient-to-r from-[#6f92b8] to-[#84a7cd] active:scale-95 transition-all"
                    >
                        保存凭证
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleTest()}
                        className="flex-1 py-3 rounded-2xl font-bold bg-white border border-[#d9e7f6] text-[#5e7890] active:scale-95 transition-all"
                    >
                        测试当前引擎
                    </button>
                </div>

                {embeddingTestStatus && (
                    <p className={`text-xs px-1 ${
                        embeddingTestStatus.includes('成功')
                            ? 'text-emerald-600'
                            : embeddingTestStatus.includes('失败') || embeddingTestStatus.includes('错误')
                                ? 'text-red-500'
                                : 'text-[#8da3b7]'
                    }`}>
                        {embeddingTestStatus}
                    </p>
                )}
            </section>
        </div>
    );
};

export default EmbeddingSettings;
