# movie-blink-translator-ui

MVP for extracting embedded subtitles from MKV/MP4 and filtering bilingual lines into `zh` / `en` / `both` outputs.

## Structure

- `frontend`: Vue3 + Vite + Element Plus UI
- `backend`: Express API + BullMQ worker + ffmpeg/ffprobe integration

## Quick Start

### 1) Install deps

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Run services

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd backend && npm run worker

# terminal 3
cd frontend && npm run dev
```



### 推荐：纯 Docker Compose（Redis 跟随容器启动）

如果你不想在宿主机额外启动 Redis，直接使用：

```bash
cp .env.example .env
docker compose up -d --build
```

说明：
- `backend` / `worker` 通过 `REDIS_URL=redis://redis:6379` 连接 Compose 内部 `redis` 服务。
- 默认把容器内 `6379` 映射到宿主机 `${REDIS_HOST_PORT:-6380}`，避免与宿主机已有 Redis 端口冲突。
- 如无需宿主机直连 Redis，可不使用该端口，仅容器内部通信即可。


### 2.1) 配置文件怎么改（按你的部署方式）

项目里你主要会改这 3 个配置文件：

- 根目录 `.env`（给 `docker-compose.yml` 用）
- `backend/.env`（后端单独运行时用）
- `frontend/.env`（前端单独运行时用）

#### A. 纯 Docker Compose（推荐，不需要宿主机手动起 Redis）

1. 复制：

```bash
cp .env.example .env
```

2. 编辑根目录 `.env`：

```env
PORT=3000
REDIS_URL=redis://redis:6379
REDIS_HOST_PORT=6380
WORKER_CONCURRENCY=3
FILE_TTL_HOURS=24
MAX_UPLOAD_SIZE_BYTES=2147483648
STORAGE_DIR=storage
UPLOAD_DIR=storage/uploads
OUTPUT_DIR=storage/outputs
```

3. 启动：

```bash
docker compose up -d --build
```

> 说明：`redis://redis:6379` 里的 `redis` 是 Compose service 名，只在 Compose 网络内可解析。

#### B. 后端/Worker 在宿主机直接跑（Redis 也在宿主机）

> 现在 `backend` 在未设置 `REDIS_URL` 时，默认也会连 `redis://127.0.0.1:6379`，可直接本机启动调试。

编辑 `backend/.env`：

```env
PORT=3000
NODE_ENV=development
REDIS_URL=redis://127.0.0.1:6379
```

如果 Redis 开启密码：

```env
REDIS_URL=redis://:你的密码@127.0.0.1:6379/0
```

#### C. 连接远程 Redis（云 Redis / K8s Service）

编辑你实际运行后端的环境变量（`.env` 或 `backend/.env`）：

```env
REDIS_URL=redis://:你的密码@redis.example.com:6379/0
```

K8s 内建议写完整 Service DNS（示例）：

```env
REDIS_URL=redis://:你的密码@redis.default.svc.cluster.local:6379/0
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
- `frontend`/`backend` 镜像使用各自目录作为 build context，避免 `COPY frontend/...` 路径错误

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
  - Docker/Compose: `redis://redis:6379`
  - 本地直连: `redis://127.0.0.1:6379`（backend 默认值）
- `REDIS_HOST_PORT`：Redis 对宿主机映射端口（默认 `6380`，避免占用宿主机 `6379`）
- `PORT`：后端监听端口
- `STORAGE_DIR` / `UPLOAD_DIR` / `OUTPUT_DIR`：上传与输出目录
- `WORKER_CONCURRENCY`：worker 并发数
- `FILE_TTL_HOURS`：文件清理时间（小时）
- `MAX_UPLOAD_SIZE_BYTES`：上传大小上限
- `VITE_API_BASE_URL`：前端 API 基础地址

### 3) Docker Compose 使用

`docker-compose.yml` 已读取根目录 `.env`，可直接通过修改 `.env` 调整部署参数。


### 常见构建报错（frontend/nginx.conf not found）

如果你是从 IDE 直接用 `frontend/Dockerfile` 构建，请把 **Build context 设置为 `frontend/` 目录**。
本仓库现在的 `frontend/Dockerfile` 已按 `frontend/` 作为上下文编写（`COPY . ./`、`COPY nginx.conf ...`）。


### 常见运行报错（nginx: host not found in upstream "backend"）

如果前端容器日志出现：

`host not found in upstream "backend"`

通常是容器启动瞬间 DNS 解析时序导致。当前 `frontend/nginx.conf` 已改为 Docker DNS `127.0.0.11` + 变量 upstream 方式，避免 Nginx 在启动阶段因 upstream 暂不可解析而直接退出。
