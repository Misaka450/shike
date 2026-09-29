/**
 * 食材同义词分组
 * 用于把用户冰箱里的叫法和菜谱里的叫法对应起来，
 * 例如冰箱里写「番茄」，菜谱里写「西红柿」，应当视为同一种食材。
 */
export const SYNONYM_GROUPS: string[][] = [
  ['西红柿', '番茄'],
  ['土豆', '马铃薯', '洋芋'],
  ['青椒', '尖椒', '辣椒', '菜椒', '彩椒', '杭椒'],
  ['猪肉', '五花肉', '里脊肉', '猪里脊', '猪肉末', '肉丝', '瘦肉', '肉末', '肉丸', '猪肉馅'],
  ['排骨', '小排', '肋排', '猪排骨', '肉排', '猪小排', '精排'],
  ['牛肉', '牛腩', '肥牛', '牛肉末', '牛肉片', '牛排', '牛柳', '牛里脊'],
  ['鸡肉', '鸡翅', '鸡中翅', '鸡腿', '鸡胸肉', '鸡块', '鸡丁'],
  ['鱼肉', '鱼片', '鲜鱼', '鲈鱼', '草鱼', '鳕鱼', '龙利鱼', '巴沙鱼', '黑鱼', '鲫鱼'],
  ['三文鱼', '三文鱼片', '大西洋鲑'],
  ['虾', '大虾', '基围虾', '鲜虾', '虾仁', '青虾'],
  ['蛤蜊', '花蛤', '扇贝', '花甲', '文蛤', '贝类', '蛤蜊肉'],
  ['茄子', '长茄', '圆茄', '紫茄子', '紫茄', '长条茄子'],
  ['菌菇', '香菇', '金针菇', '杏鲍菇', '平菇', '口蘑', '白玉菇', '海鲜菇', '蘑菇', '蟹味菇'],
  ['绿叶蔬菜', '绿叶菜', '生菜', '油麦菜', '菠菜', '空心菜', '娃娃菜', '上海青', '青菜', '小油菜', '油菜'],
  ['豆角', '四季豆', '扁豆', '豇豆', '架豆', '油豆角'],
  ['蒜苔', '蒜薹', '蒜苗', '青蒜'],
  ['洋葱', '紫洋葱', '圆葱', '洋葱碎', '白洋葱'],
  ['豆腐', '嫩豆腐', '老豆腐', '内酯豆腐', '水豆腐'],
  ['豆制品', '千张', '豆腐皮', '豆皮', '豆泡', '油豆腐', '腐竹', '豆干'],
  ['香肠', '腊肠', '腊肉', '广味香肠', '川味香肠', '广式腊肠'],
  ['米饭', '大米', '剩米饭', '冷饭', '白饭', '米粒', '白米饭'],
  ['面条', '挂面', '鲜面', '拉面', '手擀面', '切面', '挂面条'],
  ['皮蛋', '松花蛋', '变蛋'],
  ['丝瓜', '水瓜'],
  ['冬瓜'],
  ['山药', '淮山', '铁棍山药'],
  ['玉米', '甜玉米', '玉米粒', '水果玉米'],
  ['香蕉', '熟香蕉'],
  ['苹果', '红富士'],
  ['面包', '吐司', '方包'],
  ['酸奶', '优酪乳'],
  ['牛奶', '纯牛奶', '鲜牛奶'],
  ['葱', '大葱', '小葱', '香葱', '青葱', '葱花'],
  ['姜', '生姜', '老姜', '姜丝', '姜末', '姜片'],
  ['蒜', '大蒜', '蒜瓣', '蒜蓉', '蒜头'],
  ['木耳', '黑木耳'],
  ['黄瓜', '青瓜'],
  ['胡萝卜', '红萝卜'],
  ['白菜', '大白菜', '包菜', '圆白菜', '卷心菜'],
];

/**
 * 同义词倒排索引：食材叫法 -> 所属分组下标
 *
 * 【性能修复 PER-06】旧实现每次匹配都要线性扫描全部 40 个分组、逐条做 includes 比较。
 * 推荐接口要对「每道菜谱 × 每种食材 × 每件库存」做笛卡尔积式匹配，
 * 这个 O(分组数 × 组内词数) 的开销会被放大成千上万倍。
 * 改成哈希表后，标准叫法的分组查询是 O(1)。
 */
const synonymIndex = new Map<string, number>();
SYNONYM_GROUPS.forEach((group, groupIndex) => {
  for (const member of group) {
    // 同一个词出现在多个分组时只登记第一次，保持行为稳定
    if (!synonymIndex.has(member)) {
      synonymIndex.set(member, groupIndex);
    }
  }
});

