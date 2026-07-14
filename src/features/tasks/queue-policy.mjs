import { HISTORICAL_TASK_STATUSES, TASK_STATUS } from "../../shared/constants/task-status.mjs";

export const HISTORY_LIMIT_OPTIONS = Object.freeze([10, 20, 30]);

export function clampConcurrency(value) {
  return Math.min(3, Math.max(1, Number(value) || 2));
}

export function clampHistoryLimit(value) {
  const limit = Number(value);
  return HISTORY_LIMIT_OPTIONS.includes(limit) ? limit : 20;
}

export function selectRunnableTasks(tasks, runningIds, concurrency) {
  const running = runningIds instanceof Set ? runningIds : new Set(runningIds);
  const available = Math.max(0, clampConcurrency(concurrency) - running.size);
  return tasks
    .filter((task) => task.status === TASK_STATUS.QUEUED && !running.has(task.id))
    .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
    .slice(0, available);
}

export function selectHistoricalTasksToPrune(tasks, limit) {
  return tasks
    .filter((task) => HISTORICAL_TASK_STATUSES.has(task.status))
    .sort((a, b) => historyDate(b).localeCompare(historyDate(a)))
    .slice(clampHistoryLimit(limit));
}

function historyDate(task) {
  return String(task.completedAt || task.updatedAt || task.createdAt || "");
}
