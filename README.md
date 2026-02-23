# movie-blink-translator-ui

MVP for extracting embedded subtitles from MKV/MP4 and filtering bilingual lines into `zh` / `en` / `both` outputs.

## Structure

- `frontend`: Vue3 + Vite + Element Plus UI
- `backend`: Express API + BullMQ worker + ffmpeg/ffprobe integration

## Quick Start

### 1) Start Redis

```bash
redis-server
```

### 2) Install deps

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3) Run services

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd backend && npm run worker

# terminal 3
cd frontend && npm run dev
```

## API Overview

- `POST /api/upload` upload video (`file` form-data)
- `POST /api/detect-subtitles` detect subtitle streams by `fileId`
- `POST /api/jobs` create processing job
- `GET /api/jobs/:jobId` get job status + progress
- `GET /api/download/:jobId` download generated subtitle file

## Notes

- Max upload size: 2GB
- File types: `.mkv`, `.mp4`
- Worker concurrency: 3
- Files older than 24 hours are cleaned when worker runs.


## IDE Troubleshooting (App.vue shows TS2304/TS1110)

If your editor reports errors like `Cannot find name "template"` / `Cannot find name "router"` in `App.vue`, it is usually parsing `.vue` as plain TypeScript instead of Vue SFC.

1. In `frontend/`, install deps so `typescript` and `vue-tsc` exist:

```bash
cd frontend && npm install
```

2. In VS Code, install/enable **Volar** and disable Vetur.
3. Ensure workspace recommends/extensions are applied from `.vscode/extensions.json`.
4. Reload VS Code window.

You can also run a project type check:

```bash
cd frontend && npm run typecheck
```


## Docker 部署

项目已提供完整 Docker 配置：

- `backend/Dockerfile`：后端 API 镜像（内置 `ffmpeg`）
- `frontend/Dockerfile`：前端构建 + Nginx 静态托管
- `frontend/nginx.conf`：前端路由回退和 `/api` 反向代理到 `backend:3000`
- `docker-compose.yml`：一键启动 `frontend + backend + worker + redis`

### 启动

```bash
docker compose up -d --build
```

### 查看状态

```bash
docker compose ps
docker compose logs -f backend worker
```

### 访问

- 页面：`http://<你的服务器IP>/`
- 后端健康检查（容器内）：`docker compose exec backend curl -s http://localhost:3000/health`

### 停止

```bash
docker compose down
```


## 配置集中管理（环境变量）

你可以把 Redis、端口、存储路径、并发、上传大小等集中在 `.env` 管理。

### 1) 复制示例配置

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2) 关键变量

- `REDIS_URL`：队列 Redis 地址
- `PORT`：后端监听端口
- `STORAGE_DIR` / `UPLOAD_DIR` / `OUTPUT_DIR`：上传与输出目录
- `WORKER_CONCURRENCY`：worker 并发数
- `FILE_TTL_HOURS`：文件清理时间（小时）
- `MAX_UPLOAD_SIZE_BYTES`：上传大小上限
- `VITE_API_BASE_URL`：前端 API 基础地址

### 3) Docker Compose 使用

`docker-compose.yml` 已读取根目录 `.env`，可直接通过修改 `.env` 调整部署参数。
