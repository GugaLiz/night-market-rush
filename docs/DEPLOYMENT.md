# 网页构建与本机部署

本项目支持 GitHub Pages 和本机 / 同一局域网静态网页服务。按用户要求，本次准备将经隔离验证的 Cocos 开发原型部署到 GitHub Pages；本机 `dist` 仍为旧版网页。部署是否成功以实际工作流结果为准。

## GitHub Pages

在仓库 Settings → Pages 中将构建来源设为 **GitHub Actions**。推送到 `main` 后，工作流先运行测试并核对 `pages-release/` 中 Cocos 包与当前 Creator 项目的文件集合及 SHA-256；一致后将 Cocos 原型放在站点根路径，并用 `npm run build` 构建旧版，放在 `/legacy/`。部署状态和链接以 Actions 及 Pages 设置的实际结果为准。Cocos 包是 Creator 3.8.8 Web Mobile 非调试候选，仍保留“未完成的开发原型”标识；它启用同源网页存档，旧版路径 `/legacy/` 与站点根路径共享同一域名和存储。同一存档跨标签同时写入仍有竞争风险，不同协议、域名或端口的存档不会自动同步。

Pages 组装时把 Cocos 静态资源放在以发布包 SHA-256 为名的 `_builds/` 目录，根页面以 `<base>` 指向该目录；浏览器地址、查询参数、存档 origin、PWA 安装入口和作用范围仍在站点根路径。每次工作流从父提交提取上一发布包，同时保留上一版的根资源与版本目录，供仍缓存旧 HTML 的浏览器短期完成加载；这只覆盖最近一次切换，不保证在多个连续部署后长时间未刷新的标签页仍能加载旧资源。现有 `/legacy/` 的旧网页入口独立保留。页面和根 manifest 受 GitHub Pages 缓存控制，更新后可能短暂继续显示旧版；旧页面会引用与它匹配的资源，而不是混用新旧引擎文件。

`pages-release/cocos-web.zip` 是有来源哈希校验的已构建产物，供 GitHub 的 Linux runner 发布，不包含本地候选构建的绝对路径元数据。Creator 工程的 `assets`、`settings`、`build-templates`、`package.json` 或 `tsconfig.json` 中任一文件增删或内容变化时，工作流会失败，必须先用 Creator 3.8.8 重建并验证候选，再更新发布包与清单。不要修改清单以绕过检查，也不要将隔离候选目录的 `candidate-build.json` 发布。Web 候选可通过图片优化脚本优先使用已校验像素一致的原始 WebP，并保留 PNG 回退；其他平台的 Creator 资源不受影响。例如：

```powershell
./scripts/build-cocos-web-candidate.ps1 -OutputName web-candidate-new
python scripts/optimize-cocos-web-images.py --candidate cocos/build/web-candidate-new --output cocos/build/web-candidate-new-webp
python scripts/cocos_pages.py evidence --candidate cocos/build/web-candidate-new-webp --prefix pages-new
# 安全备份当前 pages-release 两个文件后，再移出原文件以便 pack 创建新包
python scripts/cocos_pages.py pack --candidate cocos/build/web-candidate-new-webp --source-evidence .runtime/pages-new-source.json --build-evidence .runtime/pages-new-build.json
python scripts/cocos_pages.py verify
python scripts/cocos_pages.py assemble --out .runtime/pages-site --legacy dist --previous .runtime/pages-previous.zip
```

`pack` 不覆盖现有发布包；后续更新应先安全保留旧包与验证记录。用 Creator 脚本构建新的隔离候选并完成验收后，可执行 `python scripts/cocos_pages.py evidence --candidate cocos/build/<新候选目录> --prefix <新证据名>`，该命令会核对当前工程和构建快照只有候选存档开关的预期差异，再在 `.runtime/` 中生成 `<新证据名>-source.json` 和 `<新证据名>-build.json`，供 `pack` 使用。请先自行核对构建和验收记录；本地生成的证据不是独立的数字签名。验收包括子路径、同源存档、旧版 `/legacy/` 和回滚。`/legacy/` 是用当前仓库源码生成的旧网页版本，是否与之前线上发布版本完全相同须按提交和构建记录判断；回退原线上版本可重新运行原提交对应的 Pages 工作流。

干净 Git 检出没有 Creator 编辑器生成的 `cocos/temp/tsconfig.cocos.json`。旧网页 Vite 构建和 Vitest 针对 `cocos/assets/scripts/` 的共享 TypeScript 模块使用独立转换配置，不依赖该缓存；这只用于网页代码转换，不代替 Creator 编辑器构建或类型检查。某些依赖扫描仍可能提示缺少这份编辑器配置，需以实际测试和构建退出状态判断是否成功。

## 安装、检查与构建

在项目根目录运行（Windows PowerShell 建议使用 npm.cmd，避免脚本执行策略影响）：

```powershell
npm.cmd ci
npm.cmd test
node --test scripts/server-test.mjs
npm.cmd run build
```

首次开发若没有安装依赖，`npm ci` 根据提交的 lockfile 安装。构建通过后生成 `dist/index.html` 与资源。要在本机或同一局域网测试「配送试验场」，把上面的构建命令换成 `npm.cmd run build:playtest`。开发服务 `npm.cmd run dev` 也开放试验场。

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

修改源文件后按所需版本重新构建。服务器直接读取 `dist`，构建完成后刷新即可。

## 服务器行为与边界

- 只提供 `dist`，不暴露源码、设计文档或整个工作目录。
- 支持 GET / HEAD，其他方法返回 405；图片、字体、音频、JavaScript 等使用正确 MIME。
- 只有无扩展名的页面路由可以回退到 `index.html`；缺失 `/assets/*`、脚本或图片返回 404，不伪装成 HTML。
- 拒绝目录穿越、反斜杠、隐藏路径和指向根目录外的符号链接。
- 健康接口 `/__night_market_health` 返回服务 ID、项目哈希、PID 与实例标识，不包含用户存档或游戏数据。
- 这是测试和自托管用的轻量静态服务，没有公网 TLS、账号、后端同步、发布平台、反向代理或云监控。

Android / iOS / 微信小游戏接入见 [平台适配说明](PLATFORM_ADAPTERS.md)，网页部署不代表其他平台已经打包完成。
