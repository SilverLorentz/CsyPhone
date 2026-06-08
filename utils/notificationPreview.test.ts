import { describe, expect, it } from 'vitest';
import { APP_NOTIFICATION_NAME, DEFAULT_NOTIFICATION_BODY, formatNotificationBody, formatNotificationTitle } from './notificationPreview';

describe('notification preview formatting', () => {
    it('removes URLs and technical detail lines from notification bodies', () => {
        const body = formatNotificationBody(
            'URL: https://api.example.com/v1/chat/completions\n这五天我可是连着盯着音频波形看了 https://beta.sully-frontend.pages.dev/path',
        );

        expect(body).toBe('这五天我可是连着盯着音频波形看了');
        expect(body).not.toContain('http');
        expect(body).not.toContain('beta.sully-frontend');
    });

    it('truncates long previews with an ellipsis', () => {
        const body = formatNotificationBody('晚安'.repeat(80), { maxLength: 18 });

        expect(body.length).toBeLessThanOrEqual(18);
        expect(body.endsWith('…')).toBe(true);
    });

    it('keeps emoji and voice previews readable', () => {
        expect(formatNotificationBody('[[SEND_EMOJI: 猫咪托腮]]')).toBe('发来一个表情：猫咪托腮');
        expect(formatNotificationBody('[语音消息: 8秒] "今晚的风声很好听"')).toBe('语音消息：今晚的风声很好听');
    });

    it('falls back to a natural message when content is empty after cleanup', () => {
        expect(formatNotificationBody('https://example.com')).toBe(DEFAULT_NOTIFICATION_BODY);
    });

    it('formats notification titles into a visible message state', () => {
        expect(formatNotificationTitle('Ethan')).toBe('Ethan 来消息了');
        expect(formatNotificationTitle('CSY-SullyOS')).toBe(APP_NOTIFICATION_NAME);
        expect(formatNotificationTitle('Ethan 来消息了')).toBe('Ethan 来消息了');
    });
});
