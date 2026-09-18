/**
 * 真实可访问的高清美食图片映射表（Unsplash Imgix CDN & 本地高质量 WebP）
 * 全部外部 URL 均已通过 HTTP 200 验证。
 */
export const RECIPE_IMAGE_MAP: Record<string, string> = {
  // 1. 番茄炒蛋 / 西红柿炒蛋 (本地高清图)
  tomato_egg: '/images/tomato_egg.webp',

  // 2. 茄子 / 地三鲜
  eggplant: 'https://images.unsplash.com/photo-1628294895950-9805252327bc?w=500',

  // 3. 土豆 / 酸辣土豆丝 / 薯条
  potato: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500',

  // 4. 鸡翅 / 可乐鸡翅
  chicken_wings: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500',

  // 5. 豆腐 / 麻婆豆腐
  tofu: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=500',

  // 6. 排骨 / 糖醋排骨 / 红烧排骨
  ribs: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',

  // 7. 红烧肉 / 五花肉 / 回锅肉 / 扣肉 / 卤肉 / 肘子 / 猪蹄
  braised_pork: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=500',

  // 8. 小炒肉 / 肉丝 / 肉末 / 炒肉 / 锅包肉 / 猪肉
  stir_fry_pork: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=500',

  // 9. 鸡肉 / 宫保鸡丁 / 辣子鸡 / 黄焖鸡 / 大盘鸡 / 鸡腿
  chicken: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500',

  // 10. 牛肉 / 牛柳 / 水煮牛肉 / 肥牛 / 牛腩
  beef: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500',

  // 11. 鸭肉 / 烤鸭 / 啤酒鸭
  duck: 'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=500',

  // 12. 羊肉 / 羊排 / 羊肉串 / 孜然羊肉
  lamb: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500',

  // 13. 鱼类 / 鲈鱼 / 水煮鱼 / 三文鱼 / 鲤鱼 / 带鱼
  fish: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500',

  // 14. 虾 / 虾仁 / 海鲜 / 贝类 / 蟹 / 蛤蜊 / 鱿鱼
  shrimp_seafood: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=500',

  // 15. 饺子 / 面点 / 馄饨 / 包子 / 锅贴 / 烧麦 / 煎饼
  dumplings_dimsum: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=500',

  // 16. 面食 / 拉面 / 拌面 / 凉皮 / 米线 / 炒面 / 意面
  noodles: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=500',

  // 17. 炒饭 / 米饭 / 粥 / 煲仔饭 / 盖浇饭
  rice_staple: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500',

  // 18. 黄瓜 / 凉拌菜 / 拍黄瓜 / 皮蛋
  cucumber_cold: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500',

  // 19. 绿叶蔬菜 / 西兰花 / 炒青菜 / 包菜 / 空心菜 / 四季豆
  greens_veggies: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500',

  // 20. 鸡蛋 / 荷包蛋 / 鸡蛋羹 / 蒸蛋 / 煎蛋 / 滑蛋
  egg_dishes: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=500',

  // 21. 菌菇 / 香菇 / 金针菇 / 杏鲍菇 / 木耳
  mushroom: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500',

  // 22. 汤羹 / 靓汤 / 炖汤 / 肉丸汤 / 鲜汤
  soup_stew: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=500',

  // 23. 烘焙 / 甜品 / 松饼 / 吐司 / 蛋糕 / 糖水
  baking_dessert: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500',

  // 24. 沙拉 / 轻食 / 大拌菜 / 温沙拉
  salad: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500',
  fallback_salad: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500',

  // 分类兜底
  fallback_veggie: 'https://images.unsplash.com/photo-1525755662778-989d0524087e?w=500',
  fallback_seafood: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=500',
  fallback_staple: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500',
  fallback_soup: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=500',
  fallback_dessert: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500',
  fallback_cold: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500',
  fallback_chinese_hot: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500',
};

/**
 * 根据菜品名称、分类及食材，智能挑选真实对应的高清封面图
 */
