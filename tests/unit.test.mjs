#!/usr/bin/env node
// ============================================================
// tests/unit.test.mjs — 零依赖单元测试
//
// 运行：node tests/unit.test.mjs
//
// 覆盖范围（与本次优化一一对应）：
//   1. title.js          — titleFromUrl 回退规则
//   2. BookmarkList.js   — collectFolders 分组语义与 DFS 顺序
//   3. bookmarks-cache   — 缓存命中 / 并发去重 / invalidate / 失败重试
//   4. injector↔protocol — classic script 内联镜像的 action 集合
//                          必须与 shared/protocol.js 保持同步（文档化契约）
// ============================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- chrome mock：content script 场景（无 chrome.bookmarks，走 SW 代理）----
let proxyCalls = 0;
let proxyResponse = { ok: true, tree: null };
globalThis.chrome = {
  runtime: {
    sendMessage: async () => {
      proxyCalls++;
      return proxyResponse;
    },
  },
};

// ============================================================
// 1. titleFromUrl
// ============================================================
test("titleFromUrl：各回退分支", async () => {
  const { titleFromUrl } = await load("surface/title.js");
  assert.equal(titleFromUrl(""), "");
  assert.equal(titleFromUrl("chrome://settings/"), "Settings");
  assert.equal(titleFromUrl("https://www.github.com/pricing"), "Github");
  assert.equal(titleFromUrl("https://developer.mozilla.org/en-US/"), "Developer");
  assert.equal(titleFromUrl("ftp://files.example.com"), "Files");
  // 非 URL 字符串：去掉协议前缀取首段、首字母大写
  assert.equal(titleFromUrl("not a url"), "Not a url");
});

// ============================================================
// 2. collectFolders：分组语义 + DFS 前序
// ============================================================
test("collectFolders：DFS 前序，跳过空文件夹与纯嵌套文件夹", async () => {
  const { collectFolders } = await load("surface/BookmarkList.js");

  const url = (id) => ({ id, title: id.toUpperCase(), url: `https://${id}.example.com` });
  const tree = {
    children: [
      {
        title: "书签栏",
        children: [
          url("b1"),
          {
            title: "Dev",
            children: [
              url("d1"),
              { title: "Sub", children: [url("s1")] },
            ],
          },
          { title: "Empty", children: [] },
        ],
      },
      {
        title: "其他书签",
        children: [
          url("o1"),
          // Wrapper 自身无直接书签 → 不入选；其子 Inner 有 → 入选
          { title: "Wrapper", children: [{ title: "Inner", children: [url("i1")] }] },
        ],
      },
    ],
  };

  const titles = collectFolders(tree.children).map((f) => f.title);
  assert.deepEqual(titles, ["书签栏", "Dev", "Sub", "其他书签", "Inner"]);
  assert.deepEqual(collectFolders([]), []);
});

// ============================================================
// 3. bookmarks-cache：缓存 / 去重 / 失效 / 重试
// ============================================================
test("bookmarks-cache：缓存命中只发一次请求", async () => {
  const cache = await load("data/bookmarks-cache.js");
  cache.invalidate();
  const tree = { id: "0", children: [] };
  proxyResponse = { ok: true, tree };
  proxyCalls = 0;

  const first = await cache.getTree();
  assert.equal(proxyCalls, 1);
  assert.equal(first, tree, "返回的是解包后的根节点");

  await cache.getTree();
  assert.equal(proxyCalls, 1, "缓存命中，不再发请求");
});

test("bookmarks-cache：invalidate 后的并发调用共享同一次 fetch", async () => {
  const cache = await load("data/bookmarks-cache.js");
  cache.invalidate();
  proxyResponse = { ok: true, tree: { id: "0", children: [] } };
  proxyCalls = 0;

  const [a, b] = await Promise.all([cache.getTree(), cache.getTree()]);
  assert.equal(proxyCalls, 1, "并发去重：两次 getTree 只触发一次代理请求");
  assert.equal(a, b);
});

test("bookmarks-cache：fetch 失败可重试", async () => {
  const cache = await load("data/bookmarks-cache.js");
  cache.invalidate();
  proxyResponse = { ok: false };
  await assert.rejects(() => cache.getTree(), /bookmarks unavailable/);

  proxyResponse = { ok: true, tree: { id: "0", children: [] } };
  const tree = await cache.getTree();
  assert.equal(tree.id, "0", "失败后 inflight 已清空，重试成功");
});

// ============================================================
// 4. injector ↔ protocol 镜像契约
// ============================================================
test("injector 内联的 action 集合与 protocol.js 同步", async () => {
  const { TOGGLE_ACTIONS, INVALIDATE_ACTIONS } = await load("shared/protocol.js");
  const src = readFileSync(join(ROOT, "content/overlay-injector.js"), "utf8");

  const extractSet = (name) => {
    const m = src.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`));
    assert.ok(m, `injector 中找不到 ${name} 的镜像定义`);
    return m[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  };

  assert.deepEqual(
    [...extractSet("TOGGLE_ACTIONS")].sort(),
    [...TOGGLE_ACTIONS].sort(),
    "TOGGLE_ACTIONS 镜像漂移——改 protocol.js 时必须同步 injector"
  );
  assert.deepEqual(
    [...extractSet("INVALIDATE_ACTIONS")].sort(),
    [...INVALIDATE_ACTIONS].sort(),
    "INVALIDATE_ACTIONS 镜像漂移——改 protocol.js 时必须同步 injector"
  );
});

// ---- runner ----
let passed = 0;
const failures = [];
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`FAIL  ${name}`);
    console.error(`      ${err?.message ?? err}`);
  }
}
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
