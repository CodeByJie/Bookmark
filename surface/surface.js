// ============================================================
// surface/surface.js — 共享渲染表层
//
// 同一个"书签网格"内核，挂载进两种外壳：
//   mode:"overlay" → 悬浮面板
//   mode:"inline"  → 新标签页
// 两种模式渲染完全一致：书签文件夹分区，无特殊区。
//
// 接口契约（SurfaceHandle）：
//   load()        拉取/刷新数据并重渲染（幂等，可反复调用）
//   setEditing()  开/关删除模式（仅当构造时传了 onRemove 才生效）
//
// 数据流向（单向）：data/bookmarks-cache → sections → BookmarkList
// 打开行为（唯一出口）：handleOpen 计算 newTab 后回调 opts.openBookmark
// ============================================================

import { createBookmarkList } from "./BookmarkList.js";
import { getTree, watch, onChanged } from "../data/bookmarks-cache.js";

/**
 * @typedef {Object} SurfaceOptions
 * @property {"overlay"|"inline"} mode
 * @property {(url: string, newTab: boolean, background: boolean) => void} openBookmark
 * @property {(() => void)|null} [onClose]   overlay 打开书签后收起面板
 * @property {(id: string) => void} [onRemove]  传入即允许编辑（仅 newtab）
 *
 * @typedef {Object} SurfaceHandle
 * @property {() => Promise<void>} load
 * @property {(on: boolean) => void} setEditing
 */

/**
 * @param {HTMLElement} content
 * @param {SurfaceOptions} opts
 * @returns {SurfaceHandle}
 */
export function mountSurface(content, opts) {
  const defaultNewTab = opts.mode === "overlay";
  let watching = false;
  let editing = false;

  function handleOpen(item, event) {
    if (editing) return; // 删除模式下左/⌘/中键一律不打开
    // 中键：一律后台新页签（两种模式一致）
    const background = Boolean(event && event.button === 1);
    const newTab = background
      ? true
      : event && (event.metaKey || event.ctrlKey)
        ? !defaultNewTab
        : defaultNewTab;
    opts.openBookmark(item.url, newTab, background);
    // 后台打开不收起面板，便于连续中键开多个书签
    if (opts.mode === "overlay" && !background) opts.onClose?.();
  }

  const listEl = document.createElement("div");
  listEl.className = "dm-list";
  const list = createBookmarkList(listEl, {
    onOpen: handleOpen,
    onRemove: opts.onRemove,
  });
  content.appendChild(listEl);

  async function load() {
    if (!watching) {
      watch();
      watching = true;
    }
    try {
      const tree = await getTree();
      list.setData(tree);
      list.render();
    } catch (err) {
      console.warn("[DuckMark] surface load failed", err);
      listEl.innerHTML =
        '<p class="dm-error">无法读取书签，请检查扩展权限。</p>';
    }
  }

  // 订阅一次（在 load 之外），重复打开不会叠加监听。
  onChanged(() => {
    if (content.isConnected) load();
  });

  function setEditing(on) {
    if (!opts.onRemove) return; // 面板（overlay）结构上不可编辑
    editing = Boolean(on);
    content.classList.toggle("dm-editing", editing);
  }

  return { load, setEditing };
}