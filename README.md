# DuckMark

一个安静的书签启动器 Chrome 扩展：悬浮面板即时取用书签，并以书签页替代默认新标签页。

零构建、零依赖的 Manifest V3 原生 ES Module 项目。

## 功能

- **悬浮面板** — `⌘E`（Windows/Linux 为 `Ctrl+E`）或工具栏按钮唤出，点击面板外遮罩即关；面板固定 900×700，视口不足时自适应收缩
- **新标签页** — 与悬浮面板共用同一渲染内核（inline 模式），普通点击当页打开，`⌘/Ctrl` + 点击新标签打开
- **书签整理** — 新标签页右上角「整理」按钮开启删除模式，tile 出现 × 删除钮，删除后 6 秒内可撤销（撤销快照仅存内存，页面关闭即永久生效）；悬浮面板保持只读；v1 仅支持删除单条书签，不含文件夹 / 重命名 / 移动
- **文件夹分区** — 书签按文件夹分组展示，含子文件夹递归（DFS 前序）
- **深色 / 浅色主题** — 偏好持久化于 `chrome.storage.local`，新标签页与各标签页的悬浮面板实时同步
- **书签实时刷新** — 任何位置的书签增删改，所有已打开页面自动失效缓存并重载

## 安装（开发者模式）

```bash
git clone https://github.com/CodeByJie/Bookmark.git
```

1. 打开 `chrome://extensions`，右上角开启「开发者模式」
2. 点击「加载已解压的扩展程序」，选择仓库根目录
3. 新开标签页，或任意页面按 `⌘E` 唤出面板

## 架构

三个运行上下文，彼此只通过消息通信（契约统一在 `shared/protocol.js`）：

```
┌────────────────────┐  MSG.TOGGLE   ┌──────────────────────┐
│ service-worker.js  │ ────────────► │ overlay-injector.js  │
│ (module SW, 全能)  │               │ (classic content JS) │
└────────────────────┘               └─────────┬────────────┘
        ▲  GET_TREE / OPEN_BOOKMARK            │ 动态 import()（懒加载）
        │                                      ▼
        └────────────────────────── content/overlay-main.js (ESM)
```

**按需加载**：注入每个页面的 injector 是一个极小的 classic script，仅当用户首次打开面板时才动态 `import()` 整个模块图——平时打开的每个标签页零开销。

**目录结构**：

```
├── manifest.json            # MV3 清单
├── background/              # 消息路由（不碰 DOM）
├── content/
│   ├── overlay-injector.js  # 懒加载引导（classic script）
│   └── overlay-main.js      # 面板生命周期状态机（ESM）
├── surface/                 # 共享渲染内核（overlay / inline 两用）
├── data/                    # 书签缓存 + 主题 + 删除/恢复操作
├── shared/                  # 消息协议契约
├── styles/                  # tokens / overlay / surface
├── newtab.html              # 新标签页
├── docs/                    # 架构设计文档
└── tests/                   # 零依赖单元测试
```

## 性能设计

- 悬浮面板懒加载，未打开前不注入任何模块
- 书签树内存缓存 + in-flight 去重：失效后的并发请求只发一次
- `DocumentFragment` 批量挂载，渲染单次重排
- 分区 `content-visibility: auto`，长列表跳过屏外渲染
- 面板无动画、无 `backdrop-filter`、滚动容器无 `mask-image`——规避已知的合成层性能坑

## 开发与测试

```bash
node tests/unit.test.mjs    # 单元测试（零依赖）
```

测试覆盖：标题回退规则、文件夹分组语义、缓存命中/并发去重/失败重试，以及 injector 与 protocol.js 的 action 镜像契约（漂移即失败）。

## 许可

MIT
