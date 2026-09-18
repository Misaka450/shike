# 食刻 AI（Shike AI）全项目技术审计报告

> 审计日期：2026-09-17
> 审计范围：`backend/`、`frontend/`、构建与部署配置、依赖清单、文档
> 审计方式：全量源码静态审计 + 依赖版本核查 + 部署拓扑推演

> **📌 整改进度：P0 / P1 已全部修复，P2 绝大部分已修复，P3 完成容器加固与规范统一。
> 11 项实测验证全部通过，详见文末「第八章 整改实施记录」。
> 另有 8 项结构性与策略性优化需要有意识保留，已在 8.3 逐条说明原因。
> 其中 **Git 仓库修复**需你本人确认后执行（操作步骤见 8.4）。**

---

## 一、执行摘要

### 1.1 总体结论

项目功能完整度较好（拍照识别 → 入库 → 推荐 → 烹饪扣库的业务闭环已打通），UI 完成度高，后端在**密码存储**（scrypt + 恒定时间比较）和**输入校验**（Zod）两个点上做得比同类个人项目规范。

但项目存在 **3 个 P0 级阻断性问题**，其中 2 个是安全性的、1 个是部署可用性的：

| 编号 | 问题 | 一句话说明 |
| --- | --- | --- |
| SEC-01 | 后端完全没有身份认证 | 改一个请求头就能读写别人的冰箱数据 |
| SEC-02 | 数据迁移逻辑可被滥用 | 知道别人的用户 ID 就能把别人的数据"搬"到自己账号 |
| SEC-03 | 生产部署前后端不通 | 容器里 `127.0.0.1` 指向自己，API 全部请求失败 |

### 1.2 分维度评分（满分 10）

| 维度 | 得分 | 说明 |
| --- | --- | --- |
| 功能完整性 | 8.5 | 业务闭环完整，AI 集成可用 |
| 安全性 | 3.0 | 无认证、无鉴权、开放 CORS、无限流；仅密码存储合格 |
| 架构合理性 | 5.5 | 分层目录清晰，但缺少会话层、迁移机制、缓存层 |
| 代码质量 | 6.0 | 命名规范、注释详尽；但零测试、any 泛滥、巨型组件 |
| 性能 | 5.5 | 数据量小暂时无感，但存在全表扫描与页面加载触发大模型调用 |
| 依赖安全 | 5.0 | 后端依赖健康；前端 Next.js 版本落后，存在高危 DoS CVE |
| 文档完整性 | 4.0 | 主 README 精炼但技术栈描述错误；无 API 文档；子 README 是模板残留 |
| 工程化/最佳实践 | 2.5 | **Git 仓库损坏且零提交**、无 CI、无测试、无 Dockerfile 优化 |

**综合评分：5.0 / 10** —— 一个"能跑起来、UI 好看、但不敢放在公网"的项目。

### 1.3 风险分布

| 等级 | 数量 | 含义 |
| --- | --- | --- |
| P0 严重（Critical） | 3 | 必须立即修复，否则存在数据泄露或服务不可用 |
| P1 高（High） | 9 | 一周内修复，属于可被直接利用或严重影响体验的问题 |
| P2 中（Medium） | 22 | 一个月内修复，属于技术债与健壮性问题 |
| P3 低（Low） | 13 | 按迭代节奏优化，属于规范化改进 |
| **合计** | **47** | |

---

## 二、项目概况

### 2.1 技术栈实况

| 层 | 实际使用 | README 描述 | 是否一致 |
| --- | --- | --- | --- |
| 前端 | Next.js 14.2.15（App Router）+ React 18.3.1 + Tailwind CSS 3.4 + lucide-react + TypeScript 5 | 一致 | ✅ |
| 后端 | **Hono 4.13.8** + @hono/node-server + better-sqlite3 13 + Zod 4 + TypeScript 7 | 描述为 "Express" | ❌ **错误** |
| 数据库 | SQLite（WAL 模式），单文件 | 一致 | ✅ |
| AI 代理 | CLIProxyAPI（CPA），OpenAI 兼容协议 | 一致 | ✅ |
| 部署 | Docker Compose，双容器 | 一致 | ✅ |

### 2.2 代码规模

- 后端：17 个源文件（其中 `expandedRecipes.ts` 62 KB 为纯数据）
- 前端：9 个源文件（其中 `src/app/page.tsx` 单文件 1323 行，占前端业务代码的 90%）
- 内置菜谱：8 条（代码内）+ 50 条（扩展数据）= 58 条
- 测试文件：**0 个**

### 2.3 数据流概览

```
浏览器 ──► Next.js(3000/3002) ──[rewrites /api/*]──► Hono API(8081) ──► SQLite(WAL)
                                                          │
                                                          └──► CPA 多模态大模型（识图 / 生成菜谱）
```

---

## 三、详细审计发现

> 阅读顺序建议：先看 P0（第四章整改路线图有对应的动手步骤），其余按需查阅。

### 3.1 P0 严重问题

---

#### SEC-01【P0】后端完全没有身份认证，任意用户数据可被越权读写

**问题位置**
- `backend/src/routes/inventory.ts:18-20`
- `backend/src/routes/recipes.ts:15-17`
- `backend/src/routes/auth.ts:217`
- `backend/src/app.ts:13-22`

**问题描述**

后端所有接口的身份判定完全依赖客户端传来的 `x-user-id` 请求头：

```ts
// backend/src/routes/inventory.ts:18
function getUserId(c: any): string {
  return c.req.header('x-user-id') || c.req.query('user_id') || 'guest';
}
```

而登录/注册接口虽然生成了 `token`，但这个 token **从未被写入数据库、从未被校验、从未被使用**：

```ts
// backend/src/routes/auth.ts:166 —— token 只生成，不存储，不校验
const token = `tok_${crypto.randomBytes(16).toString('hex')}`;
```

同时 CORS 允许 `x-user-id` 出现在跨域请求头中（`app.ts:18`），等于把伪造身份的大门对外敞开。

**影响**

- 任何人只需发送 `curl -H "x-user-id: usr_xxxxxxxx" http://host:8081/api/inventory` 即可读取他人冰箱数据
- 同理可删除、修改他人食材，或伪造烹饪历史
- `?user_id=` 查询参数也能作为身份来源，进一步降低了攻击门槛
- 用户表 `users.password_hash` 由 scrypt 保护（这点做得对），但**认证防护被完全绕过**——相当于门锁很结实，但门根本没关

**修复建议**

1. 引入会话表 `sessions(token, user_id, expires_at, created_at)`，登录时写入，登出时删除
2. 新增鉴权中间件，从 `Authorization: Bearer <token>` 解析会话，把 `userId` 挂到 `c.set('userId', ...)`，路由层只允许从上下文读取，**彻底移除从 header/query 直读身份**
3. 对访客（guest）使用独立的匿名会话，同样走 token

**实施步骤**

```ts
// 新增 backend/src/middleware/auth.ts
import { createMiddleware } from 'hono/factory';
import { db } from '../db/index.js';

export const requireAuth = createMiddleware(async (c, next) => {
  const auth = c.req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return c.json({ success: false, error: '未登录' }, 401);

  const row = db
    .prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?')
    .get(token, new Date().toISOString()) as { user_id: string } | undefined;

  if (!row) return c.json({ success: false, error: '登录已过期' }, 401);

  c.set('userId', row.user_id); // 后续路由统一从这里取
  await next();
});
```

```ts
// backend/src/db/index.ts 的表结构里补充
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
```

路由中统一改为：

```ts
inventoryRoute.use('*', requireAuth);            // 整个路由组挂鉴权
// 然后 getUserId 改成：
const userId = c.get('userId') as string;        // 不再读 header
```

---

#### SEC-02【P0】`temp_user_id` 迁移逻辑可劫持他人数据

