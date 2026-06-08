const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeDateDiaryMemoryPlaceholders = (text: string): string => (
    text
        .replace(/[｛{]\s*userName\s*[｝}]/gi, '{userName}')
        .replace(/[｛{]\s*charName\s*[｝}]/gi, '{charName}')
);

export const renderDateDiaryMemoryTemplate = (
    text: string,
    charName: string,
    userName: string,
): string => (
    normalizeDateDiaryMemoryPlaceholders(text)
        .replace(/\{charName\}/g, charName)
        .replace(/\{userName\}/g, userName)
);

export const toDateDiaryMemoryTemplate = (
    text: string,
    charName: string,
    userName: string,
): string => {
    let normalized = normalizeDateDiaryMemoryPlaceholders(text);
    const replacements = [
        [userName.trim(), '{userName}'],
        [charName.trim(), '{charName}'],
    ] as const;

    for (const [name, placeholder] of replacements
        .filter(([name]) => name.length > 0)
        .sort((a, b) => b[0].length - a[0].length)) {
        normalized = normalized.replace(new RegExp(escapeRegExp(name), 'g'), placeholder);
    }

    return normalized;
};
