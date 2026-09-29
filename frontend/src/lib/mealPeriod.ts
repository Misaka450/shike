/**
 * 场景与时序化动态餐段识别逻辑
 *
 * 时段规则：
 * - 05:00~10:29 晨间
 * - 10:30~14:29 午间
 * - 14:30~16:59 下午茶
 * - 17:00~21:29 晚间
 * - 21:30~04:59 深夜食堂
 */

export interface MealPeriodInfo {
  key: 'breakfast' | 'lunch' | 'afternoon_tea' | 'dinner' | 'late_night';
  tag: string;
  icon: string;
  title: string;
  subtitle: string;
  timeRange: string;
}

export function getMealPeriod(date: Date = new Date(), inventoryCount: number = 0): MealPeriodInfo {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  // 05:00 = 300 分钟
  // 10:30 = 630 分钟
  // 14:30 = 870 分钟
  // 17:00 = 1020 分钟
  // 21:30 = 1290 分钟

  if (currentMinutes >= 300 && currentMinutes < 630) {
    return {
      key: 'breakfast',
      tag: '晨间活力',
      icon: '🌅',
      timeRange: '05:00 ~ 10:29',
      title: '晨光初醒，早餐吃什么？',
      subtitle: '早安！来份快手营养早餐唤醒身体活力',
    };
  }

  if (currentMinutes >= 630 && currentMinutes < 870) {
    return {
      key: 'lunch',
      tag: '午间能量',
      icon: '☀️',
      timeRange: '10:30 ~ 14:29',
      title: '午餐能量站，犒劳一下自己',
      subtitle: '工作辛苦了！来一顿美味高效的元气午餐',
    };
  }

  if (currentMinutes >= 870 && currentMinutes < 1020) {
    return {
      key: 'afternoon_tea',
      tag: '午后小憩',
      icon: '🍵',
      timeRange: '14:30 ~ 16:59',
      title: '午后小憩，来点轻盈点心吗？',
      subtitle: '搜罗冰箱里的清爽水果与轻食小点',
    };
  }

  if (currentMinutes >= 1020 && currentMinutes < 1290) {
    return {
      key: 'dinner',
      tag: '晚间慢享',
      icon: '🌙',
      timeRange: '17:00 ~ 21:29',
      title: '今晚吃什么？洗净疲惫，享用晚餐',
      subtitle: inventoryCount > 0
        ? `基于冰箱现有 ${inventoryCount} 种食材，优先消耗临期与高契合度菜谱`
        : '基于冰箱现有食材，优先消耗临期与高契合度菜谱',
    };
  }

  // 21:30 ~ 04:59 深夜食堂
  return {
    key: 'late_night',
    tag: '深夜食堂',
    icon: '🌌',
    timeRange: '21:30 ~ 04:59',
    title: '深夜食堂，来点轻盈无负担的暖胃宵夜',
    subtitle: '夜深了，少油少盐低卡轻食，温润入眠',
  };
}
