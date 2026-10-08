import type { UrgencyLevel } from '../schemas/index.js';

/**
 * 计算距过期日期还剩多少天
 * 说明：两侧都归一到「当地时间当天零点」再相减，避免同一天因时分秒不同算出 -0 或 1 的偏差。
 * 同时避免 new Date("YYYY-MM-DD") 按 UTC 解析导致的跨时区回退一天缺陷（BUG-01）。
 */
export function calculateDaysRemaining(expiryDateStr: string): number {
  const now = new Date();
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const parts = (expiryDateStr || '').split('-').map((v) => Number.parseInt(v, 10));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    const expDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const diffTime = expDate.getTime() - nowDate.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  }

  // 容灾兜底
  const expDateObj = new Date(expiryDateStr);
  const expDate = new Date(expDateObj.getFullYear(), expDateObj.getMonth(), expDateObj.getDate());
  const diffTime = expDate.getTime() - nowDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 根据剩余天数判定三级警戒灯
 * 红灯：已过期或今天到期（<= 0 天）
 * 黄灯：1-2 天内到期
 * 绿灯：3 天及以上
 */
export function computeUrgency(daysRemaining: number): UrgencyLevel {
  if (daysRemaining <= 0) {
    return 'red';
  }
  if (daysRemaining <= 2) {
    return 'yellow';
  }
  return 'green';
}
