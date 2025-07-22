# Runbook MVP (最简可用版)

## 技术栈
- 前端：React 18 + MUI 5 + react-hook-form + axios + react-beautiful-dnd
- 后端：Node.js + Express + Mongoose + multer
- 数据库：MongoDB
- 部署：Docker Compose

## 目录结构
```
runbook-mvp/
  frontend/         # React + MUI + react-hook-form
  backend/          # Node.js + Express + MongoDB
  mongo-data/       # MongoDB 持久化数据
  docker-compose.yml
  README.md
```

## 本地启动

1. 安装 [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/)
2. 在项目根目录运行：
   ```bash
   docker-compose up --build
   ```
3. 访问前端：http://localhost:3000
4. 后端API：http://localhost:5000

## 功能说明
- Runbook 增删改查
- Checklist 步骤可编辑、可拖拽、可上传图片
- 执行记录管理
- 无用户认证，内网可直接访问

---

# Runbook MVP (Minimal Usable Version)

## Tech Stack
- Frontend: React 18 + MUI 5 + react-hook-form + axios + react-beautiful-dnd
- Backend: Node.js + Express + Mongoose + multer
- Database: MongoDB
- Deploy: Docker Compose

## Quick Start
1. Install [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
2. In project root:
   ```bash
   docker-compose up --build
   ```
3. Frontend: http://localhost:3000
4. Backend API: http://localhost:5000 