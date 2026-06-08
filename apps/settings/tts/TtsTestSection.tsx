
import React,{ useState } from 'react';
import { MinimaxTts } from '../../../utils/minimaxTts';
import type { TtsConfig } from '../../../types/tts';

interface Props {
    apiKey: string;
    buildTestConfig: () => TtsConfig;
}

const TtsTestSection: React.FC<Props> = ({ apiKey, buildTestConfig }) => {
    const [testText, setTestText] = useState('你好，这是一段语音合成测试。');
    const [testStatus, setTestStatus] = useState('');
    const [testAudioUrl, setTestAudioUrl] = useState('');

    const handleTest = async () => {
        if (!apiKey) { setTestStatus('❌ 请先填写 API Key'); return; }
        setTestStatus('⏳ 正在合成...');
        if (testAudioUrl) { MinimaxTts.revokeUrl(testAudioUrl); setTestAudioUrl(''); }
        try {
            const testConfig = buildTestConfig();
            const result = await MinimaxTts.synthesizeSync(testText, testConfig, (_s, msg) => setTestStatus(`⏳ ${msg}`));
            setTestAudioUrl(result.url);
            setTestStatus(`✅ 合成成功！字符数: ${result.usageCharacters || '?'}`);
        } catch (e: any) { setTestStatus(`❌ ${e.message}`); }
    };

    return (
        <div className="bg-[#f9f3ee]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
            <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#8b7e74]">测试合成</span></div>
            <textarea value={testText} onChange={e => setTestText(e.target.value)} rows={2} className="w-full bg-white/60 backdrop-blur-sm border border-[#f0e4d7]/50 rounded-xl px-3 py-2.5 text-sm resize-none focus:bg-white/80 transition-all" placeholder="输入测试文本..." />
            <button
                onClick={handleTest}
                disabled={testStatus.startsWith('⏳')}
                className="w-full py-2.5 bg-gradient-to-r from-[#e8a0bf]/60 to-[#c4b0d9]/60 backdrop-blur-sm text-[#8b7e74] text-xs font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 border border-white/30">
                {testStatus.startsWith('⏳') ? testStatus : '测试合成'}
            </button>
            {testAudioUrl && (<audio controls src={testAudioUrl} className="w-full mt-2" style={{ height: 36 }} />)}
            {testStatus && !testStatus.startsWith('⏳') && (
                <p className={`text-xs text-center font-medium ${testStatus.startsWith('✅') ? 'text-[#7faa95]' : 'text-red-400'}`}>{testStatus}</p>
            )}
        </div>
    );
};

export default React.memo(TtsTestSection);
