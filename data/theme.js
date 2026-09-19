// ============================================================
// data/theme.js — 主题偏好
//
// 两套色板都在 tokens.css：基色板 = 浅色（默认，CSS 首帧即
// 正确，无需 JS 引导）；黑色由 .dm-theme-dark 类覆盖。
// 偏好持久化于 chrome.storage.local（KEY: dm_theme），
// storage.onChanged 事件天然跨上下文——newtab 多页签之间、
// 以及 overlay 面板都能实时同步，无需走 SW 消息协议。
// ============================================================

const KEY = "dm_theme";

function normalize(v) {
  return v === "dark" ? "dark" : "light";
}

/** 当前持久化的主题（无记录/读取失败时回落浅色）。 */
export async function getTheme() {
  try {
    const v = (await chrome.storage.local.get(KEY))[KEY];
    return normalize(v);
  } catch {
    return "light";
  }
}

/** 持久化主题。写入会触发所有上下文的 onThemeChange 订阅。 */
export async function setTheme(theme) {
  await chrome.storage.local.set({ [KEY]: normalize(theme) });
}

/** 在根元素上挂/摘 .dm-theme-dark（html 或 overlay root 均可）。 */
export function applyThemeClass(el, theme) {
  if (!el) return;
  el.classList.toggle("dm-theme-dark", normalize(theme) === "dark");
}

/**
 * 订阅主题变化（storage 事件，跨页签实时同步）。
 * @param {(theme: "dark"|"light") => void} cb
 * @returns {() => void} 退订函数
 */
export function onThemeChange(cb) {
  const listener = (changes, area) => {
    if (area !== "local" || !(KEY in changes)) return;
    cb(normalize(changes[KEY].newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}