/**
 * 清除常见的状态、加工及修饰词，提取食材核心实体词
 * 例如："去皮土豆块" -> "土豆", "手打牛肉丸" -> "牛肉丸", "冷冻鲜虾仁" -> "虾仁"
 */
export function stripIngredientModifiers(name: string): string {
  let cleaned = name.trim().toLowerCase();
  // 剥离括号备注，如 "土豆(大)" -> "土豆"
  cleaned = cleaned.replace(/[\(（][^\)）]*[\)）]/g, '');
  // 剥离常见加工/状态前缀
  cleaned = cleaned.replace(/^(新鲜|鲜|去皮|切块|切片|切丁|熟|生|冷冻|冻|自制|手打|特级|精选|有机|普通|纯)+/, '');
  // 剥离常见加工后缀（如 "块"、"丁"、"段"、"碎"），但保留本身作为词根的（如肉丝、土豆块等）
  if (cleaned.length > 2 && !/肉丝|粉丝|面条|排骨/.test(cleaned)) {
    cleaned = cleaned.replace(/(块|片|丁|段|碎|粒)$/, '');
  }
  return cleaned.trim() || name.trim().toLowerCase();
}

/**
 * 内部核心匹配逻辑（单层判定）
 */
function checkDirectMatch(iNorm: string, rNorm: string): boolean {
  if (iNorm === rNorm) return true;

  const iGroup = synonymIndex.get(iNorm);
  const rGroup = synonymIndex.get(rNorm);

  // 【核心修复 LOG-01】当两个食材均在同义词词典时，严格以分组 ID 相同为准判定匹配；严禁子串包含抢先匹配！
  if (iGroup !== undefined && rGroup !== undefined) {
    return iGroup === rGroup;
  }

  // 互斥保护：即使某一方不在词典（如带修饰词），特定容易语义混淆的食材严禁误匹配
  // 1. 洋葱 与 葱（小葱/大葱/香葱/青葱/葱花等）互斥
  if (
    (iNorm.includes('洋葱') && !rNorm.includes('洋葱') && rNorm.includes('葱')) ||
    (rNorm.includes('洋葱') && !iNorm.includes('洋葱') && iNorm.includes('葱'))
  ) {
    return false;
  }

  // 2. 牛肉末 与 肉末/猪肉末 互斥（以及牛肉制品与猪肉/通用肉末互斥）
  if (
    (iNorm.includes('牛肉') && !rNorm.includes('牛') && (rNorm.includes('肉末') || rNorm.includes('猪') || rNorm.includes('五花'))) ||
    (rNorm.includes('牛肉') && !iNorm.includes('牛') && (iNorm.includes('肉末') || iNorm.includes('猪') || iNorm.includes('五花')))
  ) {
    return false;
  }

  // 3. 牛排 与 猪排 / 肉排 互斥
  if (
    (iNorm.includes('牛排') && !rNorm.includes('牛') && (rNorm.includes('猪排') || rNorm.includes('肉排'))) ||
    (rNorm.includes('牛排') && !iNorm.includes('牛') && (iNorm.includes('猪排') || iNorm.includes('肉排')))
  ) {
    return false;
  }

  // 当且仅当某一方不在词典时才允许子串包含模糊匹配
  if (iNorm.includes(rNorm) || rNorm.includes(iNorm)) {
    return true;
  }

  // 至少一方不在词典里（"有机土豆"、"土鸡蛋"…）：退化为基于同义词分组的模糊扫描，兼容自由写法
  for (const group of SYNONYM_GROUPS) {
    const iInGroup = group.some((g) => iNorm.includes(g) || g.includes(iNorm));
    if (!iInGroup) continue;
    const rInGroup = group.some((g) => rNorm.includes(g) || g.includes(rNorm));
    if (rInGroup) return true;
  }

  return false;
}

/**
 * 判断冰箱里的食材名与菜谱里的食材名是否指同一种东西
 * 包含双重语义归一化容差匹配
 */
export function isIngredientMatch(invName: string, recName: string): boolean {
  const iNorm = invName.trim().toLowerCase();
  const rNorm = recName.trim().toLowerCase();

  if (!iNorm || !rNorm) return false;

  // 1. 原始文本直接判定
  if (checkDirectMatch(iNorm, rNorm)) return true;

  // 2. 词干修饰词归一化后深度二次判定（如 "去皮土豆块" 归一化为 "土豆" 与 "马铃薯" 成功配对）
  const iStripped = stripIngredientModifiers(iNorm);
  const rStripped = stripIngredientModifiers(rNorm);
  if (iStripped !== iNorm || rStripped !== rNorm) {
    if (checkDirectMatch(iStripped, rStripped)) return true;
  }

  return false;
}