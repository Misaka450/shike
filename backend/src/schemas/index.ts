import { z } from 'zod';

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
  expiry_date: z.string().optional(),
});

export type CreateInventoryItemInput = z.input<typeof CreateInventoryItemInputSchema>;

export const BatchAddInventorySchema = z.object({
  items: z.array(CreateInventoryItemInputSchema).min(1, '至少添加一件食材'),
});

export type BatchAddInventory = z.infer<typeof BatchAddInventorySchema>;

export const UpdateInventoryItemSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  storage_location: z.string().optional(),
  storage_days: z.number().int().min(1).optional(),
  expiry_date: z.string().optional(),
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