export function selectRecipeImage(
  name: string,
  category = '',
  ingredients: Array<{ name: string } | string> = []
): string {
  // 提取食材纯文本以备辅助匹配
  let ingText = '';
  if (Array.isArray(ingredients)) {
    for (const item of ingredients) {
      if (typeof item === 'string') {
        ingText += ' ' + item;
      } else if (item && typeof item === 'object' && item.name) {
        ingText += ' ' + item.name;
      }
    }
  }

  // 移除复合词对禽肉“鸡”的干扰
  const nameNoEgg = name.replace(/鸡蛋|鸡精|鸡粉|鸡汁/g, '');
  // 移除甜品面点对主食“饼”的干扰
  const nameNoBakingBing = name.replace(/松饼|饼干|华夫饼/g, '');
  // 移除“鱼香”风味对水产海鲜“鱼”的干扰（鱼香肉丝是经典猪肉丝菜肴，绝非鱼类）
  const nameNoYuxiang = name.replace(/鱼香/g, '');

  // 1. 番茄炒蛋 / 西红柿炒蛋 (优先本地高质量 WebP)
  if (
    // 注意：这里曾是 `'西红柿' in windowOrEmpty(name)`，
    // 但 windowOrEmpty 返回的是数组，而 `in` 对数组判断的是"下标是否存在"，
    // 所以那个条件恒为 false，属于无效判断，已删除
    ((name.includes('西红柿') || name.includes('番茄')) &&
      (name.includes('炒蛋') || name.includes('炒鸡蛋') || name.includes('滑蛋') || name.includes('煎蛋'))) ||
    ['西红柿炒蛋', '番茄炒蛋', '番茄炒鸡蛋', '西红柿炒鸡蛋', '番茄鸡蛋'].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.tomato_egg;
  }

  // 2. 沙拉 / 轻食 / 温沙拉 / 大拌菜 / 油醋汁
  if (['沙拉', '大拌菜', '温沙拉', '油醋汁'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.salad;
  }

  // 3. 烘焙 / 甜品 / 松饼 / 吐司 / 蛋糕 / 糖水
  if (
    [
      '松饼', '吐司', '蛋糕', '面包', '甜品', '蛋挞', '饼干', '糖水', '双皮奶',
      '杨枝甘露', '西米露', '冰粉', '芋圆', '烘焙', '布丁', '酸奶', '坚果', '香蕉',
      '汤圆', '冰淇淋', '奶冻', '雪媚娘', '司康', '雪花酥', '龟苓膏', '甜糕',
      '鲜奶', '芋头', '提拉米苏',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.baking_dessert;
  }

  // 4. 茄子 / 地三鲜
  if (['地三鲜', '茄子', '风味茄子', '鱼香茄子', '烤茄子', '烧茄子'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.eggplant;
  }

  // 5. 土豆 / 酸辣土豆丝 / 薯条
  if (['土豆', '马铃薯', '洋芋', '薯条'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.potato;
  }

  // 6. 鸡翅 / 可乐鸡翅 / 烤全翅
  if (['鸡翅', '烤翅', '鸡中翅', '鸡翅尖', '炸鸡翅', '蒜香鸡翅', '全翅', '烤全翅'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.chicken_wings;
  }

  // 7. 豆腐 / 麻婆豆腐
  if (['豆腐', '豆花', '臭豆腐', '腐竹', '千张'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.tofu;
  }

  // 8. 排骨 / 糖醋排骨 / 红烧排骨
  if (['排骨', '肋排', '小排', '排条', '糖醋排骨', '红烧排骨', '粉蒸排骨'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.ribs;
  }

  // 9. 红烧肉 / 五花肉 / 回锅肉 / 扣肉 / 卤肉 / 肘子 / 猪蹄 / 蹄花
  if (
    [
      '红烧肉', '五花肉', '回锅肉', '东坡肉', '扣肉', '卤肉', '把子肉', '商芝肉',
      '叉烧', '肘子', '猪蹄', '蹄花', '红烧猪蹄', '腊味', '腊肉', '腐乳肉', '猪皮冻',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.braised_pork;
  }

  // 10. 面食 / 拉面 / 拌面 / 凉皮 / 米线 / 炒面 / 意面
  if (
    [
      '面', '拉面', '拌面', '汤面', '炒面', '葱油面', '米线', '米粉', '意面',
      '通心粉', '粉丝', '乌冬', '凉皮', '凉面', '粉',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.noodles;
  }

  // 11. 炒饭 / 米饭 / 粥 / 煲仔饭 / 盖浇饭
  if (
    [
      '炒饭', '米饭', '蛋炒饭', '煲仔饭', '盖浇饭', '卤肉饭', '拌饭', '粥', '泡饭',
      '饭', '炒馍', '利提巧卡',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.rice_staple;
  }

  // 12. 饺子 / 面点 / 馄饨 / 包子 / 锅贴 / 点心 / 饼 / 烧卖
  if (
    [
      '饺', '水饺', '煎饺', '锅贴', '馄饨', '云吞', '抄手', '包子', '小笼包',
      '烧麦', '春卷', '馒头', '花卷', '点心', '烧饼', '馅饼', '煎饼', '韭菜盒子',
      '年糕', '烙饼', '手抓饼', '烤饼', '饼', '烧卖',
    ].some((k) => nameNoBakingBing.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.dumplings_dimsum;
  }

  // 13. 鸡蛋 / 荷包蛋 / 鸡蛋羹 / 蒸蛋 / 煎蛋 / 蛋卷
  if (
    [
      '荷包蛋', '蛋羹', '鸡蛋羹', '蒸蛋', '煎蛋', '金钱蛋', '滑蛋', '蛋花', '爆蛋',
      '茶叶蛋', '水煮蛋', '温泉蛋', '溏心蛋', '水蛋', '太阳蛋', '炒蛋', '厚蛋烧',
      '北非蛋', '炖蛋',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.egg_dishes;
  }

  // 14. 鱼类 / 鲈鱼 / 水煮鱼 / 三文鱼 / 鲤鱼 / 鳕鱼 / 鳝鱼 (排除“鱼香”复合风味)
  if (
    [
      '鱼', '鲈鱼', '三文鱼', '巴沙鱼', '带鱼', '黄花鱼', '鲫鱼', '草鱼', '鲤鱼',
      '鳗鱼', '鳕鱼', '白鱔', '鱔', '鳝',
    ].some((k) => nameNoYuxiang.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.fish;
  }

  // 15. 虾 / 虾仁 / 海鲜 / 贝类 / 蟹 / 蛤蜊 / 鱿鱼 / 海参
  if (
    [
      '虾', '虾仁', '基围虾', '大虾', '蛤蜊', '海鲜', '生蚝', '扇贝', '花甲',
      '鱿鱼', '螃蟹', '蟹', '青口', '甲鱼', '海参', '田螺', '蛏',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.shrimp_seafood;
  }

  // 16. 牛肉 / 牛柳 / 水煮牛肉 / 肥牛 / 牛腩 / 孜然牛肉
  if (
    [
      '牛', '肥牛', '牛柳', '牛腩', '水煮牛肉', '牛排', '牛蛙', '黄牛肉', '牛筋',
      '孜然牛肉', '葱爆牛肉',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.beef;
  }

  // 17. 鸡肉 (过滤 '鸡蛋', '鸡精' 干扰)
  if (
    [
      '鸡', '宫保鸡丁', '辣子鸡', '黄焖鸡', '大盘鸡', '口水鸡', '鸡丁', '鸡块',
      '鸡腿', '鸡胸', '叫花鸡', '三杯鸡', '鸡爪', '仔鸡',
    ].some((k) => nameNoEgg.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.chicken;
  }

  // 18. 鸭肉 / 烤鸭 / 啤酒鸭
  if (['鸭', '啤酒鸭', '烤鸭', '盐水鸭', '酱鸭', '鸭肉', '鸭腿'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.duck;
  }

  // 19. 羊肉 / 羊排 / 羊肉串 / 孜然羊肉
  if (['羊', '羊肉', '羊排', '羊蝎子', '羊腿', '羊肉串'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.lamb;
  }

  // 20. 小炒肉 / 肉丝 / 肉末 / 炒肉 / 锅包肉 / 猪肉 / 里脊
  if (
    [
      '小炒肉', '肉丝', '鱼香肉丝', '青椒肉丝', '肉末', '一碗香', '过油肉', '肉片',
      '猪里脊', '炒肉', '溜肉段', '小酥肉', '肉丁', '猪肉', '酿肉', '咕噜肉', '杀猪菜',
      '里脊', '锅包肉', '荔枝肉', '蚂蚁上树', '水煮肉片', '青椒酿', '麻辣香锅', '肉', '猪',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.stir_fry_pork;
  }

  // 21. 鸡蛋类名称补充
  if (name.includes('蛋')) {
    return RECIPE_IMAGE_MAP.egg_dishes;
  }

  // 22. 黄瓜 / 凉拌菜 / 拍黄瓜 / 皮蛋
  if (['拍黄瓜', '黄瓜', '凉拌', '皮蛋', '凉菜', '泡菜', '腌黄瓜', '冷吃'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.cucumber_cold;
  }

  // 23. 菌菇 / 香菇 / 金针菇 / 杏鲍菇 / 木耳
  if (['蘑菇', '香菇', '金针菇', '杏鲍菇', '平菇', '菌菇', '银耳', '木耳', '菇'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.mushroom;
  }

  // 24. 绿叶蔬菜 / 西兰花 / 炒青菜 / 包菜 / 空心菜 / 四季豆
  if (
    [
      '西兰花', '青菜', '生菜', '空心菜', '油麦菜', '菠菜', '娃娃菜', '包菜',
      '手撕包菜', '四季豆', '豆角', '荷兰豆', '蒜苔', '芹菜', '芦笋', '茼蒿', '芥蓝',
      '白菜', '冬瓜', '苦瓜', '丝瓜', '南瓜', '西葫芦', '莲藕', '藕', '花菜', '菜花',
      '菜心', '玉米', '毛豆', '蔬菜', '豆芽', '秋葵', '青椒', '椒', '西红柿', '番茄', '葫芦',
    ].some((k) => name.includes(k))
  ) {
    return RECIPE_IMAGE_MAP.greens_veggies;
  }

  // 25. 汤羹 / 靓汤 / 炖汤 / 肉丸汤 / 鲜汤
  if (['汤', '羹', '煲'].some((k) => name.includes(k))) {
    return RECIPE_IMAGE_MAP.soup_stew;
  }

  // 烧烤
  if (name.includes('烧烤') || name.includes('烤')) {
    return RECIPE_IMAGE_MAP.braised_pork;
  }

  // 兜底规则
  if (category === '轻食沙拉' || category === '沙拉' || category === '减脂轻食') {
    return RECIPE_IMAGE_MAP.fallback_salad;
  }
  if (category === '素菜' || category === '快手菜') {
    return RECIPE_IMAGE_MAP.fallback_veggie;
  }
  if (category === '水产海鲜' || category === '海鲜水产') {
    return RECIPE_IMAGE_MAP.fallback_seafood;
  }
  if (category === '主食' || category === '经典主食') {
    return RECIPE_IMAGE_MAP.fallback_staple;
  }
  if (category === '汤羹' || category === '养生汤羹' || category === '靓汤羹品') {
    return RECIPE_IMAGE_MAP.fallback_soup;
  }
  if (category === '甜品点心' || category === '轻食烘焙') {
    return RECIPE_IMAGE_MAP.fallback_dessert;
  }
  if (category === '凉拌菜') {
    return RECIPE_IMAGE_MAP.fallback_cold;
  }

  return RECIPE_IMAGE_MAP.fallback_chinese_hot;
}
