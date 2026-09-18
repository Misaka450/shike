import {
  CookResult,
  FridgeScanResult,
  InventoryItem,
  InventorySummary,
  RecipeRecommendation,
  RecommendationResult,
  UserProfile,
} from './types';

const API_BASE =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8081';

/** 服务端签发的会话令牌存储键 */
const TOKEN_KEY = 'shike_token';
/** 当前用户资料缓存键（仅用于首屏渲染，身份的权威来源永远在服务端） */
const PROFILE_KEY = 'shike_user_profile';
/** 老版本前端在本地自行生成的用户 ID，用于把历史数据一次性迁移到新会话 */
const LEGACY_USER_ID_KEY = 'shike_user_id';

// ---------------- 会话管理 ----------------

/** 读取本地保存的会话令牌 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** 保存登录结果：令牌 + 用户资料，并清理老版本遗留的本地用户 ID */
function persistSession(data: UserProfile & { token: string }): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
  // 【重要】身份已由服务端会话接管，移除老版本的本地 user_id，避免与新机制混淆
  localStorage.removeItem(LEGACY_USER_ID_KEY);
}

/** 读取本地缓存的用户资料（同步，仅用于首屏渲染，不发网络请求） */
export function getCurrentUser(): UserProfile {
  if (typeof window === 'undefined') {
    return { user_id: '', nickname: '访客', is_guest: true };
  }
  const raw = localStorage.getItem(PROFILE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as UserProfile;
    } catch {
      // 数据损坏则忽略，走下面的默认值
    }
  }
  return { user_id: '', nickname: '临时访客', is_guest: true };
}

/** 是否已建立会话 */
export function hasSession(): boolean {
  return Boolean(getToken());
}

/**
 * 带状态码与业务码的错误类型
 * 之前所有失败都抛裸 Error，调用方只能靠 message 文本区分，
 * 现在可以据 code / status 精确处理（例如识别到 SESSION_EXPIRED 就弹出登录框）。
 */
export class ApiError extends Error {
  status?: number;
  code?: string;
  /** 被限流时建议等待的秒数（登录失败锁定、AI 生成限流等场景） */
  remaining_seconds?: number;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** 清理本地会话（令牌 + 资料缓存），用于令牌失效时回到未登录状态 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

/**
 * 确保存在可用会话
 * 没有令牌时自动向服务端申请一个访客会话；
 * 若本地存在老版本遗留的用户 ID，会一并提交，让服务端把该设备此前录入的食材迁移过来。
 */
let sessionCreation: Promise<void> | null = null;

async function ensureSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (getToken()) return;

