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


## 本地 IDEA 开发 + 推送到远端 Docker 集群（完整流程）

本节适用于以下场景：

- 你在本地（IDEA）开发调试代码；
- 目标服务器已有 Docker 环境（或 Docker 集群）；
- Redis 由目标服务器现有实例提供（可能需要账号密码/TLS）。

---

### 1) 本地开发（IDEA）

#### 1.1 导入项目

1. 用 IDEA 打开项目根目录。
2. 确保本机已安装：Node.js 20+、npm、Docker（用于本地构建镜像时）。

#### 1.2 安装依赖

```bash
cd backend && npm install
cd ../frontend && npm install
```

#### 1.3 配置环境变量（本地开发）

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

如果你本地调试也希望连远端 Redis，可在根目录 `.env` 中设置：

```env
# 仅密码（默认用户）
REDIS_URL=redis://:your_password@redis-host:6379/0

# 或 ACL 用户名 + 密码
# REDIS_URL=redis://your_user:your_password@redis-host:6379/0

# 如果 Redis 要求 TLS，使用 rediss://
# REDIS_URL=rediss://your_user:your_password@redis-host:6380/0
```

> 注意：用户名、密码中若含有 `@`、`:`、`/` 等特殊字符，需要进行 URL 编码。

#### 1.4 启动本地服务

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd backend && npm run worker

# terminal 3
cd frontend && npm run dev
```

访问前端：`http://localhost:5173`

---

### 2) 面向远端 Docker 的部署准备

项目包含两个镜像：

- `backend/Dockerfile`：后端 API（内置 ffmpeg）
- `frontend/Dockerfile`：前端构建 + Nginx

建议你准备一个“生产部署用” compose 文件（例如 `docker-compose.prod.yml`），并改为使用镜像仓库地址，而不是在服务器直接 `build`。

示例（外部 Redis，不在 compose 中启动 redis）：

```yaml
services:
  frontend:
    image: your-registry/movie-blink-frontend:latest
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    image: your-registry/movie-blink-backend:latest
    env_file:
      - .env
    environment:
      - PORT=${PORT:-3000}
      - REDIS_URL=${REDIS_URL}
    volumes:
      - app-storage:/app/storage

  worker:
    image: your-registry/movie-blink-backend:latest
    command: npm run worker
    env_file:
      - .env
    environment:
      - REDIS_URL=${REDIS_URL}
    volumes:
      - app-storage:/app/storage

volumes:
  app-storage:
```

---

### 3) 从本地构建并推送镜像

以下命令在本地执行（将 `your-registry` 替换为你的仓库）：

```bash
# 登录镜像仓库
docker login your-registry

# 构建镜像
docker build -f backend/Dockerfile -t your-registry/movie-blink-backend:latest .
docker build -f frontend/Dockerfile -t your-registry/movie-blink-frontend:latest .

# 推送镜像
docker push your-registry/movie-blink-backend:latest
docker push your-registry/movie-blink-frontend:latest
```

建议使用版本号 tag（例如 `v0.1.0`）而不只用 `latest`，便于回滚。

---

### 4) 在远端服务器/集群发布

#### 4.1 准备部署目录

把以下文件放到服务器部署目录：

- `docker-compose.prod.yml`
- `.env`（生产环境变量）

`.env` 示例：

```env
PORT=3000
REDIS_URL=redis://your_user:your_password@redis-host:6379/0
WORKER_CONCURRENCY=3
FILE_TTL_HOURS=24
MAX_UPLOAD_SIZE_BYTES=2147483648
STORAGE_DIR=storage
UPLOAD_DIR=storage/uploads
OUTPUT_DIR=storage/outputs
```

如需 TLS，改为 `rediss://...`。

#### 4.2 拉取并启动

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

#### 4.3 验证发布

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend worker
curl -s http://localhost:3000/health
```

---

### 5) 更新发布（迭代）

每次代码更新：

1. 本地开发并验证；
2. 重新构建并推送新 tag 镜像；
3. 服务器更新镜像 tag；
4. 执行 `docker compose pull && docker compose up -d` 完成滚动更新。

---

### 6) 常见问题

1. **前端能打开但 API 失败**
   - 检查 `frontend/nginx.conf` 中 `/api/` 是否指向 `backend:3000`；
   - 检查 backend 容器是否正常、端口是否监听。

2. **worker 没有消费任务**
   - 检查 backend 与 worker 的 `REDIS_URL` 是否一致；
   - 检查 Redis 防火墙白名单与账号权限。

3. **Redis 认证失败**
   - 检查用户名/密码；
   - 检查 URL 编码（特殊字符）；
   - 云 Redis 若要求 TLS，确保使用 `rediss://`。

4. **视频处理失败**
   - 确认上传的是 `.mkv` / `.mp4`；
   - 确认 worker 正常运行；
   - 查看 worker 日志定位 ffmpeg/ffprobe 报错。


### 7) 过滤英文字幕是在哪里体现的？

英文过滤在后端「任务参数校验 -> worker 过滤执行 -> 解析器规则」三处串起来：

1. **任务参数入口（mode）**
   - `POST /api/jobs` 接口允许 `mode` 为 `zh` / `en` / `both`；
   - 当你传 `mode: "en"`，表示只保留英文字幕行。

2. **worker 调用过滤器**
   - worker 在抽取原始字幕后，会根据 `mode` 调用 `filterSrtContent` / `filterAssContent`；
   - 因此 `mode: "en"` 会进入英文过滤分支。

3. **英文过滤核心规则**
   - 在 `subtitleParser` 中，`mode === 'en'` 的判定是：
     - 行内包含英文字母（`[A-Za-z]`）
     - 且不包含中文字符（`[\u4e00-\u9fff]`）
   - 也就是“纯英文行保留，中英混合行不保留”。

示例请求：

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"fileId":"<你的fileId>","subtitleIndex":0,"mode":"en"}'
```
