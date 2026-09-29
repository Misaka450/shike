/**
 * 常见生鲜保质期常识字典与智能预填知识库
 *
 * 内置常见生鲜与厨房食材常识（叶菜、菌菇、根茎、猪牛羊禽肉、水产海鲜、蛋奶豆制品、调料等）：
 * - category: 分类（蔬菜类、肉禽蛋类、水产类、豆制品、乳制品、调味品、主食面点等）
 * - location: 推荐存放位置（保鲜抽屉、冷藏室、冷冻室、常温避光、冰箱门架）
 * - shelfLifeDays: 推荐保质期天数
 * - tips: 储存常识贴士
 */

export interface IngredientKnowledge {
  name: string;
  category: string;
  location: string;
  shelfLifeDays: number;
  aliases?: string[];
  tips?: string;
}

export const INGREDIENT_KNOWLEDGE_BASE: IngredientKnowledge[] = [
  // ================= 绿叶蔬菜与瓜果类 =================
  {
    name: '菠菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 4,
    aliases: ['赤根菜', '波斯菜'],
    tips: '吸干表面水分或用厨房纸包裹后放入保鲜袋冷藏',
  },
  {
    name: '生菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 5,
    aliases: ['球生菜', '罗马生菜', '圆生菜'],
    tips: '竖立根部向下存放，可延长脆嫩期',
  },
  {
    name: '油麦菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 4,
    aliases: ['牛俐生菜'],
    tips: '避免挤压受损导致叶片发黑腐烂',
  },
  {
    name: '小白菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 4,
    aliases: ['青菜', '上海青', '小油菜', '油菜'],
    tips: '冷藏前切忌水洗，烹饪前再清洗',
  },
  {
    name: '空心菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 3,
    aliases: ['通菜', '蕹菜'],
    tips: '极易失水萎蔫，建议套保鲜袋并在2~3天内食用',
  },
  {
    name: '芹菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 7,
    aliases: ['西芹', '香芹'],
    tips: '摘去烂叶后用保鲜膜包裹紧密保存',
  },
  {
    name: '韭菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 3,
    aliases: ['韭黄'],
    tips: '用纸张包裹叶片吸潮，避免闷在塑料袋里化水',
  },
  {
    name: '娃娃菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 10,
    tips: '外层保护良好时保质期较长，开封后建议3天内吃完',
  },
  {
    name: '卷心菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 12,
    aliases: ['包菜', '圆白菜', '洋白菜', '甘蓝'],
    tips: '耐存蔬菜，整棵冷藏可达两周以上',
  },
  {
    name: '西蓝花',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 6,
    aliases: ['西兰花', '绿菜花', '花椰菜', '白菜花'],
    tips: '花球发黄即表示老化流失营养，尽快食用',
  },
  {
    name: '西红柿',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 7,
    aliases: ['番茄', '小番茄', '圣女果'],
    tips: '蒂头朝下摆放不易腐烂，未完全熟透可常温催熟',
  },
  {
    name: '黄瓜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 6,
    aliases: ['青瓜', '胡瓜'],
    tips: '喜凉怕冻，放保鲜抽屉避免直接接触冷气风口',
  },
  {
    name: '茄子',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 5,
    aliases: ['圆茄', '长茄', '紫茄'],
    tips: '表皮易失水发皱，装入密封袋冷藏',
  },
  {
    name: '青椒',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 8,
    aliases: ['柿子椒', '甜椒', '彩椒', '尖椒', '线椒', '朝天椒', '小米辣'],
    tips: '擦干表面水分，密封冷藏能保持脆度',
  },
  {
    name: '丝瓜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 4,
    tips: '易氧化发黑，建议尽快食用',
  },
  {
    name: '冬瓜',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 5,
    tips: '切开后需用保鲜膜紧紧贴合切面冷藏',
  },
  {
    name: '苦瓜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 5,
    aliases: ['凉瓜'],
  },
  {
    name: '胡萝卜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 14,
    aliases: ['红萝卜'],
    tips: '切去顶部绿缨，用保鲜袋密封冷藏',
  },
  {
    name: '白萝卜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 10,
    aliases: ['萝卜'],
  },
  {
    name: '豆芽',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['绿豆芽', '黄豆芽'],
    tips: '娇嫩易变色，宜泡在清水中冷藏或2天内炒食',
  },
  {
    name: '荷兰豆',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 5,
    aliases: ['四季豆', '扁豆', '豆角', '长豆角', '豇豆'],
    tips: '豆类需彻底煮熟食用',
  },

  // ================= 菌菇类 =================
  {
    name: '金针菇',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 5,
    tips: '带包装冷藏，开袋后用保鲜膜封好尽快食用',
  },
  {
    name: '香菇',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 6,
    aliases: ['鲜香菇', '冬菇', '花菇'],
    tips: '伞盖朝下放置，避免水汽积聚导致变质发粘',
  },
  {
    name: '杏鲍菇',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 7,
    tips: '质地紧密，保鲜袋透气冷藏即可',
  },
  {
    name: '平菇',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['秀珍菇'],
    tips: '水分含量高，不易久存，建议2~3天内食用',
  },
  {
    name: '口蘑',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 4,
    aliases: ['白蘑菇', '双孢菇'],
    tips: '表面遇湿极易变黑，保持干燥冷藏',
  },
  {
    name: '木耳',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 90,
    aliases: ['黑木耳', '云耳'],
    tips: '干木耳密封常温存放；泡发后必须冷藏并在24小时内食用',
  },
  {
    name: '海鲜菇',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 5,
    aliases: ['蟹味菇', '白玉菇'],
  },

  // ================= 根茎耐存类 =================
  {
    name: '土豆',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 30,
    aliases: ['马铃薯', '地蛋'],
    tips: '避光干燥常温保存，冷藏会使淀粉过早转化为糖分；发芽变绿切勿食用',
  },
  {
    name: '洋葱',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 25,
    aliases: ['圆葱', '皮牙子'],
    tips: '通风干燥常温悬挂保存，切忌与土豆放在一起（会互相催熟）',
  },
  {
    name: '大蒜',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 45,
    aliases: ['蒜头', '蒜瓣'],
    tips: '网袋悬挂或阴凉通风处，潮湿冷藏易发芽生霉',
  },
  {
    name: '生姜',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 30,
    aliases: ['老姜', '生姜片'],
    tips: '常温通风干燥保存；腐烂变质姜含黄樟素切勿食用',
  },
  {
    name: '红薯',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 25,
    aliases: ['地瓜', '番薯', '紫薯'],
    tips: '适宜10℃~15℃阴凉干燥处，放冰箱容易硬心冻伤',
  },
  {
    name: '山药',
    category: '蔬菜类',
    location: '常温避光',
    shelfLifeDays: 20,
    aliases: ['铁棍山药'],
    tips: '未切开常温干燥避光；切开后切面用保鲜膜封好冷藏',
  },
  {
    name: '莲藕',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 6,
    aliases: ['藕'],
    tips: '未切开带泥最佳，洗净后需浸泡或密封冷藏防褐变',
  },

  // ================= 肉禽蛋类 =================
  {
    name: '猪肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['精瘦肉', '里脊肉', '后腿肉', '夹心肉', '肉末', '肉馅'],
    tips: '鲜肉冷藏2~3天内食用；如需久存应切块分装入冷冻室(可存90天)',
  },
  {
    name: '五花肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['三层肉'],
    tips: '建议切成每餐用量再冷冻，避免反复解冻流失肉汁',
  },
  {
    name: '排骨',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['小排', '肋排', '大排', '脊骨'],
    tips: '焯水前保持干爽冷藏，冷冻可保存3个月',
  },
  {
    name: '牛肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['牛里脊', '牛腩', '肥牛', '牛腱子', '牛肉片'],
    tips: '冷藏层肉类专区存放，冷冻分装保存更佳',
  },
  {
    name: '牛排',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['西冷', '眼肉', '菲力'],
    tips: '原包装冷藏；烹饪前提前半小时回温',
  },
  {
    name: '鸡肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['鲜鸡', '整鸡', '童子鸡'],
    tips: '禽肉极易滋生沙门氏菌，鲜肉冷藏不宜超过2天',
  },
  {
    name: '鸡胸肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 2,
    tips: '健身高频食材，可腌制分装后冷冻备用',
  },
  {
    name: '鸡翅',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['鸡翅中', '鸡全翅', '鸡腿', '琵琶腿', '鸡爪'],
    tips: '冷藏室2~3天，冷冻室可存3个月',
  },
  {
    name: '鸭肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['鸭腿', '老鸭'],
  },
  {
    name: '羊肉',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['羊排', '羊肉卷', '羊腿肉'],
  },
  {
    name: '培根',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 14,
    tips: '开封后用保鲜膜封严并在7天内食用',
  },
  {
    name: '香肠',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 30,
    aliases: ['腊肠', '火腿肠', '热狗肠'],
  },
  {
    name: '鸡蛋',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 30,
    aliases: ['鲜鸡蛋', '土鸡蛋', '笨鸡蛋', '蛋黄'],
    tips: '大头朝上摆放在蛋架或专用保鲜盒，切勿在存放前清洗蛋壳表面保护膜',
  },
  {
    name: '鸭蛋',
    category: '肉禽蛋类',
    location: '冷藏室',
    shelfLifeDays: 25,
    aliases: ['鹌鹑蛋'],
  },

  // ================= 水产海鲜类 =================
  {
    name: '鲜虾',
    category: '水产类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['基围虾', '对虾', '草虾', '白虾', '大虾'],
    tips: '生鲜活虾极易变黑，当天或次日食用；久存需撒少许糖水冷冻保鲜',
  },
  {
    name: '虾仁',
    category: '水产类',
    location: '冷冻室',
    shelfLifeDays: 60,
    aliases: ['青虾仁'],
    tips: '冷冻室密封防脱水干缩',
  },
  {
    name: '鲈鱼',
    category: '水产类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['鱼', '鲜鱼', '鲫鱼', '草鱼', '黑鱼', '桂鱼'],
    tips: '去鳞去内脏洗净擦干，保鲜袋封好冷藏1~2天内烹调',
  },
  {
    name: '三文鱼',
    category: '水产类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['大西洋鲑'],
    tips: '刺身生食级别需严格在24小时内食用，煎熟可在48小时内',
  },
  {
    name: '螃蟹',
    category: '水产类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['大闸蟹', '梭子蟹', '青蟹'],
    tips: '活蟹盖湿毛巾冷藏；死蟹绝对不可食用',
  },
  {
    name: '花甲',
    category: '水产类',
    location: '冷藏室',
    shelfLifeDays: 1,
    aliases: ['蛤蜊', '蛏子', '花蛤', '文蛤'],
    tips: '鲜活贝类吐沙后尽快烹饪，不耐久存',
  },
  {
    name: '鱿鱼',
    category: '水产类',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['墨鱼', '八爪鱼', '章鱼'],
  },

  // ================= 蛋奶豆制品 =================
  {
    name: '豆腐',
    category: '豆制品',
    location: '冷藏室',
    shelfLifeDays: 2,
    aliases: ['老豆腐', '嫩豆腐', '南豆腐', '北豆腐', '内酯豆腐'],
    tips: '新鲜豆腐浸没在凉白开中冷藏可延长1天，略发酸发黏即不可食用',
  },
  {
    name: '豆干',
    category: '豆制品',
    location: '冷藏室',
    shelfLifeDays: 5,
    aliases: ['香干', '豆腐干', '素鸡'],
    tips: '密封冷藏，表面出水发滑则表示变质',
  },
  {
    name: '豆皮',
    category: '豆制品',
    location: '冷藏室',
    shelfLifeDays: 4,
    aliases: ['千张', '百叶', '腐竹'],
  },
  {
    name: '豆浆',
    category: '豆制品',
    location: '冷藏室',
    shelfLifeDays: 2,
    tips: '自制鲜豆浆需煮沸，冷藏不宜超过24~48小时',
  },
  {
    name: '鲜牛奶',
    category: '乳制品',
    location: '冰箱门架',
    shelfLifeDays: 7,
    aliases: ['牛奶', '巴氏奶', '纯牛奶'],
    tips: '巴氏鲜奶开封后必须冷藏并在48小时内饮用完毕',
  },
  {
    name: '酸奶',
    category: '乳制品',
    location: '冷藏室',
    shelfLifeDays: 14,
    aliases: ['风味发酵乳', '酸牛奶'],
    tips: '活菌型酸奶需2~6℃恒温冷藏，避免涨气',
  },
  {
    name: '奶酪',
    category: '乳制品',
    location: '冷藏室',
    shelfLifeDays: 25,
    aliases: ['芝士', '起司', '马苏里拉'],
  },
  {
    name: '黄油',
    category: '乳制品',
    location: '冷藏室',
    shelfLifeDays: 60,
    aliases: ['牛油'],
    tips: '锡纸密封避免吸收冰箱异味',
  },

  // ================= 调料与葱姜配料 =================
  {
    name: '小葱',
    category: '蔬菜类',
    location: '冷藏室',
    shelfLifeDays: 7,
    aliases: ['葱', '香葱', '大葱', '大葱段'],
    tips: '沥干水分切段放入保鲜盒，或留根部水培保鲜',
  },
  {
    name: '香菜',
    category: '蔬菜类',
    location: '保鲜抽屉',
    shelfLifeDays: 5,
    aliases: ['芫荽'],
    tips: '根部插入清水中冷藏，叶片可保持脆绿一周',
  },
  {
    name: '生抽',
    category: '调味品',
    location: '常温避光',
    shelfLifeDays: 180,
    aliases: ['老抽', '酱油', '味极鲜'],
    tips: '阴凉干燥常温避光存放，拧紧瓶盖',
  },
  {
    name: '蚝油',
    category: '调味品',
    location: '冰箱门架',
    shelfLifeDays: 90,
    tips: '【重要常识】开封后极易生霉，必须放冰箱冷藏！',
  },
  {
    name: '料酒',
    category: '调味品',
    location: '常温避光',
    shelfLifeDays: 180,
    aliases: ['花雕酒', '黄酒'],
  },
  {
    name: '醋',
    category: '调味品',
    location: '常温避光',
    shelfLifeDays: 180,
    aliases: ['陈醋', '香醋', '米醋', '白醋'],
  },
  {
    name: '豆瓣酱',
    category: '调味品',
    location: '冰箱门架',
    shelfLifeDays: 90,
    aliases: ['郫县豆瓣', '黄豆酱'],
    tips: '开封后冷藏，用干净干燥勺子挖取避免发霉',
  },
  {
    name: '芝麻油',
    category: '调味品',
    location: '常温避光',
    shelfLifeDays: 120,
    aliases: ['香油', '麻油'],
  },

  // ================= 主食面点 =================
  {
    name: '鲜面条',
    category: '主食面点',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['手擀面', '拉面', '生面条'],
    tips: '撒干淀粉防粘，若吃不完可冷冻保存一个月',
  },
  {
    name: '饺子皮',
    category: '主食面点',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['馄饨皮', '云吞皮'],
  },
  {
    name: '吐司',
    category: '主食面点',
    location: '常温避光',
    shelfLifeDays: 4,
    aliases: ['面包', '切片面包'],
    tips: '常温密封保存；切忌冷藏（会加速淀粉老化发硬），吃不完可直接冷冻',
  },
  {
    name: '馒头',
    category: '主食面点',
    location: '冷藏室',
    shelfLifeDays: 3,
    aliases: ['花卷', '包子'],
    tips: '3天内吃放冷藏；多余应立即密封冷冻(30天)',
  },
];

