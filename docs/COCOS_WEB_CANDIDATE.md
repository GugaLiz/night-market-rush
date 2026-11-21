# Web 发布候选的隔离验证

此流程用于验收存档和非调试构建，**产物仍是未完成的开发原型**。用户已明确要求将当前版本部署到 GitHub Pages 供使用；画面、玩法、设备及正式发布验收没有因此完成，也不表示部署已经成功。

源码的 `cocos/assets/scripts/runtime/web-build-policy.ts` 固定为关闭；普通开发构建始终使用仅内存存储。下列命令复制独立工程快照，在副本中启用候选开关，并使用 Creator 3.8.8 构建 Web Mobile 非 DEBUG 版本。源文件、旧 `dist` 和既有服务不受覆盖。`OutputName` 必须是尚不存在的目录，重复使用会被拒绝；其他 Creator 安装位置可通过 `-CreatorPath` 指定。

```powershell
./scripts/build-cocos-web-candidate.ps1 -OutputName web-storage-candidate1121
```

构建目录位于 `cocos/build/<OutputName>`，并带有 `candidate-build.json` 标记和独立源快照位置。候选会在 **Web 非 DEBUG 环境**读取及写入同源旧存档；验证时应使用隔离浏览器上下文和独立端口。拟公开的 GitHub Pages 主站也会读取和写入同源旧存档，旧版 `/legacy/` 与主站共享同一数据；不同协议、域名或端口不会自动同步。不能用 URL 参数更改开关；微信和 Windows 不会凭这个候选开关启用网页存档。

设置 `COCOS_CANDIDATE_BUILD` 为构建目录名，使用 `playwright.cocos-candidate.config.ts` 运行隔离测试；测试创建新的浏览器上下文，在单独端口同源访问旧站与候选，不触及真实浏览器配置。测试中为快速验证结果流程会直接布置死亡边界，再操作真实游戏按钮；这不等于自然完成一局。

存档合并在写入前重新读取，能处理顺序发生的陈旧标签写入，但浏览器存储没有跨标签的原子读改写事务。旧版和候选同时写入仍有竞争窗口，不能承诺并发时不丢更新。正式切换前仍须确定并验收并发策略、同源迁移、备份、回滚、真实浏览器和平台矩阵。不同协议、域名、端口之间的存档不会自动同步。
