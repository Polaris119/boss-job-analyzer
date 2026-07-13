import { localStore } from "../../platform/chrome/storage.mjs";
import {
  deleteTasks,
  getAllTasks,
  putTask
} from "../../platform/indexeddb/task-repository.mjs";
import { STORAGE_KEYS } from "../../shared/constants/storage-keys.mjs";
import { HISTORICAL_TASK_STATUSES, TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { createLegacyTask, createTaskRecord } from "./task-model.mjs";

export async function createTask(input) {
  const task = createTaskRecord(input);
  await putTask(task);
  return task;
}

export async function clearHistoricalTasks() {
  const tasks = await getAllTasks();
  const historical = tasks.filter((task) => HISTORICAL_TASK_STATUSES.has(task.status));
  await deleteTasks(historical.map((task) => task.id));
  return historical.length;
}

export async function getTaskStats() {
  const tasks = await getAllTasks();
  const stats = { total: tasks.length, queued: 0, running: 0, completed: 0, failed: 0, canceled: 0 };
  tasks.forEach((task) => {
    if (Object.hasOwn(stats, task.status)) stats[task.status] += 1;
  });
  return stats;
}

export async function recoverInterruptedTasks() {
  const tasks = await getAllTasks();
  const interrupted = tasks.filter((task) => task.status === TASK_STATUS.RUNNING);
  for (const task of interrupted) {
    task.status = TASK_STATUS.QUEUED;
    task.phase = "waiting";
    task.recoveryCount = (task.recoveryCount || 0) + 1;
    task.error = "上次工作台关闭导致任务中断，已从最近完成阶段恢复排队。";
    await putTask(task);
  }
  return interrupted.length;
}

export async function migrateLegacyHistory() {
  const keys = [STORAGE_KEYS.LEGACY_HISTORY_MIGRATED, STORAGE_KEYS.LEGACY_HISTORY];
  const stored = await localStore.get(keys);
  if (stored[STORAGE_KEYS.LEGACY_HISTORY_MIGRATED]) return 0;

  const records = stored[STORAGE_KEYS.LEGACY_HISTORY] || [];
  const existing = await getAllTasks();
  const existingIds = new Set(existing.map((task) => task.id));
  let migrated = 0;
  for (const record of records) {
    if (!record?.id || existingIds.has(record.id)) continue;
    await putTask(createLegacyTask(record));
    migrated += 1;
  }
  await localStore.set({ [STORAGE_KEYS.LEGACY_HISTORY_MIGRATED]: true });
  return migrated;
}
