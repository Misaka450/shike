import { db } from '../db/index.js';
import {
  AiRecipeBatchSchema,
  CookRecipeRequest,
  InventoryItem,
  MatchedIngredientDetail,
  Recipe,
  RecipeIngredient,
  RecipeRecommendation,
  RecommendQuery,
} from '../schemas/index.js';
import { markItemsAsConsumed } from './inventoryService.js';
import { EXPANDED_RECIPES } from './expandedRecipes.js';
import { config } from '../config.js';
import { isIngredientMatch } from '../utils/ingredientMatch.js';
import { selectRecipeImage } from '../utils/recipeImage.js';

/** AI 动态生成的菜谱最多保留的条数，超出后自动清理最旧的（防止数据库无限膨胀） */
const MAX_AI_RECIPES = 50;

// 食材同义词判定已抽到 utils/ingredientMatch.ts，便于单独做单元测试

export const DEFAULT_RECIPES: Recipe[] = [
  {
    id: 'recipe-tomato-egg',
    name: '西红柿炒鸡蛋',
    category: '家常菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 5,
    cook_time: 8,
    servings: 2,
    ingredients: [
      { name: '西红柿', amount: '2个', required: true },
      { name: '鸡蛋', amount: '3个', required: true },
      { name: '大葱', amount: '1根', required: false },
      { name: '糖', amount: '1勺', required: false },
      { name: '盐', amount: '适量', required: false },
    ],
    instructions: [
      '西红柿洗净切块，鸡蛋加少许盐打散备用。',
      '热锅凉油，倒入蛋液快速滑炒至定型盛出。',
      '锅留底油爆香葱段，放入西红柿块翻炒出汁。',
      '加少许糖调味，倒回炒好的鸡蛋翻炒均匀即可出锅。',
    ],
    tips: '西红柿炒出沙汁是好吃的秘诀，加少许白糖可中和番茄酸味。',
    image_url: '/images/tomato_egg.webp',
  },
  {
    id: 'recipe-cucumber-salad',
    name: '蒜泥拍黄瓜',
    category: '凉拌菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 5,
    cook_time: 2,
    servings: 2,
    ingredients: [
      { name: '黄瓜', amount: '2根', required: true },
      { name: '大蒜', amount: '4瓣', required: true },
      { name: '辣椒', amount: '1根', required: false },
      { name: '香醋', amount: '2勺', required: false },
      { name: '生抽', amount: '1勺', required: false },
    ],
    instructions: [
      '黄瓜洗净，用刀背拍散后斜切成小段。',
      '大蒜压成蒜泥，辣椒切圈备用。',
      '将黄瓜放入碗中，加入蒜泥、生抽、香醋、香油和少许盐糖。',
      '拌匀后腌制5分钟食用风味更佳。',
    ],
    tips: '拍碎的黄瓜比切的更容易入味，冰镇后口感更加爽脆。',
    image_url: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500',
  },
  {
    id: 'recipe-yuxiang-pork',
    name: '鱼香肉丝',
    category: '川菜',
    cuisine: '中餐',
    difficulty: '中等',
    prep_time: 15,
    cook_time: 10,
    servings: 3,
    ingredients: [
      { name: '猪里脊', amount: '250g', required: true },
      { name: '黑木耳', amount: '50g', required: true },
      { name: '胡萝卜', amount: '半根', required: true },
      { name: '青椒', amount: '1个', required: false },
      { name: '生姜', amount: '1块', required: false },
      { name: '大蒜', amount: '3瓣', required: false },
    ],
    instructions: [
      '里脊肉切细丝，加料酒、生抽、淀粉抓匀腌制10分钟。',
      '黑木耳泡发切丝，胡萝卜、青椒切细丝备用。',
      '调鱼香汁：糖3勺、醋3勺、生抽2勺、淀粉1勺、清水少许调匀。',
      '油热下肉丝滑炒变色盛出，爆香姜蒜末与豆瓣酱。',
      '倒入配菜丝炒至断生，倒回肉丝和鱼香汁大火翻炒收汁。',
    ],
    tips: '肉丝切匀且用淀粉上浆是嫩滑的关键，鱼香汁按经典比例调配。',
    image_url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500',
  },
  {
    id: 'recipe-pepper-pork',
    name: '青椒小炒肉',
    category: '湘菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 10,
    cook_time: 8,
    servings: 2,
    ingredients: [
      { name: '猪五花肉', amount: '200g', required: true },
      { name: '青椒', amount: '3个', required: true },
      { name: '大蒜', amount: '3瓣', required: false },
      { name: '生抽', amount: '1勺', required: false },
      { name: '老抽', amount: '半勺', required: false },
    ],
    instructions: [
      '五花肉切薄片，青椒切滚刀块或滚刀丝。',
      '净锅不放油，下青椒中小火干煸出虎皮状微皱盛出。',
      '锅内下五花肉煸炒出油脂至焦香微卷。',
      '加入蒜片、生抽、老抽翻炒上色，倒回青椒大火炒匀出锅。',
    ],
    tips: '先干煸青椒逼出椒香，五花肉逼出多余油脂就不会腻。',
    image_url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500',
  },
  {
    id: 'recipe-mapo-tofu',
    name: '麻婆豆腐',
    category: '川菜',
    cuisine: '中餐',
    difficulty: '中等',
    prep_time: 10,
    cook_time: 12,
    servings: 3,
    ingredients: [
      { name: '嫩豆腐', amount: '1块(400g)', required: true },
      { name: '牛肉末', amount: '80g', required: false },
      { name: '大蒜', amount: '3瓣', required: false },
      { name: '豆瓣酱', amount: '1大勺', required: true },
      { name: '花椒面', amount: '适量', required: false },
      { name: '大葱', amount: '1根', required: false },
    ],
    instructions: [
      '豆腐切约2厘米小方块，放入加盐的沸水锅中焯水去豆腥捞出。',
      '热油下牛肉末炒酥香，下豆瓣酱、豆豉、蒜末小火炒出红油。',
      '加入清水或高汤烧沸，下豆腐小火慢煨3-5分钟入味。',
      '分三次淋入水淀粉勾芡收浓汤汁，撒葱花与花椒面出锅。',
    ],
    tips: '豆腐焯盐水能定型不易碎，三次勾芡能让汤汁完美裹住豆腐。',
    image_url: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500',
  },
  {
    id: 'recipe-di-san-xian',
    name: '地三鲜',
    category: '东北菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 12,
    cook_time: 10,
    servings: 3,
    ingredients: [
      { name: '土豆', amount: '1个', required: true },
      { name: '茄子', amount: '1根', required: true },
      { name: '青椒', amount: '1个', required: true },
      { name: '大蒜', amount: '4瓣', required: false },
      { name: '生抽', amount: '2勺', required: false },
    ],
    instructions: [
      '土豆削皮切滚刀块，茄子切滚刀块裹少许干淀粉，青椒切块。',
      '锅中倒油，油温六成热下土豆炸至金黄捞出，再炸茄子至软。',
      '最后下青椒块过油5秒一同捞出控油。',
      '锅留底油爆香蒜末，倒入生抽、蚝油、淀粉水调成的酱汁。',
      '下入三鲜快速大火翻炒挂汁即可。',
    ],
    tips: '茄子裹一层薄薄的淀粉炸制，能有效防止吸入过多油分。',
    image_url: 'https://images.unsplash.com/photo-1628294895950-9805252327bc?w=500',
  },
  {
    id: 'recipe-garlic-broccoli',
    name: '蒜蓉西兰花',
    category: '家常菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 5,
    cook_time: 5,
    servings: 2,
    ingredients: [
      { name: '西兰花', amount: '1朵', required: true },
      { name: '大蒜', amount: '5瓣', required: true },
      { name: '生抽', amount: '1勺', required: false },
      { name: '盐', amount: '适量', required: false },
    ],
    instructions: [
      '西兰花掰成小朵，淡盐水浸泡清洗干净。',
      '锅中水开加少许油盐，放入西兰花焯水1分钟捞出过凉水。',
      '热锅凉油，下入大半蒜蓉爆出香味。',
      '倒入焯好的西兰花大火翻炒，加生抽和少许盐翻匀。',
      '出锅前撒入剩余蒜蓉提升香味即可。',
    ],
    tips: '焯水加食用油能让西兰花翠绿诱人，分两次下蒜香气更足。',
    image_url: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500',
  },
  {
    id: 'recipe-cola-wings',
    name: '可乐鸡翅',
    category: '家常菜',
    cuisine: '中餐',
    difficulty: '简单',
    prep_time: 10,
    cook_time: 20,
    servings: 2,
    ingredients: [
      { name: '鸡中翅', amount: '8只', required: true },
      { name: '可乐', amount: '1罐(330ml)', required: true },
      { name: '生姜', amount: '1块', required: false },
      { name: '大葱', amount: '1根', required: false },
      { name: '生抽', amount: '2勺', required: false },
    ],
    instructions: [
      '鸡翅两面各划两刀，冷水下锅加姜片料酒焯水洗净。',
      '不粘锅少油，下鸡翅中小火慢煎至两面金黄。',
      '放入姜片、葱段微炒，倒入可乐没过鸡翅。',
      '加生抽、老抽调色，大火煮沸后转中小火焖煮15分钟。',
      '最后开大火收浓汤汁，裹满焦糖色即可出锅。',
    ],
    tips: '收汁时要不断翻动鸡翅防止粘锅焦糊，汤汁黏稠时口感最好。',
    image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500',
  },
];

