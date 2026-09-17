import { db } from '../db/index.js';
import {
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

// Synonyms dictionary for Chinese ingredients
const SYNONYM_GROUPS: string[][] = [
  ['西红柿', '番茄'],
  ['土豆', '马铃薯', '洋芋'],
  ['青椒', '尖椒', '辣椒', '菜椒', '彩椒', '杭椒'],
  ['猪肉', '五花肉', '里脊肉', '猪里脊', '猪肉末', '肉丝', '瘦肉', '肉末', '肉丸', '猪肉馅'],
  ['排骨', '小排', '肋排', '猪排骨', '肉排', '猪小排', '精排'],
  ['牛肉', '牛腩', '肥牛', '牛肉末', '牛肉片', '牛排', '牛柳', '牛里脊'],
  ['鸡肉', '鸡翅', '鸡中翅', '鸡腿', '鸡胸肉', '鸡块', '鸡丁'],
  ['鱼肉', '鱼片', '鲜鱼', '鲈鱼', '草鱼', '鳕鱼', '龙利鱼', '巴沙鱼', '黑鱼', '鲫鱼'],
  ['三文鱼', '三文鱼片', '大西洋鲑'],
  ['虾', '大虾', '基围虾', '鲜虾', '虾仁', '青虾'],
  ['蛤蜊', '花蛤', '扇贝', '花甲', '文蛤', '贝类', '蛤蜊肉'],
  ['茄子', '长茄', '圆茄', '紫茄子', '紫茄', '长条茄子'],
  ['菌菇', '香菇', '金针菇', '杏鲍菇', '平菇', '口蘑', '白玉菇', '海鲜菇', '蘑菇', '蟹味菇'],
  ['绿叶蔬菜', '绿叶菜', '生菜', '油麦菜', '菠菜', '空心菜', '娃娃菜', '上海青', '青菜', '小油菜', '油菜'],
  ['豆角', '四季豆', '扁豆', '豇豆', '架豆', '油豆角'],
  ['蒜苔', '蒜薹', '蒜苗', '青蒜'],
  ['洋葱', '紫洋葱', '圆葱', '洋葱碎', '白洋葱'],
  ['豆腐', '嫩豆腐', '老豆腐', '内酯豆腐', '水豆腐'],
  ['豆制品', '千张', '豆腐皮', '豆皮', '豆泡', '油豆腐', '腐竹', '豆干'],
  ['香肠', '腊肠', '腊肉', '广味香肠', '川味香肠', '广式腊肠'],
  ['米饭', '大米', '剩米饭', '冷饭', '白饭', '米粒', '白米饭'],
  ['面条', '挂面', '鲜面', '拉面', '手擀面', '切面', '挂面条'],
  ['皮蛋', '松花蛋', '变蛋'],
  ['丝瓜', '水瓜'],
  ['冬瓜'],
  ['山药', '淮山', '铁棍山药'],
  ['玉米', '甜玉米', '玉米粒', '水果玉米'],
  ['香蕉', '熟香蕉'],
  ['苹果', '红富士'],
  ['面包', '吐司', '方包'],
  ['酸奶', '优酪乳'],
  ['牛奶', '纯牛奶', '鲜牛奶'],
  ['葱', '大葱', '小葱', '香葱', '青葱', '葱花'],
  ['姜', '生姜', '老姜', '姜丝', '姜末', '姜片'],
  ['蒜', '大蒜', '蒜瓣', '蒜蓉', '蒜头'],
  ['木耳', '黑木耳'],
  ['黄瓜', '青瓜'],
  ['胡萝卜', '红萝卜'],
  ['白菜', '大白菜', '包菜', '圆白菜', '卷心菜'],
];

export function isIngredientMatch(invName: string, recName: string): boolean {
  const iNorm = invName.trim().toLowerCase();
  const rNorm = recName.trim().toLowerCase();

  if (iNorm === rNorm) return true;
  if (iNorm.includes(rNorm) || rNorm.includes(iNorm)) return true;

  for (const group of SYNONYM_GROUPS) {
    const iInGroup = group.some((g) => iNorm.includes(g) || g.includes(iNorm));
    const rInGroup = group.some((g) => rNorm.includes(g) || g.includes(rNorm));
    if (iInGroup && rInGroup) return true;
  }

  return false;
}

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
    image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
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
    image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',
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
    image_url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',
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
    image_url: 'https://images.unsplash.com/photo-1584270357187-e231122a6aa5?w=500',
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
    image_url: 'https://images.unsplash.com/photo-1527477321055-436158a2b00d?w=500',
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
    ingredients: typeof row.ingredients === 'string' ? JSON.parse(row.ingredients) : row.ingredients,
    instructions: typeof row.instructions === 'string' ? JSON.parse(row.instructions) : row.instructions,
    tips: row.tips || '',
    image_url: row.image_url || '',
    created_at: row.created_at,
  };
}

export function listRecipes(filters?: { cuisine?: string; difficulty?: string }): Recipe[] {
  let query = 'SELECT * FROM recipes WHERE 1=1';
  const params: any[] = [];

  if (filters?.cuisine) {
    query += ' AND cuisine = ?';
    params.push(filters.cuisine);
  }
  if (filters?.difficulty) {
    query += ' AND difficulty = ?';
    params.push(filters.difficulty);
  }

  query += ' ORDER BY name ASC';
  const rows = db.prepare(query).all(...params);
  return rows.map(rowToRecipe);
}

