import test from "node:test";
import assert from "node:assert/strict";
import { createTaskRecord } from "../src/features/tasks/task-model.mjs";

test("task creation freezes only non-secret AI configuration", () => {
  const task = createTaskRecord({
    job: { id: "boss:1", jobKey: "boss:1", contentHash: "hash" },
    resumeSnapshot: { sections: [] },
    aiConfig: { provider: "custom", baseUrl: "https://example.com", model: "demo", apiKey: "secret" }
  });
  assert.deepEqual(task.aiConfig, { provider: "custom", baseUrl: "https://example.com", model: "demo" });
  assert.equal(task.generateResume, true);
  assert.equal(task.status, "queued");
  assert.equal(task.contentHash, "hash");
  assert.equal(task.stage, "profile");
  assert.equal(task.roleProfile, null);
  assert.equal(task.preparation, null);
  assert.deepEqual(task.resumePresentation, { templateId: "classic-blue", photo: null, showPhoto: false });
});

test("task creation freezes disabled resume generation", () => {
  const task = createTaskRecord({
    job: { id: "boss:2", contentHash: "hash" },
    resumeSnapshot: { sections: [] },
    aiConfig: { provider: "custom", baseUrl: "https://example.com", model: "demo" },
    generateResume: false
  });
  assert.equal(task.generateResume, false);
});

test("task creation reuses a structured role profile for the same job", () => {
  const roleProfile = { coreCriteria: [], expertLens: { perspective: "产品负责人" } };
  const task = createTaskRecord({
    job: { id: "boss:3", contentHash: "hash" },
    resumeSnapshot: { sections: [] },
    aiConfig: { provider: "custom", baseUrl: "https://example.com", model: "demo" },
    roleProfile
  });
  assert.equal(task.roleProfile, roleProfile);
});
