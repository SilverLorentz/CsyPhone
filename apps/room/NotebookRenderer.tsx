/**
 * NotebookRenderer.tsx — Markdown rendering for the Room notebook
 *
 * Extracted from RoomApp.tsx. Pure render functions with zero state coupling.
 */


/** Render inline formatting: **bold**, ~~strike~~, *italic*, `code` */
export const renderInlineStyle = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|~~.*?~~|\*.*?\*|`.*?`)/g);

    return parts.map((part, i) => {
        // Bold
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-slate-800 bg-yellow-100/50 px-0.5 rounded">{part.slice(2, -2)}</strong>;
        }
        // Strikethrough
        if (part.startsWith('~~') && part.endsWith('~~')) {
            return <span key={i} className="line-through text-slate-400 opacity-80">{part.slice(2, -2)}</span>;
        }
        // Italic (single asterisk)
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return <em key={i} className="italic text-slate-600">{part.slice(1, -1)}</em>;
        }
        // Inline Code
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="bg-slate-200 text-slate-600 px-1 rounded text-xs font-mono break-all">{part.slice(1, -1)}</code>;
        }
        return part;
    });
};

/** Render full notebook content with code blocks, headings, lists, checkboxes, blockquotes */
export const renderNotebookContent = (text: string) => {
    // Simple Markdown-ish parser
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            // Remove code block markers
            const firstLineBreak = part.indexOf('\n');
            let codeContent = part;
            if (firstLineBreak > -1 && firstLineBreak < 10) {
                codeContent = part.substring(firstLineBreak + 1, part.length - 3);
            } else {
                codeContent = part.substring(3, part.length - 3);
            }

            return (
                <div key={index} className="my-3 w-full max-w-full">
                    {/* Keep horizontal scroll for code blocks, don't wrap */}
                    <pre className="bg-slate-800 text-green-400 p-3 rounded-xl text-[10px] font-mono overflow-x-auto border-l-4 border-green-600 shadow-sm whitespace-pre">
                        {codeContent}
                    </pre>
                </div>
            );
        }
        return (
            <div key={index} className="w-full">
                {part.split('\n').map((line, lineIdx) => {
                    const key = `${index}-${lineIdx}`;
                    const trimLine = line.trim();

                    if (!trimLine) return <div key={key} className="h-2"></div>;

                    if (trimLine.startsWith('# ')) {
                        return <h3 key={key} className="text-lg font-bold text-slate-800 mt-4 mb-2 pb-1 border-b-2 border-slate-200 break-words">{trimLine.substring(2)}</h3>;
                    }
                    if (trimLine.startsWith('## ')) {
                        return <h4 key={key} className="text-sm font-bold text-slate-700 mt-3 mb-1 border-l-4 border-slate-300 pl-2 break-words">{trimLine.substring(3)}</h4>;
                    }
                    if (trimLine.startsWith('> ')) {
                        return <div key={key} className="pl-3 border-l-4 border-slate-300 text-slate-500 italic my-2 py-1 bg-slate-100 rounded-r-lg text-xs break-words">{trimLine.substring(2)}</div>;
                    }
                    if (trimLine.startsWith('- ') || trimLine.startsWith('• ')) {
                        return <div key={key} className="flex gap-2 my-1 pl-1 items-start"><span className="text-slate-400 mt-1 shrink-0">•</span><span className="flex-1 break-words">{renderInlineStyle(trimLine.substring(2))}</span></div>;
                    }

                    if (trimLine.match(/^\[[ x]\]/)) {
                        const isChecked = trimLine.includes('[x]');
                        return (
                            <div key={key} className="flex gap-2 my-1 pl-1 items-center">
                                <div className={`w-3 h-3 border rounded-sm flex items-center justify-center shrink-0 ${isChecked ? 'bg-slate-600 border-slate-600' : 'border-slate-400'}`}>
                                    {isChecked && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className={`flex-1 break-words ${isChecked ? 'line-through text-slate-400' : 'text-slate-700'}`}>{renderInlineStyle(trimLine.substring(3))}</span>
                            </div>
                        );
                    }

                    return <div key={key} className="min-h-[1.5em] my-0.5 leading-relaxed break-words text-justify">{renderInlineStyle(line)}</div>;
                })}
            </div>
        );
    });
};
