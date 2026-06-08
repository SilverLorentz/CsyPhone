import type { MemoryRecord } from '../types';
import type { MemoryRecordPlayable } from '../types/music';
import { loadHtml2Canvas } from './lazyThirdParty';
import {
    sanitizeMemoryRecordMp3FileName,
    shareMemoryRecordFiles,
    type MemoryRecordExportFile,
    type MemoryRecordFileShareMethod,
} from './memoryRecordExport';
import { getMemoryRecordCoverImage } from './memoryRecordCovers';

export type MemoryRecordPosterShareMethod = MemoryRecordFileShareMethod;
export type MemoryRecordPackageShareMethod = MemoryRecordPosterShareMethod;

export interface MemoryRecordSharePreview {
    albumName: string;
    artistName: string;
    coverGradient?: string;
    coverImageUrl?: string;
    durationMs: number;
    lyricLines: string[];
    title: string;
}

export interface MemoryRecordPosterShareResult {
    cardFileName: string;
    fileNames: string[];
    method: MemoryRecordPosterShareMethod;
}

export type MemoryRecordPackageShareResult = MemoryRecordPosterShareResult;

export interface ShareMemoryRecordPosterOptions {
    renderCard?: (preview: MemoryRecordSharePreview) => Promise<Blob>;
    renderPoster?: (preview: MemoryRecordSharePreview) => Promise<Blob>;
}

export type ShareMemoryRecordPackageOptions = ShareMemoryRecordPosterOptions;

