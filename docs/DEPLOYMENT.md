# 网页构建与本机部署

本项目支持 GitHub Pages 和本机 / 同一局域网静态网页服务。Node/npm 用于构建，浏览器只下载 `dist` 中的资源。

## GitHub Pages

在仓库 Settings → Pages 中将构建来源设为 **GitHub Actions**。推送到 `main` 后，`.github/workflows/deploy.yml` 会安装依赖、运行测试、构建并发布 `dist`。部署状态和实际链接可在仓库 Actions 和 Pages 设置中查看。项目使用相对资源路径，支持部署在仓库子路径下。

## 安装、检查与构建

在项目根目录运行（Windows PowerShell 建议使用 npm.cmd，避免脚本执行策略影响）：

```powershell
npm.cmd ci
npm.cmd test
node --test scripts/server-test.mjs
npm.cmd run build
```

首次开发若没有安装依赖，`npm ci` 根据提交的 lockfile 安装。构建通过后生成 `dist/index.html` 与资源。类型检查或测试失败应先修复，不能把开发服务器能打开视为构建通过。

## 启动网页版

前台方式（关闭此终端或 Ctrl+C 会停止服务）：

```powershell
npm.cmd run serve
```

独立后台方式（隐藏窗口，启动前检查构建，成功后检查健康接口）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-web.ps1
```

地址为 [http://localhost:4173](http://localhost:4173)。服务器监听 `0.0.0.0:4173`，因此同网络设备也可以访问；程序不会自动修改防火墙。手机与电脑在同一局域网时，将 localhost 换成电脑的局域网 IPv4，例如 `http://192.168.1.20:4173`。具体地址以启动脚本输出的 LAN candidate 和本机网络信息为准；VPN、虚拟网卡、隔离 Wi-Fi 和防火墙可能阻止访问，不保证每个列出的网卡都可达。

手机使用普通 HTTP 局域网地址时，浏览器可能不允许设备运动权限或其他安全上下文功能。摇杆仍是基础操作方式；正式部署应使用 HTTPS，并在实际 iPhone / Android 浏览器上验证重力感应。电脑 localhost 的可用性不能证明手机局域网 HTTP 也具备同样权限。

如 4173 被其他应用使用，不杀掉该应用，可明确选择其他端口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-web.ps1 -Port 4174
```

本项目已经运行时，重复启动复用同一个健康进程。若现有进程异常，脚本报错并保留日志，不擅自终止无关进程；如需换端口，先停止此项目服务。

## 停止和重启

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop-web.ps1
```

停止脚本同时验证 PID 元数据、项目绝对路径、Node 可执行文件以及脚本命令行，只有确认是本项目的 `scripts/serve.mjs` 才停止。PID 被系统复用到其他程序时拒绝操作。元数据位置为 `.night-market-server.json`；后台日志为 `.runtime/web.stdout.log` 和 `.runtime/web.stderr.log`。这些是运行时文件，不应提交为源码。

修改源文件后重新 `npm.cmd run build`。服务器直接读取 `dist`，通常重新刷新即可；若构建过程中请求到短暂缺失的文件，完成后再刷新。正式维护可先停服务、构建成功后再启动。

## 服务器行为与边界

- 只提供 `dist`，不暴露源码、设计文档或整个工作目录。
- 支持 GET / HEAD，其他方法返回 405；图片、字体、音频、JavaScript 等使用正确 MIME。
- 只有无扩展名的页面路由可以回退到 `index.html`；缺失 `/assets/*`、脚本或图片返回 404，不伪装成 HTML。
- 拒绝目录穿越、反斜杠、隐藏路径和指向根目录外的符号链接。
- 健康接口 `/__night_market_health` 返回服务 ID、项目哈希、PID 与实例标识，不包含用户存档或游戏数据。
- 这是测试和自托管用的轻量静态服务，没有公网 TLS、账号、后端同步、发布平台、反向代理或云监控。

Android / iOS / 微信小游戏接入见 [平台适配说明](PLATFORM_ADAPTERS.md)，网页部署不代表其他平台已经打包完成。
