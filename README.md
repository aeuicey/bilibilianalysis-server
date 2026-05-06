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

### 直接运行

```bash
npm start
```

### Docker

```bash
docker build -t bilibilianalysis-server .
docker run -d -p 3000:3000 bilibilianalysis-server
```

### Nginx 反代

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
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
