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



### 4) 硬字幕 OCR（可选）

如果视频没有内封字幕轨（画面里有“烧录字幕”），可在前端选择 **画面硬字幕 OCR（实验）** 模式。

说明：
- OCR 模式不依赖 `检测字幕轨` 结果。
- worker 会按 `OCR_INTERVAL_SEC` 抽帧并用 `OCR_LANG` 识别（推荐中文场景设为 `chi_sim`，默认间隔 0.5 秒）。
- 识别后仍会走 `zh/en/both` 过滤并输出 `.srt`。
- 可调参数：`OCR_MIN_CONFIDENCE`（识别置信度阈值）、`OCR_PSM`（版面模式）、`OCR_CROP_BOTTOM_RATIO`（底部裁剪比例）、`OCR_MIN_STABLE_FRAMES`（最小稳定帧数）、`OCR_MAX_GAP_FRAMES`（允许中断帧数）。
- 终极精度模式：支持 `OCR_ENGINE=http` 外接更强 OCR 服务（如 PaddleOCR/自建多模型服务），通过 `OCR_HTTP_URL` 配置接口地址，支持批量识别（`OCR_HTTP_BATCH_SIZE`）和超时控制（`OCR_HTTP_TIMEOUT_MS`）。
- HTTP OCR 接口约定：`POST OCR_HTTP_URL`，请求体 `{ images: string[], lang, minConfidence, psm }`（`images` 为 base64 PNG 数组），响应体可为 `[{ text, confidence }]` 或 `{ results: [{ text, confidence }] }`。
- 可选“输出新视频”模式：移除原字幕轨并挂载新生成字幕轨（输出 MKV，避免重编码画质损失）。
- OCR 还会额外输出同名 `*.timeline.json`（每段字幕的时间轴），便于你核对“识别文本-视频时间”对应关系。

## API Overview

- `POST /api/upload` upload video (`file` form-data)
- `POST /api/detect-subtitles` detect subtitle streams by `fileId`
- `POST /api/jobs` create processing job
- `GET /api/jobs/:jobId` get job status + progress
- `GET /api/jobs/:jobId` 在失败时会返回 `failedReason` 和 `failedStack`，可直接用于排障。
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

### OCR 失败排障（重点）

```bash
# 先确认容器内 tesseract/语言包是否存在
docker compose exec worker sh -lc 'tesseract --version && tesseract --list-langs'

# 实时查看 OCR worker 报错
docker compose logs -f worker

# 直接看任务失败详情（包含 failedReason + failedStack）
curl -s http://127.0.0.1/api/jobs/<jobId> | jq .
```

如果你看到 `file:///app/src/services/ocrSubtitleService.js:15:...` 这类老行号，通常是旧镜像还在跑，请执行：

```bash
docker compose up -d --build backend worker frontend
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