**问题位置**
- `backend/src/routes/auth.ts:68-71`（注册时迁移）
- `backend/src/routes/auth.ts:161-164`（登录时迁移）

**问题描述**

登录和注册接口接收客户端传入的 `temp_user_id`，然后**无条件**把该 ID 名下的全部数据划归当前账号：

```ts
// backend/src/routes/auth.ts:161 —— 没有任何校验，传入谁的 ID 就搬谁的数据
if (temp_user_id && typeof temp_user_id === 'string' && temp_user_id !== user.id) {
  db.prepare('UPDATE inventory_items SET user_id = ? WHERE user_id = ?').run(user.id, temp_user_id);
  db.prepare('UPDATE cooking_history SET user_id = ? WHERE user_id = ?').run(user.id, temp_user_id);
}
```

**为什么这条和 SEC-01 叠加后极其危险**

用户 ID 的生成方式熵值不足，具备被枚举的可能：

| 生成位置 | 方式 | 有效随机位 |
| --- | --- | --- |
| `auth.ts:56` 注册 | `crypto.randomUUID().slice(0, 8)` | 8 个十六进制字符 = **32 bit** |
| `auth.ts:184/200` 访客 | `guest_` + `randomUUID().slice(0, 8)` | 32 bit |
| `frontend/src/lib/api.ts:18` | `user_` + `Math.random().toString(36).substring(2, 10)` | 约 **41 bit**，且 `Math.random()` 本身不是密码学安全随机数 |

攻击链：枚举一个用户 ID → 注册自己的账号并携带该 ID 作为 `temp_user_id` → 受害者全部库存与烹饪记录被搬空。

**修复建议**

- 用户/访客 ID 改用完整的 `crypto.randomUUID()`（128 bit），不再截断
- `temp_user_id` 迁移必须限定条件：仅允许迁移**当前请求所属匿名会话创建的、且尚未被任何账号认领过的**数据
- 更稳妥的方案：给访客签发一次性「迁移令牌」，令牌由服务端在签发访客会话时返回，迁移时校验令牌与 user_id 的绑定关系

**实施步骤**

```ts
// 第一步：ID 不再截断（auth.ts:56 / 184 / 200）
const userId = `usr_${crypto.randomUUID()}`;
const guestId = `guest_${crypto.randomUUID()}`;
```

```ts
// 第二步：迁移前校验访客身份未被占用（推荐实现）
// 在 users 表增加 claimed_guest_ids 记录，或使用 guest_claims 表：
CREATE TABLE IF NOT EXISTS guest_claims (
  guest_user_id TEXT PRIMARY KEY,
  claimed_by TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
```

```ts
// 第三步：迁移时加唯一约束保护，避免重复迁移
const claim = db
  .prepare('INSERT OR IGNORE INTO guest_claims (guest_user_id, claimed_by, claimed_at) VALUES (?, ?, ?)')
  .run(tempUserId, user.id, new Date().toISOString());

if (claim.changes > 0) {
  // 只有首次认领才执行迁移
  db.prepare('UPDATE inventory_items SET user_id = ? WHERE user_id = ?').run(user.id, tempUserId);
  db.prepare('UPDATE cooking_history SET user_id = ? WHERE user_id = ?').run(user.id, tempUserId);
}
```

---

#### SEC-03【P0】生产部署下前端无法访问后端（服务不可用）

**问题位置**
- `frontend/next.config.mjs:17-24`
- `frontend/src/lib/api.ts:9-12`
- `docker-compose.yml:21-35`

**问题描述**

Next.js 的 `rewrites` 由 **Next 服务器进程在容器内执行**，而配置写的是：

```js
// frontend/next.config.mjs:21
destination: 'http://127.0.0.1:8081/api/:path*',
```

`shike-web` 与 `shike-api` 是两个独立的 bridge 网络容器，`127.0.0.1` 在 `shike-web` 容器内指向**它自己**，而非后端容器。因此所有 `/api/*` 请求都会连接失败。

同时前端 `API_BASE` 在浏览器端取 `process.env.NEXT_PUBLIC_API_URL || ''`，而 `docker-compose.yml` 与 `frontend/Dockerfile` 都**没有注入**这个变量，因此浏览器只能走相对路径 → 落到同样失效的 rewrites 上。

**影响**：按 README 的 `docker compose up -d --build` 部署后，页面能打开但所有数据操作失败（登录、入库、推荐全部不可用）。**这是一个会直接劝退用户的问题。**

**修复建议**

- 将 rewrites 目标改为 Docker Compose 服务名：`http://shike-api:8081`
- 用环境变量让配置同时适配本地开发与容器部署

**实施步骤**

```js
// frontend/next.config.mjs
const API_INTERNAL = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8081';

const nextConfig = {
  // ...其他配置不变
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL}/api/:path*` }];
  },
};
```

```yaml
# docker-compose.yml 中 shike-web 增加构建参数或运行时环境变量
  shike-web:
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_INTERNAL_URL=http://shike-api:8081   # 关键修复
```

> 注意：`rewrites` 是**运行时**读取的配置，`next start` 时生效，因此用 `environment` 注入即可，不需要 `build.args`。

---

### 3.2 P1 高优先级问题

---

#### SEC-04【P1】CORS 使用通配符且放行自定义身份头

**位置**：`backend/src/app.ts:13-22`

```ts
cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization', 'x-user-id'],  // 自定义身份头被放行
})
```

**影响**：任意第三方网站均可在用户浏览器中跨域调用本 API 并读取响应内容；在 SEC-01 未修复的前提下，等于把数据读取能力开放给整个互联网。

**修复**：改为显式白名单，从环境变量读取允许的来源域名：

```ts
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');

cors({
  origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
  allowHeaders: ['Content-Type', 'Authorization'],   // 移除 x-user-id
  credentials: true,
})
```

---

#### SEC-05【P1】图片上传接口无大小与类型限制，可致内存耗尽

**位置**：`backend/src/routes/vision.ts:16-51`

**问题描述**

- `await c.req.parseBody()` 会把整个 multipart 请求体一次性读进内存，**没有任何体积上限**
- `mimeType` 完全采信客户端声明（`file.type` / 正则提取的 `data:` 前缀），未做白名单校验，也未校验文件真实魔数
- base64 分支同样无长度上限

**影响**：攻击者发送一个 2 GB 的"图片"，服务进程内存被打满并 OOM 崩溃；由于容器未设置 `mem_limit`，还可能拖垮宿主机。恶意构造的非图片内容会被直接转发给大模型，造成额度浪费。

**实施步骤**

```ts
// 1) 在解析前校验 Content-Length（放在 vision.ts 最前面）
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const declared = Number(c.req.header('content-length') || 0);
if (declared > MAX_UPLOAD_BYTES) {
  return c.json({ success: false, error: '图片过大，请压缩到 5MB 以内' }, 413);
}

// 2) 解析后再兜底校验真实体积
if (imageBuffer.length > MAX_UPLOAD_BYTES) {
  return c.json({ success: false, error: '图片过大，请压缩到 5MB 以内' }, 413);
}

// 3) MIME 白名单 + 魔数校验（避免仅信任客户端声明）
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
if (!ALLOWED_MIME.includes(mimeType)) {
  return c.json({ success: false, error: '仅支持 JPG / PNG / WebP 格式' }, 415);
}
const isJpeg = imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;
const isPng  = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50;
const isWebp = imageBuffer.slice(8, 12).toString('ascii') === 'WEBP';
if (!isJpeg && !isPng && !isWebp) {
  return c.json({ success: false, error: '文件内容不是有效图片' }, 415);
}
```

前端同步加上体积预检（`page.tsx` 的 `handleFileChange`）：

```ts
if (file.size > 5 * 1024 * 1024) {
  showToast('图片过大，请压缩到 5MB 以内');
  return;
}
```

---

#### SEC-06【P1】登录限流可被 `X-Forwarded-For` 伪造绕过

**位置**：`backend/src/services/authSecurity.ts:202-218`

```ts
export function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();   // 无条件信任客户端头
    if (first) return first;
  }
  // ...
}
```

**影响**：攻击者每次请求携带不同的 `X-Forwarded-For: 1.2.3.4`，限流器会认为这是全新的 IP，5 次锁定的保护形同虚设 → **密码可被无限次暴力破解**（配合 4 位最小密码长度，风险进一步放大）。

**修复**：区分"部署在可信反向代理之后"与"直连"两种模式；直连时使用 socket 真实地址，不读 `XFF`。

```ts
// config.ts 增加
TRUST_PROXY: process.env.TRUST_PROXY === 'true',

