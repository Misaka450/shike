# 食刻 AI 增量技术审计报告（第二轮）

> 审计日期：2026-09-18
> 审计范围：上一轮整改后新拉取的 5 个提交（`287cecc` → `6856655`）
> 审计方式：增量源码审计 + 全量测试（49 项）+ 前后端构建验证
> 本轮不重复第一轮报告（AUDIT_REPORT.md）中已修复的问题

---

## 一、本轮变更概览

| 提交 | 主题 | 变更性质 |
| --- | --- | --- |
| `287cecc` | 扩充开源中文菜谱库、优化移动端 UI 与图片匹配 | 数据 + UI |
| `e054165` | 替换为实网验证的高清真实中餐菜品实拍图 | 静态资源 |
| `9157976` | 多模态严格把关体系，全量更新高质量 WebP 封面 | 资源 + 工具 |
| `2ff3f51` | 常规推荐引擎彻底隔离 AI 菜谱 | 业务逻辑 |
| `6856655` | 支持沙拉类菜谱与专属高清封面 | 数据 |

**新增内容**：50 条扩展菜谱（`expandedRecipes.ts` 62KB）、27 张本地 WebP 封面（约 4MB）、菜谱智能配图模块、AI 菜谱删除功能、5 个 Python 运维脚本、24 项新增单元测试。

**基线验证**：后端 49/49 测试通过、`tsc` 编译通过、前端 `next build` 通过（仅 4 条既有的 `<img>` 优化建议）。

---

## 二、问题清单

本轮共发现 **6 项问题**：P1 × 1、P2 × 2、P3 × 3。未发现 P0 级阻断性问题。

### 2.1 P1 高优先级

---

#### NEW-01【P1】删除 AI 菜谱缺少归属校验，任意用户可删除他人菜谱

