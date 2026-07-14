import test from "node:test";
import assert from "node:assert/strict";
import { clampConcurrency, clampHistoryLimit, selectHistoricalTasksToPrune, selectRunnableTasks } from "../src/features/tasks/queue-policy.mjs";

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

test("history retention supports only 10, 20 or 30 records and defaults to 20", () => {
  assert.equal(clampHistoryLimit(10), 10);
  assert.equal(clampHistoryLimit(20), 20);
  assert.equal(clampHistoryLimit(30), 30);
  assert.equal(clampHistoryLimit(99), 20);
});

test("history pruning removes only the oldest terminal tasks", () => {
  const tasks = Array.from({ length: 12 }, (_, index) => ({
    id: `history-${index}`,
    status: index % 2 ? "completed" : "failed",
    updatedAt: `2026-07-${String(index + 1).padStart(2, "0")}`
  }));
  tasks.push({ id: "queued", status: "queued", updatedAt: "2026-06-01" });
  assert.deepEqual(
    selectHistoricalTasksToPrune(tasks, 10).map((task) => task.id),
    ["history-1", "history-0"]
  );
});
