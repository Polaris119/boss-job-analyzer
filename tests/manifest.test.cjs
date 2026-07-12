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
    manifest.side_panel.default_path,
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css]),
    "resume-editor.html",
    "results.html",
    "workbench.html",
    "task-store.mjs",
    "analysis-engine.mjs",
    "queue-policy.mjs",
    "vendor/pdfjs/pdf.mjs",
    "vendor/pdfjs/pdf.worker.mjs"
  ];
  files.forEach((file) => assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`));
});

test("manifest uses the project logo for extension and toolbar icons", () => {
  assert.equal(manifest.icons[128], "logo.png");
  assert.equal(manifest.action.default_icon[16], "logo.png");
  for (const icon of new Set([...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)])) {
    assert.equal(fs.existsSync(path.join(root, icon)), true, `${icon} should exist`);
  }
});

test("salary parser loads before the BOSS content script", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["salary.js", "content.js"]);
});

test("AI domains are optional rather than install-time host permissions", () => {
  assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
  assert.ok(!manifest.host_permissions.includes("https://*/*"));
});
