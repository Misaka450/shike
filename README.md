# 食刻AI (Shike AI) 🍳🥦

> 智能冰箱管家与 AI 大厨菜谱助手 —— 记录食材库存、保质期监控、视觉识别、智能菜谱生成与饮食管理。

---

## 🌟 核心特性

- **食材保质期动态管家**：智能分类冷藏、冷冻与常温食材，保质期倒计时预警，杜绝食材浪费。
- **AI 拍照识食材**：接入视觉大模型，一键上传或拍摄冰箱食材照片，自动识别品名、数量与新鲜度。
- **智能大厨菜谱定制**：根据当前库存剩余食材，一键生成创意搭配食谱，提供详尽步骤与营养建议。
- **轻量本地化存储**：基于 SQLite (WAL 模式) 高性能本地数据引擎，支持多用户与数据安全隔离。
- **极简拟人质感 UI**：遵循现代界面设计规范，自适应移动端与桌面端。

---

## 🏗️ 技术架构

| 层次 | 技术选型 |
| --- | --- |
| 前端 | Next.js 14（App Router）+ React 18 + Tailwind CSS + lucide-react + TypeScript |
| 后端 | **Hono** + @hono/node-server + Zod 数据校验 + TypeScript |
| 数据库 | SQLite（better-sqlite3 驱动，WAL 模式，自带版本化迁移） |
| AI 服务 | CLIProxyAPI (CPA) 多模态模型反向代理（视觉识别 + 菜谱生成） |
| 部署 | Docker + Docker Compose（前后端双容器） |

---

## 📁 目录结构

```text
.
├── backend/                  # 后端服务
│   ├── src/
│   │   ├── middleware/       # 鉴权中间件（会话校验）
│   │   ├── routes/           # 接口路由（auth / inventory / recipes / vision）
│   │   ├── services/         # 业务逻辑（含 CPA 调用、会话、安全工具）
│   │   ├── utils/            # 纯函数工具（保质期计算、食材同义词匹配）
│   │   ├── schemas/          # Zod 数据校验模型
│   │   └── db/               # 数据库连接与迁移
│   └── Dockerfile
├── frontend/                 # 前端应用（Next.js）
│   ├── src/app/              # 页面与布局
│   ├── src/lib/              # API 客户端与类型定义
│   └── Dockerfile
├── docs/                     # 设计文档
├── docker-compose.yml        # 服务编排
├── .env.example              # 环境变量模板
└── README.md
```

---

## 🚀 快速启动

### 1. 准备环境变量

```bash
cp .env.example .env
# 编辑 .env，至少填入 CPA_API_KEY
```

### 2. 使用 Docker Compose 部署

```bash
docker compose up -d --build
```

- **Web 前端**：`http://127.0.0.1:3002`
- **API 后端**：`http://127.0.0.1:8081`

> ⚠️ 首次部署如果数据库目录不可写，请先执行 `sudo mkdir -p /opt/shike-ai/data && sudo chown -R 1000:1000 /opt/shike-ai/data`
> （容器内服务以非 root 用户运行，需要该目录的写权限）

### 3. 本地开发

```bash
# 终端 1：启动后端（默认监听 8081）
cd backend && npm install && npm run dev

# 终端 2：启动前端（默认监听 3000）
cd frontend && npm install && npm run dev
```

本地开发时，`API_INTERNAL_URL` 保持 `http://127.0.0.1:8081` 即可。

### 4. 运行测试

```bash
cd backend && npm test
```

---

## ⚙️ 环境变量说明

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8081` | 后端监听端口 |
| `DB_PATH` | `/opt/shike-ai/data/db/shike.db` | SQLite 数据库路径（Windows 本地开发建议改为 `./data/db/shike.db`） |
| `CPA_URL` | `http://127.0.0.1:5201/v1` | CPA 模型代理地址 |
| `CPA_API_KEY` | 空 | CPA 访问凭据（必填） |
| `CORS_ORIGINS` | `http://127.0.0.1:3002,http://localhost:3002` | 允许跨域访问的来源白名单，多个用英文逗号分隔 |
| `TRUST_PROXY` | `false` | 是否信任 `X-Forwarded-For`。**只有前置了可信反向代理时才设为 `true`**，否则客户端可伪造 IP 绕过登录限流 |
| `SESSION_TTL_DAYS` | `30` | 登录会话有效期（天） |
| `MAX_UPLOAD_BYTES` | `5242880` | 单张上传图片体积上限（5MB） |
| `CPA_TIMEOUT_MS` | `30000` | 调用 CPA 上游的超时时间（毫秒） |
| `API_INTERNAL_URL` | `http://127.0.0.1:8081` | 前端服务端转发 `/api` 的目标地址。**Docker 部署必须设为 `http://shike-api:8081`** |