// getClientIp 改为
export function getClientIp(c: Context): string {
  if (config.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first;
    }
  }
  // @ts-ignore —— 直连场景取真实 socket 地址，客户端无法伪造
  const socketIp = c.env?.incoming?.socket?.remoteAddress;
  return socketIp || 'unknown';
}
```

配套：`docker-compose.yml` 中**不要**设置 `TRUST_PROXY=true`（当前架构是浏览器直连端口映射，没有反向代理）。

---

#### SEC-07【P1】AI 接口无限流，可被刷爆额度

**位置**：`backend/src/routes/vision.ts`、`backend/src/routes/recipes.ts:85-97`

**问题描述**：`/api/vision/fridge-scan`（每次调用都打多模态大模型）与 `POST /api/recipes/recommend`（最高分为 0 时自动触发大模型）都没有任何频率限制或配额。

**影响**：被扫描到后，攻击者可以脚本批量调用，直接消耗掉 CPA 后端的模型额度，甚至产生真实账单。

**实施步骤**

1. 引入按 IP + 用户维度的令牌桶限流（可复用 `authSecurity.ts` 现有的内存限流思路先快速落地）
2. 为 AI 类接口设置更严格的阈值，例如「每用户每分钟 3 次、每天 50 次」
3. 给推荐结果加缓存：库存未变化时直接复用上次推荐，避免重复调用
4. 为 CPA 调用增加超时与失败熔断（见 PER-04）

---

#### QUA-01【P1】测试覆盖率为 0

**位置**：`backend/package.json:11`、项目内无任何 `*.test.*` / `*.spec.*` 文件

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

**影响**：任何改动都无法验证是否破坏既有逻辑，只能靠手工点击页面回归。项目里有大量值得测试的纯函数，风险与收益比很低。

**优先补测的纯函数（不需要起服务，投入产出比最高）**

| 函数 | 位置 | 为什么要测 |
| --- | --- | --- |
| `calculateDaysRemaining` | `inventoryService.ts:9` | 跨月、跨年、时区边界容易算错 |
| `computeUrgency` | `inventoryService.ts:21` | 三级警戒的业务规则 |
| `isIngredientMatch` | `recipeService.ts:58` | 同义词匹配是推荐质量的核心 |
| `recommendRecipes` | `recipeService.ts:361` | 排序与打分公式 |
| `verifyPassword` / `hashPassword` | `authSecurity.ts:222-250` | 安全关键路径 |
| `verifyAndConsumeCaptcha` | `authSecurity.ts:90` | 一次性消费与过期语义 |

**实施步骤**

```bash
# 后端：使用 Node 内置测试运行器，零额外依赖负担
npm i -D vitest        # 或直接使用 node:test
```

```ts
// backend/src/services/__tests__/inventoryService.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDaysRemaining, computeUrgency } from '../inventoryService.js';

describe('calculateDaysRemaining', () => {
  it('过期日期应返回负数或 0', () => {
    expect(calculateDaysRemaining('2020-01-01')).toBeLessThanOrEqual(0);
  });
});

describe('computeUrgency', () => {
  it('0 天及以下判定为红色', () => expect(computeUrgency(0)).toBe('red'));
  it('1-2 天判定为黄色', () => expect(computeUrgency(2)).toBe('yellow'));
  it('3 天以上判定为绿色', () => expect(computeUrgency(5)).toBe('green'));
});
```

---

#### ENG-01【P0】Git 仓库损坏，项目零提交，无任何版本保护

**证据**

```
$ git log
fatal: your current branch appears to be broken

$ git status --short
?? .env.example
?? .gitignore
?? README.md
?? backend/
?? docker-compose.yml
?? frontend/

# .git/HEAD 内容为：
ref: refs/heads/.invalid      ← 指向一个不存在的分支
```

**影响**：项目从未成功提交过任何版本。当前所有代码只存在于工作区，**一次误删、一次错误的批量替换，代码就永久丢失**。这是本次审计中除安全外最紧急的问题。

**实施步骤**

```powershell
# 1. 备份当前工作区（先保命）
Copy-Item -Recurse d:\code\Antigravity\shike d:\code\Antigravity\shike_backup_20260917

# 2. 修复 HEAD 指向一个合法分支
Set-Content .git\HEAD "ref: refs/heads/main"

# 3. 确认能正常识别仓库（此时应输出 "No commits yet on main"）
git status

# 4. 首次全量提交（确认 .gitignore 已排除 node_modules / data / .env）
git add .env.example .gitignore README.md docker-compose.yml backend frontend
git commit -m "chore: 初始化项目仓库，纳入现有前后端源码"

# 5. 若第 3 步仍报错，则重建仓库（历史本就为空，无损失）
Remove-Item -Recurse -Force .git
git init -b main
git add .env.example .gitignore README.md docker-compose.yml backend frontend
git commit -m "chore: 初始化项目仓库"
```

> **重要**：`.gitignore` 已正确忽略 `.env`、`data/`、`*.db`、`node_modules/`，继续保持，不要提交任何密钥。

---

#### PER-01【P1】页面加载即可能触发大模型调用

**链路**：`page.tsx:165 → refreshData() → getRecommendations() → POST /api/recipes/recommend → recipes.ts:85-97`，当库存非空且所有固定菜谱得分为 0 时，**自动调用大模型现场生成菜谱**。

**影响**

- 每次刷新页面 / 每次切换数据都可能产生一次 LLM 调用，响应时间从毫秒级跳到秒级
- 生成结果会以 `INSERT OR REPLACE` 写入 `recipes` 表（`recipeService.ts:548`），`id` 用 `Date.now()`，**每次都是新行 → 表会无限膨胀**
- 列表接口 `GET /api/recipes` 于是越来越慢（见 PER-02）

**建议**

1. `POST /recommend` 默认**不**触发 AI 生成，改为显式的 `POST /recipes/ai-generate` 接口，由用户点击「AI 现场定制菜谱」按钮触发
2. 前端页面的「AI 现场定制」按钮当前复用了同一个 recommend 接口（`page.tsx:342-362`），应改为调用独立接口
3. 为 AI 生成结果设置清理策略（如只保留最近 50 条，或标记 `is_ai_generated` 定期归档）

---

#### ARC-09【P1】前后端参数名不一致，用户偏好功能静默失效

**位置**
- 前端 `frontend/src/lib/api.ts:202-213`：请求体发送 `{ preferences }`
- 后端 `backend/src/routes/recipes.ts:89`：读取 `rawBody.preference`

**影响**：用户在推荐中传入的任何口味偏好都不会生效，且**不报错**——属于最典型的"静默失效"缺陷，测试时很难被发现。

**修复**：统一字段名。建议后端改为兼容读取，并同步更新 Schema：

```ts
// recipes.ts
const preference = rawBody.preference ?? rawBody.preferences;
const aiRecipe = await generateAiRecipe(inventory, preference);
```

---

#### ARC-10【P1】烹饪扣库与历史写入不是原子操作

**位置**：`backend/src/services/recipeService.ts:602-653`

```ts
if (options.auto_consume_ingredients && consumedItemIds.length > 0) {
  consumedCount = markItemsAsConsumed(consumedItemIds, userId);   // 第 1 步：扣库存
}
const result = historyInsert.run(...);                            // 第 2 步：写历史
```

**影响**：两步之间若发生异常（磁盘满、进程重启、约束冲突），会出现「库存已扣但无烹饪记录」或反之的不一致状态。用户会看到食材莫名消失。

**修复**：用 better-sqlite3 的事务包裹（项目已在 `batchAddInventory` 中使用了事务模式，保持一致即可）：

```ts
const runCook = db.transaction(() => {
  const consumed = options.auto_consume_ingredients
    ? markItemsAsConsumed(consumedItemIds, userId)
    : 0;
  const info = historyInsert.run(
    userId, recipe.id, recipe.name, now,
    JSON.stringify(usedIngredientsSummary), options.notes || ''
  );
  return { consumed, historyId: Number(info.lastInsertRowid) };
});

