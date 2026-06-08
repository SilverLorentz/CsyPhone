// @vitest-environment jsdom

import React from 'react';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { ConfigProvider,useConfig } from './ConfigContext';
import { IMAGE_GENERATION_CONFIG_KEY } from '../utils/runtimeConfig';

const ConfigTestButton: React.FC = () => {
    const { isConfigLoaded,updateApiConfig } = useConfig();

    return (
        <button
            disabled={!isConfigLoaded}
            onClick={() => updateApiConfig({
                apiKey: 'main-key',
                baseUrl: 'https://main.example.com',
                model: 'gpt-main',
            })}
        >
            save api
        </button>
    );
};

const ImageGenerationConfigTestButton: React.FC = () => {
    const { imageGenerationConfig,isConfigLoaded,updateImageGenerationConfig } = useConfig();

    return (
        <div>
            <output aria-label="nai-width">{imageGenerationConfig.novelai.width}</output>
            <output aria-label="nai-height">{imageGenerationConfig.novelai.height}</output>
            <output aria-label="nai-sampler">{imageGenerationConfig.novelai.sampler}</output>
            <output aria-label="nai-schedule">{imageGenerationConfig.novelai.noiseSchedule}</output>
            <button
                disabled={!isConfigLoaded}
                onClick={() => updateImageGenerationConfig({
                    novelai: {
                        ...imageGenerationConfig.novelai,
                        width: 900,
                        height: 901,
                        sampler: 'k_dpm++ 2m',
                        noiseSchedule: 'Poly Exponential',
                    },
                })}
            >
                save image
            </button>
        </div>
    );
};

describe('ConfigContext', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('notifies the agent runtime after saving primary API config', async () => {
        const listener = vi.fn();
        window.addEventListener('agent-config-changed', listener);

        try {
            render(
                <ConfigProvider>
                    <ConfigTestButton />
                </ConfigProvider>,
            );

            const saveButton = screen.getByRole('button', { name: 'save api' });
            await waitFor(() => expect(saveButton).not.toBeDisabled());

            fireEvent.click(saveButton);

            expect(listener).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener('agent-config-changed', listener);
        }
    });

    it('keeps image generation state normalized after saving NAI params', async () => {
        render(
            <ConfigProvider>
                <ImageGenerationConfigTestButton />
            </ConfigProvider>,
        );

        const saveButton = screen.getByRole('button', { name: 'save image' });
        await waitFor(() => expect(saveButton).not.toBeDisabled());

        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(screen.getByLabelText('nai-width')).toHaveTextContent('896');
            expect(screen.getByLabelText('nai-height')).toHaveTextContent('896');
            expect(screen.getByLabelText('nai-sampler')).toHaveTextContent('k_dpmpp_2m');
            expect(screen.getByLabelText('nai-schedule')).toHaveTextContent('polyexponential');
        });

        const persisted = JSON.parse(localStorage.getItem(IMAGE_GENERATION_CONFIG_KEY) || '{}');
        expect(persisted.novelai.width).toBe(896);
        expect(persisted.novelai.height).toBe(896);
        expect(persisted.novelai.sampler).toBe('k_dpmpp_2m');
        expect(persisted.novelai.noiseSchedule).toBe('polyexponential');
    });
});
