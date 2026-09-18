/**
 * 请求体体积限制（全局兜底防护）
 *
 * 仅靠 Content-Length 预检无法防住 chunked 传输编码（不声明长度的请求体），
 * 因此这里把请求体包装成「计数流」：无论客户端以何种方式传输，
 * 累计字节数一旦超过上限就立即中断读取，保证内存不会被超大请求打爆。
 */

import type { Context } from 'hono';

/**
 * 读取 JSON 请求体
 *
 * 各路由此前统一写成 `await c.req.json().catch(() => ({}))`：
 * JSON 非法时回退空对象是合理的（前端未传 body 时不应报 500），
 * 但它同时会把「请求体超限」的错误也一并吞掉，
 * 用户最终收到的是 400「请输入用户名」而不是 413「请求体过大」。
 * 这里保留宽容行为，只把超限错误继续往上抛给 app.onError 映射成 413。
 */
export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (err) {
    if (isBodyLimitError(err)) {
      throw err;
    }
    return {};
  }
}

/** 请求体超过全局上限时抛出的错误，app.onError 会将其映射为 413 */
export class BodyLimitError extends Error {
  constructor(maxBytes: number) {
    super(`BODY_LIMIT_EXCEEDED: request body exceeded ${maxBytes} bytes`);
    this.name = 'BodyLimitError';
  }
}

/**
 * 判断某个错误（或其 cause）是否为体积超限错误
 * Hono / undici 在解析请求体时可能把底层流错误包装一层再抛出，因此也要检查 err.cause
 */
export function isBodyLimitError(err: unknown): boolean {
  if (err instanceof BodyLimitError) return true;
  if (err !== null && typeof err === 'object' && 'cause' in err) {
    return err.cause instanceof BodyLimitError;
  }
  return false;
}

/** 生成统一的 413 响应 */
export function bodyLimitResponse(maxBytes: number): Response {
  return Response.json(
    {
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: `请求体过大，请控制在 ${Math.round(maxBytes / 1024 / 1024)}MB 以内`,
    },
    { status: 413 },
  );
}

/**
 * 把原始请求体包装为带字节计数的流
 *
 * 使用 pull 驱动（而不是在 start 里一口气读完），
 * 让内部队列的背压机制仍然生效，正常请求的内存占用不会因包装而放大；
 * 超限时 error 掉下游流并 cancel 上游读取，尽快释放连接资源。
 */
export function limitRequestBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let received = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > maxBytes) {
          controller.error(new BodyLimitError(maxBytes));
          // 中断上游读取，避免剩余字节继续占用带宽与内存
          await reader.cancel().catch(() => undefined);
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => undefined);
    },
  });
}
