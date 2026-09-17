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

- **前端 (Frontend)**: Next.js 14 (App Router) + React 18 + Tailwind CSS + Lucide Icons + TypeScript
- **后端 (Backend)**: Node.js + Express / TypeScript + Better-SQLite3
- **AI 代理服务**: CLIProxyAPI (CPA) 多模态模型反向代理
- **容器编排**: Docker + Docker Compose

---

## 📁 目录结构

```text
.
├── backend/            # 后端服务源码 (API、数据库交互、AI视觉与菜谱服务)
├── frontend/           # 前端应用源码 (Next.js 页面与交互组件)
├── docker-compose.yml  # Docker Compose 服务编排配置
├── .env.example        # 环境变量示例文件
└── README.md
```

---

## 🚀 快速启动

### 1. 准备环境变量

复制环境变量模版并配置您的 CPA API Key：

```bash
cp .env.example .env
# 编辑 .env 填入您的 CPA_API_KEY
```

### 2. 使用 Docker Compose 部署

```bash
docker compose up -d --build
```

- **Web 前端**: 默认映射 `http://127.0.0.1:3002`
- **API 后端**: 默认映射 `http://127.0.0.1:8081`

---

## 📄 开源许可

本项目遵循 MIT 协议。