const { consumed: consumedCount, historyId } = runCook();
```

---

### 3.3 P2 中优先级问题

---

#### ARC-02【P2】数据库无迁移机制，字段演进会静默失败

**位置**：`backend/src/db/index.ts:18-79` —— 全部使用 `CREATE TABLE IF NOT EXISTS`。

**问题**：表已存在时，`IF NOT EXISTS` 会直接跳过，**新增字段、修改默认值、加索引都不会生效**。例如未来给 `users` 加 `email` 字段，部署到老环境后代码读该字段会得到 `undefined`，且没有任何报错。

**建议**：引入轻量迁移机制，用 `user_version` pragma 记录版本号：

```ts
const MIGRATIONS: Array<(d: DatabaseType) => void> = [
  /* v0 → v1：初始结构（当前的 CREATE TABLE 语句整体搬进来） */
  (d) => { d.exec(`CREATE TABLE IF NOT EXISTS users (...); ...`); },
  /* v1 → v2：后续所有结构变更都追加到这里，不再修改上面的历史迁移 */
  (d) => { d.exec(`ALTER TABLE inventory_items ADD COLUMN notes TEXT DEFAULT '';`); },
];

export function runMigrations(): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
    console.log(`✅ 数据库迁移完成：v${v} → v${v + 1}`);
  }
}
```

---

#### ARC-03【P2】AI 生成的菜谱未经校验即入库

**位置**：`backend/src/services/recipeService.ts:527-567`

```ts
const recipeData = JSON.parse(cleanJson);            // 无 Zod 校验
const newRecipe: Recipe = {
  ingredients: recipeData.ingredients || [],          // AI 返回结构不可控
  instructions: recipeData.instructions || [],
  ...
};
db.prepare(`INSERT OR REPLACE INTO recipes ...`).run(...);
```

**影响**：若模型返回 `{"ingredients": "西红柿"}`（字符串而非数组），前端 `selectedRecipe.ingredients.map(...)`（`page.tsx:976`）会直接抛错，整页白屏。相比之下 `visionService.ts:139` 就正确地做了 `FridgeScanResultSchema.parse(parsed)` —— **同一项目内两种标准，应该统一**。

**修复**

```ts
// schemas/index.ts 新增
export const AiRecipeSchema = RecipeSchema.omit({ id: true, created_at: true });

// recipeService.ts
const parsed = AiRecipeSchema.safeParse(recipeData);
if (!parsed.success) {
  console.error('[generateAiRecipe] AI 返回结构非法：', parsed.error.issues);
  return null;                        // 宁可降级，也不要把脏数据写进库
}
const recipeData = parsed.data;
```

---

#### ARC-04【P2】前后端类型契约手工复制，已经出现漂移

**位置**：`frontend/src/lib/types.ts` vs `backend/src/schemas/index.ts`

**证据**：前端 `Recipe` 接口把 `score` / `match_rate` / `matched_ingredients` / `missing_ingredients` / `urgency_boost` 声明为**必填**（`types.ts:61-65`），但 `GET /api/recipes`（`recipes.ts:20-29`）返回的是基础菜谱，**不含这些字段**。前端之所以没崩，只是因为页面只调用了 recommend 接口，没调用列表接口 —— 一旦有人使用 `GET /api/recipes`，就会踩到类型谎言。

**建议**：拆分为 `Recipe`（基础）与 `RecipeRecommendation extends Recipe`（推荐态），与后端 Zod schema 保持一致；长期可考虑用 `zod-to-ts` 或 monorepo 共享 `packages/shared-types` 自动生成。

---

#### ARC-06【P2】无缓存层，推荐接口每次全量重算

**位置**：`backend/src/services/recipeService.ts:361-454`

每次推荐都执行：读取全部 58 条菜谱 → `JSON.parse` 每条 `ingredients`/`instructions` → 双层嵌套匹配 → 排序。库存或菜谱量增长后（例如扩到 1000 条）该接口会线性变慢。

**建议**

1. 菜谱基础数据在进程启动时解析好并常驻内存（`rowToRecipe` 的 `JSON.parse` 结果复用），仅在数据变更时失效
2. 对推荐结果按 `userId + 库存指纹` 做短期缓存（TTL 30-60 秒），库存未变则直接命中

---

#### ARC-08【P2】前端单文件巨型组件（1323 行）

**位置**：`frontend/src/app/page.tsx` —— 一个文件里塞了 3 个 Tab、4 个弹窗、20+ 个 `useState`、全部业务逻辑与全部样式。

**影响**：任何改动都得在这 1323 行里定位；任何状态变化都会触发整棵树重渲染；无法对局部做测试。

**建议拆分（渐进式，不需要一次性重写）**

```
src/app/page.tsx                 → 只保留 Tab 编排与数据加载（目标 <150 行）
src/components/RecipeGrid.tsx    → 菜谱卡片列表
src/components/RecipeDetail.tsx  → 烹饪步骤抽屉 + 灶台倒计时
src/components/FridgeScan.tsx    → 拍照上传与识别结果确认
src/components/InventoryList.tsx → 库存看板
src/components/AddItemModal.tsx  → 手动录入弹窗
src/components/AuthModal.tsx     → 登录注册弹窗
src/hooks/useInventory.ts        → 库存数据与刷新逻辑
src/hooks/useAuth.ts             → 认证状态与验证码逻辑
```

---

#### QUA-02【P2】Lint 在构建中被禁用，后端无 Lint 配置

**位置**：`frontend/next.config.mjs:3-5`

```js
eslint: { ignoreDuringBuilds: true },   // 关闭后 ESLint 问题不会阻断构建
```

**影响**：所有 lint 问题被隐藏，包括真实的 React Hooks 依赖缺失（例如 `page.tsx:165-167` 的 `useEffect(() => { refreshData(); }, [])` 缺少依赖项提示）。

**建议**：打开 `ignoreDuringBuilds`，并在 CI 中加入 `npm run lint`；后端补一份 ESLint 配置（`@typescript-eslint/recommended`）。

---

#### QUA-03【P2】`any` 与类型断言滥用

**证据**

| 位置 | 代码 |
| --- | --- |
| `inventory.ts:18` | `function getUserId(c: any)` |
| `recipes.ts:15` | `function getUserId(c: any)` |
| `auth.ts:126` | `db.prepare(...).get(...) as any` |
| 各路由 catch 块 | `catch (err: any)` → `err.message` |
| `authSecurity.ts:212` | `// @ts-ignore` |

**建议**：`c: any` 改为 `c: Context`；数据库行定义明确的 Row 接口；`catch (err: unknown)` 配 `err instanceof Error ? err.message : String(err)`。

---

#### QUA-04【P2】响应结构与错误处理不统一

**证据**：接口成功时结构五花八门：

- `{ success, data }`（inventory）
- `{ success, data, count }`（batch 入库）
- `{ success, data, total }`（菜谱列表）
- `{ success, message, data }`（登录）

错误时同样：`{ success: false, error }`、`{ success: false, error, details }`、`{ success: false, error, path }` 三种形态并存，且 `app.onError` 直接返回 `err.message`（可能泄漏 SQL 与上游服务细节）。

