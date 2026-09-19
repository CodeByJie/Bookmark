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
// 点击立即永久删除（无撤销，Chrome 书签没有回收站）。
// ============================================================

import { mountSurface } from "./surface/surface.js";
import { getTheme, setTheme, applyThemeClass, onThemeChange } from "./data/theme.js";
import { removeBookmark } from "./data/bookmark-ops.js";

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

// ---- 删除：点击 × 立即永久生效（无撤销）----
// inFlight 去重：remove 前先 get 快照，异步窗口内同一 tile
// 可能连点两次——不去重的话第二次只是 get 失败静默无害，
// 但去重让"一次点击一次删除"的语义更确定。
const inFlight = new Set();

async function handleRemove(id) {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    await removeBookmark(id);
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
