// @vitest-environment jsdom

import { afterEach,describe,expect,it,vi } from 'vitest';
import { callLLM } from './extractionLlm';

describe('extractionLlm', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('includes provider error details when the LLM API returns HTTP errors', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ error: { message: 'context length exceeded' } }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                },
            ),
        ));

        await expect(callLLM(
            'prompt',
            { baseUrl: 'https://llm.example.com/v1', apiKey: 'llm-key', model: 'test-model' },
        )).rejects.toThrow('LLM API error 400: context length exceeded');
    });
});
