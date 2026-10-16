# Tracearr 打包说明与许可

本包由社区移植，应用本体为上游官方发行版，未修改上游源码。

| 项 | 值 |
| --- | --- |
| 上游项目 | https://github.com/connorgallopo/Tracearr |
| 上游版本 | v2.8.0（tag `v2.8.0`，发布于 2026-10-12） |
| 许可证 | AGPL-3.0（全文见同目录 `LICENSE`） |
| 应用镜像 | `ghcr.io/connorgallopo/tracearr:2.8.0` 的中转副本 |
| 数据库镜像 | `timescale/timescaledb-ha:pg18.4-ts2.29.1` 的中转副本 |
| 缓存镜像 | `redis:8-alpine` 的中转副本 |
| 图标来源 | 上游仓库 `apps/web/public/logo-transparent.png`（1024×1024），等比降采样为 512×512 |

对应源码：按 AGPL-3.0 第 6 条，源码可从上面的上游项目地址获取，tag `v2.8.0` 即本包所用版本。

本包新增的内容仅为平台适配脚本：`bootstrap-admin.mjs`（首次安装建立管理员账号）、`lazycat-injects/tracearr-autologin.js`（免密登录与切换账号）、`lazycat-injects/lzc-file-chooser-inject.js`（平台官方的网盘文件选择器注入）。
