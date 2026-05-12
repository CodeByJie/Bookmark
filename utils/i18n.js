const isZh = navigator.language.startsWith("zh");

const EmptyBookmarkMessage = isZh
  ? "🍁 没有找到书签"
  : "🍁 No bookmarks in the current browser";

export { EmptyBookmarkMessage };
