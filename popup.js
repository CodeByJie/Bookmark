import { EmptyBookmarkMessage } from "./utils/i18n.js";
import { createElement } from "./utils/element.js";
import { getFavicon } from "./utils/favicon.js";

const FAVICON_COLORS = [
  "#e8e8e8", "#ddd", "#d2d2d2", "#c7c7c7",
  "#bcbcbc", "#b1b1b1", "#a6a6a6", "#9b9b9b",
  "#909090", "#858585", "#7a7a7a", "#6f6f6f",
];

let rootNode = null;
const collapsedFolders = new Set();
let _heightUpdatePending = false;

window.onload = async function () {
  setBodyHeightFromStorage();

  try {
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    rootNode = bookmarkTreeNodes[0];
    clearSkeleton();
    renderAllFolders();
  } catch {
    clearSkeleton();
    showErrorFallback();
  }

  updateBodyHeight();
};

function clearSkeleton() {
  const container = document.getElementById("bookmarks");
  const skeleton = container.querySelector(".skeleton");
  if (skeleton) skeleton.remove();
}

function setBodyHeightFromStorage() {
  const savedHeight = Number(sessionStorage.getItem("savedHeight"));
  if (!Number.isNaN(savedHeight) && savedHeight > 30) {
    document.body.style.height = `${Math.min(savedHeight, 618)}px`;
    return;
  }
  document.body.style.height = "400px";
}

function calculateOptimalHeight() {
  const bookmarksContainer = document.getElementById("bookmarks");
  const totalHeight =
    (bookmarksContainer ? bookmarksContainer.scrollHeight : 0) + 24;
  return Math.min(Math.max(totalHeight, 200), 618);
}

function updateBodyHeight() {
  if (_heightUpdatePending) return;
  _heightUpdatePending = true;
  requestAnimationFrame(() => {
    _heightUpdatePending = false;
    const actualHeight = calculateOptimalHeight();
    document.body.style.height = `${actualHeight}px`;
    sessionStorage.setItem("savedHeight", actualHeight.toString());
  });
}

function showErrorFallback() {
  const container = document.getElementById("bookmarks");
  const isZh = navigator.language.startsWith("zh");
  const msg = isZh
    ? "无法读取书签，请检查扩展权限。"
    : "Cannot read bookmarks. Please check extension permissions.";
  container.appendChild(createElement("p", "message", msg));
}

function showEmptyBookmarkMessage() {
  const container = document.getElementById("bookmarks");
  container.appendChild(createElement("p", "message", EmptyBookmarkMessage));
}

function isBookmarkNode(node) {
  return Boolean(node && node.url);
}

function isFolderNode(node) {
  return Boolean(node?.children && node.children.length > 0);
}

function countDirectBookmarks(nodes) {
  return nodes.filter(isBookmarkNode).length;
}

