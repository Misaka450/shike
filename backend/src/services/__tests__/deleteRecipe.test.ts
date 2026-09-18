import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 使用内存数据库，避免单元测试污染本地数据文件
process.env.DB_PATH = ':memory:';

// 动态导入：保证 DB_PATH 在模块初始化前生效
const {
  deleteRecipe,
  RecipeError,
  getRecipeById,
  listRecipes,
  recommendRecipes,
  invalidateRecipeCache,
  isRecipeVisibleTo,
  initSeedRecipes,
} = await import('../recipeService.js');
const { db, runMigrations } = await import('../../db/index.js');

// 迁移与内置菜谱播种不再随模块 import 自动执行，测试需显式初始化一次
runMigrations();
initSeedRecipes();

const OWNER_A = 'usr_owner_a';
const OWNER_B = 'usr_owner_b';

/** 插入一条带归属的 AI 菜谱 */
function insertMockAiRecipe(
  id: string,
  ownerId: string,
  name: string = '✨ AI定制 · 测试菜谱'
): void {
  db.prepare(`
    INSERT OR REPLACE INTO recipes (
      id, name, category, cuisine, difficulty, prep_time, cook_time,
      servings, ingredients, instructions, tips, image_url, created_at, owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    '家常菜',
    '中餐',
    '简单',
    5,
    10,
    2,
    JSON.stringify([{ name: '西红柿', amount: '2个', required: true }]),
    JSON.stringify(['第一步', '第二步']),
    '小贴士',
    'https://example.com/test.jpg',
    new Date().toISOString(),
    ownerId
  );
}

describe('deleteRecipe（AI 菜谱归属与删除权限）', () => {
  it('菜谱生成者本人可以删除自己的 AI 菜谱', () => {
    const testId = `ai-recipe-own-a-${Date.now()}`;
    insertMockAiRecipe(testId, OWNER_A);

    const result = deleteRecipe(testId, OWNER_A);
    assert.equal(result, true);
    assert.equal(getRecipeById(testId), null);
  });

  it('禁止删除他人拥有的 AI 菜谱，并返回 404（不暴露菜谱归属）', () => {
    const testId = `ai-recipe-own-b-${Date.now()}`;
    insertMockAiRecipe(testId, OWNER_B);

    assert.throws(
      () => deleteRecipe(testId, OWNER_A),
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        // 关键：必须返回 404 而不是 403，避免调用者借此枚举他人菜谱是否存在
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'NOT_FOUND');
        return true;
      }
    );

    // 菜谱对原主人依然存在，没有被误删
    assert.ok(getRecipeById(testId) !== null);
  });

  it('禁止删除系统内置菜谱，严格返回 403 FORBIDDEN', () => {
    const builtInId = 'recipe-tomato-egg';
    assert.ok(getRecipeById(builtInId) !== null);

    assert.throws(
      () => deleteRecipe(builtInId, OWNER_A),
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN');
        assert.match(err.message, /仅允许删除 AI 定制菜谱/);
        return true;
      }
    );

    assert.ok(getRecipeById(builtInId) !== null);
  });

  it('禁止删除其它任意非 ai-recipe- 前缀的菜谱 ID', () => {
    const invalidIds = ['custom-recipe-1', 'how-to-cook-beef', '12345'];
    for (const id of invalidIds) {
      assert.throws(
        () => deleteRecipe(id, OWNER_A),
        (err: any) => {
          assert.ok(err instanceof RecipeError);
          assert.equal(err.statusCode, 403);
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    }
  });

  it('删除不存在的 AI 菜谱时抛出 404 NOT_FOUND', () => {
    assert.throws(
      () => deleteRecipe('ai-recipe-non-existent-99999999', OWNER_A),
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'NOT_FOUND');
        return true;
      }
    );
  });

  it('传入空字符串或空值时抛出 403 FORBIDDEN', () => {
    assert.throws(
      () => deleteRecipe('', OWNER_A),
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });
});

describe('AI 菜谱可见性隔离（isRecipeVisibleTo / listRecipes）', () => {
  it('内置菜谱对所有用户可见', () => {
    assert.equal(isRecipeVisibleTo('recipe-tomato-egg', OWNER_A), true);
    assert.equal(isRecipeVisibleTo('recipe-tomato-egg', OWNER_B), true);
  });

  it('AI 菜谱仅生成者可见，对他人返回不可见', () => {
    const testId = `ai-recipe-visibility-${Date.now()}`;
    insertMockAiRecipe(testId, OWNER_A);

    assert.equal(isRecipeVisibleTo(testId, OWNER_A), true);
    assert.equal(isRecipeVisibleTo(testId, OWNER_B), false);
  });

  it('不存在的菜谱对任何人都不可见', () => {
    assert.equal(isRecipeVisibleTo('ai-recipe-not-exists', OWNER_A), false);
  });

  it('用户 A 的菜谱列表只包含内置菜谱与 A 自己的 AI 菜谱，不含 B 的', () => {
    invalidateRecipeCache();
    const idA = `ai-recipe-list-a-${Date.now()}`;
    const idB = `ai-recipe-list-b-${Date.now()}`;
    insertMockAiRecipe(idA, OWNER_A, '✨ AI定制 · A的私房菜');
    insertMockAiRecipe(idB, OWNER_B, '✨ AI定制 · B的私房菜');

    const listA = listRecipes(undefined, OWNER_A);
    assert.ok(listA.some((r) => r.id === idA), 'A 应能看到自己的 AI 菜谱');
    assert.ok(!listA.some((r) => r.id === idB), 'A 不应看到 B 的 AI 菜谱');
    assert.ok(listA.some((r) => r.id === 'recipe-tomato-egg'), 'A 应能看到内置菜谱');

    const listB = listRecipes(undefined, OWNER_B);
    assert.ok(listB.some((r) => r.id === idB), 'B 应能看到自己的 AI 菜谱');
    assert.ok(!listB.some((r) => r.id === idA), 'B 不应看到 A 的 AI 菜谱');
  });

  it('不指定用户时列表只包含内置菜谱', () => {
    invalidateRecipeCache();
    const idA = `ai-recipe-internal-${Date.now()}`;
    insertMockAiRecipe(idA, OWNER_A);

    const internalList = listRecipes();
    assert.ok(!internalList.some((r) => r.id.startsWith('ai-recipe-')));
  });

  it('即使数据库中存在 ai-recipe-，常规 recommendRecipes 也绝不会将其返回', () => {
    const aiRecipeId = `ai-recipe-rec-test-${Date.now()}`;
    insertMockAiRecipe(aiRecipeId, OWNER_A, '✨ AI定制 · 绝密西红柿炒蛋');
    invalidateRecipeCache();

    const mockInventory = [
      {
        id: 101,
        user_id: OWNER_A,
        name: '西红柿',
        category: '蔬菜',
        quantity: '2个',
        unit: '',
        storage_location: '冷藏',
        confidence: 1,
        storage_days: 3,
        expiry_date: '2099-12-31',
        added_at: '2026-09-17T00:00:00.000Z',
        status: 'active' as const,
        updated_at: '2026-09-17T00:00:00.000Z',
        urgency_level: 'red' as const,
        days_remaining: 0,
      },
    ];

    const recommendations = recommendRecipes(mockInventory);
    assert.ok(recommendations.length > 0);
    for (const rec of recommendations) {
      assert.ok(
        !rec.id.startsWith('ai-recipe-'),
        `常规推荐列表绝不能包含 AI 菜谱: ${rec.id}`
      );
    }
  });
});