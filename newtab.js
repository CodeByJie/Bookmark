// ============================================================
// newtab.js — the new-tab page reuses the SAME surface module as
// the overlay (inline mode). Plain click navigates the tab;
// ⌘/Ctrl+click opens a new tab.
//
// v4.8：右上角主题切换按钮（.dm-theme-toggle）——偏好写入
// chrome.storage.local，storage.onChanged 事件让所有打开的
// newtab 页签与浮板面板实时同步。
// ============================================================

import { mountSurface } from "./surface/surface.js";
import { getTheme, setTheme, applyThemeClass, onThemeChange } from "./data/theme.js";

const container = document.getElementById("bookmarks");
const themeToggle = document.getElementById("theme-toggle");

function openBookmark(url, newTab) {
  if (newTab) {
    chrome.tabs.create({ url });
  } else {
    chrome.tabs.update({ url });
  }
}

// ---- 主题：初始应用 + 按钮切换 + 跨页签同步 ----
let currentTheme = "dark";

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

const surface = mountSurface(container, {
  mode: "inline",
  openBookmark,
  onClose: null,
});

surface.load();