import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InventoryItem } from '../../schemas/index.js';

// 使用内存数据库，避免单元测试污染本地数据文件
process.env.DB_PATH = ':memory:';

// 动态导入：保证 DB_PATH 在模块初始化前生效
const { recommendRecipes, invalidateRecipeCache } = await import('../recipeService.js');
const { db } = await import('../../db/index.js');

function insertMockAiRecipe(
  id: string,
  name: string,
  ingredients: Array<{ name: string; amount: string; required: boolean }>
): void {
  db.prepare(`
    INSERT OR REPLACE INTO recipes (
      id, name, category, cuisine, difficulty, prep_time, cook_time,
      servings, ingredients, instructions, tips, image_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    '家常菜',
    '中餐',
    '简单',
    5,
    10,
    2,
    JSON.stringify(ingredients),
    JSON.stringify(['步骤一', '步骤二']),
    '小贴士',
    'https://example.com/test.jpg',
    new Date().toISOString()
  );
}

function makeInventoryItem(
  name: string,
  options?: { urgency_level?: 'green' | 'yellow' | 'red'; days_remaining?: number }
): InventoryItem {
  return {
    id: Math.floor(Math.random() * 100000) + 1,
    user_id: 'test_user',
    name,
    category: '食材',
    quantity: '2个',
    unit: '',
    storage_location: '冷藏',
    confidence: 1,
    storage_days: 3,
    expiry_date: '2099-12-31',
    added_at: '2026-09-17T00:00:00.000Z',
    status: 'active',
    updated_at: '2026-09-17T00:00:00.000Z',
    urgency_level: options?.urgency_level || 'green',
    days_remaining: options?.days_remaining ?? 5,
  };
}

describe('recommendRecipes（常规推荐引擎过滤 AI 菜谱）', () => {
  it('即使数据库中存在 ai-recipe-，常规 recommendRecipes 也绝不会将其返回', () => {
    // 插入若干条高匹配度的 AI 菜谱
    const aiRecipe1 = `ai-recipe-${Date.now()}-1`;
    const aiRecipe2 = `ai-recipe-${Date.now()}-2`;
    const aiRecipe3 = `ai-recipe-${Date.now()}-3`;

    insertMockAiRecipe(aiRecipe1, '✨ AI定制 · 番茄炒蛋改良版', [
      { name: '西红柿', amount: '2个', required: true },
      { name: '鸡蛋', amount: '3个', required: true },
    ]);
    insertMockAiRecipe(aiRecipe2, '✨ AI定制 · 蒜泥黄瓜轻食', [
      { name: '黄瓜', amount: '2根', required: true },
      { name: '大蒜', amount: '4瓣', required: true },
    ]);
    insertMockAiRecipe(aiRecipe3, 'ai-recipe-custom-meat', [
      { name: '猪里脊', amount: '250g', required: true },
    ]);

    // 刷新内存缓存，使插入的数据对 getAllRecipes 生效
    invalidateRecipeCache();

    // 构造高匹配度库存（同时匹配固定菜谱和 AI 菜谱）
    const inventory: InventoryItem[] = [
      makeInventoryItem('西红柿', { urgency_level: 'red', days_remaining: 0 }),
      makeInventoryItem('鸡蛋', { urgency_level: 'yellow', days_remaining: 1 }),
      makeInventoryItem('黄瓜'),
      makeInventoryItem('大蒜'),
      makeInventoryItem('猪里脊'),
    ];

    // 调用常规推荐
    const recommendations = recommendRecipes(inventory, { limit: 50 });

    // 验证返回了常规菜谱
    assert.ok(recommendations.length > 0, '常规推荐结果不应为空');

    // 核心断言：返回结果中 100% 不包含任何以 'ai-recipe-' 开头的菜谱
    for (const item of recommendations) {
      assert.ok(
        !item.id.startsWith('ai-recipe-'),
        `常规推荐列表中严禁混入 AI 菜谱，但发现了: id=${item.id}, name=${item.name}`
      );
    }

    // 明确确认刚刚插入的 AI 菜谱 id 不在推荐列表中
    assert.equal(recommendations.some((r) => r.id === aiRecipe1), false);
    assert.equal(recommendations.some((r) => r.id === aiRecipe2), false);
    assert.equal(recommendations.some((r) => r.id === aiRecipe3), false);
  });

  it('在不同查询参数（菜系、难度、烹饪时间）过滤下，AI 菜谱依然被完全隔离', () => {
    const aiRecipeCuisine = `ai-recipe-川菜-${Date.now()}`;
    insertMockAiRecipe(aiRecipeCuisine, '✨ AI定制 · 麻婆豆腐川式微辣', [
      { name: '嫩豆腐', amount: '1块', required: true },
      { name: '牛肉末', amount: '80g', required: true },
    ]);
    invalidateRecipeCache();

    const inventory: InventoryItem[] = [
      makeInventoryItem('嫩豆腐'),
      makeInventoryItem('牛肉末'),
    ];

    const results = recommendRecipes(inventory, { limit: 10, cuisine: '中餐', difficulty: '中等' });

    for (const item of results) {
      assert.ok(
        !item.id.startsWith('ai-recipe-'),
        `带过滤条件时常规推荐依然不得包含 AI 菜谱: id=${item.id}`
      );
    }
    assert.equal(results.some((r) => r.id === aiRecipeCuisine), false);
  });
});
