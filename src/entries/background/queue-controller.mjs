import { clampConcurrency, clampHistoryLimit, selectRunnableTasks } from "../../features/tasks/queue-policy.mjs";
import { runTask } from "../../features/tasks/task-runner.mjs";
import { pruneHistoricalTasks, recoverInterruptedTasks } from "../../features/tasks/task-service.mjs";
import { localStore } from "../../platform/chrome/storage.mjs";
import { withExtensionKeepAlive } from "../../platform/chrome/service-worker-keepalive.mjs";
import { claimQueuedTask, getAllTasks, getTask } from "../../platform/indexeddb/task-repository.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { TASK_STATUS } from "../../shared/constants/task-status.mjs";

const running = new Map();
let initialization;
let scheduling;

export function wakeQueue() {
  if (!scheduling) {
    scheduling = scheduleQueue().finally(() => { scheduling = null; });
  }
  return scheduling;
}

export async function hasActiveQueueTasks() {
  const tasks = await getAllTasks();
  return tasks.some((task) => [TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status));
}

export async function pruneQueueHistory() {
  const stored = await localStore.get(STORAGE_KEYS.HISTORY_LIMIT);
  return pruneHistoricalTasks(clampHistoryLimit(stored[STORAGE_KEYS.HISTORY_LIMIT]));
}

async function scheduleQueue() {
  initialization ||= recoverInterruptedTasks().catch((error) => {
    initialization = null;
    throw error;
  });
  await initialization;

  const stored = await localStore.get([STORAGE_KEYS.QUEUE_CONCURRENCY, STORAGE_KEYS.QUEUE_PAUSED]);
  if (stored[STORAGE_KEYS.QUEUE_PAUSED] === true) return;

  const concurrency = clampConcurrency(stored[STORAGE_KEYS.QUEUE_CONCURRENCY] ?? 2);
  const tasks = await getAllTasks();
  const waiting = selectRunnableTasks(tasks, new Set(running.keys()), concurrency);
  waiting.forEach(startTask);
}

function startTask(task) {
  const execution = withExtensionKeepAlive(async () => {
    const claimed = await claimQueuedTask(task.id);
    if (!claimed) return;
    await runTask(claimed, async () => {
      const latest = await getTask(task.id);
      return !latest || latest.status === TASK_STATUS.CANCELED;
    });
  }).catch((error) => {
    console.error("后台任务调度失败", error);
  }).finally(async () => {
    running.delete(task.id);
    await pruneQueueHistory().catch((error) => console.error("历史任务自动清理失败", error));
    void wakeQueue();
  });
  running.set(task.id, execution);
}
