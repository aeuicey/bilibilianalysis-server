# BiliAnalysis Server
<img width="2279" height="1280" alt="650769ce7ca8f01416f7ca67aaabc4c6" src="https://github.com/user-attachments/assets/0b00b210-0d6b-46ec-aa59-caeb07d50ef4" />


BiliAnalysis 的服务器端部署版本 —— 提供 B 站视频/直播 CDN 直链解析 API。

解析 B 站 API 后，自动将 BCache 型（`cn-*.bilivideo.com`）和 UPOS 型（`upos-sz-estg*`）CDN 域名替换为 **Mirror 型优质 CDN**（阿里云/腾讯云/华为云/百度云），以获得更稳定快速的体验。

## 功能特性

- **视频解析**：支持 BV 号、AV 号、指定分 P 的 B 站视频
- **直播解析**：B 站直播间实时流地址获取
- **优质 CDN 升级**：自动将 BCache/UPOS/MCDN 升级为 Mirror CDN（阿里云/腾讯云/华为云/百度云）
- **缓存机制**：10 分钟 TTL，减少对 B 站 API 的重复请求
- **健康检查**：`/health` 端点返回服务状态

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务 (默认 3000 端口)
npm start

# 自定义端口
PORT=8080 npm start
```

## API 使用

### 视频解析

```
GET /?url=<B站视频链接>
```

**示例：**

| 格式 | URL |
|------|-----|
| BV 号 | `GET /?url=https://www.bilibili.com/video/BV1GJ411x7h7` |
| AV 号 | `GET /?url=https://www.bilibili.com/video/av170001` |
| 指定分 P | `GET /?url=https://www.bilibili.com/video/BV1xx411c7mD?p=2` |
| 直播 | `GET /?url=https://live.bilibili.com/6` |

**响应：** HTTP 302 重定向至 B 站 CDN 直链地址。

### 健康检查

```
GET /health
```

```json
{
  "status": "ok",
  "uptime": 1234.5
}
```

## 架构

```
请求 → Express → resolveRawUrl(B站API) → mirror-cdn.js(升级到镜像CDN) → cache.js(TTL 10分钟) → 302重定向
```

### CDN 升级策略

