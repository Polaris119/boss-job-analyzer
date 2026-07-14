const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const entries = {
  sidePanel: "src/entries/sidepanel",
  workbench: "src/entries/workbench",
  results: "src/entries/results",
  resumeEditor: "src/entries/resume-editor"
};

test("side panel exposes explicit config, queue feedback and workbench entry", () => {
  const html = read(`${entries.sidePanel}/index.html`);
  assert.match(html, /id="config-feedback"/);
  assert.match(html, /id="toast"/);
  assert.match(html, /id="generate-resume"[^>]*checked/);
  assert.match(html, /id="open-workbench"/);
  assert.match(html, /id="delete-resume"[^>]*hidden/);
  assert.doesNotMatch(html, /本地数据管理|id="clear-data"/);
  assert.ok(html.indexOf("加入分析队列") < html.indexOf("AI 接入配置"));
  assert.ok(html.indexOf("生成定制简历") < html.indexOf("加入分析队列"));
  assert.match(read("src/shared/styles/base.css"), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test("workbench exposes concurrency, status filters and task history", () => {
  const html = read(`${entries.workbench}/index.html`);
  assert.match(html, /id="concurrency"/);
  assert.match(html, /value="2">2 个（推荐）/);
  assert.match(html, /data-filter="completed"/);
  assert.match(html, /id="task-list"/);
  assert.match(html, /id="clear-history"/);
  const statuses = read("src/shared/constants/task-status.mjs");
  for (const status of ["COMPLETED", "FAILED", "CANCELED"]) assert.match(statuses, new RegExp(`${status}:`));
});

test("product name and company context are visible across primary pages", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.name, "BOSS直聘岗位分析助手");
  for (const directory of Object.values(entries)) assert.match(read(`${directory}/index.html`), /BOSS直聘岗位分析助手/);
  assert.match(read(`${entries.workbench}/view.mjs`), /task\.job\?\.company/);
  assert.match(read(`${entries.results}/controller.mjs`), /\[job\.company, job\.title/);
});

test("background worker atomically claims queued tasks before model execution", () => {
  const queueController = read("src/entries/background/queue-controller.mjs");
  assert.match(queueController, /claimQueuedTask/);
  assert.match(queueController, /runTask/);
  assert.match(queueController, /recoverInterruptedTasks/);
  const repository = read("src/platform/indexeddb/task-repository.mjs");
  assert.match(repository, /database\.transaction\(TASK_STORE, "readwrite"\)/);
  assert.match(repository, /task\.status !== TASK_STATUS\.QUEUED/);
});

test("workbench is a queue client and can close without interrupting analysis", () => {
  const workbench = read(`${entries.workbench}/controller.mjs`);
  const background = read("src/entries/background/service-worker.mjs");
  const html = read(`${entries.workbench}/index.html`);
  assert.doesNotMatch(workbench, /claimQueuedTask|runTask|beforeunload|navigator\.locks/);
  assert.match(workbench, /wakeTaskQueue/);
  assert.match(background, /wakeQueue/);
  assert.match(background, /QUEUE_RECOVERY_ALARM/);
  assert.match(html, /工作台可以随时关闭/);
});

test("resume upload and editing are separate explicit steps", () => {
  assert.match(read(`${entries.sidePanel}/index.html`), /type="file"[^>]*accept="application\/pdf,.pdf"/);
  assert.match(read(`${entries.resumeEditor}/index.html`), /保存并完成同步/);
});

test("results page separates report and resume exports", () => {
  const html = read(`${entries.results}/index.html`);
  assert.match(html, /data-tab="report"/);
  assert.match(html, /data-tab="resume"/);
  assert.match(html, /id="download-markdown"/);
  assert.match(html, /id="export-pdf"/);
  assert.match(html, /class="report-sidebar"/);
  assert.match(html, />准备度概览<\/a>/);
  assert.match(html, /href="#overview-section"/);
  assert.match(html, /href="#short-term-section"/);
  assert.match(html, /href="#interview-section"/);
});

test("resume editor supports theme colors and structural editing", () => {
  const html = read(`${entries.results}/index.html`);
  const script = read(`${entries.results}/controller.mjs`);
  assert.match(html, /id="resume-theme-color"[^>]*type="color"/);
  assert.match(html, /id="add-resume-section"/);
  assert.match(script, /moveSection/);
  assert.match(script, /moveItem/);
});

test("tasks can skip resume generation and results hide unavailable resume UI", () => {
  const runner = read("src/features/tasks/task-runner.mjs");
  const results = read(`${entries.results}/controller.mjs`);
  const sidePanel = read(`${entries.sidePanel}/controller.mjs`);
  assert.match(runner, /generateResume && !task\.optimizedResume/);
  assert.match(results, /Boolean\(state\.record\.optimizedResume\)/);
  assert.match(results, /data-tab="resume"/);
  assert.match(sidePanel, /generateResume:\s*state\.generateResume/);
});

test("analysis pipeline profiles the role before diagnosis and planning", () => {
  const runner = read("src/features/tasks/task-runner.mjs");
  const prompts = read("src/features/analysis/prompts.mjs");
  assert.ok(runner.indexOf("await profileJob") < runner.indexOf("await analyzeJobMatch"));
  assert.ok(runner.indexOf("await analyzeJobMatch") < runner.indexOf("await generatePreparationPlan"));
  assert.match(prompts, /buildRoleProfileMessages/);
  assert.match(prompts, /buildPreparationMessages/);
  assert.match(prompts, /高适配时允许 gaps 和 knowledgePoints 为空/);
});

test("job extraction uses visible content and a content fingerprint", () => {
  const extractor = read("src/features/job-capture/job-extractor.js");
  assert.match(extractor, /function isVisible/);
  assert.match(extractor, /fingerprint:\s*hash\(fallbackIdentity\)/);
  assert.match(extractor, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(extractor, /externalJobId \? `boss:\$\{externalJobId\}`/);
  assert.match(extractor, /a\[ka\*='job-detail-company'\]/);
  assert.match(extractor, /hiringOrganization\?\.name/);
});

test("switching BOSS jobs invalidates stale state and captures a stable fresh snapshot", () => {
  const entry = read("src/entries/content/content-script.js");
  const extractor = read("src/features/job-capture/job-extractor.js");
  assert.match(entry, /bridge\.removeCurrentJob\(\)/);
  assert.match(extractor, /async function captureStableJob/);
  assert.match(extractor, /currentKey === previousKey/);
  assert.match(entry, /currentJob\?\.url && currentJob\.url !== location\.href/);
  assert.match(extractor, /findCurrentJobDetail/);
});

test("stale extension contexts show a refresh instruction instead of a raw browser alert", () => {
  const content = read("src/entries/content/content-script.js");
  assert.match(content, /extension context invalidated/i);
  assert.match(content, /请刷新此 BOSS 页面后重试/);
  assert.doesNotMatch(content, /window\.alert/);
});

test("feature and shared modules do not access browser persistence directly", () => {
  const files = [
    "src/features/analysis/analysis-service.mjs",
    "src/features/tasks/task-service.mjs",
    "src/features/tasks/queue-policy.mjs",
    "src/features/resume/resume-parser.mjs",
    "src/shared/utils/value.mjs"
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /indexedDB/);
    assert.doesNotMatch(source, /chrome\.(storage|tabs|permissions)/);
  }
});