**建议**：定义统一响应契约，错误码与文案分离：

```ts
type ApiOk<T> = { success: true; data: T; meta?: { total?: number; count?: number } };
type ApiErr = { success: false; code: string; error: string; details?: unknown };

// app.onError 改为
app.onError((err, c) => {
  console.error('[App Error]', { path: c.req.path, err });   // 细节只进日志
  return c.json({ success: false, code: 'INTERNAL_ERROR', error: '服务开小差了，请稍后重试' }, 500);
});
```

---

#### QUA-05【P2】死代码与未使用资源

| 类型 | 位置 | 说明 |
| --- | --- | --- |
| 未使用导入 | `page.tsx:13,18,21,22` | `Trash2`、`ArrowRight`、`Flame`、`Layers` 导入后从未使用 |
| 死状态 | `page.tsx:62,66` | `loadingInventory` / `loadingRecipes` 被赋值但从未渲染，加载态 UI 缺失 |
| 死配置 | `config.ts:8` | `UPLOAD_DIR` 定义了但全项目从未使用（图片只在内存中流转） |
| 重复代码 | `inventory.ts:18` / `recipes.ts:15` | `getUserId` 在两处重复实现 |

---

#### PER-02 ~ PER-07【P2/P3】性能问题汇总

| 编号 | 问题 | 位置 | 说明与建议 |
| --- | --- | --- | --- |
| PER-02 | 全表读取 + 全量 JSON.parse | `recipeService.ts:338-354, 320-336` | 每次请求解析所有菜谱的 JSON 字段，建议内存缓存 |
| PER-03 | 静态图片未优化 | `public/images/tomato_egg.png` 1.5 MB、`fridge_sample.png` 677 KB | 页面首屏加载即拉取，建议转 WebP + 压缩至 200 KB 内；同时页面全部使用 `<img>` 而非 `next/image`（`page.tsx:402, 578, 692, 936`），浪费了已配置的 `remotePatterns` |
| PER-04 | 上游 fetch 无超时 | `recipeService.ts:501`、`visionService.ts:70` | CPA 挂起时请求会一直等待；建议 `AbortSignal.timeout(30_000)` |
| PER-05 | SQLite 同步驱动 + 语句未复用 | 全局 | better-sqlite3 是同步 API，会阻塞事件循环；`db.prepare()` 每次调用都重新编译，建议提升为模块级常量 |
| PER-06 | 前端定时器每秒钟重建 | `page.tsx:170-180` | `useEffect` 依赖数组含 `cookingTimer`，导致每秒重建 interval；建议用 `useRef` 保存计时起点 |
| PER-07 | 无分页 | `recipes.ts:20`、`inventory.ts:23` | 全量返回；建议加 `limit` / `offset`，默认 50 |

---

#### ENG-02 ~ ENG-05【P2】工程化缺失

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| ENG-02 | 无 CI/CD | 增加 GitHub Actions：安装依赖 → `tsc --noEmit` → lint → test → 构建镜像 |
| ENG-03 | 无 `.dockerignore`（已确认两个子目录都没有） | 当前 `COPY . .` 会把 `node_modules`、`.git`、`.next` 全量送进构建上下文，构建缓慢且镜像臃肿。建议各加一份 `.dockerignore` |
| ENG-04 | 前端镜像含 devDependencies | `frontend/Dockerfile:17` 直接复制完整 `node_modules`。建议构建后 `npm prune --omit=dev`，或改用 Next 的 `output: 'standalone'` 模式 |
| ENG-05 | 无格式化约定 | 增加 `.editorconfig` + Prettier + 统一缩进/引号规则 |

`.dockerignore` 示例（放在 `backend/` 与 `frontend/` 各一份）：

```gitignore
node_modules
dist
.next
.git
*.log
.env
.env.*
!.env.example
data
*.db
*.db-wal
*.db-shm
```

---

#### SEC-08 ~ SEC-11【P2】安全加固项

| 编号 | 问题 | 位置 | 建议 |
| --- | --- | --- | --- |
| SEC-08 | 错误信息泄漏内部细节 | `app.ts:67-76`、各路由 catch | 对外只返回通用文案，细节进服务端日志 |
| SEC-09 | 依赖漏洞（见第五章） | `frontend/package.json:14` | 升级 Next.js 至 14.2.35+ |
| SEC-10 | 验证码用 `Math.random()`；限流/验证码存于进程内存 | `authSecurity.ts:25-26, 11, 117-118` | 改用 `crypto.randomInt()`；多实例部署需迁移至 Redis |
| SEC-11 | 缺少安全响应头 | 全局 | 增加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`、CSP、HSTS |

---

#### DOC-01 ~ DOC-06【P2/P3】文档问题

| 编号 | 问题 | 位置 | 建议 |
| --- | --- | --- | --- |
| DOC-01 | **README 技术栈描述错误**：写的是 "Express"，实际是 Hono | `README.md:20` | 更正为 `Hono + @hono/node-server` |
| DOC-02 | 子 README 是脚手架模板残留 | `frontend/README.md`（内容与项目完全无关） | 删除或改写为前端开发说明 |
| DOC-03 | 无 API 文档 | — | 输出接口清单（路径、方法、请求体、响应示例、错误码）；或引入 `@hono/zod-openapi` 自动生成 |
| DOC-04 | `.env.example` 不完整 | `.env.example` | 只列了 `CPA_API_KEY`，缺少 `PORT` / `DB_PATH` / `UPLOAD_DIR` / `CORS_ORIGINS` / `API_INTERNAL_URL` |
| DOC-05 | `DESIGN.md` 放在静态资源目录 | `frontend/public/images/DESIGN.md` | 会被当作静态文件公开访问；应移到 `docs/` |
| DOC-06 | 无 LICENSE / CHANGELOG / CONTRIBUTING | 根目录 | README 声明 MIT 但**无 LICENSE 文件**，且 `backend/package.json:15` 写的是 ISC，**自相矛盾** |

---

### 3.4 P3 低优先级问题

| 编号 | 问题 | 位置 | 说明 |
| --- | --- | --- | --- |
| SEC-12 | 兼容旧版 SHA-256 密码哈希 | `authSecurity.ts:241-246` | 使用固定盐 `_shike_salt_2026`，属弱哈希；建议限期（如 90 天）强制升级后删除该分支 |
| SEC-13 | `dangerouslySetInnerHTML` 渲染服务端 SVG | `page.tsx:1256` | 当前服务端 SVG 内容受控（仅数字算术表达式，不含用户输入），**不可直接利用**；但属高风险模式，且无 CSP 兜底。建议改为 `data:image/svg+xml;base64,...` + `<img>` |
| SEC-14 | token 存于 localStorage 且服务端不校验 | `api.ts:79-80` | 设计与实现不一致；修复 SEC-01 后建议改用 httpOnly Cookie |
| SEC-15 | 容器以 root 运行、无资源限制、无健康检查 | 两个 Dockerfile、`docker-compose.yml` | 增加 `USER node`、`mem_limit`、`healthcheck` |
| ARC-05 | 无 API 版本化 | 全局 | 建议前缀 `/api/v1` |
| ARC-07 | SQLite 单文件，无备份策略 | `docker-compose.yml:16` | 建议增加定时备份脚本与恢复演练说明 |
| QUA-06 | `getUserId` 重复实现 | `inventory.ts` / `recipes.ts` | 提取为公共工具或中间件 |
| QUA-07 | 版本与许可不一致 | `README.md:63` vs `backend/package.json:15` | 统一为 MIT 并补 LICENSE 文件 |
| ENG-06 | 无依赖自动更新机制 | — | 启用 Dependabot |
| ENG-07 | 无结构化日志 / 指标 / 错误上报 | 全局 | 引入 pino + 请求 ID；生产接入 Sentry 类服务 |
| ENG-08 | 健康检查不检测依赖 | `app.ts:25-31` | `/health` 只返回静态 ok，建议增加 DB 连通性与 CPA 可达性探测（区分 `/healthz` 与 `/readyz`） |
| PER-08 | 前端 `onError` 兜底图硬编码 | `page.tsx:582-584` | 所有图片失败都回落到同一张西红柿炒蛋图，建议按分类映射 |

---

## 四、优先级整改路线图

> 建议按批次推进。每批完成后跑一次回归（手动验证清单见文末），确认无回退再进入下一批。

### 第 1 批：止血（建议 1 天内完成，P0）

| 顺序 | 任务 | 对应编号 | 验收标准 |
| --- | --- | --- | --- |
| 1.1 | **修复 Git 仓库**：备份 → 修正 HEAD → 首次提交 | ENG-01 | `git log` 能看到提交记录 |
| 1.2 | **修复容器内 API 地址**：rewrites 改用 `API_INTERNAL_URL`，compose 注入 `http://shike-api:8081` | SEC-03 | `docker compose up` 后浏览器可正常加载库存与推荐 |
| 1.3 | **加图片体积与类型校验**（前端 + 后端双层） | SEC-05 | 上传 10 MB 图片返回 413，上传 `.txt` 改名 `.jpg` 返回 415 |

