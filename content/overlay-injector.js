// ============================================================
// content/overlay-injector.js  (classic content script — NO imports)
//
// Content scripts are CLASSIC scripts: a top-level `import` would
// throw "Cannot use import statement outside a module". So this
// file stays import-free and lazily pulls in the real module via
// dynamic import() the first time the user actually opens the
// panel — which still runs in the isolated world (so chrome.*
// APIs work) and keeps every page light until then.
// ============================================================

(function bootstrap() {
  if (window.__duckmarkInstalled) return;
  window.__duckmarkInstalled = true;

  // ⚠ 协议常量的镜像——本文件是 classic script，无法 import
  // shared/protocol.js（ESM）。改动 protocol.js 时必须同步这里。
  const TOGGLE_ACTIONS = new Set(["dm-toggle"]);
  // Invalidation-only actions: they must NOT trigger a module load.
  // The SW broadcasts these to *every* tab on any bookmark edit, so
  // treating them like a toggle would pull the whole module graph
  // (surface/motion/data/state) into all open tabs at once — exactly
  // the cost this lazy loader exists to avoid.
  const INVALIDATE_ACTIONS = new Set(["dm-bookmarks-changed"]);

  let modulePromise = null;

  function loadModule() {
    if (!modulePromise) {
      modulePromise = import(chrome.runtime.getURL("content/overlay-main.js"))
        .catch((err) => {
          console.error("[DuckMark] Failed to load overlay module:", err);
          modulePromise = null; // 允许重试
          throw err;
        });
    }
    return modulePromise;
  }

  function dispatch(m, msg) {
    m.handleMessage(msg);
  }

  function report(err) {
    console.warn("[DuckMark] overlay failed to load", err);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;

    if (INVALIDATE_ACTIONS.has(msg.action)) {
      // Only worth delivering if the panel was already loaded in this
      // tab; otherwise there is nothing cached to invalidate.
      if (modulePromise) modulePromise.then((m) => dispatch(m, msg)).catch(report);
      return;
    }

    if (!TOGGLE_ACTIONS.has(msg.action)) return;
    loadModule().then((m) => dispatch(m, msg)).catch(report);
  });
})();
