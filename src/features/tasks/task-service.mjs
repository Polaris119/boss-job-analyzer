import {
  deleteTasks,
  getAllTasks,
  putTask
} from "../../platform/indexeddb/task-repository.mjs";
import { HISTORICAL_TASK_STATUSES, TASK_STATUS } from "../../shared/constants/task-status.mjs";
import { createTaskRecord } from "./task-model.mjs";

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
