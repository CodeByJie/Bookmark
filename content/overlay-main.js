// ============================================================
// content/overlay-main.js (ES module — 懒加载，仅打开面板时拉取)
//
// Overlay 控制器：显式生命周期状态机，持有本 tab 内全部单例。
//
//   idle ──open()──► building ──build 完成──► ready
//                      │                        │
//                      └──失败──► idle          ├──open/close/toggle
//                                                └──destroy──► idle
//
// 对外接口（injector 唯一触点）：
//   handleMessage(msg) — 按 shared/protocol.js 的契约分发
//
// 本模块只做编排：渲染交给 surface/，物理交给 SpringPanel，
// 数据交给 data/，协议常量来自 shared/protocol.js。
// ============================================================

import { MSG } from "../shared/protocol.js";
import { mountSurface } from "../surface/surface.js";
import { createPanel } from "../surface/SpringPanel.js";
// 只失效缓存，不通知订阅：refresh() 下方已显式 surface.load()，
// 若再触发 bookmarks-cache 的 onChanged 订阅会叠加成双重加载。
import { invalidate } from "../data/bookmarks-cache.js";
import { getTheme, applyThemeClass, onThemeChange } from "../data/theme.js";

const ROOT_ID = "bookmark-overlay-root";
const CSS_FILES = ["styles/tokens.css", "styles/overlay.css", "styles/surface.css"];
const CSS_ID_PREFIX = "dm-style-";

/** @type {"idle"|"building"|"ready"} */
let phase = "idle";
let buildPromise = null;

// ready 阶段的运行时引用（phase !== "ready" 时全部为 null）
let root = null;
let surface = null;
let panel = null;
let unwatchTheme = null;

function cssId(file) {
  return CSS_ID_PREFIX + file.replace(/[^a-z0-9]/gi, "");
}

function injectCSS() {
  for (const file of CSS_FILES) {
    if (document.getElementById(cssId(file))) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL(file);
    link.id = cssId(file);
    document.head.appendChild(link);
  }
}

async function build() {
  if (buildPromise) return buildPromise;
  phase = "building";
  buildPromise = (async () => {
    injectCSS();

    root = document.createElement("div");
    root.id = ROOT_ID;

    const backdrop = document.createElement("div");
    backdrop.className = "bookmark-backdrop";

    const panelEl = document.createElement("div");
    panelEl.className = "bookmark-panel";

    const content = document.createElement("div");
    content.className = "dm-surface";
    panelEl.appendChild(content);
    root.appendChild(backdrop);
    root.appendChild(panelEl);
    document.documentElement.appendChild(root);

    surface = mountSurface(content, {
      mode: "overlay",
      openBookmark,
      onClose: close,
    });

    panel = createPanel({
      root,
      panel: panelEl,
    });

    // backdrop inset:0 铺满 root，面板外的任何点击必然落在
    // backdrop 上——一个关闭路径即可，不需要再监听 root。
    backdrop.addEventListener("click", close);

    // 主题：构建时应用当前偏好，之后 storage 事件实时同步
    // （newtab 页签里切的浅色，这里跟着变）。
    applyThemeClass(root, await getTheme());
    unwatchTheme = onThemeChange((theme) => applyThemeClass(root, theme));

    phase = "ready";
  })();
  try {
    await buildPromise;
  } catch (err) {
    // 构建失败：允许下次重试
    phase = "idle";
    buildPromise = null;
    root?.remove();
    root = surface = panel = null;
    throw err;
  }
  return buildPromise;
}

function open() {
  build()
    .then(() => {
      surface.load();
      panel.open();
    })
    .catch((err) => {
      // build() 内部已重置状态允许重试；这里只负责接住 rejection，
      // 否则构建失败会成为 unhandled rejection。
      console.warn("[DuckMark] overlay build failed", err);
    });
}

function close() {
  if (panel && panel.isOpen()) panel.close();
}

function toggle() {
  if (panel && panel.isOpen()) close();
  else open();
}

function openBookmark(url, newTab, background = false) {
  chrome.runtime.sendMessage({ action: MSG.OPEN_BOOKMARK, url, newTab, background });
}

function refresh() {
  if (phase === "idle") return; // 面板从未构建——本 tab 无缓存可失效
  invalidate();
  if (root?.isConnected) surface.load();
}

/**
 * injector 唯一入口。按 shared/protocol.js 的契约分发；
 * 未知 action 静默忽略（向前兼容）。
 */
export function handleMessage(msg) {
  switch (msg.action) {
    case MSG.TOGGLE:
      toggle();
      break;
    case MSG.OPEN_PANEL:
      open();
      break;
    case MSG.CLOSE_PANEL:
      close();
      break;
    case MSG.BOOKMARKS_CHANGED:
      refresh();
      break;
  }
}
