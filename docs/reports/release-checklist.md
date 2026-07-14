# v1.0.0 发布清单

更新时间：2026-07-14

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 正式构建 | 通过 | `npm run build` |
| 自动功能与视觉验收 | 通过 | 88 项单元检查、4 套浏览器项目完整流程、38 项视觉检查 |
| 私有参考边界 | 通过 | `npm run assets:private-check` |
| 素材台账 | 通过 | `npm run assets:ledger-check` |
| 首次下载量 ≤15 MiB | 本地发布版通过 | 11.16 MiB；见 `transfer-size-report.md` |
| WebGPU 三次召唤 | 通过 | 120.04 平均帧；见 `performance-report.md` |
| 强制 WebGL 2 三次召唤 | 通过 | 118.49 平均帧；见 `performance-report.md` |
| 20 次重置 | 通过 | 对象稳定，静置后内存回落 |
| 36 张视觉基准与实际截图 | 通过 | 见 `visual-review-report.md` |
| macOS Chrome | 通过 | 150.0.7871.115 |
| 桌面 Firefox | 通过 | Mozilla Release 152.0.5 |
| Windows Chrome | 待远程运行 | `browser-matrix.yml` |
| Windows Edge | 待远程运行 | `browser-matrix.yml` |
| macOS Safari | 待远程运行 | `browser-matrix.yml` |
| 普通设备性能 | 待远程运行 | 当前本机性能高于目标设备档位 |
| 依赖安全核对 | 通过 | 已知漏洞 0 项 |
| 源码包与构建包 | 通过 | 源码包约 122 MB；直接运行包约 5.9 MB |
| 发布包私有扫描与全新重建 | 通过 | 全新安装、重建、静态打开和私有素材扫描全部完成 |
| 公开 Pages 网址 | 待发布 | 需要完成 GitHub 推送与 Pages 工作流 |
| 公开网址空缓存回归 | 待执行 | Pages 发布后运行 |
| v1.0.0 Release | 待创建 | 最终回归后创建 |

未完成项不得标记为通过；近似浏览器结果不替代真实稳定版记录。
