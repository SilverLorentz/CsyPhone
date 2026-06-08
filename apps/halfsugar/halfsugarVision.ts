/**
 * halfsugarVision — AI food identification via direct LLM API calls.
 * Backend fallback has been removed; all calls go directly to the configured LLM endpoint.
 */
import { extractJson, safeResponseJson } from '../../utils/safeApi';
import { type FoodItem } from './types';

export interface VisionResult {
    foods: FoodItem[];
    mealDescription: string;
    totalCalories: number;
    source: 'ai_vision';
}

interface VisionApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

type FoodConfidence = 'high' | 'medium' | 'low';

const FOOD_IDENTIFICATION_PROMPT = `你是一个专业的食物营养分析师。请分析这张食物照片，识别其中的每一样食物，并估算其营养成分。

### 输出要求
返回纯 JSON，格式如下：
{
  "foods": [
    {
      "name": "食物名称",
      "portion": "估算份量描述（如：约200g、1碗、2片）",
      "calories": 数字（kcal），
      "protein": 数字（g），
      "carbs": 数字（g），
      "fat": 数字（g），
      "fiber": 数字（g），
      "confidence": "high" | "medium" | "low"
    }
  ],
  "meal_description": "一句话概述这餐的整体情况",
  "total_calories": 数字
}

### 规则
1. 尽量准确估算，参考中国食物成分表标准
2. 如果看不清楚，给出合理的估计并标注 confidence="low"
3. 所有数值保留整数
4. 不要输出 JSON 以外的任何内容`;

