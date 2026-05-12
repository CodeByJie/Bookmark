export function getFavicon(url) {
  return `${chrome.runtime.getURL("/_favicon?")}pageUrl=${encodeURIComponent(url)}&size=32`;
}
