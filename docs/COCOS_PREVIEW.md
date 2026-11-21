# Cocos 网页开发预览

这是尚未完成迁移的开发原型预览，不能当作正式游戏或迁移验收。服务只监听本机 `127.0.0.1`，不修改旧网页的 `dist` 或旧服务。普通开发构建使用内存存储，不读取原网页存档；启用旧存档的候选构建不能使用此预览服务，只能按 [隔离验收说明](COCOS_WEB_CANDIDATE.md)测试。

先使用 Creator 3.8.8 构建 Web Mobile，在 `cocos/build/` 中确认目标目录已经有 `index.html`。在项目根目录的 PowerShell 中，将目录名传给启动脚本：

```powershell
./scripts/start-cocos-preview.ps1 -Build web-mobile-check1121 -Port 45590
```

将示例名替换为实际构建目录名。打开脚本输出的 `http://127.0.0.1:45590/cocos-preview/`；根路径 `/` 并非预览地址。不同端口、域名、协议是不同的浏览器存储来源，不自动共享旧网页数据。

停止本项目的受管理预览：

```powershell
./scripts/stop-cocos-preview.ps1
```

脚本通过独立的 `.runtime/cocos-preview.json`、进程命令和健康接口确认身份；端口被占用或身份无法确认时会停止操作，不结束其他进程。同一项目同时仅管理一个预览；要换构建或端口需先停止原预览。启动脚本从 PATH 查找 Node，也可用 `-NodePath` 指定本机 Node 路径。日志位于 `.runtime/cocos-preview.stdout.log` 和 `.runtime/cocos-preview.stderr.log`。

预览地址用于检查真实静态资源的子路径加载，不代表真实手机、微信小游戏或 Windows 原生版已经测试，也不代表可发布或离线运行。
