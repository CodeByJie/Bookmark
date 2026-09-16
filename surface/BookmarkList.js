// ============================================================
// surface/BookmarkList.js
// Pure rendering of bookmark sections (folders only, v4.9：
// 常用/frecency 区已删除)。
//
// The grid itself is the interface — mouse-driven:
//   • click opens (⌘/Ctrl = same-tab override)
//   • middle-click opens in a background tab
//   • tiles are real <a> links — browser-native Tab navigation
//     and focus rings come for free
// Holds the model so re-renders are cheap, never re-fetches.
// ============================================================

import { createFavicon } from "./Favicon.js";
import { titleFromUrl } from "./title.js";

function isBookmark(node) {
  return Boolean(node && node.url);
}

/**
 * DFS 前序收集所有"含直接书签子节点"的文件夹。
 * 单遍历：一次循环同时判定 hasBookmarks 与收集 subFolders，
 * 避免对同一 children 数组的 some + filter 双重扫描。
 * 导出供单元测试直接验证分组语义。
 * @returns {Array<object>} 文件夹节点（原样引用，children 由调用方过滤）
 */
export function collectFolders(nodes) {
  const out = [];
  for (const node of nodes) {
    const children = node.children;
    if (!children || children.length === 0) continue;
    let hasBookmarks = false;
    const subFolders = [];
    for (const c of children) {
      if (isBookmark(c)) hasBookmarks = true;
      if (c.children && c.children.length > 0) subFolders.push(c);
    }
    if (hasBookmarks) out.push(node);
    out.push(...collectFolders(subFolders));
  }
  return out;
}

export function createBookmarkList(container, opts = {}) {
  let sections = []; // [{ title, bookmarks:[{id,title,url}] }]

  function setData(tree) {
    const built = [];
    for (const folder of collectFolders(tree?.children || [])) {
      // collectFolders 只收"含书签"的文件夹，bookmarks 必非空
      const bookmarks = (folder.children || []).filter(isBookmark).map((n) => ({
        id: n.id,
        title: n.title || titleFromUrl(n.url),
        url: n.url,
      }));
      built.push({ title: folder.title, bookmarks });
    }
    sections = built;
  }

  function render() {
    container.replaceChildren();

    // DocumentFragment 离线构建，单次挂载只触发一次重排
    const frag = document.createDocumentFragment();
    if (sections.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dm-empty";
      empty.textContent = "没有找到书签";
      frag.appendChild(empty);
    } else {
      for (const section of sections) {
        frag.appendChild(buildSection(section.title, section.bookmarks));
      }
    }
    container.appendChild(frag);
  }

  function buildSection(title, bookmarks) {
    const section = document.createElement("section");
    section.className = "dm-section";

    const header = document.createElement("div");
    header.className = "dm-section-header";
    const h = document.createElement("span");
    h.className = "dm-section-title";
    h.textContent = title;
    header.appendChild(h);
    // 分区计数：等宽字体的 meta 信息（jay-design）
    const c = document.createElement("span");
    c.className = "dm-section-count";
    c.textContent = String(bookmarks.length);
    header.appendChild(c);
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "dm-grid";
    for (const b of bookmarks) {
      grid.appendChild(buildItem(b));
    }
    section.appendChild(grid);
    return section;
  }

  function buildItem(b) {
    const a = document.createElement("a");
    a.className = "dm-bookmark";
    a.href = b.url;
    a.dataset.url = b.url;
    a.dataset.id = b.id || "";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", b.title);

    a.appendChild(createFavicon(b.url, b.title));

    const p = document.createElement("p");
    p.textContent = b.title;
    a.appendChild(p);
    return a;
  }

  // ---- Mouse ----
  container.addEventListener("click", (e) => {
    const a = e.target.closest(".dm-bookmark");
    if (!a) return;
    e.preventDefault();
    opts.onOpen?.({ url: a.dataset.url, id: a.dataset.id }, e);
  });
  container.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return; // middle-click → background tab
    const a = e.target.closest(".dm-bookmark");
    if (!a) return;
    e.preventDefault();
    opts.onOpen?.({ url: a.dataset.url, id: a.dataset.id }, { button: 1 });
  });

  return {
    setData,
    render,
  };
}