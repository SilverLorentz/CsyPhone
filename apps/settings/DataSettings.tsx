
import React,{ useState,useRef } from 'react';
import { useOS } from '../../context/OSContext';
import { Capacitor } from '@capacitor/core';
import { Filesystem,Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import Modal from '../../components/os/Modal';
import CloudBackupPanel from './CloudBackupPanel';
import { readSystemBackupIncludeVoiceAudio, writeSystemBackupIncludeVoiceAudio } from '../../utils/systemBackup';

const DataSettings: React.FC = () => {
    const { exportSystem, importSystem, addToast, resetSystem } = useOS();

    const [showExportModal, setShowExportModal] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string>('');
    const [includeVoiceAudio, setIncludeVoiceAudio] = useState(readSystemBackupIncludeVoiceAudio);
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async (mode: 'text_only' | 'media_only' | 'full') => {
        try {
            const blob = await exportSystem(mode, { includeVoiceAudio });
            if (Capacitor.isNativePlatform()) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    const base64data = String(reader.result);
                    const fileName = `Sully_Backup_${mode}_${Date.now()}.zip`;
                    try {
                        await Filesystem.writeFile({ path: fileName, data: base64data, directory: Directory.Cache });
                        const uriResult = await Filesystem.getUri({ directory: Directory.Cache, path: fileName });
                        await Share.share({ title: `Sully Backup`, files: [uriResult.uri] });
                    } catch (e) { console.error("Native write failed", e); addToast("保存文件失败", "error"); }
                };
            } else {
                const url = URL.createObjectURL(blob);
                setDownloadUrl(url);
                setShowExportModal(true);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Sully_Backup_${mode}_${new Date().toISOString().slice(0, 10)}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (e: any) { addToast(e.message, 'error'); }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        importSystem(file).catch(err => { console.error(err); addToast(err.message || '恢复失败', 'error'); });
        if (importInputRef.current) importInputRef.current.value = '';
    };

    const toggleVoiceAudioBackup = () => {
        setIncludeVoiceAudio(prev => {
            const next = !prev;
            writeSystemBackupIncludeVoiceAudio(next);
            return next;
        });
    };

    const confirmReset = () => { resetSystem(); setShowResetConfirm(false); };

    return (
        <>
            <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-blue-100 rounded-xl text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
                    </div>
                    <h2 className="text-sm font-semibold text-slate-600 tracking-wider">备份与恢复 (ZIP)</h2>
                </div>

                <button
                    type="button"
                    onClick={toggleVoiceAudioBackup}
                    className="w-full mb-4 px-4 py-3 bg-white/70 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all"
                >
                    <div>
                        <div className="text-xs font-bold text-slate-600">包含通话录音</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">完整/媒体备份会带上语音通话音频，文件体积可能明显变大。</div>
                    </div>
                    <div className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${includeVoiceAudio ? 'bg-violet-500' : 'bg-slate-200'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${includeVoiceAudio ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                </button>

                <div className="mb-3">
                    <button onClick={() => handleExport('full')} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 border border-violet-300 rounded-xl text-xs font-bold text-white shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 relative overflow-hidden mb-3">
                        <div className="absolute top-0 right-0 px-1.5 py-0.5 bg-white/20 text-[9px] text-white rounded-bl-lg font-bold">完整</div>
                        <div className="p-2 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg></div>
                        <span>整合导出 (文字+媒体)</span>
                    </button>
                </div>

                <p className="text-[10px] text-slate-400 px-1 mb-3 text-center">以下为分步导出，适合低配设备分次备份</p>

                <div className="grid grid-cols-2 gap-3 mb-3">
                    <button onClick={() => handleExport('text_only')} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 relative overflow-hidden">
                        <div className="p-2 bg-blue-50 rounded-full text-blue-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>
                        <span>纯文字备份</span>
                    </button>
                    <button onClick={() => handleExport('media_only')} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2">
                        <div className="p-2 bg-pink-50 rounded-full text-pink-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg></div>
                        <span>媒体与美化素材</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3 mb-4">
                    <div onClick={() => importInputRef.current?.click()} className="py-4 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-sm active:scale-95 transition-all flex flex-col items-center gap-2 cursor-pointer hover:bg-emerald-50 hover:border-emerald-200">
                        <div className="p-2 bg-emerald-100 rounded-full text-emerald-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></div>
                        <span>导入备份 (.zip)</span>
                    </div>
                    <input type="file" ref={importInputRef} className="hidden" accept=".zip" onChange={handleImport} />
                </div>

                <p className="text-[10px] text-slate-400 px-1 mb-4 leading-relaxed">
                    • <b>整合导出</b>: 一次性导出所有数据（文字+媒体），适合设备性能充足的用户。<br />
                    • <b>纯文字备份</b>: 包含所有聊天记录、角色设定、剧情数据。所有图片会被移除（减小体积）。<br />
                    • <b>媒体与美化素材</b>: 导出相册、表情包、聊天图片、头像、主题气泡、壁纸、图标等图片资源和外观配置。
                </p>

                <button onClick={() => setShowResetConfirm(true)} className="w-full py-3 bg-red-50 border border-red-100 text-red-500 rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                    格式化系统 (出厂设置)
                </button>
            </section>

            {/* 云端备份 */}
            <CloudBackupPanel />

            {/* 导出完成 Modal */}
            <Modal isOpen={showExportModal} title="备份下载" onClose={() => setShowExportModal(false)} footer={
                <div className="flex gap-2 w-full">
                    <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">关闭</button>
                </div>
            }>
                <div className="space-y-4 text-center py-4">
                    <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    </div>
                    <p className="text-sm font-bold text-slate-700">备份文件已生成！</p>
                    <p className="text-xs text-slate-500">如果浏览器没有自动下载，请点击下方链接。</p>
                    {downloadUrl && <a href={downloadUrl} download="Sully_Backup.zip" className="text-primary text-sm underline block py-2">点击手动下载 .zip</a>}
                </div>
            </Modal>

            {/* 确认重置 Modal */}
            <Modal
                isOpen={showResetConfirm}
                title="系统警告"
                onClose={() => setShowResetConfirm(false)}
                footer={
                    <div className="flex gap-2 w-full">
                        <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button>
                        <button onClick={confirmReset} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">确认格式化</button>
                    </div>
                }
            >
                <div className="flex flex-col items-center gap-3 py-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-red-500"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                    <p className="text-center text-sm text-slate-600 font-medium">
                        这将<span className="text-red-500 font-bold">永久删除</span>所有角色、聊天记录和设置，且无法恢复！
                    </p>
                </div>
            </Modal>
        </>
    );
};

export default DataSettings;
