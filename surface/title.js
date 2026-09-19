// ============================================================
// surface/title.js — 书签标题回退（单一实现）
//
// 规则：chrome:// 类 → 取 host 段；否则取域名单词首字母大写
// （去掉 www.）；实在没救 → URL 前 30 字符。调用方（BookmarkList）
// 先查 node.title，空才回落本函数。
// ============================================================

export function titleFromUrl(url) {
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
    return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : url.slice(0, 30);
  }
}
