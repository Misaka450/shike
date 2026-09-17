import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { checkRateLimit, getClientIp } from '../services/authSecurity.js';
import { CookRecipeRequestSchema, RecommendQuerySchema } from '../schemas/index.js';
import { listActiveInventory } from '../services/inventoryService.js';
import {
  cookRecipe,
  deleteRecipe,
  generateAiRecipes,
  getCookingHistory,
  getRecipeById,
  listRecipes,
  recommendRecipes,
  RecipeError,
} from '../services/recipeService.js';

export const recipesRoute = new Hono<AppEnv>();

// 【安全修复 SEC-01】路由组统一鉴权，身份只从服务端会话读取
recipesRoute.use('*', requireAuth);

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
  const userId = c.get('userId');
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
    return c.json({ success: false, code: 'NOT_FOUND', error: '菜谱不存在' }, 404);
  }
  return c.json({
    success: true,
    data: recipe,
  });
});

// DELETE /:id - Delete AI recipe
recipesRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  try {
    deleteRecipe(id);
    return c.json({
      success: true,
      message: '菜谱已删除',
    });
  } catch (err: unknown) {
    if (err instanceof RecipeError) {
      return c.json(
        {
          success: false,
          code: err.code,
          error: err.message,
        },
        err.statusCode as any
      );
    }
    console.error('[DELETE /recipes/:id] 删除菜谱失败：', err);
    return c.json(
      {
        success: false,
        code: 'DELETE_FAILED',
        error: '删除菜谱失败，请稍后重试',
      },
      500
    );
  }
});

/**
 * POST /recommend - 基于当前库存推荐菜谱（纯本地计算）
 *
 * 【性能修复 PER-01】这里不再自动调用大模型。
 * 旧实现在"最高分为 0"时会顺带请求 AI，而前端每次刷新页面都会调用本接口，
 * 等于每刷新一次就可能产生一次模型调用（慢、且容易被刷爆额度）。
 * AI 定制改为独立的 POST /ai-generate 接口，由用户显式点击触发。
 */
recipesRoute.post('/recommend', async (c) => {
  const userId = c.get('userId');
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
        code: 'VALIDATION_FAILED',
        error: '推荐参数无效',
        details: parsed.error.issues,
      },
      400
    );
  }

  const inventory = listActiveInventory(userId);
  const recommendations = recommendRecipes(inventory, parsed.data);

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

/**
 * POST /ai-generate - 请求 AI 大厨根据现有食材现场设计菜谱
 * 由用户显式点击「AI 菜谱」按钮触发，默认一次生成 3 道，并做了频率限制。
 */
recipesRoute.post('/ai-generate', async (c) => {
  const userId = c.get('userId');

  const rawBody = await c.req.json().catch(() => ({}));

  // 【修复 ARC-09】统一参数名：以前前端传 preferences、后端读 preference，导致用户偏好从未生效。
  // 现在两种写法都接受，并限制长度，避免超长内容带进提示词。
  const rawPreference = rawBody?.preference ?? rawBody?.preferences;
  const preference =
    typeof rawPreference === 'string' ? rawPreference.trim().slice(0, 200) : undefined;

  // 生成数量：默认 3 道，允许 1-5 道，防止被滥用
  const requestedCount = Number(rawBody?.count);
  const count = Number.isFinite(requestedCount)
    ? Math.min(5, Math.max(1, Math.trunc(requestedCount)))
    : 3;

  const inventory = listActiveInventory(userId);
  if (inventory.length === 0) {
    // 冰箱为空属于用户输入问题，不消耗限流额度（否则会白白占掉一次生成机会）
    return c.json(
      { success: false, code: 'INVENTORY_EMPTY', error: '冰箱还是空的，先录入一些食材吧' },
      400
    );
  }

  // 限流：采用用户 + IP 双重维度（SEC-07）
  // - 用户维度（3 次/分钟）：保证每个人的正常使用体验，同网络下不会互相挤占额度
  // - IP 维度（10 次/分钟）：防止批量创建访客会话绕过用户维度限制
  // 位置放在各项本地校验之后，保证只有真正要调用模型时才计数
  const userRate = checkRateLimit(`ai-recipe:user:${userId}`, 3, 60 * 1000);
  const ipRate = checkRateLimit(`ai-recipe:ip:${getClientIp(c)}`, 10, 60 * 1000);
  const blocked = !userRate.allowed ? userRate : !ipRate.allowed ? ipRate : null;

  if (blocked) {
    return c.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        error: `AI 大厨还在忙，请 ${blocked.retryAfterSeconds} 秒后再试`,
      },
      429
    );
  }

  try {
    const aiRecipes = await generateAiRecipes(inventory, preference, count);
    if (aiRecipes.length === 0) {
      return c.json(
        { success: false, code: 'AI_GENERATION_FAILED', error: 'AI 大厨暂时无法提供服务，请稍后重试' },
        502
      );
    }
    return c.json({
      success: true,
      data: {
        recipes: aiRecipes,
        count: aiRecipes.length,
      },
    });
  } catch (err: unknown) {
    console.error('[POST /recipes/ai-generate] AI 菜谱生成失败：', err);
    return c.json(
      { success: false, code: 'AI_GENERATION_FAILED', error: 'AI 菜谱定制失败，请稍后重试' },
      500
    );
  }
});

// POST /:id/cook - Cook recipe and update inventory
recipesRoute.post('/:id/cook', async (c) => {
  const userId = c.get('userId');
  const recipeId = c.req.param('id');
  const rawBody = await c.req.json().catch(() => ({}));

  const parsed = CookRecipeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        code: 'VALIDATION_FAILED',
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '记录烹饪失败';
    // 菜谱不存在属于用户输入问题，返回 404 而非 500
    if (message.includes('not found')) {
      return c.json({ success: false, code: 'NOT_FOUND', error: '菜谱不存在' }, 404);
    }
    console.error('[POST /recipes/:id/cook] 记录烹饪失败：', err);
    return c.json({ success: false, code: 'COOK_FAILED', error: '记录烹饪失败，请稍后重试' }, 500);
  }
});