参考 [Bilibili-Evolved#3234](https://github.com/the1812/Bilibili-Evolved/issues/3234#issuecomment-1504764774) 中的 B 站 CDN 分类：

| CDN 类型 | 特征 | 质量 | 处理 |
|----------|------|------|------|
| Mirror 型 | `upos-sz-mirror*` / 阿里云/腾讯云/华为云/百度云 | ⭐⭐⭐ 最优 | **保持不变** |
| BCache 型 | `cn-*.bilivideo.com` / 自建机房 | ⭐⭐ 因地区而异 | **升级到 Mirror** |
| UPOS 型 | `upos-sz-estg*` / 对象存储 | ⭐⭐ 需回源 | **升级到 Mirror** |
| MCDN 型 | 含 `mcdn` 或 `IP:Port` / P2P | ⭐ 极不稳定 | **升级到 Mirror** 或代理 |
| 免流型 | `*-tf-*.bilivideo.com` | — | **保持不变** |

### 核心模块

| 文件 | 职责 |
|------|------|
| `server.js` | Express 入口，路由处理，缓存管理 |
| `src/bilibili.js` | B 站 API 调用：AV/BV 转换、CID 获取、视频/直播流 URL 解析 |
| `src/mirror-cdn.js` | Mirror CDN 节点列表 + 域名升级策略 |
| `src/cache.js` | 10 分钟 TTL 内存缓存 |

## 部署

服务监听容器内 3000 端口，无外部数据库依赖，解析缓存保存在内存中。

### 方式一：使用 GitHub Packages 预构建镜像（推荐）

镜像由 GitHub Actions 在 main 分支每次提交时自动构建并发布到 GitHub Container Registry（GHCR，即 GitHub Packages 的容器包）：

- 包页面：[bilibilianalysis-server/pkgs/container](https://github.com/aeuicey/bilibilianalysis-server/pkgs/container/bilibilianalysis-server)
- 镜像引用：`ghcr.io/aeuicey/bilibilianalysis-server`
- 构建工作流：`.github/workflows/docker-publish.yml`

**镜像标签说明**

| 标签 | 含义 | 适用场景 |
|------|------|----------|
| `latest` | main 分支最新提交对应的镜像 | 日常部署 |
| `sha-<短哈希>` | 对应某次 commit，例如 `sha-3ae91d0` | 锁定版本、故障回滚 |
| `v1.2.3` | 推送 `v*` 格式 git tag 时自动发布 | 正式版本发布 |

**1. 拉取镜像**

当前镜像包为 Public，可匿名拉取，无需 `docker login`：

```bash
docker pull ghcr.io/aeuicey/bilibilianalysis-server:latest
```

**2. 启动容器**

```bash
docker run -d --name bilibilianalysis-server \
  --restart=unless-stopped \
  -p 3000:3000 \
  ghcr.io/aeuicey/bilibilianalysis-server:latest
```

宿主机映射端口可自行修改，例如 `-p 8080:3000`。

**3. 验证服务**

```bash
curl http://127.0.0.1:3000/health
# {"status":"ok","uptime":12.3}

curl -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  "http://127.0.0.1:3000/?url=https://www.bilibili.com/video/BV1GJ411x7h7"
# 302 https://upos-sz-mirror*.bilivideo.com/...
```

**4. 更新到最新版本**

```bash
docker pull ghcr.io/aeuicey/bilibilianalysis-server:latest
docker rm -f bilibilianalysis-server
docker run -d --name bilibilianalysis-server --restart=unless-stopped \
  -p 3000:3000 \
  ghcr.io/aeuicey/bilibilianalysis-server:latest
```

**5. 回滚到指定版本**

把标签换成对应 commit 的 `sha-*` 标签后重新启动即可：

```bash
docker rm -f bilibilianalysis-server
docker run -d --name bilibilianalysis-server --restart=unless-stopped \
  -p 3000:3000 \
  ghcr.io/aeuicey/bilibilianalysis-server:sha-3ae91d0
```

**Docker Compose 方式**

新建 `compose.yml`：

```yaml
services:
  bilibilianalysis-server:
    image: ghcr.io/aeuicey/bilibilianalysis-server:latest
    container_name: bilibilianalysis-server
    restart: unless-stopped
    ports:
      - "3000:3000"
```

日常更新只需一条命令：

```bash
docker compose pull && docker compose up -d
```

**国内服务器拉取 GHCR 加速**

ghcr.io 在国内网络可能连接超时，以下三种方式任选其一。

a) 为 Docker daemon 配置代理（最可靠）：

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<'EOF'
[Service]
Environment="HTTPS_PROXY=http://代理地址:端口"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
docker pull ghcr.io/aeuicey/bilibilianalysis-server:latest
```

b) 使用第三方 GHCR 加速域名，拉取后重打回标准标签（加速服务可用性随运营商变化，失败时换用其他方式）：

```bash
# 南京大学 GHCR 镜像站示例
docker pull ghcr.nju.edu.cn/aeuicey/bilibilianalysis-server:latest
docker tag ghcr.nju.edu.cn/aeuicey/bilibilianalysis-server:latest \
  ghcr.io/aeuicey/bilibilianalysis-server:latest
```

c) 在能访问 ghcr.io 的机器上拉取后离线传输：

```bash
docker save ghcr.io/aeuicey/bilibilianalysis-server:latest | gzip > bili-img.tar.gz
# 上传到服务器后执行
docker load < bili-img.tar.gz
```

**私有包 / Fork 仓库的认证**

当前仓库镜像为 Public，无需认证。若以后包改为私有，或改用自己 fork 产出的镜像，需先在 GitHub 生成具备 `read:packages` 权限的 Token，再登录拉取：

```bash
echo <你的TOKEN> | docker login ghcr.io -u <GitHub用户名> --password-stdin
docker pull ghcr.io/<用户名>/bilibilianalysis-server:latest
```

**发布正式版本镜像**

main 分支提交会自动更新 `latest`；需要带版本号的镜像时，打一个 `v*` 格式的 git tag 推送即可，Actions 会自动发布同名镜像标签：

```bash
git tag v1.0.0
git push origin v1.0.0
# 自动产出 ghcr.io/aeuicey/bilibilianalysis-server:v1.0.0
```

### 方式二：本地构建 Docker 镜像

需要本机已安装 Docker，适合二次开发后自行构建：

```bash
docker build -t bilibilianalysis-server .
docker run -d --name bilibilianalysis-server --restart=unless-stopped \
  -p 3000:3000 bilibilianalysis-server
```

### 方式三：直接用 Node.js 运行

需要 Node.js 18+（Docker 镜像使用 Node 24）：

```bash
npm ci --omit=dev
PORT=3000 npm start
```

生产环境建议配合 pm2 或 systemd 守护进程。

### Nginx 反代

容器或 Node 进程监听在本机 3000 端口后，可通过 Nginx/OpenResty 对外提供 HTTPS：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 借鉴与致谢

本项目参考了以下优秀项目和技术资料：

| 项目 | 说明 | 许可证 |
|------|------|--------|
| [BiliAnalysis](https://github.com/mmyo456/BiliAnalysis) | 原版 B 站直链解析油猴脚本。本项目中的 AV/BV 转换算法、B 站 API 调用方式（`pagelist`、`playurl`、`getRoomPlayInfo`）均参考自该项目 | [GPL-3.0](https://github.com/mmyo456/BiliAnalysis/blob/main/LICENSE) |
| [Bilibili-Evolved#3234](https://github.com/the1812/Bilibili-Evolved/issues/3234#issuecomment-1504764774) | B 站 CDN 类型分类（Mirror/BCache/UPOS/MCDN）及优质 CDN 替换策略。本项目 Mirror CDN 节点列表及升级策略均参考自该讨论 | — |
| [BiliBili-JX](https://github.com/gujimy/BiliBili-JX) | B 站解析代码参考 | — |

## 许可证

[GPL-3.0 License](LICENSE)

本项目继承自 [BiliAnalysis](https://github.com/mmyo456/BiliAnalysis) 的 GPL-3.0 许可证。
