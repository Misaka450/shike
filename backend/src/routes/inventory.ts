import { Hono } from 'hono';
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

export const inventoryRoute = new Hono();

// Helper to extract user_id
function getUserId(c: any): string {
  return c.req.header('x-user-id') || c.req.query('user_id') || 'guest';
}

// GET / - List all active inventory items with urgency calculations
inventoryRoute.get('/', (c) => {
  const userId = getUserId(c);
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
  const userId = getUserId(c);
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: '无效的 ID' }, 400);
  }

  const item = getInventoryItemById(id, userId);
  if (!item) {
    return c.json({ success: false, error: '食材不存在' }, 404);
  }

  return c.json({ success: true, data: item });
});

// POST /batch - Batch add inventory items
inventoryRoute.post('/batch', async (c) => {
  const userId = getUserId(c);
  const rawBody = await c.req.json().catch(() => ({}));

  // Handle both { items: [...] } and direct array [...]
  const itemsData = Array.isArray(rawBody) ? { items: rawBody } : rawBody;
  const parsed = BatchAddInventorySchema.safeParse(itemsData);

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
    const inserted = batchAddInventory(parsed.data.items, userId);
    return c.json(
      {
        success: true,
        data: inserted,
        count: inserted.length,
      },
      201
    );
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err.message || '批量添加食材失败',
      },
      500
    );
  }
});

// POST / - Add single item
inventoryRoute.post('/', async (c) => {
  const userId = getUserId(c);
  const rawBody = await c.req.json().catch(() => ({}));
  const parsed = CreateInventoryItemInputSchema.safeParse(rawBody);

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
    const inserted = batchAddInventory([parsed.data], userId);
    return c.json(
      {
        success: true,
        data: inserted[0],
      },
      201
    );
  } catch (err: any) {
    return c.json(
      {
        success: false,
        error: err.message || '添加食材失败',
      },
      500
    );
  }
});

// PATCH /:id - Update inventory item
inventoryRoute.patch('/:id', async (c) => {
  const userId = getUserId(c);
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: '无效的 ID' }, 400);
  }

  const rawBody = await c.req.json().catch(() => ({}));
  const parsed = UpdateInventoryItemSchema.safeParse(rawBody);

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

  const updated = updateInventoryItem(id, parsed.data, userId);
  if (!updated) {
    return c.json({ success: false, error: '食材不存在或无权限更新' }, 404);
  }

  return c.json({
    success: true,
    data: updated,
  });
});

// DELETE /:id - Delete inventory item
inventoryRoute.delete('/:id', (c) => {
  const userId = getUserId(c);
  const id = Number(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ success: false, error: '无效的 ID' }, 400);
  }

  const deleted = deleteInventoryItem(id, userId);
  if (!deleted) {
    return c.json({ success: false, error: '食材未找到或已删除' }, 404);
  }

  return c.json({
    success: true,
    message: '食材已成功移除',
  });
});