export function initSeedRecipes(): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO recipes (
      id, name, category, cuisine, difficulty, prep_time, cook_time,
      servings, ingredients, instructions, tips, image_url, created_at
    ) VALUES (
      @id, @name, @category, @cuisine, @difficulty, @prep_time, @cook_time,
      @servings, @ingredients, @instructions, @tips, @image_url, @created_at
    )
  `);

  const now = new Date().toISOString();
  const insertAll = db.transaction((recipes: Recipe[]) => {
    for (const r of recipes) {
      insert.run({
        id: r.id,
        name: r.name,
        category: r.category,
        cuisine: r.cuisine,
        difficulty: r.difficulty,
        prep_time: r.prep_time,
        cook_time: r.cook_time,
        servings: r.servings,
        ingredients: JSON.stringify(r.ingredients),
        instructions: JSON.stringify(r.instructions),
        tips: r.tips || '',
        image_url: r.image_url || '',
        created_at: now,
      });
    }
  });

  insertAll([...DEFAULT_RECIPES, ...EXPANDED_RECIPES]);
}

// Auto seed default and expanded recipes
initSeedRecipes();

/**
 * 菜谱内存缓存（PER-02）
 * 旧实现每次推荐都要把全部菜谱读出来并逐条 JSON.parse 解析食材与步骤，
 * 随着菜谱数量增长，这个开销会线性放大。这里改为只在首次访问时解析一次。
 */
let recipeCache: Recipe[] | null = null;

/** 菜谱数据发生变化（例如新增 AI 菜谱）时清空缓存，下次访问自动重建 */
export function invalidateRecipeCache(): void {
  recipeCache = null;
}

/** 读取全部菜谱（带缓存），仅在数据变更或首次访问时真正查询数据库 */
function getAllRecipes(): Recipe[] {
  if (!recipeCache) {
    const rows = db.prepare('SELECT * FROM recipes ORDER BY name ASC').all();
    recipeCache = rows.map(rowToRecipe);
  }
  return recipeCache;
}

/** 安全解析 JSON 字符串：数据损坏时回退到默认值，避免单个脏数据让整个接口报 500 */
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value as T) ?? fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function rowToRecipe(row: any): Recipe {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    cuisine: row.cuisine,
    difficulty: row.difficulty,
    prep_time: row.prep_time,
    cook_time: row.cook_time,
    servings: row.servings,
    ingredients: safeJsonParse<RecipeIngredient[]>(row.ingredients, []),
    instructions: safeJsonParse<string[]>(row.instructions, []),
    tips: row.tips || '',
    image_url: row.image_url || '',
    created_at: row.created_at,
  };
}

/**
 * 列出菜谱
 * 可见性规则（NEW-01/02 修复）：
 * - 内置菜谱（owner_id 为 NULL）对所有人可见；
 * - AI 定制菜谱是用户私有内容，只有其生成者（owner_id 匹配）能看到。
 *
 * @param filters 菜系/难度过滤
 * @param userId  当前登录用户；传入时只返回「内置菜谱 + 该用户自己的 AI 菜谱」。
 *                不传时只返回内置菜谱（供内部纯内置场景使用，例如推荐引擎）。
 */
export function listRecipes(
  filters?: { cuisine?: string; difficulty?: string },
  userId?: string
): Recipe[] {
  // 从内存缓存读取全量菜谱，归属与分类过滤在内存中完成
  return getAllRecipes().filter((recipe) => {
    if (filters?.cuisine && recipe.cuisine !== filters.cuisine) return false;
    if (filters?.difficulty && recipe.difficulty !== filters.difficulty) return false;
    return true;
  }).filter((recipe) => {
    // 需要查询数据库确认归属（缓存的是菜谱内容，不含 owner_id）
    if (!recipe.id.startsWith('ai-recipe-')) return true; // 内置菜谱
    if (!userId) return false; // 未指定用户：调用方只想要内置菜谱
    return getRecipeOwnerId(recipe.id) === userId;
  });
}

/** 查询菜谱归属用户；内置菜谱返回 null，不存在返回 undefined */
const ownerStmt = db.prepare('SELECT owner_id FROM recipes WHERE id = ?');
function getRecipeOwnerId(id: string): string | null | undefined {
  const row = ownerStmt.get(id) as { owner_id: string | null } | undefined;
  return row ? row.owner_id : undefined;
}

/**
 * 判断某菜谱对指定用户是否可见
 * 内置菜谱人人可见；AI 菜谱仅生成者可见。
 */
export function isRecipeVisibleTo(id: string, userId: string): boolean {
  const ownerId = getRecipeOwnerId(id);
  if (ownerId === undefined) return false; // 菜谱不存在
  return ownerId === null || ownerId === userId;
}

/**
 * 读取菜谱详情（内部使用，不做归属校验）
 * 需要对外返回时请配合 isRecipeVisibleTo 做可见性判断。
 */
export function getRecipeById(id: string): Recipe | null {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  return row ? rowToRecipe(row) : null;
}

export class RecipeError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST') {
    super(message);
    this.name = 'RecipeError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 删除指定的 AI 菜谱
 * 【安全修复 NEW-01】两道校验：
 * 1. 只有以 'ai-recipe-' 开头的菜谱才允许删除（系统内置菜谱一律 403）；
 * 2. 必须是该菜谱的生成者本人（owner_id 匹配）才能删除，防止用户删除他人的私有菜谱。
 */
export function deleteRecipe(id: string, userId: string): boolean {
  if (!id || !id.startsWith('ai-recipe-')) {
    throw new RecipeError('仅允许删除 AI 定制菜谱，系统内置或基础菜谱禁止删除', 403, 'FORBIDDEN');
  }

  const ownerId = getRecipeOwnerId(id);
  if (ownerId === undefined) {
    throw new RecipeError('菜谱不存在或已被删除', 404, 'NOT_FOUND');
  }
  if (ownerId !== userId) {
    // 不向调用者区分「不存在」与「存在但属于他人」，避免泄露他人菜谱 ID
    throw new RecipeError('菜谱不存在或已被删除', 404, 'NOT_FOUND');
  }

  const result = db.prepare('DELETE FROM recipes WHERE id = ? AND owner_id = ?').run(id, userId);
  if (result.changes === 0) {
    throw new RecipeError('菜谱不存在或已被删除', 404, 'NOT_FOUND');
  }

  // 内存缓存同步清空
  invalidateRecipeCache();
  return true;
}

export function recommendRecipes(
  inventory: InventoryItem[],
  query?: Partial<RecommendQuery>
): RecipeRecommendation[] {
  const allRecipes = listRecipes({
    cuisine: query?.cuisine,
    difficulty: query?.difficulty,
  });

  const activeInv = inventory.filter((item) => item.status === 'active');
  const invNames = activeInv.map((i) => i.name.trim());

  const recommendations: RecipeRecommendation[] = [];

  for (const recipe of allRecipes) {
    // 常规推荐列表绝不混入任何历史生成的 AI 菜谱，100% 只来自于严谨量化、真实审核的固定菜谱库
    if (recipe.id.startsWith('ai-recipe-')) {
      continue;
    }

    if (query?.max_cook_time && (recipe.cook_time + recipe.prep_time) > query.max_cook_time) {
      continue;
    }

    const matchedDetails: MatchedIngredientDetail[] = [];
    const missingIngredients: RecipeIngredient[] = [];
    let urgencyScoreBoost = 0;

    for (const rIng of recipe.ingredients) {
      // Find matching inventory item
      const matchedInv = activeInv.find((inv) => isIngredientMatch(inv.name, rIng.name));

      if (matchedInv) {
        matchedDetails.push({
          recipe_ingredient: rIng.name,
          inventory_item_id: matchedInv.id,
          inventory_name: matchedInv.name,
          urgency_level: matchedInv.urgency_level || 'green',
          days_remaining: matchedInv.days_remaining ?? 3,
        });

        // Urgency boost calculation:
        // red: expiring <= 0 days -> huge bonus +15
        // yellow: 1-2 days -> +8
        // green: +2
        if (matchedInv.urgency_level === 'red') {
          urgencyScoreBoost += 15;
        } else if (matchedInv.urgency_level === 'yellow') {
          urgencyScoreBoost += 8;
        } else {
          urgencyScoreBoost += 2;
        }
      } else {
        missingIngredients.push(rIng);
      }
    }

    // Required ingredients count
    const totalRecipeIngredients = recipe.ingredients.length;
    if (totalRecipeIngredients === 0) continue;

    const matchedCount = matchedDetails.length;
    const matchRate = Math.round((matchedCount / totalRecipeIngredients) * 100) / 100;

    // Jaccard Overlap:
    // Set A = inventory names, Set B = recipe ingredient names
    // |A ∩ B| = matchedCount
    // |A ∪ B| = invNames.length + totalRecipeIngredients - matchedCount
    const unionCount = Math.max(1, invNames.length + totalRecipeIngredients - matchedCount);
    const jaccard = matchedCount / unionCount;

    // Final recommendation score (0 - 100 scale):
    // 50% on recipe ingredient coverage (matchRate * 50)
    // 25% on Jaccard overlap (jaccard * 25)
    // 25% on urgency boost (capped at 25)
    const normalizedUrgency = Math.min(25, urgencyScoreBoost);
    const rawScore = (matchRate * 50) + (jaccard * 25) + normalizedUrgency;
    const score = Math.round(rawScore * 10) / 10;

    recommendations.push({
      ...recipe,
      score,
      match_rate: matchRate,
      matched_ingredients: matchedDetails,
      missing_ingredients: missingIngredients,
      urgency_boost: normalizedUrgency,
    });
  }

  // Sort descending by score, then by match_rate, then cook_time
  recommendations.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.match_rate !== a.match_rate) return b.match_rate - a.match_rate;
    return a.cook_time - b.cook_time;
  });

  const limit = query?.limit || 10;
  return recommendations.slice(0, limit);
}

/**
 * 调用本地 CPA 大模型，根据用户冰箱现有食材一次性设计多道菜谱
 *
 * 单次请求内让模型返回菜谱数组，比循环请求多次更省时间与额度。
 *
 * @param userId     发起生成的用户 ID，AI 菜谱归其所有（私有）
 * @param inventory  用户当前库存
 * @param preference 口味偏好（可选）
 * @param count      期望生成的菜谱数量，默认 3
 * @returns 生成成功并已入库的菜谱列表；失败时返回空数组
 */
export async function generateAiRecipes(
  userId: string,
  inventory: InventoryItem[],
  preference?: string,
  count: number = 3
): Promise<RecipeRecommendation[]> {
  const activeItems = inventory.filter((i) => i.status === 'active');
  if (activeItems.length === 0) return [];

  const ingredientsListStr = activeItems
    .map((i) => `${i.name} (数量:${i.quantity}, 剩余保质期:${i.days_remaining ?? 3}天)`)
    .join('、');

  const systemPrompt = `你是一位精通家庭中西烹饪的高级行政总厨。
