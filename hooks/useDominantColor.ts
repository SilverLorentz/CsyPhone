import { useEffect, useState } from 'react';

export interface RGB {
    r: number;
    g: number;
    b: number;
}

/**
 * 从图片 URL 提取主色调（最饱和且亮度适中的颜色）。
 * 加载中或 CORS 失败时返回 null。
 *
 * 原理：将图片绘制到 12×12 的离屏 canvas，遍历像素找出
 * 饱和度 × 0.7 + 亮度因子 × 0.3 得分最高的颜色。
 */
export function useDominantColor(imageUrl: string | null | undefined): RGB | null {
    const [color, setColor] = useState<RGB | null>(null);

    useEffect(() => {
        if (!imageUrl) {
            setColor(null);
            return;
        }

        let cancelled = false;
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            if (cancelled) return;
            try {
                const canvas = document.createElement('canvas');
                const size = 12;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return;

                ctx.drawImage(img, 0, 0, size, size);
                const { data } = ctx.getImageData(0, 0, size, size);

                let bestR = 80, bestG = 80, bestB = 180;
                let bestScore = -1;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];
                    if (a < 128) continue; // 跳过半透明像素

                    const brightness = (r + g + b) / 3;
                    if (brightness < 25 || brightness > 235) continue; // 跳过过暗/过亮

                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const saturation = max === 0 ? 0 : (max - min) / max;
                    // 综合评分：偏好高饱和度 + 中等亮度
                    const brightnessFactor = 1 - Math.abs(brightness - 128) / 128;
                    const score = saturation * 0.7 + brightnessFactor * 0.3;

                    if (score > bestScore) {
                        bestScore = score;
                        bestR = r;
                        bestG = g;
                        bestB = b;
                    }
                }

                if (!cancelled) {
                    setColor({ r: bestR, g: bestG, b: bestB });
                }
            } catch {
                // Canvas 被 CORS 污染或其他错误 — 静默回退
                if (!cancelled) setColor(null);
            }
        };

        img.onerror = () => {
            if (!cancelled) setColor(null);
        };

        // 网易云 CDN 支持 ?param=WxH 缩略图，减少下载量
        const smallUrl =
            imageUrl.includes('music.126.net') && !imageUrl.includes('param=')
                ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}param=50y50`
                : imageUrl;
        img.src = smallUrl;

        return () => {
            cancelled = true;
        };
    }, [imageUrl]);

    return color;
}
