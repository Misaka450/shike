import {
  InventoryItem,
  InventorySummary,
  Recipe,
  FridgeScanResult,
  ScannedItem,
} from './types';

const API_BASE =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || ''
    : process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8081';

export function getUserId(): string {
  if (typeof window === 'undefined') return 'guest_default';
  let uid = localStorage.getItem('shike_user_id');
  if (!uid) {
    uid = `user_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('shike_user_id', uid);
  }
  return uid;
}

export function getCurrentUser(): {
  user_id: string;
  username?: string;
  nickname?: string;
  is_guest: boolean;
} {
  if (typeof window === 'undefined') {
    return { user_id: 'guest_default', nickname: '访客', is_guest: true };
  }
  const uid = getUserId();
  const raw = localStorage.getItem('shike_user_profile');
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fallback
    }
  }
  return { user_id: uid, nickname: '本地访客', is_guest: true };
}

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
): Promise<any> {
  const currentTempId = getUserId();
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      captcha_key,
      captcha_code,
      temp_user_id: currentTempId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const error: any = new Error(json.error || '登录失败');
    error.status = res.status;
    error.remaining_seconds = json.remaining_seconds;
    throw error;
  }
  localStorage.setItem('shike_user_id', json.data.user_id);
  localStorage.setItem('shike_user_profile', JSON.stringify(json.data));
  return json.data;
}

export async function registerUser(
  username: string,
  password: string,
  nickname?: string,
  captcha_key?: string,
  captcha_code?: string
): Promise<any> {
  const currentTempId = getUserId();
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password,
      nickname,
      captcha_key,
      captcha_code,
      temp_user_id: currentTempId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const error: any = new Error(json.error || '注册失败');
    error.status = res.status;
    throw error;
  }
  localStorage.setItem('shike_user_id', json.data.user_id);
  localStorage.setItem('shike_user_profile', JSON.stringify(json.data));
  return json.data;
}

export function logoutUser(): void {
  localStorage.removeItem('shike_user_id');
  localStorage.removeItem('shike_user_profile');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const userId = getUserId();
  const headers = new Headers(options.headers || {});
  headers.set('x-user-id', userId);

  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `请求失败: ${response.status}`);
  }

  const json = await response.json();
  if (json && typeof json === 'object' && 'success' in json && !json.success) {
    throw new Error(json.error || '接口操作失败');
  }

  return json.data !== undefined ? json.data : json;
}

export async function getInventory(): Promise<{
  items: InventoryItem[];
  summary: InventorySummary;
}> {
  return request<{ items: InventoryItem[]; summary: InventorySummary }>(
    '/api/inventory'
  );
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
  const formData = new FormData();
  formData.append('file', file);

  const userId = getUserId();
  const url = `${API_BASE}/api/vision/fridge-scan`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-user-id': userId,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `视觉扫描识别失败: ${response.status}`);
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || '识别失败');
  }

  return json.data;
}

export async function getRecommendations(
  preferences: string[] = []
): Promise<{ recommendations: Recipe[]; inventory_count: number }> {
  return request<{ recommendations: Recipe[]; inventory_count: number }>(
    '/api/recipes/recommend',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    }
  );
}

export async function cookRecipe(
  recipeId: string,
  autoConsume: boolean = true
): Promise<{ success: boolean; consumedCount: number; recipeName: string }> {
  return request<{
    success: boolean;
    consumedCount: number;
    recipeName: string;
  }>(`/api/recipes/${recipeId}/cook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_consume_ingredients: autoConsume }),
  });
}