export function getRecipeById(id: string): Recipe | null {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  return row ? rowToRecipe(row) : null;
}

export function recommendRecipes(
  inventory: InventoryItem[],
  query?: RecommendQuery
): RecipeRecommendation[] {
  const allRecipes = listRecipes({
    cuisine: query?.cuisine,
    difficulty: query?.difficulty,
  });

  const activeInv = inventory.filter((item) => item.status === 'active');
  const invNames = activeInv.map((i) => i.name.trim());

  const recommendations: RecipeRecommendation[] = [];

  for (const recipe of allRecipes) {
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
 * Call Local CPA LLM to dynamically generate a bespoke home recipe
 * based on user's active inventory items
 */
export async function generateAiRecipe(
  inventory: InventoryItem[],
  preference?: string
): Promise<RecipeRecommendation | null> {
  const activeItems = inventory.filter((i) => i.status === 'active');
  if (activeItems.length === 0) return null;

  const ingredientsListStr = activeItems
    .map((i) => `${i.name} (数量:${i.quantity}, 剩余保质期:${i.days_remaining ?? 3}天)`)
    .join('、');

  const systemPrompt = `你是一位精通家庭中西烹饪的高级行政总厨。
根据用户冰箱中【实际现有的食材】，设计一道极具实操性、营养搭配合理的家庭菜谱。
要求：
1. 尽可能充分利用手头的食材，可允许使用普通家庭常备调料（油、盐、生抽、糖、黑胡椒等）。
2. 必须以绝对纯净的 JSON 格式输出，不要输出任何 Markdown 格式或额外解释说明。

JSON 格式规范必须完全严格匹配以下字段：
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
}`;

  const userPrompt = `用户现有冰箱食材：【${ingredientsListStr}】。
${preference ? `用户口味与烹饪偏好要求：【${preference}】。` : ''}
请立即构思一道最适宜消耗现有食材（特别是保质期告急食材）的美味菜谱！`;

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
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      console.error('[generateAiRecipe] CPA fetch failed:', response.statusText);
      return null;
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Clean markdown code fence if present
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const recipeData = JSON.parse(cleanJson);

    const recipeId = `ai-recipe-${Date.now()}`;
    const now = new Date().toISOString();

    const newRecipe: Recipe = {
      id: recipeId,
      name: `✨ AI定制 · ${recipeData.name}`,
      category: recipeData.category || '创意料理',
      cuisine: recipeData.cuisine || '现代家庭料理',
      difficulty: recipeData.difficulty || '简单',
      prep_time: Number(recipeData.prep_time) || 5,
      cook_time: Number(recipeData.cook_time) || 10,
      servings: Number(recipeData.servings) || 1,
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || [],
      tips: recipeData.tips || 'AI主厨根据您冰箱现有食材量身定制。',
      image_url: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
    };

    // Save AI recipe to database so it can be viewed and cooked!
    db.prepare(`
      INSERT OR REPLACE INTO recipes (
        id, name, category, cuisine, difficulty, prep_time, cook_time,
        servings, ingredients, instructions, tips, image_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newRecipe.id,
      newRecipe.name,
      newRecipe.category,
      newRecipe.cuisine,
      newRecipe.difficulty,
      newRecipe.prep_time,
      newRecipe.cook_time,
      newRecipe.servings,
      JSON.stringify(newRecipe.ingredients),
      JSON.stringify(newRecipe.instructions),
      newRecipe.tips || '',
      newRecipe.image_url || '',
      now
    );

    // Calculate match details
    const matchedDetails: MatchedIngredientDetail[] = [];
    const missingIngredients: RecipeIngredient[] = [];

    for (const rIng of newRecipe.ingredients) {
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
      ...newRecipe,
      score: 95.0, // High priority highlight
      match_rate: 0.9,
      matched_ingredients: matchedDetails,
      missing_ingredients: missingIngredients,
      urgency_boost: 25,
    };
  } catch (err: any) {
    console.error('[generateAiRecipe] Exception:', err.message);
    return null;
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

  let consumedCount = 0;
  if (options.auto_consume_ingredients && consumedItemIds.length > 0) {
    consumedCount = markItemsAsConsumed(consumedItemIds, userId);
  }

  const now = new Date().toISOString();
  const historyInsert = db.prepare(`
    INSERT INTO cooking_history (user_id, recipe_id, recipe_name, cooked_at, ingredients_used, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = historyInsert.run(
    userId,
    recipe.id,
    recipe.name,
    now,
    JSON.stringify(usedIngredientsSummary),
    options.notes || ''
  );

  return {
    success: true,
    historyId: Number(result.lastInsertRowid),
    consumedCount,
    recipeName: recipe.name,
  };
}

export function getCookingHistory(userId: string = 'guest'): any[] {
  const rows = db.prepare(`
    SELECT * FROM cooking_history
    WHERE user_id = ?
    ORDER BY cooked_at DESC
  `).all(userId);

  return rows.map((r: any) => ({
    ...r,
    ingredients_used: JSON.parse(r.ingredients_used || '[]'),
  }));
}
