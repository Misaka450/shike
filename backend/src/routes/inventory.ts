import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { readJsonBody } from '../middleware/bodyLimit.js';
import {
  BatchAddInventorySchema,
  CreateInventoryItemInputSchema,
  UpdateInventoryItemSchema,
} from '../schemas/index.js';
import {
  batchAddInventory,
  deleteInventoryItem,
  getInventoryItemById,
  listActiveInventory,
  updateInventoryItem,
} from '../services/inventoryService.js';

export const inventoryRoute = new Hono<AppEnv>();

/**
 * 【安全修复 SEC-01】整个路由组统一挂载鉴权中间件。
 * 未携带有效会话令牌的请求，会在进入任何业务逻辑之前就被拦截返回 401，
 * 用户身份一律由服务端会话决定，不再读取 x-user-id 请求头或 user_id 查询参数。
 */
inventoryRoute.use('*', requireAuth);

// GET / - List all active inventory items with urgency calculations
inventoryRoute.get('/', (c) => {
  const userId = c.get('userId');
  const items = listActiveInventory(userId);

  // Group by urgency summary
  const summary = {
    total: items.length,
    red_urgent: items.filter((i) => i.urgency_level === 'red').length,
    yellow_warning: items.filter((i) => i.urgency_level === 'yellow').length,
    green_safe: items.filter((i) => i.urgency_level === 'green').length,
  };

  return c.json({
    success: true,
    data: {
      items,
      summary,
    },
  });
});

// GET /:id - Get specific inventory item
inventoryRoute.get('/:id', (c) => {
  const userId = c.get('userId');
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, code: 'INVALID_ID', error: '无效的 ID' }, 400);
  }

  const item = getInventoryItemById(id, userId);
  if (!item) {
    return c.json({ success: false, code: 'NOT_FOUND', error: '食材不存在' }, 404);
  }

  return c.json({ success: true, data: item });
});

// POST /batch - Batch add inventory items
inventoryRoute.post('/batch', async (c) => {
  const userId = c.get('userId');
  const rawBody = await readJsonBody(c);

  // Handle both { items: [...] } and direct array [...]
  const itemsData = Array.isArray(rawBody) ? { items: rawBody } : rawBody;
  const parsed = BatchAddInventorySchema.safeParse(itemsData);

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
    const inserted = batchAddInventory(parsed.data.items, userId);
    return c.json(
      {
        success: true,
        data: inserted,
        count: inserted.length,
      },
      201
    );
  } catch (err: unknown) {
    console.error('[POST /inventory/batch] 批量添加食材失败：', err);
    return c.json(
      { success: false, code: 'BATCH_ADD_FAILED', error: '批量添加食材失败，请稍后重试' },
      500
    );
  }
});

// POST / - Add single item
inventoryRoute.post('/', async (c) => {
  const userId = c.get('userId');
  const rawBody = await readJsonBody(c);
  const parsed = CreateInventoryItemInputSchema.safeParse(rawBody);

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
    const inserted = batchAddInventory([parsed.data], userId);
    return c.json(
      {
        success: true,
        data: inserted[0],
      },
      201
    );
  } catch (err: unknown) {
    console.error('[POST /inventory] 添加食材失败：', err);
    return c.json(
      { success: false, code: 'ADD_FAILED', error: '添加食材失败，请稍后重试' },
      500
    );
  }
});

// PATCH /:id - Update inventory item
inventoryRoute.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, code: 'INVALID_ID', error: '无效的 ID' }, 400);
  }

  const rawBody = await readJsonBody(c);
  const parsed = UpdateInventoryItemSchema.safeParse(rawBody);

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

  const updated = updateInventoryItem(id, parsed.data, userId);
  if (!updated) {
    return c.json({ success: false, code: 'NOT_FOUND', error: '食材不存在或无权限更新' }, 404);
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// DELETE /:id - Delete inventory item
inventoryRoute.delete('/:id', (c) => {
  const userId = c.get('userId');
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, code: 'INVALID_ID', error: '无效的 ID' }, 400);
  }

  const deleted = deleteInventoryItem(id, userId);
  if (!deleted) {
    return c.json({ success: false, code: 'NOT_FOUND', error: '食材未找到或已删除' }, 404);
  }

  return c.json({
    success: true,
    message: '食材已成功移除',
  });
});