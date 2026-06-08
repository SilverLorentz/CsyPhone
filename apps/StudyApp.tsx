import React,{ useState,useEffect,useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { StudyCourse,CharacterProfile } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';
import { safeResponseJson } from '../utils/safeApi';
import { loadKatex,loadPdfJs,type KatexLike } from '../utils/lazyThirdParty';

// --- Styles ---
const GRADIENTS = [
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(120deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)',
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(to top, #5ee7df 0%, #b490ca 100%)',
    'linear-gradient(to right, #43e97b 0%, #38f9d7 100%)'
];

// --- Renderer Component ---
// Enhanced Markdown & Math Renderer
const BlackboardRenderer: React.FC<{ text: string, isTyping?: boolean, katexRenderer?: { renderToString: (latex: string, options: any) => string } | null }> = ({ text, isTyping, katexRenderer }) => {
    
    // Helper to render math using KaTeX
    const renderMath = (latex: string, displayMode: boolean) => {
        try {
            // Clean up common latex issues from LLM
            const cleanLatex = latex
                .replace(/\\\[/g, '') // Remove \[
                .replace(/\\\]/g, ''); // Remove \]

            const html = katexRenderer?.renderToString(cleanLatex, {
                displayMode: displayMode,
                throwOnError: false, 
                output: 'html',
            });
            if (!html) {
                return <span className="font-mono text-emerald-200">{latex}</span>;
            }
            // Force white color for KaTeX elements specifically
            return <span dangerouslySetInnerHTML={{ __html: html }} className={displayMode ? "block my-2 w-full overflow-x-auto" : "inline-block mx-1"} />;
        } catch (e) {
            return <span className="text-red-400 text-xs font-mono bg-black/20 p-1 rounded">{latex}</span>;
        }
    };

    // Inline Parser for Bold, Italic, Code, Inline Math ($...$)
    const parseInline = (line: string): React.ReactNode[] => {
        // Regex logic:
        // 1. $...$ (Inline Math)
        // 2. **...** (Bold)
        // 3. *...* (Italic)
        // 4. `...` (Code)
        const tokenRegex = /(\$[^$]+?\$|\*\*[^*]+?\*\*|\*[^*]+?\*|`[^`]+?`)/g;
        
        return line.split(tokenRegex).map((part, i) => {
            if (part.startsWith('$') && part.endsWith('$')) {
                return <span key={i}>{renderMath(part.slice(1, -1), false)}</span>;
            }
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className="text-emerald-300 font-bold mx-0.5">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={i} className="text-emerald-200/80 italic">{part.slice(1, -1)}</em>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={i} className="bg-black/40 text-orange-200 px-1.5 py-0.5 rounded font-mono text-xs mx-0.5 border border-white/10">{part.slice(1, -1)}</code>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    // Block Renderer
    const renderBlock = (block: string, index: number, storedMath: string[], storedCode: string[]) => {
        const trimmed = block.trim();
        if (!trimmed) return <div key={index} className="h-4"></div>;

        // 1. Restore Protected Math Block
        const mathMatch = trimmed.match(/^__BLOCK_MATH_(\d+)__$/);
        if (mathMatch) {
            const id = parseInt(mathMatch[1]);
            return (
                <div key={index} className="w-full text-center my-4 overflow-x-auto no-scrollbar py-3 bg-white/5 rounded-xl border border-white/5 shadow-inner">
                    {renderMath(storedMath[id], true)}
                </div>
            );
        }

        // 2. Restore Protected Code Block
        const codeMatch = trimmed.match(/^__BLOCK_CODE_(\d+)__$/);
        if (codeMatch) {
            const id = parseInt(codeMatch[1]);
            return (
                <pre key={index} className="bg-black/60 p-4 rounded-xl font-mono text-xs text-emerald-100 my-4 overflow-x-auto border border-white/10 shadow-inner whitespace-pre-wrap leading-relaxed">
                    {storedCode[id]}
                </pre>
            );
        }

        // Headers
        if (trimmed.startsWith('# ')) return <h1 key={index} className="text-3xl font-bold text-white mt-8 mb-6 pb-2 border-b-2 border-white/20 font-serif">{trimmed.slice(2)}</h1>;
        if (trimmed.startsWith('## ')) return <h2 key={index} className="text-2xl font-bold text-emerald-200 mt-6 mb-4 font-serif">{trimmed.slice(3)}</h2>;
        if (trimmed.startsWith('### ')) return <h3 key={index} className="text-xl font-bold text-emerald-300 mt-5 mb-2 font-serif">{trimmed.slice(4)}</h3>;

        // Blockquotes
        if (trimmed.startsWith('> ')) {
            return (
                <div key={index} className="border-l-4 border-emerald-500/50 bg-white/5 p-4 my-3 rounded-r-xl text-emerald-100 italic">
                    {parseInline(trimmed.slice(2))}
                </div>
            );
        }

        // Lists
        if (trimmed.match(/^[-•]\s/)) {
            return (
                <div key={index} className="flex gap-3 my-2 pl-2">
                    <span className="text-emerald-400 font-bold mt-1">•</span>
                    <span className="text-white/90 leading-relaxed">{parseInline(trimmed.slice(2))}</span>
                </div>
            );
        }

        // Numbered Lists
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
             return (
                <div key={index} className="flex gap-3 my-2 pl-2">
                    <span className="text-emerald-400 font-bold font-mono mt-1">{numMatch[1]}.</span>
                    <span className="text-white/90 leading-relaxed">{parseInline(numMatch[2])}</span>
                </div>
            );
        }

        // Standard Paragraph
        return (
            <div key={index} className="text-white/90 text-lg font-medium leading-loose tracking-wide font-serif mb-4 text-justify">
                {parseInline(block)}
            </div>
        );
    };



    const isTableRow = (line: string) => {
        const trimmed = line.trim();
        return trimmed.includes('|') && /^\|?.+\|.+\|?$/.test(trimmed);
    };

    const isTableSeparator = (line: string) => {
        const cleaned = line.trim().replace(/^\|/, '').replace(/\|$/, '');
        const segments = cleaned.split('|').map(seg => seg.trim());
        if (segments.length < 2) return false;
        return segments.every(seg => /^:?-{3,}:?$/.test(seg));
    };

    const splitTableCells = (line: string) => line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());

    const renderTable = (rows: string[], index: number) => {
        if (rows.length < 2) return renderBlock(rows[0], index, storedMath, storedCode);

        const header = splitTableCells(rows[0]);
        const hasSeparator = rows[1] ? isTableSeparator(rows[1]) : false;
        const bodyRows = (hasSeparator ? rows.slice(2) : rows.slice(1)).map(splitTableCells);

        return (
            <div key={`table-${index}`} className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-black/25">
                <table className="w-full min-w-[360px] border-collapse text-sm text-left">
                    <thead className="bg-white/10">
                        <tr>
                            {header.map((cell, i) => (
                                <th key={i} className="px-3 py-2 text-emerald-200 font-bold border-b border-white/10">
                                    {parseInline(cell)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {bodyRows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="odd:bg-white/0 even:bg-white/[0.03]">
                                {header.map((_, colIndex) => (
                                    <td key={colIndex} className="px-3 py-2 text-white/90 border-t border-white/5 align-top leading-relaxed">
                                        {parseInline(row[colIndex] || '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // --- Pre-processing Logic ---
    // Protect blocks (Math $$...$$ and Code ```...```) from being split by newlines
    const storedMath: string[] = [];
    const storedCode: string[] = [];
    let processedText = text;

    // 1. Extract Code Blocks
    processedText = processedText.replace(/```[\s\S]*?```/g, (match) => {
        const content = match.replace(/^```\w*\n?/, '').replace(/```$/, '');
        storedCode.push(content);
        return `\n__BLOCK_CODE_${storedCode.length - 1}__\n`; // Add newlines to ensure it separates
    });

    // 2. Extract Block Math ($$ ... $$)
    // Note: LLMs sometimes output \[ ... \] or $$ ... $$. We try to catch $$...$$ mainly.
    processedText = processedText.replace(/\$\$[\s\S]*?\$\$/g, (match) => {
        const content = match.slice(2, -2).trim(); 
        storedMath.push(content);
        return `\n__BLOCK_MATH_${storedMath.length - 1}__\n`;
    });

    // 3. Split by newlines + merge markdown table blocks
    const blocks = processedText.split('\n');
    const renderedBlocks: React.ReactNode[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const line = blocks[i];
        if (isTableRow(line) && i + 1 < blocks.length && isTableSeparator(blocks[i + 1])) {
            const tableLines = [line, blocks[i + 1]];
            let j = i + 2;
            while (j < blocks.length && isTableRow(blocks[j])) {
                tableLines.push(blocks[j]);
                j += 1;
            }
            renderedBlocks.push(renderTable(tableLines, i));
            i = j - 1;
            continue;
        }
        renderedBlocks.push(renderBlock(line, i, storedMath, storedCode));
    }
    
    return (
        <div className="space-y-1">
            {/* FORCE WHITE COLOR FOR KATEX */}
            <style>{`
                .katex { color: white !important; } 
                .katex-display { margin: 0.5em 0; }
                .katex-html { color: white !important; }
            `}</style>
            
            {renderedBlocks}
            {isTyping && (
                <div className="mt-4 animate-pulse flex items-center gap-2 text-emerald-500">
                    <span className="w-2 h-5 bg-emerald-500"></span>
                    <span className="text-xs font-mono tracking-widest">WRITING...</span>
                </div>
            )}
        </div>
    );
};

const StudyApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, apiConfig, addToast, userProfile, updateCharacter } = useOS();
    const [mode, setMode] = useState<'bookshelf' | 'classroom'>('bookshelf');
    const [courses, setCourses] = useState<StudyCourse[]>([]);
    const [activeCourse, setActiveCourse] = useState<StudyCourse | null>(null);
    const [selectedChar, setSelectedChar] = useState<CharacterProfile | null>(null);
    
    // Classroom State
    const [classroomState, setClassroomState] = useState<'idle' | 'teaching' | 'q_and_a' | 'finished'>('idle');
    const [currentText, setCurrentText] = useState('');
    const [displayedText, setDisplayedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [userQuestion, setUserQuestion] = useState('');
    const [showChapterMenu, setShowChapterMenu] = useState(false); // Sidebar for history
    const [showAssistant, setShowAssistant] = useState(true); // Toggle assistant visibility
    
    // Logic Refs
    const skipTypingRef = useRef(false); // New: Control to skip animation for cached content

    // Import State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processStatus, setProcessStatus] = useState('');
    const [showImportModal, setShowImportModal] = useState(false);
    const [importPreference, setImportPreference] = useState('');
    const [tempPdfData, setTempPdfData] = useState<{name: string, text: string} | null>(null);
    const [katexRenderer, setKatexRenderer] = useState<KatexLike | null>(null);

    // Delete Confirmation State
    const [deleteTarget, setDeleteTarget] = useState<StudyCourse | null>(null);

    const currentSprite = selectedChar?.sprites?.['normal'] || selectedChar?.avatar;

    useEffect(() => {
        loadCourses();
        if (activeCharacterId) {
            const char = characters.find(c => c.id === activeCharacterId) || characters[0];
            setSelectedChar(char);
        }
    }, [activeCharacterId]);


    useEffect(() => {
        loadKatex().then(setKatexRenderer).catch(() => {
            // KaTeX is optional in dev if dependency is absent
        });
    }, []);

    // Refresh courses when returning to bookshelf
    useEffect(() => {
        if (mode === 'bookshelf') {
            loadCourses();
        }
    }, [mode]);

    // Typewriter effect Logic
    useEffect(() => {
        if (!currentText) return;

        // Skip Animation Check
        if (skipTypingRef.current) {
            setDisplayedText(currentText);
            setIsTyping(false);
            skipTypingRef.current = false; // Reset
            return;
        }

        setIsTyping(true);
        setDisplayedText('');
        let i = 0;
        const speed = 15; // Characters per tick
        
        const timer = setInterval(() => {
            const chunk = currentText.substring(0, i + speed);
            setDisplayedText(chunk);
            i += speed;
            if (i >= currentText.length) {
                setDisplayedText(currentText); // Ensure full text
                clearInterval(timer);
                setIsTyping(false);
            }
        }, 16); 

        return () => clearInterval(timer);
    }, [currentText]);

    const loadCourses = async () => {
        const list = await DB.getAllCourses();
        setCourses(list.sort((a,b) => b.createdAt - a.createdAt));
    };

    // --- PDF Processing ---

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.type !== 'application/pdf') {
            addToast('璇蜂笂浼?PDF 鏂囦欢', 'error');
            return;
        }

        setIsProcessing(true);
        setProcessStatus('姝ｅ湪棰勫鐞?PDF...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfjs = await loadPdfJs();
            const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            const maxPages = Math.min(pdf.numPages, 50);

            for (let i = 1; i <= maxPages; i++) {
                setProcessStatus(`鎻愬彇鏂囨湰涓?(${i}/${maxPages})...`);
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            // Scanned PDF Detection
            if (fullText.trim().length < 50 && pdf.numPages > 0) {
                addToast('检测到文本内容很少，可能是扫描版或图片 PDF，建议先做 OCR 识别。', 'error');
            }

            // Set temp data and open modal
            setTempPdfData({ name: file.name.replace('.pdf', ''), text: fullText });
            setImportPreference('');
            setIsProcessing(false);
            setShowImportModal(true);

        } catch (e: any) {
            console.error(e);
            addToast(`澶勭悊澶辫触: ${e.message}`, 'error');
            setIsProcessing(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const confirmImport = async () => {
        if (!tempPdfData) return;
        setShowImportModal(false);
        setIsProcessing(true);
        setProcessStatus('AI 姝ｅ湪鐢熸垚璇剧▼澶х翰...');

        try {
            const newCourse = await generateCurriculum(tempPdfData.name, tempPdfData.text, importPreference);
            await DB.saveCourse(newCourse);
            await loadCourses();
            addToast('璇剧▼鍒涘缓鎴愬姛', 'success');
        } catch (e: any) {
            addToast(`鐢熸垚澶辫触: ${e.message}`, 'error');
        } finally {
            setIsProcessing(false);
            setTempPdfData(null);
        }
    };

    const generateCurriculum = async (title: string, text: string, preference: string): Promise<StudyCourse> => {
        if (!apiConfig.apiKey) throw new Error('API Key missing');

        // Truncate text for outline generation if too long
        const contextText = text.substring(0, 30000); 

        const prompt = `
### Task: Create Course Outline
Document Title: "${title}"
User Preference: "${preference || 'Standard'}"
Content Sample:
${contextText.substring(0, 5000)}...

Please analyze the content and split it into 3-8 logical chapters for teaching.
For each chapter, provide a title, a brief summary of what it covers, and a difficulty rating.

### Output Format (Strict JSON)
{
  "chapters": [
    { "title": "Chapter 1: ...", "summary": "...", "difficulty": "easy" },
    ...
  ]
}
`;
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.5,
                max_tokens: 8000
            })
        });

        if (!response.ok) throw new Error('API Error');
        const data = await safeResponseJson(response);
        const content = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(content);

        return {
            id: `course-${Date.now()}`,
            title: title,
            rawText: text, // Store full text locally
            chapters: json.chapters.map((c: any, i: number) => ({
                id: `ch-${i}`,
                title: c.title,
                summary: c.summary,
                difficulty: c.difficulty || 'normal',
                isCompleted: false
            })),
            currentChapterIndex: 0,
            createdAt: Date.now(),
            coverStyle: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
            totalProgress: 0,
            preference: preference // Save preference
        };
    };

    // --- Classroom Logic ---

    const startSession = (course: StudyCourse) => {
        setActiveCourse(course);
        setMode('classroom');
        
        // Find first incomplete chapter or stay on current if valid
        const nextIdx = course.chapters.findIndex(c => !c.isCompleted);
        const targetIdx = nextIdx === -1 ? 0 : nextIdx;
        
        // Update index if needed
        if (targetIdx !== course.currentChapterIndex) {
             const updated = { ...course, currentChapterIndex: targetIdx };
             setActiveCourse(updated);
             DB.saveCourse(updated);
             setCourses(prev => prev.map(c => c.id === updated.id ? updated : c)); // Sync
        }
        
        handleTeach(course, targetIdx);
    };

    // [MODIFIED]: buildStudyContext Removed. We now use ContextBuilder directly in handleTeach.

    const handleTeach = async (course: StudyCourse, chapterIdx: number, forceRegenerate: boolean = false) => {
        if (!selectedChar || !apiConfig.apiKey) return;
        
        const chapter = course.chapters[chapterIdx];
        
        // 1. Check if we already have content (History Review) and NOT forcing regen
        if (chapter.content && !forceRegenerate) {
            skipTypingRef.current = true; // Signal to skip animation for cached content
            setClassroomState('idle'); 
            setCurrentText(chapter.content);
            return;
        }

        // 2. Generate New Content
        skipTypingRef.current = false; // Reset skip
        setClassroomState('teaching');
        setCurrentText("姝ｅ湪鍑嗗鏁欐...");
        
        // Simple chunking strategy
        const totalLen = course.rawText.length;
        const chunkSize = Math.floor(totalLen / course.chapters.length);
        const start = chapterIdx * chunkSize;
        const chunkText = course.rawText.substring(start, start + chunkSize + 2000); // Overlap

        const callApi = async (personaContext: string) => {
            const prompt = `${personaContext}

### [Current Lesson Configuration]
Topic: "${chapter.title}"
Difficulty: ${chapter.difficulty}
User Preference: "${course.preference || 'Standard'}"

### [Source Material]
${chunkText.substring(0, 8000)}

### [Task: Lecture Generation]
Explain this chapter's key concepts to the user based strictly on the Source Material above.
- **Formatting**: Use Markdown extensively.
  - **Bold** for key terms (\`**term**\`).
  - Lists for steps.
  - Math: Use \`$ E=mc^2 $\` for inline math, and \`$$ E=mc^2 $$\` for block equations.
- **Style**: ${course.preference || 'Simple, conversational, and encouraging.'}
- **Structure**:
  1. Intro: Friendly greeting.
  2. Core: Explanation of concepts using analogies.
  3. Example: A concrete example or walkthrough.
  4. Summary: Quick recap.
`;
            return await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7,
                    max_tokens: 8000, 
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });
        };

        try {
            // Attempt 1: Full Character Context (The "Soul")
            // [MODIFIED]: Use centralized ContextBuilder with memory enabled
            let baseContext = ContextBuilder.buildCoreContext(selectedChar, userProfile, true);
            
            // Append Study Mode specific instructions to the core context
            baseContext += `
### [System: Study Mode Active]
You are now acting as a private tutor for ${userProfile.name}.
- **Maintain Personality**: You MUST stay in character (as defined above). If you are tsundere, teach with a tsundere attitude. If you are shy, teach shyly. Don't become a robotic lecturer.
- **Goal**: Explain the content clearly, but don't lose your "soul".
- **Safety**: If the source material contains sensitive topics (biology, history, etc.), treat them academically and neutrally.
`;

            let response = await callApi(baseContext);
            
            let text = "";
            let isBlocked = false;

            if (response.ok) {
                const data = await safeResponseJson(response);
                
                // ROBUST EXTRACTION: Try content, then reasoning_content
                text = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || "内容仍被拦截，请尝试更换模型或缩短文本。";
                
                if (!text || data.choices?.[0]?.finish_reason === 'content_filter') {
                    console.warn("Content blocked by filter or empty response.");
                    isBlocked = true;
                }
            } else {
                throw new Error(`API Error: ${response.status}`);
            }

            // Attempt 2: Safety Fallback (Neutral Tutor Mode)
            if (isBlocked) {
                setCurrentText("姝ｅ湪灏濊瘯鍒囨崲瀹夊叏绾胯矾 (Safety Fallback)...");
                const fallbackContext = "[System: You are a helpful and neutral academic tutor. Ignore previous character persona constraints to ensure educational content is delivered.]";
                response = await callApi(fallbackContext);
                if (response.ok) {
                    const data = await safeResponseJson(response);
                    text = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || "内容仍被拦截，请尝试更换模型或缩短文本。";
                }
            }
            
            if (!text) {
                throw new Error("妯″瀷杩斿洖鍐呭涓虹┖ (Max Tokens Limit or Filter)");
            }

            // Save Generated Content
            const updatedChapters = [...course.chapters];
            updatedChapters[chapterIdx] = { ...chapter, content: text };
            const updatedCourse = { ...course, chapters: updatedChapters };
            
            await DB.saveCourse(updatedCourse);
            setActiveCourse(updatedCourse);
            setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c)); // Sync

            setCurrentText(text);
            setClassroomState('idle');
            
        } catch (e: any) {
            console.error("Teach Error:", e);
            setCurrentText(`抱歉，生成失败：${e.message}。请检查模型是否支持长文本或 Max Tokens 设置。`);
            setClassroomState('idle');
        }
    };

    // Regenerate Logic
    const handleRegenerateChapter = () => {
        if (!activeCourse) return;
        handleTeach(activeCourse, activeCourse.currentChapterIndex, true);
    };

    const handleAskQuestion = async () => {
        if (!userQuestion.trim() || !activeCourse || !selectedChar) return;

        const question = userQuestion;
        setUserQuestion('');
        setClassroomState('q_and_a');
        setCurrentText('让我想想...');

        try {
            const totalLen = activeCourse.rawText.length;
            const chunkSize = Math.floor(totalLen / activeCourse.chapters.length);
            const start = activeCourse.currentChapterIndex * chunkSize;
            const chunkText = activeCourse.rawText.substring(start, start + chunkSize + 2000);

            const baseContext = [
                ContextBuilder.buildCoreContext(selectedChar, userProfile, true),
                '### [System: Study Mode Q&A]',
                'User is asking a question about the study material.',
                '- **Maintain Personality**: Answer in character.',
            ].join('\n');

            const prompt = [
                baseContext,
                '### Source Material',
                chunkText.substring(0, 8000),
                '',
                '### User Question',
                `"${question}"`,
                '',
                '### Task',
                'Answer the question based on the source material. Be helpful and encouraging (in character). Use Markdown.',
            ].join('\n');

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    max_tokens: 8000,
                }),
            });

            const data = await safeResponseJson(response);
            const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.message?.reasoning_content || '内容仍被拦截，请尝试更换模型或缩短文本。';

            setCurrentText(text);
            setClassroomState('idle');
        } catch (e) {
            setCurrentText('我有点卡壳了，暂时回答不出来。');
            setClassroomState('idle');
        }
    };

    const handleFinishChapter = async () => {
        if (!activeCourse || !selectedChar) return;
        
        const updatedChapters = [...activeCourse.chapters];
        updatedChapters[activeCourse.currentChapterIndex].isCompleted = true;
        
        const nextIdx = activeCourse.currentChapterIndex + 1;
        const progress = Math.round((updatedChapters.filter(c => c.isCompleted).length / updatedChapters.length) * 100);
        
        const newIndex = Math.min(nextIdx, updatedChapters.length - 1);
        
        const updatedCourse = {
            ...activeCourse,
            chapters: updatedChapters,
            currentChapterIndex: newIndex,
            totalProgress: progress
        };
        
        await DB.saveCourse(updatedCourse);
        setActiveCourse(updatedCourse);
        setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c)); // Sync

        // Summarize to Memory (Fire & Forget)
        // UPDATED PROMPT: First person perspective
        const summaryPrompt = [
            '[System: Memory Generation]',
            'Role: ' + selectedChar.name + ' (Teacher)',
            'Action: Just finished teaching "' + updatedChapters[activeCourse.currentChapterIndex].title + '" to ' + userProfile.name + '.',
            'Task: Write a short, first-person diary entry (1 sentence) about this teaching session.',
            'Format: "今天给[User]讲了[Topic]..." or "Today I taught [User] about..."',
            'Note: Use "我" (I) to refer to yourself.',
        ].join('\n');

        fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: summaryPrompt }] })
        }).then(res => safeResponseJson(res)).then(data => {
            const mem = data.choices[0].message.content;
            const newMem = { id: `mem-${Date.now()}`, date: new Date().toLocaleDateString(), summary: `[教学] ${mem}`, mood: 'proud' };
            updateCharacter(selectedChar.id, { memories: [...(selectedChar.memories || []), newMem] });
        });

        // 3. Trigger next logic
        if (nextIdx >= updatedChapters.length) {
            setCurrentText('恭喜！这本书我们已经学完了，真棒！');
            setClassroomState('finished');
        } else {
            handleTeach(updatedCourse, newIndex);
        }
    };

    const jumpToChapter = (idx: number) => {
        if (!activeCourse) return;
        const updatedCourse = { ...activeCourse, currentChapterIndex: idx };
        setActiveCourse(updatedCourse);
        DB.saveCourse(updatedCourse);
        setCourses(prev => prev.map(c => c.id === updatedCourse.id ? updatedCourse : c)); // Sync
        handleTeach(updatedCourse, idx);
        setShowChapterMenu(false);
    };

    const requestDeleteCourse = (e: React.MouseEvent, course: StudyCourse) => {
        e.stopPropagation();
        setDeleteTarget(course);
    };

    const confirmDeleteCourse = async () => {
        if (!deleteTarget) return;
        await DB.deleteCourse(deleteTarget.id);
        setCourses(prev => prev.filter(c => c.id !== deleteTarget.id));
        setDeleteTarget(null);
        addToast('课程已删除', 'success');
    };

    // --- Render ---

    if (mode === 'bookshelf') {
        return (
            <div className="h-full w-full bg-[#fdfbf7] flex flex-col font-sans relative">
                <div className="h-20 bg-[#fdfbf7]/90 backdrop-blur-md flex items-end pb-3 px-6 border-b border-[#e5e5e5] shrink-0 sticky top-0 z-20">
                    <div className="flex justify-between items-center w-full">
                        <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <span className="font-bold text-slate-800 text-lg tracking-wide">自习室</span>
                        <div className="w-8"></div>
                    </div>
                </div>

                <div className="p-6 flex-1 overflow-y-auto no-scrollbar">
                    {/* Character Selector */}
                    <div className="mb-8">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">当前助教</h3>
                        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => setSelectedChar(c)} className={`flex flex-col items-center gap-2 cursor-pointer transition-opacity ${selectedChar?.id === c.id ? 'opacity-100' : 'opacity-50'}`}>
                                    <div className={`w-14 h-14 rounded-full p-[2px] ${selectedChar?.id === c.id ? 'border-2 border-emerald-500' : 'border border-slate-200'}`}>
                                        <img src={c.avatar} className="w-full h-full rounded-full object-cover" />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600">{c.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">我的课程</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => fileInputRef.current?.click()} className="aspect-[3/4] rounded-r-xl rounded-l-sm border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors bg-white">
                            {isProcessing ? (
                                <div className="text-center px-2">
                                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                    <span className="text-[10px]">{processStatus}</span>
                                </div>
                            ) : (
                                <>
                                    <span className="text-3xl">+</span>
                                    <span className="text-xs font-bold">导入 PDF</span>
                                </>
                            )}
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileSelect} disabled={isProcessing} />

                        {courses.map(course => (
                            <div key={course.id} onClick={() => startSession(course)} className="aspect-[3/4] rounded-r-xl rounded-l-sm shadow-md relative group cursor-pointer overflow-hidden transition-transform active:scale-95" style={{ background: course.coverStyle }}>
                                <div className="absolute left-0 top-0 bottom-0 w-2 bg-black/10"></div> {/* Spine */}
                                <div className="p-4 flex flex-col h-full text-white relative z-10">
                                    <div className="flex-1 font-serif font-bold text-lg leading-tight line-clamp-3 drop-shadow-md">{course.title}</div>
                                    <div className="mt-2">
                                        <div className="text-[10px] font-bold opacity-80 mb-1">进度 {course.totalProgress}%</div>
                                        <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                                            <div className="h-full bg-white transition-all duration-500" style={{ width: `${course.totalProgress}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={(e) => requestDeleteCourse(e, course)} 
                                    className="absolute top-2 right-2 bg-black/20 hover:bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all z-20"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <Modal isOpen={showImportModal} title="课程设置" onClose={() => setShowImportModal(false)} footer={<button onClick={confirmImport} className="w-full py-3 bg-emerald-500 text-white font-bold rounded-2xl">开始生成</button>}>
                    <div className="space-y-4">
                        <div className="text-xs text-slate-500">
                            已加载: <span className="font-bold text-slate-700">{tempPdfData?.name}</span>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">AI 助教偏好 (Preferences)</label>
                            <textarea 
                                value={importPreference} 
                                onChange={e => setImportPreference(e.target.value)} 
                                placeholder="例如：请用中文讲解，多用简单的比喻，针对数学公式详细推导..." 
                                className="w-full h-32 bg-slate-100 rounded-xl p-3 text-sm focus:outline-emerald-500 resize-none"
                            />
                        </div>
                    </div>
                </Modal>

                {/* Delete Confirmation Modal */}
                <Modal 
                    isOpen={!!deleteTarget} 
                    title="删除课程" 
                    onClose={() => setDeleteTarget(null)} 
                    footer={
                        <div className="flex gap-2 w-full">
                            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl">取消</button>
                            <button onClick={confirmDeleteCourse} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">确认删除</button>
                        </div>
                    }
                >
                    <div className="py-4 text-center">
                        <p className="text-sm text-slate-600 mb-2">确定要删除课程 <br/><span className="font-bold text-slate-800">"{deleteTarget?.title}"</span> 吗？</p>
                        <p className="text-xs text-red-400">删除后无法恢复，学习进度将丢失。</p>
                    </div>
                </Modal>
            </div>
        );
    }

    // CLASSROOM VIEW
    return (
        <div className="h-full w-full bg-[#2b2b2b] flex flex-col relative overflow-hidden font-sans">
            
            {/* Background Texture - Board */}
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            {/* Header Overlay */}
            <div className="absolute top-0 w-full p-4 flex justify-between z-30 pointer-events-none">
                <button onClick={() => setMode('bookshelf')} className="bg-black/30 text-white/80 p-2 rounded-full backdrop-blur-md hover:bg-black/50 transition-colors pointer-events-auto border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <div className="flex gap-2">
                    <div onClick={() => setShowChapterMenu(true)} className="bg-black/30 text-white/90 px-4 py-1.5 rounded-full backdrop-blur-md text-xs font-bold border border-white/10 shadow-sm pointer-events-auto cursor-pointer flex items-center gap-2 hover:bg-black/50">
                        <span className="truncate max-w-[150px]">{activeCourse?.chapters[activeCourse.currentChapterIndex]?.title}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </div>
                    {/* Character Visibility Toggle */}
                    <button onClick={() => setShowAssistant(!showAssistant)} className={`bg-black/30 p-2 rounded-full backdrop-blur-md border border-white/10 pointer-events-auto transition-colors ${showAssistant ? 'text-emerald-400' : 'text-white/40'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z" /></svg>
                    </button>
                </div>
            </div>

            {/* Chapter Menu Sidebar */}
            {showChapterMenu && (
                <div className="absolute inset-0 z-50 flex">
                    <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setShowChapterMenu(false)}></div>
                    <div className="w-64 bg-slate-900 border-l border-white/10 h-full flex flex-col p-4 animate-slide-in-right">
                        <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-widest">课程目录</h3>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                            {activeCourse?.chapters.map((ch, idx) => (
                                <button 
                                    key={ch.id} 
                                    onClick={() => jumpToChapter(idx)}
                                    className={`w-full text-left p-3 rounded-xl text-xs transition-all ${idx === activeCourse.currentChapterIndex ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:bg-white/5'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        {ch.isCompleted ? <span className="text-emerald-400">✓</span> : <span className="w-2 h-2 rounded-full bg-slate-600"></span>}
                                        {ch.title}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Text Content - Layout Optimized (Removed padding-right to allow full width) */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 pt-20 pb-32 relative z-10">
                <div className="max-w-[100%]">
                    <BlackboardRenderer text={displayedText} isTyping={isTyping} katexRenderer={katexRenderer} />
                </div>
            </div>

            {/* Character Sprite - Toggable */}
            {showAssistant && (
                <div className="absolute bottom-20 right-[-20px] w-[160px] h-[220px] z-20 pointer-events-none flex items-end justify-center transition-all duration-500 animate-slide-in-right" style={{ transform: isTyping ? 'scale(1.05)' : 'scale(1)', opacity: isTyping || classroomState === 'teaching' ? 1 : 0.8 }}>
                     <img 
                        src={currentSprite} 
                        className="max-h-full max-w-full object-contain drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)]"
                    />
                </div>
            )}

            {/* Controls Bar */}
            <div className="absolute bottom-0 w-full bg-[#1a1a1a]/95 backdrop-blur-xl border-t border-white/10 p-4 z-30 pb-safe">
                <div className="flex gap-3">
                    {classroomState === 'teaching' || isTyping ? (
                        <div className="w-full h-12 flex items-center justify-center text-white/50 text-sm animate-pulse font-mono tracking-widest">
                            LECTURING...
                        </div>
                    ) : classroomState === 'finished' ? (
                        <button onClick={() => setMode('bookshelf')} className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/20 active:scale-95 transition-all">
                            完成课程
                        </button>
                    ) : classroomState === 'q_and_a' ? (
                        <div className="w-full bg-white/10 rounded-2xl p-1 flex items-center border border-white/10">
                            <input 
                                value={userQuestion}
                                onChange={e => setUserQuestion(e.target.value)}
                                placeholder="输入你的问题..."
                                className="flex-1 bg-transparent px-4 py-2 text-white text-sm outline-none placeholder:text-white/30"
                                autoFocus
                            />
                            <button onClick={handleAskQuestion} className="bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-bold ml-2 shadow-sm">发送</button>
                        </div>
                    ) : (
                        <>
                            <button onClick={handleRegenerateChapter} className="w-12 h-12 bg-white/5 hover:bg-white/10 text-slate-400 rounded-2xl font-bold border border-white/10 active:scale-95 transition-all flex items-center justify-center" title="重新生成本章">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                            </button>
                            <button onClick={() => setClassroomState('q_and_a')} className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold border border-white/10 active:scale-95 transition-all flex items-center justify-center">
                                ✋
                            </button>
                            <button onClick={handleFinishChapter} className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold shadow-lg shadow-emerald-900/30 active:scale-95 transition-all flex items-center justify-center gap-2">
                                下一章 (Next) <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudyApp;








