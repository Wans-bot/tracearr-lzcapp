# tracearr-lzcapp

Tracearr 的懒猫微服（LazyCat）LPK 打包工程，用 [ca-x/lazycat-github-action](https://github.com/ca-x/lazycat-github-action) 自动跟随上游版本。

- 上游：`connorgallopo/Tracearr`，AGPL-3.0，应用镜像 `ghcr.io/connorgallopo/tracearr`
- 本仓库内容：`package.yml`、`lzc-manifest.yml`、`lzc-build.yml`、`content/`、`icon.png`，以及 `.github/` 下的 Action 配置与工作流
- 自动更新范围：镜像复制到 `registry.lazycat.cloud`、`package.yml` 版本号、两个 service 的 `image` 字段、LPK 构建、GitHub Release
- 不自动做的事：真机验收与商店截图仍在本机与盒子上完成，验收通过后才打开官方商店发布开关

## 运行方式

工作流 `.github/workflows/lazycat.yml` 每天 03:17 UTC 定时跑一次，也可以手动触发：

- `auto`：有新版本就更新，没有就只检查
- `check`：只检查上游标签，不改文件
- `build`：按当前配置构建一次
- `publish-official`：只走官方商店发布

需要仓库 Secret `LZC_API_TOKEN`（开发者中心的 PAT）。`LZC_API_HOST` 可选，默认 `appstore.api.lazycat.cloud`。

## 版本发现

`.github/lazycat-action.yml` 用 `tag_regex: '^v?2\.\d+\.\d+$'` 跟随整支 v2.x.y 版本族，`sort: semver` 取最高正式版本；写成当前版本号会让自动发现永久停住。
