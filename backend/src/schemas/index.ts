import { z } from 'zod';

/** 日期字符串统一校验为 YYYY-MM-DD，避免非法日期让保质期计算得出 NaN */
const expiryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需为 YYYY-MM-DD（例如 2026-09-17）');

export const ScannedItemSchema = z.object({
  name: z.string().min(1, '食材名称不能为空'),
  category: z.string().default('其他'),
  estimated_quantity: z.string().default('适量'),
  storage_location: z.string().default('冷藏'),
  confidence: z.number().min(0).max(1).default(0.9),
  recommended_storage_days: z.number().int().min(1).default(3),
});

export type ScannedItem = z.infer<typeof ScannedItemSchema>;

export const FridgeScanResultSchema = z.object({
  items: z.array(ScannedItemSchema),
  summary: z.string().optional(),
  suggested_actions: z.array(z.string()).optional(),
});

export type FridgeScanResult = z.infer<typeof FridgeScanResultSchema>;

export const UrgencyLevelSchema = z.enum(['green', 'yellow', 'red']);
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;

export const InventoryItemStatusSchema = z.enum(['active', 'consumed', 'discarded']);
export type InventoryItemStatus = z.infer<typeof InventoryItemStatusSchema>;

export const InventoryItemSchema = z.object({
  id: z.number(),
  user_id: z.string(),
  name: z.string(),
  category: z.string(),
  quantity: z.string(),
  unit: z.string().optional().default(''),
  storage_location: z.string().default('冷藏'),
  confidence: z.number().default(1.0),
  storage_days: z.number().int().default(3),
  expiry_date: z.string(),
  added_at: z.string(),
  status: InventoryItemStatusSchema.default('active'),
  updated_at: z.string(),
  urgency_level: UrgencyLevelSchema.optional(),
  days_remaining: z.number().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const CreateInventoryItemInputSchema = z.object({
  name: z.string().min(1, '食材名称不能为空'),
  category: z.string().optional().default('其他'),
  quantity: z.string().optional().default('1份'),
  unit: z.string().optional().default(''),
  storage_location: z.string().optional().default('冷藏'),
  confidence: z.number().min(0).max(1).optional().default(1.0),
  storage_days: z.number().int().min(1).optional(),
  expiry_date: expiryDateSchema.optional(),
});

export type CreateInventoryItemInput = z.input<typeof CreateInventoryItemInputSchema>;

export const BatchAddInventorySchema = z.object({
  // 限制单次批量写入条数，避免一个请求塞入海量数据拖垮服务
  items: z
    .array(CreateInventoryItemInputSchema)
    .min(1, '至少添加一件食材')
    .max(200, '单次最多添加 200 件食材'),
});

export type BatchAddInventory = z.infer<typeof BatchAddInventorySchema>;

export const UpdateInventoryItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  storage_location: z.string().optional(),
  storage_days: z.number().int().min(1).optional(),
  expiry_date: expiryDateSchema.optional(),
  status: InventoryItemStatusSchema.optional(),
});

export type UpdateInventoryItem = z.input<typeof UpdateInventoryItemSchema>;

export const RecipeIngredientSchema = z.object({
  name: z.string(),
  amount: z.string(),
  required: z.boolean().default(true),
});

export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const RecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().default('家常菜'),
  cuisine: z.string().default('中餐'),
  difficulty: z.string().default('简单'),
  prep_time: z.number().int().default(10),
  cook_time: z.number().int().default(15),
  servings: z.number().int().default(2),
  ingredients: z.array(RecipeIngredientSchema),
  instructions: z.array(z.string()),
  tips: z.string().optional().default(''),
  image_url: z.string().optional().default(''),
  created_at: z.string().optional(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

/**
 * AI 动态生成的菜谱结构
 * 【修复 ARC-03】大模型的输出不可控，此前直接入库导致：
 * 一旦模型返回 {"ingredients": "西红柿"}（字符串而非数组），前端渲染就会整页崩溃。
 * 现在所有 AI 返回内容都必须先通过这份校验，不合格的直接丢弃。
 */
export const AiRecipeSchema = RecipeSchema.omit({ id: true, created_at: true });
export type AiRecipe = z.infer<typeof AiRecipeSchema>;

/**
 * 一次生成多道 AI 菜谱时的返回结构
 * 单次请求里让模型返回数组，比循环请求多次更省时间与额度。
 */
export const AiRecipeBatchSchema = z.object({
  recipes: z.array(AiRecipeSchema).min(1).max(5),
});
export type AiRecipeBatch = z.infer<typeof AiRecipeBatchSchema>;

export const MatchedIngredientDetailSchema = z.object({
  recipe_ingredient: z.string(),
  inventory_item_id: z.number(),
  inventory_name: z.string(),
  urgency_level: UrgencyLevelSchema,
  days_remaining: z.number(),
});

export type MatchedIngredientDetail = z.infer<typeof MatchedIngredientDetailSchema>;

export const RecipeRecommendationSchema = RecipeSchema.extend({
  score: z.number(),
  match_rate: z.number(),
  matched_ingredients: z.array(MatchedIngredientDetailSchema),
  missing_ingredients: z.array(RecipeIngredientSchema),
  urgency_boost: z.number(),
});

export type RecipeRecommendation = z.infer<typeof RecipeRecommendationSchema>;

export const RecommendQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cuisine: z.string().optional(),
  difficulty: z.string().optional(),
  max_cook_time: z.coerce.number().int().optional(),
});

export type RecommendQuery = z.infer<typeof RecommendQuerySchema>;

export const CookRecipeRequestSchema = z.object({
  notes: z.string().optional(),
  auto_consume_ingredients: z.boolean().default(true),
});

export type CookRecipeRequest = z.input<typeof CookRecipeRequestSchema>;

/**
 * AI 菜谱生成请求（修复 SEC-03 / ARC-09）
 *
 * 之前路由直接把 req.json() 的裸对象往下传：
 * - preference 未做长度限制，超长文本会被原样拼进提示词，放大 token 消耗甚至撑爆上游限制；
 * - count 未做范围限制，客户端传 9999 会让提示词要求模型一次产出上万道菜。
 * 现在统一在入口做裁剪与钳制：偏好文本截断到 200 字，数量限制在 1-5。
 *
 * 字段同时兼容 preference 与 preferences 两种历史叫法，避免破坏已发布的客户端。
 */
export const AiGenerateRequestSchema = z
  .object({
    preference: z.string().optional(),
    preferences: z.string().optional(),
    count: z.coerce.number().int().min(1).max(5).default(3),
  })
  .transform((value) => ({
    preference: (value.preference ?? value.preferences ?? '').trim().slice(0, 200) || undefined,
    count: value.count,
  }));

export type AiGenerateRequest = z.output<typeof AiGenerateRequestSchema>;

/**
 * 烹饪历史查询参数（修复 PER-03）
 * 旧接口一次性 SELECT 全部历史记录，用户做菜越多返回体越大、响应越慢。
 * 改为默认返回最近 50 条，并支持用 before 游标继续往前翻。
 */
export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(),
});

export type HistoryQuery = z.output<typeof HistoryQuerySchema>;

/** 烹饪历史条目（ingredients_used 已从 JSON 字符串还原为数组） */
export interface CookingHistoryEntry {
  id: number;
  user_id: string;
  recipe_id: string;
  recipe_name: string;
  cooked_at: string;
  ingredients_used: string[];
  notes: string;
}