function buildFoodId(index: number): string {
    return `food-ai-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function toTrimmedString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toRoundedNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function isConfidence(value: unknown): value is FoodConfidence {
    return value === 'high' || value === 'medium' || value === 'low';
}

function extractChoiceContent(choice: any): string {
    const msg = choice?.message;
    const messageContent = msg?.content;
    if (typeof messageContent === 'string' && messageContent.trim()) {
        return messageContent.trim();
    }

    if (Array.isArray(messageContent)) {
        const joined = messageContent
            .map((item) => {
                if (typeof item === 'string') return item;
                if (item && typeof item.text === 'string') return item.text;
                return '';
            })
            .join('\n')
            .trim();
        if (joined) return joined;
    }

    // Some models put the real output in reasoning_content when content is null
    if (typeof msg?.reasoning_content === 'string' && msg.reasoning_content.trim()) {
        return msg.reasoning_content.trim();
    }

    if (typeof choice?.text === 'string') {
        return choice.text.trim();
    }

    if (typeof choice?.delta?.content === 'string') {
        return choice.delta.content.trim();
    }

    return '';
}

function normalizeVisionResult(input: any): VisionResult {
    const rawFoods = Array.isArray(input?.foods) ? input.foods : [];
    const foods = rawFoods
        .map((item: any, index: number): FoodItem | null => {
            const name = toTrimmedString(item?.name);
            if (!name) return null;

            const portion = toTrimmedString(item?.portion);
            return {
                id: buildFoodId(index),
                name,
                calories: toRoundedNumber(item?.calories),
                protein: toRoundedNumber(item?.protein),
                carbs: toRoundedNumber(item?.carbs),
                fat: toRoundedNumber(item?.fat),
                fiber: toRoundedNumber(item?.fiber),
                portion: portion || undefined,
                source: 'ai_vision',
                confidence: isConfidence(item?.confidence) ? item.confidence : 'medium',
            };
        })
        .filter((item: FoodItem | null): item is FoodItem => Boolean(item));

    const fallbackCalories = foods.reduce((sum: number, item: FoodItem) => sum + item.calories, 0);
    return {
        foods,
        mealDescription: toTrimmedString(input?.meal_description || input?.mealDescription),
        totalCalories: toRoundedNumber(input?.total_calories || input?.totalCalories) || fallbackCalories,
        source: 'ai_vision',
    };
}

function extractVisionPayload(data: any): VisionResult {
    if (Array.isArray(data?.foods)) {
        return normalizeVisionResult(data);
    }

    // Try all choices (some models put content in different indices)
    const choices = Array.isArray(data?.choices) ? data.choices : [];
    let rawContent = '';
    for (const choice of choices) {
        rawContent = extractChoiceContent(choice);
        if (rawContent) break;
    }

    if (!rawContent) {
        // Some endpoints return the content at the top level
        if (typeof data?.content === 'string') rawContent = data.content.trim();
        if (typeof data?.text === 'string') rawContent = data.text.trim();
    }

    if (!rawContent) {
        throw new Error('识别结果为空，请更换模型或重试');
    }

    const parsed = extractJson(rawContent);
    if (!parsed) {
        console.warn('[extractVisionPayload] JSON parse failed, raw:', rawContent.slice(0, 500));
        throw new Error('AI 返回了无法解析的内容，请重试');
    }

    // Handle case where AI returns an array directly: [{...}]
    if (Array.isArray(parsed)) {
        return normalizeVisionResult({ foods: parsed });
    }

    return normalizeVisionResult(parsed);
}

async function callDirectVisionApi(
    imageBase64: string,
    mealType: string,
    apiConfig: VisionApiConfig,
): Promise<VisionResult> {
    const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: apiConfig.model,
            messages: [
                { role: 'system', content: FOOD_IDENTIFICATION_PROMPT },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `请识别这张${mealType}照片中的食物` },
                        { type: 'image_url', image_url: { url: imageBase64 } },
                    ],
                },
            ],
            temperature: 0.2,
            max_tokens: 2000,
            stream: false,
        }),
    });

    if (!response.ok) {
        try {
            const errorData = await safeResponseJson(response.clone());
            const detail = errorData?.error?.message || errorData?.error || `HTTP ${response.status}`;
            throw new Error(String(detail));
        } catch (error) {
            if (error instanceof Error && error.message) {
                throw error;
            }
            throw new Error(`识别请求失败 (${response.status})`);
        }
    }

    const data = await safeResponseJson(response);
    return extractVisionPayload(data);
}

const FOOD_ESTIMATION_PROMPT = `你是一个专业的食物营养分析师。用户输入一个食物名称，请估算该食物常见一人份（中等份量）的营养成分。

### 输出要求
返回纯 JSON，格式如下：
{
  "foods": [
    {
      "name": "食物名称",
      "portion": "估算份量描述（如：约200g、1碗、2片）",
      "calories": 数字（kcal），
      "protein": 数字（g），
      "carbs": 数字（g），
      "fat": 数字（g），
      "fiber": 数字（g），
      "confidence": "high" | "medium" | "low"
    }
  ],
  "meal_description": "一句话概述",
  "total_calories": 数字
}

### 规则
1. 参考中国食物成分表标准，给出常见一人份的估算
2. 如果食物名称模糊，给出合理估计，confidence 标注 "medium"
3. 所有数值保留整数
4. 不要输出 JSON 以外的任何内容`;

function buildFoodEstimateUserPrompt(foodName: string): string {
    return `估算「${foodName}」的营养成分（默认 1 人份），返回 JSON`;
}

async function callDirectTextEstimate(
    foodName: string,
    apiConfig: VisionApiConfig,
    _retryCount = 0,
): Promise<VisionResult> {
    const endpoint = `${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const body = {
        model: apiConfig.model,
        messages: [
            { role: 'system', content: FOOD_ESTIMATION_PROMPT },
            { role: 'user', content: buildFoodEstimateUserPrompt(foodName) },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        stream: false,
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        try {
            const errorData = await safeResponseJson(response.clone());
            const detail = errorData?.error?.message || errorData?.error || `HTTP ${response.status}`;
            throw new Error(String(detail));
        } catch (error) {
            if (error instanceof Error && error.message) throw error;
            throw new Error(`估算请求失败 (${response.status})`);
        }
    }

    const data = await safeResponseJson(response);

    try {
        return extractVisionPayload(data);
    } catch (parseError) {
        // Retry once on parse failure (LLM can be non-deterministic)
        if (_retryCount < 1) {
            console.warn('[callDirectTextEstimate] Parse failed, retrying...', parseError);
            return callDirectTextEstimate(foodName, apiConfig, _retryCount + 1);
        }
        throw parseError;
    }
}

/**
 * Estimate nutrition for a food item by name using LLM (text-only, no vision model needed).
 */
export async function estimateFoodByName(
    foodName: string,
    apiConfig: VisionApiConfig,
): Promise<VisionResult> {
    if (!foodName.trim()) {
        throw new Error('请输入食物名称');
    }
    if (!apiConfig.baseUrl.trim() || !apiConfig.apiKey.trim() || !apiConfig.model.trim()) {
        throw new Error('请先在设置中填写 API 配置');
    }

    return callDirectTextEstimate(foodName, apiConfig);
}

export async function identifyFoodFromImage(
    imageBase64: string,
    mealType: string,
    apiConfig: VisionApiConfig,
): Promise<VisionResult> {
    if (!imageBase64.startsWith('data:image/')) {
        throw new Error('请先选择有效的食物照片');
    }

    if (!apiConfig.baseUrl.trim() || !apiConfig.apiKey.trim() || !apiConfig.model.trim()) {
        throw new Error('请先在设置中填写可识别图片的 API 配置');
    }

    return callDirectVisionApi(imageBase64, mealType, apiConfig);
}
