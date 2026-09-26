# 食刻（Shike AI）全栈代码深度审计报告

> **审计基准日期**：2026-09-26  
> **审计对象**：食刻（Shike AI）完整工程仓库（包含 `backend/`, `frontend/`, `scripts/`, `data/`, 容器部署配置）  
> **审计原则**：完全独立于历史存档报告（已忽略 `docs/archive/`），针对当前代码库基线进行全盘源码级白盒审计与系统性分析。

---

## 一、 审计综合评级与执行概述

### 1.1 综合质量评级

| 审计维度 | 评级 (A-F) | 风险等级 | 核心现状概述 |
| :--- | :---: | :---: | :--- |
| **后端架构与接口设计** | **B+** | 中 | Hono 框架轻量高效，分层清晰；具备请求体流式计数拦截器；局部存在内存全量加载过滤及同义词语义匹配缺陷。 |
| **身份认证与访问控制** | **B** | 高 | 会话令牌 SHA-256 哈希落库且具备恒定时间比对；但由于反向代理拓扑与 IP 识别策略失配，存在全站登录误锁 DoS 风险；访客注册接口缺乏频控。 |
| **数据存储与数据库设计** | **A-** | 低 | 开启 WAL 与外键支持，具备结构化多版本 Migration 机制；写操作关键链路均保证事务原子性；缺乏级联外键约束。 |
| **算法与 AI 模型集成** | **A-** | 低 | 视觉与文本模型均具备独立超时降级与结构化 Zod 盲审清洗；提示词防注入结构校验完备；具备动态模型退避。 |
| **前端架构与交互体验** | **B+** | 中 | Next.js Standalone 产物轻巧，UI 表现优异；单文件 `page.tsx` 过于庞大（>1500行），存在 `dangerouslySetInnerHTML` 渲染 SVG 与 Token 存储于 LocalStorage 的安全隐患。 |
| **数据治理与脚本健壮性** | **B** | 中 | 菜谱清洗与视觉治理逻辑详实严谨；但脚本普遍硬编码绝对路径 `/opt/shike-ai`，跨平台与本地开发兼容性较弱。 |
| **容器与运维编排安全** | **B+** | 中 | 采用非 root 用户运行，端口仅绑定宿主机 `127.0.0.1`；数据卷挂载使用了宿主机绝对路径，限制了部署迁移能力。 |

**综合系统安全与质量得分：`83 / 100` (良好，需重点修复 IP 锁定 DoS 与同义词误匹配逻辑)**

---

## 二、 后端架构与代码深度审计 (`backend/`)

### 2.1 接口设计与路由控制层

#### 优势与规范实现
1. **统一路由前缀与模块解耦**：
   路由按领域拆分为 `/api/auth`、`/api/inventory`、`/api/recipes`、`/api/vision`，并通过 `app.route()` 统一挂载至主应用，职责清晰。
2. **防超限流式请求体包装** (`src/index.ts` L27-47 & `src/middleware/bodyLimit.ts`)：
   通过 `limitRequestBody` 自定义 `ReadableStream` 计数流，在底层强制拦截分块传输编码（Chunked Transfer-Encoding）中不声明 `Content-Length` 的恶意大请求体，有效防御了内存耗尽攻击（OOM）。
3. **安全响应头与探针规范** (`src/app.ts` L22-32, L58-86)：
   全局注入 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY` 等安全响应头，并显式区分进程存活探测 `/health` 与依赖数据库校验的就绪探测 `/healthz`。

#### 缺陷与风险点
1. **CORS 回退逻辑不严谨** (`src/app.ts` L44-54)：
   ```typescript
   cors({
     origin: (origin) => {
       if (!origin) return config.CORS_ORIGINS[0];
       return config.CORS_ORIGINS.includes(origin) ? origin : config.CORS_ORIGINS[0];
     },
   })
   ```
   **风险分析**：当外部恶意域名（如 `https://evil.com`）发起跨域探测时，代码并未返回 `null` 或空字符串，而是回退返回了白名单中的首个域名 `config.CORS_ORIGINS[0]`。虽然现代浏览器因 Origin 不匹配仍会拦截数据读取，但这不符合 CORS 标准实现规范，容易导致非标准客户端或缓存代理产生混淆。