  // 并发请求时只创建一次会话，避免同时发出多个 /api/auth/guest 把身份冲散
  if (!sessionCreation) {
    sessionCreation = (async () => {
      const legacyUserId = localStorage.getItem(LEGACY_USER_ID_KEY) || undefined;
      const res = await fetch(`${API_BASE}/api/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacy_user_id: legacyUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || '初始化访客会话失败，请刷新页面重试');
      }
      persistSession(json.data);
    })().finally(() => {
      sessionCreation = null;
    });
  }

  return sessionCreation;
}

// ---------------- 底层请求封装 ----------------

/** 带会话令牌发起请求 */
function doFetch(path: string, options: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

/** 按状态码给出兜底提示文案（响应体里没有 error 字段时使用） */
function statusFallbackMessage(status: number): string {
  if (status === 401) return '登录状态已失效，请重新登录';
  if (status === 413) return '内容过大，请压缩后重试';
  if (status === 429) return '操作过于频繁，请稍后再试';
  return `请求失败（${status}）`;
}

/** 从错误响应中提取对用户友好的提示文案 */
async function toErrorMessage(response: Response): Promise<string> {
  const json = await response.json().catch(() => null);
  if (json && typeof json === 'object' && typeof (json as { error?: string }).error === 'string') {
    return (json as { error: string }).error;
  }
  return statusFallbackMessage(response.status);
}

/**
 * 统一请求入口
 * 自动确保会话有效；遇到 401 时按身份分别处理（见下方注释）。
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  await ensureSession();

  let response = await doFetch(path, options, getToken());

  if (response.status === 401) {
    // 【修复 UX-01】旧实现无论什么身份，401 都一律清掉令牌、重建访客会话并重试。
    // 对正式账号来说这是"静默降级"：用户以为自己还登录着，
    // 后续录入的数据却全写进了新建的访客会话，表现为数据凭空消失。
    // 现在正式账号直接抛出会话过期错误，由界面引导用户重新登录；
    // 访客会话本来就是临时的，仍保留自动重建并重试一次的行为。
    if (getCurrentUser().is_guest === false) {
      clearSession();
      throw new ApiError('登录已过期，请重新登录', 401, 'SESSION_EXPIRED');
    }

    if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    await ensureSession();
    response = await doFetch(path, options, getToken());
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;
    throw new ApiError(
      payload?.error || statusFallbackMessage(response.status),
      response.status,
      payload?.code
    );
  }

  const json = await response.json();
  if (json && typeof json === 'object' && 'success' in json && !json.success) {
    throw new ApiError(json.error || '接口操作失败', response.status, json.code);
  }

  return json.data !== undefined ? json.data : json;
}

// ---------------- 认证相关接口 ----------------

export async function fetchCaptcha(): Promise<{ captcha_key: string; svg: string }> {
  const res = await fetch(`${API_BASE}/api/auth/captcha`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.error || '获取验证码失败');
  }
  return json.data;
}

export async function loginUser(
  username: string,
  password: string,
  captcha_key?: string,
  captcha_code?: string
): Promise<UserProfile> {
  await ensureSession();

  const res = await doFetch(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, captcha_key, captcha_code }),
    },
    getToken()
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const error = new ApiError(json.error || '登录失败', res.status, json.code);
    // 账号被防爆破锁定时会返回建议等待秒数
    error.remaining_seconds = json.remaining_seconds;
    throw error;
  }

  persistSession(json.data);
  return json.data as UserProfile;
}

export async function registerUser(
  username: string,
  password: string,
  nickname?: string,
  captcha_key?: string,
  captcha_code?: string
): Promise<UserProfile> {
  await ensureSession();

  const res = await doFetch(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname, captcha_key, captcha_code }),
    },
    getToken()
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new ApiError(json.error || '注册失败', res.status, json.code);
  }

  persistSession(json.data);
  return json.data as UserProfile;
}

/**
 * 退出登录
 * 【安全改进】除了清理本地数据，还会通知服务端立即作废该令牌，
 * 旧实现只清浏览器本地存储，服务端会话仍然有效。
 */
export async function logoutUser(): Promise<void> {
  const token = getToken();

  if (token) {
    // 尽力而为地通知服务端，即使失败也不阻塞用户退出
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  // 退出后立刻重新申请访客会话，让用户可以直接继续使用
  await ensureSession();
}

// ---------------- 业务接口 ----------------

export async function getInventory(): Promise<{
  items: InventoryItem[];
  summary: InventorySummary;
}> {
  return request<{ items: InventoryItem[]; summary: InventorySummary }>('/api/inventory');
}

export async function batchAddInventory(
  items: Array<{
    name: string;
    category: string;
    quantity: string;
    storage_location?: string;
    storage_days?: number;
  }>
): Promise<InventoryItem[]> {
  return request<InventoryItem[]>('/api/inventory/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function deleteInventoryItem(id: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/inventory/${id}`, {
    method: 'DELETE',
  });
}

export async function scanFridgeImage(file: File): Promise<FridgeScanResult> {
  await ensureSession();

  const formData = new FormData();
  formData.append('file', file);

  // 注意：FormData 不能手动设置 Content-Type，浏览器需要自动补上 multipart 边界
  const response = await doFetch(
    '/api/vision/fridge-scan',
    { method: 'POST', body: formData },
    getToken()
  );

  if (!response.ok) {
    throw new ApiError(await toErrorMessage(response), response.status);
  }

  const json = await response.json();
  if (!json.success) {
    throw new ApiError(json.error || '识别失败', response.status, json.code);
  }

  return json.data;
}

/** 基于库存的本地推荐（纯计算，不会调用大模型） */
export async function getRecommendations(): Promise<RecommendationResult> {
  return request<RecommendationResult>('/api/recipes/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

/**
 * 请求 AI 大厨现场设计菜谱
 * 【修复 PER-01】独立接口，只在用户主动点击「AI 菜谱」按钮时调用，
 * 不再像以前那样每次刷新页面都可能触发一次大模型请求。
 * 默认一次生成 3 道：单次请求内让模型返回数组，比循环调用更省时间与额度。
 */
export async function generateAiRecipes(
  preference?: string,
  count: number = 3
): Promise<RecipeRecommendation[]> {
  const data = await request<{ recipes: RecipeRecommendation[]; count: number }>(
    '/api/recipes/ai-generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preference, count }),
    }
  );
  return data.recipes || [];
}

export async function cookRecipe(
  recipeId: string,
  autoConsume: boolean = true
): Promise<CookResult> {
  return request<CookResult>(`/api/recipes/${recipeId}/cook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_consume_ingredients: autoConsume }),
  });
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  await request<{ success: boolean; message?: string }>(`/api/recipes/${recipeId}`, {
    method: 'DELETE',
  });
}

/**
 * 图片上传体积上限（用于前端提前拦截超大文件）
 * 之前是写死的常量，改上限要同时改后端配置并重新构建前端；
 * 现在支持用 NEXT_PUBLIC_MAX_UPLOAD_BYTES 注入，与后端 MAX_UPLOAD_BYTES 保持一致即可。
 */
export const MAX_UPLOAD_BYTES = Number.parseInt(
  process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES || '',
  10
) > 0
  ? Number.parseInt(process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES as string, 10)
  : 5 * 1024 * 1024;