**位置**
- [deleteRecipe](file:///d:/code/Antigravity/shike/backend/src/services/recipeService.ts#L350-L363)
- [DELETE /:id 路由](file:///d:/code/Antigravity/shike/backend/src/routes/recipes.ts#L58-L88)

**问题描述**

`deleteRecipe(id)` 只校验了 ID 是否以 `ai-recipe-` 开头（防止误删系统内置菜谱），但**没有校验该菜谱是不是当前用户生成的**：

```ts
// recipeService.ts:350 —— 只有前缀检查，没有用户归属检查
export function deleteRecipe(id: string): boolean {
  if (!id || !id.startsWith('ai-recipe-')) {
    throw new RecipeError('仅允许删除 AI 定制菜谱...', 403, 'FORBIDDEN');
  }
  const result = db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
  ...
}
```

根本原因是 AI 菜谱存储在**全局共享的 `recipes` 表**中，该表没有 `user_id` 字段。ID 格式为 `ai-recipe-${毫秒时间戳}-${序号}`（[recipeService.ts:576](file:///d:/code/Antigravity/shike/backend/src/services/recipeService.ts#L576)），时间戳可在小范围内枚举。

**影响**

- 用户 B 只要拿到（或猜到）用户 A 刚生成的菜谱 ID，就能删掉 A 的菜谱
- 结合前端删除按钮直接暴露在卡片上（[page.tsx:731-738](file:///d:/code/Antigravity/shike/frontend/src/app/page.tsx#L731-L738)），任何登录用户都能对全局 AI 菜谱执行删除
- 多用户场景下，一个用户的删除操作会影响所有人生成的内容

**修复建议（二选一，取决于产品定位）**

- **方案 A（AI 菜谱属用户私有，推荐）**：`recipes` 表对 AI 菜谱增加 `owner_id` 字段（内置菜谱为 NULL），删除时校验 `owner_id = 当前用户`
- **方案 B（AI 菜谱视为公共内容）**：普通用户不允许删除，仅管理员可删；前端移除删除按钮

---

### 2.2 P2 中优先级

---

#### NEW-02【P2】AI 菜谱"全局共享存储 + 全局 50 条上限"，多用户互相挤占

**位置**：[recipeService.ts:618-628](file:///d:/code/Antigravity/shike/backend/src/services/recipeService.ts#L618-L628)

**问题描述**

AI 菜谱写入全局 `recipes` 表，数量控制也是全局的：

```ts
// 只保留全局最近 50 条 AI 菜谱
DELETE FROM recipes WHERE id LIKE 'ai-recipe-%'
  AND id NOT IN (SELECT id ... ORDER BY created_at DESC LIMIT 50)
```

**影响**

- 10 个用户各生成 3 道 = 30 条；当超过 50 条时，**较早生成的用户的菜谱会被后来的用户挤掉**，而此时创建者可能正在查看或准备烹饪
- 上限清理按 `created_at` 排序，删除动作没有任何归属判断
- 与 NEW-01 同源：数据模型把"用户级临时内容"放进了"全局内容表"

**修复建议**：与 NEW-01 一并处理。若走方案 A（私有），上限改为**每用户 50 条**（`WHERE owner_id = ?`）；或更彻底地把 AI 菜谱存入独立表，不与内置菜谱混放。

---

#### NEW-03【P2】删除菜谱后，烹饪历史中的引用成为悬空记录

**位置**：删除操作（recipeService.ts:350）与烹饪历史表 `cooking_history.recipe_id`

**问题描述**

用户可以先烹饪一道 AI 菜谱（写入 `cooking_history`，含 `recipe_id`），之后该菜谱被删除。历史记录虽然冗余存了 `recipe_name`（列表页还能显示菜名），但：

- `getRecipeById(history.recipe_id)` 将返回 null，无法回看菜谱详情
- 若未来上线"从历史记录再做一次"功能，会直接报错

**影响**：数据一致性问题，当前功能下影响有限，但会在扩展历史详情时踩坑。

**修复建议**：成本最低的做法是删除时不物理删除，改为软删除（`recipes` 增加 `deleted_at`，列表与推荐过滤掉、但历史仍可关联）；或在历史表中冗余完整菜谱快照（ingredients/instructions）。

---

### 2.3 P3 低优先级

---

#### NEW-04【P3】`recipeImage.ts` 中存在恒为 false 的死代码

**位置**：[recipeImage.ts:118](file:///d:/code/Antigravity/shike/backend/src/utils/recipeImage.ts#L118) 与 [windowOrEmpty](file:///d:/code/Antigravity/shike/backend/src/utils/recipeImage.ts#L343-L345)

```ts
if (
  (('西红柿' in windowOrEmpty(name) || name.includes('西红柿') || name.includes('番茄')) && ...)
)

function windowOrEmpty(str: string): string[] {
  return [str];
}
```

**问题**：`in` 操作符作用于数组时检查的是**索引/属性名**，数组只有索引 `'0'`，因此 `'西红柿' in [任意字符串]` **永远为 false**。当前功能靠后面的 `name.includes('西红柿')` 兜底才没出错，但这行代码具有误导性，且 `windowOrEmpty` 这个命名暗示浏览器 `window` 对象，实际运行在 Node 后端，容易让后续维护者误判。

**修复**：直接删除 `'西红柿' in windowOrEmpty(name) ||` 与 `windowOrEmpty` 函数。

---

#### NEW-05【P3】运维脚本硬编码生产路径、缺少使用说明与依赖声明

**位置**：[scripts/](file:///d:/code/Antigravity/shike/scripts)（5 个 Python 脚本）

**问题**

- 全部硬编码 `DB_PATH = /opt/shike-ai/data/db/shike.db` 与 `/tmp/HowToCook/...`（如 [import_howtocook.py:18-19](file:///d:/code/Antigravity/shike/scripts/import_howtocook.py#L18-L19)），Windows / 本地环境无法运行
- 直接连接并写入数据库文件，**多数脚本没有 dry-run 或备份提示**，误执行会改动生产数据
- 无 `requirements.txt`、无 `scripts/README.md` 说明执行顺序与前置条件
- 脚本中的图片 URL 映射表与后端 [recipeImage.ts](file:///d:/code/Antigravity/shike/backend/src/utils/recipeImage.ts) 内容大量重复，后续修改容易两边不一致

**修复建议**：增加 `scripts/README.md`（执行顺序 + 先备份数据库的警告）；路径改为命令行参数或环境变量；图片映射表抽成单一 JSON 数据源，Python 与 TypeScript 共同读取。

---

#### NEW-06【P3】菜品封面依赖外部 Unsplash 链接，存在可用性隐患

**位置**：[recipeImage.ts:9-87](file:///d:/code/Antigravity/shike/backend/src/utils/recipeImage.ts#L9-L87)

**问题**：24 类映射中有 23 类指向 `images.unsplash.com`，仅番茄炒蛋使用本地 WebP。虽然 [next.config.mjs](file:///d:/code/Antigravity/shike/frontend/next.config.mjs) 已配置该域名白名单，但：网络受限环境（国内服务器/内网部署）下图片可能加载缓慢或失败；`w=500` 固定尺寸在高分屏上清晰度一般。

**缓解因素**：前端 `<img onError>` 有本地兜底图，不会出现裂图。

**修复建议**：本轮已新增 27 张本地 `dishes/*.webp`，建议逐步把高频分类（肉类、海鲜、主食等）迁移到本地，Unsplash 仅作长尾兜底。

---

## 三、值得肯定的部分

1. **删除接口的内置菜谱保护到位**：前缀白名单（仅 `ai-recipe-` 可删）+ 自定义 `RecipeError` 携带正确的 403/404 状态码，路由层错误处理规范，[测试覆盖](file:///d:/code/Antigravity/shike/backend/src/services/__tests__/deleteRecipe.test.ts)了 6 种边界（含空值、不存在、越权删内置菜谱）。
2. **常规推荐与 AI 菜谱严格隔离**：[recommendRecipes:381](file:///d:/code/Antigravity/shike/backend/src/services/recipeService.ts#L381) 显式跳过 `ai-recipe-`，并有专门测试保证"即使库里存在 AI 菜谱也不会混入推荐列表"，产品边界清晰。
3. **配图模块的干扰词处理细致**：正确处理了"鱼香肉丝≠鱼类"、"鸡蛋≠鸡肉"、"松饼≠面饼"等中文语义陷阱（[recipeImage.ts:109-114](file:///d:/code/Antigravity/shike/backend/src/utils/recipeImage.ts#L109-L114)），并配了 16 项测试。
4. **测试文化持续保持**：本轮新增 24 项测试（删除 6 + 推荐隔离 2 + 配图 16），全量 49 项通过，且全部使用内存数据库、不污染本地数据。
5. **前端删除交互稳妥**：二次确认弹窗 + 阻止事件冒泡（避免点删除时误触卡片打开详情）+ 删除后同步关闭已打开的弹窗。

---

## 四、整改优先级建议

| 顺序 | 任务 | 编号 | 工作量 |
| --- | --- | --- | --- |
| 1 | AI 菜谱增加 `owner_id` 归属，删除与数量上限改为按用户维度 | NEW-01 / NEW-02 | 中（含一次数据库迁移） |
| 2 | 评估 AI 菜谱删除策略（软删除或快照），保护烹饪历史引用 | NEW-03 | 小 |
| 3 | 清理 `recipeImage.ts` 死代码 | NEW-04 | 极小 |
| 4 | 为 scripts 补充 README、备份警告、路径参数化 | NEW-05 | 小 |
| 5 | 高频封面图逐步本地化 | NEW-06 | 按需 |

> NEW-01 是本轮唯一建议尽快处理的问题：在单用户自托管场景下几乎无感，但一旦有多个人同时使用（例如家庭成员各自登录），就会出现"我生成的菜被别人删了"的真实投诉。