根据用户冰箱中【实际现有的食材】，设计 ${count} 道各具特色、实操性强、营养搭配合理的家庭菜谱。
要求：
1. 尽可能充分利用手头的食材，可允许使用普通家庭常备调料（油、盐、生抽、糖、黑胡椒等）。
2. 这 ${count} 道菜谱之间必须有明显区别：烹饪方式（炒/蒸/煮/炖/凉拌/沙拉轻食）、口味风格、菜系都不应重复。
3. 必须优先消耗保质期告急的食材。
4. 必须以绝对纯净的 JSON 格式输出，不要输出任何 Markdown 格式或额外解释说明。

JSON 格式必须完全严格匹配以下结构：
{
  "recipes": [
    {
      "name": "菜谱名称(如：香蕉燕麦三文鱼轻食碗)",
      "category": "菜谱分类(家常菜/海鲜水产/轻食沙拉/快手早餐)",
      "cuisine": "菜系风格(中餐/西餐轻食/创意融合)",
      "difficulty": "简单/中等/困难",
      "prep_time": 准备时间分钟数(数字),
      "cook_time": 烹饪时间分钟数(数字),
      "servings": 建议食用人数(数字),
      "ingredients": [
        {"name": "食材名", "amount": "分量", "required": true或false}
      ],
      "instructions": [
        "第一步详细步骤...",
        "第二步详细步骤..."
      ],
      "tips": "主厨贴心烹饪小技巧与保存建议"
    }
  ]
}
recipes 数组必须正好包含 ${count} 个元素。`;

  const userPrompt = `用户现有冰箱食材：【${ingredientsListStr}】。
