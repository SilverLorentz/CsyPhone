import React from 'react';

/**
 * markdownLite — Lightweight Markdown renderer for chat bubbles.
 *
 * Handles: inline code, bold, italic, bold+italic, code blocks,
 * block quotes, headers, and stray formatting cleanup.
 *
 * This module is intentionally pure — it receives a string
 * and returns React nodes, with zero component-level state.
 */

// --- Inline formatting parser: code → bold+italic → bold → italic → plain ---
export const renderInline = (text: string): React.ReactNode[] => {
    // Pre-clean: markdown links [text](url) → just text
    let cleaned = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Pre-clean: stray backticks
    cleaned = cleaned.replace(/``+/g, '').replace(/(^|\s)`(\s|$)/g, '$1$2');

    const nodes: React.ReactNode[] = [];
    let nodeKey = 0;

    // Step 1: Split by inline code (`code`)
    const codeParts = cleaned.split(/(`[^`]+`)/g);
    for (const codePart of codeParts) {
        if (codePart.startsWith('`') && codePart.endsWith('`') && codePart.length > 2) {
            nodes.push(<code key={nodeKey++} className="bg-black/10 px-1 py-0.5 rounded text-[13px] font-mono">{codePart.slice(1, -1)}</code>);
            continue;
        }
        // Step 2: Split by bold+italic (***text***) — must come before ** and *
        const boldItalicParts = codePart.split(/(\*\*\*[^*]+\*\*\*)/g);
        for (const biPart of boldItalicParts) {
            if (biPart.startsWith('***') && biPart.endsWith('***') && biPart.length > 6) {
                nodes.push(<strong key={nodeKey++} className="font-bold"><em className="italic">{biPart.slice(3, -3)}</em></strong>);
                continue;
            }
            // Step 3: Split by bold (**text**)
            const boldParts = biPart.split(/(\*\*[^*]+\*\*)/g);
            for (const boldPart of boldParts) {
                if (boldPart.startsWith('**') && boldPart.endsWith('**') && boldPart.length > 4) {
                    nodes.push(<strong key={nodeKey++} className="font-bold">{boldPart.slice(2, -2)}</strong>);
                    continue;
                }
                // Strip orphaned ** that didn't form a valid bold pair
                const cleanedBold = boldPart.replace(/\*\*/g, '');
                // Step 4: Split by italic (*text*) — safe because ** already stripped
                const italicParts = cleanedBold.split(/(\*[^*]+\*)/g);
                for (const italicPart of italicParts) {
                    if (italicPart.startsWith('*') && italicPart.endsWith('*') && italicPart.length > 2) {
                        nodes.push(<em key={nodeKey++} className="italic opacity-80">{italicPart.slice(1, -1)}</em>);
                        continue;
                    }
                    // Strip orphaned * that didn't form a valid italic pair
                    const cleanedItalic = italicPart.replace(/\*/g, '');
                    if (cleanedItalic) nodes.push(cleanedItalic);
                }
            }
        }
    }
    return nodes;
};

// --- Enhanced Text Rendering (Markdown Lite) ---
export const renderMarkdown = (text: string): React.ReactNode => {
    // 1. Split by Code Blocks (triple backtick)
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
        // Render Code Block
        if (part.startsWith('```') && part.endsWith('```')) {
            const codeContent = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
            return (
                <pre key={index} className="bg-black/80 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 whitespace-pre shadow-inner border border-white/10">
                    {codeContent}
                </pre>
            );
        }

        // Clean stray backtick artifacts from non-code text
        let cleanedPart = part
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2');

        // Display should only honor real line breaks. CJK-space compatibility
        // lives in chatParser.chunkText so CSS skins cannot amplify spaces into
        // accidental one-character vertical layouts.
        // Render Regular Text (split by newlines for paragraph spacing)
        return cleanedPart.split('\n').map((line, lineIdx) => {
            const key = `${index}-${lineIdx}`;

            // Quote Format "> text"
            if (line.trim().startsWith('>')) {
                const quoteText = line.trim().substring(1).trim();
                if (!quoteText) return null;
                return (
                    <div key={key} className="my-1 pl-2.5 border-l-[3px] border-black/20 opacity-70 italic text-[13px]">
                        {renderInline(quoteText)}
                    </div>
                );
            }

            // Markdown Header "# text" → render as bold text (strip the #)
            const headerMatch = line.match(/^#{1,6}\s+(.+)$/);
            if (headerMatch) {
                return <div key={key} className="min-h-[1.2em] font-bold">{renderInline(headerMatch[1])}</div>;
            }

            return <div key={key} className="min-h-[1.2em]">{renderInline(line)}</div>;
        });
    });
};

// --- Robust content cleanup: strip legacy markers, separators, bilingual tags, stray formatting ---
export const stripJunk = (s: string): string => s
    .replace(/%%TRANS%%[\s\S]*/gi, '')           // legacy translation marker
    .replace(/%%\s*BILINGUAL\s*%%/gi, '\n')    // raw bilingual marker → newline (both old and new format)
    .replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '')  // stray bilingual XML tags
    .replace(/\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g, '')  // residual double-bracket quotes (incl. typos & Chinese)
    .replace(/\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g, '')     // residual single-bracket quotes (incl. typos & Chinese)
    .replace(/\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g, '')  // [回复 "content"]: format
    // Residual action/system tags that may have leaked through
    .replace(/\[\[(?:ACTION|RECALL|SEARCH|DIARY|READ_DIARY|FS_DIARY|FS_READ_DIARY|SEND_EMOJI|DIARY_START|DIARY_END|FS_DIARY_START|FS_DIARY_END)[:\s][\s\S]*?\]\]/g, '')
    .replace(/\[schedule_message[^\]]*\]/g, '')
    .replace(/^\s*---\s*$/gm, '')                // standalone --- lines
    .replace(/``+/g, '')                          // empty/stray backtick pairs
    .replace(/(^|\s)`(\s|$)/gm, '$1$2')         // lone backticks at boundaries
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')    // markdown links → just text
    .replace(/\n{3,}/g, '\n\n')                  // collapse excess newlines
    .trim();
