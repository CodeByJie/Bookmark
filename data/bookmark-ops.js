// ============================================================
// data/bookmark-ops.js — 书签写操作（仅扩展页面上下文使用）
//
// 删除前先取快照（get 顺带发现"已在他处删除"），快照失败则
// 不执行删除；恢复按兜底序列尝试：精确实参 → 书签栏首位
// （parentId "1" 常驻不可删）。所有函数只在 chrome.bookmarks
// 可用的上下文（newtab / SW）调用。
// ============================================================

/**
 * @typedef {Object} BookmarkSnapshot
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string} parentId
 * @property {number} index
 */

/** get() 兼容数组返回；缺字段的节点视为不可恢复。 */
export function toSnapshot(node) {
  const n = Array.isArray(node) ? node[0] : node;
  if (!n || !n.url || !n.parentId) return null;
  return {
    id: n.id,
    title: n.title || "",
    url: n.url,
    parentId: n.parentId,
    index: Number.isInteger(n.index) ? n.index : 0,
  };
}

/** 恢复尝试序列：原位 → 书签栏首位。 */
export function createArgsSequence(snap) {
  return [
    { parentId: snap.parentId, index: snap.index, title: snap.title, url: snap.url },
    { parentId: "1", index: 0, title: snap.title, url: snap.url },
  ];
}

export async function fetchSnapshot(id) {
  try {
    return toSnapshot(await chrome.bookmarks.get(id));
  } catch {
    return null;
  }
}

/** @returns {Promise<BookmarkSnapshot|null>} 快照（供撤销）；null = 未删除。 */
export async function removeBookmark(id) {
  const snap = await fetchSnapshot(id);
  if (!snap) return null;
  await chrome.bookmarks.remove(id);
  return snap;
}

/** @returns {Promise<{ok: boolean}>} */
export async function restoreBookmark(snap) {
  for (const args of createArgsSequence(snap)) {
    try {
      await chrome.bookmarks.create(args);
      return { ok: true };
    } catch {
      // 试下一个兜底位置
    }
  }
  return { ok: false };
}
