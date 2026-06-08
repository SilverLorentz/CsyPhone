import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_GENERATION_CONFIG } from './runtimeConfig';
import {
    appendLoveShowSocialSignals,
    canUseLoveShowSocialImage2,
    createLoveShowAltPostFromSecret,
    createLoveShowGuestScenePosts,
    createLoveShowProgramWindPosts,
    createLoveShowSocialSignal,
    ensureLoveShowPostCommentFloor,
    getLoveShowSocialImagePlan,
    isLoveShowTemplateFallbackPost,
    LOVE_SHOW_MIN_COMMENTS_PER_POST,
    markLoveShowSocialSignalsConsumed,
    normalizeLoveShowSocialPost,
    normalizeLoveShowSocialPosts,
} from './loveshowSocial';
import type { LoveShowPrivateSecret } from '../types/loveshow';

describe('LoveShow social feed', () => {
    it('normalizes legacy hot-list posts into feed posts', () => {
        const post = normalizeLoveShowSocialPost({
            id: 'old-post',
            platform: 'weibo',
            username: '追更中',
            content: '今天这个眼神太明显了',
            likes: 42,
            dayNumber: 1,
        }, 1);

        expect(post.authorType).toBe('audience');
        expect(post.authorName).toBe('追更中');
        expect(post.likeCount).toBe(42);
        expect(post.comments).toEqual([]);
        expect(post.source).toBe('system');
    });

    it('uses image2-compatible presets and refuses NAI for feed images', () => {
        const novelAiConfig = DEFAULT_IMAGE_GENERATION_CONFIG;
        const image2Config = {
            ...DEFAULT_IMAGE_GENERATION_CONFIG,
            activeProvider: 'openai-compatible' as const,
            openaiCompatible: {
                ...DEFAULT_IMAGE_GENERATION_CONFIG.openaiCompatible,
                baseUrl: 'https://image.example.test/v1',
                apiKey: 'key',
                model: 'gpt-image-2',
            },
        };

        expect(canUseLoveShowSocialImage2(novelAiConfig)).toBe(false);
        expect(canUseLoveShowSocialImage2(image2Config)).toBe(true);
        expect(getLoveShowSocialImagePlan('guest_selfie', 'cg')).toMatchObject({
            mode: 'solo',
            presetId: 'loveshow-solo-cg',
            includeAppearance: true,
            includeUserAppearance: false,
        });
        expect(getLoveShowSocialImagePlan('date_scene', 'real')).toMatchObject({
            mode: 'couple',
            presetId: 'loveshow-couple-real',
            includeUserAppearance: true,
        });
        expect(getLoveShowSocialImagePlan('user_post_image', 'guoman')).toMatchObject({
            mode: 'solo',
            presetId: 'loveshow-solo-guoman',
            includeAppearance: true,
            includeUserAppearance: true,
        });
        expect(getLoveShowSocialImagePlan('alt_account_mood', 'guoman').includeAppearance).toBe(false);
    });

    it('keeps social interactions as consumable signals', () => {
        const likeSignal = createLoveShowSocialSignal({
            id: 'signal-like',
            sourcePostId: 'post-1',
            actorId: 'user',
            actorType: 'user',
            targetGuestId: 'guest-a',
            action: 'like',
            intensity: 'weak',
        });
        const commentSignal = createLoveShowSocialSignal({
            id: 'signal-comment',
            sourcePostId: 'post-1',
            actorId: 'user',
            actorType: 'user',
            targetGuestId: 'guest-a',
            action: 'comment',
            intensity: 'medium',
        });

        const appended = appendLoveShowSocialSignals([], [likeSignal, commentSignal]);
        expect(appended.every(signal => signal.consumed === false)).toBe(true);

        const consumed = markLoveShowSocialSignalsConsumed(appended, ['signal-like']);
        expect(consumed.find(signal => signal.id === 'signal-like')?.consumed).toBe(true);
        expect(consumed.find(signal => signal.id === 'signal-comment')?.consumed).toBe(false);
    });

    it('renders program wind posts from existing wind items', () => {
        const posts = createLoveShowProgramWindPosts({
            day: 2,
            windItems: [{
                id: 'wind-a',
                type: 'solo_date',
                guestId: 'guest-a',
                title: '下一轮镜头',
                body: '观众想看阿序和你单独聊聊。',
            }],
        });

        expect(posts).toHaveLength(1);
        expect(posts[0]).toMatchObject({
            id: 'program_wind_wind-a',
            authorType: 'program',
            source: 'wind',
            authorGuestId: 'guest-a',
        });
    });

    it('derives alt posts from private secrets without revealing exact secret text', () => {
        const secret: LoveShowPrivateSecret = {
            id: 'secret-a',
            seasonId: 'season-a',
            day: 1,
            guestId: 'guest-a',
            userName: '小雨',
            kind: 'confession',
            intensity: 'charged',
            summary: '阿序承认只想收到小雨的短信',
            privateLine: '我只想收到你的短信',
            publicSubtextHint: '公开场会在短信话题里停顿',
            createdAt: 100,
        };
        const post = createLoveShowAltPostFromSecret({
            secret,
            guest: { id: 'guest-a', name: '阿序' },
            day: 1,
            imageStyle: 'guoman',
            enableImage: true,
        });

        expect(post.authorType).toBe('guest_alt');
        expect(post.hiddenOwnerGuestId).toBe('guest-a');
        expect(post.content).not.toContain(secret.summary);
        expect(post.content).not.toContain('我只想收到你的短信');
        expect(post.image?.intent).toBe('alt_account_mood');
    });

    it('does not fill user posts with generated fallback replies', () => {
        const post = normalizeLoveShowSocialPost({
            id: 'user-post-a',
            platform: 'weibo',
            username: '小雨',
            authorType: 'user',
            authorId: 'user',
            authorName: '小雨',
            content: '刚才那一秒我其实有点想回头。',
            dayNumber: 1,
            source: 'user_action',
        }, 1);

        const enriched = ensureLoveShowPostCommentFloor(post, {
            userName: '小雨',
            guests: [
                { id: 'guest-a', name: '阿序' },
                { id: 'guest-b', name: '沈既白' },
                { id: 'guest-c', name: '林见川' },
            ],
            createdAt: 100,
        });

        expect(LOVE_SHOW_MIN_COMMENTS_PER_POST).toBe(0);
        expect(enriched.comments).toEqual([]);
    });

    it('does not create a local guest scene post when no model content exists', () => {
        const posts = createLoveShowGuestScenePosts({
            day: 1,
            sceneSummary: '阿序和小雨在厨房停顿了一下',
            userName: '小雨',
            guests: [
                { id: 'guest-a', name: '阿序' },
                { id: 'guest-b', name: '沈既白' },
            ],
            preferredGuestId: 'guest-a',
            imageStyle: 'cg',
            enableImage: true,
        });

        expect(posts).toEqual([]);
    });

    it('filters existing template fallback posts and comments from storage payloads', () => {
        const posts = normalizeLoveShowSocialPosts([
            {
                id: 'fallback-scene',
                platform: 'weibo',
                username: '沈既白',
                authorType: 'guest',
                authorId: 'guest-a',
                authorName: '沈既白',
                authorGuestId: 'guest-a',
                content: '刚才那段停顿比台本长一点。小雨应该也听出来了吧。',
                dayNumber: 1,
                source: 'scene_end',
                comments: [],
            },
            {
                id: 'real-post',
                platform: 'xhs',
                username: '显微镜在线',
                authorType: 'audience',
                authorId: 'audience-real',
                authorName: '显微镜在线',
                content: '刚才厨房里阿序把杯子换到小雨顺手那边，这个细节我先记下来。',
                dayNumber: 1,
                source: 'system',
                comments: [{
                    id: 'comment_audience_old',
                    postId: 'real-post',
                    authorType: 'audience',
                    authorId: 'audience-template',
                    authorName: '今天也在追心动',
                    content: '这条下面怎么突然有录制现场的味道了，我先蹲一个后续。',
                    createdAt: 2,
                }, {
                    id: 'comment-guest-slogan',
                    postId: 'real-post',
                    authorType: 'guest',
                    authorId: 'guest-c',
                    authorName: '陈望舒',
                    authorGuestId: 'guest-c',
                    content: '遗憾留给昨天，心动留给被看见的那一刻。',
                    createdAt: 2,
                }, {
                    id: 'comment-ai',
                    postId: 'real-post',
                    authorType: 'audience',
                    authorId: 'audience-ai',
                    authorName: '显微镜二号',
                    content: '他换杯子的动作太顺了，像是刚刚已经观察过她的习惯。',
                    createdAt: 3,
                }],
            },
        ], 1);

        expect(posts).toHaveLength(1);
        expect(posts[0].id).toBe('real-post');
        expect(posts[0].comments).toHaveLength(1);
        expect(posts[0].comments[0].content).toContain('换杯子');
        expect(isLoveShowTemplateFallbackPost(normalizeLoveShowSocialPost({
            id: 'fallback-alt',
            platform: 'weibo',
            username: '匿名心跳',
            authorType: 'guest_alt',
            authorId: 'alt_guest-a',
            authorName: '匿名心跳',
            content: '有些话在镜头前只能停一下。差点露出来的时候，反而更想装作没事。',
            dayNumber: 1,
            source: 'private_secret',
        }, 1))).toBe(true);
    });
});
