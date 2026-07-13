# 发布浏览器矩阵

记录时间：2026-07-14（中国标准时间）

## 真实浏览器记录

| 系统 | 浏览器 | 版本 | 后端 | 自动画质 | 完整流程 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| macOS 26.4.1 | Google Chrome | 150.0.7871.115 | WebGPU | 高 | 已完成 | 通过 |
| macOS 26.4.1 | Mozilla Firefox Release | 152.0.5 | WebGPU | 未测；流程使用兼容档 | 已完成 | 通过 |
| macOS 26.4.1 | Microsoft Edge（补充项） | 150.0.4078.65 | WebGPU | 高 | 已完成 | 通过 |
| macOS 26.4.1 | Safari | 26.4 | 未取得 | 未取得 | 未执行 | 待补 |
| Windows | Google Chrome 稳定版 | 未取得 | 未取得 | 未取得 | 未执行 | 待补 |
| Windows | Microsoft Edge 稳定版 | 未取得 | 未取得 | 未取得 | 未执行 | 待补 |

“完整流程”包含：右键无效、提前松开消散、蓄满后继续按住、完整召唤、灵猫保持和看向鼠标、声音切换不打断、再次施法清空。

Firefox 152.0.5 是从 Mozilla 官方稳定通道临时挂载并通过原生 WebDriver 运行，版本来源为 [Mozilla Release 发布页](https://www.mozilla.org/en-US/firefox/notes/)。原始记录与画面见 [Firefox 数据](evidence/mimimia-firefox-152-full-flow.json) 和 [Firefox 完成画面](evidence/mimimia-firefox-152-complete.png)。

Safari 26.4 已确认安装，但本机没有开放 Safari 的远程自动化权限，因此没有把 WebKit 近似环境冒充为正式 Safari 通过。该项计划在隔离的远程测试环境中补齐，不修改用户本机 Safari 安全设置。

## 兼容模式与近似环境

| 环境 | 版本 | 后端 / 画质 | 完整流程 | 说明 |
| --- | --- | --- | --- | --- |
| Google Chrome 正式版 | 150.0.7871.115 | 强制 WebGL 2 / 兼容 | 3 次完整召唤，平均 118.49 帧 | 真实浏览器性能记录 |
| Playwright Chromium | 140.0.7339.16 | 强制 WebGL 2 / 兼容 | 通过 | 可重复的回退基线 |
| Playwright Firefox | 141.0 | WebGL 2 / 兼容 | 通过 | 仅作引擎回归，不替代 Firefox 152.0.5 正式版 |
| Playwright WebKit | 26.0 | WebGL 2 / 兼容 | 最终通过；诊断阶段连续 4 次通过 | 仅作 Safari 引擎回归，不替代 Safari 26.4 |

WebKit 曾出现 1 次自动化点击未送达页面；事件诊断后连续 3 次通过，移除诊断后再次通过。未修改产品逻辑，也未把这次偶发结果从记录中省略。

## 当前发布门槛

五浏览器要求尚未完全满足：还需要真实 Windows Chrome、Windows Edge 和 macOS Safari 记录。其余真实浏览器与强制 WebGL 2 流程已经通过。
