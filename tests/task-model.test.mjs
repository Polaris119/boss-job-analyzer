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
  assert.equal(task.status, "queued");
  assert.equal(task.contentHash, "hash");
});