2. **菜谱列表分页未在数据库层下推** (`src/routes/recipes.ts` L64-67 & `src/services/recipeService.ts` L344-359)：
   `GET /api/recipes` 支持 `limit` 与 `offset`，但在实现上是先调用 `getAllRecipes()` 将库中所有菜谱读取至内存，再由 JavaScript 做过滤并切片：
   ```typescript
   const matched = listRecipes({ cuisine, difficulty }, userId);
   const total = matched.length;
   const page = matched.slice(offset, offset + limit);
   ```
   当菜谱库规模扩充至千级别时，会导致无意义的内存占用与 CPU 遍历开销。

---

### 2.2 身份鉴权、访问控制与安全审查

#### 核心高危漏洞：反向代理架构失配导致全站登录 DoS 误锁
- **文件位置**：`backend/src/services/authSecurity.ts` (L284-315, L206-217) 与 `docker-compose.yml` (L17-18, L57-58)
- **机理剖析**：
  1. 在 `docker-compose.yml` 中，后端容器配置了 `TRUST_PROXY=${TRUST_PROXY:-false}`，注释声称“当前拓扑是端口直连、前面没有反向代理”。
  2. 但在实际业务调用中，前端 Next.js 服务（`shike-web`）通过 `next.config.mjs` 中的 `rewrites` 将所有 `/api/*` 请求反向代理到后端的 `http://shike-api:8081`。
  3. 当 `TRUST_PROXY=false` 时，`getClientIp(c)` 跳过 `X-Forwarded-For`，直接读取 Node TCP 套接字的对端地址 `socketIp`。
  4. 对于所有经过前端 Web 访问的用户，对端地址均是前端容器的容器内网 IP（例如 `172.18.0.3`）。该 IP 满足 `isIdentifiableClientIp`（非空且非 `'unknown'`）。
  5. **攻击/触发场景**：任一用户在登录页面连续输错 5 次密码，`recordFailedLogin` 立即将容器 IP `172.18.0.3` 判定锁定 15 分钟。
  6. **破坏后果**：此时该 IP 被写入 `ipLockouts`，**导致全站所有其他正常用户在尝试登录时，均被识别为来自同一 IP 并直接返回 `429 ACCOUNT_LOCKED`，全站登录功能瘫痪 15 分钟**。同时，`/api/vision/fridge-scan` 与 `/api/recipes/ai-generate` 的 IP 频控桶亦被全站用户挤占共享。

#### 访客认证 DoS 与存储膨胀隐患
- **文件位置**：`backend/src/routes/auth.ts` (L58-102) & `backend/src/services/sessionService.ts` (L41-53)
- **机理剖析**：
  `POST /api/auth/guest` 接口无需鉴权，且完全没有任何限流防护（Rate Limit）或人机校验（Captcha）。每次请求均向 SQLite 的 `sessions` 表插入一条 30 天有效期的会话记录。攻击者可轻易构造脚本在短时间内发起百万次请求，直接耗尽服务器磁盘空间并锁死 SQLite 的 WAL 写入机制。

#### 图形验证码空间过小
- **文件位置**：`backend/src/services/authSecurity.ts` (L31-46)
- **机理剖析**：
  验证码算法为简单加减法：$a \in [1, 12]$, $b \in [1, 9]$，答案绝对值介于 $0 \sim 21$ 之间，可能的结果总数仅 22 个。攻击者暴力枚举答案的单次猜中率高达 $1/22 \approx 4.5\%$；在 5 次尝试窗口内，至少猜中一次的概率超过 $20.7\%$。对于不限制 IP 尝试次数的注册接口，该验证码无法有效阻断自动化黑客脚本。

#### 认证鉴权优势
1. **会话令牌哈希落库**：会话生成 256-bit 随机熵，入库采用 SHA-256 摘要，防止数据库被拖库后令牌被直接利用。
2. **密码学安全慢哈希与防枚举**：采用 Node.js 原生 `scrypt` 异步哈希，并使用 `dummyTimingCheck` 对不存在的用户名进行恒定时长虚假哈希运算，杜绝基于响应耗时的用户名枚举攻击。
3. **私有菜谱严格校验**：`deleteRecipe` 与 `isRecipeVisibleTo` 严格隔离了不同用户的 AI 定制菜谱，越权请求统一返回 404，防止信息泄露。

