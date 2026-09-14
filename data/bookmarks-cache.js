// ============================================================
// data/bookmarks-cache.js
// In-memory cache of the bookmark tree so re-opening the panel
// doesn't re-fetch (Apple §1 — kill latency). Bookmarks API
// change events invalidate it, and subscribers are notified.
//
// chrome.bookmarks is NOT exposed to content scripts — only to
// the service worker and extension pages. When this module runs
// in a content script (the overlay), reads are proxied to the SW
// via a message, and change notifications arrive as broadcasts
// (see service-worker.js / overlay-injector.js).
// ============================================================

let cache = null;
let inflight = null;
const listeners = new Set();

async function fetchTree() {
  if (chrome.bookmarks) {
    // getTree() resolves to an ARRAY whose single element is the root
    // node; consumers walk root.children, so unwrap it here.
    return (await chrome.bookmarks.getTree())[0];
  }
  const res = await chrome.runtime.sendMessage({ action: "dm-get-tree" });
  if (!res || !res.ok) throw new Error("bookmarks unavailable");
  return res.tree;
}

/**
 * 缓存 + 并发去重：invalidate 后的并发调用共享同一次 fetch
 * （例如广播刷新与用户开面板同时到达），完成后缓存结果。
 * fetch 失败时清掉 inflight，下一次调用自动重试。
 */
export async function getTree() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetchTree()
      .then((tree) => {
        cache = tree;
        return tree;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function invalidate() {
  cache = null;
}

function changed() {
  invalidate();
  listeners.forEach((cb) => cb());
}

export function watch() {
  // No chrome.bookmarks in content scripts — the SW pushes
  // dm-bookmarks-changed broadcasts instead.
  if (!chrome.bookmarks) return;
  chrome.bookmarks.onChanged.addListener(changed);
  chrome.bookmarks.onRemoved.addListener(changed);
  chrome.bookmarks.onCreated.addListener(changed);
  chrome.bookmarks.onMoved.addListener(changed);
}

export function onChanged(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