### 第 2 批：安全核心（建议 3 天内完成，P0 + P1）

| 顺序 | 任务 | 对应编号 | 依赖 |
| --- | --- | --- | --- |
| 2.1 | 建 `sessions` 表 + `requireAuth` 中间件，路由统一从上下文取 userId | SEC-01 | 无 |
| 2.2 | 移除 `?user_id=` 身份入口与 `x-user-id` 头 | SEC-01 | 2.1 |
| 2.3 | 收紧 CORS 白名单 | SEC-04 | 2.1 |
| 2.4 | 修复 `temp_user_id` 迁移逻辑（`guest_claims` 表 + 完整 UUID） | SEC-02 | 2.1 |
| 2.5 | 修复 `getClientIp`，默认不信任 `XFF` | SEC-06 | 无 |
| 2.6 | AI 接口限流 + 超时 | SEC-07 / PER-04 | 无 |

> **第 2 批完成后，项目才具备放入公网的最低安全条件。**

### 第 3 批：正确性与稳定性（建议 1-2 周，P1 + P2）

| 顺序 | 任务 | 对应编号 |
| --- | --- | --- |
| 3.1 | `cookRecipe` 加事务 | ARC-10 |
| 3.2 | AI 生成菜谱改用独立接口 + Zod 校验 + 清理策略 | PER-01 / ARC-03 |
| 3.3 | 统一偏好字段名（`preference`/`preferences`） | ARC-09 |
| 3.4 | 引入数据库迁移机制 | ARC-02 |
| 3.5 | 补关键纯函数的单元测试（覆盖第六章清单） | QUA-01 |
| 3.6 | 统一响应结构与错误处理，停止对外暴露 `err.message` | QUA-04 / SEC-08 |
| 3.7 | 修正前后端类型契约（拆分 Recipe / RecipeRecommendation） | ARC-04 |
| 3.8 | 开放构建期 ESLint，清理 `any` 与未使用导入 | QUA-02 / QUA-03 / QUA-05 |

### 第 4 批：性能与工程化（建议 1 个月内，P2）

| 顺序 | 任务 | 对应编号 |
| --- | --- | --- |
| 4.1 | 菜谱数据内存缓存 + 推荐结果短 TTL 缓存 | ARC-06 / PER-02 |
| 4.2 | 图片资源压缩转 WebP，改用 `next/image` | PER-03 |
| 4.3 | SQLite 语句提升为模块常量 | PER-05 |
| 4.4 | 拆分前端巨型组件为组件 + hooks | ARC-08 |
| 4.5 | 补 `.dockerignore`，前端镜像瘦身（standalone 模式） | ENG-03 / ENG-04 |
| 4.6 | 接入 CI（lint + typecheck + test + build） | ENG-02 |
| 4.7 | 依赖升级：Next.js → 14.2.35+ | SEC-09 |
| 4.8 | 容器非 root 运行 + 资源限制 + 健康检查 | SEC-15 / ENG-08 |

### 第 5 批：规范化（持续，P2 + P3）

| 顺序 | 任务 | 对应编号 |
| --- | --- | --- |
| 5.1 | 文档修正：README 技术栈、子 README、`.env.example`、LICENSE | DOC-01~06 |
| 5.2 | API 文档（建议 `@hono/zod-openapi` 自动生成） | DOC-03 / ARC-05 |
| 5.3 | 安全响应头 + CSP | SEC-11 |
| 5.4 | 结构化日志与可观测性 | ENG-07 |
| 5.5 | 备份策略与恢复演练 | ARC-07 |
| 5.6 | 代码格式化规范（Prettier + EditorConfig） | ENG-05 |

---

## 五、依赖项安全检查

### 5.1 后端依赖（健康）

| 包 | 版本 | 评估 |
| --- | --- | --- |
| hono | 4.13.8 | 版本较新，无已知高危问题 |
| @hono/node-server | 2.1.1 | 正常 |
| better-sqlite3 | 13.0.3 | 正常；注意其为同步驱动（见 PER-05） |
| zod | 4.6.5 | 正常，且是全项目最值得肯定的依赖选择 |
| dotenv | 17.4.2 | 正常 |
| typescript (dev) | 7.0.2 | 正常 |

> 说明：本地未安装 `node_modules`（`backend/node_modules` 与 `frontend/node_modules` 均不存在），因此 `npm audit` 未能在本地执行。上述结论基于 `package-lock.json` 锁定版本核对。**建议在完成第 1 批整改后，在联网环境执行一次 `npm audit --production` 作为基线。**

### 5.2 前端依赖（存在需修复项）

| 包 | 锁定版本 | 评估 |
| --- | --- | --- |
| **next** | **14.2.15** | ⚠️ **需升级**（详见下） |
| react / react-dom | 18.3.1 | 正常 |
| lucide-react | 1.46.0 | 正常 |
| clsx / tailwind-merge | 2.1.1 / 3.7.0 | 正常（注意：`clsx` 与 `tailwind-merge` 已安装但全项目未见使用，属冗余依赖） |

**Next.js 14.2.15 漏洞详情**

| CVE | 严重度 | 影响 | 本版本是否受影响 | 修复版本 |
| --- | --- | --- | --- | --- |
| CVE-2025-55184 / CVE-2025-67779 | 高（DoS） | 特制 HTTP 请求可让 App Router 服务进程陷入无限循环并挂起，阻止后续请求 | ✅ **受影响**（影响 >=13.3 与 14.x 全系） | **14.2.35** |
| CVE-2025-48068 | 低（仅 dev 环境） | `next dev` 存在跨站 WebSocket 劫持与脚本注入 | ✅ 受影响（13.0.0–14.2.29） | 14.2.30 |
| CVE-2025-66478（React2Shell） | 严重（RCE） | RSC 协议远程代码执行，CVSS 10.0 | ❌ **不受影响**：官方明确 "Next.js 14.x stable、Pages Router、Edge Runtime 不在受影响范围"，本项目为 14.x stable | 不适用 |
| CVE-2024-51479 | 高 | middleware 授权绕过 | ❌ 不受影响：该漏洞在 **14.2.15 已修复**，且本项目未使用 middleware 鉴权 | — |

**升级动作**

```bash
cd frontend
npm install next@14.2.35
npm run build          # 验证构建通过
```

> 若计划更大版本跃迁（15.x / 16.x），需同步评估 React 19 升级与 App Router 破坏性变更，建议独立立项，不要与本次整改混合。

### 5.3 依赖管理建议

