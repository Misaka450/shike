# 食刻 AI — 前端（Frontend）

基于 **Next.js 14（App Router）** 的食刻 AI 前端应用，负责冰箱库存看板、拍照识别交互与菜谱浏览。

---

## 本地开发

```bash
npm install
npm run dev      # 默认 http://localhost:3000
```

后端需要同时运行在 `http://127.0.0.1:8081`（见 `../backend`）。
若后端不在默认地址，请在 `.env.local` 中设置：

```
API_INTERNAL_URL=http://127.0.0.1:8081
```

---

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建（会执行 ESLint 与 TypeScript 类型检查） |
| `npm start` | 以生产模式启动（需先 build） |
| `npm run lint` | 单独执行 ESLint 检查 |

---

## 关键约定

- **接口请求统一走 `src/lib/api.ts`**：该模块负责会话令牌的获取、携带与失效重试，页面组件不要直接调用 `fetch`。
- **用户身份由服务端会话决定**：前端只持有令牌（`localStorage.shike_token`），不要自行生成或篡改用户 ID。
- **类型定义集中在 `src/lib/types.ts`**：其中 `Recipe` 是基础结构，`RecipeRecommendation` 是带推荐评分的扩展结构，二者不要混用。
- **`/api/*` 由 `next.config.mjs` 的 rewrites 转发到后端**：容器部署时必须通过 `API_INTERNAL_URL` 指向后端服务名。

---

## 构建产物

生产构建使用 Next.js 的 `standalone` 模式（见 `next.config.mjs`），
产物位于 `.next/standalone`，Docker 镜像只需拷贝该目录即可运行，无需完整 `node_modules`。