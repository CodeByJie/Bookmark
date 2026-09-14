# DuckMark 重设计方案（基于 Apple Design 原则）

> 评估与重构框架：Apple *Designing Fluid Interfaces* / *Principles of Great Design*。
> 目标：把一个"能用的书签启动器"改造成"像 macOS 原生般流畅、安静、可控"的启动器。
> 本文档为**动手前**的设计方案，后续实现严格按第 5 节的阶段推进。

---

## 0. 设计目标与原则基线

| Apple 原则 | 在 DuckMark 中的落地含义 |
| --- | --- |
| **Response（即时响应）** | 点击 ⌘E 到面板可交互的延迟必须压到最低；首屏骨架 → 内容无缝切换。 |
| **Direct Manipulation（直接操控）** | 面板可拖拽移动、可拉伸；手指/光标与内容 1:1 跟随。 |
| **Interruptibility（可中断）** | 开合/拖拽随时可被反向操作打断，从当前屏幕值平滑回退，无跳变。 |
| **Spring（弹簧而非脚本动画）** | 一切可触摸的运动用弹簧（damping/response），不用固定时长 CSS 过渡。 |
| **Velocity Handoff（速度接管）** | 拖拽释放时把手指速度交给弹簧，无接缝。 |
| **Momentum Projection（动量投影）** | 拖拽甩动后按速度投影落点，再吸附到最近锚点。 |
| **Materials & Depth（材质与层次）** | 单一毛玻璃材质层；绝不叠两层透光面；滚动边缘渐隐。 |
| **Reduced Motion / Transparency / Contrast** | 三套无障碍信号都要优雅降级，不是"关掉动画"而已。 |
| **Simplicity / Agency** | 搜索是默认路径；键盘优先；偏好持久化、可撤销。 |

---

## 1. 现有插件的问题分析

> 结论先行：**代码组织其实不错**（utils 复用、设计令牌、骨架屏、暗色都到位），真正欠的是"流体感"和"启动器该有的核心能力"。下面按严重程度排序。

### 1.1 双重玻璃叠层 —— 可读性塌方（最该修）
- `overlay.css` 的 `.bookmark-panel`：`background: rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(180%)`。
- `popup.css` 的 `body`：`background: rgba(250,250,252,0.9)` + `blur(20px) saturate(160%)`。
- 面板是一层玻璃，iframe 内的 body 又是一层玻璃 → **两层透光面叠在一起**，正是 Apple 明确反对的"legibility collapses"。文字发灰、边缘发糊、性能也多耗一次 blur。

### 1.2 悬浮面板用 iframe 承载 —— 延迟、脆弱、双重滚动
- `content.js` 把 `<iframe src="popup.html">` 塞进宿主页；面板 DOM 与内容 DOM 分属两个文档。
- 每次唤起都要**重新引导一个完整文档**（加载 CSS/JS → `chrome.bookmarks.getTree()` → 渲染），延迟明显高于直接渲染。
- 跨文档通信靠 `postMessage`（CLOSE_MESSAGE）+ origin 校验，脆弱且易出 race。
- **三重滚动归属混乱**：`overlay.css .bookmark-panel{overflow:auto}` + `popup.css body{overflow:hidden}` + `popup.css #bookmarks{overflow-y:auto;max-height}`。到底谁滚动不直观，长列表易出"卡住"观感。

### 1.3 开合用固定时长 CSS 过渡，而非弹簧（不可中断）
- `overlay.css`：`transform: scale(0.96) translateY(8px)` → `scale(1)`，过渡 `0.4s cubic-bezier(0.175,0.885,0.32,1.275)`。
- 这是**写死的时长 + 模拟弹性**，无法接管速度、无法在半途反向时不跳变；快速连按 ⌘E / 中途点背景，回退可能"跳一下"。

### 1.4 缺少搜索 / 即时过滤 —— 启动器的核心路径缺失
- 作为"launcher"，打开后第一件事应该是**输入即过滤**。当前只能肉眼翻文件夹网格，无搜索框、无高亮、无键盘选择。这是体验上的最大功能缺口。

### 1.5 键盘导航缺失（Agency / 无障碍）
- 书签是 `<a>`，虽有 `:focus-visible`，但无方向键 roving focus、无 Enter 打开、无 ⌘E 唤起后的默认焦点、无 Esc 语义闭环的"可达性"。

### 1.6 收藏树每次重新拉取，无缓存（Response）
- `popup.js` / `newtab.js` 每次打开都 `chrome.bookmarks.getTree()`。对"即时"而言，这是不必要的网络/存储往返。

### 1.7 尺寸记忆用 sessionStorage，刷新即失
- `popup.js` 高度存 `sessionStorage`，iframe 每次重建都归零，用户调好的高度不记住 → 缺少"可控感"。

