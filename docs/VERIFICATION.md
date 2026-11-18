# 本次交付验证记录

> 当前 V3 开发与验证结果见 [V3_VERIFICATION.md](V3_VERIFICATION.md)。V2 与以下 V1 记录作为历史保留。

验证日期：2026-11-18（Asia/Shanghai）。项目：夜市急送，规则版本 `night-market-1.0`。

## 已执行结果

| 检查 | 结果 | 证据与范围 |
|---|---|---|
| TypeScript + Vite 正式构建 | 通过 | `npm.cmd run build`；生成 `dist`，浏览器脚本约 59.73 kB（gzip 21.54 kB），美术资源另计 |
| 核心规则测试 | 23 / 23 | 连续碰撞、道具优先级、三技能、边界、敌人预警、难度封顶、10 分钟模拟实体预算 |
| 集成模拟测试 | 5 / 5 | 固定/不规则步长一致、32 个种子对局、角落生成安全、减速与预警、重试清空 |
| 存档测试 | 14 / 14 | 损坏与未来版本保护、规则隔离、跨标签比较、存储失败会话回退 |
| Chromium 浏览器流程 | 7 / 7 | 首局引导/倒计时/键盘/暂停、设置应用与撤销、失败存档/重试；三技能；旋转恢复；延迟重力授权竞态；CDP 触屏摇杆与 UI 隔离 |
| HTTP 静态服务测试 | 7 / 7 | 静态资源、路径约束、MIME、HEAD、ETag、方法限制、健康检查等；含外部 Windows junction 拒绝 |
| 正式产物冒烟测试 | 通过 | 实际 4173 服务加载、开始、移动、暂停、声音设置；无页面异常/HTTP 资源错误；生产页面不存在开发场景入口 |
| 后台服务生命周期 | 通过 | 首次启动 → 重复启动复用 → 验证身份后停止 → 再次启动；最终保持运行 |

浏览器测试使用 Chromium 159 与 Playwright 1.65.1；系统为 Windows。触屏测试通过移动视口和 CDP 输入模拟完成，不等于手机真机测试。单元测试在 Vitest 3.2.7 运行。

## 视觉与短时性能

已人工查看首页、战斗、技能、声音设置和手机横屏截图：人物/怪物/道具图集切分正常，透明背景正常，文字、交互和 HUD 未发现遮挡或裁切。素材由代码作为独立对象绘制，背景中不包含静态战斗角色。

正式构建在当前电脑 1440×900 浏览器视口的约 2 秒早期对局采样：约 60.2 FPS，95% 帧间隔约 16.8 ms。该短时数据仅说明本机检查结果，不能推断低端手机的性能。

另执行人工构造的渲染压力场景：60 个敌人、3 个道具、30 个减速状态，每 0.4 秒触发三种技能和 12 个击败反馈。初次 DPR 2 标准画质仅 28.67 FPS，随后加入繁忙场景像素密度控制。相同场景复测约 3 秒：标准 59.67 FPS（p95 16.8 ms），简化 60 FPS（p95 16.7 ms），均无页面异常。该压力测试独立驱动渲染，不代表真实自然对局或手机真机结果。

标准画质在敌人数达到 40 或短时效果达到 24 时，将画布 DPR 上限降为 1；敌人数低于 24 且效果少于 8，持续 3 秒后恢复高分辨率上限 2。简化画质固定上限 1，另减少装饰粒子。逻辑坐标、角色大小、技能范围与危险预警均不变。

- [正式构建采样记录](verification/production-report.json)
- [首页截图](verification/home.png)
- [滑板技能截图](verification/skate.png)
- [手机横屏战斗截图](verification/mobile-battle.png)
- [声音设置截图](verification/settings.png)
- [高密度压力场景（人工构造）](verification/stress.png)
- [压力场景优化前数据](verification/stress-before.json) / [优化后数据](verification/stress-after.json)

## 复验方式

```powershell
npm.cmd test
node --test scripts/server-test.mjs
npm.cmd run test:e2e
npm.cmd run build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-web.ps1
node scripts/verify-production.mjs
# 需启动 5173 开发服务器；独立渲染压力测试
node tests/render-stress.mjs
```

浏览器测试首次运行前需安装测试浏览器：`npx.cmd playwright install chromium`。E2E 使用开发服务器 5173，测试场景入口仅在开发模式存在；正式部署使用 4173。浏览器自动化报告位于 `playwright-report`，运行时截图位于 `test-results`；精选验收截图另存本目录，不依赖下一次测试保留旧输出。

## 尚未验证或完成

没有完成 Android/iOS 原生安装包、微信小游戏发布、iPhone/Android 真机、真实设备重力方向与手感、长时间低端机性能或公网 HTTPS 部署。浏览器音频解锁与事件接线已验证，音量舒适度和扬声器实际效果仍应由试玩确认。

没有原作完整可执行参考、逐帧记录和音频对照，因而不把这次结果称为原作全内容、视觉、音效或手感的一比一复刻。当前交付范围是已确定夜市方案的单场景生存游戏：三敌人、三拾取技能、四段难度与完整首局到重试流程。
