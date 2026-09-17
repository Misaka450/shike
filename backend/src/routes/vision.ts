import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { checkRateLimit, getClientIp } from '../services/authSecurity.js';
import { batchAddInventory } from '../services/inventoryService.js';
import { scanFridgeImage } from '../services/visionService.js';

export const visionRoute = new Hono<AppEnv>();

// 【安全修复 SEC-01】识图接口同样必须登录（访客会话亦可），身份完全由服务端会话决定
visionRoute.use('*', requireAuth);

/** 允许上传的图片类型白名单 */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * 通过文件头（魔数）识别图片真实格式
 * 【安全修复 SEC-05】不能只信任客户端声明的 MIME 类型，
 * 否则攻击者可以把任意文件改名成 .jpg 上传，白白消耗大模型额度。
 */
function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG：FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // PNG：89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // WebP：文件头为 "RIFF"、第 8-11 字节为 "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

// POST /fridge-scan - accepts multipart form-data with 'file' field or JSON with base64
visionRoute.post('/fridge-scan', async (c) => {
  const userId = c.get('userId');

  const contentType = c.req.header('content-type') || '';
  const maxBytes = config.MAX_UPLOAD_BYTES;

  // 预检：请求体明显超限时直接拒绝，避免超大内容被整体读进内存（SEC-05）
  // 这一步是零成本的（只读请求头），放在限流之前，保证被拒绝的大请求不消耗识别额度。
  // 这里给 2 倍冗余，因为 multipart 边界与 base64 编码都会让传输体积大于原始图片
  const declaredLength = Number(c.req.header('content-length') || 0);
  if (declaredLength > maxBytes * 2) {
    return c.json(
      {
        success: false,
        code: 'PAYLOAD_TOO_LARGE',
        error: `图片过大，请压缩到 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`,
      },
      413
    );
  }

  // 限流：识图会真实调用多模态大模型，必须防止被脚本批量刷取（SEC-07）
  // 采用用户 + IP 双重维度：用户维度保证正常使用体验，IP 维度防止批量注册访客绕过
  const userRate = checkRateLimit(`vision:user:${userId}`, 10, 60 * 1000);
  const ipRate = checkRateLimit(`vision:ip:${getClientIp(c)}`, 30, 60 * 1000);
  const blocked = !userRate.allowed ? userRate : !ipRate.allowed ? ipRate : null;

  if (blocked) {
    return c.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        error: `操作过于频繁，请 ${blocked.retryAfterSeconds} 秒后再试`,
      },
      429
    );
  }

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
      // 暂存客户端声明的类型，稍后以魔数识别结果为准
      if (file.type) mimeType = file.type;
    } else if (typeof file === 'string' && file.startsWith('data:')) {
      const matches = file.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        imageBuffer = Buffer.from(matches[2], 'base64');
      }
    }
  } else if (contentType.includes('application/json')) {
    const json = (await c.req.json().catch(() => ({}))) as {
      auto_add?: boolean;
      image?: string;
      mime_type?: string;
    };
    if (json.auto_add) autoAdd = true;

    if (json.image && typeof json.image === 'string') {
      // 解码前先按字符串长度拦截，避免为一个超大 base64 白白分配内存
      if (json.image.length > maxBytes * 1.4) {
        return c.json(
          {
            success: false,
            code: 'PAYLOAD_TOO_LARGE',
            error: `图片过大，请压缩到 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`,
          },
          413
        );
      }

      if (json.image.startsWith('data:')) {
        const matches = json.image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
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
        code: 'IMAGE_REQUIRED',
        error: '请上传有效的食材照片（支持 multipart "file" 字段或 base64 图片）',
      },
      400
    );
  }

  // 精确校验解码后的真实体积
  if (imageBuffer.length > maxBytes) {
    return c.json(
      {
        success: false,
        code: 'PAYLOAD_TOO_LARGE',
        error: `图片过大，请压缩到 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`,
      },
      413
    );
  }

  // 以文件头识别的真实格式为准，客户端声明的 MIME 只作为兜底
  const sniffed = sniffImageType(imageBuffer);
  if (!sniffed || !ALLOWED_MIME_TYPES.includes(sniffed)) {
    return c.json(
      {
        success: false,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        error: '仅支持 JPG / PNG / WebP 格式的图片',
      },
      415
    );
  }
  mimeType = sniffed;

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
  } catch (error: unknown) {
    // 内部细节只进服务端日志，对外返回通用提示（SEC-08）
    console.error('[VisionRoute] 识图失败：', error);
    return c.json(
      { success: false, code: 'SCAN_FAILED', error: '识别冰箱食材失败，请稍后重试' },
      500
    );
  }
});