/**
 * Zhaixinglou — Secondary API Wrapper
 * 
 * Uses the project's existing safeFetchJson utility.
 * Completely isolated from the main chat API.
 */
import { safeFetchJson,extractContent,extractJson } from '../../utils/safeApi';
import { SecondaryAPIConfig } from './zhaixinglouStore';

/**
 * Send a chat completion request to the secondary API.
 */
export async function fetchSecondaryApi(
    config: SecondaryAPIConfig,
    messages: { role: string; content: string }[],
    options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
    if (!config.baseUrl || !config.apiKey || !config.model) {
        throw new Error('请先在摘星楼设置中配置副API');
    }

    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const body: Record<string, any> = {
        model: config.model,
        messages,
        temperature: options?.temperature ?? 0.9,
    };
    if (options?.max_tokens) body.max_tokens = options.max_tokens;

    const data = await safeFetchJson(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 2, {
        feature: 'zhaixinglou',
        reason: '摘星楼内容生成',
        model: config.model,
        userInitiated: true,
    });

    return extractContent(data);
}

/**
 * Send a request and expect a JSON response.
 */
export async function fetchSecondaryApiJson(
    config: SecondaryAPIConfig,
    messages: { role: string; content: string }[],
    options?: { temperature?: number; max_tokens?: number }
): Promise<any> {
    const raw = await fetchSecondaryApi(config, messages, options);
    const parsed = extractJson(raw);
    if (!parsed) throw new Error('副API返回了无法解析的JSON');
    return parsed;
}

/**
 * Fetch available models from the secondary API endpoint.
 */
export async function fetchSecondaryModels(config: SecondaryAPIConfig): Promise<string[]> {
    if (!config.baseUrl || !config.apiKey) {
        throw new Error('请先填写副API地址和密钥');
    }

    const url = `${config.baseUrl.replace(/\/+$/, '')}/models`;

    const data = await safeFetchJson(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
        },
    });

    if (!data?.data || !Array.isArray(data.data)) {
        throw new Error('无法获取模型列表，返回格式异常');
    }

    return data.data.map((m: any) => m.id).sort();
}

/**
 * Test connection to the secondary API.
 */
export async function testSecondaryConnection(config: SecondaryAPIConfig): Promise<string> {
    if (!config.baseUrl || !config.apiKey || !config.model) {
        throw new Error('请填写完整的副API配置');
    }

    const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const data = await safeFetchJson(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5,
        }),
    }, 2, {
        feature: 'zhaixinglou',
        reason: '摘星楼 API 连接测试',
        model: config.model,
        userInitiated: true,
    });

    const content = extractContent(data);
    return content || '连接成功 (模型已响应)';
}
