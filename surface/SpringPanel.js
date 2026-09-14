// ============================================================
// surface/SpringPanel.js — 悬浮面板外壳
//
// v4.5：开合动画移除，面板即时显隐（无弹簧、无缩放、无位移动画）。
// 保留的契约：
//   Wayfinding — 打开时记住宿主页焦点，关闭时归还。
//   显隐管理   — root.bookmark-open 类驱动的 opacity 切换
//                （CSS 已无 transition，即开即关）。
//
// 生命周期：createPanel(deps) → open()/close() → destroy()。
// 本模块对书签一无所知，只会搬动盒子。
// ============================================================

/**
 * @typedef {Object} PanelDeps
 * @property {HTMLElement} root          遮罩根（控制 .bookmark-open）
 * @property {HTMLElement} panel         被显隐的面板
 *
 * @typedef {Object} PanelController
 * @property {() => void} open                    立即显示
 * @property {() => void} close                   立即隐藏 + 焦点归还
 * @property {() => boolean} isOpen
 * @property {() => void} destroy                 预留清理位（当前无监听）
 */

/**
 * @param {PanelDeps} deps
 * @returns {PanelController}
 */
export function createPanel({ root, panel }) {
  let isOpen = false;
  let restoreFocusTo = null;

  function applyOpen(v) {
    panel.style.opacity = String(v);
    panel.style.transform = "";
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.classList.add("bookmark-open");
    applyOpen(1);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("bookmark-open");
    applyOpen(0);
    if (restoreFocusTo && document.contains(restoreFocusTo)) {
      try {
        restoreFocusTo.focus({ preventScroll: true });
      } catch {
        /* 元素已不可聚焦 */
      }
    }
    restoreFocusTo = null;
  }

  return {
    open,
    close,
    isOpen: () => isOpen,
    destroy() {
      /* 无监听无弹簧——占位保持接口稳定 */
    },
  };
}