${preference ? `用户口味与烹饪偏好要求：【${preference}】。` : ''}
请立即构思 ${count} 道最适宜消耗现有食材（特别是保质期告急食材）的美味菜谱！`;

  try {
    const response = await fetch(`${config.CPA_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.CPA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash-high',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // 一次要产出多道菜谱：适当提高温度增加差异度，并放宽输出长度上限
        temperature: 0.8,
        max_tokens: 4096,
      }),
      // 【修复 PER-04】上游如果挂起，必须能主动放弃，否则请求会一直等待直到超时断开
      signal: AbortSignal.timeout(config.CPA_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('[generateAiRecipes] CPA fetch failed:', response.statusText);
      return [];
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 去掉模型可能附带的 Markdown 代码围栏
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const rawRecipeData = JSON.parse(cleanJson);

    // 【修复 ARC-03】AI 返回内容必须先通过结构校验才能入库，
    // 否则一个字段类型异常就会让前端渲染直接崩溃（整页白屏）。
    // 这里顺带做结构归一化，兼容"模型只返回单个菜谱对象"或"直接返回数组"的意外情况。
    const normalized = Array.isArray(rawRecipeData)
      ? { recipes: rawRecipeData }
      : rawRecipeData?.recipes
        ? rawRecipeData
        : { recipes: [rawRecipeData] };

    const validated = AiRecipeBatchSchema.safeParse(normalized);
    if (!validated.success) {
      console.error('[generateAiRecipes] AI 返回结构不合法，已丢弃：', validated.error.issues);
      return [];
    }

    const now = new Date().toISOString();
    const stamp = Date.now();

    // 逐条补齐服务端负责的字段（唯一 id 与生成时间），并加上 AI 定制标识
    const newRecipes: Recipe[] = validated.data.recipes.slice(0, count).map((item, index) => ({
      id: `ai-recipe-${stamp}-${index + 1}`,
      name: `✨ AI定制 · ${item.name}`,
      category: item.category || '创意料理',
      cuisine: item.cuisine || '现代家庭料理',
      difficulty: item.difficulty || '简单',
      prep_time: Number(item.prep_time) || 5,
      cook_time: Number(item.cook_time) || 10,
      servings: Number(item.servings) || 1,
      ingredients: item.ingredients || [],
      instructions: item.instructions || [],
      tips: item.tips || 'AI主厨根据您冰箱现有食材量身定制。',
      image_url: selectRecipeImage(item.name, item.category || '创意料理', item.ingredients || []),
      created_at: now,
    }));

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO recipes (
        id, name, category, cuisine, difficulty, prep_time, cook_time,
        servings, ingredients, instructions, tips, image_url, created_at, owner_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 写入新菜谱 + 清理该用户的旧 AI 菜谱放在同一个事务里，保证要么全部成功、要么全部回滚
    db.transaction(() => {
      for (const recipe of newRecipes) {
        insertStmt.run(
          recipe.id,
          recipe.name,
          recipe.category,
          recipe.cuisine,
          recipe.difficulty,
          recipe.prep_time,
          recipe.cook_time,
          recipe.servings,
          JSON.stringify(recipe.ingredients),
          JSON.stringify(recipe.instructions),
          recipe.tips || '',
          recipe.image_url || '',
          now,
          userId
        );
      }

      // 【修复 NEW-02】数量上限改为「按用户」维度：
      // 旧实现是全局 50 条，多人使用时后生成的用户会把别人还在看的菜谱挤掉。
      // 现在每个用户各自保留最近 N 条，互不影响。
      db.prepare(`
        DELETE FROM recipes
        WHERE id LIKE 'ai-recipe-%' AND owner_id = ?
          AND id NOT IN (
            SELECT id FROM recipes
            WHERE id LIKE 'ai-recipe-%' AND owner_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          )
      `).run(userId, userId, MAX_AI_RECIPES);
    })();

    // 菜谱数据已变化，清空内存缓存，让后续请求读到最新的菜谱集合
    invalidateRecipeCache();

    // 计算每道菜谱与当前库存的匹配详情，供前端展示"已匹配 / 还需采购"标签
    return newRecipes.map((recipe, index) => {
      const matchedDetails: MatchedIngredientDetail[] = [];
      const missingIngredients: RecipeIngredient[] = [];

      for (const rIng of recipe.ingredients) {
        const matched = activeItems.find((inv) => isIngredientMatch(inv.name, rIng.name));
        if (matched) {
          matchedDetails.push({
            recipe_ingredient: rIng.name,
            inventory_item_id: matched.id,
            inventory_name: matched.name,
            urgency_level: matched.urgency_level || 'green',
            days_remaining: matched.days_remaining ?? 3,
          });
        } else {
          missingIngredients.push(rIng);
        }
      }

      return {
        ...recipe,
        // 依次递减，既保证 AI 菜谱整体排在固定菜谱之前，又让它们之间有稳定顺序
        score: 95 - index,
        // 匹配率按真实库存计算（旧实现硬编码为 0.9，展示的数字并不真实）
        match_rate:
          recipe.ingredients.length > 0
            ? Math.round((matchedDetails.length / recipe.ingredients.length) * 100) / 100
            : 0,
        matched_ingredients: matchedDetails,
        missing_ingredients: missingIngredients,
        urgency_boost: 25,
      };
    });
  } catch (err: any) {
    console.error('[generateAiRecipes] Exception:', err.message);
    return [];
  }
}

