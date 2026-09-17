import { Hono } from 'hono';
import { CookRecipeRequestSchema, RecommendQuerySchema } from '../schemas/index.js';
import { listActiveInventory } from '../services/inventoryService.js';
import {
  cookRecipe,
  getCookingHistory,
  getRecipeById,
  listRecipes,
  recommendRecipes,
  generateAiRecipe,
} from '../services/recipeService.js';

export const recipesRoute = new Hono();

function getUserId(c: any): string {
  return c.req.header('x-user-id') || c.req.query('user_id') || 'guest';
}

// GET / - List all recipes
recipesRoute.get('/', (c) => {
  const cuisine = c.req.query('cuisine');
  const difficulty = c.req.query('difficulty');
  const recipes = listRecipes({ cuisine, difficulty });
  return c.json({
    success: true,
    data: recipes,
    total: recipes.length,
  });
});

// GET /history - Get user's cooking history
recipesRoute.get('/history', (c) => {
  const userId = getUserId(c);
  const history = getCookingHistory(userId);
  return c.json({
    success: true,
    data: history,
  });
});

// GET /:id - Get recipe details
recipesRoute.get('/:id', (c) => {
  const id = c.req.param('id');
  const recipe = getRecipeById(id);
  if (!recipe) {
    return c.json({ success: false, error: '菜谱不存在' }, 404);
  }
  return c.json({
    success: true,
    data: recipe,
  });
});

// POST /recommend - Recommend recipes based on current fridge inventory
recipesRoute.post('/recommend', async (c) => {
  const userId = getUserId(c);
  const rawBody = await c.req.json().catch(() => ({}));
  const queryParams = c.req.query();

  const mergedParams = {
    limit: rawBody.limit ?? queryParams.limit ?? 10,
    cuisine: rawBody.cuisine ?? queryParams.cuisine,
    difficulty: rawBody.difficulty ?? queryParams.difficulty,
    max_cook_time: rawBody.max_cook_time ?? queryParams.max_cook_time,
  };

  const parsed = RecommendQuerySchema.safeParse(mergedParams);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: '推荐参数无效',
        details: parsed.error.issues,
      },
      400
    );
  }

  // Fetch current user inventory
  const inventory = listActiveInventory(userId);
  let recommendations = recommendRecipes(inventory, parsed.data);

  // If user has active inventory items, but none matched any fixed recipe (all match_rate === 0)
  // or highest score is 0, invoke Local AI Chef to dynamically generate a custom recipe!
  if (inventory.length > 0) {
    const highestScore = recommendations[0]?.score || 0;
    if (highestScore === 0) {
      try {
        const aiRecipe = await generateAiRecipe(inventory, rawBody.preference);
        if (aiRecipe) {
          recommendations = [aiRecipe, ...recommendations];
        }
      } catch (err: any) {
        console.error('[POST /recommend] AI recipe auto-generation error:', err.message);
      }
    }
  }

  return c.json({
    success: true,
    data: {
      recommendations,
      inventory_count: inventory.length,
      urgent_items_rescued: recommendations.reduce(
        (acc, r) => acc + r.matched_ingredients.filter((m) => m.urgency_level === 'red').length,
        0
      ),
    },
  });
});

// POST /:id/cook - Cook recipe and update inventory
recipesRoute.post('/:id/cook', async (c) => {
  const userId = getUserId(c);
  const recipeId = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));

  const parsed = CookRecipeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: '参数验证失败',
        details: parsed.error.issues,
      },
      400
    );
  }

  try {
    const result = cookRecipe(userId, recipeId, parsed.data);
    return c.json({
      success: true,
      message: `成功烹饪「${result.recipeName}」，已同步扣减消耗食材！`,
      data: result,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err.message || '记录烹饪失败',
      },
      500
    );
  }
});
