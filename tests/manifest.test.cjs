const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest uses MV3 and only auto-runs on BOSS", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["https://www.zhipin.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.zhipin.com/*"]);
});

test("every manifest script and page exists", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.side_panel.default_path,
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]),
    "src/entries/resume-editor/index.html",
    "src/entries/results/index.html",
    "src/entries/workbench/index.html",
    "src/platform/indexeddb/task-repository.mjs",
    "src/features/analysis/analysis-service.mjs",
    "src/features/tasks/queue-policy.mjs",
    "vendor/pdfjs/pdf.mjs",
    "vendor/pdfjs/pdf.worker.mjs"
  ];
  files.forEach((file) => assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`));
});

test("manifest uses the project logo for extension and toolbar icons", () => {
  assert.equal(manifest.icons[128], "assets/logo.png");
  assert.equal(manifest.action.default_icon[16], "assets/logo.png");
  for (const icon of new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])) {
    assert.equal(fs.existsSync(path.join(root, icon)), true, `${icon} should exist`);
  }
});

test("toolbar action opens the extension shortcut menu", () => {
  assert.equal(manifest.action.default_popup, "src/entries/popup/index.html");
});

test("job capture modules load before the BOSS content entry", () => {
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/features/job-capture/text-utils.js",
    "src/features/job-capture/salary-parser.js",
    "src/features/job-capture/job-extractor.js",
    "src/platform/chrome/content-bridge.js",
    "src/entries/content/content-script.js"
  ]);
});

test("AI domains are optional rather than install-time host permissions", () => {
  assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
  assert.ok(!manifest.host_permissions.includes("https://*/*"));
});

test("manifest does not request unused scripting access", () => {
  assert.ok(!manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("activeTab"));
});

test("manifest allows the background queue to schedule recovery checks", () => {
  assert.ok(manifest.permissions.includes("alarms"));
});

test("extension page script and stylesheet references exist", () => {
  const pages = [
    manifest.action.default_popup,
    manifest.side_panel.default_path,
    "src/entries/workbench/index.html",
    "src/entries/results/index.html",
    "src/entries/resume-editor/index.html",
    "src/entries/resume-print/index.html"
  ];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const references = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      const target = path.resolve(root, path.dirname(page), reference);
      assert.equal(fs.existsSync(target), true, `${page} references missing ${reference}`);
    }
  }
});
