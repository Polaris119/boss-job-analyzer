import { TASK_STATUS } from "../../shared/constants/task-status.mjs";

const DB_NAME = "job-resume-assistant";
const DB_VERSION = 1;
const TASK_STORE = "tasks";
const CHANNEL_NAME = "job-analysis-tasks";
let databasePromise;

export function openTaskDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.createObjectStore(TASK_STORE, { keyPath: "id" });
      store.createIndex("status", "status", { unique: false });
      store.createIndex("jobKey", "jobKey", { unique: false });
      store.createIndex("createdAt", "createdAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开任务数据库"));
  });
  return databasePromise;
}

export async function putTask(task) {
  const database = await openTaskDatabase();
  task.updatedAt = new Date().toISOString();
  await requestPromise(database.transaction(TASK_STORE, "readwrite").objectStore(TASK_STORE).put(task));
  broadcast({ type: "tasks-changed", taskId: task.id });
  return task;
}

export async function getTask(taskId) {
  const database = await openTaskDatabase();
  return requestPromise(database.transaction(TASK_STORE, "readonly").objectStore(TASK_STORE).get(taskId));
}

export async function claimQueuedTask(taskId) {
  const database = await openTaskDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    const store = transaction.objectStore(TASK_STORE);
    let claimed = null;
    const request = store.get(taskId);
    request.onsuccess = () => {
      const task = request.result;
      if (!task || task.status !== TASK_STATUS.QUEUED) return;
      task.status = TASK_STATUS.RUNNING;
      task.phase = nextPhase(task);
      task.updatedAt = new Date().toISOString();
      store.put(task);
      claimed = task;
    };
    transaction.oncomplete = () => {
      if (claimed) broadcast({ type: "tasks-changed", taskId });
      resolve(claimed);
    };
    transaction.onerror = () => reject(transaction.error || new Error("无法认领队列任务"));
    transaction.onabort = () => reject(transaction.error || new Error("认领队列任务已中止"));
  });
}

export async function getAllTasks() {
  const database = await openTaskDatabase();
  const tasks = await requestPromise(database.transaction(TASK_STORE, "readonly").objectStore(TASK_STORE).getAll());
  return tasks.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function deleteTask(taskId) {
  const database = await openTaskDatabase();
  await requestPromise(database.transaction(TASK_STORE, "readwrite").objectStore(TASK_STORE).delete(taskId));
  broadcast({ type: "tasks-changed", taskId });
}

export async function clearTasks() {
  const database = await openTaskDatabase();
  await requestPromise(database.transaction(TASK_STORE, "readwrite").objectStore(TASK_STORE).clear());
  broadcast({ type: "tasks-cleared" });
}

export async function deleteTasks(taskIds) {
  if (!taskIds.length) return;
  const database = await openTaskDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(TASK_STORE, "readwrite");
    const store = transaction.objectStore(TASK_STORE);
    taskIds.forEach((taskId) => store.delete(taskId));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("批量删除任务失败"));
    transaction.onabort = () => reject(transaction.error || new Error("批量删除任务已中止"));
  });
  broadcast({ type: "tasks-changed" });
}

export async function findExactTask(jobKey, contentHash, generateResume) {
  const tasks = await getAllTasks();
  return tasks.find((task) => {
    const sameJobVersion = task.jobKey === jobKey && task.contentHash === contentHash;
    const sameOutputMode = generateResume === undefined || (task.generateResume !== false) === generateResume;
    return sameJobVersion && sameOutputMode;
  }) || null;
}

export function subscribeToTaskChanges(callback) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", callback);
  return () => channel.close();
}

function broadcast(message) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(message);
  channel.close();
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地数据库操作失败"));
  });
}

function nextPhase(task) {
  if (!task.roleProfile) return "profiling";
  if (!task.analysis) return "analyzing";
  if (!task.preparation) return "planning";
  if (task.generateResume !== false && !task.optimizedResume) return "generating-resume";
  return "completing";
}
