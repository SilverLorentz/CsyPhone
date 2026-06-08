// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
    classifyPushEndpoint,
    getPushEndpointIssue,
    isSubscriptionUsingVapidKey,
} from './pushSubscription';

describe('pushSubscription helpers', () => {
    it('classifies common Web Push providers and invalid placeholder endpoints', () => {
        expect(classifyPushEndpoint('https://web.push.apple.com/abc')).toBe('Safari/APNs');
        expect(classifyPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe('Chrome/FCM');
        expect(classifyPushEndpoint('https://updates.push.services.mozilla.com/abc')).toBe('Firefox');
        expect(classifyPushEndpoint('https://permanently-removed.invalid/fcm/send/abc')).toBe('Edge Android 不可投递');
    });

    it('detects endpoints that should not be uploaded for offline push', () => {
        expect(getPushEndpointIssue('https://permanently-removed.invalid/fcm/send/abc')).toBe('removed_push_endpoint');
        expect(getPushEndpointIssue('http://fcm.googleapis.com/fcm/send/abc')).toBe('non_https_endpoint');
        expect(getPushEndpointIssue('not a url')).toBe('invalid_url');
        expect(getPushEndpointIssue('https://fcm.googleapis.com/fcm/send/abc')).toBeNull();
    });

    it('compares an existing subscription applicationServerKey with the current VAPID key', () => {
        const matchingSubscription = {
            options: {
                applicationServerKey: new Uint8Array([1, 2, 3]).buffer,
            },
        } as Pick<PushSubscription, 'options'>;
        const mismatchedSubscription = {
            options: {
                applicationServerKey: new Uint8Array([3, 2, 1]).buffer,
            },
        } as Pick<PushSubscription, 'options'>;

        expect(isSubscriptionUsingVapidKey(matchingSubscription, 'AQID')).toBe(true);
        expect(isSubscriptionUsingVapidKey(mismatchedSubscription, 'AQID')).toBe(false);
        expect(isSubscriptionUsingVapidKey({ options: {} } as Pick<PushSubscription, 'options'>, 'AQID')).toBeNull();
    });
});