---

## 🔌 API 一览

除认证接口外，所有接口都需要在请求头携带会话令牌：

```
Authorization: Bearer <token>
```

| 方法 | 路径 | 说明 | 需登录 |
| --- | --- | --- | --- |
| GET | `/health` | 存活探针 | 否 |
| GET | `/healthz` | 就绪探针（含数据库检测） | 否 |
| GET | `/api/auth/captcha` | 获取图形验证码 | 否 |
| POST | `/api/auth/guest` | 创建访客会话（可携带 `legacy_user_id` 迁移旧数据） | 否 |
| POST | `/api/auth/register` | 注册并自动登录 | 否 |
| POST | `/api/auth/login` | 账号密码登录 | 否 |
| GET | `/api/auth/me` | 获取当前用户信息 | 是 |
| POST | `/api/auth/logout` | 退出登录（服务端立即作废令牌） | 否 |
| GET | `/api/inventory` | 食材库存列表与警戒统计 | 是 |
| POST | `/api/inventory` | 新增单个食材 | 是 |
| POST | `/api/inventory/batch` | 批量新增（单次最多 200 件） | 是 |
| PATCH | `/api/inventory/:id` | 更新食材 | 是 |
| DELETE | `/api/inventory/:id` | 删除食材 | 是 |
| POST | `/api/vision/fridge-scan` | 拍照识别冰箱食材（multipart 或 base64） | 是 |
| GET | `/api/recipes` | 菜谱列表 | 是 |
| GET | `/api/recipes/history` | 烹饪历史 | 是 |
| POST | `/api/recipes/recommend` | 基于库存推荐菜谱（纯本地计算，不调用大模型） | 是 |
| POST | `/api/recipes/ai-generate` | AI 现场定制菜谱，一次生成 3 道（会调用大模型，每用户 3 次/分钟） | 是 |
| POST | `/api/recipes/:id/cook` | 记录烹饪并扣减库存 | 是 |

**统一响应格式**

```jsonc
// 成功
{ "success": true, "data": { /* ... */ } }

// 失败
{ "success": false, "code": "ERROR_CODE", "error": "面向用户的中文提示" }
```

---

## 🔐 安全设计说明

- **会话令牌**：用户身份完全由服务端签发的令牌决定（`Authorization: Bearer`），客户端无法通过修改请求头或参数冒充他人。
- **密码存储**：scrypt + 每用户随机盐 + 恒定时间比较，登录时自动把历史遗留的弱哈希升级为 scrypt。
- **登录防爆破**：账号与 IP 双维度失败计数，连续 5 次失败锁定 15 分钟。仅在 `TRUST_PROXY=true` 时信任代理头，防止伪造 IP 绕过。
- **访客数据认领**：登录/注册时只能迁移**当前访客会话**名下的数据，且每份访客数据仅可被认领一次。
- **上传限制**：图片体积 ≤ 5MB，并通过文件头魔数校验真实格式（不仅信任客户端声明的 MIME）。
- **AI 接口限流**：识图与 AI 菜谱生成均做了频率限制，避免额度被批量刷取。

---

## 🗄️ 数据库

- 数据文件位于 `DB_PATH` 指定路径，容器部署时挂载自 `/opt/shike-ai/data`。
- 结构变更通过 `backend/src/db/index.ts` 中的**迁移清单**管理：新变更往数组末尾追加，服务启动时自动按版本执行，无需手工改表。

**备份建议**

```bash
# SQLite 处于 WAL 模式，建议用 sqlite3 的在线备份命令，避免直接复制导致数据不一致
sqlite3 /opt/shike-ai/data/db/shike.db ".backup '/opt/shike-ai/data/backup/shike-$(date +%F).db'"
```

---

## ❓ 常见问题

**Q：页面能打开，但所有数据都加载失败？**
A：多半是前端容器访问不到后端。确认 `docker-compose.yml` 中 `shike-web` 的 `API_INTERNAL_URL` 为 `http://shike-api:8081`（不能用 `127.0.0.1`，那指向的是前端容器自身）。

**Q：升级后我原来的食材不见了？**
A：系统会自动把旧版浏览器本地生成的用户 ID 名下的数据迁移到新会话，每个设备只需迁移一次。若仍未看到，请检查浏览器是否禁用了本地存储。

**Q：登录接口一直提示验证码错误？**
A：验证码为一次性使用，2 分钟过期；每次登录失败后会自动刷新，请重新输入。

**Q：Windows 本地开发报数据库路径错误？**
A：把 `.env` 中的 `DB_PATH` 改为相对路径，例如 `./data/db/shike.db`。

---

## 📄 开源许可

本项目遵循 MIT 协议，详见 [LICENSE](./LICENSE)。