### 1.8 Favicon 回退色板灰暗、逐张请求无缓存（Delight）
- `constants.js` 的 `FAVICON_COLORS` 全是灰阶，回退图标 dull；`favicon.js` 每次现取 `_favicon` 接口，百条书签即百次请求，无缓存。

### 1.9 未处理 `prefers-reduced-transparency`
- `overlay.css` / `theme.css` 只处理了 reduced-motion / contrast，漏了 reduced-transparency → 这类用户仍被双层毛玻璃糊脸。

### 1.10 切换存在注入 race / 重复根节点风险
- `background.js` 的 `toggleOverlay`：先 `sendMessage`，失败再 `injectOverlay`。内容脚本未就绪时快速二次点击可能重复注入或闪烁。

### 1.11 无"常用/最近"智能排序（Delight）
- `preview.html` 里手写了一个"常用"区，说明产品意图有，但代码里没实现。

### 1.12 无直接操控（拖拽/拉伸/重排）
- 面板位置固定居中、高度自动；用户无法像拖窗口一样摆弄它，也不可拉伸。

---

## 2. 重新设计的整体架构与模块划分

### 2.1 关键架构决策

1. **取消 iframe，改由内容脚本直接渲染面板 DOM。**
   content script 在扩展进程上下文中、且注入的是普通网页时，可正常调用 `chrome.bookmarks`。这一次性解决①双重玻璃 ②双重文档延迟 ③跨文档通信 ④三重滚动归属四个问题。
   （自身扩展页 `chrome-extension://`、浏览器页仍按现有 `SKIP_PROTOCOLS` 跳过。）

2. **单一材质层。** 只保留一层毛玻璃（overlay scrim + panel 玻璃），面板内部 surface 用**近不透明实底**，不再叠第二层 blur。

3. **弹簧替代所有手势相关 CSS 过渡。** 引入极简弹簧求解器，所有开合/拖拽/吸附走 RAF + 速度接管 + 可中断。

4. **共享"表层"模块**同时服务悬浮面板与新标签页，仅外壳不同（居中卡 vs 整页），渲染内核复用。

### 2.2 目标目录结构

```
DuckMark/
├── manifest.json
├── background/
│   └── service-worker.js          # 事件路由：⌘E→切换；书签变更→缓存失效
├── content/
│   └── overlay-injector.js        # 注入 overlay 根，呼起/关闭 surface（不再注入 iframe）
├── surface/                       # ★ 共享渲染表层（悬浮面板 & 新标签页共用）
│   ├── surface.js                 # 入口：按 mode(inline|overlay) 挂载
│   ├── SpringPanel.js             # 悬浮面板外壳：弹簧开合 + 拖拽 + 拉伸 + 边缘吸附
│   ├── BookmarkList.js            # 分组渲染（文件夹 + 常用区）+ 虚拟滚动(>200)
│   ├── SearchBox.js               # 即时过滤 + 键盘导航控制器 + 匹配高亮
│   └── Favicon.js                 # 缓存 + 鲜艳回退色板
├── motion/                        # ★ 流体运动核心
│   ├── spring.js                  # 弹簧求解器（RAF，damping/response，velocity 接管）
│   ├── drag.js                    # Pointer Events + grab offset + 速度历史 + 橡皮筋
│   └── gesture.js                 # 并行手势识别（tap/drag/scroll），阈值 hysteresis
├── data/
│   ├── bookmarks-cache.js         # 树缓存（chrome.storage.session）+ 失效
│   └── frecency.js                # 打开事件统计 → 常用排序
├── state/
│   └── store.js                   # 尺寸/位置/主题偏好（chrome.storage.local）
├── styles/
│   ├── tokens.css                 # 设计令牌（继承现有，扩充 reduced-transparency 等）
│   ├── overlay.css                # 单一玻璃材质 + 滚动边缘渐隐
│   └── surface.css                # 卡片/网格/搜索/列表/常用区
└── newtab.html  ─┐
    popup 入口    ─┘ 均复用 surface/
```

### 2.3 模块职责边界

| 模块 | 职责 | 不负责 |
| --- | --- | --- |
| `service-worker.js` | 快捷键路由、书签变更监听、缓存失效广播 | 任何 DOM |
| `overlay-injector.js` | 在宿主页建 overlay 根、呼起/关闭、Esc/背景点击、焦点归还 | 内部列表渲染（交给 surface） |
| `surface.js` | 选择 inline/overlay 模式并挂载 `BookmarkList`+`SearchBox` | 弹簧细节（交给 motion） |
| `SpringPanel.js` | 面板物理外壳：开合弹簧、拖拽、拉伸、吸附、可中断 | 列表内容 |
| `BookmarkList.js` | 纯渲染：分组 + 常用区 + 虚拟滚动 | 搜索逻辑（交给 SearchBox 控制） |
| `SearchBox.js` | 输入即过滤、roving focus、Enter/⌘Enter、高亮 | 数据来源（读缓存） |
| `motion/*` | 与业务无关的运动原语，可被任意模块复用 | UI 语义 |
| `data/*` | 书签树与频度数据，带缓存与失效 | 渲染 |
| `state/store.js` | 偏好持久化 | 业务逻辑 |