---

### 2.3 业务逻辑、算法与 AI 集成审计

#### 严重语义匹配缺陷：食材包含判定颠倒导致推荐失准
- **文件位置**：`backend/src/utils/ingredientMatch.ts` (L88-95)
- **代码片段**：
  ```typescript
  if (iNorm === rNorm) return true;
  if (iNorm.includes(rNorm) || rNorm.includes(iNorm)) return true; // <-- 严重缺陷位置

  const iGroup = synonymIndex.get(iNorm);
  const rGroup = synonymIndex.get(rNorm);

  if (iGroup !== undefined && rGroup !== undefined) {
    return iGroup === rGroup;
  }
  ```
- **问题分析**：
  代码在比对同义词倒排索引 `synonymIndex` 之前，先执行了双向字符串子串包含检测 `iNorm.includes(rNorm) || rNorm.includes(iNorm)`。
  这直接破坏了同义词分组的设计初衷：
  1. **“洋葱” vs “葱”**：菜谱需要“葱”（分组 39：大葱/小葱），用户库存为“洋葱”（分组 23：洋葱/紫洋葱）。因为 `"洋葱".includes("葱") === true`，系统直接返回 `true`，导致洋葱被当成了香葱！
  2. **“牛肉末” vs “肉末”**：菜谱需要“肉末”（分组 10：猪肉末），用户有“牛肉末”（分组 12：牛肉/牛腩）。因为 `"牛肉末".includes("肉末") === true`，牛肉末被错误判定为猪肉！
  3. **“鸡肉” vs “肉”**：类似单字肉品极易发生 cross-category 串味误匹配。
- **修复逻辑**：当双方均为同义词词典成员时，必须**优先按精确分组下标判定**；仅当存在自由修饰词（如“有机土豆”）且未命中索引时，方可退避到子串模糊匹配。

#### AI 集成与防注入审计
- **文本生成** (`src/services/recipeService.ts` L604-656)：
  用户输入 `preference` 经过 `AiGenerateRequestSchema` 截断至 200 字符；AI 返回后经过 `AiRecipeBatchSchema` 强校验，不合规数据直接丢弃，提示词注入无法逃逸结构限制破坏数据库。调用带 30 秒超时熔断。
- **视觉识别** (`src/services/visionService.ts` L100-146)：
  实现了真实文件魔数（Magic Number）嗅探检测，限制仅放行 JPG/PNG/WebP；多候选模型串行降级重试机制具备独立短超时（15 秒），避免用户长时间白屏挂起。

---

### 2.4 数据存储与数据库审计 (`data/`, `src/db/`)

1. **事务完整性良好**：
   `cookRecipe`（扣库存 + 写烹饪历史）、`claimLegacyGuestData`（认领历史数据）、`batchAddInventory`（批量入库）均采用 `db.transaction()` 执行，具备原子性。
2. **表结构外键弱约束**：
   虽然全局执行了 `PRAGMA foreign_keys = ON;`，但由于访客模式支持 `guest_xxx` 虚拟 ID，`inventory_items`、`cooking_history` 和 `sessions` 表并未对 `users(id)` 建立真实数据库外键约束。若后续引入注销账号功能，必须在业务层显式清理关联数据。
3. **保质期计算时区偏差** (`src/utils/urgency.ts` L11-15)：
   ```typescript
   const expDateObj = new Date(expiryDateStr); // YYYY-MM-DD 会被按 UTC 解析
   const expDate = new Date(expDateObj.getFullYear(), expDateObj.getMonth(), expDateObj.getDate());
   ```
   若运行在 UTC 西区（如美洲时区），本地日期与 UTC 日期相差一天，会导致保质期计算产生 $\pm 1$ 天的系统性偏差。且若传入非法字符串，计算产生 `NaN`，在判定函数中会意外返回 `'green'`（安全）。

---

## 三、 前端架构与代码深度审计 (`frontend/`)

### 3.1 组件设计与代码组织