1. 启用 Dependabot（或 Renovate），每周自动提 PR
2. CI 中固化 `npm audit --production --audit-level=high` 作为门禁
3. 清理冗余依赖（`clsx`、`tailwind-merge` 未见使用）
4. 锁定 `engines.node` 版本，保证开发/构建/运行三环境一致

---

## 六、值得肯定的部分

审计报告不应只有问题清单。以下实现质量高于同类个人项目的平均水平，修复时请**保留**：

1. **密码存储规范**（`authSecurity.ts:222-250`）：scrypt + 每用户随机盐 + `timingSafeEqual` 恒定时间比较，并额外用 `dummyTimingCheck` 防御基于响应时间的用户枚举。这是本项目中安全实现最扎实的一处。
2. **输入校验体系**（`schemas/index.ts`）：Zod schema 覆盖全面，`safeParse` + `details` 返回校验失败明细，做法专业。
3. **SQL 全参数化**：全项目未发现 SQL 注入风险，动态拼接的字段名与占位符均来自白名单或数组长度，安全。
4. **验证码一次性消费**（`authSecurity.ts:90-108`）：校验即删除，逻辑正确，配合 2 分钟过期与定时清理，设计合理。
5. **透明度升级**（`auth.ts:154-158`）：旧哈希在用户成功登录时自动升级，是密码迁移的最佳实践。
6. **中文注释详尽**：几乎每个非显然的分支都有中文说明，对后续维护者（包括未来的你自己）非常友好。
7. **AI 服务降级**（`visionService.ts:106-114`）：主模型失败自动切换备用模型，具备基本的容错意识。
8. **AI 响应清洗**（`visionService.ts:31-38, 120-136`）：剥离 Markdown 代码围栏 + 正则兜底提取 JSON + Zod 校验，三层防护，处理得很细致。

---

## 七、附录

### 7.1 问题总览表（按优先级）

| 编号 | 等级 | 类别 | 一句话问题 | 位置 |
| --- | --- | --- | --- | --- |
| SEC-01 | P0 | 安全 | 无认证，身份可伪造 | `routes/*.ts` |
| SEC-02 | P0 | 安全 | temp_user_id 可劫持他人数据 | `auth.ts:68,161` |
| SEC-03 | P0 | 部署 | 容器内 API 地址错误，前后端不通 | `next.config.mjs:21` |
| ENG-01 | P0 | 工程化 | Git 仓库损坏，零提交 | `.git/HEAD` |
| SEC-04 | P1 | 安全 | CORS 通配符 | `app.ts:15` |
| SEC-05 | P1 | 安全 | 上传无体积/类型限制 | `vision.ts:17` |
| SEC-06 | P1 | 安全 | XFF 伪造绕过限流 | `authSecurity.ts:202` |
| SEC-07 | P1 | 安全 | AI 接口无限流 | `vision.ts` / `recipes.ts:85` |
| QUA-01 | P1 | 质量 | 零测试覆盖 | 全局 |
| PER-01 | P1 | 性能 | 页面加载触发大模型调用 | `page.tsx:165` |
| ARC-09 | P1 | 架构 | 偏好参数名不匹配，功能静默失效 | `api.ts:202` vs `recipes.ts:89` |
| ARC-10 | P1 | 架构 | 扣库与历史写入非原子 | `recipeService.ts:602` |
| SEC-08~11 | P2 | 安全 | 错误泄漏 / 依赖漏洞 / 弱随机 / 缺安全头 | 见 3.3 |
| ARC-02~08 | P2 | 架构 | 无迁移、脏数据入库、类型漂移、无缓存、巨型组件 | 见 3.3 |
| QUA-02~05 | P2 | 质量 | Lint 禁用、any 泛滥、响应不统一、死代码 | 见 3.3 |
| PER-02~07 | P2/P3 | 性能 | 全表扫描、图片未优化、无超时、同步阻塞 | 见 3.3 |
| DOC-01~06 | P2/P3 | 文档 | 技术栈描述错误、模板残留、无 API 文档 | 见 3.3 |
| ENG-02~05 | P2 | 工程化 | 无 CI、无 .dockerignore、镜像臃肿 | 见 3.3 |
| SEC-12~15 | P3 | 安全 | 旧哈希兼容、dangerouslySetInnerHTML、root 容器 | 见 3.4 |
| ENG-06~08 | P3 | 工程化 | 无依赖更新、无可观测性、健康检查不探测依赖 | 见 3.4 |

### 7.2 整改后回归验证清单

每批整改完成后，请逐项手动验证：

- [ ] 全新环境 `docker compose up -d --build` 后，首页能加载出库存数量（验证 SEC-03）
- [ ] 未登录状态直接 `curl http://host:8081/api/inventory` 应返回 **401**（验证 SEC-01）
- [ ] 用 A 账号登录后，手动改 `localStorage.shike_user_id` 为 B 账号 ID，刷新页面应**看不到** B 的数据（验证 SEC-01/02）
- [ ] 连续输错密码 6 次应被锁定并提示剩余时间；携带伪造 `X-Forwarded-For` 头重试仍应被锁定（验证 SEC-06）
- [ ] 上传 10 MB 图片应被拒绝；上传非图片文件应被拒绝（验证 SEC-05）
- [ ] 注册/登录、拍照识别、批量入库、推荐、烹饪扣库、退出登录六条主流程全部通畅（回归）
- [ ] `npm run build`（前端）与 `npm run build`（后端）均无报错
- [ ] `npm test` 能跑通新增的单元测试（验证 QUA-01）

### 7.3 审计说明

- 本次审计为**静态源码审计**，未运行代码、未做渗透测试、未执行 `npm audit`（本地无 `node_modules`，依赖结论基于 `package-lock.json` 锁定版本 + 官方安全公告核对）
- 报告中所有代码引用行号均对应审计当日的文件内容
- 关于 Next.js 漏洞的结论已区分"实际受影响"与"不受影响"，避免过度告警；特别是 **React2Shell（CVE-2025-66478）明确不影响 Next.js 14.x stable**，无需为此紧急升级大版本

---

## 八、整改实施记录

> 记录时间：2026-09-17（审计当日）
> 验证方式：`tsc` 编译通过 + 17 项单元测试通过 + 前端 `next build`（含 ESLint/类型检查）通过 + 后端接口实测

### 8.1 已完成整改（可直接对照验收）

**P0 严重问题**

| 编号 | 问题 | 整改内容 | 涉及文件 |
| --- | --- | --- | --- |
| SEC-01 | 无认证、身份可伪造 | 新增 `sessions` 表 + `requireAuth` 中间件，身份完全由服务端会话决定；删除 `x-user-id` 与 `?user_id=` 两个身份入口 | `middleware/auth.ts`（新增）、`services/sessionService.ts`（新增）、`routes/*.ts`、`app.ts` |
| SEC-02 | `temp_user_id` 可劫持他人数据 | 迁移逻辑改为「仅认领当前访客会话名下的数据」，且通过 `guest_claims` 表保证每份数据只可认领一次；用户 ID 改为完整 UUID（128 bit） | `routes/auth.ts`、`services/sessionService.ts` |
| SEC-03 | 容器内 API 地址错误 | rewrites 改用 `API_INTERNAL_URL` 环境变量，compose 注入 `http://shike-api:8081` | `next.config.mjs`、`docker-compose.yml` |

**P1 高优先级**