const SHARE_POSTER_WIDTH = 540;
const SHARE_POSTER_HEIGHT = 675;
const SHARE_POSTER_SCALE = 2;
const MAX_LYRIC_LINES = 2;
const MAX_LYRIC_LINE_LENGTH = 28;
const DEFAULT_SHARE_CARD_NAME = 'Emo Cloud 分享海报.png';
const SHARE_POSTER_FONT_STACK = `var(--app-font, 'Quicksand', sans-serif),-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC','Microsoft YaHei',sans-serif`;
const SHARE_POSTER_DISPLAY_FONT_STACK = `var(--app-font, 'Quicksand', sans-serif),Georgia,serif`;
const BRACKETED_SECTION_RE = /^\s*[\[(【（].{0,24}[\])】）]\s*$/;
const TIMESTAMP_RE = /^\s*(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?]\s*)+/;

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function truncateText(value: string, maxLength: number): string {
    const text = value.trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function normalizeLyricLine(line: string): string {
    return line
        .replace(TIMESTAMP_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function extractMemoryRecordShareLyricLines(lyrics: string | undefined): string[] {
    if (!lyrics) return [];

    const seen = new Set<string>();
    const result: string[] = [];

    for (const rawLine of lyrics.split(/\r?\n/)) {
        const line = normalizeLyricLine(rawLine);
        if (!line || BRACKETED_SECTION_RE.test(line) || seen.has(line)) continue;

        seen.add(line);
        result.push(truncateText(line, MAX_LYRIC_LINE_LENGTH));

        if (result.length >= MAX_LYRIC_LINES) break;
    }

    return result;
}

export function formatMemoryRecordShareDuration(durationMs: number | undefined): string {
    const safeMs = Number.isFinite(durationMs) ? Math.max(0, Number(durationMs)) : 0;
    if (safeMs <= 0) return '--:--';

    const totalSeconds = Math.round(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function buildMemoryRecordSharePreview(
    playable: MemoryRecordPlayable,
    record?: MemoryRecord,
): MemoryRecordSharePreview {
    return {
        albumName: playable.albumName || record?.albumName || '回忆唱片匣',
        artistName: playable.artistName || record?.artistName || record?.charName || 'Emo Cloud',
        coverGradient: playable.coverGradient || record?.coverGradient,
        coverImageUrl: playable.coverImageUrl || (record ? getMemoryRecordCoverImage(record) : undefined),
        durationMs: playable.duration || record?.durationMs || 0,
        lyricLines: extractMemoryRecordShareLyricLines(record?.lyrics || playable.lyrics),
        title: playable.name || record?.title || '未命名歌曲',
    };
}

function buildFallbackLyrics(preview: MemoryRecordSharePreview): string[] {
    return preview.lyricLines.length > 0
        ? preview.lyricLines
        : ['把这一段回忆轻轻压进唱片', '等夜色替我们按下播放键'];
}

function buildShareCardHtml(preview: MemoryRecordSharePreview): string {
    const gradient = preview.coverGradient || 'linear-gradient(135deg,#211f2e 0%,#b98f73 54%,#d8cab6 100%)';
    const coverStyle = preview.coverImageUrl
        ? ''
        : `background:${escapeHtml(gradient)};`;
    const lyrics = buildFallbackLyrics(preview)
        .map((line) => `<p style="margin:0;max-width:386px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(line)}</p>`)
        .join('');
    const escapedCoverUrl = preview.coverImageUrl ? escapeHtml(preview.coverImageUrl) : '';
    const escapedGradient = escapeHtml(gradient);

    return `
        <div style="width:${SHARE_POSTER_WIDTH}px;height:${SHARE_POSTER_HEIGHT}px;box-sizing:border-box;border-radius:38px;background:#111015;font-family:${SHARE_POSTER_FONT_STACK};color:#fff;box-shadow:0 26px 68px rgba(0,0,0,0.34);overflow:hidden;position:relative;">
            <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0.10) 0%,rgba(255,255,255,0.02) 34%,rgba(0,0,0,0.64) 100%),${escapedGradient};opacity:0.8;"></div>
            ${escapedCoverUrl ? `<img crossOrigin="anonymous" src="${escapedCoverUrl}" alt="" style="position:absolute;inset:-42px;width:calc(100% + 84px);height:calc(100% + 84px);object-fit:cover;filter:blur(28px) saturate(1.14);opacity:0.34;" />` : ''}
            <div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 16%,rgba(255,233,192,0.24) 0,rgba(255,233,192,0) 34%),linear-gradient(180deg,rgba(11,10,15,0.22) 0%,rgba(11,10,15,0.08) 40%,rgba(11,10,15,0.82) 100%);"></div>
            <div style="position:absolute;inset:18px;border:1px solid rgba(255,255,255,0.14);border-radius:30px;box-shadow:0 1px 0 rgba(255,255,255,0.12) inset;"></div>
            <div style="position:absolute;left:25px;right:25px;bottom:20px;height:118px;background:linear-gradient(180deg,rgba(11,10,15,0),rgba(11,10,15,0.46));border-radius:0 0 26px 26px;"></div>

            <div style="position:absolute;left:36px;right:36px;top:31px;z-index:1;display:flex;justify-content:space-between;gap:18px;align-items:center;">
                <div style="font-size:12px;font-weight:850;letter-spacing:0.24em;color:rgba(255,255,255,0.72);">EMO CLOUD</div>
                <div style="font-size:12px;font-weight:850;color:rgba(255,248,226,0.92);">${formatMemoryRecordShareDuration(preview.durationMs)}</div>
            </div>

            <div style="position:absolute;right:46px;top:125px;z-index:1;width:248px;height:248px;border-radius:999px;background:radial-gradient(circle at center,#0f0f12 0 21%,#222026 22% 23%,#0c0b10 24% 46%,#2b2930 47% 48%,#0b0a0e 49% 100%);box-shadow:0 24px 46px rgba(0,0,0,0.42),0 0 0 1px rgba(255,255,255,0.08) inset;"></div>
            <div style="position:absolute;left:116px;top:88px;z-index:2;width:308px;height:308px;border-radius:36px;padding:8px;background:rgba(255,255,255,0.15);box-shadow:0 26px 58px rgba(0,0,0,0.44);">
                <div style="width:100%;height:100%;border-radius:29px;overflow:hidden;${coverStyle}box-shadow:0 0 0 1px rgba(255,255,255,0.20) inset;display:flex;align-items:center;justify-content:center;">
                    ${escapedCoverUrl ? `<img crossOrigin="anonymous" src="${escapedCoverUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />` : `<span style="font-size:78px;font-family:${SHARE_POSTER_DISPLAY_FONT_STACK};color:rgba(255,255,255,0.76);text-shadow:0 10px 22px rgba(0,0,0,0.28);">♪</span>`}
                </div>
            </div>

            <div style="position:absolute;left:48px;right:48px;top:414px;z-index:2;text-align:left;">
                <h1 style="margin:0;max-width:444px;max-height:78px;font-size:35px;line-height:1.1;font-weight:850;letter-spacing:0;color:#fff7dc;word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 10px 24px rgba(0,0,0,0.2);">${escapeHtml(preview.title)}</h1>
            </div>

            <div style="position:absolute;left:48px;right:48px;top:497px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:18px;">
                <p style="margin:0;max-width:286px;font-size:15px;line-height:1.4;font-weight:780;color:rgba(255,255,255,0.84);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(preview.artistName)}</p>
                <p style="margin:0;max-width:150px;font-size:12px;line-height:1.4;font-weight:700;color:rgba(255,255,255,0.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(preview.albumName)}</p>
            </div>

            <div style="position:absolute;left:48px;right:48px;top:532px;z-index:2;min-height:64px;border-left:3px solid rgba(255,239,198,0.68);padding:5px 0 5px 18px;background:linear-gradient(90deg,rgba(255,239,198,0.08),rgba(255,239,198,0));color:rgba(255,250,235,0.88);font-size:17px;line-height:1.65;font-weight:680;text-shadow:0 1px 12px rgba(0,0,0,0.24);">
                ${lyrics}
            </div>

            <div style="position:absolute;left:36px;right:36px;bottom:29px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:18px;color:rgba(255,255,255,0.64);font-size:11px;font-weight:850;letter-spacing:0.16em;">
                <span>一起写歌</span>
                <span>MEMORY RECORD</span>
            </div>
        </div>
    `;
}

async function waitForImages(root: HTMLElement): Promise<void> {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map((image) => {
        if (image.complete) return Promise.resolve();

        return new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
        });
    }));
}

async function waitForFonts(): Promise<void> {
    if (typeof document === 'undefined' || !('fonts' in document)) return;

    try {
        await document.fonts.ready;
    } catch {
        // Font readiness is best-effort; poster rendering can still continue with fallbacks.
    }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob === 'function') {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }
                reject(new Error('分享海报生成失败'));
            }, 'image/png');
            return;
        }

        try {
            fetch(canvas.toDataURL('image/png'))
                .then((response) => response.blob())
                .then(resolve)
                .catch(reject);
        } catch (error) {
            reject(error);
        }
    });
}

export async function renderMemoryRecordSharePosterPng(preview: MemoryRecordSharePreview): Promise<Blob> {
    if (typeof document === 'undefined') {
        throw new Error('当前环境无法生成分享海报');
    }

    const host = document.createElement('div');
    host.style.cssText = [
        'position:fixed',
        'left:-10000px',
        'top:0',
        `width:${SHARE_POSTER_WIDTH}px`,
        'background:transparent',
        'pointer-events:none',
        'z-index:-1',
    ].join(';');
    host.innerHTML = buildShareCardHtml(preview);
    document.body.appendChild(host);

    try {
        await waitForImages(host);
        await waitForFonts();
        const card = host.firstElementChild as HTMLElement | null;
        if (!card) throw new Error('分享海报生成失败');

        const html2canvas = await loadHtml2Canvas();
        const canvas = await html2canvas(card, {
            backgroundColor: null,
            logging: false,
            scale: SHARE_POSTER_SCALE,
            useCORS: true,
            width: SHARE_POSTER_WIDTH,
            height: SHARE_POSTER_HEIGHT,
        });

        return canvasToPngBlob(canvas);
    } finally {
        document.body.removeChild(host);
    }
}

export const renderMemoryRecordShareCardPng = renderMemoryRecordSharePosterPng;

export function getMemoryRecordShareCardFileName(title: string, artistName: string): string {
    const mp3Name = sanitizeMemoryRecordMp3FileName(title, artistName);
    const cardName = mp3Name.replace(/\.mp3$/i, '.png');
    return cardName === mp3Name ? DEFAULT_SHARE_CARD_NAME : cardName;
}

export async function shareMemoryRecordPoster(
    playable: MemoryRecordPlayable,
    options: ShareMemoryRecordPosterOptions = {},
): Promise<MemoryRecordPosterShareResult> {
    const preview = buildMemoryRecordSharePreview(playable);
    const renderPoster = options.renderPoster || options.renderCard || renderMemoryRecordSharePosterPng;
    const cardBlob = await renderPoster(preview);
    const cardFileName = getMemoryRecordShareCardFileName(preview.title, preview.artistName);
    const cardFile: MemoryRecordExportFile = {
        blob: cardBlob,
        fileName: cardFileName,
    };
    const files = [cardFile];
    const method = await shareMemoryRecordFiles(files, `${preview.title} - Emo Cloud`);

    return {
        cardFileName,
        fileNames: files.map((file) => file.fileName),
        method,
    };
}

export async function shareMemoryRecordPackage(
    playable: MemoryRecordPlayable,
    options: ShareMemoryRecordPackageOptions = {},
): Promise<MemoryRecordPackageShareResult> {
    return shareMemoryRecordPoster(playable, options);
}