1. **单文件单体化过载** (`frontend/src/app/page.tsx`)：
   整个应用页面聚合在单个 `page.tsx` 中，总代码量高达 1559 行。包含：
   - 登录/注册认证弹窗与验证码交互
   - 冰箱图片拍照上传与视觉扫描多选入库卡片
   - 智能库存三级警戒看板与手动录入抽屉
   - 菜谱列表、AI 大厨生成触发逻辑与卡片渲染
   - 灶台步骤引导全屏弹窗与倒计时定时器
   **缺陷**：缺少模块拆分，组件内部状态过多（20+ 个 `useState`），任一细微状态更新均可能触发顶层组件重新渲染，降低渲染性能并增大维护排查难度。
2. **React Hook 依赖警告**：
   构建日志中显式提示 `useEffect` 缺少 `refreshData` 依赖项（L194）。`refreshData` 内部依赖外部状态未包裹 `useCallback`，易造成闭包陈旧状态（Stale Closure）问题。

### 3.2 前端安全风险

1. **验证码 SVG 使用 `dangerouslySetInnerHTML` 渲染** (`frontend/src/app/page.tsx` L1492)：
   ```tsx
   <div
     dangerouslySetInnerHTML={{ __html: captchaData.svg }}
     className="flex items-center justify-center"
   />
   ```
   **风险分析**：虽然当前后端生成的 SVG 由可控代码拼接，但直接使用 `dangerouslySetInnerHTML` 绕过了 React 内置的 DOM 字符串转义保护。一旦后端 API 遭到篡改、中间人劫持或第三方接口污染，SVG 内部的 `<script>` 或 `<image onload="...">` 将直接在用户浏览器中执行，构成存储型/反射型 XSS 漏洞。
   **建议**：改用 `<img src={'data:image/svg+xml;utf8,' + encodeURIComponent(captchaData.svg)} alt="captcha" />` 方式渲染。
2. **会话令牌明文暴露在 `localStorage`** (`frontend/src/lib/api.ts` L28, L34)：
   前端将身份会话令牌 `shike_token` 存入 `localStorage`，任何在当前域下执行的第三方脚本或 XSS 注入点均可直接通过 `localStorage.getItem()` 窃取令牌。建议推进向 `HttpOnly; SameSite=Lax; Secure` Cookie 机制迁移。

### 3.3 网络通信与容错

1. **静默访客降级已修复，但缺乏重试与熔断机制** (`frontend/src/lib/api.ts`)：
   对于重度依赖上游大模型的耗时请求（如拍照识图、AI 菜谱定制），若遇偶发性网络抖动，前端直接报出异常弹窗，没有实现基础的退避重试（Backoff Retry）机制。

---

## 四、 数据治理与运维脚本审计 (`scripts/`, `data/`)

### 4.1 脚本健壮性与可移植性

1. **绝对路径强绑定**：
   审查 `scripts/` 下的 26 个 Python 脚本发现，相当一部分脚本强行硬编码了宿主机绝对路径 `/opt/shike-ai`，例如：
   - `scripts/find_perch.py`: `with open('/opt/shike-ai/.env')`
   - `scripts/recipe_governance.py`: `DB_PATH = Path('/opt/shike-ai/data/db/shike.db')`
   - `scripts/review_and_replace_recipe_images.py`: `env_path = Path('/opt/shike-ai/.env')`
   在非标准路径（如本地 macOS / Windows 开发环境或异构 CI 容器）中运行将直接报错崩溃。应统一采用 `Path(__file__).resolve().parent.parent` 相对根路径寻址。
2. **历史备份文件滞留**：
   `data/db/` 目录下散落了 12 个历史数据库快照（如 `shike.db.bak_precision_20260922_115400`），占用存储空间，且若运维操作不当容易发生配置挂错库文件事故。建议定期归档或清理。

---

## 五、 容器与运维配置审计 (`docker-compose.yml`, `Dockerfile`)

### 5.1 容器安全与网络暴露

1. **宿主机端口绑定安全**：
   `docker-compose.yml` 中 `shike-api` 绑定 `127.0.0.1:8081:8081`，`shike-web` 绑定 `127.0.0.1:3002:3000`，均严格限定为环回地址，避免了后端和前端管理端口直接向公网暴露，安全防护得当。
2. **最小权限执行机制**：
   - 前端采用 `node:22-alpine`，运行阶段显式指定 `USER node`；
   - 后端通过 `docker-entrypoint.sh` 在修正挂载目录属主后，利用 `setpriv` 降权至非特权账号 `node` 执行主进程，杜绝容器逃逸高危权限。
