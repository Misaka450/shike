import { config } from '../config.js';
import { FridgeScanResult, FridgeScanResultSchema } from '../schemas/index.js';

const SYSTEM_PROMPT = `你是一位专业的智能冰箱食材识别专家。请仔细分析这张冰箱内部或食材的照片，准确识别出其中的所有食材（包括蔬菜、肉禽、蛋奶、水果、豆制品、调料、水产、熟食等）。

请为识别出的每种食材提供以下字段：
- name: 食材中文名称（简短规范，如“西红柿”、“鸡蛋”、“西兰花”、“猪里脊”、“黄瓜”）
- category: 分类（蔬菜、肉禽、水产、蛋奶、水果、豆制品、调味品、熟食剩菜、饮料、其他）
- estimated_quantity: 估算数量/份量（例如：“3个”、“约500g”、“1盒”、“半根”）
- storage_location: 推荐存放位置（冷藏上层、冷藏抽屉、冷冻室、冰箱门架）
- confidence: 识别置信度（0.1 到 1.0 的浮点数）
- recommended_storage_days: 建议保质存放天数（正整数，例如鲜叶菜3天、根茎类7天、生鲜肉冷藏2天、鸡蛋15天）

返回必须是合法的 JSON 格式，严格符合以下结构：
{
  "items": [
    {
      "name": "西红柿",
      "category": "蔬菜",
      "estimated_quantity": "3个",
      "storage_location": "冷藏抽屉",
      "confidence": 0.95,
      "recommended_storage_days": 5
    }
  ],
  "summary": "识别到的食材简短概述",
  "suggested_actions": ["整理建议1", "保存建议2"]
}
不要输出除 JSON 以外的任何文本或解释。`;

function cleanJsonResponse(rawText: string): string {
  let text = rawText.trim();
  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  return text;
}

export async function callCpaVision(
  base64Image: string,
  mimeType: string,
  modelName: string
): Promise<string> {
  const url = `${config.CPA_URL.replace(/\/+$/, '')}/chat/completions`;
  
  const payload = {
    model: modelName,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    temperature: 0.2,
    max_tokens: 2048,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.CPA_API_KEY}`,
    },
    body: JSON.stringify(payload),
    // 【修复 PER-04】给上游调用加超时，避免模型服务挂起时请求永久阻塞
    signal: AbortSignal.timeout(config.CPA_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`CPA API request failed (${response.status}): ${errorText || response.statusText}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response received from vision model');
  }

  return content;
}

export async function scanFridgeImage(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<FridgeScanResult> {
  const base64Image = imageBuffer.toString('base64');

  // 模型名单来自配置（CPA_VISION_MODELS，逗号分隔），无需改代码即可切换候选模型
  const models =
    config.CPA_VISION_MODELS.length > 0 ? config.CPA_VISION_MODELS : ['gemini-3.8-flash-high'];
  let rawContent: string | null = null;
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      rawContent = await callCpaVision(base64Image, mimeType, model);
      if (rawContent) break;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[VisionService] Model ${model} failed, trying fallback if available:`, lastError.message);
    }
  }

  if (!rawContent) {
    throw new Error(`Failed to scan fridge image with all models: ${lastError?.message || 'Unknown error'}`);
  }

  const cleaned = cleanJsonResponse(rawContent);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Attempt regex extraction if there's leading/trailing non-json content
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (innerErr) {
        throw new Error(`Failed to parse AI response as JSON: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`);
      }
    } else {
      throw new Error(`Failed to parse AI response as JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Validate and coerce using Zod schema
  return FridgeScanResultSchema.parse(parsed);
}