---

## 3. 核心功能改动点

| # | 改动 | 类型 | 对应原则 |
| --- | --- | --- | --- |
| C1 | **即时搜索**：默认焦点在搜索框，输入即过滤（子串/模糊），命中高亮，空结果有态 | 新增核心 | Simplicity / Agency |
| C2 | **键盘优先**：↑↓ 移动、Enter 打开、⌘Enter 新标签、Esc 关闭、⌘E 唤起即聚焦 | 新增核心 | Agency / 无障碍 |
| C3 | **常用/最近智能区**：基于 `frecency` 统计，置顶高频/近期 | 新增 | Delight |
| C4 | **面板可拖拽移动 + 边缘吸附 + 可拉伸高度**（直接操控） | 新增交互 | Direct Manipulation |
| C5 | **弹簧开合 + 可中断**：从当前值反向，无跳变 | 重构 | Interruptibility / Spring |
| C6 | **收藏树缓存 + 实时失效**：`chrome.storage.session` + `onChanged/onRemoved/onCreated` | 重构性能 | Response |
| C7 | **偏好持久化**：`chrome.storage.local` 记住尺寸/位置/主题 | 重构 | Agency |
| C8 | **Favicon 缓存 + 鲜艳回退色板** | 打磨 | Delight |
| C9 | **严谨无障碍**：reduced-motion / reduced-transparency / contrast 三套降级 | 补齐 | 无障碍 |
| C10 | **去 iframe + 单一玻璃材质**，消除双重叠层与三重滚动 | 架构重构 | Materials / Response |
| C11（v2） | 右键删除 / "添加当前页" / 拖拽重排书签 | 可选增强 | Agency / Craft |

---

## 4. 技术实现思路

### 4.1 弹簧求解器（`motion/spring.js`）
- 参数化 Apple 的 **damping(1.0 临界 / 0.8 带弹) + response(0.3–0.4s)**，而非固定 duration。
- RAF 驱动，每帧只动 `transform`/`opacity`（合成器友好）。
- 支持 `velocity` 接管：拖拽释放时把手指速度（px/s）直接喂给弹簧 → 无接缝（§5 速度接管）。
- **从当前 presentation 值起步**：动画启动前 `getComputedStyle`/读 live transform，避免从目标值起步导致的跳变（§3 中断）。
- X/Y 拆成独立弹簧（2D 运动 desync 时更稳）。

### 4.2 拖拽与动量投影（`motion/drag.js`）
- `pointerdown` 即 `setPointerCapture`；记录 `grabOffset = clientY - rect.top`（尊重抓取点，不吸中心）。
- 维护最近几次 `pointermove` 的**位置+时间戳**历史，供释放时算速度。
- 释放用 Apple 投影公式落到锚点：
  `project(v) = (v/1000)·d/(1−d)`，`d≈0.998`；取 `current + project(v)` 的最近吸附点。
- 越界用橡皮筋 `rubberband()` 渐进阻力，不硬停。

### 4.3 可中断开合（`SpringPanel.js`）
- 开/关都是对同一个弹簧改 target；中途再触发反向，从 live 值平滑回退，绝不锁输入。
- 入场：scale 0.98→1 + translateY 轻微，临界阻尼无过冲（菜单淡入不应 bounce）；拖拽甩动后的吸附才用 0.8 微弹。

### 4.4 渲染去 iframe（`surface/` + `overlay-injector.js`）
- `overlay-injector.js` 直接 `document.documentElement.appendChild(root)`，root 内含 backdrop + panel，panel 内**直接挂载 surface 的真实 DOM**。
- `BookmarkList` 用 `DocumentFragment` 一次性构建；书签 >200 时启用窗口化虚拟滚动（仅渲染可视区）。
- 首屏保留骨架屏，内容就绪后淡出（沿用现有 `clearSkeleton` 思路，但用 opacity 交叉淡入）。

### 4.5 数据与频度（`data/`）
- `bookmarks-cache.js`：`chrome.storage.session` 存树；`chrome.bookmarks.onChanged/onCreated/onRemoved/onMoved` 触发失效并重算。
- `frecency.js`：`chrome.storage.local` 计数（打开次数 + 时间衰减），`BookmarkList` 顶部渲染"常用"区；纯展示，不改写用户书签数据。

