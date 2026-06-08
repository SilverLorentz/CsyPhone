/**
 * API Configuration Validation Utilities
 * Shared by DateApp, TheaterApp, and other modules that need to check API config completeness.
 * Extracted to its own module to avoid TDZ issues caused by Vite chunk splitting.
 */

/**
 * Type guard: checks if an API config has all required fields (baseUrl, apiKey, model) filled in.
 */
export const hasCompleteApiConfig = (
    config?: { baseUrl?: string; apiKey?: string; model?: string } | null,
): config is { baseUrl: string; apiKey: string; model: string } =>
    !!config?.baseUrl?.trim() && !!config?.apiKey?.trim() && !!config?.model?.trim();
