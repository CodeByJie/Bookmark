// ============================================================
// surface/Favicon.js
// Favicon URL via the MV3 `_favicon` API. Fallback is a
// monochrome industrial tile (noting-design §3: no rainbow
// interface): dark hairline box + mono letter — the fallback
// reads as part of the system, not as decoration. The browser
// caches the `_favicon` responses themselves; the fallback is
// pure (derived from the URL hash), so no memoization needed.
// ============================================================

// NOTE: the trailing slash is required — `getURL("/_favicon")` (no slash)
// is not the endpoint and every request would 404 into the fallback.
export function faviconUrl(url) {
  if (!url || !chrome.runtime?.getURL) return null;
  const target = new URL(chrome.runtime.getURL("/_favicon/"));
  target.searchParams.set("pageUrl", url);
  target.searchParams.set("size", "32");
  return target.toString();
}

export function firstLetter(url, title) {
  if (title && title.length > 0) return title.charAt(0).toUpperCase();
  if (!url) return "?";
  try {
    return new URL(url).hostname.charAt(0).toUpperCase();
  } catch {
    return "?";
  }
}

/** Build a favicon <img> that swaps to a mono letter tile on error. */
export function createFavicon(url, title) {
  const img = document.createElement("img");
  img.className = "dm-favicon";
  img.alt = "";
  img.loading = "lazy";
  const src = faviconUrl(url);
  if (!src) {
    return createFallback(url, title);
  }
  img.src = src;
  let swapped = false;
  img.onerror = () => {
    if (swapped) return;
    swapped = true;
    img.replaceWith(createFallback(url, title));
  };
  return img;
}

export function createFallback(url, title) {
  const el = document.createElement("div");
  el.className = "dm-favicon-fallback";
  el.textContent = firstLetter(url, title);
  return el;
}