### 4.6 搜索与键盘（`SearchBox.js`）
- 对内存中的缓存树做 O(n) 过滤（无需网络）；匹配片段 `<mark>` 高亮。
- roving focus：维护"结果游标"，↑↓ 移动、`Enter` 打开当前、`⌘Enter` 新标签、`Esc` 清空/关闭。
- 与 `SpringPanel` 的焦点管理协同：唤起即聚焦搜索框，关闭归还焦点到原 `activeElement`。

### 4.7 材质与主题（`styles/`）
- `overlay.css`：只一层面板玻璃（`blur(20px) saturate(180%)` + 0.9 实底保可读）；scrim `rgba(0,0,0,0.28)`；**滚动边缘用渐隐 mask 而非硬分隔线**。
- `tokens.css`：继承现有令牌体系，**新增** `--dm-glass-solid`（reduced-transparency 时的实底）与 reduced-transparency 媒体查询。
- 字体沿用 system font；标题负字距、正文近 0 字距（沿用现有，保持不变）。

### 4.8 性能细节
- Favicon：内存 `Map` + `CacheStorage` 双缓存；回退色板改为**按域名哈希的鲜艳色相**（HSL 旋转），告别灰阶。
- 弹簧/拖拽全程 RAF，避免主线程长任务；`will-change` 仅在运动 imminent 时提示。

---

## 5. 后续落地步骤（分阶段，便于逐项开发）

> 每阶段给出**新增/修改文件**与**验收标准**。建议逐阶段提交，每阶段自测通过再进下一阶段（契合"一件件完成"的节奏）。

### Phase 0 — 运动基础设施
- 新增：`motion/spring.js`、`motion/drag.js`、`motion/gesture.js`；`styles/tokens.css` 扩充 reduced-transparency 令牌。
- 验收：单测弹簧（给定 velocity 能平滑收敛、无跳变）；drag 在 demo 页可被抓取并反向中断。

### Phase 1 — 结构重构（去 iframe + 单一玻璃）
- 修改：`content/overlay-injector.js`（不再注入 iframe，直接挂 surface DOM）；`overlay.css`（单层玻璃、滚动边缘渐隐）；删除 `popup.html/js/css` 的 iframe 承载方式，改由 surface 渲染。
- 验收：唤起后 DOM 中**不再有 iframe**；面板文字清晰无发糊；长列表滚动归属唯一（面板或内部列表，不双滚）。

### Phase 2 — 弹簧化开合
- 新增：`surface/SpringPanel.js`（封装开合弹簧 + Esc/背景关闭 + 焦点归还）。
- 验收：连按 ⌘E 中途反向无跳变；reduced-motion 下退化为 opacity 交叉淡入。

### Phase 3 — 搜索与键盘
- 新增：`surface/SearchBox.js`（过滤、roving focus、高亮、Enter/⌘Enter）。
- 验收：输入即过滤；↑↓ 可达所有结果；键盘全流程可不开鼠标完成打开/关闭。

### Phase 4 — 智能与持久化
- 新增：`data/bookmarks-cache.js`、`data/frecency.js`、`state/store.js`；`BookmarkList` 接入常用区。
- 验收：二次唤起不重新 `getTree`（命中缓存）；关闭重开记住上次尺寸；常用区随使用更新。

### Phase 5 — 直接操控
- 在 `SpringPanel.js` 接入 `motion/drag.js`：拖拽移动 + 边缘吸附 + 拉伸高度；落点用动量投影。
- 验收：甩动后面板按速度滑行后吸附；越界橡皮筋手感自然；不破坏开合弹簧。

### Phase 6 — 无障碍与打磨
- 修改：`styles/` 全套三套媒体查询；`Favicon.js` 鲜艳回退 + 缓存；微交互（按下即时反馈、打开成功轻提示）。
- 验收：reduced-transparency 下为实底；对比度模式边框清晰；百条书签 favicon 加载无明显卡顿。

### Phase 7 — 新标签页复用 & 收尾
- 修改：`newtab.html/js` 复用 `surface/`（inline 模式）；更新 `preview/preview.html` 反映新结构。
- 验收：悬浮面板与新标签页视觉/交互一致；真机（Chrome/Edge）体验游走测试；慢动作逐帧检查开合/拖拽顺滑。

---

## 附：保留并继续发扬的现有优点
- 设计令牌体系（`utils/theme.css`）与文件夹/卡片视觉语言 → 直接演进为 `styles/tokens.css` + `surface.css`。
- 骨架屏与"安静"的产品定位（"一个安静的书签启动器"）→ 保留，作为 Delight 的基调。
- 暗色（prefers-color-scheme）与 i18n（zh/en）机制 → 原样继承。
- `collectFolders` / `getTitleFromUrl` / favicon 回退机制 → 逻辑复用，仅改视觉与缓存。
