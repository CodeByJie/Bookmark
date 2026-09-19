// ============================================================
// newtab.js — the new-tab page reuses the SAME surface module as
// the overlay (inline mode). Plain click navigates the tab;
// ⌘/Ctrl+click opens a new tab; middle-click opens a background tab.
//
// 右上角主题切换按钮（.dm-theme-toggle）——偏好写入
// chrome.storage.local，storage.onChanged 事件让所有打开的
// newtab 页签与浮板面板实时同步。
//
// 整理模式（.dm-edit-toggle）：开启后 tile 出现 × 删除钮，
// 删除带 6 秒撤销（快照仅存内存——页面关闭即永久生效）。
// ============================================================

import { mountSurface } from "./surface/surface.js";
import { getTheme, setTheme, applyThemeClass, onThemeChange } from "./data/theme.js";
import { removeBookmark, restoreBookmark } from "./data/bookmark-ops.js";

const container = document.getElementById("bookmarks");
const themeToggle = document.getElementById("theme-toggle");
const editToggle = document.getElementById("edit-toggle");

function openBookmark(url, newTab, background = false) {
  if (newTab) {
    chrome.tabs.create({ url, active: !background });
  } else {
    chrome.tabs.update({ url });
  }
}

// ---- 主题：初始应用 + 按钮切换 + 跨页签同步 ----
let currentTheme = "light";

async function initTheme() {
  currentTheme = await getTheme();
  applyThemeClass(document.documentElement, currentTheme);
}

themeToggle.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  applyThemeClass(document.documentElement, currentTheme);
  setTheme(currentTheme);
});

onThemeChange((theme) => {
  // 其他页签/上下文改了主题——本地跟随（storage 事件）
  currentTheme = theme;
  applyThemeClass(document.documentElement, theme);
});

initTheme();

// ---- 整理模式 ----
let editing = false;

function setEditing(on) {
  editing = on;
  editToggle.setAttribute("aria-pressed", String(on));
  surface.setEditing(on);
}

editToggle.addEventListener("click", () => setEditing(!editing));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editing) setEditing(false);
});

// ---- 删除 + 撤销 toast（body 级单例：list 重渲染会销毁内部节点）----
const UNDO_MS = 6000;
const inFlight = new Set();
let pending = null; // { snap, timer, el }

function commitPending() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.el.remove();
  pending = null;
}

function showUndoToast(snap) {
  commitPending(); // 顶掉旧项——旧删除即刻永久化

  const el = document.createElement("div");
  el.className = "dm-toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");

  const text = document.createElement("span");
  text.className = "dm-toast-text";
  text.textContent = `已删除「${snap.title}」`;

  const action = document.createElement("button");
  action.className = "dm-toast-action";
  action.type = "button";
  action.textContent = "撤销";
  action.addEventListener("click", async () => {
    const entry = pending;
    commitPending();
    const res = await restoreBookmark(entry.snap);
    if (!res.ok) {
      surface.load();
      showExpiredToast();
    }
    // 成功路径无需手动 load：bookmarks.onCreated → onChanged 订阅
    // 会自动失效缓存并重渲染。
  });

  el.appendChild(text);
  el.appendChild(action);
  document.body.appendChild(el);

  const timer = setTimeout(commitPending, UNDO_MS);
  pending = { snap, timer, el };
}

function showExpiredToast() {
  const el = document.createElement("div");
  el.className = "dm-toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  const text = document.createElement("span");
  text.className = "dm-toast-text";
  text.textContent = "书签无法恢复";
  el.appendChild(text);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), UNDO_MS);
}

async function handleRemove(id) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const snap = await removeBookmark(id);
    if (snap) showUndoToast(snap);
  } finally {
    inFlight.delete(id);
  }
}

const surface = mountSurface(container, {
  mode: "inline",
  openBookmark,
  onClose: null,
  onRemove: handleRemove,
});

surface.load();
