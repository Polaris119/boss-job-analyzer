import test from "node:test";
import assert from "node:assert/strict";
import { clampConcurrency, selectRunnableTasks } from "../src/features/tasks/queue-policy.mjs";

test("concurrency is user configurable within the supported range", () => {
  assert.equal(clampConcurrency(1), 1);
  assert.equal(clampConcurrency(2), 2);
  assert.equal(clampConcurrency(3), 3);
  assert.equal(clampConcurrency(9), 3);
  assert.equal(clampConcurrency(0), 2);
});

test("scheduler only fills available parallel slots", () => {
  const tasks = [
    { id: "running", status: "running" },
    { id: "b", status: "queued", createdAt: "2026-01-02" },
    { id: "a", status: "queued", createdAt: "2026-01-01" },
    { id: "done", status: "completed" }
  ];
  assert.deepEqual(selectRunnableTasks(tasks, new Set(["running"]), 2).map((task) => task.id), ["a"]);
  assert.deepEqual(selectRunnableTasks(tasks, new Set(), 2).map((task) => task.id), ["a", "b"]);
});