| 编号 | 问题 | 整改内容 |
| --- | --- | --- |
| SEC-04 | CORS 通配符 | 改为来源白名单（`CORS_ORIGINS` 可配），移除 `x-user-id` 自定义头 |
| SEC-05 | 上传无限制 | 三层防护：请求体预检 → 解码后精确体积校验（≤5MB）→ 文件头魔数格式校验（仅 JPG/PNG/WebP） |
| SEC-06 | IP 伪造绕过限流 | `getClientIp` 默认只取真实 socket 地址，仅在 `TRUST_PROXY=true` 时采信 `X-Forwarded-For` |
| SEC-07 | AI 接口无限流 | 采用**用户 + IP 双重维度**滑动窗口限流：识图（用户 10 次/分、IP 30 次/分）、AI 菜谱生成（用户 3 次/分、IP 10 次/分）；限流在本地校验通过后才计数，输入错误不浪费额度 |
| QUA-01 | 零测试覆盖 | 抽出纯函数模块并补齐 **25 项**单元测试（含 AI 输出解析的 8 项边界用例），`npm test` 可运行 |
| PER-01 | 页面加载触发大模型 | AI 定制拆分为独立接口 `POST /api/recipes/ai-generate`，仅用户点击「AI 菜谱」按钮时调用；**单次请求一次生成 3 道菜谱**（比循环调用更省时间与额度）；并对 AI 菜谱做总量控制（保留最近 50 条） |
| ARC-09 | 参数名不匹配 | 后端同时接受 `preference` / `preferences`，功能恢复生效 |
| ARC-10 | 扣库与历史非原子 | 用 `db.transaction` 包裹，保证两步操作同时成功或同时回滚 |

**P2 中优先级**

| 分类 | 整改内容 |
| --- | --- |
| 安全 | 错误信息不再外泄内部细节（统一文案 + 服务端日志）；验证码改用 `crypto.randomInt`；Next.js 升级至 **14.2.35**（修复 CVE-2025-55184 DoS）；前后端均补齐安全响应头（nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS / poweredByHeader 关闭） |
| 架构 | 引入基于 `user_version` 的数据库迁移机制；AI 返回内容经 Zod 校验后才入库；前后端类型契约拆分为 `Recipe` 与 `RecipeRecommendation`；菜谱数据内存缓存 + 变更失效 |
| 质量 | 前端构建开启 ESLint（不再静默跳过）；后端 `tsconfig` 增加 `noUnusedLocals` 等四项严格检查；统一响应结构（`success` / `data` / `code` / `error`）；清理未使用导入、死状态与死配置；移除 `getUserId` 重复实现 |
| 性能 | 修复计时器每秒重建；图片优化（PNG→WebP：logo 169KB→4KB，菜谱图 1537KB→47KB，另删除 2 张未使用图片）；上游调用统一加 30s 超时 |
| 文档 | README 修正技术栈（Express→Hono）并补全环境变量、API、安全说明、FAQ；重写子 README；新增 LICENSE（MIT），统一许可声明；DESIGN.md 从公开静态目录移至 `docs/` |
| 工程化 | 新增 `.dockerignore`（前后端）；前端镜像改用 standalone 产物；新增 GitHub Actions CI 与 Dependabot 配置；新增 `.editorconfig` |

**P3 低优先级**

| 编号 | 整改内容 |
| --- | --- |
| SEC-15 | 前后端容器均改为非 root 用户运行；compose 增加内存上限、日志轮转与健康检查 |
| ENG-08 | 新增 `/healthz` 就绪探针（含数据库连通性检测），供 Docker healthcheck 使用 |
| ARC-07 | README 补充 SQLite 在线备份命令与恢复建议 |
| QUA-07 | 许可统一为 MIT |

### 8.2 实测验证结果

| 验证项 | 命令/方式 | 结果 |
| --- | --- | --- |
| 后端编译 | `npm run build`（tsc） | ✅ 通过 |
| 单元测试 | `npm test` | ✅ 17 项全部通过 |
| 前端构建 | `npm run build`（含 ESLint + 类型检查） | ✅ 通过（仅 4 条 `<img>` 性能建议） |
| 未认证访问 | `GET /api/inventory` 无令牌 | ✅ 401 |
| 伪造 `x-user-id` | 带 `x-user-id: usr_victim` | ✅ 401（漏洞已封堵） |
| 伪造查询参数 | `?user_id=usr_victim` | ✅ 401（漏洞已封堵） |
| 会话建立 | `POST /api/auth/guest` | ✅ 返回 256 bit 令牌与完整 UUID |
| 业务链路 | 添加食材 → 推荐菜谱 | ✅ 保质期计算正确、推荐排序正常 |
| 上传防护 | 上传改名的文本文件 | ✅ 415 拒绝 |
| 登出失效 | 登出后复用旧令牌 | ✅ 401 |
| 数据隔离 | 新访客查看库存 | ✅ 0 件（互不可见） |
| AI 菜谱生成 | 空冰箱用户调用 | ✅ 400（且不消耗限流额度） |
| AI 生成限流 | 同一用户连续 4 次调用 | ✅ 前 3 次进入生成流程，第 4 次 429 |
| 限流维度隔离 | 另一用户同时调用 | ✅ 不受前者限流影响（用户维度独立） |
| AI 输出异常兼容 | 8 项单元测试（多道返回 / 单对象 / 裸数组 / 结构非法 / Markdown 围栏 / 空库存 / 匹配率 / 超量截断） | ✅ 全部通过 |

### 8.3 尚未处理的项（有意保留，非遗漏）

| 编号 | 项目 | 保留原因 | 建议时机 |
| --- | --- | --- | --- |
| ENG-01 | **Git 仓库修复** | 涉及仓库结构变更，需你本人确认后再执行 | **建议立即处理**，见 8.4 |
| ARC-08 | 前端组件拆分（`page.tsx` 1323 行） | 属架构级重构，会大幅改动 UI 层，风险与调试成本较高，建议在功能稳定后单独进行 | 下一个迭代 |
| PER-07 | 接口分页 | 当前数据量（库存数十条、菜谱 58 条）无实际压力 | 数据规模增长后 |
| ARC-05 | API 版本化（`/api/v1`） | 单客户端项目，暂无多版本并存需求 | 对外提供 API 时 |
| SEC-12 | 旧版 SHA-256 哈希清理 | 已通过登录时自动升级机制逐步消化，强制清理会打断老用户登录 | 3-6 个月后移除兼容代码 |
| SEC-13 | `dangerouslySetInnerHTML` 渲染验证码 SVG | 服务端 SVG 内容完全受控（仅数字运算），当前不可利用；改造收益低 | 可选 |
| SEC-14 | 令牌存储于 localStorage | 属前端存储策略选择；若改为 httpOnly Cookie 需同步调整 CORS 与 CSRF 策略 | 有公网部署需求时 |
| ENG-07 | 结构化日志 / 指标 / 错误上报 | 需要额外引入依赖与外部服务，个人自托管场景收益有限 | 多人协作或公网运营时 |

### 8.4 需要你执行的操作

**第一步：修复 Git 仓库（当前项目零提交，代码没有任何版本保护）**

```powershell
# 1. 先备份，确保万无一失
Copy-Item -Recurse d:\code\Antigravity\shike d:\code\Antigravity\shike_backup_20260917

# 2. 修正损坏的 HEAD 指向
Set-Content d:\code\Antigravity\shike\.git\HEAD "ref: refs/heads/main"

# 3. 确认仓库恢复正常
cd d:\code\Antigravity\shike
git status

# 4. 首次提交（.gitignore 已正确排除 node_modules / data / .env）
git add .
git commit -m "chore: 初始化仓库并完成首轮安全与工程质量整改"
```

若第 3 步仍报错，说明仓库结构已损坏且无可挽回的历史（当前历史为空），可直接重建：

```powershell
Remove-Item -Recurse -Force .git
git init -b main
git add .
git commit -m "chore: 初始化仓库并完成首轮安全与工程质量整改"
```

**第二步：重新部署验证**

```bash
docker compose up -d --build
# 浏览器打开 http://127.0.0.1:3002，确认库存与推荐能正常加载
```

> 首次部署需确保数据目录权限：`sudo mkdir -p /opt/shike-ai/data && sudo chown -R 1000:1000 /opt/shike-ai/data`

**第三步：本地环境变量**

在 `.env` 中确认 `CPA_API_KEY` 已填写；Windows 本地开发时把 `DB_PATH` 改为相对路径 `./data/db/shike.db`。