3. **数据卷挂载可移植性缺陷** (`docker-compose.yml` L20)：
   ```yaml
   volumes:
     - /opt/shike-ai/data:/opt/shike-ai/data
   ```
   挂载使用了宿主机绝对路径，若在其他服务器或开发者机器上克隆执行，会导致挂载错位。应改为相对路径 `./data:/opt/shike-ai/data`。
4. **启动脚本命令拼接瑕疵** (`backend/docker-entrypoint.sh` L21)：
   若系统未安装 `setpriv`，脚本回退执行 `exec su node -s /bin/sh -c "$*"`。使用 `"$*"` 会丢失命令行参数的引号分界，容易引发参数解析歧义。应改为 `exec su node -c "$@"` 或使用 `gosu`。

---

## 六、 核心漏洞与风险清单 (带行号与修复方案)

| 序号 | 风险等级 | 漏洞/隐患描述 | 涉及文件与行号 | 修复方案与建议代码 |
| :---: | :---: | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | **反向代理 IP 识别失配导致全站登录 DoS 误锁** | `backend/src/services/authSecurity.ts` (L284-315)<br>`docker-compose.yml` (L17-18) | **方案**：`shike-web` 实际上充当反向代理角色，若 `TRUST_PROXY=false`，后端把 Web 容器 IP 视为客户端 IP，单人输错密码即锁死全站。应在 Docker 编排中设置 `TRUST_PROXY=true`，或在 `getClientIp` 中加入容器网段白名单校验，仅信任来自内网代理的 `X-Forwarded-For`。 |
| **SEC-02** | **HIGH** | **`/api/auth/guest` 缺乏频控导致 SQLite 写入被刷爆** | `backend/src/routes/auth.ts` (L58-102)<br>`backend/src/services/sessionService.ts` (L41-53) | **方案**：对 `POST /api/auth/guest` 接口挂载 IP 级滑动窗口限流（如单 IP 每分钟最多创建 10 个访客会话），防止恶意刷会话耗尽磁盘空间。 |
| **SEC-03** | **MEDIUM** | **验证码 SVG 使用 `dangerouslySetInnerHTML` 渲染存在 XSS 隐患** | `frontend/src/app/page.tsx` (L1492) | **方案**：不要注入 HTML，使用 Base64 Data URI 的 `<img>` 标签展示：<br>`<img src={`data:image/svg+xml;utf8,${encodeURIComponent(captchaData.svg)}`} alt="captcha" />` |
| **SEC-04** | **MEDIUM** | **算术验证码答案空间过小（0~21）易被脚本暴力枚举** | `backend/src/services/authSecurity.ts` (L31-46) | **方案**：扩展验证码生成逻辑为 4 位英数混合字符，或扩充算术区间与混淆度，提高破解阻力。 |
| **SEC-05** | **MEDIUM** | **CORS 白名单未命中时回退默认域名不合规** | `backend/src/app.ts` (L44-54) | **方案**：未命中白名单的跨域请求应返回 `''` 或 `null`，禁止返回有效来源。 |
| **LOG-01** | **MEDIUM** | **食材同义词双向子串匹配抢占导致语义串味（洋葱变葱、牛肉变猪肉）** | `backend/src/utils/ingredientMatch.ts` (L88-95) | **方案**：调整判定优先级，双词均命中词典时优先比对分组下标；严格禁止不同分组的词因部分字包含而判为一致。 |
| **OPS-01** | **MEDIUM** | **Docker 卷挂载硬编码绝对路径破坏可移植性** | `docker-compose.yml` (L20) | **方案**：将 `/opt/shike-ai/data:/opt/shike-ai/data` 改为 `./data:/opt/shike-ai/data`。 |
| **OPS-02** | **LOW** | **数据治理脚本硬编码绝对路径 `/opt/shike-ai`** | `scripts/*.py` 普遍存在 | **方案**：使用 `Path(__file__).resolve().parent.parent` 动态定位工程根目录。 |
| **ARC-01** | **LOW** | **前端单文件 1559 行单体结构缺乏模块化** | `frontend/src/app/page.tsx` | **方案**：将 `AuthModal`、`RecipeModal`、`InventoryTab` 等独立抽离为 `components/` 子组件。 |

---

## 七、 关键修复代码示例

