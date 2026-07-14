# 月辉灵猫召唤

一个可直接在浏览器中体验的原创魔法少女召唤原型。按住鼠标凝聚月光；提前松开会柔和消散，蓄满后松开则召唤月辉灵猫。灵猫会保持在场并看向鼠标，再次施法可完整重置。

公开体验（发布完成后生效）：[https://lileee.github.io/mimimia/](https://lileee.github.io/mimimia/)

## 浏览器要求

推荐使用当前稳定版 Chrome、Edge、Firefox 或 Safari。页面优先使用 WebGPU；不支持时自动回退到 WebGL 2，并保留完整召唤流程。声音只有在点击“进入月光虚境”后才会启动。

## 本地运行

需要 Node.js 22 或更新版本，以及 Git LFS。

```bash
git lfs pull
npm ci
npm run dev
```

浏览器打开 `http://127.0.0.1:4174`。

## 构建与检查

```bash
npm run build
npm run test:acceptance
npm run assets:private-check
npm run assets:ledger-check
npm run assets:size-check
```

生成并验证交付包：

```bash
npm run release:package
npm run release:verify
```

输出位于 `release/`：

- `mimimia-source-v1.0.0.zip`：完整源码、原创母图、分层文件、运行素材、测试和报告。
- `mimimia-dist-v1.0.0.zip`：可由静态服务器直接托管的网页成品。

## 文档

- [开发说明](docs/DEVELOPMENT.md)
- [美术方向](docs/ART-DIRECTION.md)
- [素材来源](docs/ASSET-SOURCES.md)
- [发布说明](docs/DEPLOYMENT.md)
- [性能与稳定性报告](docs/reports/performance-report.md)
- [浏览器矩阵](docs/reports/browser-matrix.md)
- [异常恢复报告](docs/reports/error-recovery-report.md)
- [首次下载量报告](docs/reports/transfer-size-report.md)
- [视觉审核报告](docs/reports/visual-review-report.md)

## 权利说明

项目代码和原创素材分别适用 [代码权利说明](LICENSE-CODE.md) 与 [素材权利说明](LICENSE-ASSETS.md)。当前没有授予开放再利用许可；公开仓库用于网页运行、查看和交付验收。
