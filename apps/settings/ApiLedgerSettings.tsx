import React,{ useEffect,useMemo,useState } from 'react';
import {
    clearApiRequestLedger,
    exportApiRequestLedgerJson,
    getApiRequestLedgerSummary,
    subscribeApiRequestLedger,
    type ApiRequestLogEntry,
    type ApiTraceFeature,
} from '../../utils/apiRequestLedger';

const FEATURE_LABELS: Record<ApiTraceFeature, string> = {
    chat: '聊天',
    memory: '记忆',
    summary: '摘要',
    tts: 'TTS',
    image: '生图',
    phone: '电话',
    loveshow: '旧恋综记录',
    love_show: '心动放送',
    zhaixinglou: '摘星楼',
    date: '见面',
    theater: '约会',
    newspaper: '昨日来信',
    unknown: '未标注',
};

function formatTime(timestamp: string): string {
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time)) return timestamp;
    return new Date(time).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function statusClass(entry: ApiRequestLogEntry): string {
    if (entry.status === 'success') return 'bg-emerald-50 text-emerald-600';
    if (entry.status === 'failed') return 'bg-rose-50 text-rose-600';
    if (entry.status === 'aborted') return 'bg-slate-100 text-slate-500';
    return 'bg-amber-50 text-amber-600';
}

async function copyText(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        return;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('copy failed');
    }
}

const ApiLedgerSettings: React.FC = () => {
    const [version, setVersion] = useState(0);
    const [copyStatus, setCopyStatus] = useState('');
    const summary = useMemo(() => getApiRequestLedgerSummary(), [version]);
    const featureRows = useMemo(() => (
        Object.entries(summary.featureCounts)
            .filter(([, count]) => count > 0)
            .map(([feature, count]) => ({ feature: feature as ApiTraceFeature, count }))
            .sort((a, b) => b.count - a.count)
    ), [summary.featureCounts]);

    useEffect(() => subscribeApiRequestLedger(() => setVersion(v => v + 1)), []);

    const copyJson = async () => {
        const json = exportApiRequestLedgerJson();
        try {
            await copyText(json);
            setCopyStatus('已复制脱敏 JSON');
        } catch {
            setCopyStatus('复制失败，请使用导出');
        }
        window.setTimeout(() => setCopyStatus(''), 1800);
    };

    const exportJson = () => {
        const blob = new Blob([exportApiRequestLedgerJson()], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `api-request-ledger-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4 text-slate-700">
            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                <div className="text-sm font-semibold">前端 API 请求账本</div>
                <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    日志只保存在本机，记录请求来源、模型、状态和耗时。不保存 API Key、完整 prompt 或回复正文。
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] text-slate-400">今日请求</div>
                        <div className="mt-1 text-2xl font-semibold text-slate-800">{summary.totalToday}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-[10px] text-slate-400">进行中</div>
                        <div className="mt-1 text-2xl font-semibold text-amber-600">{summary.pendingCount}</div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                <div className="mb-3 text-xs font-semibold text-slate-500">今日按功能分组</div>
                {featureRows.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">今天还没有记录到 API 请求。</div>
                ) : (
                    <div className="space-y-2">
                        {featureRows.map(row => (
                            <div key={row.feature} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                <span className="text-xs text-slate-600">{FEATURE_LABELS[row.feature]}</span>
                                <span className="text-xs font-semibold text-slate-800">{row.count}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <button onClick={copyJson} className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white active:scale-[0.98]">
                    复制脱敏 JSON
                </button>
                <button onClick={exportJson} className="flex-1 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm active:scale-[0.98]">
                    导出 JSON
                </button>
            </div>
            {copyStatus && <div className="text-center text-[11px] text-emerald-600">{copyStatus}</div>}

            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold text-slate-500">最近 30 条</div>
                    <button onClick={clearApiRequestLedger} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
                        清空本地日志
                    </button>
                </div>
                <div className="space-y-2">
                    {summary.recent.length === 0 ? (
                        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">暂无请求记录。</div>
                    ) : summary.recent.map(entry => (
                        <div key={entry.requestId} className="rounded-xl bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold text-slate-700">{FEATURE_LABELS[entry.feature]} · {entry.reason}</div>
                                    <div className="mt-1 truncate text-[10px] text-slate-400">
                                        {formatTime(entry.timestamp)} · {entry.provider}{entry.model ? ` · ${entry.model}` : ''}
                                    </div>
                                    {entry.endpoint && (
                                        <div className="mt-1 truncate font-mono text-[9px] text-slate-400">
                                            {entry.endpoint}
                                        </div>
                                    )}
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(entry)}`}>
                                    {entry.status}
                                </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                                {entry.messageId !== undefined && <span>msg: {entry.messageId}</span>}
                                {entry.retryCount > 0 && <span>retry: {entry.retryCount}</span>}
                                {entry.durationMs !== undefined && <span>{entry.durationMs}ms</span>}
                                <span>{entry.userInitiated ? '用户触发' : '系统自动'}</span>
                            </div>
                            {entry.errorMessage && <div className="mt-2 line-clamp-2 text-[10px] text-rose-500">{entry.errorMessage}</div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ApiLedgerSettings;