function getTitleFromUrl(url) {
  if (!url) return "";
  if (url.startsWith("chrome://") || url.startsWith("edge://")) {
    const v = url.split("//")[1].split("/")[0];
    return v.charAt(0).toUpperCase() + v.slice(1);
  }
  try {
    const host = new URL(url).host;
    const part = host.startsWith("www.") ? host.split(".")[1] : host.split(".")[0];
    return part.charAt(0).toUpperCase() + part.slice(1);
  } catch {
    const cleaned = url.replace(/^\w+:\/\//, "").split("/")[0];
    if (cleaned) return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return url.length > 30 ? url.slice(0, 30) + "…" : url;
  }
}

function getDomainColor(url) {
  let hash = 0;
  const str = url || "";
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return FAVICON_COLORS[Math.abs(hash) % FAVICON_COLORS.length];
}

function getFirstLetter(url, title) {
  if (title && title.length > 0) return title.charAt(0).toUpperCase();
  if (!url) return "?";
  try {
    return new URL(url).hostname.charAt(0).toUpperCase();
  } catch {
    return "?";
  }
}

function createFaviconFallback(url, title) {
  const el = createElement("div", "favicon-fallback");
  el.textContent = getFirstLetter(url, title);
  el.style.background = getDomainColor(url);
  return el;
}

/* ============================================================
   Flatten tree: collect all folders that have direct bookmarks
   Pure‑intermediate folders (sub‑folders only) are skipped
   and their children promoted.
   ============================================================ */

function collectFolders(nodes) {
  const results = [];
  for (const node of nodes) {
    if (!node.children || node.children.length === 0) continue;
    const hasDirectBookmarks = node.children.some(isBookmarkNode);
    const hasSubFolders = node.children.some(isFolderNode);

    if (hasDirectBookmarks) {
      results.push(node);
    }
    if (hasSubFolders) {
      const subFolders = node.children.filter(isFolderNode);
      results.push(...collectFolders(subFolders));
    }
  }
  return results;
}

/* ============================================================
   Render all folders as collapsible cards
   ============================================================ */

function renderAllFolders() {
  const container = document.getElementById("bookmarks");
  container.innerHTML = "";

  const folders = collectFolders(rootNode.children || []);
  if (folders.length === 0) {
    showEmptyBookmarkMessage();
    return;
  }

  for (const folder of folders) {
    container.appendChild(createFolderCard(folder));
  }

  container.setAttribute("role", "application");
  container.setAttribute("aria-label", "书签面板");
}

function createFolderCard(folder) {
  const card = document.createElement("div");
  card.className = "folder-card";

  const children = folder.children || [];
  const bookmarks = children.filter(isBookmarkNode);

  // ---- Header (clickable toggle) ----
  const header = document.createElement("div");
  header.className = "folder-card-header";
  header.setAttribute("role", "button");
  header.setAttribute("tabindex", "0");
  header.setAttribute("aria-expanded", "true");

  const title = document.createElement("span");
  title.className = "folder-card-title";
  title.textContent = folder.title;

  const badge = document.createElement("span");
  badge.className = "folder-card-count";
  badge.textContent = countDirectBookmarks(children);

  header.appendChild(title);
  header.appendChild(badge);
  card.appendChild(header);

  // ---- Collapsible content ----
  const content = document.createElement("div");
  content.className = "folder-content";

  if (bookmarks.length > 0) {
    const grid = document.createElement("div");
    grid.className = "folder-grid";
    for (let i = 0; i < bookmarks.length; i++) {
      grid.appendChild(createBookmarkItem(bookmarks[i], i));
    }
    content.appendChild(grid);
    requestAnimationFrame(() => trimGridEdges(grid));
  }

  card.appendChild(content);

  // ---- Toggle collapse ----
  const handleToggle = () => {
    const isCollapsed = content.classList.toggle("collapsed");
    header.setAttribute("aria-expanded", String(!isCollapsed));
    if (isCollapsed) collapsedFolders.add(folder.id);
    else collapsedFolders.delete(folder.id);
    requestAnimationFrame(() => updateBodyHeight());
  };

  header.addEventListener("click", () => handleToggle());
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  });

  return card;
}

function trimGridEdges(grid) {
  const items = grid.children;
  if (items.length === 0) return;
  const lastRowTop = items[items.length - 1].offsetTop;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].offsetTop !== lastRowTop) break;
    items[i].style.borderBottom = "none";
  }
}

function createBookmarkItem(node, index) {
  const favicon = document.createElement("img");
  favicon.className = "favicon";
  favicon.src = getFavicon(node.url);
  favicon.alt = "";

  let fallbackShown = false;
  favicon.onerror = () => {
    if (!fallbackShown) {
      fallbackShown = true;
      const fallback = createFaviconFallback(node.url, node.title);
      favicon.replaceWith(fallback);
    }
  };

  const el = document.createElement("a");
  el.className = "bookmark";
  el.href = node.url;
  el.target = "_blank";
  el.rel = "noopener noreferrer";

  const label = node.title || getTitleFromUrl(node.url);
  el.title = label;
  el.setAttribute("aria-label", label);
  el.style.setProperty("--i", String(index));

  el.appendChild(favicon);

  const text = document.createElement("p");
  text.textContent = label;
  el.appendChild(text);

  el.addEventListener("click", (e) => {
    if (
      node.url.startsWith("chrome://") ||
      node.url.startsWith("edge://")
    ) {
      e.preventDefault();
      chrome.tabs.create({ url: node.url });
    }
    try {
      window.parent.postMessage("easy-bookmark-close", "*");
    } catch {}
  });

  return el;
}
