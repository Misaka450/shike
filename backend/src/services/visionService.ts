import { config } from '../config.js';
import { FridgeScanResult, FridgeScanResultSchema } from '../schemas/index.js';

const FRIDGE_SYSTEM_PROMPT = `你是一位专业的智能冰箱食材识别专家。请仔细分析这张冰箱内部或食材的照片，准确识别出其中的所有食材（包括蔬菜、肉禽、蛋奶、水果、豆制品、调料、水产、熟食等）。

请为识别出的每种食材提供以下字段：
- name: 食材中文名称（简短规范，如“西红柿”、“鸡蛋”、“西兰花”、“猪里脊”、“黄瓜”）
- category: 分类（蔬菜、肉禽、水产、蛋奶、水果、豆制品、调味品、熟食剩菜、饮料、其他）
- estimated_quantity: 估算数量/份量（例如：“3个”、“约500g”、“1盒”、“半根”）
- storage_location: 推荐存放位置（冷藏上层、冷藏抽屉、冷冻室、冰箱门架、常温储物）
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

const RECEIPT_SYSTEM_PROMPT = `你是一位专业的买菜小票与生鲜外卖订单解析专家。请仔细识别并提取这张超市纸质小票（如山姆、大润发、永辉等）或买菜外卖 App 订单截图（如盒马、朴朴超市、叮咚买菜、美团买菜等）中的生鲜食材明细。

关键要求：
1. 严格过滤非生鲜食品：必须自动剔除所有日用品、餐巾纸、塑料袋/购物袋、配送费、押金、清洁用品等；
2. 智能规范化清洗食材名称：去掉各种商超营销与促销前缀/后缀（例如：“【限时直降】鲜活基围虾 500g盒装”清洗为“基围虾”；“日日鲜崇明金龙生菜 350g”清洗为“生菜”；“双汇经典培根 200g”清洗为“培根”；“黄天鹅可生食鸡蛋 10枚装”清洗为“鸡蛋”）；
3. 智能推断分类与存放：根据生鲜种类推断合理分类（蔬菜、肉禽、水产、水果、蛋奶、豆制品、调味品等）、推荐存放位置（冷藏抽屉、冷藏室、冷冻室、常温储物）和推荐保质天数（如鲜叶菜3天、肉类冷冻30天、牛奶7天）；
4. 数量与规格：提取其购买规格份量（例如“500g”、“1盒”、“10枚”、“1袋”）。

返回必须是合法的 JSON 格式，严格符合以下结构：
{
  "items": [
    {
      "name": "基围虾",
      "category": "水产",
      "estimated_quantity": "500g",
      "storage_location": "冷冻室",
      "confidence": 0.98,
      "recommended_storage_days": 30
    }
  ],
  "summary": "成功从购物凭证中识别提取 X 种生鲜食材，已自动过滤非食品与促销杂质",
  "suggested_actions": ["保存建议1", "保存建议2"]
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

export type ScanMode = 'fridge' | 'receipt';

export async function callCpaVision(
  base64Image: string,
  mimeType: string,
  modelName: string,
  mode: ScanMode = 'fridge'
): Promise<string> {
  const url = `${config.CPA_URL.replace(/\/+$/, '')}/chat/completions`;
  const systemPrompt = mode === 'receipt' ? RECEIPT_SYSTEM_PROMPT : FRIDGE_SYSTEM_PROMPT;
  
  const payload = {
    model: modelName,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: systemPrompt,
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
    // 【修复 PERF-03】识图走独立的更短超时：候选模型是串行尝试的，
    // 若每个都用通用的 30 秒，两个模型最坏要等 60 秒才告诉用户失败。
    signal: AbortSignal.timeout(config.CPA_VISION_TIMEOUT_MS),
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
  mimeType: string = 'image/jpeg',
  mode: ScanMode = 'fridge'
): Promise<FridgeScanResult> {
  const base64Image = imageBuffer.toString('base64');

  // 模型名单来自配置（CPA_VISION_MODELS，逗号分隔），无需改代码即可切换候选模型
  const models =
    config.CPA_VISION_MODELS.length > 0 ? config.CPA_VISION_MODELS : ['gemini-3.8-flash-high'];
  let rawContent: string | null = null;
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      rawContent = await callCpaVision(base64Image, mimeType, model, mode);
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
