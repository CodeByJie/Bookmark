// ============================================================
// surface/surface.js — 共享渲染表层
//
// 同一个"书签网格"内核，挂载进两种外壳：
//   mode:"overlay" → 悬浮面板
//   mode:"inline"  → 新标签页
// 两种模式渲染完全一致：书签文件夹分区，无特殊区
// （v4.9：常用/frecency 区已删除）。
//
// 接口契约（SurfaceHandle）：
//   load()      拉取/刷新数据并重渲染（幂等，可反复调用）
//   destroy()   退订书签变更、解除 watch（生命周期闭环）
//
// 数据流向（单向）：data/bookmarks-cache → sections → BookmarkList
// 打开行为（唯一出口）：handleOpen 计算 newTab 后回调 opts.openBookmark
// ============================================================

import { createBookmarkList } from "./BookmarkList.js";
import { getTree, watch, onChanged } from "../data/bookmarks-cache.js";

/**
 * @typedef {Object} SurfaceOptions
 * @property {"overlay"|"inline"} mode
 * @property {(url: string, newTab: boolean) => void} openBookmark
 * @property {(() => void)|null} [onClose]   overlay 打开书签后收起面板
 *
 * @typedef {Object} SurfaceHandle
 * @property {() => Promise<void>} load
 * @property {() => void} destroy
 */

/**
 * @param {HTMLElement} content
 * @param {SurfaceOptions} opts
 * @returns {SurfaceHandle}
 */
export function mountSurface(content, opts) {
  const defaultNewTab = opts.mode === "overlay";
  let watching = false;
  let destroyed = false;

  function handleOpen(item, event) {
    const newTab =
      event && (event.metaKey || event.ctrlKey) ? !defaultNewTab : defaultNewTab;
    opts.openBookmark(item.url, newTab);
    if (opts.mode === "overlay") opts.onClose?.();
  }

  const listEl = document.createElement("div");
  listEl.className = "dm-list";
  const list = createBookmarkList(listEl, { onOpen: handleOpen });
  content.appendChild(listEl);

  async function load() {
    if (destroyed) return;
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
  const unsubscribe = onChanged(() => {
    if (!destroyed && content.isConnected) load();
  });

  return {
    load,
    destroy() {
      destroyed = true;
      unsubscribe();
    },
  };
}