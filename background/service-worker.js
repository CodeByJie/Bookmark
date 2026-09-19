// ============================================================
// background/service-worker.js (module SW — manifest 声明 type:module)
//
// 职责边界：消息路由，仅此。不碰任何 DOM。
//   ⌘E / 工具栏按钮 → MSG.TOGGLE → 当前 tab 的 injector
//   MSG.GET_TREE        → 代理 chrome.bookmarks.getTree（解包根节点）
//   MSG.OPEN_BOOKMARK   → tabs.create / tabs.update
//   书签变更            → MSG.BOOKMARKS_CHANGED 广播（仅失效缓存）
//
// 协议常量统一来自 shared/protocol.js，禁止在此硬编码 action 字符串。
// ============================================================

import { MSG } from "../shared/protocol.js";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  // `tab.url` 只在申请了 tabs/activeTab 权限时才有值——我们都没申请，
  // 所以这里只是 best-effort 过滤；浏览器页没有 content script，
  // sendMessage 会 reject 并被下方 catch 吞掉，天然兜底。
  if (tab.url && !tab.url.startsWith("http")) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: MSG.TOGGLE });
  } catch {
    // 该 tab 无 content script——没有可切换的东西。
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.action === MSG.GET_TREE) {
    // content script 没有 chrome.bookmarks——由 SW 代理。
    // getTree()  resolve 的是数组 [rootNode]，消费方走 tree.children，
    // 必须在这里解包，否则 overlay 渲染为空。
    chrome.bookmarks
      .getTree()
      .then((tree) => {
        const root = Array.isArray(tree) ? tree[0] : tree;
        sendResponse({ ok: true, tree: root });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // 异步回包，保持通道
  }

  if (msg.action !== MSG.OPEN_BOOKMARK) return;
  const tabId = sender.tab?.id;
  if (msg.background) {
    chrome.tabs.create({ url: msg.url, active: false });
  } else if (msg.newTab) {
    chrome.tabs.create({ url: msg.url });
  } else if (tabId != null) {
    chrome.tabs.update(tabId, { url: msg.url });
  } else {
    chrome.tabs.create({ url: msg.url });
  }
});

// 书签在别处被编辑时，刷新所有已打开的 overlay / newtab——
// 页面内的缓存自己监听不到 chrome.bookmarks。
async function broadcastBookmarkChange() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id == null) continue;
    // MV3 的 sendMessage 返回 Promise——try/catch 接不住异步拒绝，
    // 必须用 .catch，否则每个无接收端的 tab 都产生 unhandled rejection。
    chrome.tabs
      .sendMessage(t.id, { action: MSG.BOOKMARKS_CHANGED })
      .catch(() => {
        // 无 content script 的 tab（chrome:// 等）——无需刷新。
      });
  }
}

chrome.bookmarks.onChanged.addListener(broadcastBookmarkChange);
chrome.bookmarks.onRemoved.addListener(broadcastBookmarkChange);
chrome.bookmarks.onCreated.addListener(broadcastBookmarkChange);
chrome.bookmarks.onMoved.addListener(broadcastBookmarkChange);