export function cookRecipe(
  userId: string,
  recipeId: string,
  options: CookRecipeRequest = { auto_consume_ingredients: true }
): { success: boolean; historyId: number; consumedCount: number; recipeName: string } {
  const recipe = getRecipeById(recipeId);
  if (!recipe) {
    throw new Error(`Recipe with id '${recipeId}' not found`);
  }

  // 【修复 NEW-01】AI 菜谱是私有内容：只能烹饪自己生成的菜谱，内置菜谱人人可用
  if (recipe.id.startsWith('ai-recipe-') && getRecipeOwnerId(recipeId) !== userId) {
    throw new Error(`Recipe with id '${recipeId}' not found`);
  }

  const activeInv = db
    .prepare("SELECT * FROM inventory_items WHERE user_id = ? AND status = 'active'")
    .all(userId) as any[];

  const consumedItemIds: number[] = [];
  const usedIngredientsSummary: string[] = [];

  for (const rIng of recipe.ingredients) {
    const matched = activeInv.find((inv) => isIngredientMatch(inv.name, rIng.name));
    if (matched && !consumedItemIds.includes(matched.id)) {
      consumedItemIds.push(matched.id);
      usedIngredientsSummary.push(`${matched.name} (${matched.quantity})`);
    }
  }

  const now = new Date().toISOString();

  // 【修复 ARC-10】扣减库存与写入烹饪历史必须原子完成：
  // 旧实现分两步执行，中途一旦出错就会出现"食材被扣了、却没有烹饪记录"的数据不一致。
  const runCookTransaction = db.transaction(() => {
    let consumed = 0;
    if (options.auto_consume_ingredients && consumedItemIds.length > 0) {
      consumed = markItemsAsConsumed(consumedItemIds, userId);
    }

    const info = db
      .prepare(`
        INSERT INTO cooking_history (user_id, recipe_id, recipe_name, cooked_at, ingredients_used, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        userId,
        recipe.id,
        recipe.name,
        now,
        JSON.stringify(usedIngredientsSummary),
        options.notes || ''
      );

    return { consumed, historyId: Number(info.lastInsertRowid) };
  });

  const { consumed: consumedCount, historyId } = runCookTransaction();

  return {
    success: true,
    historyId,
    consumedCount,
    recipeName: recipe.name,
  };
}

export function getCookingHistory(userId: string): any[] {
  const rows = db.prepare(`
    SELECT * FROM cooking_history
    WHERE user_id = ?
    ORDER BY cooked_at DESC
  `).all(userId);

  return rows.map((r: any) => ({
    ...r,
    ingredients_used: safeJsonParse<string[]>(r.ingredients_used, []),
  }));
}
