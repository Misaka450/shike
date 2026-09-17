import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 使用内存数据库，避免单元测试污染本地数据文件
process.env.DB_PATH = ':memory:';

// 动态导入：保证 DB_PATH 在模块初始化前生效
const { deleteRecipe, RecipeError, getRecipeById, listRecipes, recommendRecipes, invalidateRecipeCache } = await import('../recipeService.js');
const { db } = await import('../../db/index.js');

function insertMockAiRecipe(id: string, name: string = '✨ AI定制 · 测试菜谱'): void {
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
    JSON.stringify([{ name: '西红柿', amount: '2个', required: true }]),
    JSON.stringify(['第一步', '第二步']),
    '小贴士',
    'https://example.com/test.jpg',
    new Date().toISOString()
  );
}

describe('deleteRecipe（删除 AI 菜谱业务逻辑）', () => {
  it('成功删除存在的 AI 菜谱，并刷新内存缓存', () => {
    const testId = `ai-recipe-test-${Date.now()}`;
    insertMockAiRecipe(testId, '✨ AI定制 · 可删除菜谱');

    // 预读一次，确保进入内存缓存
    const beforeList = listRecipes();
    assert.ok(beforeList.some((r) => r.id === testId));
    assert.ok(getRecipeById(testId) !== null);

    // 执行删除
    const result = deleteRecipe(testId);
    assert.equal(result, true);

    // 验证数据库查询返回 null
    assert.equal(getRecipeById(testId), null);

    // 验证全量列表已同步清空该菜谱（内存缓存已失效并重建）
    const afterList = listRecipes();
    assert.ok(!afterList.some((r) => r.id === testId));
  });

  it('禁止删除系统内置或非 AI 菜谱，严格返回 403 FORBIDDEN', () => {
    // 默认内置菜谱 recipe-tomato-egg
    const builtInId = 'recipe-tomato-egg';
    assert.ok(getRecipeById(builtInId) !== null);

    assert.throws(
      () => {
        deleteRecipe(builtInId);
      },
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN');
        assert.match(err.message, /仅允许删除 AI 定制菜谱/);
        return true;
      }
    );

    // 验证系统内置菜谱完好无损
    assert.ok(getRecipeById(builtInId) !== null);
  });

  it('禁止删除其它任意非 ai-recipe- 前缀的菜谱 ID', () => {
    const invalidIds = ['custom-recipe-1', 'how-to-cook-beef', '12345'];
    for (const id of invalidIds) {
      assert.throws(
        () => {
          deleteRecipe(id);
        },
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
    const nonExistentAiId = 'ai-recipe-non-existent-99999999';

    assert.throws(
      () => {
        deleteRecipe(nonExistentAiId);
      },
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'NOT_FOUND');
        assert.match(err.message, /菜谱不存在/);
        return true;
      }
    );
  });

  it('传入空字符串或空值时抛出 403 FORBIDDEN', () => {
    assert.throws(
      () => {
        deleteRecipe('');
      },
      (err: any) => {
        assert.ok(err instanceof RecipeError);
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN');
        return true;
      }
    );
  });

  it('即使数据库中存在 ai-recipe-，常规 recommendRecipes 也绝不会将其返回', () => {
    const aiRecipeId = `ai-recipe-rec-test-${Date.now()}`;
    insertMockAiRecipe(aiRecipeId, '✨ AI定制 · 绝密西红柿炒蛋');
    invalidateRecipeCache();

    const mockInventory = [
      {
        id: 101,
        user_id: 'guest_test',
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
    assert.ok(!recommendations.some((r) => r.id === aiRecipeId));
  });
});
