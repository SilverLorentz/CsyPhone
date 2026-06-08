import { describe, expect, it } from 'vitest';
import {
    DATE_WRITING_STYLE_PRESETS,
    buildFullDateSystemPrompt,
    buildDateOutputTuning,
    resolveDateWritingStylePreset,
} from '../utils/datePrompts';

describe('date writing style presets', () => {
    it('exposes the current built-in style set in picker order', () => {
        expect(DATE_WRITING_STYLE_PRESETS.map(p => p.key)).toEqual([
            'cozy',
            'sweet',
            'minimal',
            'immersive',
            'cinematic',
            'desolate',
            'restrained',
            'lyrical',
            'tender',
            'artisan',
            'quiet',
            'banter',
            'angst',
            'danger',
            'comedy',
            'fluffy',
        ]);
    });

    it('exposes picker metadata for each style', () => {
        DATE_WRITING_STYLE_PRESETS.forEach(preset => {
            expect(preset.group).toMatch(/\S/);
            expect(preset.accent.light).toMatch(/^#[0-9A-F]{6}$/i);
            expect(preset.accent.dark).toMatch(/^#[0-9A-F]{6}$/i);
            expect(preset.sample).toMatch(/\S/);
            expect(preset.ref).toMatch(/\S/);
        });
    });

    it('merges the premium picker copy by stable key', () => {
        expect(resolveDateWritingStylePreset('cozy')?.label).toBe('相对忘言');
        expect(resolveDateWritingStylePreset('cozy')?.sample).toContain('他剥着橘子');
        expect(resolveDateWritingStylePreset('cozy')?.ref).toContain('步履不停');
        expect(resolveDateWritingStylePreset('danger')?.label).toBe('危光微醺');
        expect(resolveDateWritingStylePreset('minimal')?.label).toBe('不着一字');
    });

    it('maps legacy saved preset keys to the new presets', () => {
        expect(resolveDateWritingStylePreset('daily')?.key).toBe('cozy');
        expect(resolveDateWritingStylePreset('natural')?.key).toBe('cozy');
        expect(resolveDateWritingStylePreset('literary')?.key).toBe('immersive');
        expect(resolveDateWritingStylePreset('hardcore')?.key).toBe('immersive');
        expect(resolveDateWritingStylePreset('poetic')?.key).toBe('cinematic');
    });

    it('injects the resolved preset prompt instead of treating legacy keys as custom text', () => {
        const tuning = buildDateOutputTuning(150, 'daily');

        expect(tuning).toContain('【文风：松弛日常】');
        expect(tuning).not.toContain('【文风指令：自定义】\ndaily');
    });

    it('keeps built-in styles optional when no style is selected', () => {
        const tuning = buildDateOutputTuning(150);

        expect(tuning).toContain('【文风底线 · 系统级】');
        expect(tuning).not.toContain('【文风：松弛日常】');
        expect(tuning).not.toContain('【文风：静水深流】');
        expect(tuning).not.toContain('【文风指令：自定义】');
    });

    it('omits the date time block when character date time awareness is off', () => {
        const prompt = buildFullDateSystemPrompt({
            char: {
                id: 'char-date-time-off',
                name: 'Sully',
                avatar: '',
                description: '',
                systemPrompt: '',
                memories: [],
                dateTimeAwarenessEnabled: false,
            } as any,
            userProfile: {
                name: '糯米',
                avatar: '',
                bio: '',
            },
        });

        expect(prompt).not.toContain('### 【当前时间】');
        expect(prompt).not.toContain('现在几点了？读取上方系统提供的【当前时间】');
        expect(prompt).toContain('该角色已关闭线下时间感知');
    });
});
