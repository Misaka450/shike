import { InventoryItem, Recipe, RecipeRecommendation } from './types';

export interface MissingIngredientItem {
  name: string;
  amount: string;
  required?: boolean;
}

/**
 * 标准化食材名称用于匹配
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
}

/**
 * 精准计算菜谱缺少的食材清单（差额买菜清单）
 */
export function calculateMissingIngredients(
  recipe: Recipe | RecipeRecommendation,
  inventory: InventoryItem[] = []
): MissingIngredientItem[] {
  const rec = recipe as RecipeRecommendation;

  // 1. 若后端推荐接口已直接提供 missing_ingredients，优先使用
  if (Array.isArray(rec.missing_ingredients) && rec.missing_ingredients.length > 0) {
    return rec.missing_ingredients.map((m) => ({
      name: m.name,
      amount: m.amount || '适量',
      required: m.required ?? true,
    }));
  }

  // 2. 若已有 matched_ingredients，差额即为全量配料去除已匹配配料
  if (Array.isArray(rec.matched_ingredients) && rec.matched_ingredients.length > 0) {
    const matchedNames = new Set(
      rec.matched_ingredients.map((m) => normalizeName(m.recipe_ingredient))
    );
    const missing = recipe.ingredients.filter(
      (ing) => !matchedNames.has(normalizeName(ing.name))
    );
    if (missing.length > 0) {
      return missing.map((m) => ({
        name: m.name,
        amount: m.amount || '适量',
        required: m.required ?? true,
      }));
    }
  }

  // 3. 兜底回退：比对当前活跃库存列表
  const activeInv = inventory.filter((item) => item.status === 'active');
  const missingFromInv = recipe.ingredients.filter((rIng) => {
    const normR = normalizeName(rIng.name);
    const isMatched = activeInv.some((inv) => {
      const normI = normalizeName(inv.name);
      return normI.includes(normR) || normR.includes(normI);
    });
    return !isMatched;
  });

  return missingFromInv.map((m) => ({
    name: m.name,
    amount: m.amount || '适量',
    required: m.required ?? true,
  }));
}

/**
 * 将缺少的食材及份量整理为优雅的待办清单文本
 */
export function generateShoppingListText(
  recipe: Recipe | RecipeRecommendation,
  missing: MissingIngredientItem[]
): string {
  const dateStr = new Date().toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });

  const missingList = missing
    .map((item, idx) => `  ${idx + 1}. [ ] ${item.name} (${item.amount || '适量'})`)
    .join('\n');

  return `🛒【食刻 AI · 差额买菜补货清单】
菜谱名称：《${recipe.name}》
生成日期：${dateStr} | 烹饪难度：${recipe.difficulty || '家常'} · ${recipe.cook_time || 15}分钟

【需补齐食材 · 共 ${missing.length} 样】
${missingList}

------------------------------
💡 贴士：买好后直接打开食刻 AI，一键照着步骤做，美味即刻开饭！`;
}

/**
 * 复制文本到系统剪贴板（兼容各端浏览器环境与降级方案）
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 现代浏览器标准 API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降级到传统 input/execCommand
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
