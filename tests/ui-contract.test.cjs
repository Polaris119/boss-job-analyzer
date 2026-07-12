const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("side panel exposes explicit config, queue feedback and workbench entry", () => {
  const html = read("sidepanel.html");
  assert.match(html, /id="config-feedback"/);
  assert.match(html, /id="action-feedback"/);
  assert.match(html, /id="open-workbench"/);
  assert.match(html, /id="delete-resume"[^>]*hidden/);
  assert.doesNotMatch(html, /本地数据管理|id="clear-data"/);
  assert.ok(html.indexOf("加入分析队列") < html.indexOf("AI 接入配置"));
  assert.match(read("sidepanel.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("workbench exposes concurrency, status filters and task history", () => {
  const html = read("workbench.html");
  assert.match(html, /id="concurrency"/);
  assert.match(html, /value="2">2 个（推荐）/);
  assert.match(html, /data-filter="completed"/);
  assert.match(html, /id="task-list"/);
  assert.match(html, /id="clear-history"/);
  assert.match(read("workbench.js"), /\["completed", "failed", "canceled"\]/);
  assert.match(read("task-store.mjs"), /historicalStatuses = new Set\(\["completed", "failed", "canceled"\]\)/);
});

test("product name and company context are visible across primary pages", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.name, "BOSS直聘岗位分析助手");
  for (const file of ["sidepanel.html", "workbench.html", "results.html", "resume-editor.html"]) {
    assert.match(read(file), /BOSS直聘岗位分析助手/);
  }
  assert.match(read("workbench.js"), /task\.job\?\.company/);
  assert.match(read("results.js"), /\[job\.company, job\.title/);
});

test("workbench atomically claims queued tasks before model execution", () => {
  assert.match(read("workbench.js"), /claimQueuedTask/);
  const store = read("task-store.mjs");
  assert.match(store, /database\.transaction\(TASK_STORE, "readwrite"\)/);
  assert.match(store, /task\.status !== "queued"/);
});

test("only one workbench tab can own the queue runner", () => {
  const script = read("workbench.js");
  assert.match(script, /navigator\.locks\.request\("job-analysis-runner"/);
  assert.match(script, /if \(!state\.isRunner/);
});

test("resume upload and editing are separate explicit steps", () => {
  const sidePanel = read("sidepanel.html");
  assert.match(sidePanel, /type="file"[^>]*accept="application\/pdf,.pdf"/);
  const editor = read("resume-editor.html");
  assert.match(editor, /保存并完成同步/);
});

test("results page separates report and resume exports", () => {
  const html = read("results.html");
  assert.match(html, /data-tab="report"/);
  assert.match(html, /data-tab="resume"/);
  assert.match(html, /id="download-markdown"/);
  assert.match(html, /id="export-pdf"/);
});

test("resume editor supports theme colors and structural editing without export confirmation", () => {
  const html = read("results.html");
  const script = read("results.js");
  assert.match(html, /id="resume-theme-color"[^>]*type="color"/);
  assert.match(html, /id="add-resume-section"/);
  assert.doesNotMatch(html, /confirmation-list|需要人工确认/);
  assert.match(script, /moveSection/);
  assert.match(script, /moveItem/);
  assert.doesNotMatch(script, /export-pdf.*disabled/);
});

test("job extraction uses visible content and a content fingerprint", () => {
  const content = read("content.js");
  assert.match(content, /function isVisible/);
  assert.match(content, /fingerprint:\s*hash\(fallbackIdentity\)/);
  assert.match(content, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(content, /jobKey/);
  assert.match(content, /externalJobId \? `boss:\$\{externalJobId\}`/);
  assert.match(content, /a\[ka\*='job-detail-company'\]/);
  assert.match(content, /hiringOrganization\?\.name/);
});

test("switching BOSS jobs invalidates stale state and captures a stable fresh snapshot", () => {
  const content = read("content.js");
  assert.match(content, /chrome\.storage\.local\.remove\("currentJob"\)/);
  assert.match(content, /async function captureStableJob/);
  assert.match(content, /currentKey === previousKey/);
  assert.match(content, /currentJob\.url !== location\.href/);
  assert.match(content, /findCurrentJobDetail/);
  assert.match(content, /div\[class\*='job-detail-box'\]/);
  assert.match(content, /span\[class\*='job-name'\]/);
  assert.match(content, /div\[class\*='boss-info-attr'\]/);
  assert.match(content, /visibleTextFromFirst\([^;]+detailRoot\)/s);
});

test("stale extension contexts show a refresh instruction instead of a raw browser alert", () => {
  const content = read("content.js");
  assert.match(content, /extension context invalidated/i);
  assert.match(content, /请刷新此 BOSS 页面后重试/);
  assert.doesNotMatch(content, /window\.alert/);
});
