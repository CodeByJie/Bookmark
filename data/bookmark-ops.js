// ============================================================
// data/bookmark-ops.js — 书签写操作（仅扩展页面上下文使用）
//
// 删除前先 get 取节点：顺带发现"已在他处删除"（get 失败则不
// 执行删除，避免盲删后无任何效果却像成功）。删除即永久生效——
// Chrome 书签没有回收站，本模块不提供撤销/恢复。
// 所有函数只在 chrome.bookmarks 可用的上下文（newtab / SW）调用。
// ============================================================

/** get() 兼容数组返回；字段不完整的节点视为不可删。 */
function toSnapshot(node) {
  const n = Array.isArray(node) ? node[0] : node;
  if (!n || !n.url || !n.parentId) return null;
  return { id: n.id, title: n.title || "", url: n.url };
}

export async function fetchSnapshot(id) {
  try {
    return toSnapshot(await chrome.bookmarks.get(id));
  } catch {
    return null;
  }
}

/** @returns {Promise<boolean>} true = 确实删除了。 */
export async function removeBookmark(id) {
  const snap = await fetchSnapshot(id);
  if (!snap) return false;
  await chrome.bookmarks.remove(id);
  return true;
}
