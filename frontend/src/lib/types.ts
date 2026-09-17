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
  score: number;
  match_rate: number;
  matched_ingredients: MatchedIngredient[];
  missing_ingredients: MissingIngredient[];
  urgency_boost: number;
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
