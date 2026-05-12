const CONTENT_SCRIPT_FILE = "content.js";
const OVERLAY_STYLE_FILE = "overlay.css";
const TOGGLE_MESSAGE = "easy-bookmark-toggle";

async function injectOverlay(tabId) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: [OVERLAY_STYLE_FILE],
    });
  } catch (error) {
    console.warn("[Easy-Bookmark] CSS injection failed for tab", tabId, error);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch (error) {
    console.warn("[Easy-Bookmark] Script injection failed for tab", tabId, error);
  }
}

async function toggleOverlay(tabId) {
  // Try sending a lightweight message first — if the content script is
  // already alive on the page this avoids re-injecting the whole file.
  try {
    await chrome.tabs.sendMessage(tabId, { action: TOGGLE_MESSAGE });
  } catch {
    // No listener yet (first open or new page). Inject the full script.
    await injectOverlay(tabId);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  await toggleOverlay(tab.id);
});
