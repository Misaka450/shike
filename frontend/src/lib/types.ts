export type UrgencyLevel = 'green' | 'yellow' | 'red';

export interface InventoryItem {
  id: number;
  user_id: string;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  storage_location: string;
  confidence: number;
  storage_days: number;
  expiry_date: string;
  added_at: string;
  status: string;
  updated_at: string;
  urgency_level: UrgencyLevel;
  days_remaining: number;
}

export interface InventorySummary {
  total: number;
  red_urgent: number;
  yellow_warning: number;
  green_safe: number;
}

export interface RecipeIngredient {
  name: string;
  amount: string;
  required: boolean;
}

export interface MatchedIngredient {
  recipe_ingredient: string;
  inventory_item_id: number;
  inventory_name: string;
  urgency_level: UrgencyLevel;
  days_remaining: number;
}

export interface MissingIngredient {
  name: string;
  amount: string;
  required: boolean;
}

/**
 * 基础菜谱结构
 * 与后端 GET /api/recipes 返回的数据一致：不含推荐评分等运行时字段。
 * 【修复 ARC-04】旧版本把 score / match_rate 等字段声明为必填，
 * 但列表接口根本不返回它们，形成"类型谎言"，一旦有人调用该接口就会踩坑。
 */
export interface Recipe {
  id: string;
  name: string;
  category: string;
  cuisine: string;
  difficulty: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  ingredients: RecipeIngredient[];
  instructions: string[];
  tips: string;
  image_url: string;
  created_at?: string;
}

/** 带推荐评分的菜谱（推荐接口 / AI 定制接口返回，在基础菜谱上扩展） */
export interface RecipeRecommendation extends Recipe {
  score: number;
  match_rate: number;
  matched_ingredients: MatchedIngredient[];
  missing_ingredients: MissingIngredient[];
  urgency_boost: number;
}

/** 推荐接口返回的数据体 */
export interface RecommendationResult {
  recommendations: RecipeRecommendation[];
  inventory_count: number;
  urgent_items_rescued: number;
}

export interface ScannedItem {
  name: string;
  category: string;
  estimated_quantity: string;
  storage_location: string;
  confidence: number;
  recommended_storage_days: number;
}

export interface FridgeScanResult {
  items: ScannedItem[];
  summary: string;
  suggested_actions?: string[];
}

/** 当前登录用户资料（访客与注册用户共用此结构） */
export interface UserProfile {
  user_id: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  is_guest: boolean;
}

/** 烹饪完成后的返回结果 */
export interface CookResult {
  success: boolean;
  consumedCount: number;
  recipeName: string;
}