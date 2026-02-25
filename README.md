# movie-blink-translator-ui Docker 远端部署指南

本文档说明如何以 **Docker** 方式将 `movie-blink-translator-ui` 上传并部署到远端 Docker 服务器，并列出项目启动所需的关键参数。

## 快速回答：如何打包并上传到远端

如果你只关心“怎么打包上传”，直接用下面这组命令（离线传输，不依赖镜像仓库）：

```bash
# 1) 本地构建镜像
docker build -t movie-blink-translator-ui:latest .

# 2) 本地打包镜像
docker save movie-blink-translator-ui:latest | gzip > movie-blink-translator-ui.tar.gz

# 3) 上传到远端服务器
scp movie-blink-translator-ui.tar.gz user@<SERVER_IP>:/tmp/

# 4) 远端导入并启动
ssh user@<SERVER_IP> 'gunzip -c /tmp/movie-blink-translator-ui.tar.gz | docker load &&   docker rm -f movie-blink-translator-ui >/dev/null 2>&1 || true;   docker run -d --name movie-blink-translator-ui --restart unless-stopped   -p 8080:80   -e NODE_ENV=production   -e PORT=80   -e API_BASE_URL=https://api.yourdomain.com   -e TZ=Asia/Shanghai   movie-blink-translator-ui:latest'
```

> 把 `user`、`<SERVER_IP>`、`API_BASE_URL` 按你的环境替换即可。

---

## 1. 前置条件

请确保本地和远端环境满足以下条件：

- 本地已安装：`git`、`docker`。
- 远端服务器已安装：`docker`（建议 24+）与 `docker compose`（可选）。
- 远端服务器安全组/防火墙已放行对外访问端口（例如 `8080`）。
- 你已可通过 `ssh user@<SERVER_IP>` 登录远端机器。

---

## 2. 本地构建镜像

在项目根目录执行：

```bash
docker build -t movie-blink-translator-ui:latest .
```

如果你的服务器架构与本机不同（如本机是 Apple Silicon，服务器是 x86_64），请使用 `buildx` 构建多架构镜像：

```bash
docker buildx build --platform linux/amd64 -t movie-blink-translator-ui:latest .
```

---

## 3. 上传镜像到远端服务器（两种方式）

### 方式 A（推荐）：推送到镜像仓库再远端拉取

1. 给镜像打标签（以 Docker Hub 为例）：

```bash
docker tag movie-blink-translator-ui:latest <DOCKER_USER>/movie-blink-translator-ui:latest
```

2. 登录并推送：

```bash
docker login
docker push <DOCKER_USER>/movie-blink-translator-ui:latest
```

3. 远端服务器拉取：

```bash
ssh user@<SERVER_IP>
docker pull <DOCKER_USER>/movie-blink-translator-ui:latest
```

### 方式 B：不经过仓库，直接导出并上传镜像

1. 本地导出镜像：

```bash
docker save movie-blink-translator-ui:latest | gzip > movie-blink-translator-ui.tar.gz
```

2. 传到远端：

```bash
scp movie-blink-translator-ui.tar.gz user@<SERVER_IP>:/tmp/
```

3. 远端导入：

```bash
ssh user@<SERVER_IP>
gunzip -c /tmp/movie-blink-translator-ui.tar.gz | docker load
```

---

## 4. 启动容器（docker run）

在远端执行：

```bash
docker run -d \
  --name movie-blink-translator-ui \
  --restart unless-stopped \
  -p 8080:80 \
  -e NODE_ENV=production \
  -e PORT=80 \
  -e API_BASE_URL=https://api.example.com \
  -e TZ=Asia/Shanghai \
  movie-blink-translator-ui:latest
```

> 如果你是通过仓库拉取镜像，请把最后一行镜像名改为 `<DOCKER_USER>/movie-blink-translator-ui:latest`。

---

## 5. 必配参数说明（让项目跑起来）

以下是部署时最关键的参数：

- `-p <HOST_PORT>:<CONTAINER_PORT>`
  - 作用：映射端口。
  - 示例：`-p 8080:80` 表示外部访问 `http://<SERVER_IP>:8080`。
- `API_BASE_URL`
  - 作用：前端请求后端 API 的基础地址。
  - 必填建议：使用可被浏览器访问到的完整 URL，例如 `https://api.yourdomain.com`。
- `NODE_ENV=production`
  - 作用：以生产模式运行。
- `PORT`
  - 作用：容器内应用监听端口（需与你镜像内部服务配置一致，常见 `80` 或 `3000`）。
- `--restart unless-stopped`
  - 作用：服务器重启后自动拉起容器。
- `TZ=Asia/Shanghai`
  - 作用：设置时区，便于日志排查。

---

## 6. 使用 docker-compose（推荐生产环境）

在远端机器创建 `docker-compose.yml`：

```yaml
version: "3.9"
services:
  movie-blink-translator-ui:
    image: <DOCKER_USER>/movie-blink-translator-ui:latest
    container_name: movie-blink-translator-ui
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      NODE_ENV: "production"
      PORT: "80"
      API_BASE_URL: "https://api.example.com"
      TZ: "Asia/Shanghai"
```

启动：

```bash
docker compose up -d
```

查看状态与日志：

```bash
docker compose ps
docker compose logs -f --tail=200
```

---

## 7. 验证部署是否成功

远端执行：

```bash
docker ps --filter name=movie-blink-translator-ui
curl -I http://127.0.0.1:8080
```

本地浏览器访问：

```text
http://<SERVER_IP>:8080
```

---

## 8. 常见问题

- **容器启动后立即退出**
  - 查看日志：`docker logs -f movie-blink-translator-ui`
  - 检查 `PORT` 是否与容器内应用监听端口一致。
- **页面能打开但 API 报错**
  - 检查 `API_BASE_URL` 是否正确、是否 HTTPS 证书有效、是否跨域已放行。
- **外网无法访问**
  - 检查云服务器安全组、系统防火墙、端口映射是否一致。

---

## 9. 推荐上线参数模板

可直接复用（根据实际环境替换）：

```bash
docker run -d \
  --name movie-blink-translator-ui \
  --restart unless-stopped \
  -p 8080:80 \
  -e NODE_ENV=production \
  -e PORT=80 \
  -e API_BASE_URL=https://api.yourdomain.com \
  -e TZ=Asia/Shanghai \
  <DOCKER_USER>/movie-blink-translator-ui:latest
```

