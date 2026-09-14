// ============================================================
// shared/protocol.js — 消息协议契约（single source of truth）
//
// DuckMark 的运行时由三个上下文构成，彼此只能通过消息通信：
//
//   ┌────────────────────┐  MSG.TOGGLE   ┌──────────────────────┐
//   │ service-worker.js  │ ────────────► │ overlay-injector.js  │
//   │ (module SW, 全能)  │               │ (classic content JS) │
//   └────────────────────┘               └─────────┬────────────┘
//          ▲  MSG.GET_TREE / MSG.OPEN_BOOKMARK     │ dynamic import()
//          │                                       ▼
//          └─────────────────────────── content/overlay-main.js (ESM)
//          │  MSG.BOOKMARKS_CHANGED (广播, 全部 tab)
//          └───────────────────────────► injector → overlay-main
//
// 契约规则：
//  1. 所有 action 字符串只允许从这里 export（content/overlay-injector.js
//     是 classic script 无法 import，它内联同名字符串并注明同步来源）。
//  2. 新增 action 时同步修改三处：本文件、injector 的常量集、接收方
//     的 handleMessage 分支。
//  3. 消息负载保持可结构化克隆（structured-cloneable）。
// ============================================================

/**
 * @typedef {Object} ToggleMessage      ⌘E / 工具栏按钮 → 切换面板
 * @property {"dm-toggle"} action
 *
 * @typedef {Object} OpenPanelMessage   显式打开
 * @property {"dm-open-panel"} action
 *
 * @typedef {Object} ClosePanelMessage  显式关闭
 * @property {"dm-close-panel"} action
 *
 * @typedef {Object} GetTreeMessage     content script 无 chrome.bookmarks，
 *                                      向 SW 代理请求书签树
 * @property {"dm-get-tree"} action
 *
 * @typedef {Object} GetTreeResponse    SW 回包：tree 已解包为根节点
 * @property {boolean} ok               （getTree 返回数组，取 [0]）
 * @property {object} [tree]
 * @property {string} [error]
 *
 * @typedef {Object} OpenBookmarkMessage  请求 SW 打开书签
 * @property {"dm-open"} action
 * @property {string} url
 * @property {boolean} newTab           true=新标签 / false=当前标签
 *
 * @typedef {Object} BookmarksChangedMessage  书签变更广播（仅失效，
 * @property {"dm-bookmarks-changed"} action  不触发模块加载）
 */

export const MSG = Object.freeze({
  TOGGLE: "dm-toggle",
  OPEN_PANEL: "dm-open-panel",
  CLOSE_PANEL: "dm-close-panel",
  GET_TREE: "dm-get-tree",
  OPEN_BOOKMARK: "dm-open",
  BOOKMARKS_CHANGED: "dm-bookmarks-changed",
});

/** 会触发 overlay 模块懒加载的动作（injector 侧镜像此集合）。 */
export const TOGGLE_ACTIONS = Object.freeze([
  MSG.TOGGLE,
  MSG.OPEN_PANEL,
  MSG.CLOSE_PANEL,
]);

/** 仅失效缓存的动作——绝不触发模块加载（injector 侧镜像此集合）。 */
export const INVALIDATE_ACTIONS = Object.freeze([MSG.BOOKMARKS_CHANGED]);
