(function setupBookmarkOverlay() {
  if (window.top !== window.self) {
    return;
  }

  const ROOT_ID = "bookmark-overlay-root";
  const OPEN_CLASS = "bookmark-open";
  const PANEL_CLASS = "bookmark-panel";
  const BACKDROP_CLASS = "bookmark-backdrop";
  const FRAME_CLASS = "bookmark-frame";
  const TOGGLE_MESSAGE = "easy-bookmark-toggle";
  const CLOSE_MESSAGE = "easy-bookmark-close";

  const existingRoot = document.getElementById(ROOT_ID);

  // ---- Message listener (registered once) ----
  if (!existingRoot) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.action === TOGGLE_MESSAGE) {
        const root = document.getElementById(ROOT_ID);
        if (root) {
          toggleOverlay(root);
        }
      }
      return false;
    });
  }

  // ---- First-open: build DOM ----
  if (existingRoot) {
    toggleOverlay(existingRoot);
    return;
  }

  const runtimeURL =
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    typeof chrome.runtime.getURL === "function"
      ? chrome.runtime.getURL.bind(chrome.runtime)
      : null;

  if (!runtimeURL) {
    return;
  }

  const root = document.createElement("div");
  root.id = ROOT_ID;

  const backdrop = document.createElement("div");
  backdrop.className = BACKDROP_CLASS;

  const panel = document.createElement("div");
  panel.className = PANEL_CLASS;

  const frame = document.createElement("iframe");
  frame.className = FRAME_CLASS;
  frame.src = runtimeURL("popup.html");
  frame.title = "极简书签";

  panel.appendChild(frame);
  root.appendChild(backdrop);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  // Open immediately on first injection.
  setOpen(root, true);

  // ---- Auto-close: listen for postMessage from extension iframe ----
  const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;
  function onPostMessage(event) {
    if (event.origin !== EXTENSION_ORIGIN) return;
    if (event.data === CLOSE_MESSAGE && root.classList.contains(OPEN_CLASS)) {
      closeOverlay();
    }
  }
  window.addEventListener("message", onPostMessage);

  // ---- Event bindings ----
  function closeOverlay() {
    setOpen(root, false);
  }

  backdrop.addEventListener("click", closeOverlay);

  root.addEventListener("click", (event) => {
    if (event.target === root) {
      closeOverlay();
    }
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && root.classList.contains(OPEN_CLASS)) {
        closeOverlay();
      }
    },
    true,
  );

  // ---- Helpers ----
  function toggleOverlay(overlayRoot) {
    const isCurrentlyOpen = overlayRoot.classList.contains(OPEN_CLASS);
    setOpen(overlayRoot, !isCurrentlyOpen);
  }

  function setOpen(overlayRoot, isOpen) {
    overlayRoot.classList.toggle(OPEN_CLASS, isOpen);

    if (isOpen) {
      overlayRoot._previousFocus = document.activeElement;
      const panel = overlayRoot.querySelector(".bookmark-panel");
      function focusFrame() {
        const frm = overlayRoot.querySelector("iframe");
        if (frm?.contentWindow) frm.contentWindow.focus();
      }
      if (panel) {
        panel.addEventListener("transitionend", function handler(e) {
          if (e.propertyName === "transform") {
            panel.removeEventListener("transitionend", handler);
            focusFrame();
          }
        });
      }
    } else {
      if (overlayRoot._previousFocus) {
        try {
          overlayRoot._previousFocus.focus();
        } catch {
          // Element may have been removed.
        }
        overlayRoot._previousFocus = null;
      }
    }
  }
})();
