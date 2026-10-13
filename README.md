# Block & Beat

基于 Phaser、TypeScript 和 WebSocket 的双人法术对战原型。玩家创建或加入房间，双方准备后开始对局。

<img src="docs/preview.png" alt="Block & Beat 双人对战入口" width="320">

## 本地运行

需要 Node.js 22 或更高版本。

```bash
npm ci
npm run server
```

另开一个终端运行：

```bash
npm run dev
```

打开 Vite 输出的 HTTPS 地址（默认 `https://localhost:5173`）。开发证书为自签名证书。分别在两个浏览器窗口创建、加入同一房间；双方点击准备后开始。

开发时浏览器连接同源 `/ws`，Vite 将其转发到本机 `8787` 端口的 WebSocket 服务，因此 HTTPS 页面不会尝试连接没有 TLS 的 `wss://localhost:8787`。

## 验证与构建

```bash
npm test
npm run build
```

单元测试覆盖模拟逻辑、法术、音效与输入。WebSocket 集成测试覆盖满员拒绝、重复入房、断线后的空位、非法消息和双方准备后开局。

## 部署与当前限制

- 前端构建输出到 `dist/`；该目录由构建产生，不提交到源码仓库。
- WebSocket 服务需要独立的 Node.js 进程。单独部署静态前端不会自动部署该服务。
- 构建前通过 `VITE_WS_URL` 指定部署后的 `wss://` 地址，或在反向代理上将同源 `/ws` 转发到 WebSocket 服务。
- 房间保存在进程内存中，服务重启会丢失；没有账户、身份验证重连、持久化战绩或服务端权威防作弊。
- 当前适用于原型验证和熟人试玩，尚未实现公开对战服务所需的流量限制与防作弊。

## 目录

```text
src/game/       Phaser 场景
src/shared/     模拟、法术与消息类型
src/input/      输入控制
src/audio/      声音系统
src/net/        WebSocket 客户端
server/         房间服务与集成测试
public/         运行时素材
```

早期包名为 `shoutbeat`，现统一为 `blockandbeat`。