/**
 * 根据用户输入的食材名称进行模糊匹配与常识匹配
 * 优先精确匹配，再匹配别名，再进行双向包含模糊匹配
 */
export function matchIngredientKnowledge(rawInput: string): IngredientKnowledge | null {
  if (!rawInput || !rawInput.trim()) return null;
  const input = rawInput.trim().toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  if (!input) return null;

  // 1. 完全精确匹配名称
  let found = INGREDIENT_KNOWLEDGE_BASE.find(
    (item) => item.name.toLowerCase() === input
  );
  if (found) return found;

  // 2. 完全匹配别名
  found = INGREDIENT_KNOWLEDGE_BASE.find((item) =>
    item.aliases?.some((alias) => alias.toLowerCase() === input)
  );
  if (found) return found;

  // 3. 用户输入包含知识库食材名（如输入 "新鲜西红柿"、"红烧排骨"、"优质大蒜头"）
  // 优先选取匹配长度最长的一项（如"五花肉"优于"肉"）
  const containsMatches = INGREDIENT_KNOWLEDGE_BASE.filter(
    (item) =>
      input.includes(item.name.toLowerCase()) ||
      item.aliases?.some((alias) => input.includes(alias.toLowerCase()))
  );
  if (containsMatches.length > 0) {
    containsMatches.sort((a, b) => b.name.length - a.name.length);
    return containsMatches[0];
  }

  // 4. 知识库食材名包含用户输入（如输入 "番茄" 匹配 "番茄"、输入 "白菜" 匹配 "小白菜"）
  found = INGREDIENT_KNOWLEDGE_BASE.find(
    (item) =>
      item.name.toLowerCase().includes(input) ||
      item.aliases?.some((alias) => alias.toLowerCase().includes(input))
  );
  if (found) return found;

  return null;
}

/**
 * 搜索食材智能推荐候选列表（用于输入框下拉联想）
 */
export function searchIngredientSuggestions(
  rawInput: string,
  limit: number = 4
): IngredientKnowledge[] {
  if (!rawInput || !rawInput.trim()) return [];
  const input = rawInput.trim().toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
  if (!input) return [];

  const scored: Array<{ item: IngredientKnowledge; score: number }> = [];

  for (const item of INGREDIENT_KNOWLEDGE_BASE) {
    const name = item.name.toLowerCase();
    let score = 0;

    if (name === input) {
      score = 100;
    } else if (item.aliases?.some((a) => a.toLowerCase() === input)) {
      score = 95;
    } else if (input.includes(name)) {
      score = 80 + name.length;
    } else if (name.includes(input)) {
      score = 70 + (input.length / name.length) * 10;
    } else if (
      item.aliases?.some(
        (a) => input.includes(a.toLowerCase()) || a.toLowerCase().includes(input)
      )
    ) {
      score = 60;
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