### 7.1 修复 SEC-01：拓扑 IP 识别与代理配置修正
在 `docker-compose.yml` 中：
```yaml
      # 前端 Next.js rewrites 实际上作为反向代理访问后端，因此必须开启 TRUST_PROXY
      - TRUST_PROXY=${TRUST_PROXY:-true}
```
并在 `backend/src/services/authSecurity.ts` 中针对内部私网 IP 做更细粒度判定：
```typescript
export function getClientIp(c: Context): string {
  if (config.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      // 取客户端初始 IP（首个非代理节点）
      const client = forwarded.split(',')[0].trim();
      if (client) return client;
    }
    const realIp = c.req.header('x-real-ip');
    if (realIp && realIp.trim()) {
      return realIp.trim();
    }
  }

  const socketIp = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;

  return socketIp || UNKNOWN_CLIENT_IP;
}
```

### 7.2 修复 LOG-01：食材同义词匹配顺序修正
在 `backend/src/utils/ingredientMatch.ts` 中修正判定优先级：
```typescript
export function isIngredientMatch(invName: string, recName: string): boolean {
  const iNorm = invName.trim().toLowerCase();
  const rNorm = recName.trim().toLowerCase();

  if (!iNorm || !rNorm) return false;
  if (iNorm === rNorm) return true;

  const iGroup = synonymIndex.get(iNorm);
  const rGroup = synonymIndex.get(rNorm);

  // 【核心修复】两边都是词典里的标准叫法：严格以分组相同为准，严禁子串包含越权！
  if (iGroup !== undefined && rGroup !== undefined) {
    return iGroup === rGroup;
  }

  // 某一方不在词典中时（如“有机土豆”），才允许模糊与包含判定
  if (iNorm.includes(rNorm) || rNorm.includes(iNorm)) {
    // 保护：排除常见的单字冲突
    if ((iNorm === '洋葱' && rNorm === '葱') || (iNorm === '葱' && rNorm === '洋葱')) return false;
    return true;
  }

  for (const group of SYNONYM_GROUPS) {
    const iInGroup = group.some((g) => iNorm.includes(g) || g.includes(iNorm));
    if (!iInGroup) continue;
    const rInGroup = group.some((g) => rNorm.includes(g) || g.includes(rNorm));
    if (rInGroup) return true;
  }

  return false;
}
```

### 7.3 修复 SEC-03：前端验证码安全渲染
在 `frontend/src/app/page.tsx` 中：
```tsx
// 替换原 dangerouslySetInnerHTML，彻底杜绝 XSS 风险
{captchaData?.svg ? (
  <img
    src={`data:image/svg+xml;utf8,${encodeURIComponent(captchaData.svg)}`}
    alt="验证码"
    className="w-full h-full object-contain pointer-events-none"
  />
) : (
  <span className="text-[11px] text-slate-400">点击获取</span>
)}
```

---

## 八、 架构长期演进建议

1. **会话认证演进为 HttpOnly Cookie**：
   逐步弃用目前前端 `localStorage` 保存 Bearer Token 的模式，改为服务端在登录成功后通过 `Set-Cookie: token=...; HttpOnly; SameSite=Lax; Secure` 下发，彻底免疫前端脚本读取令牌的风险。
2. **前端页面组件原子化重构**：
   将 `src/app/page.tsx` 拆解为：
   - `components/auth/AuthModal.tsx`
   - `components/fridge/FridgeScan.tsx`
   - `components/inventory/InventoryTable.tsx`
   - `components/recipe/RecipeCard.tsx`
   - `components/recipe/CookingModal.tsx`
   搭配 Zustand 或 React Context 管理全局会话和食材状态，提高代码维护性与首屏性能。
3. **数据库查询下推优化**：
   在 `recipeService.ts` 中重构 `listRecipes`，将 `cuisine`、`difficulty`、`owner_id` 过滤及 `LIMIT/OFFSET` 分页直接转化为 SQLite SQL 语句查询，避免高频请求下的全表内存加载与重复序列化开销。
4. **数据治理脚本标准工程化**：
   在 `scripts/` 下建立公共配置模块 `common.py`，统一封装 SQLite 连接、项目根路径推导、上游 API 客户端与日志输出器，杜绝脚本间重复拷贝逻辑与硬编码绝对路径。

---
*报告编制完毕，已就绪归档。*
