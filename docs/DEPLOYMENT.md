# 发布说明

## GitHub Pages

网页使用相对资源路径，可发布在仓库子路径下。`main` 分支的持续检查全部通过后，`.github/workflows/deploy.yml` 会重新构建并把 `dist/` 发布到 GitHub Pages。

首次设置仓库时，在 GitHub 的 Pages 设置中选择“GitHub Actions”作为来源。计划网址为：

`https://lileee.github.io/mimimia/`

## 持续检查

`.github/workflows/ci.yml` 在每次推送和合并请求中执行：

1. 私有边界检查；
2. 安装锁定依赖和测试浏览器；
3. 完整自动验收；
4. 正式构建；
5. 素材台账与体积检查。

`.github/workflows/browser-matrix.yml` 可手动运行，用隔离环境补充 Windows Chrome、Windows Edge、macOS Safari 和普通设备性能记录。

## 生成交付包

先确认 Git LFS 源文件完整，再执行：

```bash
git lfs pull
npm ci
npm run release:package
npm run release:verify
```

源码包只使用版本记录中的文件，排除 `.git/`、本地私有目录、`node_modules/`、`dist/`、`test-results/`、缓存和已有压缩包。构建包只包含 `dist/` 的静态网页。

验证会：

- 拒绝任何私有目录条目和路径穿越；
- 对解包后的每个文件计算 SHA-256，拒绝私有参考的内容副本；
- 检查运行时代码与构建产物没有私有读取路径；
- 确认 Git LFS 文件不是指针占位；
- 在全新解包目录执行 `npm ci` 与正式构建；
- 用静态服务器打开构建包，等待进入按钮并确认画布可见。

## 发布 v1.0.0

在最终回归通过、Pages 可访问后创建 `v1.0.0` 标签和 GitHub Release，并附加：

- `release/mimimia-source-v1.0.0.zip`
- `release/mimimia-dist-v1.0.0.zip`

公开网址还需执行空缓存下载量和一轮失败、成功、重置验收，结果写回 `docs/reports/` 与 `docs/reports/release-checklist.md`。
