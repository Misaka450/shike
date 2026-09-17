import { Hono } from 'hono';
import { batchAddInventory } from '../services/inventoryService.js';
import { scanFridgeImage } from '../services/visionService.js';

export const visionRoute = new Hono();

// POST /fridge-scan - accepts multipart form-data with 'file' field or JSON with base64
visionRoute.post('/fridge-scan', async (c) => {
  const userId = c.req.header('x-user-id') || 'guest';
  const contentType = c.req.header('content-type') || '';

  let imageBuffer: Buffer | null = null;
  let mimeType = 'image/jpeg';
  let autoAdd = false;

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const file = body['file'] || body['image'];

    if (body['auto_add'] === 'true' || body['auto_add'] === '1') {
      autoAdd = true;
    }

    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      mimeType = file.type || 'image/jpeg';
    } else if (typeof file === 'string' && file.startsWith('data:')) {
      const matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBuffer = Buffer.from(matches[2], 'base64');
      }
    }
  } else if (contentType.includes('application/json')) {
    const json = (await c.req.json().catch(() => ({}))) as any;
    if (json.auto_add) autoAdd = true;

    if (json.image && typeof json.image === 'string') {
      if (json.image.startsWith('data:')) {
        const matches = json.image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          imageBuffer = Buffer.from(matches[2], 'base64');
        }
      } else {
        imageBuffer = Buffer.from(json.image, 'base64');
        if (json.mime_type) mimeType = json.mime_type;
      }
    }
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    return c.json(
      {
        success: false,
        error: '请上传有效的食材照片（支持 multipart "file" 字段或 base64 图片）',
      },
      400
    );
  }

  try {
    const scanResult = await scanFridgeImage(imageBuffer, mimeType);

    let addedItems = null;
    if (autoAdd && scanResult.items.length > 0) {
      addedItems = batchAddInventory(
        scanResult.items.map((item) => ({
          name: item.name,
          category: item.category,
          quantity: item.estimated_quantity,
          storage_location: item.storage_location,
          confidence: item.confidence,
          storage_days: item.recommended_storage_days,
        })),
        userId
      );
    }

    return c.json({
      success: true,
      data: {
        ...scanResult,
        added_to_inventory: addedItems,
      },
    });
  } catch (error: any) {
    console.error('[VisionRoute] Scan error:', error);
    return c.json(
      {
        success: false,
        error: error.message || '识别冰箱食材失败，请稍后重试',
      },
      500
    );
  }
});
